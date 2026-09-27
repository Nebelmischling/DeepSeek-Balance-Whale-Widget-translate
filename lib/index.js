import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dns from 'node:dns'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  preciseMoney, addMoney, sumMoney, beijingDay, dayOffset,
  observeBalance, balanceSummary, daySummary, accountingDays, reconcileBalance,
} from './accounting.mjs'

// Node's fetch (undici) may prefer IPv6: some domains (e.g. open.bigmodel.cn) have AAAA records even when local IPv6 is unavailable,
// which causes an immediate "fetch failed" error (curl automatically falls back to IPv4, so it appears to work). Prefer IPv4 globally.
try { dns.setDefaultResultOrder('ipv4first') } catch (err) {}

// Package root: lib/index.js -> package root. Keeps the bundle relocatable
// when installed as a normal DSH npm plugin (node_modules or a local link).
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// DSH home: used for the widget memory/role/audio files, since node_modules may
// be read-only or cleaned on update.
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// Whale image: package-relative first (ship DSniang1/DSniang02.png in assets/),
// legacy absolute paths as fallback.
const IMAGE_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'DSniang1.png'),
  path.join(PACKAGE_ROOT, 'assets', 'DSniang02.png'),
]
// Directory for custom character images (the first writable location is used; roles.json stores character metadata)
const ROLE_DIR_CANDIDATES = [
  path.join(DSH_HOME, 'whale-roles'),
  path.join(DSH_HOME, 'profiles', 'web', 'whale-roles'),
]
const ROLE_INDEX_NAME = 'roles.json'
const ROLE_DEFAULT_ID = 'default'
// Directory for custom audio clips (one <id>.wav per clip + audio.json index)
const AUDIO_DIR_CANDIDATES = [
  path.join(DSH_HOME, 'whale-audio'),
  path.join(DSH_HOME, 'profiles', 'web', 'whale-audio'),
]
const AUDIO_INDEX_NAME = 'audio.json'
// Built-in preset sound groups (cannot be deleted or modified), corresponding to the Ya/D series in assets
const PRESET_GROUPS = {
  duck: { id: 'duck', name: 'Little Yellow Duck', press: 'ya1', release: 'ya2', preset: true },
  fx1: { id: 'fx1', name: 'Sound Effect 1', press: 'd1', release: 'd2', preset: true },
}
// Built-in preset clips (cannot be deleted): the traditional four map to SOUND_SETS mp3 files; exp_orb / end_a map to wav files shipped with the package.
// mime must match the actual file bytes (the audio route sends Content-Type from it; mismatches cause decoding/playback issues).
const PRESET_FRAGMENTS = {
  ya1: { id: 'ya1', name: 'Little Yellow Duck · Press', preset: true, mime: 'audio/mpeg' },
  ya2: { id: 'ya2', name: 'Little Yellow Duck · Release', preset: true, mime: 'audio/mpeg' },
  d1: { id: 'd1', name: 'Sound Effect 1 · Press', preset: true, mime: 'audio/mpeg' },
  d2: { id: 'd2', name: 'Sound Effect 1 · Release', preset: true, mime: 'audio/mpeg' },
  // Built-in default task-completion sound (packaged resource; falls back to the built-in file when the user library is missing it)
  exp_orb: { id: 'exp_orb', name: 'Minecraft · Experience Orb', preset: true, mime: 'audio/wav' },
  // Task-completion sound A (packaged resource): originally a user-imported clip, now shipped as a built-in preset.
  // If the display name matches a clip in the user library, the front-end dropdown deduplicates by display name (only one same-named entry appears).
  end_a: { id: 'end_a', name: 'A', preset: true, mime: 'audio/wav' },
}
// Audio files for built-in clips: prefer package assets; fall back to the skin directory in development
const BUILTIN_FRAGMENT_FILES = {
  exp_orb: [
    path.join(PACKAGE_ROOT, 'assets', 'minecraft-exp-orb.wav'),
  ],
  // Task-completion sound A: shipped as assets/task-end-a.wav (1.81s / 48kHz / stereo / 16-bit PCM)
  end_a: [
    path.join(PACKAGE_ROOT, 'assets', 'task-end-a.wav'),
  ],
}
// —— Custom API models (v655): balance / usage / notifications for non-DeepSeek providers ——
// Registry is stored at $DSH_HOME/.dshw-api.json; keys use official DSH credentials (ctx.credentials), and this file stores no plaintext secrets.
const API_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-api.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-api.json'),
]
const API_BUILTIN_ID = 'deepseek'
// "Top-up / Balance Reconciliation" applies only to the fixed built-in DeepSeek model: model entries expose canAdjustBalance and the route layer validates it again.
// Newly added provider templates / manually added models with the same name / Kimi and other providers never inherit this capability.
function canAdjustBuiltinBalance(model) {
  return !!(model && model.id === API_BUILTIN_ID && model.builtin === true && model.provider === 'deepseek')
}
// Built-in provider templates: balance describes how to fetch the balance. JSON paths support a.b[0].c; scale is applied as a multiplier after extraction.
// Balance endpoints have been checked against official docs / community references (DeepSeek, OpenRouter, Kimi, StepFun, Novita, OpenAI-compatible relays);
// SiliconFlow's balance endpoint was officially retired (410), so it now uses "no balance API + /v1/models connectivity probe";
// Volcengine Ark is similar (balance/usage uses AK/SK-signed Volcengine OpenAPI). Other providers may use custom with manually entered URL and field paths.
// Sort key for the provider-template dropdown (v726): use English names directly; for Chinese names, use the first character's pinyin so English and Chinese entries are interleaved A→Z.
// Why not localeCompare: ICU normally sorts Han characters after Latin letters, which would push all Chinese providers to the bottom as one block.
// When adding a Chinese provider, add an entry below (key = first character of the provider name).
const TPL_PINYIN_INITIAL = { '\u963f': 'a', '\u767e': 'bai', '\u672c': 'ben', '\u7845': 'gui', '\u706b': 'huo', '\u9636': 'jie', '\u9b54': 'mo', '\u817e': 'teng', '\u8baf': 'xun', '\u667a': 'zhi', '\u81ea': 'zi' }
function tplSortKey(name) {
  const s = String(name || '').trim()
  if (!s) return ''
  const py = TPL_PINYIN_INITIAL[s.slice(0, 1)]
  return py || s.toLowerCase()
}
const API_TEMPLATES = {
  deepseek: {
    name: 'DeepSeek', currency: 'CNY', keyRef: 'DEEPSEEK_API_KEY', builtin: true,
    balance: { url: 'https://api.deepseek.com/user/balance', auth: 'Bearer {key}', json: { remaining: 'balance_infos[0].total_balance' } },
  },
  openrouter: {
    name: 'OpenRouter', currency: 'USD', keyRef: 'OPENROUTER_API_KEY',
    balance: { url: 'https://openrouter.ai/api/v1/credits', auth: 'Bearer {key}', json: { total: 'data.total_credits', used: 'data.total_usage' } },
  },
  siliconflow_cn: {
    name: 'SiliconFlow (CN)', currency: 'CNY', keyRef: 'SILICONFLOW_API_KEY', noBalanceApi: true,
    // ⚠️ The balance endpoint was officially retired (not a "temporary outage") — 2026-08-11 update notice: “Service Adjustment: /user/info Will Be Discontinued”:
    //   /user/info can no longer support the platform's user-account system; the API was scheduled to stop service on 2026-08-14 and become unavailable.
    //   The notice also said an account-level replacement API would be provided later and announced on the same page once available.
    //   As of 2026-09-14, the newest announcement (2026.09.09) still listed no replacement API; the CN docs' “Platform” section only retains “Retrieve User Model List”.
    //   v724 route test: unknown paths under /v1 return 404 while /v1/user/info still returns 401 at the auth layer → the route still exists, but is unusable per the announcement.
    //   → If the provider restores the API or launches a replacement later, fill the url and json field paths back in (the template only supplies defaults; users may override them).
    apiNote: 'The official /user/info balance API was retired (service stopped on 2026-08-14; a replacement was announced but is not yet available) → balance shows “—”, today usage is estimated from session events; “Test Connectivity” validates the key using /v1/models',
    matchIds: ['siliconflow', 'Qwen', 'deepseek-ai'],
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
    probeUrl: 'https://api.siliconflow.cn/v1/models',
  },
  siliconflow_en: {
    name: 'SiliconFlow (EN)', currency: 'USD', keyRef: 'SILICONFLOW_API_KEY', noBalanceApi: true,
    // Same as the CN site: the balance API has stopped service. Note that docs.siliconflow.com still contains a Retrieve user info page
    // (the docs have not been updated); that page is not evidence the endpoint still works — use the official CN announcement as the source of truth.
    apiNote: 'Same as the CN site: the /user/info balance API has stopped service (international docs are not yet updated) → balance “—”, today usage is estimated from session events',
    matchIds: ['siliconflow', 'Qwen', 'deepseek-ai'],
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
    probeUrl: 'https://api.siliconflow.com/v1/models',
  },
  moonshot: {
    // Mainland site: api.moonshot.cn; balance is denominated in CNY (top-up + voucher total). v724 tested: 200 and field matched ✓
    name: 'Kimi / Moonshot (CN)', currency: 'CNY', keyRef: 'MOONSHOT_API_KEY', matchIds: ['moonshot', 'kimi'],
    balance: { url: 'https://api.moonshot.cn/v1/users/me/balance', auth: 'Bearer {key}', json: { remaining: 'data.available_balance' } },
    probeUrl: 'https://api.moonshot.cn/v1/models',
  },
  moonshot_intl: {
    // International site uses a separate account system (keys are not interchangeable); balance is denominated in USD
    name: 'Kimi / Moonshot (International)', currency: 'USD', keyRef: 'MOONSHOT_INTL_API_KEY',
    balance: { url: 'https://api.moonshot.ai/v1/users/me/balance', auth: 'Bearer {key}', json: { remaining: 'data.available_balance' } },
    probeUrl: 'https://api.moonshot.ai/v1/models',
  },
  stepfun: {
    name: 'StepFun', currency: 'CNY', keyRef: 'STEPFUN_API_KEY', matchIds: ['stepfun', 'step-'],
    balance: { url: 'https://api.stepfun.com/v1/accounts', auth: 'Bearer {key}', json: { remaining: 'balance' } },
  },
  novita: {
    name: 'Novita AI', currency: 'USD', keyRef: 'NOVITA_API_KEY', matchIds: ['novita'],
    balance: { url: 'https://api.novita.ai/v3/user/balance', auth: 'Bearer {key}', json: { remaining: 'availableBalance', scale: 0.0001 } },
  },
  volcengine_ark: {
    name: 'Volcengine Ark', currency: 'CNY', keyRef: 'ARK_API_KEY', noBalanceApi: true,
    // Ark has no endpoint for "query balance with an API key" (balance/usage belongs to AK/SK-signed Volcengine OpenAPI).
    // v724 tested: /api/v3/models → 200 (usable as a probe); /api/v3/balance → 404 (confirmed: no balance endpoint).
    apiNote: 'Balance/usage requires AK/SK-signed Volcengine OpenAPI (or the console) → balance “—”, today usage is estimated from session events; /api/v3/models is used as the connectivity probe (tested working)',
    matchIds: ['doubao', 'ep-'],
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
    probeUrl: 'https://ark.cn-beijing.volces.com/api/v3/models',
  },
  // —— Subscription quota (Coding Plan) templates: kind='quota' means "window usage % + reset time", not money ——
  // Note: these endpoints work only for subscription-plan accounts. Accounts using token packs (resource packs) cannot query this quota
  // (Zhipu returns "current user does not have a coding plan"); in that case use
  // "Quota (Subscription / Resource Pack)" in the model menu, which tracks session tokens automatically.
  zhipu_glm_coding: {
    name: 'Zhipu GLM Coding Plan (Subscription)', currency: 'CNY', keyRef: 'ZHIPU_API_KEY', kind: 'quota',
    quota: {
      url: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
      auth: '{key}', // Zhipu does not use Bearer for this endpoint
      json: { percent: 'data.limits[0].TOKENS_LIMIT.percentage', resetAt: 'data.limits[0].nextResetTime', level: 'data.level' },
    },
    probeUrl: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  },
  kimi_coding: {
    name: 'Kimi Coding (Subscription)', currency: 'CNY', keyRef: 'KIMI_CODING_KEY', kind: 'quota',
    quota: {
      url: 'https://api.kimi.com/coding/v1/usages',
      auth: 'Bearer {key}',
      json: { remain: 'usage.remaining', total: 'usage.limit', resetAt: 'usage.resetTime' },
    },
    probeUrl: 'https://api.kimi.com/coding/v1/usages',
  },
  minimax_coding: {
    name: 'MiniMax Coding (Subscription)', currency: 'CNY', keyRef: 'MINIMAX_API_KEY', kind: 'quota',
    quota: {
      url: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
      auth: 'Bearer {key}',
      json: {
        remainPct: 'model_remains[0].current_interval_remaining_percent',
        weeklyRemainPct: 'model_remains[0].current_weekly_remaining_percent',
        resetAtMs: 'model_remains[0].end_time',
      },
    },
    probeUrl: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
  },
  // OpenCode Go (Subscription): returns three windows — rolling / weekly / monthly — in one response, each containing "used % + reset time"
  // (usage.rolling|weekly|monthly.{percent,resetsAt}). Uses the multi-window json.windows path; see fetchModelQuota.
  // Authentication only requires Authorization: Bearer <key> (tested 2026-09: x-api-key alone returns 401; no extra headers required).
  opencode_go: {
    name: 'OpenCode Go (Subscription)', currency: 'USD', keyRef: 'OPENCODE_GO_API_KEY', kind: 'quota',
    quota: {
      url: 'https://opencode.ai/zen/go/v1/usage',
      auth: 'Bearer {key}',
      json: {
        windows: [
          { key: 'rolling', label: '5h', percent: 'usage.rolling.percent', resetAt: 'usage.rolling.resetsAt' },
          { key: 'weekly', label: 'Week', percent: 'usage.weekly.percent', resetAt: 'usage.weekly.resetsAt' },
          { key: 'monthly', label: 'Month', percent: 'usage.monthly.percent', resetAt: 'usage.monthly.resetsAt' },
        ],
      },
    },
    probeUrl: 'https://opencode.ai/zen/go/v1/usage',
  },
  openai_compat: {
    name: 'OpenAI-Compatible Relay', currency: 'USD', keyRef: 'CUSTOM_API_KEY', needsBaseUrl: true,
    // Classic billing endpoints used by OneAPI / New API-style gateways: quota (USD) + usage (cents)
    balance: {
      url: '{base}/v1/dashboard/billing/subscription', auth: 'Bearer {key}', json: { total: 'hard_limit_usd' },
      usage: { url: '{base}/v1/dashboard/billing/usage', auth: 'Bearer {key}', json: { used: 'total_usage', scale: 0.01 } },
    },
  },
  custom: {
    name: 'Custom HTTP', currency: 'CNY', keyRef: 'CUSTOM_API_KEY',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  // —— Codex mode (phase 1: local session statistics) ——
  // No balance query, network access, or credentials: read rollout-*.jsonl under ~/.codex/sessions directly and count tokens.
  // Benefit: covers Codex usage that does not run inside DSH; drawback: tokens only, no monetary amount (cost is handled separately by balance/quota accounting).
  codex: {
    name: 'Codex (Local Sessions)', currency: 'CNY', keyRef: '', kind: 'codex',
    balance: { url: '', auth: '', json: { remaining: '' } },
  },
  // ================= v724: common providers that officially have no balance-by-API-key endpoint =================
  // Purpose: ① auto-fill credential name / currency / event matching (matchIds) / probe URL after selection ② “Test Connectivity” can validate the key
  // ③ balance shows “—”, and today's usage is estimated from local session events (noBalanceApi + apiNote are shown as hints in the panel).
  // Note: probeUrl always uses each provider's OpenAI-compatible /v1/models form (as documented officially; success depends on key permissions).
  openai: {
    name: 'OpenAI', currency: 'USD', keyRef: 'OPENAI_API_KEY', noBalanceApi: true,
    apiNote: 'The official billing balance API was retired; there is no public “query balance with API key” endpoint (console only) → balance “—”, today usage is estimated from session events',
    matchIds: ['gpt', 'o1-', 'o3-', 'o4-', 'chatgpt'],
    probeUrl: 'https://api.openai.com/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  anthropic: {
    name: 'Anthropic Claude', currency: 'USD', keyRef: 'ANTHROPIC_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API; usage requires the Admin API (admin key required) or console. Its probe requires both x-api-key and anthropic-version headers, which this widget does not currently support → no connectivity probe is provided',
    matchIds: ['claude'],
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  gemini: {
    name: 'Google Gemini', currency: 'USD', keyRef: 'GEMINI_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API (quota is available only in AI Studio / Cloud Console) → balance “—”, today usage is estimated from session events; connectivity probe uses the ?key= form',
    matchIds: ['gemini'],
    probeUrl: 'https://generativelanguage.googleapis.com/v1beta/models?key={key}',
    balance: { url: '', auth: '', json: { remaining: '' } },
  },
  xai: {
    name: 'xAI Grok', currency: 'USD', keyRef: 'XAI_API_KEY', noBalanceApi: true,
    apiNote: 'No public official balance-query endpoint (credit is shown in console.x.ai) → balance “—”, today usage is estimated from session events',
    matchIds: ['grok'],
    probeUrl: 'https://api.x.ai/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  groq: {
    name: 'Groq', currency: 'USD', keyRef: 'GROQ_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API (free-tier limits/rates are shown in the console) → balance “—”, today usage is estimated from session events',
    matchIds: ['llama', 'mixtral', 'qwen', 'deepseek', 'gemma', 'whisper'],
    probeUrl: 'https://api.groq.com/openai/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  mistral: {
    name: 'Mistral AI', currency: 'USD', keyRef: 'MISTRAL_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API → balance “—”, today usage is estimated from session events',
    matchIds: ['mistral', 'codestral', 'magistral', 'pixtral', 'ministral'],
    probeUrl: 'https://api.mistral.ai/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  together: {
    name: 'Together AI', currency: 'USD', keyRef: 'TOGETHER_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API → balance “—”, today usage is estimated from session events',
    matchIds: ['meta-llama', 'Qwen', 'deepseek', 'mistralai', 'nvidia'],
    probeUrl: 'https://api.together.xyz/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  fireworks: {
    name: 'Fireworks AI', currency: 'USD', keyRef: 'FIREWORKS_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API → balance “—”, today usage is estimated from session events',
    matchIds: ['accounts/fireworks', 'llama-v3', 'qwen'],
    probeUrl: 'https://api.fireworks.ai/inference/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  deepinfra: {
    name: 'DeepInfra', currency: 'USD', keyRef: 'DEEPINFRA_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API → balance “—”, today usage is estimated from session events',
    matchIds: ['meta-llama', 'Qwen', 'deepseek'],
    probeUrl: 'https://api.deepinfra.com/v1/openai/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  cerebras: {
    name: 'Cerebras', currency: 'USD', keyRef: 'CEREBRAS_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API → balance “—”, today usage is estimated from session events',
    matchIds: ['llama', 'qwen'],
    probeUrl: 'https://api.cerebras.ai/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  dashscope: {
    name: 'Alibaba Cloud Model Studio (Qwen)', currency: 'CNY', keyRef: 'DASHSCOPE_API_KEY', noBalanceApi: true,
    apiNote: 'Cloud provider: balance/billing requires Alibaba Cloud AK/SK OpenAPI (or console); it cannot be queried with an API key → balance “—”, today usage is estimated from session events',
    matchIds: ['qwen', 'qwq', 'qvq'],
    probeUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  qianfan: {
    name: 'Baidu Qianfan (ERNIE)', currency: 'CNY', keyRef: 'QIANFAN_API_KEY', noBalanceApi: true,
    apiNote: 'Cloud provider: balance/billing requires Baidu Cloud AK/SK (or console); it cannot be queried with an API key → balance “—”, today usage is estimated from session events',
    matchIds: ['ernie'],
    probeUrl: 'https://qianfan.baidubce.com/v2/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  hunyuan: {
    name: 'Tencent Hunyuan', currency: 'CNY', keyRef: 'HUNYUAN_API_KEY', noBalanceApi: true,
    apiNote: 'Cloud provider: balance/billing requires Tencent Cloud SecretId/Key (or console); it cannot be queried with an API key → balance “—”, today usage is estimated from session events',
    matchIds: ['hunyuan'],
    probeUrl: 'https://api.hunyuan.cloud.tencent.com/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  spark: {
    name: 'iFlytek Spark', currency: 'CNY', keyRef: 'SPARK_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API (quota is shown in the console) → balance “—”, today usage is estimated from session events',
    matchIds: ['spark', 'generalv', '4.0ultra'],
    probeUrl: 'https://spark-api-open.xf-yun.com/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  modelscope: {
    name: 'ModelScope', currency: 'CNY', keyRef: 'MODELSCOPE_API_KEY', noBalanceApi: true,
    apiNote: 'No official balance API → balance “—”, today usage is estimated from session events',
    matchIds: ['Qwen', 'deepseek', 'MiniMax', 'glm'],
    probeUrl: 'https://api-inference.modelscope.cn/v1/models',
    balance: { url: '', auth: 'Bearer {key}', json: { remaining: '' } },
  },
  ollama: {
    name: 'Local Models (Ollama / LM Studio)', currency: 'CNY', keyRef: '', noBalanceApi: true, needsBaseUrl: true,
    apiNote: 'Local inference has no balance concept → balance “—”; after configuring a Base URL (e.g. http://127.0.0.1:11434/v1), tokens are counted from session events',
    matchIds: ['llama', 'qwen', 'gemma', 'deepseek', 'mistral', 'phi'],
    probeUrl: '{base}/v1/models',
    balance: { url: '', auth: '', json: { remaining: '' } },
  },
  zhipu_glm_coding_intl: {
    name: 'Zhipu GLM Coding Plan (International z.ai)', currency: 'USD', keyRef: 'ZHIPU_INTL_API_KEY', kind: 'quota',
    quota: {
      url: 'https://api.z.ai/api/monitor/usage/quota/limit',
      auth: '{key}', // Like the mainland endpoint, this does not use Bearer
      json: { percent: 'data.limits[0].TOKENS_LIMIT.percentage', resetAt: 'data.limits[0].nextResetTime', level: 'data.level' },
    },
    probeUrl: 'https://api.z.ai/api/monitor/usage/quota/limit',
  },
  minimax_coding_intl: {
    name: 'MiniMax Coding (International)', currency: 'USD', keyRef: 'MINIMAX_INTL_API_KEY', kind: 'quota',
    quota: {
      url: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
      auth: 'Bearer {key}',
      json: {
        remainPct: 'model_remains[0].current_interval_remaining_percent',
        weeklyRemainPct: 'model_remains[0].current_weekly_remaining_percent',
        resetAtMs: 'model_remains[0].end_time',
      },
    },
    probeUrl: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
  },
}

// Size memory file: prefer writable DSH home locations, then legacy fallbacks.
const SIZE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-size.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-size.json'),
]
// Usage ledger file (Little Whale Accounting mode): same policy as the size file.
const USAGE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-usage.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-usage.json'),
]
// Persistent per-turn-cost seq file: prevents seq from resetting after plugin hot reload and the page from misclassifying a new turn as an old one and dropping it
const TURN_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-turn.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-turn.json'),
]
// Sound assets: package-relative first (ship Ya1/Ya2/D1/D2.mp3 in assets/),
// legacy absolute paths as fallback.
const BUBBLE_FILE_CANDIDATES = [
  // v728: release builds remove development-machine paths (§9.4), so a $DSH_HOME fallback is required here ——
  // otherwise this array would become empty after cleanup: bubble configuration could neither be read nor saved (custom bubbles would fail entirely).
  path.join(DSH_HOME, '.dshw-bubble.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-bubble.json'),
]
// Bubble image library (separate from the character library): image-file directory + index
const BUBBLE_IMG_DIR_CANDIDATES = [
  // v728: likewise, a $DSH_HOME fallback is required — pickBubbleImgDir() uses [0] even after traversal fails,
  // so an empty array would make image-library uploads fail immediately.
  path.join(DSH_HOME, 'whale-bubble-imgs'),
  path.join(DSH_HOME, 'profiles', 'web', 'whale-bubble-imgs'),
]
const BUBBLE_IMG_INDEX_NAME = 'bubble-imgs.json'
// Built-in default bubble images (semantic ID → asset file): always selectable in the panel; on a fresh install with no user image library,
// bubble-img.png falls back to the built-in list. Files are available both in package assets/ and the development fallback directory.
const DEFAULT_BUBBLE_IMGS = [
  { id: 'bimg_petpet', name: 'petpet', file: 'bubble-petpet.gif', format: 'gif' },
  { id: 'bimg_money1', name: 'money1', file: 'bubble-money1.gif', format: 'gif' },
]
function bubbleImgFileCandidates(file) {
  return [
    path.join(PACKAGE_ROOT, 'assets', file),
  ]
}
function loadBuiltinBubbleImgBytes(def) {
  if (!def || !def.file) return null
  for (const p of bubbleImgFileCandidates(def.file)) {
    try {
      const bytes = fs.readFileSync(p)
      if (bytes && bytes.length > 0) return bytes
    } catch (err) {}
  }
  return null
}
const SOUND_SETS = {
  duck: { press: [path.join(PACKAGE_ROOT, 'assets', 'Ya1.mp3')], release: [path.join(PACKAGE_ROOT, 'assets', 'Ya2.mp3')] },
  fx1: { press: [path.join(PACKAGE_ROOT, 'assets', 'D1.mp3')], release: [path.join(PACKAGE_ROOT, 'assets', 'D2.mp3')] },
}
function soundSetFromUrl(url) {
  try {
    const q = String(url || '').split('?')[1] || ''
    const m = /(?:^|&)set=([^&]+)/.exec(q)
    return m ? decodeURIComponent(m[1]) : ''
  } catch (err) { return '' }
}
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000
const RUA_GIF_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'rua.gif'),
]
// DeepSeek CNY prices per million tokens: [off-peak price, peak price].
// Peak hours (official 2026-09-19 note; see docs footnote (2)): **Monday through Friday Beijing Time (excluding Chinese statutory holidays),
// 09:00–12:00 and 14:00–18:00**; all other periods — including **weekends, make-up work weekends, and all-day Chinese statutory holidays** —
// are always billed at the off-peak rate.
//   Timeline: peak/off-peak pricing launched 2026-08-17 → weekends became off-peak all day starting 2026-08-23 00:00 →
//             on 2026-09-19 it was clarified that “make-up work weekends + statutory holidays all day” also use off-peak pricing.
// Pricing source: official https://api-docs.deepseek.com/zh-cn/quick_start/pricing
// Starting 2026-09-10, Flash-series prices decreased: cache hit 0.05→0.02, cache miss 1.5→1, output 4.5→4 (peak = off-peak ×2).
// 2026-09-19 verification: numeric prices match the table above (Flash 0.02/1/4 and 0.04/2/8; Pro 0.15/4.5/13.5 and 0.30/9/27),
//           and the peak/off-peak rules added “statutory holidays are off-peak all day”; see HOLIDAY_VALLEY below.
const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]
// Flash (official model name deepseek-flash = DeepSeek-V4.1-Flash)
const BASE_PRICE = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] }
// Pro is priced at 3× Flash (effective officially on 2026-08-17). An official 2026-09-14 announcement states that V4 Pro continues to provide API service
// with unchanged billing — the earlier plan to route Pro requests to V4.1 Flash from 9/14 12:00 and charge Flash prices was canceled,
// so no date-based downgrade switch is implemented here.
const PRO_PRICE = { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] }
const PRICING = {
  'deepseek-flash': BASE_PRICE,
  'deepseek-v4-flash-vision-exp': BASE_PRICE, // Legacy name retired; requests are served by V4.1-Flash and billed at the Flash rate
  'deepseek-v4-flash': BASE_PRICE, // Same as above
  'deepseek-v4-pro': PRO_PRICE,
  _default: BASE_PRICE,
}
// User-defined unit prices ("CNY / million tokens" entered in the custom API model panel), matched by matchIds substring and taking precedence over the built-in price table
let CUSTOM_PRICES = {}
// Currency/exchange rate for custom unit prices (same keys as CUSTOM_PRICES): when a price is entered in USD, accounting converts it to CNY using the user-provided exchange rate
let CUSTOM_PRICE_META = {}
function customPriceMetaFor(model) {
  const m = String(model || '').toLowerCase()
  // Sort keys by descending length: longest match wins, preventing short keywords (e.g. pro) from matching unrelated models
  for (const key of Object.keys(CUSTOM_PRICE_META).sort((a, b) => b.length - a.length)) {
    if (key && m.indexOf(key) !== -1) return CUSTOM_PRICE_META[key]
  }
  return null
}
function priceFor(model) {
  const m = String(model || '').toLowerCase()
  // Custom prices use the same descending-key-length matching (kept consistent with customPriceMetaFor)
  for (const key of Object.keys(CUSTOM_PRICES).sort((a, b) => b.length - a.length)) {
    if (key && m.indexOf(key) !== -1) return CUSTOM_PRICES[key]
  }
  for (const key of Object.keys(PRICING)) {
    if (key === '_default') continue
    if (m.indexOf(key) !== -1) return PRICING[key]
  }
  return PRICING._default
}
// bucket time is an epoch second; derive the Beijing local hour to pick peak vs off-peak price.
// Since 2026-08-23 (Beijing Time), weekends (Saturday/Sunday) are off-peak all day; historical buckets before the effective timestamp
// still use the old rules, so weekend detection includes an activation boundary.
const WEEKEND_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 7, 22, 16, 0, 0) / 1000) // = Beijing Time 2026-08-23 00:00
// ===== Statutory holidays are off-peak all day (official clarification 2026-09-19) =====
// Basis: “Notice of the General Office of the State Council on Arrangements for Certain Holidays in 2026” (State Council General Office Telegraph [2025] No. 7, 2025-11-04)
//        + the official DeepSeek API pricing footnote: “Monday through Friday (excluding Chinese statutory holidays)… all other periods, including weekends
//        and all-day Chinese statutory holidays, are off-peak periods.”
// Only **holiday** dates need to be listed: all make-up work days fall on weekends (in 2026: 1/4, 2/14, 2/28, 5/9, 9/20, 10/10),
// and the “weekends are off-peak” rule already makes them off-peak, so they do not need separate entries.
// ⚠️ **After the State Council publishes the next year's schedule each November, the dates for the new year must be added here** (probe `_peak-holiday-check.mjs`
// checks whether the current year is covered and emits a reminder).
const HOLIDAY_VALLEY = {
  '2026-01-01': 1, '2026-01-02': 1, '2026-01-03': 1, // New Year's Day 1/1–1/3 (1/4 Sunday is a workday)
  '2026-02-15': 1, '2026-02-16': 1, '2026-02-17': 1, '2026-02-18': 1, '2026-02-19': 1, // Spring Festival 2/15–2/23 (9 days)
  '2026-02-20': 1, '2026-02-21': 1, '2026-02-22': 1, '2026-02-23': 1,
  '2026-04-04': 1, '2026-04-05': 1, '2026-04-06': 1, // Qingming Festival 4/4–4/6
  '2026-05-01': 1, '2026-05-02': 1, '2026-05-03': 1, '2026-05-04': 1, '2026-05-05': 1, // Labor Day 5/1–5/5 (5/9 Saturday is a workday)
  '2026-06-19': 1, '2026-06-20': 1, '2026-06-21': 1, // Dragon Boat Festival 6/19–6/21
  '2026-09-25': 1, '2026-09-26': 1, '2026-09-27': 1, // Mid-Autumn Festival 9/25–9/27
  '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1, // National Day 10/1–10/7 (9/20 Sunday and 10/10 Saturday are workdays)
  '2026-10-05': 1, '2026-10-06': 1, '2026-10-07': 1,
}
// This rule took effect on 2026-09-19 (historical buckets before that use the old rules). In 2026, there are no statutory holidays falling on weekdays
// between 8/17 (when peak/off-peak pricing started) and 9/19, so this does not affect 2026 accounting; from 2027 onward,
// the full year's statutory holidays will pass through this branch.
const HOLIDAY_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 8, 18, 16, 0, 0) / 1000) // = Beijing Time 2026-09-19 00:00
// Holiday list sent to the front end (widget): the “period countdown” must also account for holidays when finding the next transition,
// and the front end cannot know the statutory calendar by itself, so the host is the single source of truth. Included in every /dsh-whale/balance response.
const HOLIDAY_VALLEY_LIST = Object.keys(HOLIDAY_VALLEY).sort()
function isHolidayValley(bjDate) {
  try {
    return !!HOLIDAY_VALLEY[bjDate.toISOString().slice(0, 10)]
  } catch (err) { return false }
}
function isPeakTime(timeSec) {
  if (!isFinite(Number(timeSec))) return false
  const n = Number(timeSec)
  const bj = new Date(n * 1000 + 8 * 3600 * 1000)
  if (n >= WEEKEND_VALLEY_FROM_SEC) {
    const dow = bj.getUTCDay() // 0=Sunday 6=Saturday (reading bj in UTC yields the Beijing calendar day)
    if (dow === 0 || dow === 6) return false
  }
  // Statutory holidays are off-peak all day (including weekday holidays created by schedule adjustments)
  if (n >= HOLIDAY_VALLEY_FROM_SEC && isHolidayValley(bj)) return false
  const hour = bj.getUTCHours()
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true
  }
  return false
}
// Next peak/off-peak transition time (epoch seconds): derived from exactly the same rules as isPeakTime (including weekends + statutory holidays).
// We only need to scan Beijing-time hour boundaries at 0/9/12/14/18; the longest holiday (Spring Festival, 9 days) ends by day 9,
// so scanning 12 days leaves ample margin. null means no transition exists within 12 days (not possible under current rules),
// in which case the front end falls back to its own local calculation.
function nextPeakChangeAt(timeSec) {
  const n = Number(timeSec)
  if (!isFinite(n)) return null
  const cur = isPeakTime(n)
  const day0 = Math.floor((n + 8 * 3600) / 86400) * 86400 // Beijing local day 00:00 (in the +8h shifted coordinate system)
  for (let d = 0; d <= 12; d++) {
    for (const edge of [0, 9, 12, 14, 18]) {
      const cand = day0 + d * 86400 + edge * 3600 - 8 * 3600
      if (cand <= n + 1) continue
      if (isPeakTime(cand) !== cur) return cand
    }
  }
  return null
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

// The browser-side widget code has been split into a separate whale-widget.js file (in the same directory as this file),
// instead of being embedded as a template literal: it can be checked directly with node --check / syntax-highlighted by the IDE, and widget changes apply after a hard refresh (no DSH restart needed).
// Each request checks mtime to decide whether the file needs to be reread, avoiding stale resident-cache behavior after edits.
const WIDGET_FILE_CANDIDATES = [
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'whale-widget.js'),
  path.join(PACKAGE_ROOT, 'whale-widget.js'),
  path.join(PACKAGE_ROOT, 'assets', 'whale-widget.js'),
]
let widgetJsCache = null // { text, mtimeMs }
function loadWidgetJs() {
  for (const p of WIDGET_FILE_CANDIDATES) {
    try {
      const st = fs.statSync(p)
      if (widgetJsCache && widgetJsCache.mtimeMs === st.mtimeMs) return widgetJsCache.text
      const text = fs.readFileSync(p, 'utf8')
      widgetJsCache = { text, mtimeMs: st.mtimeMs }
      return text
    } catch (err) {}
  }
  return widgetJsCache ? widgetJsCache.text : ''
}

// —— Desktop (Electron) structured injection row: **inline script row**, not script-src row (issue #154) ——
// The desktop shell serves index.html directly from the installed static dist, so `tapIndex` (function transform) can never reach it; the only path is
// the structured row pushed through `webserver/index-inject`, passed to the page-side interpreter via IPC and applied line by line.
// But the interpreter handles the two script row types **asymmetrically** (desktop front-end `web-boot`):
//   case "script":     createElement + textContent + append   —— no await, **cannot “fail to load”**
//   case "script-src": await loadScript(src)                   —— failure rejects, and that rejection then
//                                                                rejects __DSH_BOOT_READY__ ⇒ **the app cannot start**
// One more layer: the shell collects this table **once when the host starts** and caches it, with **no refresh path** ⇒ if the plugin is disabled at runtime,
// this row remains in the table while `/dsh-whale/*` routes are already unregistered ⇒ loading returns 404 ⇒ exactly the fatal issue #154 error:
// "desktop web: failed to load /dsh-whale/widget.js".
// Therefore use an inline row: **we create** `<script src=…>` ourselves and **swallow** onerror — when the route exists it loads normally,
// and when it does not, failure is silent, so the host can never fail to start because of us.
const DESKTOP_WIDGET_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="/dsh-whale/widget.js";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

export default {
  name: 'whale-balance-widget',
  // v758: **intentionally removed object-level `inject: ['webServer','credentials','connection']`** (risk surface from issue #154).
  // Object-level inject delays the entire apply() until all three services are ready; but the desktop injection table is collected **once at host startup**
  // (`dsh-desktop-host`: `collectIndexInjections()` → IPC → renderer). If subscription happens after that collection,
  // this row never enters the table = the desktop widget never appears (the race that reporter #152/#153 could not reproduce consistently).
  // Now apply() runs immediately and the **very first action is registering the injection row** (it depends on no services); all remaining logic stays in
  // `root.inject([...], cb)` for local waiting — semantically equivalent to the previous object-level inject, but row registration is no longer delayed.
  apply(root) {
    const rowDisposers = []
    root.effect(() => () => { for (const d of rowDisposers) { try { d() } catch (err) {} } })
    // ① Structured injection row: the only channel that works for desktop (web mode also has tapIndex; both coexist and deduplicate independently)
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && row.src === '/dsh-whale/widget.js') return // Older version already pushed it → do not duplicate
          if (row.kind === 'script' && typeof row.text === 'string'
            && row.text.indexOf('/dsh-whale/widget.js') >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: DESKTOP_WIDGET_ROW_TEXT })
      } catch (err) {}
    }))

    // ② Remaining logic: wait for all three services before running (equivalent to the old object-level inject, but no longer blocks ①)
    root.inject(['webServer', 'credentials', 'connection'], (ctx) => {
    // —— Browser trust fence (introduced in issue #92, made fail-closed in issue #136) ——
    // DSH's connection service provides requestRejection(req): requests with forged Host/Origin (DNS rebinding) or without authentication
    // must be rejected. **However, this method does not exist on older DSH versions** (#136 tested: present in 0.1.5-rc.2/rc.3, absent in 0.1.0-rc.3),
    // and the old implementation failed open (allowed) both when the service was missing and when the fence itself threw — so all 22 /dsh-whale/*
    // routes would **collectively** lose validation: forged Host could read/write, ordinary cross-site POST could write config directly, and api-models.json is connected to
    // ctx.credentials (which can set/delete keys). This is now three layers:
    //   ① **Plugin's own lightweight validation** (always runs first; normal browsers and local scripts are unaffected):
    //      Host must be a loopback authority or explicitly listed in DSHW_TRUSTED_HOSTS; `Sec-Fetch-Site: cross-site` is always rejected,
    //      and when Origin is present it must be same-origin with Host;
    //   ② If the host fence is available → **delegate** to it (do not rewrite its semantics: it also contains browser-auth 401 handling); use its status code directly;
    //      **if it throws, treat as rejection** (the old implementation silently allowed this path without even a warning);
    //   ③ If the host fence is unavailable → rely on ① only, and emit a prominent warning **when the plugin loads** (not only on the first request).
    const TRUSTED_AUTHORITIES = String(process.env.DSHW_TRUSTED_HOSTS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    // Recognize loopback only: localhost / *.localhost / 127.0.0.0/8 (validate labels to block lookalikes such as `127.0.0.1.evil.com`) / ::1
    function isLoopbackHostname(hn) {
      const h = String(hn || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
      if (!h) return false
      if (h === 'localhost' || h.endsWith('.localhost')) return true
      if (h === '::1') return true
      const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
      if (!m) return false
      if (Number(m[1]) !== 127) return false
      return [m[2], m[3], m[4]].every((x) => Number(x) <= 255)
    }
    // Return null when accepted; otherwise return the HTTP status code to reject with.
    // opts.fenceAvailable: when the host fence is currently available, **non-loopback Host is delegated to it** — it knows which authorities DSH
    // itself allowed via `--trusted-host`; we fall back to DSHW_TRUSTED_HOSTS only when there truly is no fence.
    // (0.3.11 ran self-validation before delegation, causing authorities already trusted by the host to be rejected with 403 by the plugin; see issue #136 follow-up A/B.)
    function selfRejection(req, opts) {
      try {
        const headers = (req && req.headers) || {}
        let hostUrl = null
        try { hostUrl = new URL('http://' + String(headers.host || '')) } catch (err) { return 403 } // Missing Host / malformed → reject
        const hostname = hostUrl.hostname
        const authority = hostUrl.host
        if (!isLoopbackHostname(hostname)) {
          const listed = TRUSTED_AUTHORITIES.some((e) => (e.indexOf(':') >= 0 ? e === authority.toLowerCase() : e === hostname.toLowerCase()))
          const fenceAvailable = !!(opts && opts.fenceAvailable)
          if (!listed && !fenceAvailable) return 403
        }
        // The next two checks are independent of the trust list and always run: cross-site marker, and Origin not same-origin with Host.
        const site = String(headers['sec-fetch-site'] || '').toLowerCase()
        if (site === 'cross-site') return 403
        const origin = headers.origin
        if (typeof origin === 'string' && origin && origin !== 'null') {
          let originUrl = null
          try { originUrl = new URL(origin) } catch (err) { return 403 }
          if (originUrl.host.toLowerCase() !== authority.toLowerCase()) return 403
        }
        return null
      } catch (err) { return 403 } // Validator itself failed → reject (fail-closed)
    }
    function connectionFence() {
      try {
        const conn = ctx.get('connection') || ctx.connection
        return conn && typeof conn.requestRejection === 'function' ? conn : null
      } catch (err) { return null }
    }
    if (!connectionFence()) {
      try {
        console.warn('[whale-balance] Host trust fence unavailable (connection.requestRejection missing): plugin loopback/same-origin validation is enabled; ' 
          + 'all routes (including write endpoints) remain protected. If local dsh is deployed on a non-loopback address (reverse proxy/LAN), ' 
          + 'declare allowed Hosts with DSHW_TRUSTED_HOSTS (comma-separated, optional ports).')
      } catch (err) {}
    }
    // v761 (security fix S1): **write requests (POST/PUT/PATCH/DELETE) must originate locally (loopback)**.
    // Why: anyone holding a DSH Web session could `POST /dsh-whale/api-models.json` and add a custom model,
    // while balance / probe / quota requests would then call that model's URL **with the resolved real credential** ⇒ credential exfiltration.
    // “Changing configuration” therefore equals “deciding where credentials are sent”, so it must be bound to “sitting at this machine”;
    // **read-only APIs are unaffected** (the widget remains viewable normally over the LAN).
    // If operations genuinely require remote administration, explicitly set DSHW_ADMIN_HOSTS (comma-separated, optional ports); default is empty.
    const ADMIN_AUTHORITIES = String(process.env.DSHW_ADMIN_HOSTS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
    function writeRejection(req) {
      try {
        const method = String((req && req.method) || 'GET').toUpperCase()
        if (!WRITE_METHODS.has(method)) return null
        const headers = (req && req.headers) || {}
        let hostUrl = null
        try { hostUrl = new URL('http://' + String(headers.host || '')) } catch (err) { return 403 }
        if (isLoopbackHostname(hostUrl.hostname)) return null
        const authority = hostUrl.host.toLowerCase()
        const hostname = hostUrl.hostname.toLowerCase()
        if (ADMIN_AUTHORITIES.some((e) => (e.indexOf(':') >= 0 ? e === authority : e === hostname))) return null
        if (!writeRejection.warned) {
          writeRejection.warned = true
          try {
            console.warn('[whale-balance] Rejected a **write request** from a non-local host (Host=' + authority + ').'
              + ' Since 0.3.15, configuration and credential changes may only be made with the UI opened **locally** (loopback) — ' 
              + 'otherwise anyone with a Web session could redirect credentials to their own server and exfiltrate the real API key.'
              + ' If remote administration is required, declare allowed management hosts with DSHW_ADMIN_HOSTS.')
          } catch (err) {}
        }
        return 403
      } catch (err) { return 403 } // Internal failure → reject (fail-closed)
    }
    function rejected(req, res) {
      const deny = (code) => {
        try { res.statusCode = code || 403; res.end() } catch (err) {}
        return true
      }
      const conn = connectionFence()
      // Determine fence availability first, then self-validate: non-loopback Host is delegated to the fence when it is available (it knows --trusted-host)
      const self = selfRejection(req, { fenceAvailable: !!conn })
      if (self !== null) return deny(self)
      // v761 (security fix S1): allow only after write validation — read requests are unaffected
      const write = writeRejection(req)
      if (write !== null) return deny(write)
      if (!conn) return false // Self-validation passed; no host fence is available to delegate to at this point (warning was emitted at load time)
      let code
      try {
        code = conn.requestRejection(req)
      } catch (err) {
        // Old implementation used `return false` here: exceptions thrown by the fence were treated as “not rejected” and silently allowed (#136's second path)
        if (!rejected.warned) {
          rejected.warned = true
          try { console.warn('[whale-balance] Trust fence threw an exception; treating request as rejected: ' + String((err && err.message) || err)) } catch (e2) {}
        }
        return deny(403)
      }
      if (code === undefined || code === null || code === false) return false
      return deny(typeof code === 'number' ? code : 403)
    }
    // Unified registration entry: every route is automatically wrapped with the trust fence
    function registerRoute(route) {
      const inner = route && route.handler
      const wrapped = Object.assign({}, route, {
        handler: async (req, res) => {
          if (rejected(req, res)) return
          return inner(req, res)
        },
      })
      return ctx.webServer.register(wrapped)
    }
    let imageBytes = null
    let balanceCache = null
    let balanceInFlight = null
    let gifBytes = null
    // Per-turn conversation cost accounting: aggregate into buckets by (session.id, turn), then write lastTurn when complete.
    // Use a Map to avoid mixing accounting between the main session and sub-agents (spawn/fork) running in parallel.
    let turnAggs = new Map() // sessionId -> { turn, cost, tokens, byModel, byModelTokens, lastTs }
    let lastTurn = null // { turn, amount, tokens, ts }
    let lastTurnSeq = 0
    const disposers = []

    // Persist seq: keep incrementing after hot reload/restart so the front end does not mistake new turns for old ones
    function readTurnSeq() {
      for (const p of TURN_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.seq === 'number' && parsed.seq >= 0) return parsed.seq
        } catch (err) {}
      }
      return 0
    }
    function writeTurnSeq(seq) {
      const body = JSON.stringify({ seq, updatedAt: new Date().toISOString() })
      for (const p of TURN_FILE_CANDIDATES) {
        try { fs.writeFileSync(p, body, 'utf8'); return } catch (err) {}
      }
    }
    lastTurnSeq = readTurnSeq()

    function finalizeTurn(sessionId) {
      const agg = turnAggs.get(sessionId)
      if (agg && agg.cost > 0) {
        lastTurn = { turn: agg.turn, amount: agg.cost, tokens: agg.tokens, ts: agg.lastTs }
        lastTurnSeq++
        writeTurnSeq(lastTurnSeq)
        // Write usage events split by model (the sole source of model-level details)
        const byModel = agg.byModel || {}
        const byModelTokens = agg.byModelTokens || {}
        const modelNames = Object.keys(byModel)
        if (modelNames.length) {
          for (const mname of modelNames) {
            appendUsageEvent({ ts: agg.lastTs, model: mname, cost: byModel[mname], tokens: byModelTokens[mname] || 0 })
            // Custom model: attribute by matchIds to the registry model (fallback source for today's usage when balance deltas are unavailable)
            apiAttributeEvent(mname, byModel[mname], byModelTokens[mname] || 0)
          }
        } else {
          appendUsageEvent({ ts: agg.lastTs, model: 'Unknown', cost: agg.cost, tokens: agg.tokens })
        }
      }
      turnAggs.delete(sessionId)
    }
    // Listen to the session event stream: assistant/message carries actual usage for each step and is aggregated by (session,turn);
    // settle the current turn for that session at turn/end and write lastTurn
    function handleSessionEvent(sessionId, event) {
      try {
        const type = event && event.type
        const d = event && event.data
        if (!d || typeof d !== 'object') return
        if (type === 'turn/end') {
          finalizeTurn(sessionId)
          return
        }
        if (type !== 'assistant/message') return
        const turn = Number(d.turn)
        const usage = d.usage
        if (!usage || typeof usage !== 'object' || !isFinite(turn)) return
        let agg = turnAggs.get(sessionId)
        if (!agg || agg.turn !== turn) {
          if (agg) finalizeTurn(sessionId)
          agg = { turn, cost: 0, tokens: 0, byModel: {}, byModelTokens: {}, lastTs: Date.now() }
          turnAggs.set(sessionId, agg)
        }
        const input = Number(usage.inputTokens) || 0
        const cache = Number(usage.cacheReadTokens) || 0
        const output = Number(usage.outputTokens) || 0
        // Accounting correction (issue #89 / PR #83): DSH guarantees reasoningTokens ⊆ outputTokens
        // (dsh-token-meter treats reasoningTokens > outputTokens as invalid),
        // so reasoning must not be accumulated separately — otherwise output-side cost is charged twice at the output rate (measured roughly 2× too high).
        const outputBilled = output // DSH outputTokens already includes reasoningTokens.
        const toks = input + cache + outputBilled
        agg.tokens += toks
        // Pricing conversion (CNY/million tokens; cache hit uses the input rate and the rest use their respective tiers), split by model
        const model = d.message && d.message.source ? d.message.source.model : ''
        // Refresh custom unit prices once before settling each turn (10-second throttle), so custom API models use user-entered prices
        try { refreshCustomPrices() } catch (err) {}
        const p = priceFor(model)
        const off = isPeakTime(Math.floor(Date.now() / 1000)) ? 1 : 0
        let costMsg = (cache / 1e6) * p.hit[off] + (input / 1e6) * p.miss[off] + (outputBilled / 1e6) * p.out[off]
        // If custom unit prices are entered in USD, convert them to CNY using the user-provided exchange rate (the ledger is always recorded in CNY)
        try {
          const meta = customPriceMetaFor(model)
          if (meta && meta.cur === 'USD' && Number(meta.rate) > 0) costMsg = costMsg * Number(meta.rate)
        } catch (err) {}
        agg.cost = addMoney(agg.cost, costMsg)
        if (model) {
          agg.byModel[model] = addMoney(agg.byModel[model] || 0, costMsg)
          agg.byModelTokens[model] = (agg.byModelTokens[model] || 0) + toks
        }
        agg.lastTs = Date.now()
      } catch (err) {}
    }

    // v761 (issue #161 / global sound settings): **pending user-interaction** state.
    // Why it is needed: `ask_user_question` is a **suspending** tool call — after the model emits it, DSH appends `tool/call`,
    // then waits for your click. While waiting, `last-turn.json` `seq` does not change and `turn/end` never arrives, so the “Task Completion Sound”
    // cannot cover these two moments; `turn/end.reason` also contains no usable signal (`blocked` means agent-loop preStep was rejected,
    // unrelated to user questions). Keep only the **latest** pending item; no multi-session queue (sub-agents cannot ask questions and concurrent approvals are rare).
    const waitState = { pending: null, sessionName: "" }
    const WAIT_QUESTION_TOOL = 'ask_user_question'
    // v761: the **authoritative source** of conversation names — DSH's `sessionTitle` service.
    // `sessionTitle.get(session)` comes from “folded session logs” (documentation wording: Read the latest folded title
    // from one live or replayed session) ⇒ it also works for titles written **before this plugin started**;
    // merely listening to `session/title` events can only observe titles added/updated after startup.
    // Null-check + try/catch throughout: older hosts without this service silently fall back; pending tracking must never break because of it.
    function titleFromService(session) {
      try {
        const svc = typeof ctx.get === 'function' ? ctx.get('sessionTitle') : null
        if (!svc || typeof svc.get !== 'function' || !session) return ''
        const snap = svc.get(session)
        const ti = typeof snap === 'string' ? snap : (snap && (snap.title || snap.text))
        return String(ti == null ? '' : ti).trim().slice(0, 120)
      } catch (err) { return '' }
    }

    function pickSessionName(session) {
      try {
        if (!session || typeof session !== 'object') return ''
        const cands = [session.name, session.title, session.label,
          session.summary && session.summary.title, session.summary && session.summary.name,
          session.meta && session.meta.title, session.meta && session.meta.name]
        for (const c of cands) { const s = String(c == null ? '' : c).trim(); if (s) return s.slice(0, 120) }
      } catch (err) {}
      return ''
    }
    // Extract callId / approval id (field locations differ slightly across DSH versions, so check all known variants)
    function eventCallId(event) {
      try {
        const d = (event && event.data) || {}
        const msg = d.message || {}
        const list = Array.isArray(msg.content) ? msg.content : []
        for (const c of list) if (c && (c.toolCallId || c.tool_call_id)) return String(c.toolCallId || c.tool_call_id)
        // DSH actually stores callId at event.data.message.callId (the tool/result payload is {turn,step,message}).
        // Reading it enables “clear exactly by callId”; if unavailable, the fallback logic below still clears the pending item
        // (the current turn is blocked waiting for the user's response, so no other tool/result can occur during that pending period).
        if (msg && (msg.callId || msg.toolCallId || msg.tool_call_id)) return String(msg.callId || msg.toolCallId || msg.tool_call_id)
        return String(d.callId || d.call_id || d.toolCallId || d.id || '')
      } catch (err) { return '' }
    }
    function notePendingEvent(sid, event, session) {
      try {
        const type = String((event && event.type) || '')
        const data = (event && event.data) || {}
        const now = Date.now()
        // v761: **conversation name** has two sources — ① `session/title` event (the DSH session title itself is a log event:
        //   `session.append("session/title", { title, messageSeqs, source })`; the projection key title is folded from it;
        //   this plugin already listens to session/event ⇒ read event.data.title directly, requiring no new service);
        //   ② name/title-style fields on the `session` object (may or may not exist depending on DSH version).
        //   ⚠️ Must appear **after** the type/data declarations — placing it earlier hits the const temporal dead zone (TDZ),
        //   throws ReferenceError which the outer try/catch silently swallows ⇒ all pending tracking fails (this batch actually hit this bug).
        if (type === 'session/title') {
          const ti = String(data.title == null ? '' : data.title).trim()
          if (ti) waitState.sessionName = ti.slice(0, 120)
          return
        }
        // Three sources in reliability order: ① sessionTitle service (folded logs, including titles from before startup)
        // ② session/title events (added/updated after startup) ③ session object fields (version-dependent fallback)
        const svcName = titleFromService(session)
        if (svcName) waitState.sessionName = svcName
        else {
          const name = pickSessionName(session)
          if (name) waitState.sessionName = name
        }
        if (type === 'tool/call' && String(data.name || data.toolName || '') === WAIT_QUESTION_TOOL) {
          waitState.pending = { kind: 'question', id: eventCallId(event) || ('q' + now), ts: now, session: sid }
          return
        }
        if (type === 'tool/result') {
          if (waitState.pending && waitState.pending.kind === 'question') {
            const cid = eventCallId(event)
            if (!cid || cid === waitState.pending.id) waitState.pending = null
          }
          return
        }
        if (type === 'approval/asked') {
          waitState.pending = { kind: 'approval', id: String(data.id || ('a' + now)), ts: now, session: sid }
          return
        }
        if (type.indexOf('approval/') === 0) {
          if (waitState.pending && waitState.pending.kind === 'approval') {
            const id2 = String(data.id || '')
            if (!id2 || id2 === waitState.pending.id) waitState.pending = null
          }
          return
        }
        if (type === 'turn/end' || type === 'turn/start') waitState.pending = null
      } catch (err) {}
    }

    // Listen for appended events from all sessions; bucket by session id and settle that session's current turn at turn/end
    disposers.push(ctx.on('session/event', (session, event) => {
      const sid = session && session.id ? session.id : 'default'
      handleSessionEvent(sid, event)
      notePendingEvent(sid, event, session)
    }))
    // Clean up leftover aggregates when a session is destroyed to avoid memory leaks
    disposers.push(ctx.on('session/disposed', (session) => {
      if (session && session.id) turnAggs.delete(session.id)
    }))

    function loadGif() {
      if (gifBytes) return gifBytes
      for (const p of RUA_GIF_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            gifBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('rua gif not found')
    }

    function loadImage() {
      if (imageBytes) return imageBytes
      for (const p of IMAGE_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            imageBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('whale image not found')
    }

    function pickBalanceInfo(infos) {
      if (!Array.isArray(infos) || infos.length === 0) return null
      const num = (x) => (x && x.total_balance !== undefined ? Number(x.total_balance) : NaN)
      return (
        infos.find((x) => x && x.currency === 'CNY' && num(x) > 0) ||
        infos.find((x) => num(x) > 0) ||
        infos.find((x) => x && x.currency === 'CNY') ||
        infos[0]
      )
    }

    // v759 (issue #157): balance path using **DSH account login state**.
    // Users who sign in only through a DSH account have no API key; their balance is exposed through DeepSeek's platform account endpoint.
    // **Do not construct HTTP manually**: token injection, the five `x-client-*` headers, and invalidation cleanup for 401/`40003` are all handled by DSH's
    // `deepseekAccount` service (DSH's own “Account & Balance” settings card uses `ctx.deepseekAccount.getBalance(client)`).
    // ⚠️ The **optional service** must be read using `ctx.get('deepseekAccount')` and **must never be added to inject** — older hosts do not have this service at all;
    //    putting it in inject would make the entire plugin wait forever and **never apply** (far worse than simply not having this feature).
    // ⚠️ This path **does not interfere** with the API-key path (API key always has priority; DSH's own comment says “Neither route falls back to the other”).
    async function fetchAccountBalance() {
      let account = null
      try { account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null } catch (err) { account = null }
      if (!account || typeof account.getBalance !== 'function') return null
      // Account identifier: prefer the stable id supplied by the account service (different accounts → different ledger scopes); fall back to a fixed identifier if unavailable.
      // Always sha256[:24] hexadecimal — accounting.mjs validates scope against /^[a-zA-Z0-9_-]{1,80}$/
      // (a human-readable form containing a colon throws “Invalid account identifier”; see issue #157 reporter pitfall 1).
      let accountId = null
      try {
        const state = typeof account.getState === 'function' ? account.getState() : null
        accountId = (state && (state.userId || (state.profile && state.profile.userId))) || null
      } catch (err) { accountId = null }
      let result
      try {
        result = await account.getBalance({
          version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || '') || 'unknown',
          locale: String(process.env.DSH_LOCALE || '') || 'zh_CN',
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60, // Whole seconds; east is positive
        })
      } catch (err) { return null }
      // Not logged in / no grant / platform failure → always return null so the caller falls back to the original message (**do not cache errors**)
      if (!result || result.status !== 'ready' || !Array.isArray(result.value) || result.value.length === 0) return null
      const accNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
      const wallets = result.value.filter((w) => w && accNum(w.balance) !== null)
      if (wallets.length === 0) return null
      const currency = wallets.some((w) => String(w.currency || '').toUpperCase() === 'CNY')
        ? 'CNY'
        : String((wallets[0] && wallets[0].currency) || 'CNY').toUpperCase()
      const sumOf = (list) => (Array.isArray(list) ? list : [])
        .filter((w) => w && String(w.currency || 'CNY').toUpperCase() === currency && accNum(w.balance) !== null)
        .reduce((s, w) => s + Number(w.balance), 0)
      const recharge = sumOf(result.value)
      const bonus = sumOf(result.bonusWallets)
      return {
        ok: true,
        // Top-up + promotional credit: same scope as `total_balance` on the API-key path (that field is also the sum of both),
        // otherwise today's usage estimated from balance deltas would be too low (issue #157 reporter pitfall 2).
        totalBalance: Number((recharge + bonus).toFixed(6)),
        rechargeBalance: Number(recharge.toFixed(6)),
        bonusBalance: Number(bonus.toFixed(6)),
        currency,
        balanceSource: 'account',
        accountTag: createHash('sha256').update('dsh-account:' + (accountId === null ? 'default' : String(accountId))).digest('hex').slice(0, 24),
        updatedAt: new Date().toISOString(),
      }
    }

    async function fetchBalance() {
      // v739 (user report: “the first balance request of every new instance always fails”):
      // ① On cold start, the credential service may not be ready yet (resolve throws); this differs from “actually not configured” → retry once after a short delay;
      // ② Reduce per-attempt timeout from 20s to 8s so “2 attempts + backoff” stays clearly below front-end FETCH_TIMEOUT_MS (25s) —
      //    otherwise the front end aborts first and the user always sees “first request failed”, then has to wait 60 seconds for the next cycle.
      let cred = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
          break
        } catch (err) {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 700)); continue }
          return { ok: false, code: 'NO_KEY', error: 'Failed to read credentials: ' + String((err && err.message) || err).slice(0, 160) }
        }
      }
      if (!cred) {
        // v759 (issue #157): when no API key exists, fall back to DSH account login state; the two paths do not interfere and API key always has priority.
        const accountPayload = await fetchAccountBalance()
        if (accountPayload) return accountPayload
        return {
          ok: false, code: 'NO_KEY',
          error: 'DEEPSEEK_API_KEY is not configured and account balance is unavailable (not logged into a DeepSeek account, or this account has no balance wallet)',
        }
      }
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        let res
        try {
          res = await fetch(BALANCE_URL, {
            headers: { Authorization: 'Bearer ' + cred.value },
            signal: AbortSignal.timeout(8000),
          })
        } catch (err) {
          lastErr = err
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        if (!res.ok) {
          lastErr = new Error('HTTP ' + res.status)
          if (res.status < 500) break
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        let data
        try {
          data = await res.json()
        } catch (err) {
          return { ok: false, code: 'PARSE', error: 'Balance API returned invalid JSON' }
        }
        const info = pickBalanceInfo(data && data.balance_infos)
        if (!info || info.total_balance === undefined || !Number.isFinite(Number(info.total_balance))) {
          return { ok: false, code: 'SHAPE', error: 'Balance API returned an unexpected structure' }
        }
        return {
          ok: true,
          totalBalance: Number(info.total_balance),
          accountTag: createHash('sha256').update(String(cred.value)).digest('hex').slice(0, 24),
          currency: String(info.currency || 'CNY'),
          balanceSource: 'apikey',
          updatedAt: new Date().toISOString(),
        }
      }
      const transient = !(lastErr && /^HTTP 4\d\d/.test(lastErr.message))
      return {
        ok: false,
        code: 'HTTP',
        transient: transient,
        error: 'Balance API request failed: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200),
      }
    }

    function todayKey() { return beijingDay() }
    // Windows indexers can briefly hold a just-written file. Retry sharing
    // conflicts; never treat an unreadable existing ledger as an empty ledger.
    function ledgerIo(operation) {
      for (let attempt = 0; ; attempt++) {
        try { return operation() } catch (err) {
          if (attempt >= 5 || !['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw err
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1))
        }
      }
    }
    function readUsageLedger() {
      for (const p of USAGE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(ledgerIo(() => fs.readFileSync(p, 'utf8')))
          if (parsed && typeof parsed === 'object' && typeof parsed.date === 'string') return parsed
          throw new Error('Ledger structure is invalid; writes have been stopped to protect existing records')
        } catch (err) { if (err.code !== 'ENOENT') throw err }
      }
      return { date: todayKey(), lastBalance: null, todayUsage: 0, history: {} }
    }
    function writeUsageLedger(led) {
      const body = JSON.stringify(led)
      for (const p of USAGE_FILE_CANDIDATES) {
        const temp = p + '.tmp-' + process.pid
        try {
          if (fs.existsSync(p)) {
            const existing = JSON.parse(ledgerIo(() => fs.readFileSync(p, 'utf8')))
            if (!existing.accounting || existing.accounting.version !== 1) {
              try { ledgerIo(() => fs.copyFileSync(p, p + '.before-recharge-fix.bak', fs.constants.COPYFILE_EXCL)) }
              catch (err) { if (err.code !== 'EEXIST') throw err }
            }
          }
          ledgerIo(() => fs.writeFileSync(temp, body, 'utf8'))
          ledgerIo(() => fs.renameSync(temp, p))
          return true
        } catch (err) {
          try { if (fs.existsSync(temp)) fs.unlinkSync(temp) } catch (cleanupErr) {}
          if (err.code !== 'ENOENT') console.error('[whale-ledger] Failed to save ledger:', err.code || err.message)
        }
      }
      return false
    }
    // —— Ledger retention policy (v700): keep events for 90 days or at most 20,000 entries; keep history for 365 days;
    //    archive expired data into .dshw-usage-archive.json (history is not lost, only moved out of the main ledger to prevent unbounded growth) ——
    function usageArchivePath() {
      for (const p of USAGE_FILE_CANDIDATES) {
        try {
          fs.accessSync(path.dirname(p), fs.constants.W_OK)
          return path.join(path.dirname(p), '.dshw-usage-archive.json')
        } catch (err) {}
      }
      return path.join(DSH_HOME, '.dshw-usage-archive.json')
    }
    function readUsageArchive() {
      try {
        const j = JSON.parse(fs.readFileSync(usageArchivePath(), 'utf8'))
        if (j && typeof j === 'object') return j
      } catch (err) {}
      return { version: 1, events: [], history: {} }
    }
    // Returns true when the ledger was trimmed (caller can then persist it)
    function pruneLedgerUsage(led) {
      try {
        const ev = Array.isArray(led.events) ? led.events : []
        const hist = (led.history && typeof led.history === 'object') ? led.history : {}
        const dateCut90 = dayAdd(todayKey(), -90)
        const dateCut365 = dayAdd(todayKey(), -365)
        const keepEv = []
        const dropEv = []
        for (const e of ev) {
          const day = String((e && e.day) || '')
          if (day && day < dateCut90) dropEv.push(e)
          else keepEv.push(e)
        }
        if (keepEv.length > 20000) {
          const extra = keepEv.length - 20000
          for (const e of keepEv.splice(0, extra)) dropEv.push(e)
        }
        const dropHist = {}
        let histDropped = 0
        for (const day of Object.keys(hist)) {
          if (String(day) < dateCut365) {
            dropHist[day] = hist[day]
            delete hist[day]
            histDropped++
          }
        }
        if (!dropEv.length && !histDropped) return false
        const ar = readUsageArchive()
        ar.events = Array.isArray(ar.events) ? ar.events : []
        for (const e of dropEv) ar.events.push(e)
        if (ar.events.length > 200000) ar.events.splice(0, ar.events.length - 200000)
        ar.history = Object.assign({}, ar.history || {}, dropHist)
        ar.updatedAt = new Date().toISOString()
        ar.note = 'Little Whale Accounting archive: events older than 90 days or beyond 20,000 entries; history older than 365 days'
        try { fs.writeFileSync(usageArchivePath(), JSON.stringify(ar), 'utf8') } catch (err) { return false }
        led.events = keepEv
        led.history = hist
        return true
      } catch (err) { return false }
    }
    function dayKeyOfDate(d) { return beijingDay(d.getTime()) }
    function dayKeyFromTs(ts) { return beijingDay(Number(ts)) }
    function dayAdd(baseDayStr, delta) { return dayOffset(baseDayStr, delta) }
    // Append one usage event after each turn settles (source for model details / 7-day / all-record views; limit 8,000 entries)
    function appendUsageEvent(ev) {
      const led = readUsageLedger()
      led.events = Array.isArray(led.events) ? led.events : []
      led.events.push({
        ts: Number(ev.ts) || Date.now(),
        day: dayKeyFromTs(Number(ev.ts) || Date.now()),
        model: String(ev.model || 'Unknown'),
        cost: preciseMoney(Number(ev.cost) || 0),
        tokens: Math.round(Number(ev.tokens) || 0),
      })
      // Retention policy: events 90 days / max 20,000 entries (expired/excess entries are archived to .dshw-usage-archive.json)
      pruneLedgerUsage(led)
      writeUsageLedger(led)
    }
    // Summaries used by the panel/window: today (descending by model), last 7 days, 7-day total, all records
    function usageRecordsPayload() {
      const led = readUsageLedger()
      const events = Array.isArray(led.events) ? led.events : []
      const today = todayKey()
      function modelsFor(day) {
        const map = new Map()
        for (const e of events) {
          if (e.day !== day) continue
          const name = String(e.model || 'Unknown')
          map.set(name, addMoney(map.get(name) || 0, Number(e.cost) || 0))
        }
        return Array.from(map, ([model, cost]) => ({ model, cost, source: 'events', currency: 'CNY' }))
          .sort((a, b) => b.cost - a.cost)
      }
      function forDay(date) {
        const summary = daySummary(led, date)
        const models = modelsFor(date)
        return {
          ...summary, date, total: summary.amount, models,
          modelTotal: sumMoney(models.map(m => m.cost)), modelCurrency: 'CNY',
        }
      }
      const todayData = forDay(today)
      const days7 = Array.from({ length: 7 }, (_, i) => forDay(dayAdd(today, -i)))
      const total7ByCurrency = {}
      for (const d of days7) total7ByCurrency[d.currency] = addMoney(total7ByCurrency[d.currency] || 0, d.total)
      const days = new Set([today, ...Object.keys(led.history || {}), ...accountingDays(led)])
      for (const e of events) if (/^\d{4}-\d{2}-\d{2}$/.test(e.day)) days.add(e.day)
      return {
        ok: true, version: '0.3.16', today: todayData, days7,
        total7: total7ByCurrency[todayData.currency] || 0, total7Currency: todayData.currency, total7ByCurrency,
        all: {
          days: Array.from(days).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().map(forDay),
          events: events.slice().sort((a, b) => b.ts - a.ts).slice(0, 500),
        },
        settings: readUsageSettings(),
      }
    }
    // Usage-related settings (task completion sound / low-balance warning / daily budget) are stored under settings in the usage ledger
    // v761 (global sound settings panel / issue #161): per-event sound + bubble configuration.
    // Naming follows existing conventions: `sel` is the sound binding ('' = silent), `lines` is the bubble-content module list (same structure as alert / turnCost),
    // `bubbleOn` controls whether to show a bubble, `vol` is independent volume for the event; question/approval additionally use `autoClose` + `ttlSec` (same names as alert).
    // ⚠️ v764: `events.turnCost` **no longer has** `autoClose`/`ttlSec` — they never had a consumer; the actual target of section ② “Auto Close”
    //    is `turnCostCloseMs` in `.dshw-size.json` (default 5000ms; see readSizeConfig).
    // ⚠️ The default question/approval content here **must match the front-end `usageWaitDefaultLines()` field by field**
    //    (same existing convention as alert/turnCost: host = default for new users; front end = target of editor “Restore Defaults”).
    function waitDefaultLines(kind) {
      // v774: factory-default content = the author's current real configuration (conversation-name module + one notification sentence, both using marquee gradient colors).
      // ⚠️ Must match whale-widget.js usageWaitDefaultLines() field by field (a cross-end consistency probe locks this down).
      const isApproval = kind === 'approval'
      return [
        { type: 'session', size: 10, bold: true, tpl: '[ {session} ]', len: 5, rgb: 'champagne', color: '' },
        { type: 'text', text: isApproval ? 'Waiting for Boss to approve' : 'Waiting for Boss to answer', size: 7, bold: true, bgRgb: '', bg: '', rgb: 'indigo', color: '' },
      ]
    }
    function soundEventsDefaults() {
      return {
        // Press sound (press + release): volume and sound group remain in .dshw-size.json (vol / soundSet);
        // this is only a placeholder so the panel can represent all four events with the same structure.
        press: { vol: 1 },
        // ⚠️ turnCost **does not have** soundOn: whether that sound plays is controlled by the existing `taskEnd.on`.
        //    Question/approval use soundOn; since v774 their factory default matches the author's current usage: the event is **enabled**, but sound is **off**
        //    (bubble only) — enable [✓] on the sound row if you want audio.
        // v764: turnCost **intentionally omits** autoClose / ttlSec — the real source for auto-close is
        //    turnCostCloseMs in .dshw-size.json; retaining these two keys would create two sources for one setting (one of which is always fake).
        turnCost: { vol: 1, bubbleOn: true },
        question: { on: true, soundOn: false, sel: 'frag:exp_orb', vol: 1, autoClose: true, ttlSec: 180, bubbleOn: true, lines: waitDefaultLines('question') },
        approval: { on: true, soundOn: false, sel: 'frag:exp_orb', vol: 1, autoClose: true, ttlSec: 180, bubbleOn: true, lines: waitDefaultLines('approval') },
      }
    }
    function usageSettingsDefaults() {
      return {        // Task-completion sound: since v774 factory default = **enabled** (author's current setup), default sound = built-in A (end_a)
        taskEnd: { on: true, sel: 'frag:end_a' },
        // v761: sound/auto-close/bubble configuration for the four events (panel: “Global Sound Settings”)
        events: soundEventsDefaults(),
        // Defaults are frozen from the current development-environment usage.json settings (fresh installs get this experience)
        // ⚠️ The alert / budget / turnCost content here and the front-end whale-widget.js
        //    usageRemindDefaultLines() / usageTurnCostDefaultLines() **must match field by field**
        //    (host = default content for new users; front end = target content of editor “Restore Defaults”). Any change must be mirrored in both places.
        alert: {
          on: true, below: 5,
          msg: 'Low-balance warning: current balance is below the configured threshold {below}',
          lines: [
            { type: 'text', text: 'Boss~ your DS balance', size: 5, bold: true },
            { type: 'text', text: 'has fallen below', size: 5, bold: true, row: 2 },
            { type: 'text', text: '¥{below}', size: 5, bold: true, rgb: 'rouge', color: '', bgRgb: '', bg: '', row: 2 },
            { type: 'text', text: '~', size: 5, bold: true, row: 2 },
            { type: 'image', imgId: 'bimg_money1', size: 6, imgScale: 0.4 },
            { type: 'link', text: '>> Top Up <<', url: 'https://platform.deepseek.com/top_up', size: 1, color: '#ffffff', rgb: '', bgRgb: 'indigo', bg: '', bold: true, ul: false },
          ],
          autoClose: false, ttlSec: 6,
        },
        budget: {
          on: true, amount: 10,
          msg: 'Today usage has reached the budget ¥{amount}',
          lines: [
            { type: 'text', text: 'Boss, today’s spending has already exceeded', size: 6, bold: true, row: 1 },
            { type: 'text', text: '¥{amount}', size: 7, bold: true, row: 1, rgb: 'rouge', color: '', italic: false, bgRgb: '', bg: '' },
            { type: 'text', text: '— keep spending and we’ll go broke...', size: 6, bold: true, row: 1 },
          ],
          autoClose: false, ttlSec: 6,
        },
        // Per-turn cost notification content (custom notification window): uses the same modular content system as warning/budget; {cost} = cost of the current turn.
        // Content = frozen snapshot of the current effective defaults (matching front-end usageTurnCostDefaultLines());
        // toggle/auto-close seconds remain in .dshw-size.json (not migrated); only content is stored here.
        turnCost: {
          lines: [
            { type: 'text', text: 'Previous conversation turn cost:', size: 8, bold: true },
            { type: 'text', text: '¥ {cost}', size: 24, bold: true, color: '#e0433f' },
            { type: 'today', size: 2, tpl: 'Today used {expense_ds}', bold: false, rgb: '', color: '#ffffff', bgRgb: 'indigo', bg: '' },
          ],
        },
      }
    }
    function readUsageSettings() {
      const led = readUsageLedger()
      const d = usageSettingsDefaults()
      const s = led && led.settings && typeof led.settings === 'object' ? led.settings : {}
      if (s.taskEnd && typeof s.taskEnd === 'object') d.taskEnd = Object.assign({}, d.taskEnd, s.taskEnd)
      if (s.alert && typeof s.alert === 'object') d.alert = Object.assign({}, d.alert, s.alert)
      if (s.budget && typeof s.budget === 'object') d.budget = Object.assign({}, d.budget, s.budget)
      if (s.turnCost && typeof s.turnCost === 'object') d.turnCost = Object.assign({}, d.turnCost, s.turnCost)
      // v761 (global sound settings): merge the four events individually (missing fields fall back to defaults; do not replace the entire object)
      if (s.events && typeof s.events === 'object') {
        for (const k of Object.keys(d.events)) {
          if (s.events[k] && typeof s.events[k] === 'object') d.events[k] = Object.assign({}, d.events[k], s.events[k])
        }
        // v764: if old data still contains events.turnCost.autoClose / ttlSec (removed dead keys), drop them while reading
        // so they are no longer sent to the front end with settings (the real source is turnCostCloseMs in .dshw-size.json).
        if (d.events.turnCost) { delete d.events.turnCost.autoClose; delete d.events.turnCost.ttlSec }
      }      // Per-model warning/budget: built-in DeepSeek continues using top-level alert/budget (zero migration for old configs)
      const byModel = s.models && typeof s.models === 'object' ? s.models : {}
      // Manual quota defaults: when resource-pack/subscription providers have no quota endpoint, total and used values are entered manually in the panel
      const qDef = () => ({ on: false, mode: 'auto', total: 0, unit: 'tokens', used: 0, reset: 'none', baseAt: 0 })
      d.models = { [API_BUILTIN_ID]: { alert: d.alert, budget: d.budget, quota: Object.assign(qDef(), (byModel[API_BUILTIN_ID] && byModel[API_BUILTIN_ID].quota) || {}) } }
      for (const m of readApiRegistry().models) {
        if (!m || !m.id || m.id === API_BUILTIN_ID) continue
        const st = byModel[m.id] && typeof byModel[m.id] === 'object' ? byModel[m.id] : {}
        d.models[m.id] = {
          alert: Object.assign({}, usageSettingsDefaults().alert, st.alert || {}),
          budget: Object.assign({}, usageSettingsDefaults().budget, st.budget || {}),
          quota: Object.assign(qDef(), st.quota || {}),
        }
      }
      return d
    }
    function writeUsageSettings(patch) {
      const led = readUsageLedger()
      led.settings = led.settings && typeof led.settings === 'object' ? led.settings : {}
      const p = patch || {}
      if (p.taskEnd && typeof p.taskEnd === 'object') led.settings.taskEnd = Object.assign({}, led.settings.taskEnd || {}, p.taskEnd)
      if (p.alert && typeof p.alert === 'object') led.settings.alert = Object.assign({}, led.settings.alert || {}, p.alert)
      if (p.budget && typeof p.budget === 'object') led.settings.budget = Object.assign({}, led.settings.budget || {}, p.budget)
      // Per-turn cost notification content (custom notification window)
      if (p.turnCost && typeof p.turnCost === 'object') led.settings.turnCost = Object.assign({}, led.settings.turnCost || {}, p.turnCost)
      // v761 (global sound settings): merge events patch per event (front end sends only fields that changed)
      if (p.events && typeof p.events === 'object') {
        led.settings.events = led.settings.events && typeof led.settings.events === 'object' ? led.settings.events : {}
        for (const k of Object.keys(p.events)) {
          if (!p.events[k] || typeof p.events[k] !== 'object') continue
          led.settings.events[k] = Object.assign({}, led.settings.events[k] || {}, p.events[k])
        }
        // v764: events.turnCost autoClose / ttlSec have been removed (real source is
        // turnCostCloseMs in .dshw-size.json) — delete them during this save if old data still contains them; also drop them if an old front end sends them.
        const tcEv = led.settings.events.turnCost
        if (tcEv && typeof tcEv === 'object') { delete tcEv.autoClose; delete tcEv.ttlSec }
      }
      // “Restore Defaults”: reset only sound/notification-related keys (do not touch appearance, position, ledger, characters, or bubble customization)
      if (p.resetEvents === true) {
        led.settings.events = soundEventsDefaults()
        // Task-completion sound is also a “sound key”: host reset behavior and panel display must use the same definition (otherwise UI and actual state diverge)
        // v774: reset target = new factory default (enabled + built-in A)
        led.settings.taskEnd = { on: true, sel: 'frag:end_a' }
      }      // Save per-model warning/budget: { modelId, alert?, budget? }
      if (p.modelSettings && p.modelSettings.id) {
        const mid = String(p.modelSettings.id)
        led.settings.models = led.settings.models && typeof led.settings.models === 'object' ? led.settings.models : {}
        const cur = led.settings.models[mid] && typeof led.settings.models[mid] === 'object' ? led.settings.models[mid] : {}
        if (p.modelSettings.alert && typeof p.modelSettings.alert === 'object') cur.alert = Object.assign({}, cur.alert || {}, p.modelSettings.alert)
        if (p.modelSettings.budget && typeof p.modelSettings.budget === 'object') cur.budget = Object.assign({}, cur.budget || {}, p.modelSettings.budget)
        // Manual quota: replace as a whole (total/unit/used/reset cycle/counting mode/enabled)
        if (p.modelSettings.quota && typeof p.modelSettings.quota === 'object') {
          const q = Object.assign({}, p.modelSettings.quota)
          const wantReset = !!q.resetBase
          delete q.resetBase
          // “Reset baseline”: set the cumulative-token baseline to the current value → used starts again from 0
          if (wantReset) {
            const u = apiUsageRaw(mid)
            q.baseAt = Number(u && u.tokensTotal) || 0
          }
          cur.quota = Object.assign({}, cur.quota || {}, q)
        }
        led.settings.models[mid] = cur
        // Built-in DeepSeek: also write back to top-level fields so legacy readers (bubble notifications) remain unaffected
        if (mid === API_BUILTIN_ID) {
          if (cur.alert) led.settings.alert = cur.alert
          if (cur.budget) led.settings.budget = cur.budget
        }
      }
      if (!writeUsageLedger(led)) return { ok: false, error: 'Save failed' }
      return { ok: true, settings: readUsageSettings() }
    }
    // ===== Codex local-session statistics (Codex adapter · phase 1) =====
    // Data sources: $CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl and archived_sessions/*.jsonl (plain-text JSONL)
    //   Each line: { type, timestamp, ordinal, payload }
    //   Per-turn usage: payload.info.last_token_usage / total_token_usage for type=token_count
    //   Model attribution: payload.model for type=turn_context
    // Accounting method: prefer **differences in cumulative totals** (total_token_usage is monotonic, naturally immune to duplicate token_count records within one turn);
    //       scale usage components proportionally using that event's last_token_usage; fall back to last_token_usage when the cumulative value is missing.
    // Cache: $DSH_HOME/.dshw-codex.json (stores only per-file aggregates and size/mtime; no credentials and no writes to ~/.codex)
    function codexHome() {
      const env = String(process.env.CODEX_HOME || '').trim()
      for (const c of [env, path.join(os.homedir(), '.codex')]) {
        try { if (c && fs.existsSync(c)) return c } catch (err) {}
      }
      return ''
    }
    function readCodexCache() {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(DSH_HOME, '.dshw-codex.json'), 'utf8'))
        if (j && j.files && typeof j.files === 'object') return j
      } catch (err) {}
      return { version: 1, files: {} }
    }
    function writeCodexCache(c) {
      try { fs.writeFileSync(path.join(DSH_HOME, '.dshw-codex.json'), JSON.stringify(c), 'utf8'); return true } catch (err) { return false }
    }
    function listCodexSessionFiles(root) {
      const out = []
      const walk = (dir, depth) => {
        if (depth > 6) return
        let ents = []
        try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch (err) { return }
        for (const e of ents) {
          const p = path.join(dir, e.name)
          if (e.isDirectory()) walk(p, depth + 1)
          else if (/^rollout-.*\.jsonl$/i.test(e.name)) out.push(p)
        }
      }
      walk(path.join(root, 'sessions'), 0)
      walk(path.join(root, 'archived_sessions'), 0)
      return out
    }
    // Parse the **text** of one session file → { days, rl, rlTs }
    // issue #116: reading is now performed asynchronously by the caller (check size first, yield the event loop after reading); this function only parses pure text.
    function parseCodexFileText(text) {
      const days = {}
      let model = 'codex'
      let prevTotal = null
      let lastRl = null, rlTs = 0
      if (typeof text !== 'string' || !text) return { days, rl: null, rlTs: 0 }
      const bump = (day, mk, v) => {
        days[day] = days[day] || {}
        const cur = days[day][mk] || { in: 0, cached: 0, cwrite: 0, out: 0, reason: 0, total: 0, turns: 0 }
        cur.in += v.in; cur.cached += v.cached; cur.cwrite += v.cwrite
        cur.out += v.out; cur.reason += v.reason; cur.total += v.total; cur.turns += v.turns
        days[day][mk] = cur
      }
      for (const line of text.split('\n')) {
        if (!line || line.charCodeAt(0) !== 123) continue // Process only lines beginning with '{'
        let o = null
        try { o = JSON.parse(line) } catch (err) { continue }
        const p = o && o.payload
        if (!p) continue
        if (o.type === 'turn_context') {
          if (p.model) model = String(p.model)
          continue
        }
        if (o.type !== 'event_msg' || p.type !== 'token_count') continue
        const info = p.info
        if (!info || typeof info !== 'object') continue
        const last = info.last_token_usage || null
        const tot = info.total_token_usage || null
        const ts = Date.parse(String(o.timestamp || '')) || 0
        if (!ts) continue
        const day = dayKeyFromTs(ts)
        // Increment represented by this event
        let delta = null
        const totAll = tot ? Number(tot.total_tokens) || 0 : 0
        if (totAll > 0) {
          if (prevTotal === null || totAll < prevTotal) delta = totAll
          else delta = totAll - prevTotal
          prevTotal = totAll
        }
        if (delta === null || delta <= 0) {
          if (!last) continue
          delta = Number(last.total_tokens) || 0
        }
        if (delta <= 0) continue
        // Split components: scale proportionally from last_token_usage to delta
        const lTotal = last ? Number(last.total_tokens) || 0 : 0
        const k = (lTotal > 0 && last) ? delta / lTotal : 0
        const v = last && k > 0
          ? {
            in: Math.round((Number(last.input_tokens) || 0) * k),
            cached: Math.round((Number(last.cached_input_tokens) || 0) * k),
            cwrite: Math.round((Number(last.cache_write_input_tokens) || 0) * k),
            out: Math.round((Number(last.output_tokens) || 0) * k),
            reason: Math.round((Number(last.reasoning_output_tokens) || 0) * k),
          }
          : { in: 0, cached: 0, cwrite: 0, out: 0, reason: 0 }
        bump(day, model, { in: v.in, cached: v.cached, cwrite: v.cwrite, out: v.out, reason: v.reason, total: delta, turns: 1 })
        // Subscription-window snapshot: Codex includes rate_limits in token_count events (only ChatGPT subscription providers have values;
        // API-key providers such as DeepSeek use null). Keep the latest non-empty snapshot for phase-two display.
        const rl = p.rate_limits
        if (rl && typeof rl === 'object' && (rl.primary || rl.secondary || rl.plan_type || rl.credits)) {
          if (ts >= rlTs) { lastRl = rl; rlTs = ts }
        }
      }
      return { days, rl: lastRl, rlTs }
    }
    // rate_limits field names differ across Codex versions → tolerate multiple candidate keys and normalize to “used % + reset timestamp”
    function normalizeCodexWindow(w) {
      if (!w || typeof w !== 'object') return null
      const pick = (keys) => {
        for (const k of keys) {
          const raw = w[k]
          if (raw === null || raw === undefined || raw === '') continue
          const n = Number(raw)
          if (isFinite(n)) return n
        }
        return null
      }
      let usedPct = pick(['used_percent', 'usedPercent', 'percent', 'used_pct', 'usage_percent', 'usagePercent'])
      const remainPct = pick(['remaining_percent', 'remainingPercent', 'left_percent', 'remaining_pct'])
      if (usedPct === null && remainPct !== null) usedPct = Math.max(0, 100 - remainPct)
      let resetAt = null
      const secs = pick(['resets_in_seconds', 'resetsInSeconds', 'reset_after_seconds', 'reset_in_seconds', 'seconds_until_reset'])
      if (secs !== null && secs >= 0) resetAt = Date.now() + secs * 1000
      else {
        const abs = w.resets_at || w.reset_at || w.reset_time || w.next_reset || w.resetAt || w.nextResetTime
        if (typeof abs === 'number' && isFinite(abs)) resetAt = abs < 1e12 ? abs * 1000 : abs
        else if (typeof abs === 'string' && abs) { const t = Date.parse(abs); if (isFinite(t)) resetAt = t }
      }
      const windowMinutes = pick(['window_minutes', 'windowMinutes', 'window', 'period_minutes'])
      const label = String(w.limit_name || w.name || w.label || w.window_name || '')
      if (usedPct === null && resetAt === null) return null
      return { usedPct, resetAt, windowMinutes, label }
    }
    function normalizeCodexRateLimits(rl) {
      if (!rl || typeof rl !== 'object') return null
      const primary = normalizeCodexWindow(rl.primary)
      const secondary = normalizeCodexWindow(rl.secondary)
      if (!primary && !secondary) return null
      return {
        primary, secondary,
        planType: rl.plan_type ? String(rl.plan_type) : '',
        limitName: rl.limit_name ? String(rl.limit_name) : (rl.limit_id ? String(rl.limit_id) : ''),
        reached: rl.rate_limit_reached_type ? String(rl.rate_limit_reached_type) : '',
      }
    }
    // Aggregate (with incremental cache: only changed files are reparsed)
    // ===== issue #116: guardrails for local Codex statistics =====
    // The old implementation performed a **synchronous** full scan on the event loop “1.5s after startup + every 5 minutes”: recursively walk
    // ~/.codex/sessions, then for every stale file run readFileSync + split('\n') + JSON.parse line by line.
    // After enough sessions accumulated, one scan could freeze the event loop for minutes (all of dsh web unresponsive, CPU pegged),
    // and a single rollout larger than V8's string limit (~512MB) would throw ERR_STRING_TOO_LONG —
    // because the exception occurred before cache writeback, that file was reread every scan while size/mtime kept changing, causing permanent recurrence.
    // Now there are three guardrails:
    //   ① Per-file limit: files larger than CODEX_MAX_FILE_BYTES are skipped directly (result is cached, so they are not reread),
    //      and skipped / skippedBytes are reported in the summary so the UI can show that files were skipped;
    //   ② Per-scan budget: read at most CODEX_BUDGET_FILES files / CODEX_BUDGET_BYTES bytes per pass; when exhausted,
    //      return immediately with deferred and refresh again later — never monopolize the event loop for a long time;
    //   ③ Fully asynchronous (fs.promises) + yield the event loop after each file (await setImmediate).
    const CODEX_MAX_FILE_BYTES = 32 * 1024 * 1024
    const CODEX_BUDGET_FILES = 400
    const CODEX_BUDGET_BYTES = 96 * 1024 * 1024
    const CODEX_SNAP_TTL = 60 * 1000
    const yieldLoop = () => new Promise((r) => setImmediate(r))

    // Aggregate (with incremental cache: only changed files are reparsed). Async and budget-constrained.
    async function codexScan() {
      const home = codexHome()
      if (!home) return { ok: false, error: 'Codex directory not found ($CODEX_HOME or ~/.codex)' }
      const cache = readCodexCache()
      const files = listCodexSessionFiles(home)
      const keep = {}
      let changed = 0, skipped = 0, skippedBytes = 0, deferred = 0, readBytes = 0, parsedCount = 0
      for (const f of files) {
        let st = null
        try { st = await fs.promises.stat(f) } catch (err) { continue }
        const prev = cache.files[f]
        if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && prev.days) {
          keep[f] = prev
          if (prev.skip === 'too-big') { skipped++; skippedBytes += Number(st.size) || 0 }
          continue
        }
        // ① Per-file limit: skip oversized files (no more errno and no reread every cycle)
        if (st.size > CODEX_MAX_FILE_BYTES) {
          keep[f] = { size: st.size, mtimeMs: st.mtimeMs, days: {}, rl: null, rlTs: 0, skip: 'too-big' }
          skipped++; skippedBytes += st.size; changed++
          continue
        }
        // ② Per-scan budget: stop once this pass has read enough; leave the remainder for the next refresh
        if (readBytes + st.size > CODEX_BUDGET_BYTES || parsedCount >= CODEX_BUDGET_FILES) { deferred++; continue }
        let text = ''
        try { text = await fs.promises.readFile(f, 'utf8') } catch (err) { text = '' }
        readBytes += st.size
        const parsed = parseCodexFileText(text)
        keep[f] = { size: st.size, mtimeMs: st.mtimeMs, days: parsed.days, rl: parsed.rl || null, rlTs: parsed.rlTs || 0 }
        changed++
        parsedCount++
        await yieldLoop() // ③ Yield after each file so HTTP requests are not blocked by the whole scan
      }
      if (changed > 0 || Object.keys(cache.files).length !== Object.keys(keep).length) {
        writeCodexCache({ version: 1, files: keep, builtAt: Date.now() })
      }
      const today = dayKeyFromTs(Date.now())
      const month = today.slice(0, 7)
      const byDay = {}
      const byModel = {}
      let totalTokens = 0, todayTokens = 0, monthTokens = 0, outTokens = 0, reasonTokens = 0, cachedTokens = 0
      let bestRl = null, bestRlTs = -1
      for (const f of Object.keys(keep)) {
        if (keep[f].rl && (keep[f].rlTs || 0) >= bestRlTs) { bestRl = keep[f].rl; bestRlTs = keep[f].rlTs || 0 }
        const days = keep[f].days || {}
        for (const d of Object.keys(days)) {
          const day0 = byDay[d] || (byDay[d] = { tokens: 0, turns: 0, models: {} })
          for (const m of Object.keys(days[d])) {
            const v = days[d][m] || {}
            day0.tokens += Number(v.total) || 0
            day0.turns += Number(v.turns) || 0
            day0.models[m] = (day0.models[m] || 0) + (Number(v.total) || 0)
            const bm = byModel[m] || (byModel[m] = { tokens: 0, out: 0, reason: 0, cached: 0, turns: 0 })
            bm.tokens += Number(v.total) || 0
            bm.out += Number(v.out) || 0
            bm.reason += Number(v.reason) || 0
            bm.cached += Number(v.cached) || 0
            bm.turns += Number(v.turns) || 0
            totalTokens += Number(v.total) || 0
            outTokens += Number(v.out) || 0
            reasonTokens += Number(v.reason) || 0
            cachedTokens += Number(v.cached) || 0
            if (d === today) todayTokens += Number(v.total) || 0
            if (d.slice(0, 7) === month) monthTokens += Number(v.total) || 0
          }
        }
      }
      const days7 = []
      for (let i = 0; i < 7; i++) {
        const d = dayAdd(today, -i)
        days7.push({ date: d, tokens: (byDay[d] && byDay[d].tokens) || 0, turns: (byDay[d] && byDay[d].turns) || 0 })
      }
      return {
        ok: true, home, sessions: files.length, changed,
        // issue #116: expose guardrail results so UI/logs reveal that “files were skipped or this pass did not finish scanning”
        skipped, skippedBytes, deferred, readBytes,
        maxFileBytes: CODEX_MAX_FILE_BYTES,
        todayTokens, monthTokens, totalTokens,
        outTokens, reasonTokens, cachedTokens,
        days7, byModel,
        // Phase two: subscription windows (5h / week). Only present when logs contain populated rate_limits (ChatGPT subscription provider)
        rateLimits: bestRl,
        windows: normalizeCodexRateLimits(bestRl),
        rateLimitsTs: bestRlTs > 0 ? bestRlTs : 0,
      }
    }
    // ===== Summary snapshot (issue #116) =====
    // Key change: **no caller can trigger a synchronous scan anymore**.
    //   · codexSummaryCached(): synchronous and never blocks — returns the previous snapshot immediately; when stale,
    //     it “kicks off” one background refresh without waiting, so synchronous call sites (quota calculation) are safe too;
    //   · codexSummaryEnsured(ms): used where reasonably fresh data is desirable (probe / model list); waits for an in-flight scan,
    //     for at most ms milliseconds, then uses the current snapshot on timeout — never waits forever;
    //   · only one scan may run at a time (deduplicated); when the budget is exhausted, schedule another catch-up scan later.
    let codexSnap = null
    let codexSnapAt = 0
    let codexScanP = null
    let codexCatchupT = null
    // After configuration changes (for example, the user disables Codex statistics), invalidate the snapshot,
    // otherwise the next request could still hit the pre-disable snapshot and make the switch look ineffective.
    function codexInvalidate() { codexSnap = null; codexSnapAt = 0; codexStatsOnV = null; codexStatsOnAt = 0 }
    // Cache the switch value for 2 seconds: codexBackgroundRefresh may be called frequently (every payload build when the snapshot is stale),
    // while readSizeConfig() performs synchronous file I/O — it must not sit on the hot path.
    // codexInvalidate() clears the cache when the user changes settings, so the switch still takes effect immediately.
    let codexStatsOnV = null, codexStatsOnAt = 0
    // v748: when no Codex model is configured, **local statistics are disabled by default** — do not read ~/.codex/sessions at all
    // (those logs are irrelevant when the user has not added a Codex model; scanning them wastes disk I/O and event-loop time).
    // Detection uses template kind === 'codex' (same source as the “Codex Usage” row in the model list).
    function hasCodexModel() {
      try {
        for (const m of readApiRegistry().models) {
          const tpl = apiTemplateOf(m && m.provider)
          if (tpl && tpl.kind === 'codex') return true
        }
      } catch (err) {}
      return false
    }
    function codexStatsOn() {
      const now = Date.now()
      if (codexStatsOnV !== null && now - codexStatsOnAt < 2000) return codexStatsOnV
      let v = true
      try {
        if (!hasCodexModel()) {
          v = false // No Codex model → disabled by default (not “disabled by user”; see message below)
        } else {
          const cfg = readSizeConfig()
          v = !cfg || cfg.codexStatsOn !== false
        }
      } catch (err) { v = true }
      codexStatsOnV = v
      codexStatsOnAt = now
      return v
    }
    // Disabled-reason message: distinguish “user explicitly disabled it” from “no Codex model configured (default off)”
    function codexDisabledReason() {
      try { return hasCodexModel() ? 'Codex statistics are disabled in Settings' : 'No Codex model added; local statistics are disabled by default' } catch (err) { return 'Codex statistics are disabled' }
    }
    function codexBackgroundRefresh(delayMs) {
      if (codexScanP) return codexScanP // Already scanning: return existing promise first to avoid duplicate config reads / queueing
      if (!codexStatsOn()) {
        codexSnap = { ok: false, disabled: true, error: codexDisabledReason() }
        codexSnapAt = Date.now()
        return null
      }
      if (delayMs > 0) {
        if (codexCatchupT) return null
        codexCatchupT = setTimeout(() => { codexCatchupT = null; codexBackgroundRefresh(0) }, delayMs)
        try { if (codexCatchupT.unref) codexCatchupT.unref() } catch (err) {}
        return null
      }
      codexScanP = codexScan()
        .then((s) => {
          codexSnap = s
          codexSnapAt = Date.now()
          // This pass did not finish (budget exhausted) → schedule a catch-up scan later and fill statistics gradually instead of monopolizing the event loop
          if (s && s.ok && s.deferred > 0) codexBackgroundRefresh(5000)
        })
        .catch((err) => {
          codexSnap = { ok: false, error: String((err && err.message) || err) }
          codexSnapAt = Date.now()
        })
        .finally(() => { codexScanP = null })
      return codexScanP
    }
    function codexSummaryCached() {
      const now = Date.now()
      if (!codexSnap || now - codexSnapAt > CODEX_SNAP_TTL) codexBackgroundRefresh(0)
      return codexSnap
    }
    async function codexSummaryEnsured(maxWaitMs) {
      const stale = !codexSnap || Date.now() - codexSnapAt > CODEX_SNAP_TTL
      const p = codexScanP || (stale ? codexBackgroundRefresh(0) : null)
      if (!p) return codexSnap
      try { await Promise.race([p, new Promise((r) => setTimeout(r, Math.max(200, maxWaitMs || 2500)))]) } catch (err) {}
      return codexSnap
    }
    // Background warm-up: warm once after startup, then refresh cache every 5 minutes (now async + budgeted, no longer blocking).
    let codexPrewarmT = null, codexPrewarmI = null
    try {
      codexPrewarmT = setTimeout(function () { try { codexBackgroundRefresh(0) } catch (err) {} }, 1500)
      codexPrewarmI = setInterval(function () { try { codexBackgroundRefresh(0) } catch (err) {} }, 5 * 60 * 1000)
      // issue #109: these two timers previously had no stored handles and were not in disposers; after the plugin tree was disposed,
      // a referenced interval remained in the event loop → the process would not exit when the user quit dsh (required Ctrl+C).
      // Store handles and add them to disposers so unload clears them; unref is a fallback (during normal operation, the HTTP server keeps the event loop alive).
      try { if (codexPrewarmT && codexPrewarmT.unref) codexPrewarmT.unref() } catch (err) {}
      try { if (codexPrewarmI && codexPrewarmI.unref) codexPrewarmI.unref() } catch (err) {}
      disposers.push(function () {
        if (codexPrewarmT !== null) { clearTimeout(codexPrewarmT); codexPrewarmT = null }
        if (codexPrewarmI !== null) { clearInterval(codexPrewarmI); codexPrewarmI = null }
        if (codexCatchupT !== null) { clearTimeout(codexCatchupT); codexCatchupT = null }
      })
    } catch (err) {}
    // ===== Custom API model registry (v655) =====
    // File: $DSH_HOME/.dshw-api.json → { version, models:[…], usage:{ [id]:{day,dayStart,lastBalance,delta,eventCost} } }
    // Keys are not stored in this file: write them to official DSH credentials (ctx.credentials.set), read them via credentials.resolve(keyRef).
    function defaultApiRegistry() { return { version: 1, models: [], usage: {} } }
    function readApiRegistry() {
      for (const p of API_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && Array.isArray(parsed.models)) {
            if (!parsed.usage || typeof parsed.usage !== 'object') parsed.usage = {}
            return parsed
          }
        } catch (err) {}
      }
      return defaultApiRegistry()
    }
    function writeApiRegistry(reg) {
      const body = JSON.stringify(reg, null, 2)
      for (const p of API_FILE_CANDIDATES) {
        try { fs.writeFileSync(p, body, 'utf8'); return true } catch (err) {}
      }
      return false
    }
    function apiTemplateOf(provider) {
      return API_TEMPLATES[String(provider || '')] || null
    }
    // Built-in DeepSeek always exists (not stored in the registry file); all other models come from the registry
    function apiBuiltinModel() {
      const t = API_TEMPLATES.deepseek
      return { id: API_BUILTIN_ID, name: t.name, provider: 'deepseek', currency: t.currency, keyRef: t.keyRef, builtin: true, matchIds: ['deepseek'] }
    }
    function apiAllModels() {
      const custom = readApiRegistry().models.filter((m) => m && m.id && m.id !== API_BUILTIN_ID)
      return [apiBuiltinModel()].concat(custom)
    }
    function apiModelById(id) {
      if (String(id || '') === API_BUILTIN_ID) return apiBuiltinModel()
      return readApiRegistry().models.find((m) => m && m.id === id) || null
    }
    // JSON value extraction: supports a.b[0].c
    function pickJsonPath(obj, pathStr) {
      try {
        const parts = String(pathStr || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter((x) => x.length > 0)
        let cur = obj
        for (const p of parts) {
          if (cur === null || cur === undefined) return undefined
          cur = cur[p]
        }
        return cur
      } catch (err) { return undefined }
    }
    function apiNum(v, scale) {
      const n = Number(v)
      if (!isFinite(n)) return null
      const s = isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1
      return n * s
    }
    // v724 non-empty merge: empty string / undefined / null in over **do not override** base.
    // Why: when a new model is created, unfilled form fields are stored as empty strings; with direct Object.assign,
    // empty strings would overwrite template endpoint addresses / field paths, making balance queries fail forever (“balance API URL not configured”).
    function mergeNonEmpty(base, over) {
      const out = Object.assign({}, base || {})
      const o = over && typeof over === 'object' ? over : {}
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (v === undefined || v === null || v === '') continue
        if (v && typeof v === 'object' && !Array.isArray(v)) { out[k] = mergeNonEmpty(out[k], v); continue }
        out[k] = v
      }
      return out
    }
    // v724 recursive empty-field removal: used when writing the registry. Unfilled fields are omitted entirely → template defaults keep working (with mergeNonEmpty)
    function stripEmptyDeep(o) {
      if (Array.isArray(o)) return o
      if (!o || typeof o !== 'object') return o
      const out = {}
      for (const k of Object.keys(o)) {
        const v = stripEmptyDeep(o[k])
        if (v === undefined || v === null || v === '') continue
        if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue
        out[k] = v
      }
      return out
    }
    // PR #104 (narrowed): allow only http/https and block cloud-provider metadata plus link-local addresses.
    // Key tradeoff: **do not block loopback or private networks** — our built-in Ollama template explicitly recommends
    // http://127.0.0.1:11434/v1 (local Ollama / LM Studio), and self-hosted gateways (New API-style,
    // see issue #53) also run locally; blocking them would break legitimate usage. Endpoint addresses are entered by the user in the panel/
    // registry, and every /dsh-whale/* route is behind the trust fence — what we truly need to block is
    // “being tricked into reading cloud metadata and carrying credentials out”, not “accessing local services”.
    // Decimal / octal / hex IPv4 forms are normalized by WHATWG URL into dotted decimal, so checks use only the normalized result.
    function assertSafeApiUrl(u) {
      let parsed
      try { parsed = new URL(u) } catch { throw new Error('Invalid API endpoint address') }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Unsupported protocol: ' + parsed.protocol)
      const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
      if (host === 'metadata.google.internal' || host === 'metadata.goog' || host === '100.100.100.200') throw new Error('Access to cloud metadata addresses is forbidden')
      const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
      if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])]
        if (a === 169 && b === 254) throw new Error('Access to link-local addresses is forbidden')
        if (a === 0) throw new Error('Access to this address is forbidden')
      }
      if (/^fe[89ab][0-9a-f]:/i.test(host)) throw new Error('Access to link-local addresses is forbidden')
      // v761 (security fix S1): URLs may not contain userinfo (`https://user:pass@host/`) —
      // it is another way to embed credentials in the URL and can also expose them in logs/errors
      if (parsed.username || parsed.password) throw new Error('API endpoint address may not contain a username/password')
    }
    // —— v761 (security fix S1): **credential destination allowlist** ——
    // Rule: credentials may be attached only when the target origin is **exactly equal to an endpoint hard-coded in that provider's built-in template**;
    // all other addresses (user-defined URLs and addresses expanded from `{base}`) require `model.allowCustomHost === true`
    // — and that flag **can only be set by a write request originating locally (loopback)** (see writeRejection),
    // so a remote session cannot obtain credentials even if it modifies configuration.
    // Note: template URLs containing `{base}` are **not trusted** (base is user-controlled) and are always treated as custom addresses.
    function originOfUrl(u) {
      try {
        const p = new URL(String(u))
        if (p.protocol !== 'http:' && p.protocol !== 'https:') return ''
        return p.origin.toLowerCase()
      } catch (err) { return '' }
    }
    function templateOrigins(tpl) {
      const out = new Set()
      const add = (u) => {
        const s = String(u == null ? '' : u)
        if (!s || s.indexOf('{base}') >= 0) return
        const o = originOfUrl(s.replace('{key}', 'placeholder'))
        if (o) out.add(o)
      }
      add(tpl && tpl.probeUrl)
      add(tpl && tpl.balance && tpl.balance.url)
      add(tpl && tpl.balance && tpl.balance.usage && tpl.balance.usage.url)
      add(tpl && tpl.quota && tpl.quota.url)
      return out
    }
    function credentialMayGoTo(model, tpl, url) {
      const o = originOfUrl(url)
      if (!o) return false
      if (templateOrigins(tpl).has(o)) return true
      return !!(model && model.allowCustomHost === true)
    }
    function warnCredDestinationOnce(url) {
      try {
        const o = originOfUrl(url) || '(invalid address)'
        if (!warnCredDestinationOnce.seen) warnCredDestinationOnce.seen = new Set()
        if (warnCredDestinationOnce.seen.has(o)) return
        warnCredDestinationOnce.seen.add(o)
        console.warn('[whale-balance] Refused to send credentials to a non-built-in endpoint: ' + o
          + ' (If this is your own self-hosted gateway, open the plugin panel **locally** and enable “Allow credentials to be sent to custom addresses” for this model.)')
      } catch (err) {}
    }
    // Resolve credential + validate destination: every request that sends credentials must go through this function
    async function keyForDestination(model, tpl, url) {
      let key = ''
      try {
        const cred = await ctx.credentials.resolve(model.keyRef || tpl.keyRef || '')
        key = cred && cred.value ? String(cred.value) : ''
      } catch (err) { key = '' }
      if (!key) return { key: '', code: 'NO_KEY', error: 'Not configured: ' + (model.keyRef || tpl.keyRef || 'API key') }
      if (!credentialMayGoTo(model, tpl, url)) {
        warnCredDestinationOnce(url)
        return {
          key: '', code: 'DEST_NOT_ALLOWED',
          error: 'This address is not a built-in endpoint for ' + String((tpl && tpl.name) || model.provider || 'this provider') + ', '
            + 'so credentials were not sent. If this is your own self-hosted gateway, open the plugin panel **locally**, '
            + 'enable “Allow credentials to be sent to custom addresses” for this model, then retry.',
        }
      }
      return { key, code: '', error: '' }
    }
    async function apiFetchJson(url, auth, key) {
      const headers = {}
      const a = String(auth == null ? 'Bearer {key}' : auth)
      if (a) headers.Authorization = a.replace('{key}', key)
      // v724: URLs also support {key} (e.g. Gemini's ?key=… form; when auth is empty, no Authorization header is sent)
      const u = String(url).replace('{key}', key)
      assertSafeApiUrl(u)
      const res = await fetch(u, { headers, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return await res.json()
    }
    // Connectivity test: prefer the template's probeUrl (e.g. Ark /api/v3/models); otherwise use the balance endpoint/Base URL
    // Extract “business-layer errors” from the response body: some APIs (e.g. Zhipu quota) return HTTP 200 even for an invalid key,
    // while the actual error is in body code/msg (for example “current user does not have a coding plan”), so it must be surfaced
    function apiBusinessError(data) {
      if (!data || typeof data !== 'object') return ''
      if (data.success === false || data.ok === false) {
        return String(data.msg || data.message || data.error || 'success=false').slice(0, 120)
      }
      const code = Number(data.code)
      if (isFinite(code) && code !== 0 && code !== 200 && data.msg) return String(data.msg).slice(0, 120)
      if (typeof data.error === 'string' && data.error) return data.error.slice(0, 120)
      if (data.error && typeof data.error === 'object' && data.error.message) return String(data.error.message).slice(0, 120)
      return ''
    }
    async function apiProbeModel(model) {
      if (!model) return { ok: false, error: 'Model does not exist' }
      const tpl = apiTemplateOf(model.provider) || {}
      if (model.id === API_BUILTIN_ID) {
        const r = await fetchBalance()
        return r.ok ? { ok: true, detail: 'Balance ' + r.totalBalance + ' ' + (r.currency || 'CNY') } : { ok: false, error: r.error || r.code }
      }
      // Codex mode: local-session statistics are the “connectivity test result”; no network access or key is required
      if (tpl.kind === 'codex') {
        const cs = await codexSummaryEnsured(2500)
        const f = (n) => (n >= 100000000 ? (n / 100000000).toFixed(2) + '×100M' : (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '×10K' : String(Math.round(Number(n) || 0))))
        if (cs && cs.ok) {
          return { ok: true, detail: 'Codex local sessions: today ' + f(cs.todayTokens) + ' · this month ' + f(cs.monthTokens) + ' · total ' + f(cs.totalTokens) + ' tokens (' + cs.sessions + ' session files)' }
        }
        return { ok: false, error: (cs && cs.error) || 'Codex session directory not found' }
      }
      const b = mergeNonEmpty(tpl.balance, model.balance) // v724: empty model-side strings no longer override template values
      const base = String(model.baseUrl || '').replace(/\/+$/, '')
      const url = String(tpl.probeUrl || b.url || (base ? base + '/v1/models' : '')).replace('{base}', base)
      if (!url) return { ok: false, error: 'No endpoint available for testing (enter a balance endpoint or Base URL)' }
      // v761 (security fix S1): attach credentials only when the destination is trusted
      const k = await keyForDestination(model, tpl, url)
      if (!k.key) return { ok: false, code: k.code, error: k.error }
      const key = k.key
      try {
        const data = await apiFetchJson(url, b.auth, key)
        const bizErr = apiBusinessError(data)
        if (bizErr) return { ok: false, error: 'Test failed: ' + bizErr }
        let detail = 'HTTP 200'
        if (data && Array.isArray(data.data)) detail = 'Available models: ' + data.data.length
        else if (data && data.data && Array.isArray(data.data.models)) detail = 'Available models: ' + data.data.models.length
        return { ok: true, detail: detail }
      } catch (err) {
        return { ok: false, error: 'Test failed: ' + String((err && err.message) || err).slice(0, 140) }
      }
    }
    // Subscription quota (Coding Plan) parsing: provider fields differ; normalize to “used % + reset time + tier”
    //   zhipu:    data.limits[0].TOKENS_LIMIT.percentage (used %) + nextResetTime
    //   kimi:     usage.remaining / usage.limit (remaining / total)
    //   minimax:  model_remains[0].current_interval_remaining_percent (remaining %) + end_time(ms)
    async function fetchModelQuota(model) {
      if (!model) return { ok: false, error: 'Model does not exist' }
      const tpl = apiTemplateOf(model.provider) || {}
      const q = tpl.quota
      if (!q || !q.url) return { ok: false, code: 'NO_QUOTA', error: 'This provider has no subscription-quota API' }
      const base = String(model.baseUrl || '').replace(/\/+$/, '')
      const url = String(q.url).replace('{base}', base)
      // v761 (security fix S1): although the quota URL comes from a template, `{base}` may be rewritten by user fields, so the destination must still be validated
      const k = await keyForDestination(model, tpl, url)
      if (!k.key) return { ok: false, code: k.code, error: k.error }
      const key = k.key
      try {
        const data = await apiFetchJson(url, q.auth, key)
        const bizErr = apiBusinessError(data)
        if (bizErr) return { ok: false, code: 'BIZ', error: bizErr }
        const j = q.json || {}
        const num = (v) => { const n = Number(v); return isFinite(n) ? n : null }
        let usedPct = null, remainPct = null, resetAt = null, level = '', weeklyUsedPct = null
        if (j.percent) { const p = num(pickJsonPath(data, j.percent)); if (p !== null) usedPct = p }
        if (j.remainPct) {
          const p = num(pickJsonPath(data, j.remainPct))
          if (p !== null) { remainPct = p; if (usedPct === null) usedPct = Math.max(0, 100 - p) }
        }
        if (j.weeklyRemainPct) {
          const p = num(pickJsonPath(data, j.weeklyRemainPct))
          if (p !== null) weeklyUsedPct = Math.max(0, 100 - p)
        }
        if (j.remain && j.total) {
          const r0 = num(pickJsonPath(data, j.remain))
          const t0 = num(pickJsonPath(data, j.total))
          if (r0 !== null && t0) {
            remainPct = Math.max(0, Math.min(100, r0 / t0 * 100))
            usedPct = Math.max(0, 100 - remainPct)
          }
        }
        if (j.resetAt) resetAt = pickJsonPath(data, j.resetAt)
        if (j.resetAtMs) { const ms = num(pickJsonPath(data, j.resetAtMs)); if (ms !== null) resetAt = ms }
        if (j.level) level = String(pickJsonPath(data, j.level) || '')
        // v0.3.1: multi-window quota — some subscription-quota APIs return multiple windows in one response (e.g. OpenCode Go's
        // rolling / weekly / monthly), each with its own “used % + reset time”. Templates describe them via
        // json.windows: [{ key, label, percent, resetAt }]; normalize them here into a windows array,
        // and copy the first window back into primary usedPct / resetAt to preserve compatibility with the existing single-window path.
        let windows = null
        if (Array.isArray(j.windows)) {
          const list = []
          for (const w of j.windows) {
            if (!w) continue
            let wp = w.percent ? num(pickJsonPath(data, w.percent)) : null
            if (wp !== null) wp = Math.max(0, Math.min(100, wp))
            let wr = null
            if (w.resetAt) {
              const rv = pickJsonPath(data, w.resetAt)
              if (rv !== undefined && rv !== null && rv !== '') wr = rv
            }
            if (wp === null && wr === null) continue
            list.push({ key: String(w.key || ''), label: String(w.label || ''), usedPct: wp, resetAt: wr })
          }
          if (list.length) windows = list
        }
        if (windows) {
          const w0 = windows[0]
          if (usedPct === null && w0.usedPct !== null) usedPct = w0.usedPct
          if (!resetAt && w0.resetAt !== null) resetAt = w0.resetAt
          if (weeklyUsedPct === null) {
            for (const w of windows) {
              if ((w.key === 'weekly' || w.label === 'Week' || w.label === '\u5468') && w.usedPct !== null) { weeklyUsedPct = w.usedPct; break }
            }
          }
        }
        if (usedPct === null && remainPct === null && !resetAt && !windows) {
          return { ok: false, code: 'PARSE', error: 'Quota API response could not be parsed (field path mismatch)' }
        }
        return { ok: true, usedPct, remainPct, resetAt, level, weeklyUsedPct, windows }
      } catch (err) {
        return { ok: false, code: 'HTTP', error: 'Quota API request failed: ' + String((err && err.message) || err).slice(0, 140) }
      }
    }
    // Provider reports “account does not have this subscription plan” (e.g. Zhipu's “current user does not have a coding plan”):
    // this row is meaningless for users without a subscription, so mark hide to keep it out of the UI (real network/key errors are not hidden)
    function apiPlanNoPlan(msg) {
      const s = String(msg || '').toLowerCase()
      if (!s) return false
      return s.indexOf('coding plan') >= 0 || s.indexOf('\u4e0d\u5b58\u5728') >= 0 || s.indexOf('\u672a\u8ba2\u9605') >= 0 ||
        s.indexOf('not subscribed') >= 0 || s.indexOf('no plan') >= 0 || s.indexOf('no active') >= 0 ||
        s.indexOf('subscription') >= 0
    }
    // Fetch a model's balance: built-in DeepSeek reuses the existing official path; all others request and parse according to template/custom configuration
    async function fetchModelBalance(model) {
      if (!model) return { ok: false, code: 'NO_MODEL', error: 'Model does not exist' }
      if (model.id === API_BUILTIN_ID) {
        const r = await fetchBalance()
        if (!r.ok) return r
        return { ok: true, remaining: Number(r.totalBalance), currency: r.currency || 'CNY' }
      }
      const tpl = apiTemplateOf(model.provider) || {}
      const b = mergeNonEmpty(tpl.balance, model.balance) // v724: empty model-side strings no longer override template values
      if (!b.url) return { ok: false, code: 'NO_URL', error: 'Balance API URL is not configured' }
      const base = String(model.baseUrl || '').replace(/\/+$/, '')
      const url = String(b.url).replace('{base}', base)
      // v761 (security fix S1): attach credentials only for trusted destinations (provider built-in endpoint / locally approved custom address)
      const k = await keyForDestination(model, tpl, url)
      if (!k.key) return { ok: false, code: k.code, error: k.error }
      const key = k.key
      try {
        const data = await apiFetchJson(url, b.auth, key)
        const j = b.json || {}
        let remaining = null
        let total = null
        let used = 0
        if (j.remaining) { const v = apiNum(pickJsonPath(data, j.remaining), j.scale); if (v !== null) remaining = v }
        if (j.total) { const v = apiNum(pickJsonPath(data, j.total), j.scale); if (v !== null) total = v }
        if (j.used) { const v = apiNum(pickJsonPath(data, j.used), j.scale); if (v !== null) used += v }
        if (b.usage && b.usage.url) {
          const u = b.usage
          // v761 (security fix S1): usage is an optional enhancement — skip it when the destination is untrusted; never send credentials there
          const usageUrl = String(u.url).replace('{base}', base)
          if (credentialMayGoTo(model, tpl, usageUrl)) {
          const d2 = await apiFetchJson(usageUrl, u.auth || b.auth, key)
          const j2 = u.json || {}
          if (j2.used) { const v = apiNum(pickJsonPath(d2, j2.used), j2.scale); if (v !== null) used += v }
          } else { warnCredDestinationOnce(usageUrl) }
        }
        if (remaining === null && total !== null) remaining = total - used
        if (remaining === null) return { ok: false, code: 'SHAPE', error: 'Configured field was not found in the API response (check the JSON path)' }
        return { ok: true, remaining, total, used, currency: model.currency || tpl.currency || 'CNY' }
      } catch (err) {
        return { ok: false, code: 'HTTP', error: 'Balance API request failed: ' + String((err && err.message) || err).slice(0, 160) }
      }
    }
    // Per-model record skeleton: on day rollover reset only “daily” fields; cumulative totals (tokensTotal/tokensMonth) are retained
    function apiUsageNewDay(cur, day, dayKey) {
      const prev = cur && typeof cur === 'object' ? cur : {}
      const mk = String(dayKey || '').slice(0, 7)
      return {
        day: day, dayStart: null, lastBalance: null, delta: 0, eventCost: 0, eventTokens: 0, currency: '',
        tokensTotal: Number(prev.tokensTotal) || 0,
        month: mk,
        tokensMonth: prev.month === mk ? (Number(prev.tokensMonth) || 0) : 0,
      }
    }
    // Per-model balance-delta accounting (same definition as the DeepSeek ledger: first observation of the day is baseline, then accumulate decreases)
    function apiRecordBalance(id, remaining) {
      try {
        const reg = readApiRegistry()
        reg.usage = reg.usage && typeof reg.usage === 'object' ? reg.usage : {}
        const day = todayKey()
        let cur = reg.usage[id]
        if (!cur || cur.day !== day) cur = apiUsageNewDay(cur, day, todayKey())
        if (typeof remaining === 'number' && isFinite(remaining)) {
          if (cur.dayStart === null || cur.dayStart === undefined) cur.dayStart = remaining
          if (typeof cur.lastBalance === 'number' && remaining < cur.lastBalance) cur.delta = addMoney(cur.delta, cur.lastBalance - remaining)
          cur.lastBalance = remaining
        }
        reg.usage[id] = cur
        writeApiRegistry(reg)
        return cur
      } catch (err) { return null }
    }
    // Today's usage may come from “balance delta” (provider currency) or “session-event cost” (already converted to CNY using custom unit prices).
    // These sources can use different currencies → the return value must include currency; front-end rendering and threshold comparison both use it,
    // otherwise a model priced in USD could render a CNY amount as $, or compare values expressed in different units directly.
    function apiTodayUsage(id, modelCurrency) {
      const mcur = String(modelCurrency || 'CNY').toUpperCase() || 'CNY'
      try {
        const reg = readApiRegistry()
        const cur = reg.usage && reg.usage[id]
        if (!cur || cur.day !== todayKey()) return { amount: 0, source: 'none', currency: mcur }
        if (typeof cur.lastBalance === 'number' && isFinite(cur.lastBalance)) return { amount: preciseMoney(cur.delta || 0), source: 'balance', currency: mcur }
        return { amount: preciseMoney(Number(cur.eventCost) || 0), source: 'events', currency: 'CNY' }
      } catch (err) { return { amount: 0, source: 'none', currency: mcur } }
    }
    function apiUsageRaw(id) {
      try {
        const reg = readApiRegistry()
        return (reg.usage && reg.usage[id]) || null
      } catch (err) { return null }
    }
    // Quota “used”: auto mode uses session-token accounting (no reset = cumulative - baseline, daily = today, monthly = this month)
    function apiQuotaAutoUsed(id, q) {
      const u = apiUsageRaw(id) || {}
      const reset = (q && q.reset) || 'none'
      // When the unit is “Amount (CNY)”, automatic counting is meaningless: the automatic counter stores tokens, not money.
      // Fall back directly to the manual value (q.used) so token counts are not displayed as currency; the UI also restricts this mode to manual input.
      if (q && q.unit === 'money' && (q.mode === 'auto' || q.mode === 'codex')) {
        return Math.round(Number(q.used) || 0)
      }
      // Codex mode: used = Codex local-session tokens (select today / this month / cumulative according to reset mode)
      if (q && q.mode === 'codex') {
        const cs = codexSummaryCached()
        const base = Number(q.used) || 0
        if (!cs || !cs.ok) return base
        if (reset === 'daily') return Math.round(Number(cs.todayTokens) || 0)
        if (reset === 'monthly') return Math.round(Number(cs.monthTokens) || 0)
        const baseAt = Number(q.baseAt) || 0
        return Math.round(base + Math.max(0, (Number(cs.totalTokens) || 0) - baseAt))
      }
      if (reset === 'daily') return Math.round(Number(u.eventTokens) || 0)
      if (reset === 'monthly') return Math.round(Number(u.tokensMonth) || 0)
      const total = Number(u.tokensTotal) || 0
      const baseAt = Number(q && q.baseAt) || 0
      // In auto mode, used means “starting used amount” (usage that already occurred before installation)
      return Math.round((Number(q && q.used) || 0) + Math.max(0, total - baseAt))
    }
    // Session-event attribution: accumulate a model's token cost into registry models matched by matchIds substring
    function apiAttributeEvent(modelName, cost, tokens) {
      try {
        const name = String(modelName || '').toLowerCase()
        if (!name) return false
        const reg = readApiRegistry()
        let hit = null
        for (const m of reg.models) {
          if (!m || !m.id) continue
          const ids = Array.isArray(m.matchIds) && m.matchIds.length ? m.matchIds : [m.name, m.id]
          for (const s of ids) {
            const k = String(s || '').toLowerCase().trim()
            if (k && name.indexOf(k) >= 0) { hit = m; break }
          }
          if (hit) break
        }
        if (!hit) return false
        reg.usage = reg.usage && typeof reg.usage === 'object' ? reg.usage : {}
        const day = todayKey()
        let cur = reg.usage[hit.id]
        if (!cur || cur.day !== day) cur = apiUsageNewDay(cur, day, todayKey())
        cur.eventCost = addMoney(Number(cur.eventCost) || 0, Number(cost) || 0)
        cur.eventTokens = (Number(cur.eventTokens) || 0) + (Number(tokens) || 0)
        // Cumulative totals: quota (resource pack/subscription) uses these for “used”; they are not reset at day boundaries
        const tk = Number(tokens) || 0
        cur.tokensTotal = (Number(cur.tokensTotal) || 0) + tk
        const mk = todayKey().slice(0, 7)
        if (cur.month !== mk) { cur.month = mk; cur.tokensMonth = 0 }
        cur.tokensMonth = (Number(cur.tokensMonth) || 0) + tk
        reg.usage[hit.id] = cur
        writeApiRegistry(reg)
        return true
      } catch (err) { return false }
    }
    // Delete model: registry + per-model settings + all bubble modules that reference the model (including parallel A/B and module library)
    function apiDeleteModel(id) {
      const mid = String(id || '')
      if (!mid || mid === API_BUILTIN_ID) return { ok: false, error: 'Built-in model cannot be deleted' }
      const reg = readApiRegistry()
      reg.models = reg.models.filter((m) => !(m && m.id === mid))
      if (reg.usage) delete reg.usage[mid]
      writeApiRegistry(reg)
      // Deleting a model also invalidates the unit-price cache (it may contain custom pricing)
      customPriceAt = 0
      let removed = 0
      try {
        const led = readUsageLedger()
        if (led.settings && led.settings.models && led.settings.models[mid]) {
          delete led.settings.models[mid]
          writeUsageLedger(led)
        }
      } catch (err) {}
      try {
        const cfg = loadBubbleConfig()
        let changed = false
        const stripItem = (obj) => {
          if (!obj || typeof obj !== 'object') return
          if (Array.isArray(obj.modules)) {
            const before = obj.modules.length
            obj.modules = obj.modules.filter((m) => !(m && m.modelId === mid))
            removed += before - obj.modules.length
            if (obj.modules.length !== before) changed = true
          }
          if (Array.isArray(obj.options)) {
            for (const o of obj.options) if (o && o.item) stripItem(o.item)
          }
        }
        // Bubble steps (including parallel A/B)
        if (Array.isArray(cfg.items)) for (const it of cfg.items) stripItem(it)
        // Module-library entries have the form {id,name,module}
        if (Array.isArray(cfg.lib)) {
          for (let i = cfg.lib.length - 1; i >= 0; i--) {
            const lb = cfg.lib[i]
            if (lb && lb.module && lb.module.modelId === mid) { cfg.lib.splice(i, 1); changed = true; removed++; continue }
            if (lb && lb.module) stripItem(lb.module)
          }
        }
        if (changed) writeBubbleConfig(cfg)
      } catch (err) {}
      // v748: the deleted model may have been the last Codex model → immediately recalculate whether “local statistics” are enabled (including clearing the 2s switch cache)
      try { codexInvalidate() } catch (err) {}
      return { ok: true, removedModules: removed }
    }
    // Add/update model; if keyValue is provided, write it to official DSH credentials
    // Refresh custom unit-price table: map each custom API model's matchIds → price table for module-level priceFor use
    // (priceFor is module-scoped and cannot read the plugin registry, so results are copied into CUSTOM_PRICES here)
    let customPriceAt = 0
    function refreshCustomPrices() {
      const now = Date.now()
      if (now - customPriceAt < 10000) return
      customPriceAt = now
      try {
        const map = {}
        const metaMap = {}
        for (const m of readApiRegistry().models) {
          // Skip built-in model (DeepSeek): it has its own peak/off-peak price table and must not be overridden by custom unit prices
          if (!m || m.id === API_BUILTIN_ID) continue
          const pr = m && m.price
          if (!pr) continue
          const hit = Number(pr.hit), miss = Number(pr.miss), out = Number(pr.out)
          const ok = (v) => (isFinite(v) ? v : 0)
          if (!isFinite(hit) && !isFinite(miss) && !isFinite(out)) continue
          const table = { hit: [ok(hit), ok(hit)], miss: [ok(miss), ok(miss)], out: [ok(out), ok(out)] }
          const meta = { cur: String(pr.cur || 'CNY').toUpperCase(), rate: isFinite(Number(pr.rate)) ? Number(pr.rate) : 0 }
          const ids = Array.isArray(m.matchIds) && m.matchIds.length ? m.matchIds : [m.name, m.id]
          for (const s of ids) {
            const k = String(s || '').toLowerCase().trim()
            // Keywords that are too short (< 3 characters, e.g. pro/flash) easily match unrelated models, so ignore them
            if (k && k.length >= 3) { map[k] = table; metaMap[k] = meta }
          }
        }
        CUSTOM_PRICES = map
        CUSTOM_PRICE_META = metaMap
      } catch (err) {}
    }
    async function apiSaveModel(input) {
      const p = input || {}
      const tpl = apiTemplateOf(p.provider)
      if (!tpl) return { ok: false, error: 'Unknown provider template' }
      const name = String(p.name || '').trim().slice(0, 30) || tpl.name
      const keyRef = String(p.keyRef || tpl.keyRef || '').trim().slice(0, 64) || tpl.keyRef
      // v761 (security fix S1): credential-name allowlist — old implementation accepted arbitrary strings and could theoretically write to unrelated key names
      if (!/^[A-Za-z0-9_]{1,64}$/.test(keyRef)) return { ok: false, error: 'Credential name may contain only letters, digits, and underscores (≤64 characters)' }
      const id = p.id ? String(p.id) : ('api_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7))
      const reg = readApiRegistry()
      let model = reg.models.find((m) => m && m.id === id)
      if (!model) {
        model = { id, createdAt: Date.now() }
        reg.models.push(model)
      }
      model.name = name
      model.provider = p.provider
      model.currency = String(p.currency || tpl.currency || 'CNY').toUpperCase().slice(0, 8)
      model.keyRef = keyRef
      // v761 (security fix S1): **allow credentials to be sent to custom addresses** (needed for self-hosted gateways).
      // This flag is the sole exception to the “credential destination allowlist”, while all write requests are limited to **local sources** (see writeRejection),
      // so a remote session cannot open this exception for itself even if it can modify configuration. If omitted, leave the current value unchanged (partial front-end updates do not erase it).
      if (p.allowCustomHost === true) model.allowCustomHost = true
      else if (p.allowCustomHost === false) delete model.allowCustomHost
      if (p.baseUrl !== undefined) model.baseUrl = String(p.baseUrl || '').slice(0, 300)
      if (p.balance && typeof p.balance === 'object') {
        // v724: empty fields are not written (stripEmptyDeep) → template defaults continue to apply;
        // when everything is empty, delete model.balance entirely, which means “use the template completely”.
        const balIn = stripEmptyDeep({
          url: String(p.balance.url || '').slice(0, 500),
          auth: String(p.balance.auth || '').slice(0, 200),
          json: {
            remaining: String((p.balance.json && p.balance.json.remaining) || '').slice(0, 200),
            total: String((p.balance.json && p.balance.json.total) || '').slice(0, 200),
            used: String((p.balance.json && p.balance.json.used) || '').slice(0, 200),
            scale: isFinite(Number(p.balance.json && p.balance.json.scale)) ? Number(p.balance.json.scale) : undefined,
          },
        })
        if (balIn && Object.keys(balIn).length) model.balance = balIn
        else delete model.balance
        if (p.balance.usage && p.balance.usage.url) {
          model.balance = model.balance || {}
          model.balance.usage = stripEmptyDeep({
            url: String(p.balance.usage.url).slice(0, 500),
            auth: String(p.balance.usage.auth == null ? '' : p.balance.usage.auth).slice(0, 200),
            json: { used: String((p.balance.usage.json && p.balance.usage.json.used) || '').slice(0, 200), scale: isFinite(Number(p.balance.usage.json && p.balance.usage.json.scale)) ? Number(p.balance.usage.json.scale) : undefined },
          })
        }
      }
      // Session-event attribution: by default use “model name” and “id” as substring matches; users may add others
      // Custom unit price (currency/million tokens): cache hit / uncached input / output. Leave blank to use the built-in price table
      if (p.price && typeof p.price === 'object') {
        const num = (v) => {
          const s = String(v === undefined || v === null ? '' : v).trim()
          if (s === '') return undefined
          return isFinite(Number(s)) ? Number(s) : undefined
        }
        const pr = { hit: num(p.price.hit), miss: num(p.price.miss), out: num(p.price.out) }
        const cur0 = String(p.price.cur || '').trim().toUpperCase().slice(0, 8)
        const rate0 = num(p.price.rate)
        const anyPrice = pr.hit !== undefined || pr.miss !== undefined || pr.out !== undefined
        // Validation (why: without it, negative/huge values produce absurd costs; USD without exchange rate would silently be recorded as CNY)
        const inRange = (v, max) => v === undefined || (v >= 0 && v <= max)
        if (!inRange(pr.hit, 1000000) || !inRange(pr.miss, 1000000) || !inRange(pr.out, 1000000)) {
          return { ok: false, error: 'Unit price must be a number between 0 and 1000000 (unit: currency/million tokens)' }
        }
        if (rate0 !== undefined && !(rate0 > 0 && rate0 <= 1000)) {
          return { ok: false, error: 'Exchange rate must be a positive number between 0 and 1000 (CNY/USD)' }
        }
        if (anyPrice && cur0 === 'USD' && !(rate0 > 0)) {
          return { ok: false, error: 'An exchange rate (CNY/USD) is required when the unit-price currency is USD' }
        }
        if (cur0) pr.cur = cur0
        if (rate0 !== undefined) pr.rate = rate0
        if (pr.hit === undefined && pr.miss === undefined && pr.out === undefined) delete model.price
        else model.price = pr
      } else if (p.price === null) {
        delete model.price
      }
      writeApiRegistry(reg)
      // Immediately invalidate cache after unit-price changes; otherwise refreshCustomPrices's 10-second throttle can delay new prices for up to 10 seconds
      customPriceAt = 0
      // v748: adding/editing a model can change “whether a Codex model exists”; recalculate the Codex-statistics switch and snapshot immediately
      try { codexInvalidate() } catch (err) {}
      let keySaved = false
      if (p.keyValue !== undefined && String(p.keyValue).length) {
        try {
          await ctx.credentials.set(keyRef, String(p.keyValue))
          keySaved = true
        } catch (err) {}
      }
      return { ok: true, id, keySaved }
    }
    // List (including live balance and per-model warning/budget): fetch balances concurrently; failure affects only that item
    async function apiModelsPayload() {
      const models = apiAllModels()
      const settings = readUsageSettings()
      const out = []
      let codexStats = null // Codex local-session statistics (machine-wide; shared by multiple Codex models, calculate once)
      for (const m of models) {
        let entry = {
          id: m.id, name: m.name, provider: m.provider, currency: m.currency,
          keyRef: m.keyRef, builtin: !!m.builtin, baseUrl: m.baseUrl || '',
          // v761 (security fix S1): this model's current destination cannot receive credentials (not a provider built-in endpoint and not locally approved),
          // so the front end can tell the user “confirm this in the local panel” instead of leaving the balance mysteriously empty.
          needsHostConfirm: (() => {
            try {
              const tpl2 = apiTemplateOf(m.provider) || {}
              const b2 = mergeNonEmpty(tpl2.balance, m.balance) || {}
              const base2 = String(m.baseUrl || "").replace(/\/+$/, "")
              const u2 = String(tpl2.probeUrl || b2.url || "").replace("{base}", base2)
              return !!u2 && !credentialMayGoTo(m, tpl2, u2)
            } catch (err) { return false }
          })(),
          canAdjustBalance: canAdjustBuiltinBalance(m),
          matchIds: m.matchIds || [], settings: settings.models && settings.models[m.id] ? settings.models[m.id] : null,
          price: m.price || null,
          // Manual quota (subscription/resource pack): total, unit, used, reset cycle; front end uses these to render the quota module
          quota: (settings.models && settings.models[m.id] && settings.models[m.id].quota)
            ? Object.assign({}, settings.models[m.id].quota) : null,
          balance: null, todayUsage: null, todayUsageCurrency: null, usageSource: 'none', error: null,
        }
        // In automatic mode, “used” is calculated by the host from session tokens (front end does not calculate it)
        if (entry.quota) {
          entry.quota.autoUsed = apiQuotaAutoUsed(m.id, entry.quota)
          entry.quota.autoToday = Math.round(Number((apiUsageRaw(m.id) || {}).eventTokens) || 0)
        }
        // Send the “endpoint description” (URL/headers/fields) separately so the front-end panel can populate its form;
        // entry.balance is a numeric value and cannot be used as the description (otherwise panel save would overwrite the description with empty values)
        const tplE = apiTemplateOf(m.provider) || {}
        entry.balanceDesc = mergeNonEmpty(tplE.balance, m.balance) // v724: empty strings do not override template values
        if (m.id === API_BUILTIN_ID) {
          entry.balanceMode = 'api'
          entry.hasBalanceApi = true
          try {
            const cred = await ctx.credentials.resolve(m.keyRef || 'DEEPSEEK_API_KEY')
            entry.hasKey = !!(cred && cred.value)
          } catch (err) {}
          try {
            const p = await getBalance()
            if (p && p.ok) {
              entry.balance = Number(p.totalBalance)
              const summary = daySummary(readUsageLedger(), todayKey())
              entry.currency = p.currency
              entry.todayUsage = summary.amount
              entry.todayUsageCurrency = summary.currency
              entry.usageSource = summary.source
              entry.usageLabel = summary.label
              entry.accounting = balanceSummary(readUsageLedger(), todayKey())
            } else if (p) entry.error = p.error || p.code || 'Failed to fetch balance'
          } catch (err) { entry.error = String((err && err.message) || err) }
        } else {
          let hasKey = false
          try {
            const cred = await ctx.credentials.resolve(m.keyRef || '')
            hasKey = !!(cred && cred.value)
          } catch (err) {}
          entry.hasKey = hasKey
          // Effective balance description for this model: template defaults + user overrides
          const tplM = apiTemplateOf(m.provider) || {}
          const balDesc = Object.assign({}, tplM.balance || {}, m.balance || {})
          const hasBalanceApi = !!String(balDesc.url || '').trim()
          entry.hasBalanceApi = hasBalanceApi
          entry.probeUrl = String(tplM.probeUrl || '')
          // Subscription quota (kind='quota' templates, e.g. Zhipu/Kimi/MiniMax Coding): the front end uses this to display the quota row and module
          entry.planSupport = !!tplM.quota
          // Codex mode: no balance query or key required; provide local-session statistics directly (today/this month/total/last 7 days)
          if (tplM.kind === 'codex') {
            // Waiting is safe here: the model-list request may briefly wait for an in-flight scan (up to 2.5s), but never triggers a synchronous scan
            if (!codexStats) codexStats = await codexSummaryEnsured(2500)
            entry.codex = codexStats
            entry.hasKey = true
            entry.error = codexStats && codexStats.ok ? null
              : (codexStats && codexStats.disabled ? null : ((codexStats && codexStats.error) || 'Codex session directory not found'))
          }
          // Providers without a balance API (e.g. Volcengine Ark): balance shows “—”; usage is estimated only from session events
          entry.balanceMode = hasBalanceApi ? 'api' : 'events'
          if (hasBalanceApi && hasKey) {
            const r = await fetchModelBalance(m)
            if (r && r.ok) {
              entry.balance = r.remaining
              if (r.currency) entry.currency = r.currency
              apiRecordBalance(m.id, r.remaining)
              const u = apiTodayUsage(m.id, entry.currency || m.currency)
              entry.todayUsage = u.amount
              entry.usageSource = u.source
              entry.todayUsageCurrency = u.currency
            } else if (r) {
              entry.error = r.error || r.code || 'Failed to fetch balance'
            }
          } else if (!hasBalanceApi) {
            entry.error = null // No balance API is not an error
          } else {
            entry.error = 'Not configured: ' + (m.keyRef || 'API key')
          }
          // Subscription quota: request only when a quota endpoint and key are available; failure affects only the plan field
          if (tplM.quota && hasKey) {
            try {
              entry.plan = await fetchModelQuota(m)
              if (entry.plan && !entry.plan.ok && apiPlanNoPlan(entry.plan.error)) entry.plan.hide = true
            } catch (err) { entry.plan = { ok: false, error: String((err && err.message) || err) } }
          }
          if (entry.todayUsage === null) {
            const u2 = apiTodayUsage(m.id, entry.currency || m.currency)
            entry.todayUsage = u2.amount
            entry.usageSource = u2.source
            entry.todayUsageCurrency = u2.currency
          }
        }
        out.push(entry)
      }
      return {
        ok: true,
        builtinId: API_BUILTIN_ID,
        // v724: also send template endpoint descriptions (Plan B: the front end fills these fields immediately after template selection)
        templates: Object.keys(API_TEMPLATES).map((k) => ({
          id: k, name: API_TEMPLATES[k].name, currency: API_TEMPLATES[k].currency,
          keyRef: API_TEMPLATES[k].keyRef, builtin: !!API_TEMPLATES[k].builtin,
          needsBaseUrl: !!API_TEMPLATES[k].needsBaseUrl,
          hasBalance: !!String((API_TEMPLATES[k].balance || {}).url || '').trim(),
          probeUrl: String(API_TEMPLATES[k].probeUrl || ''),
          kind: String(API_TEMPLATES[k].kind || 'balance'),
          balance: API_TEMPLATES[k].balance ? JSON.parse(JSON.stringify(API_TEMPLATES[k].balance)) : null,
          quota: API_TEMPLATES[k].quota ? JSON.parse(JSON.stringify(API_TEMPLATES[k].quota)) : null,
          matchIds: Array.isArray(API_TEMPLATES[k].matchIds) ? API_TEMPLATES[k].matchIds.slice(0, 12) : [],
          noBalanceApi: !!API_TEMPLATES[k].noBalanceApi,
          apiNote: String(API_TEMPLATES[k].apiNote || ''),
          sortKey: tplSortKey(API_TEMPLATES[k].name), // v726: dropdown sort key (used by the front end)
        })),
        models: out,
      }
    }

    // Each currency/key has its own timed observation window. An increase is
    // recorded separately and never subtracts previously observed consumption.
    function recordLedgerUsage(currentBalance, currency, scope, at) {
      const led = readUsageLedger()
      observeBalance(led, { balance: currentBalance, currency, scope, at })
      pruneLedgerUsage(led)
      if (!writeUsageLedger(led)) throw new Error('Failed to save ledger; check write permissions for the DSH data directory')
      return led
    }
    function normalizeUsageMode() {
      return 'ledger' // Little Whale Accounting is the only accounting mode
    }
    function ledgerTodayTotal(led) { return daySummary(led, todayKey()).amount }

    function publicBalance(payload) {
      const { accountTag, ...visible } = payload
      const led = readUsageLedger()
      const summary = daySummary(led, todayKey())
      const nowSec = Math.floor(Date.now() / 1000)
      return {
        ...visible, version: '0.3.16', isPeak: isPeakTime(nowSec),
        // Peak/off-peak transition points and holiday list: the front-end countdown must use the same source as the host (otherwise statutory holidays produce the wrong transition)
        peakNextChangeAt: nextPeakChangeAt(nowSec),
        peakHolidays: HOLIDAY_VALLEY_LIST,
        todayUsage: summary.amount, todayUsageCurrency: summary.currency,
        usageSource: summary.source, usageLabel: summary.label, usageMode: 'ledger',
        accounting: balanceSummary(led, todayKey()),
      }
    }

    function getBalance(force = false) {
      const now = Date.now()
      if (!force && balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
        return Promise.resolve(publicBalance(balanceCache.payload))
      }
      if (balanceInFlight) return balanceInFlight
      balanceInFlight = fetchBalance()
        .then((payload) => {
          if (payload.ok) {
            // v759 (encountered by the reporter of issue #157): **“Unable to record accounting” must not swallow a balance that was already fetched**.
            // Previously, an exception from recordLedgerUsage was wrapped by the outermost .catch as “Balance service error: …”,
            // making the UI look as if the endpoint had failed even though the balance had already been fetched (an invalid accountTag/currency can cause this).
            // But distinguish this from **the entire ledger being unreadable**: that case must remain fail-closed (see the rethrow below)—
            // one case is “balance fetched, but accounting could not be recorded”; the other is “ledger is corrupt and even today’s usage cannot be calculated”,
            // and returning ok:true for the latter would make users think everything is fine even though the ledger is unusable.
            let ledgerError = ''
            try {
              recordLedgerUsage(payload.totalBalance, payload.currency, payload.accountTag, Date.parse(payload.updatedAt))
            } catch (err) {
              ledgerError = String((err && err.message) || err).slice(0, 160)
            }
            let visible
            try {
              visible = publicBalance(payload) // Read the ledger to calculate today’s usage / last 7 days
            } catch (err) {
              throw err // Ledger unreadable (corrupt structure, etc.) → let the outer .catch return ok:false while preserving the original records
            }
            balanceCache = { at: Date.now(), payload } // Cache first: the balance continues to display even if subsequent accounting fails
            return ledgerError ? { ...visible, ledgerError } : visible
          }
          if (payload.transient && balanceCache) {
            return { ...publicBalance(balanceCache.payload), stale: true, error: payload.error }
          }
          return publicBalance(payload)
        })
        .catch((err) => ({
          ok: false, code: 'ERROR',
          error: 'Balance service error: ' + String((err && err.message) || err).slice(0, 200),
        }))
        .finally(() => { balanceInFlight = null })
      return balanceInFlight
    }

    function readSizeConfig() {
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.scale === 'number') {
            return {
              scale: parsed.scale,
              sound: parsed.sound !== false,
              vol: typeof parsed.vol === 'number' ? parsed.vol : 0.9,
              soundSet: typeof parsed.soundSet === 'string' && parsed.soundSet ? parsed.soundSet : 'duck',
              usageMode: normalizeUsageMode(parsed.usageMode),
              peakMode: parsed.peakMode === 'liangwen' || parsed.peakMode === 'qiangqiang' ? parsed.peakMode : 'default',
              bubbleOn: parsed.bubbleOn !== false,
              turnCostOn: parsed.turnCostOn !== false,
              turnCostCloseMs: typeof parsed.turnCostCloseMs === 'number' ? parsed.turnCostCloseMs : 5000,
              scrollGapOn: parsed.scrollGapOn === true,
              scrollGapPx: typeof parsed.scrollGapPx === 'number' ? Math.round(parsed.scrollGapPx) : 17,
              menuBtnHide: parsed.menuBtnHide === true,
              // issue #116: Codex local statistics can be disabled in settings (enabled by default). When disabled, the host does not scan
              // ~/.codex/sessions at all, nor does it perform background prewarming.
              codexStatsOn: parsed.codexStatsOn !== false,
            }
          }
        } catch (err) {}
      }
      return null
    }

    function writeSizeConfig(scale, sound, vol, soundSet, usageMode, peakMode, bubbleOn, turnCostOn, turnCostCloseMs, scrollGapOn, scrollGapPx, menuBtnHide, codexStatsOnArg) {
      const um = normalizeUsageMode(usageMode)
      const pm = peakMode === 'liangwen' || peakMode === 'qiangqiang' ? peakMode : 'default'
      const bo = bubbleOn !== false
      const tco = turnCostOn !== false
      const tcc = typeof turnCostCloseMs === 'number' ? (turnCostCloseMs > 0 ? turnCostCloseMs : 0) : 5000
      const sgo = scrollGapOn === true
      const sgp = typeof scrollGapPx === 'number' && scrollGapPx > 0 ? Math.round(scrollGapPx) : 0
      const mbh = menuBtnHide === true
      const cso = codexStatsOnArg !== false
      const body = JSON.stringify({
        scale: scale,
        sound: sound !== false,
        vol: typeof vol === 'number' ? vol : 0.9,
        soundSet: typeof soundSet === 'string' && soundSet ? soundSet : 'duck',
        usageMode: um,
        peakMode: pm,
        bubbleOn: bo,
        turnCostOn: tco,
        turnCostCloseMs: tcc,
        scrollGapOn: sgo,
        scrollGapPx: sgp,
        menuBtnHide: mbh,
        codexStatsOn: cso,
        updatedAt: new Date().toISOString(),
      })
      let lastSizeErr = null
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return {
            ok: true,
            scale: scale,
            sound: sound !== false,
            vol: typeof vol === 'number' ? vol : 0.9,
            soundSet: typeof soundSet === 'string' && soundSet ? soundSet : 'duck',
            usageMode: um,
            peakMode: pm,
            bubbleOn: bo,
            turnCostOn: tco,
            turnCostCloseMs: tcc,
            scrollGapOn: sgo,
            scrollGapPx: sgp,
            menuBtnHide: mbh,
            codexStatsOn: cso,
          }
        } catch (err) { lastSizeErr = err }
      }
      // Suggested by the reporters of #88 / #97: expose the underlying cause (EPERM / EACCES / path issues…).
      // Previously, every candidate-path failure returned the same fixed message, so even front-end response inspection could not identify the cause.
      return { ok: false, error: 'Unable to persist widget size' + (lastSizeErr && lastSizeErr.message ? ': ' + lastSizeErr.message : '') }
    }

    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > 8192) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    function readBodyMax(req, maxBytes) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > maxBytes) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    // —— Custom character storage: whale-roles/ directory, one <id>.png per character + roles.json index ——
    function pickRoleDir() {
      for (const p of ROLE_DIR_CANDIDATES) {
        try {
          fs.mkdirSync(p, { recursive: true })
          fs.accessSync(p, fs.constants.W_OK)
          return p
        } catch (err) {}
      }
      return ROLE_DIR_CANDIDATES[0]
    }

    function defaultRolesIndex() {
      return {
        version: 1,
        roles: [
          // The default Little Whale starts pinned; pinnedAt=1 is the baseline, so any newly pinned item (Date.now()) sorts above it
          { id: ROLE_DEFAULT_ID, name: 'Little Whale', pinnedAt: 1, createdAt: 0 },
        ],
      }
    }

    function readRolesIndex() {
      const dir = pickRoleDir()
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, ROLE_INDEX_NAME), 'utf8'))
        if (parsed && Array.isArray(parsed.roles)) {
          if (!parsed.roles.some((r) => r && r.id === ROLE_DEFAULT_ID)) {
            parsed.roles.unshift(defaultRolesIndex().roles[0])
          }
          return parsed
        }
      } catch (err) {}
      return defaultRolesIndex()
    }

    function writeRolesIndex(index) {
      const dir = pickRoleDir()
      try {
        fs.writeFileSync(path.join(dir, ROLE_INDEX_NAME), JSON.stringify(index, null, 2), 'utf8')
        return true
      } catch (err) {
        return false
      }
    }

    // Sort: pinned items first (higher pinnedAt first, i.e. most recently pinned at the top); unpinned items by creation time descending
    function sortRoles(roles) {
      return roles.slice().sort((a, b) => {
        const ap = a.pinnedAt && a.pinnedAt > 0 ? a.pinnedAt : 0
        const bp = b.pinnedAt && b.pinnedAt > 0 ? b.pinnedAt : 0
        if (ap && bp) return bp - ap
        if (ap) return -1
        if (bp) return 1
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
    }

    function rolesPayload() {
      const index = readRolesIndex()
      return {
        ok: true,
        roles: sortRoles(index.roles).map((r) => ({
          id: r.id,
          name: String(r.name || r.id),
          url: r.id === ROLE_DEFAULT_ID ? '/dsh-whale/image.png' : '/dsh-whale/role-image.png?id=' + encodeURIComponent(r.id),
          pinned: !!(r.pinnedAt && r.pinnedAt > 0),
          pinnedAt: r.pinnedAt || null,
          createdAt: r.createdAt || null,
          // format: 'png' | 'gif' | 'apng' (legacy characters without a format field → png)
          format: r.format === 'gif' || r.format === 'apng' ? r.format : 'png',
        })),
      }
    }

    // Map character file extension by format: gif→.gif, apng/png→.png (APNG files still use a PNG container)
    function roleFileExt(format) {
      return format === 'gif' ? 'gif' : 'png'
    }

    function roleFilePath(id, format) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || id === ROLE_DEFAULT_ID) return null
      return path.join(pickRoleDir(), id + '.' + roleFileExt(format))
    }

    function roleImagePath(id) {
      // Look up character metadata to determine the extension; default to png if not found
      const { role } = roleIndexFind(id)
      const format = role && (role.format === 'gif' || role.format === 'apng') ? role.format : 'png'
      const p = roleFilePath(id, format)
      return p
    }

    function roleIdFromUrl(url) {
      try {
        const q = String(url || '').split('?')[1] || ''
        const m = /(?:^|&)id=([^&]+)/.exec(q)
        return m ? decodeURIComponent(m[1]) : ''
      } catch (err) { return '' }
    }

    function roleIndexFind(id) {
      const index = readRolesIndex()
      const role = index.roles.find((r) => r && r.id === id)
      return { index, role }
    }

    // —— Custom audio: whale-audio/ directory, clips as <id>.wav + audio.json index ——
    function pickAudioDir() {
      for (const p of AUDIO_DIR_CANDIDATES) {
        try {
          fs.mkdirSync(p, { recursive: true })
          fs.accessSync(p, fs.constants.W_OK)
          return p
        } catch (err) {}
      }
      return AUDIO_DIR_CANDIDATES[0]
    }

    function defaultAudioIndex() {
      return { version: 1, groups: [], fragments: [] }
    }

    function readAudioIndex() {
      const dir = pickAudioDir()
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, AUDIO_INDEX_NAME), 'utf8'))
        if (parsed && Array.isArray(parsed.groups) && Array.isArray(parsed.fragments)) {
          return parsed
        }
      } catch (err) {}
      return defaultAudioIndex()
    }

    function writeAudioIndex(index) {
      const dir = pickAudioDir()
      try {
        fs.writeFileSync(path.join(dir, AUDIO_INDEX_NAME), JSON.stringify(index, null, 2), 'utf8')
        return true
      } catch (err) {
        return false
      }
    }

    // Custom clip id -> file path; preset clips have no custom file
    function audioFragmentPath(id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
      if (PRESET_FRAGMENTS[id]) return null
      return path.join(pickAudioDir(), id + '.wav')
    }

    function audioIdFromUrl(url) {
      try {
        const q = String(url || '').split('?')[1] || ''
        const m = /(?:^|&)id=([^&]+)/.exec(q)
        return m ? decodeURIComponent(m[1]) : ''
      } catch (err) { return '' }
    }

    // Clip list: preset clips + user-defined clips
    function audioFragmentsPayload() {
      const index = readAudioIndex()
      const presets = Object.keys(PRESET_FRAGMENTS).map((k) => ({
        id: k,
        name: PRESET_FRAGMENTS[k].name,
        preset: true,
      }))
      const custom = index.fragments.map((f) => ({
        id: f.id,
        name: String(f.name || f.id),
        preset: false,
        createdAt: f.createdAt || null,
      }))
      return presets.concat(custom)
    }

    // Sound-group list: preset groups + user-defined groups (pinned first, then creation time descending within each group)
    function audioGroupsPayload() {
      const index = readAudioIndex()
      // Sort: pinned custom groups first, then preset groups, then unpinned custom groups (creation time descending)
      const customs = index.groups.slice().map((g) => ({
        id: g.id,
        name: String(g.name || g.id),
        press: typeof g.press === 'string' ? g.press : null,
        release: typeof g.release === 'string' ? g.release : null,
        preset: false,
        pinned: !!(g.pinnedAt && g.pinnedAt > 0),
        pinnedAt: g.pinnedAt || null,
        createdAt: g.createdAt || 0,
      }))
      const pinned = customs.filter((g) => g.pinned).sort((a, b) => b.pinnedAt - a.pinnedAt)
      const unpinned = customs.filter((g) => !g.pinned).sort((a, b) => b.createdAt - a.createdAt)
      const presets = Object.keys(PRESET_GROUPS).map((k) => {
        const g = PRESET_GROUPS[k]
        return { id: g.id, name: g.name, press: g.press, release: g.release, preset: true, pinned: false, pinnedAt: null, createdAt: 0 }
      })
      return pinned.concat(presets, unpinned)
    }

    function audioPayload() {
      return {
        ok: true,
        groups: audioGroupsPayload(),
        fragments: audioFragmentsPayload(),
      }
    }

    // Resolve clip audio bytes: bundled built-in clip → preset (SOUND_SETS) → custom whale-audio/<id>.wav
    function loadAudioFragmentBytes(fragId) {
      if (BUILTIN_FRAGMENT_FILES[fragId]) {
        return loadSound(BUILTIN_FRAGMENT_FILES[fragId])
      }
      if (PRESET_FRAGMENTS[fragId]) {
        // Map preset clips to their corresponding sound files: ya1->duck.press, ya2->duck.release, d1->fx1.press, d2->fx1.release
        const map = { ya1: ['duck', 'press'], ya2: ['duck', 'release'], d1: ['fx1', 'press'], d2: ['fx1', 'release'] }
        const [setName, slot] = map[fragId]
        const set = SOUND_SETS[setName]
        if (!set) return null
        return loadSound(set[slot])
      }
      const p = audioFragmentPath(fragId)
      if (!p) return null
      try {
        const bytes = fs.readFileSync(p)
        if (bytes && bytes.length > 0) return bytes
      } catch (err) {}
      return null
    }

    // Clip actually used by a group: if a clip referenced by a custom group was deleted, fall back to the preset
    // Returning '' means this slot was explicitly left empty (mute this event); callers should therefore not send audio
    function groupFragmentId(groupId, slot) {
      const custom = readAudioIndex().groups.find((g) => g && g.id === groupId)
      if (custom) {
        const fid = custom[slot]
        if (fid === '') return ''
        if (fid) {
          if (PRESET_FRAGMENTS[fid]) return fid
          if (customFragExists(fid)) return fid
        }
        // Missing field/invalid reference → fall back to preset: new groups without references use duck
        return slot === 'press' ? PRESET_GROUPS.duck.press : PRESET_GROUPS.duck.release
      }
      const preset = PRESET_GROUPS[groupId]
      if (preset) return preset[slot]
      return slot === 'press' ? PRESET_GROUPS.duck.press : PRESET_GROUPS.duck.release
    }

    function customFragExists(id) {
      try {
        const p = audioFragmentPath(id)
        if (!p) return false
        const st = fs.statSync(p)
        return st.isFile()
      } catch (err) { return false }
    }

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/image.png',
      handler: (req, res) => {
        try {
          const bytes = loadImage()
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('whale image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/rua.gif',
      handler: (req, res) => {
        try {
          const bytes = loadGif()
          res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('rua gif unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/balance.json',
      handler: async (req, res) => {
        try {
          const refresh = new URL(req.url || '/', 'http://localhost').searchParams.get('refresh') === '1'
          const payload = await getBalance(refresh)
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/last-turn.json',
      handler: (req, res) => {
        // Return the most recently completed conversation-turn cost; seq increments so the front end can detect a “new turn”
        const payload = lastTurn
          ? { ok: true, seq: lastTurnSeq, turn: lastTurn.turn, amount: lastTurn.amount, tokens: lastTurn.tokens, ts: lastTurn.ts }
          : { ok: true, seq: 0, turn: null, amount: null, tokens: null, ts: null }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(payload))
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/size.json',
      handler: async (req, res) => {
        if (req.method === 'PUT' || req.method === 'POST') {
          try {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const scale = typeof parsed.scale === 'number' ? parsed.scale : null
            if (scale === null) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'missing scale' }))
              return
            }
            // issue #97: missing fields must always “keep the existing value” and never fall back to defaults — otherwise any incomplete PUT
            // (old client / handwritten curl / load race) would reset user settings to defaults.
            // Pay special attention to scrollGapPx: the read default is 17, while the write fallback used to be 0, silently changing the avoidance width.
            const old = readSizeConfig() || {}
            const pickB = (v, cur, dflt) => (typeof v === 'boolean' ? v : (typeof cur === 'boolean' ? cur : dflt))
            const pickN = (v, cur, dflt) => (typeof v === 'number' ? v : (typeof cur === 'number' ? cur : dflt))
            const pickS = (v, cur, dflt) => (typeof v === 'string' && v ? v : (typeof cur === 'string' && cur ? cur : dflt))
            // Invalidate the balance cache when the usage mode changes so the next request immediately uses the new mode
            if (typeof parsed.usageMode === 'string') {
              if (normalizeUsageMode(old.usageMode) !== normalizeUsageMode(parsed.usageMode)) {
                balanceCache = null
              }
            }
            const result = writeSizeConfig(
              scale,
              pickB(parsed.sound, old.sound, true),
              pickN(parsed.vol, old.vol, 0.9),
              pickS(parsed.soundSet, old.soundSet, 'duck'),
              typeof parsed.usageMode === 'string' ? parsed.usageMode : old.usageMode,
              typeof parsed.peakMode === 'string' ? parsed.peakMode : old.peakMode,
              pickB(parsed.bubbleOn, old.bubbleOn, true),
              pickB(parsed.turnCostOn, old.turnCostOn, true),
              pickN(parsed.turnCostCloseMs, old.turnCostCloseMs, 5000),
              pickB(parsed.scrollGapOn, old.scrollGapOn, false),
              pickN(parsed.scrollGapPx, old.scrollGapPx, 17),
              pickB(parsed.menuBtnHide, old.menuBtnHide, false),
              pickB(parsed.codexStatsOn, old.codexStatsOn, true)
            )
            res.writeHead(result.ok ? 200 : 500, JSON_HEADERS)
            // Configuration just changed (possibly toggling Codex statistics) → discard the old snapshot so the next request immediately reflects the new setting
            if (result.ok) { try { codexInvalidate() } catch (err) {} }
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(readSizeConfig() || {}))
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/wait.json',
      handler: (req, res) => {
        // v761 (issue #161): pending state while waiting for user interaction (question / approval).
        // Reuse the existing “host exposes state + front end polls every second” model; do not introduce a new channel.
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify({
          ok: true,
          pending: waitState.pending,
          sessionName: waitState.sessionName || '',
        }))
      },
    }))
    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/usage-records.json',
      handler: async (req, res) => {
        try {
          // Reports read the committed ledger. Replaying cached balance samples
          // here could roll back a correction or create a false midnight baseline.
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(usageRecordsPayload()))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
        }
      },
    }))
    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/balance-adjustments.json',
      handler: async (req, res) => {
        try {
          // Verify identity before touching the balance or ledger: it must be the one unambiguous built-in DeepSeek model.
          // Newly added provider templates do not inherit this capability automatically, and other models are denied reconciliation read/write access.
          const targetIds = new URL(req.url || '/', 'http://localhost').searchParams.getAll('modelId')
          const targetModelId = targetIds.length === 1 ? targetIds[0] : null
          if (targetModelId !== API_BUILTIN_ID || !canAdjustBuiltinBalance(apiModelById(targetModelId))) {
            const error = new Error('Balance reconciliation is supported only for DeepSeek (built-in); open it from that model’s settings menu')
            error.status = 403
            throw error
          }
          if (req.method === 'PUT') {
            const input = JSON.parse(await readBodyMax(req, 8192))
            if (!input || typeof input !== 'object') throw new Error('Invalid reconciliation data')
            if (input.modelId !== targetModelId) {
              const error = new Error('Reconciliation request model mismatch; only DeepSeek (built-in) is supported')
              error.status = 403
              throw error
            }
            if (input.day === todayKey()) {
              const fresh = await getBalance(true)
              if (!fresh.ok || fresh.stale) {
                res.writeHead(503, JSON_HEADERS)
                res.end(JSON.stringify({ ok: false, error: 'Unable to refresh the balance right now; please save the reconciliation again later' }))
                return
              }
            }
            const led = readUsageLedger()
            const summary = reconcileBalance(led, input)
            if (!writeUsageLedger(led)) throw new Error('Failed to save reconciliation; check write permissions for the DSH data directory')
            balanceCache = null
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, summary }))
            return
          }
          if (req.method !== 'GET' && req.method !== undefined) {
            res.writeHead(405, { ...JSON_HEADERS, Allow: 'GET, PUT' })
            res.end(JSON.stringify({ ok: false, error: 'Unsupported request method' }))
            return
          }
          const fresh = await getBalance(true)
          const led = readUsageLedger()
          const days = accountingDays(led).sort().reverse().map(day => balanceSummary(led, day))
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({
            ok: true, days, today: todayKey(), fresh: !!fresh.ok && !fresh.stale,
            error: !fresh.ok || fresh.stale ? (fresh.error || 'Balance has not refreshed yet') : null,
          }))
        } catch (err) {
          res.writeHead(err.status || 400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 240) }))
        }
      },
    }))

    // Usage settings (task-completion sound / balance warning / today’s budget)
    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/usage-settings.json',
      handler: async (req, res) => {
        try {
          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readBody(req)
            const parsed = JSON.parse(body || '{}')
            if (!parsed || typeof parsed !== 'object') throw new Error('bad body')
            const result = writeUsageSettings(parsed)
            res.writeHead(result.ok ? 200 : 400, JSON_HEADERS)
            res.end(JSON.stringify(result))
            return
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, settings: readUsageSettings() }))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
        }
      },
    }))

    // Custom API models: GET list (including live balance / today’s usage / per-model alert budgets)
    // POST {action: save|delete|set-key|delete-key|model-settings}
    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/api-models.json',
      handler: async (req, res) => {
        try {
          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readBody(req)
            const parsed = JSON.parse(body || '{}')
            const action = String((parsed && parsed.action) || 'save')
            if (action === 'delete') {
              const r = apiDeleteModel(parsed.id)
              const list = await apiModelsPayload()
              res.writeHead(r.ok ? 200 : 400, JSON_HEADERS)
              res.end(JSON.stringify({ ...r, models: list.models }))
              return
            }
            if (action === 'probe') {
              // Perform a read-only connectivity test only (e.g. Ark /api/v3/models); does not consume tokens
              const m0 = apiModelById(parsed.id)
              const pr = await apiProbeModel(m0)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify(pr))
              return
            }
            if (action === 'set-key' || action === 'delete-key') {
              const ref = String(parsed.keyRef || '').trim()
              if (!ref) throw new Error('bad keyRef')
              const svc = ctx.credentials
              if (action === 'set-key') {
                await svc.set(ref, String(parsed.keyValue || ''))
              } else if (typeof svc.unset === 'function') {
                // Regular keys are stored in the refs section of the credentials document: unset must be used to truly delete them
                // (deleteRecord handles only structured records in the records section and silently returns for refs)
                await svc.unset(ref)
              } else {
                await svc.deleteRecord(ref)
              }
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true }))
              return
            }
            if (action === 'model-settings') {
              const r = writeUsageSettings({ modelSettings: { id: String(parsed.id || ''), alert: parsed.alert, budget: parsed.budget, quota: parsed.quota } })
              res.writeHead(r.ok ? 200 : 400, JSON_HEADERS)
              res.end(JSON.stringify(r))
              return
            }
            // Note: keyValue is on the request body (not inside model) and must be merged in,
            // otherwise the API key entered in the front-end panel is discarded (the key would never be saved)
            const r = await apiSaveModel({ ...(parsed.model || parsed), keyValue: parsed.keyValue })
            const list2 = await apiModelsPayload()
            res.writeHead(r.ok ? 200 : 400, JSON_HEADERS)
            res.end(JSON.stringify({ ...r, models: list2.models }))
            return
          }
          const payload = await apiModelsPayload()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/roles.json',
      handler: async (req, res) => {
        if (req.method === 'POST' || req.method === 'PUT') {
          try {
            // Increase to 30 MB: supports GIFs up to 20 MB (base64 expands by about 1.33×)
            const body = await readBodyMax(req, 30 * 1024 * 1024)
            const parsed = JSON.parse(body)
            const name = String(parsed.name || '').trim().slice(0, 20) || 'New Character'
            const image = String(parsed.image || '')
            const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(image)
            if (!m) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'invalid image data' }))
              return
            }
            const buf = Buffer.from(m[2], 'base64')
            if (buf.length < 8 || buf.length > 20 * 1024 * 1024) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'image too large' }))
              return
            }
            // format: client explicitly identifies gif/apng (an APNG data URL is image/png, so the client must distinguish it);
            // when not explicitly provided, infer from the data URL MIME (gif→gif, everything else→png)
            const declared = parsed.format === 'gif' ? 'gif' : (parsed.format === 'apng' ? 'apng' : null)
            const fmt = declared || (m[1] === 'gif' ? 'gif' : 'png')
            const id = 'role_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
            const dir = pickRoleDir()
            fs.writeFileSync(path.join(dir, id + '.' + roleFileExt(fmt)), buf)
            const index = readRolesIndex()
            index.roles.push({ id, name, format: fmt, pinnedAt: null, createdAt: Date.now() })
            writeRolesIndex(index)
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify(rolesPayload()))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(rolesPayload()))
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/role-pin.json',
      handler: async (req, res) => {
        try {
          const body = await readBodyMax(req, 8192)
          const parsed = JSON.parse(body)
          const id = String(parsed.id || '')
          const { index, role } = roleIndexFind(id)
          if (!role) {
            res.writeHead(404, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: 'role not found' }))
            return
          }
          role.pinnedAt = parsed.pinned === true ? Date.now() : null
          writeRolesIndex(index)
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(rolesPayload()))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/role-delete.json',
      handler: async (req, res) => {
        try {
          const body = await readBodyMax(req, 8192)
          const parsed = JSON.parse(body)
          const id = String(parsed.id || '')
          if (id === ROLE_DEFAULT_ID) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: 'cannot delete default role' }))
            return
          }
          const { index, role } = roleIndexFind(id)
          if (!role) {
            res.writeHead(404, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: 'role not found' }))
            return
          }
          // Determine the file path from the character format first (must happen before removing it from the index; otherwise format lookup falls back to png and the .gif cannot be deleted)
          const fmt = role.format === 'gif' || role.format === 'apng' ? role.format : 'png'
          const p = roleFilePath(id, fmt)
          index.roles = index.roles.filter((r) => r.id !== id)
          writeRolesIndex(index)
          if (p) { try { fs.unlinkSync(p) } catch (err) {} }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(rolesPayload()))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/role-image.png',
      handler: (req, res) => {
        try {
          const id = roleIdFromUrl(req.url)
          const p = roleImagePath(id)
          if (!p) throw new Error('bad role id')
          const bytes = fs.readFileSync(p)
          // Return MIME according to character format: animated gif → image/gif; png/apng both use a PNG container → image/png
          const { role } = roleIndexFind(id)
          const mime = role && role.format === 'gif' ? 'image/gif' : 'image/png'
          res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('role image unavailable')
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/audio.json',
      handler: async (req, res) => {
        if (req.method === 'POST' || req.method === 'PUT') {
          try {
            const body = await readBodyMax(req, 8 * 1024 * 1024)
            const parsed = JSON.parse(body)
            const action = parsed.action
            const index = readAudioIndex()
            if (action === 'upload-fragment') {
              const name = String(parsed.name || '').trim().slice(0, 40) || 'Unnamed Audio'
              const audio = String(parsed.audio || '')
              const m = /^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/.exec(audio)
              if (!m) {
                res.writeHead(400, JSON_HEADERS)
                res.end(JSON.stringify({ ok: false, error: 'invalid wav data' }))
                return
              }
              const buf = Buffer.from(m[1], 'base64')
              if (buf.length < 44 || buf.length > 8 * 1024 * 1024) {
                res.writeHead(400, JSON_HEADERS)
                res.end(JSON.stringify({ ok: false, error: 'audio too large' }))
                return
              }
              const id = 'audio_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
              fs.writeFileSync(path.join(pickAudioDir(), id + '.wav'), buf)
              index.fragments.push({ id, name, createdAt: Date.now() })
              writeAudioIndex(index)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, id, fragments: audioFragmentsPayload() }))
              return
            }
            if (action === 'save-group') {
              const id = String(parsed.id || '')
              const name = String(parsed.name || '').trim().slice(0, 20) || 'Unnamed Sound Group'
              const press = String(parsed.press ?? '')
              const release = String(parsed.release ?? '')
              // Validate that referenced clips exist (preset or custom); empty string = leave this slot empty (mute this event), which is valid
              const frags = audioFragmentsPayload().map((f) => f.id)
              const validPress = press === '' ? '' : (frags.includes(press) ? press : PRESET_GROUPS.duck.press)
              const validRelease = release === '' ? '' : (frags.includes(release) ? release : PRESET_GROUPS.duck.release)
              if (id && index.groups.some((g) => g.id === id)) {
                const g = index.groups.find((x) => x.id === id)
                g.name = name
                g.press = validPress
                g.release = validRelease
              } else {
                const gid = 'group_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
                index.groups.push({ id: gid, name, press: validPress, release: validRelease, pinnedAt: null, createdAt: Date.now() })
              }
              writeAudioIndex(index)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, groups: audioGroupsPayload() }))
              return
            }
            if (action === 'delete-group') {
              const id = String(parsed.id || '')
              if (PRESET_GROUPS[id]) {
                res.writeHead(400, JSON_HEADERS)
                res.end(JSON.stringify({ ok: false, error: 'cannot delete preset group' }))
                return
              }
              index.groups = index.groups.filter((g) => g.id !== id)
              writeAudioIndex(index)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, groups: audioGroupsPayload() }))
              return
            }
            if (action === 'delete-fragment') {
              const id = String(parsed.id || '')
              if (PRESET_FRAGMENTS[id]) {
                res.writeHead(400, JSON_HEADERS)
                res.end(JSON.stringify({ ok: false, error: 'cannot delete preset fragment' }))
                return
              }
              index.fragments = index.fragments.filter((f) => f.id !== id)
              writeAudioIndex(index)
              const p = audioFragmentPath(id)
              if (p) { try { fs.unlinkSync(p) } catch (err) {} }
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, fragments: audioFragmentsPayload(), groups: audioGroupsPayload() }))
              return
            }
            if (action === 'pin-group') {
              const id = String(parsed.id || '')
              const g = index.groups.find((x) => x.id === id)
              if (!g) {
                res.writeHead(404, JSON_HEADERS)
                res.end(JSON.stringify({ ok: false, error: 'group not found' }))
                return
              }
              g.pinnedAt = parsed.pinned === true ? Date.now() : null
              writeAudioIndex(index)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, groups: audioGroupsPayload() }))
              return
            }
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: 'unknown action' }))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(audioPayload()))
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/audio-fragment.wav',
      handler: (req, res) => {
        try {
          const id = audioIdFromUrl(req.url)
          const bytes = loadAudioFragmentBytes(id)
          if (!bytes) throw new Error('bad fragment id')
          // Preset/built-in clips may be mp3 or wav — Content-Type must match the actual bytes,
          // otherwise browser decoding/loading behavior becomes abnormal (MIME/byte mismatches can cause audible differences)
          const mime = fragmentMime(id)
          res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('audio fragment unavailable')
        }
      },
    }))

    // MIME corresponding to clip bytes: use the declared MIME for built-in/preset clips; custom clips are always wav
    function fragmentMime(fragId) {
      const f = PRESET_FRAGMENTS[fragId]
      return (f && f.mime) || 'audio/wav'
    }

    function loadSound(candidates) {
      for (const p of candidates) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) return bytes
        } catch (err) {}
      }
      return null
    }

    function serveSound(req, res, candidates) {
      const bytes = loadSound(candidates)
      if (!bytes) {
        // v752: 404 responses also get no-store. Previously only the 200 branch had cache headers, so failed responses could be cached by the browser/intermediary
        // and once cached could become “permanently silent, even after refresh”.
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end('sound unavailable')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.length),
      })
      res.end(bytes)
    }

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/sound/press.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        // Custom sound group: when set is a group id, resolve audio from the group’s press clip
        const setName = soundSetFromUrl(req.url)
        if (setName && !SOUND_SETS[setName]) {
          const fragId = groupFragmentId(setName, 'press')
          if (fragId === '') { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return } // Empty slot: mute this event (v752: add no-store so empty responses cannot be cached)
          const bytes = loadAudioFragmentBytes(fragId)
          if (bytes) {
            res.writeHead(200, {
              'Content-Type': fragmentMime(fragId),
              'Cache-Control': 'no-store',
              'Content-Length': String(bytes.length),
            })
            res.end(bytes)
            return
          }
        }
        serveSound(req, res, set.press)
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/sound/release.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        const setName = soundSetFromUrl(req.url)
        if (setName && !SOUND_SETS[setName]) {
          const fragId = groupFragmentId(setName, 'release')
          if (fragId === '') { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return } // Empty slot: mute this event (v752: add no-store so empty responses cannot be cached)
          const bytes = loadAudioFragmentBytes(fragId)
          if (bytes) {
            res.writeHead(200, {
              'Content-Type': fragmentMime(fragId),
              'Cache-Control': 'no-store',
              'Content-Length': String(bytes.length),
            })
            res.end(bytes)
            return
          }
        }
        serveSound(req, res, set.release)
      },
    }))

    function pickBubbleImgDir() {
      for (const p of BUBBLE_IMG_DIR_CANDIDATES) {
        try {
          fs.mkdirSync(p, { recursive: true })
          fs.accessSync(p, fs.constants.W_OK)
          return p
        } catch (err) {}
      }
      return BUBBLE_IMG_DIR_CANDIDATES[0]
    }
    function defaultBubbleImgIndex() {
      return { version: 1, images: [] }
    }
    function readBubbleImgIndex() {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(pickBubbleImgDir(), BUBBLE_IMG_INDEX_NAME), 'utf8'))
        if (parsed && Array.isArray(parsed.images)) return parsed
      } catch (err) {}
      return defaultBubbleImgIndex()
    }
    function writeBubbleImgIndex(index) {
      try {
        fs.writeFileSync(path.join(pickBubbleImgDir(), BUBBLE_IMG_INDEX_NAME), JSON.stringify(index, null, 2), 'utf8')
        return true
      } catch (err) {
        return false
      }
    }
    function bubbleImgPayload() {
      const index = readBubbleImgIndex()
      // Built-in default images are always present (listed first, excluded from createdAt sorting; not duplicated when the user gallery contains the same id)
      const seen = {}
      index.images.forEach((im) => { seen[im.id] = 1 })
      const builtins = DEFAULT_BUBBLE_IMGS.filter((d) => !seen[d.id]).map((d) => ({
        id: d.id,
        name: String(d.name || d.id),
        format: d.format === 'gif' ? 'gif' : 'png',
        url: '/dsh-whale/bubble-img.png?id=' + encodeURIComponent(d.id),
        createdAt: null,
        builtin: true,
      }))
      return {
        ok: true,
        images: builtins.concat(index.images.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((im) => ({
          id: im.id,
          name: String(im.name || im.id),
          format: im.format === 'gif' ? 'gif' : 'png',
          url: '/dsh-whale/bubble-img.png?id=' + encodeURIComponent(im.id),
          createdAt: im.createdAt || null,
        }))),
      }
    }
    function bubbleImgIdFromUrl(url) {
      try {
        const q = String(url || '').split('?')[1] || ''
        const m = /(?:^|&)id=([^&]+)/.exec(q)
        return m ? decodeURIComponent(m[1]) : ''
      } catch (err) { return '' }
    }
    function loadBubbleConfig() {
      for (const p of BUBBLE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && parsed.v === 1) return parsed
        } catch (err) {}
      }
      return null
    }
    function writeBubbleConfig(cfg) {
      const body = JSON.stringify(cfg, null, 2)
      for (const p of BUBBLE_FILE_CANDIDATES) {
        try { fs.writeFileSync(p, body, 'utf8'); return true } catch (err) {}
      }
      return false
    }

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/bubble.json',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST' || req.method === 'PUT') {
            const body = await readBodyMax(req, 512 * 1024)
            const parsed = JSON.parse(body)
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items) || !Array.isArray(parsed.lib)) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'invalid bubble config' }))
              return
            }
            // v727: tapAdvance = “tap character to advance the bubble queue” (store only a boolean; do not pass through other fields)
            const cfg = { v: 1, items: parsed.items, lib: parsed.lib, tapAdvance: parsed.tapAdvance === true }
            writeBubbleConfig(cfg)
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, config: cfg }))
            return
          }
          const cfg = loadBubbleConfig()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, config: cfg }))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/bubble-imgs.json',
      handler: (req, res) => {
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(bubbleImgPayload()))
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/bubble-img-upload.json',
      handler: async (req, res) => {
        try {
          const body = await readBodyMax(req, 10 * 1024 * 1024)
          const parsed = JSON.parse(body)
          const action = parsed && parsed.action
          const index = readBubbleImgIndex()
          if (action === 'upload') {
            const name = String(parsed.name || '').trim().slice(0, 40) || ''
            const data = String(parsed.data || '')
            const m = /^data:image\/(png|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data)
            if (!m) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'invalid image data' }))
              return
            }
            const format = m[1] === 'gif' ? 'gif' : 'png'
            const buf = Buffer.from(m[2], 'base64')
            if (buf.length < 64 || buf.length > 8 * 1024 * 1024) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'image too large' }))
              return
            }
            const id = 'bimg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
            fs.writeFileSync(path.join(pickBubbleImgDir(), id + '.' + format), buf)
            index.images.push({ id, name, format, createdAt: Date.now() })
            writeBubbleImgIndex(index)
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify(bubbleImgPayload()))
            return
          }
          if (action === 'delete') {
            const id = String(parsed.id || '')
            const img = index.images.find((x) => x.id === id)
            if (!img) {
              res.writeHead(404, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'image not found' }))
              return
            }
            index.images = index.images.filter((x) => x.id !== id)
            writeBubbleImgIndex(index)
            const ext = img.format === 'gif' ? 'gif' : 'png'
            try { fs.unlinkSync(path.join(pickBubbleImgDir(), id + '.' + ext)) } catch (err) {}
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify(bubbleImgPayload()))
            return
          }
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: 'unknown action' }))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/bubble-img.png',
      handler: (req, res) => {
        try {
          const id = bubbleImgIdFromUrl(req.url)
          // 1) Prefer the user gallery
          const index = readBubbleImgIndex()
          const img = index.images.find((x) => x.id === id)
          if (img) {
            const ext = img.format === 'gif' ? 'gif' : 'png'
            const bytes = fs.readFileSync(path.join(pickBubbleImgDir(), id + '.' + ext))
            res.writeHead(200, {
              'Content-Type': img.format === 'gif' ? 'image/gif' : 'image/png',
              'Cache-Control': 'no-store',
              'Content-Length': String(bytes.length),
            })
            res.end(bytes)
            return
          }
          // 2) Fall back to built-in default images (on a fresh install with no user gallery, semantic ids referenced by bubble sequences can still render)
          const def = DEFAULT_BUBBLE_IMGS.find((x) => x.id === id)
          if (def) {
            const bytes = loadBuiltinBubbleImgBytes(def)
            if (bytes) {
              res.writeHead(200, {
                'Content-Type': def.format === 'gif' ? 'image/gif' : 'image/png',
                'Cache-Control': 'no-store',
                'Content-Length': String(bytes.length),
              })
              res.end(bytes)
              return
            }
          }
          throw new Error('bad image id')
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('bubble image unavailable')
        }
      },
    }))

          disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-whale/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(loadWidgetJs())
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-whale/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-whale/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    // —— Official DSH desktop (Electron) adaptation (issues #152 / #153 / #154) ——
    // The desktop shell’s index.html is **read directly from the packaged static dist on disk** (`dsh-app://app/`) and never passes through the host’s
    // renderIndex(), so tapIndex above has no effect on desktop — resulting in “the host half is alive, while the client half is never requested”.
    // The desktop client’s only injection channel is the structured `webserver/index-inject` row (collectIndexInjections() at host startup
    // passes it to the renderer via IPC, and the renderer applies rows one by one according to kind).
    // **Registration of this row has been moved to the beginning of apply()** (see the comment above `DESKTOP_WIDGET_ROW_TEXT`) for two reasons —
    // ① the desktop injection table is **collected only once**, so the row must be registered as early as possible; ② the row itself was changed to an **inline script row**,
    // because the page-side interpreter treats `script-src` as “reject the entire boot if loading fails” (the fatal startup error from issue #154).

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })
    }) // ← end root.inject(['webServer','credentials','connection'], cb)
  },
}
