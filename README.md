# DSH Little Whale Accounting Widget (DeepSeek Balance Whale Widget)

![DSH Little Whale Accounting Widget](assets/DSH2.png)

A persistent widget in the bottom-right corner of the DeepSeek Harness (DSH) web interface: little whale bubble image + DeepSeek API balance + today's usage + per-turn conversation cost, and **bubble content is fully customizable** (click sequences, modular layout, parallel weighted bubble selection, random sentences/random images). Standard DSH bundle plugin, one-click install with `dsh plugin`, no session token required.

## How to choose between the two branches

This repo has two **mutually incompatible** product lines. Choose one based on where you want it:

| Where you want it | Which branch | Installation |
|---|---|---|
| **Bottom-right of DSH web interface** (the plugin described in this README) | `main` (default branch) | `dsh plugin --profile web add dsh-whale-widget` (recommended, installs the published npm version); you can also install from this repo with `dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget`, but that installs **the current state of `main`, not the published version** |
| **Bottom-right of the official desktop client (Electron)** | `main` (same package) | ⚠️ **Do not use** `--profile web` (the desktop client reads the `desktop` profile, and the CLI also refuses `--profile desktop`) — in a desktop session, **let DSH install it itself**, see "Official desktop (Electron client): read this first" below |
| **Codex desktop app** (follows the Codex window, no standalone web page) | [`For-Codex`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/tree/For-Codex) | The branch's `api-balance-whale`: extract to `%USERPROFILE%\plugins\api-balance-whale`, then follow the branch's [installation instructions](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/For-Codex/docs/INSTALL-AND-ROLLBACK-0.2.0.md) to register the scheduled task (you can also just let Codex install it itself meow~) |

⚠️ **The two branches are mutually incompatible**: the `For-Codex` plugin cannot be installed into the DSH web page with `dsh plugin … add`; the plugin from this main branch cannot run in Codex desktop. The first row above is the capability of this repo's default branch (`main`); the second row is the capability of the other branch.

⚠️ The two installation methods for the same branch (npm name / `github:`) are **choose one, do not mix** — they are the same package name; installing both in succession will conflict. If you already installed via `github:`, to switch to the npm name, first run `dsh plugin --profile web remove dsh-whale-widget`.

> The two product lines are **maintained independently** (no shared code / no cross-branch dependencies): `main` = DSH web plugin, `For-Codex` = Codex desktop port; their version lines, release methods, and tests do not affect each other.

## Features

### Accounting and display

- 🐋 **Always-on autostart**: Appears automatically every time the DSH web interface opens (standard DSH bundle plugin)
- 💰 **Balance**: Auto-refresh every 60 seconds + click the whale to refresh manually; when balance changes, the number has a **rolling animation**; transient network jitter automatically keeps the latest balance without error. **Two data-fetch methods, API key takes priority**: ① `DEEPSEEK_API_KEY` in DSH credentials; ② **DSH account login state** — automatically used when you have logged into a DeepSeek account via "Settings → Account & Balance" and have not configured an API key (**no need to create a key on platform**)
- 📊 **Today's usage (little whale accounting)**: No token required. Balance **decreases** are accumulated as consumption by observation; balance **increases** (top-up / gift credit) are recorded separately and do not offset existing consumption; when a balance increase is detected, "pending balance adjustment verification" is shown, and you can correct it in "Little Whale Accounting → **DeepSeek (built-in) → Settings → Balance correction** according to the actual cumulative credited amount and non-call deductions — **both "observed consumption" and "balance correction" are on the DeepSeek account basis** (derived from balance observations of that API key, excluding other vendors; "local model cost" is the local estimate for all models) (per-turn details retained for 90 days or up to 20,000 entries; daily archives retained for 365 days; expired data archived to `.dshw-usage-archive.json`); amounts are accounted with 8 decimal places and displayed with two
- 💬 **Per-turn conversation cost**: Listens to DSH local session events, converts to amount by the model's **real usage** (input / cache / output / reasoning tokens), and pops a cost bubble at the end of each turn; can be toggled, auto-close seconds configurable (0 = do not auto-close), **bubble content customizable** (modular, use `{cost}` to reference amount); entry: menu → "Sound & Notifications" → "Global Settings" → expand "Per-turn cost notification" → "Edit notification content"
- ⛰️ **Peak/off-peak pricing**: Weekday peak 9:00–12:00, 14:00–18:00 (Beijing time), off-peak otherwise; from 2026-08-23, **all day off-peak on weekends**. The peak/off-peak module supports status text, countdown, and multiple styles such as "Liang Wen peak/off-peak / !?strong strong?! / concise"
- 📒 **Usage record window**: Today's model spend, last 7 days, all records; model proportion bars; expand per-day details (including time and amount); supports search by date or **model name**; model names have friendly labels (`deepseek-flash` → `DeepSeek-V4.1-Flash`, old names labeled "same as V4.1 Flash")

### Interaction

- 🖱️ **Drag + snap**: Snap areas on all four sides customizable (by ratio or pixels), corners can be combined; can disable snapping and place freely
- 🔄 When snapped to the left, the whole widget is **horizontally mirrored** (text reverses accordingly, with animation)
- 🧸 **Press Q-bounce** doll effect (bottom coordinate stays unchanged while pressed)
- 🎚️ **Main menu**: character, size slider, **sound & notifications** (this row now only has the entry button "Global Settings"; the sound master switch has moved into the panel), global bubble switch + "press bubble settings", avoid scrollbar, snap settings, hide menu button, resource management (including balance alert, today's budget, little whale accounting)
- 🔊 **Notification & sound settings** (main menu → "Sound & Notifications" → "Global Settings"): **four entry rows** — **press sound** (sound group, volume), **per-turn cost notification** (bubble notification, auto-close seconds, task-end sound, notification volume), **question notification**, **approval notification**. The entry row itself shows that event's **master switch** and **current value summary** (e.g. `Default sound group · 100%`, `Auto-close 180s · Ding~`); **click a row to expand** that section's settings (multiple can be expanded at once). **Each sound has independent volume**; each row has "Preview"; the `[✓]` on the left of the sound row determines whether that sound **plays** (not playing = still bubbles). Bottom bar `Cancel / Restore defaults / Save` — changes in the panel **only stay in memory**; they take effect only when you click "Save"; clicking "Cancel" fully restores (after "Restore defaults", clicking Cancel also undoes it)
- 🙈 **Menu button can be hidden**: After hiding, on desktop **right-click the whale**; on mobile **long-press the whale for about 1.5 seconds** to bring up the menu
- 📱 **Mobile friendly**: The whale can be touched and dragged (custom touch handling, won't misjudge page gestures as scrolling and become undraggable); the bubble editor supports **long-press for 0.4 seconds to enter drag sorting**; removed the browser's default click highlight box

### Bubble system (core)

- 💬 **Click sequence**: First click shows the "first-click bubble"; clicking again enters the "click again" queue; the queue can be added, removed, and reordered arbitrarily, and two bubbles can be made into a **parallel A/B weighted choice** (one is drawn by weight each round)
- 🔁 **Tap character to advance the queue** (optional, enabled in the "Custom Bubbles" window): when enabled, **tapping the character = advance one item** (1→2→3…; after the last item, click again to collapse the bubble; the next tap starts again from item 1); when disabled, it behaves as before — tapping the character returns to the "first-click bubble". The setting is only in this window and takes effect together with the window's "Save"
- 🧩 **Modular content**: A bubble consists of several modules arranged in rows, supporting types
  - Text, hyperlink
  - **Random sentence** (multiple sentences with weights, one is shown each time and no consecutive repeats)
  - **Image/animated image** (choose from bubble image library, occupies an entire row)
  - **Random image** (multiple images with weights, one is drawn and no consecutive repeats, also occupies an entire row)
  - Balance value, today's usage, peak/off-peak period, **conversation name** (built-in values, content automatically obtained, placeholder and style adjustable; conversation name can set **retained length**, excess shown as `...`, `0` = no truncation)
- 🎨 **Per-module styles**: font (including custom fonts), font size, bold/italic/underline, solid color or **marquee gradient** coloring, background color; text and random sentences support hover quick editing
- 🖐️ **Drag layout**: native drag on desktop, long-press drag on mobile; modules can be merged into the start/end of a row, split into rows, and entire rows can be reordered; **max 6 modules per row, max 6 rows per bubble**, image-type modules occupy a row alone and only one is allowed per bubble
- 📚 **Module library**: "Save as" commonly used modules into the library, then click or drag them into any bubble to reuse

### Reminders

- 🔔 **Balance alert**: Pops a reminder when balance is below a set value; content editable (including image/random image modules)
- 💸 **Today's budget**: Pops a reminder when today's usage reaches the set amount; content also editable
- 💬 **Per-turn cost notification**: Pops a cost bubble after a turn ends; content also editable (modular, use `{cost}` for amount); **switch, auto-close seconds, notification volume, task-end sound effect, and content editing entry** are all in the "Per-turn cost notification" section of the "Sound & Notifications → Global Settings" panel (the main menu no longer has this row separately)
- ⏳ **Waiting interaction sounds**: When DSH **needs you to answer a question** or **needs you to approve authorization**, it plays a sound and shows a bubble (both default off; when enabled, they share the same sound library as task-end). `{session}` in the notification content is replaced with the **current conversation name** (if unavailable, shows "Current conversation"; overly long is automatically truncated to 12 characters + `...`). **The same unanswered question only rings once** (refreshing the page will not repeat it)
- All three support auto-close seconds; when bubble mode is unavailable, they automatically degrade to a centered card (the card also renders image modules)

### Sounds / characters / images

- 🔊 **Press & release sounds**: Built-in "Little Yellow Duck" and "Sound Effect 1" presets; you can also import audio clips and freely combine them into **custom sound groups** (slots can be left empty = mute that event)
- 🎵 **Task-end sound**: Plays when a reply round completes; two built-in presets — default **Minecraft·Experience Orb** (`assets/minecraft-exp-orb.wav`) and **A** (`assets/task-end-a.wav`); can also choose any clip or sound group
- ⏳ **Question sound / approval sound**: Plays when DSH needs you to answer or approve; shares the same sound library as task-end, **each has adjustable volume**, and the `[✓]` on the left of the sound row determines "whether it plays" (not playing = still bubbles)
- 🔉 **Independent volume per sound**: Press sound, task-end sound, question sound, approval sound each have a volume slider (default 100%), and each row has "Preview"
- ✂️ **Audio clip management**: Visual trimming and preview on import; resource management window (menu → Resource Management → "Manage") uniformly view/preview/delete by **two collapsible entries: Images / Audio** — the entry row directly shows counts (e.g. `Characters 1 · Bubble images 2`, `Sound groups 3 · Clips 4`); click a row to expand details; "Import clip" is in the audio section; collapsing/expanding also stops the currently previewing clip
- 🐳 **Custom character**: Upload your own whale image (gallery management, can revert to default)
- 🖼️ **Bubble image library**: Built-in `petpet` and `money1` images; can also upload png/gif for use by image/random image modules

### Custom API (multi-vendor balance / quota)

In addition to the built-in DeepSeek balance, you can add any vendor in "Little Whale Accounting → Models"; each model independently configures balance alert / today's budget / quota:

- 🧩 **Vendor templates (34, automatically fill credential name / currency / endpoint / field path / event matching / probe URL)**:
  - **Can directly query balance or quota**: DeepSeek (built-in), OpenRouter, Kimi / Moonshot (CN / international), StepFun, Novita, Zhipu GLM Coding Plan (domestic / international z.ai), Kimi Coding, MiniMax Coding (domestic / international), **OpenCode Go (subscription, 5h / weekly / monthly three windows)**, OpenAI-compatible relay stations (OneAPI / New API)
  - **Officially no "query balance with API key" endpoint** (marked "(no balance endpoint)" in the dropdown; after selecting, uses `probeUrl` to verify the key, balance shows "—", today's usage estimated from session events): SiliconFlow (CN / EN), Volcano Ark, OpenAI, Anthropic Claude, Google Gemini, xAI Grok, Groq, Mistral AI, Together AI, Fireworks AI, DeepInfra, Cerebras, Alibaba Cloud Bailian (Tongyi Qianwen), Baidu Qianfan (Wenxin), Tencent Hunyuan, iFlytek Spark, ModelScope, local models (Ollama / LM Studio)
  - **Fully manual**: Custom HTTP (write URL and field paths yourself), Codex (local sessions, no endpoint required)
- 🔑 **Secrets not stored in config**: Secrets are written to the DSH official credential service; the config file only stores the **credential name** (e.g. `OPENROUTER_API_KEY`); deleting a model also cleans up that model's quota module and settings
- 💰 **Balance**: Read according to the template's endpoint and JSON field path (supports `a.b[0].c` and `scale` multiplier); click "Test connectivity" to verify the key first
- 📉 **Today's usage**: When a balance endpoint exists, records the observed **decrease** (the first observation of the day is the statistical starting point; increases such as top-ups do not offset consumption); vendors without a balance endpoint show a local session **estimate**
- 🎯 **Quota (subscription / resource package)**: Just fill in the total; used is **automatically accumulated from DSH session tokens** (basis `input + cacheRead + output`, reasoning tokens already included in output, retained across days), or switch to manual entry; supports "no reset / daily / monthly"
- 🧾 **Subscription quota endpoint (`kind:'quota'` template)**: Directly reads the vendor's official endpoint "window used % + reset time", complementing the session-based quota above. **Supports one endpoint returning multiple windows** (currently OpenCode Go has 5h / weekly / monthly three windows), displaying used percentage per window and each window's compact reset countdown; the template uses `quota.json.windows` to describe each window's field paths
- 💱 **Unit price (optional)**: Located in "Key / Endpoint" panel → expand "Endpoint & fields (advanced)" → "Unit price (optional)". Each model can fill in its own unit price — **cache hit / cache miss input / output**, unit is "currency / million tokens"; currency supports CNY and USD, **when choosing USD you must fill in the exchange rate (CNY/USD)**; accounting and ledger **are uniformly settled in CNY** (USD unit prices are converted at the exchange rate); unit price **does not distinguish peak/off-peak** (same price in both periods). If left blank, the built-in price table is used (DeepSeek flash / pro). Note: **built-in DeepSeek does not support custom unit price** (always uses built-in peak/off-peak price); when quota unit is "amount (CNY)", used **can only be filled manually**
- 🫧 **Bubble modules**: Each model automatically gets two modules, "Balance · <model name>" and "Quota · <model name>", with placeholders `{balance}`, `{today}`, `{quota}`, `{quota_used}`, `{quota_left}`, `{quota_total}`, `{quota_reset}`

> Note: Not all vendors provide an "query balance with API key" endpoint. **SiliconFlow**'s balance endpoint has been taken offline by the vendor ([2026-08-11 update notice](https://api-docs.siliconflow.cn/docs/release-notes/overview): `/user/info` stopped service from **2026-08-14**, "a replacement API will be provided in due course"; as of release no replacement endpoint has been seen). **Volcano Ark**'s balance / usage, like **Alibaba Cloud Bailian / Baidu Qianfan / Tencent Hunyuan**, belongs to each cloud platform's AK/SK-signed OpenAPI; **OpenAI / Anthropic / Gemini / xAI / Groq / Mistral / Together / Fireworks / DeepInfra / Cerebras** simply have no public balance query endpoint — these templates are uniformly "no balance endpoint + probe key", and today's usage is estimated from session events. Vendors' **subscription quota** endpoints (Zhipu / Kimi Coding / MiniMax Coding / OpenCode Go) are only valid for subscription plan accounts: a Token resource package account calling the Zhipu endpoint will return "current user does not exist coding plan"; in that case use the above "Quota (subscription / resource package)" automatic statistics.
>
> Templates only provide **default values**: after selecting a template you can freely rewrite the endpoint address and field paths; blank fields will **continue to use the template default** (they will not become invalid because they are blank).

### Codex mode (local session statistics)

> ⚠️ **Limitation**: Codex support is currently only **partial interface adaptation**; this widget **cannot be installed into Codex** (it is a DSH web plugin; Codex is only read as a data source); subscription windows have no real subscription sample to verify, and feedback is welcome if issues occur.

The widget can directly read the local Codex session logs to count token usage — therefore **not limited to inside DSH**; usage you run in Codex CLI / desktop can also be seen.

- 📂 **Data source**: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` (including `archived_sessions/`), plaintext JSONL; reads local files only, **no network, no key required**, and does not write to `~/.codex`
- 📈 **Statistical basis**: Prefer accumulating the **difference** of the cumulative amount in the log (`total_token_usage`), naturally avoiding double-counting multiple records in the same turn; model attribution determined by `turn_context.payload.model`; aggregated by day + model, with incremental cache (`$DSH_HOME/.dshw-codex.json`, storing only aggregates and file offsets)
- 🖥️ **Display**: Model list shows `Codex today x · last 7 days y tokens`; model submenu shows today / this month / total / last 7 days and session file count; the "Test" button directly returns local statistics
- 🎯 **Quota**: In that model's "Quota", the used source can be selected as **Codex local session tokens** (no reset = cumulative − baseline, daily = today, monthly = this month), reusing the same display and bubble modules
- 🪟 **Subscription windows (5h / weekly)**: The log's `rate_limits` carries window snapshots; with a ChatGPT subscription, the submenu automatically appends `5h used x% · resets in 2h30m | weekly used y% · resets in 3 days` (field names are fault-tolerant; this line is not shown for API-key billing or no subscription)

## Directory structure

```text
dsh-whale-widget/
├── package.json              # DSH bundle plugin metadata (dsh.bundle.patch points to cordis.patch.yml)
├── README.md                 # This file
├── cordis.patch.yml          # Plugin mount declaration
├── lib/
│   ├── index.js              # Host-side plugin body (routes + accounting + sound/image/character services)
│   └── accounting.mjs        # Accounting kernel (fixed-point amount arithmetic + balance observation/correction ledger)
├── assets/
│   ├── whale-widget.js       # Frontend widget body (hot-read by host by mtime)
│   ├── DSH2.png              # README top display image
│   ├── DSniang1.png          # Little whale body (cut-out, bubbles drawn by code)
│   ├── DSniang02.png         # Alternate full image (compatible with old manual install path)
│   ├── rua.gif               # Random lines / acting cute animated image (optional)
│   ├── Ya1.mp3 / Ya2.mp3     # Preset sound "Little Yellow Duck" press / release
│   ├── D1.mp3 / D2.mp3       # Preset sound "Sound Effect 1" press / release
│   ├── minecraft-exp-orb.wav # Built-in default task-end sound (Minecraft·Experience Orb)
│   ├── task-end-a.wav        # Built-in task-end preset (A)
│   ├── bubble-petpet.gif     # Built-in bubble image: petpet
│   └── bubble-money1.gif     # Built-in bubble image: money1 (default balance alert image)
└── whale-widget-prompt.md    # Full spec/maintenance prompt (for secondary development)
```

Runtime data (all in `$DSH_HOME`, default `~/.dsh`; use env var `DSH_HOME` to change location):

| File / directory | Purpose |
|---|---|
| `.dshw-size.json` | Widget appearance and switches (scale, volume, sound group, peak style, snap-related, etc.) |
| `.dshw-usage.json` | Accounting ledger + daily balance observation/correction summary + usage settings (task-end sound, balance alert, today's budget, per-turn cost notification content, and **`events`**: sound selection, independent volume, bubble config for press / per-turn cost / question / approval events; **per-turn cost auto-close seconds are stored in `.dshw-size.json` as `turnCostCloseMs`**) |
| `.dshw-usage.json.before-recharge-fix.bak` | Old-format ledger backup (automatically created before 0.3.1 first writes the old ledger; not overwritten if it already exists) |
| `.dshw-turn.json` | Per-turn cost seq (to prevent frontend treating a new turn as an old one after hot reload) |
| `.dshw-bubble.json` | Custom bubble config (click sequence + module library + tap character to advance queue switch) |
| `.dshw-api.json` | Custom API model registry (vendor / credential name / endpoint fields / custom unit price / quota and usage accumulation; **does not contain secrets**) |
| `.dshw-usage-archive.json` | Ledger archive (per-turn details and daily summaries beyond retention; details 90 days/20,000 entries, daily 365 days) |
| `.dshw-codex.json` | Codex local session statistics cache (aggregated by day/model + file offsets; **contains no credentials**) |
| `whale-roles/` | Custom character images + `roles.json` index |
| `whale-audio/` | Audio clips `<id>.wav` + `audio.json` index (sound groups/clips) |
| `whale-bubble-imgs/` | Bubble image library images + `bubble-imgs.json` index |

## Installation

### Official desktop (Electron client): read this section first ⚠️

**The desktop client does not read the `web` profile.** The official desktop client uses the **`desktop` profile** (`%USERPROFILE%\.dsh\profiles\desktop`), and the `dsh plugin` command line **by design refuses** to touch it:

```
error: profile "desktop" is managed exclusively by the Electron application
```

So the `--profile web` commands in "Methods A–D" below **do not apply to the desktop client** — installing by them puts the plugin in the `web` profile, while the desktop window reads the `desktop` profile and won't see a single character. The symptom is "nothing in the bottom-right corner (not even ☰), and no error in the console".

**Correct desktop installation: let DSH inside the desktop client install it itself.**

In a desktop client session, just say something like "install dsh-whale-widget" — it will call the built-in `plugin_manager` tool, whose **scope is the current profile** (desktop = `desktop`), and the client's bundled plugin manager will complete the installation inside the profile directory using its **bundled pnpm**, and write `dsh-whale-widget` into that profile's `dsh.profile.bundles`. If you need a specific version, you can also write an install spec like `dsh-whale-widget@<version>` (e.g. `dsh-whale-widget@0.3.13`, **fill in the current latest version**).

> The equivalent manual path is to install once with the client's bundled pnpm in that profile directory, then manually write it into `dsh.profile.bundles`, but **not recommended** — that is a directory managed by the client itself.

**How it takes effect (tested)**: Newly installing a package usually **hot-applies** (tool returns `"application":"applied"`); **changing version (upgrade) requires restarting the client** (returns `"restart-required"`).

> ⚠️ **But "hot apply" is not always enough**: Some users have tested that **after a new install there is still nothing in the bottom-right corner, and it appears after reopening the client once** (issue #162). So: **if you don't see the widget after installing, reopen the client first** (same for command-line `dsh web`: restart + browser `Ctrl+F5`), then check the two self-checks below.

**Self-check after installation** (the two correspond to the host side and client side):

- **Host side**: `%USERPROFILE%\.dsh\.dshw-turn.json` exists, and `seq` increments with conversation;
- **Client side**: In desktop `%APPDATA%\@deepseek-ai\dsh-desktop\Local Storage\leveldb`, `dshw-pos` / `dshw-last-seq` appear — these two keys **are only written by the widget frontend**.

When you cannot see the plugin version in the desktop UI, check `dsh.profile.bundles` in `%USERPROFILE%\.dsh\profiles\desktop\package.json` and `pnpm-lock.yaml` in the same directory.

> Methods A–D below are all **Web (`dsh web`)** installation methods.

### Method A: You already have the complete resource package of this plugin (local directory / archive) (recommended)

Suitable if someone directly sent you a zip, or you already have an extracted plugin directory (the directory should contain `package.json`, `cordis.patch.yml`, `lib/`, `assets/`, `README.md`).

```powershell
# 1) If it is a zip: first extract it to a fixed directory that will not be moved or deleted later (do not put it in a temp/download directory)
#    Example: D:\Plugins\dsh-whale-widget
#    Install the layer that contains package.json, do not add an extra same-named directory

# 2) Confirm key files are present (missing assets/ causes no images, no sound)
Test-Path "D:\Plugins\dsh-whale-widget\package.json",
          "D:\Plugins\dsh-whale-widget\lib\index.js",
          "D:\Plugins\dsh-whale-widget\assets\whale-widget.js"

# 3) If you previously installed the same-named plugin from GitHub / npm, remove it first to avoid version conflicts
dsh plugin --profile web remove dsh-whale-widget

# 4) Install using an absolute path (quote the path if it contains spaces)
dsh plugin --profile web add link:D:\Plugins\dsh-whale-widget
```

Notes:

- `link:` is a **symlink install**: files in the source directory take effect immediately when changed; but after installation **you cannot move/rename that directory**; if moved, run add again
- To use copy install instead: `dsh plugin --profile web add file:D:\Plugins\dsh-whale-widget` (afterward source changes will not sync; re-add required)
- The resource package includes built-in resources such as `assets/minecraft-exp-orb.wav`, `assets/task-end-a.wav`; **deleting files in assets will silently degrade the corresponding feature** (no image/no sound)
- After installing, also restart `dsh web`, then F5 refresh the browser

### Method B: Install directly from GitHub

No local clone needed; install with one command:

```powershell
dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
```

Notes:

- After installation, the plugin will appear in DSH's **plugin management page**, and you can update it directly there afterward without manually running commands
- If your network requires a proxy, set proxy env vars first and then execute:
  ```powershell
  $env:http_proxy="http://<ip>:<port>"; $env:https_proxy="http://<ip>:<port>"; $env:all_proxy="socks5://<ip>:<port>"; dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
  ```
- After installation, restart `dsh web`, then F5 refresh the browser

### Method C: Local install (from current repo)

In the **repo root directory** (the directory containing `package.json`), run:

```powershell
dsh plugin --profile web add link:.
```

Notes:

- `dsh plugin` forwards arguments to pnpm and, on success, automatically adds `dsh-whale-widget` to `dsh.profile.bundles`
- **`link:.` means link the current directory** (the repo root itself is the plugin package). If the repo is elsewhere, use an absolute path:
  ```powershell
  dsh plugin --profile web add link:D:\your-path\DeepSeek-Balance-Whale-Widget
  ```
- ⚠️ Do not use `link:.\dsh-whale-widget` — there is **no** `dsh-whale-widget/` subdirectory in the repo; doing so installs it as a normal dependency rather than a plugin
- After installation, restart `dsh web`, then F5 refresh the browser
- After **moving the source directory**, you must run `add link:<new path>` again; if it reports a conflict, first `dsh plugin --profile web remove dsh-whale-widget` then add

### Method D: Install after publishing to npm

```powershell
dsh plugin --profile web add dsh-whale-widget
```

### Installation instructions for AI (copy directly to an AI assistant)

```
Please help me install the plugin dsh-whale-widget. Possible sources are two: the GitHub repo
MeteorNOX/DeepSeek-Balance-Whale-Widget, or I already have a "complete resource package" of this plugin locally.

Steps:
1. Ensure pnpm is available (if not: npm install -g pnpm)
2. Install in the Web profile (choose one according to the source I actually have):

   [Source 1: Install from GitHub]
     dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
   Or install by linking from a local git repo:
     dsh plugin --profile web add link:<absolute path to repo>
   (Note: the repo root is the plugin package; do not write a path with a subdirectory like link:.\dsh-whale-widget)

   [Source 2: I already have a complete resource package locally (zip or extracted directory)]
   First confirm what a "complete resource package" looks like: a directory that should contain
     package.json, cordis.patch.yml, lib/index.js,
     assets/ (including whale-widget.js, DSniang1.png, Ya1.mp3, minecraft-exp-orb.wav, task-end-a.wav, etc.), README.md
   Then do the following:
   a) If what I gave you is a zip: first extract it to a **fixed directory that will not be moved or deleted later**, e.g.
        D:\Plugins\dsh-whale-widget
      Do not extract to a temp/download directory or a location that will be cleaned; do not add an extra layer —
      install the layer that **contains package.json**, not the outer same-named archive directory
   b) Check file integrity (if any is False, tell me first and do not continue installing):
        Test-Path "<resource package dir>\package.json"
        Test-Path "<resource package dir>\lib\index.js"
        Test-Path "<resource package dir>\assets\whale-widget.js"
      And confirm package.json has name dsh-whale-widget and a dsh.bundle.patch field
   c) If you previously installed the same-named plugin from GitHub / npm, remove it first to avoid version conflicts:
        dsh plugin --profile web remove dsh-whale-widget
   d) Install using an **absolute path** (quote if the path contains spaces):
        dsh plugin --profile web add link:<resource package dir>
      link: is a symlink install: source directory changes take effect immediately, but after installation you cannot move/rename that directory;
      after moving you must run add again. If you want copy install, use:
        dsh plugin --profile web add file:<resource package dir>
      (file: afterward source directory changes will not sync; re-add required)

3. If it reports pnpm blocking build scripts (allowBuilds-related), add the corresponding key under
   allowBuilds in ~/.dsh/profiles/web/pnpm-workspace.yaml, then rerun
4. Restart dsh web, then F5 refresh the browser

Post-install verification:
- dsh --profile web --dump-config should show dsh-whale-widget in bundles
- curl http://127.0.0.1:3080/dsh-whale/balance.json should return 200 JSON (containing totalBalance)
- curl http://127.0.0.1:3080/dsh-whale/widget.js should return 200 JS
- curl "http://127.0.0.1:3080/dsh-whale/audio-fragment.wav?id=exp_orb" should return 200 audio/wav
- curl "http://127.0.0.1:3080/dsh-whale/audio-fragment.wav?id=end_a" should also return 200 audio/wav
  (used to confirm the built-in sound effects in the resource package are in place; if 404, assets/ is incomplete)

Also please check whether DEEPSEEK_API_KEY is configured in DSH credentials (if not, prompt the user to configure it; if the user is logged in with a DSH account, newer DSH can fetch balance without a key, **do not treat "no key" as a failure**).
```

## Credentials (must-read after installation)

**Balance has two data-fetch methods (API key takes priority; the two do not interfere):**

- **`DEEPSEEK_API_KEY` (recommended)**: DeepSeek API key, used to fetch balance (`GET https://api.deepseek.com/user/balance`). Configure in the DSH credential service (credential management UI / `.dsh/.credentials.yaml`).
- **DSH account login state (optional, **no API key required**)**: If you are **logged into a DeepSeek account** via DSH's "Settings → Account & Balance", the plugin will **automatically** switch to DSH's own account service to fetch balance when there is **no API key** (top-up wallet + gift wallet, the sum of both used as the accounting basis). Token, platform request headers, and expiration cleanup are all handled by DSH; **the plugin does not touch your account token**.
  - Requires a **newer DSH** (e.g. desktop `0.1.7-rc.2`) to have this service; on older versions, when not logged in, or when the account has no balance wallet, it falls back to the "not configured" prompt below.
  - The **ledgers for account state and API key state are separate** (distinguished by account identifier): after switching from API key to account login, "today's usage" will start over from new observations.

> **No** `DEEPSEEK_PLATFORM_TOKEN` is needed. The early-version "real-time·token" mode has been discontinued; today's usage is uniformly calculated by **little whale accounting** (balance difference + session events), zero-token out of the box.

### Security boundary (from 0.3.15, **please read carefully**)

Rules for who the plugin gives credentials to, and who can change this:

1. **Credentials are only sent to "endpoints hard-coded in that vendor's built-in template"**.
   If a custom model is given an endpoint address **not in that vendor's template** (or the template address uses `{base}` pointing to an address you filled in), the plugin **by default will not send credentials there**, and returns an explicit prompt.
   - Self-hosted gateways (New API / self-hosted / Ollama, etc.) really do need custom addresses: **on this machine locally**, open the plugin panel and check "**Allow sending credentials to custom addresses**" for that model. This is an explicit flag saved per model.
2. **Changes to config and credentials can only come from the local machine (loopback address)**.
   All write requests (save model, write/delete credential, change appearance settings, etc.) if the source is not `127.0.0.1` / `localhost` / `[::1]` are uniformly `403`.
   - Why: anyone holding a DSH web session who can write model config can effectively decide "where credentials are sent" — that would send your API key directly to their server. **Read-only endpoints are unaffected** (the widget can still be viewed on the LAN as usual).
   - Need remote management? Explicitly declare with env var: `DSHW_ADMIN_HOSTS=192.0.2.10:3080,myhost.lan` (comma-separated, may include port; default empty).
3. Endpoint addresses are not allowed to carry username/password (`https://user:pass@host/`); credential names may only contain letters, numbers, and underscores.

When adding custom models, you may also need the respective vendor credential names as needed (all optional; configure whichever you use):

| Credential name | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter balance (`/api/v1/credits`) |
| `MOONSHOT_API_KEY` | Kimi / Moonshot mainland site balance (CNY) |
| `MOONSHOT_INTL_API_KEY` | Kimi / Moonshot international site balance (USD, independent account system) |
| `SILICONFLOW_API_KEY` | SiliconFlow `/v1/models` probe |
| `ARK_API_KEY` | Volcano Ark `/api/v3/models` probe |
| `ZHIPU_API_KEY` | Zhipu (subscription quota endpoint / Coding endpoint) |
| `OPENCODE_GO_API_KEY` | OpenCode Go subscription quota (`opencode.ai/zen/go/v1/usage`, auth `Authorization: Bearer <key>`) |
| `CUSTOM_API_KEY` | Custom HTTP / OpenAI-compatible relay station |

> ⚠️ The "credential name" in the custom model panel determines which ref the secret is written to. When changing vendors, confirm this field changes with the template, otherwise the new secret will be written into the previous vendor's credential name (overwriting the original key). Since v679, new models automatically follow the template.

## Uninstall

```powershell
dsh plugin --profile web remove dsh-whale-widget
```

## Upgrade from old manual installation

If you previously installed manually the old way (copying `whale-balance.mjs` + editing `cordis.patch.yml`), clean up first:

```powershell
$web = "$env:USERPROFILE\.dsh\profiles\web"

Remove-Item "$web\whale-balance.mjs" -ErrorAction SilentlyContinue
Remove-Item "$web\whale-balance.cjs" -ErrorAction SilentlyContinue
Remove-Item "$web\DSniang1.png" -ErrorAction SilentlyContinue
Remove-Item "$web\DSniang02.png" -ErrorAction SilentlyContinue
```

Then edit `$web\cordis.patch.yml`, delete this old patch:

```yaml
- insert:
    - id: whale-balance-widget
      name: ./whale-balance.mjs?v=1
```

If it only contains this section, directly change it to:

```yaml
[]
```

After cleanup, run the installation command above.

## Verification

```powershell
dsh --profile web --dump-config | Select-String -Pattern "whale"

curl http://127.0.0.1:3080/dsh-whale/balance.json
curl http://127.0.0.1:3080/dsh-whale/size.json
curl http://127.0.0.1:3080/dsh-whale/widget.js
curl http://127.0.0.1:3080/dsh-whale/image.png
curl http://127.0.0.1:3080/dsh-whale/audio.json
```

- `/dsh-whale/balance.json` → 200 JSON, containing `{ok:true, totalBalance, currency, todayUsage}`
- `/dsh-whale/size.json` → GET returns config; PUT writes
- `/dsh-whale/widget.js` → 200 JS (frontend widget body)
- `/dsh-whale/image.png` → 200 `image/png`
- `/dsh-whale/audio.json` → 200, containing `groups` / `fragments` (built-in fragments `exp_orb` = Minecraft·Experience Orb, `end_a` = A)
- `/dsh-whale/audio-fragment.wav?id=exp_orb` → 200 `audio/wav` (built-in task-end sound; no user import required)
- `/dsh-whale/audio-fragment.wav?id=end_a` → 200 `audio/wav` (built-in task-end sound A)
- `/dsh-whale/wait.json` → 200 JSON, containing `{ok:true, pending}`; `pending` is the current pending "question / approval" (`{kind:'question'|'approval', id, ts}`) or `null` — this is the data source for the "question notification / approval notification" sounds and resident bubble (polled once per second by default)
- After browser F5, the widget appears in the bottom-right corner

> ⚠️ **About the `curl` commands above**: all **23** `/dsh-whale/*` routes have been connected to the **DSH browser trust fence** (`connection.requestRejection`).
> Therefore **bare `curl` without session credentials will return 401** (forging a `Host` header gives 403) — this is expected behavior, not a broken endpoint.
> To verify an endpoint is alive, see **401/403** as meaning the route is registered and the fence is working; accessing the same path in a browser (with session) is 200.
> Also **since 0.3.15, write requests (`POST`/`PUT`/`PATCH`/`DELETE`) must also originate from the local machine** (Host is `127.0.0.1`/`localhost`/`[::1]`), otherwise 403 — see "Security boundary" above.

## FAQ

- **Widget does not appear**:
  - **Web (`dsh web`)**: Confirm the install command succeeded; `dsh --profile web --dump-config` shows `dsh-whale-widget`; restart `dsh web` then F5.
  - **Official desktop**: First confirm you installed to the right profile — desktop reads the **`desktop` profile**, and you **cannot** use `--profile web` (while `--profile desktop` is refused by the CLI, by design). For the correct entry, see "**Official desktop (Electron client): read this section first**" above, and use the **two self-checks** there to determine whether it is "not installed correctly" or "installed but not rendered". **After a new install, reopening the client once is also recommended** (issue #162: hot apply may not be enough).
- **Access validation for all endpoints of this plugin (`/dsh-whale/*`)**: By default only accepts requests from **loopback addresses** (`127.0.0.1` / `localhost` / `[::1]`) and rejects cross-site markers (`Sec-Fetch-Site: cross-site`) and requests whose Origin and Host are not same-origin — this is a trust fence against "malicious web pages reading/writing local endpoints" (issue #92 / #136). If you put `dsh web` behind a **reverse proxy or LAN address**, declare the allowed Host with an env var (comma-separated, may include port), otherwise you will get 403:
  ```bash
  DSHW_TRUSTED_HOSTS=dsh.example.com,10.0.0.5:3080 dsh web
  ```
- **Images/sounds do not display, no sound**: Confirm `assets/` inside the plugin package is complete (`DSniang1.png`, `*.mp3`, `minecraft-exp-orb.wav`, etc.); when missing, related features silently degrade.
- **When IDM / Thunder / Free Download Manager / Motrix etc. are installed, every time DSH opens a "download confirmation box" pops up, targeting the widget's sounds** (issue #158): these managers' browser integration grabs the page's sound requests as download tasks. **Recommended: add local addresses to their site exclusion list** (IDM: `Options → File Types / Site Exclusions`, add `127.0.0.1` and `localhost`; other managers similarly, keyword "exclude local addresses / do not monitor this site"). Turning off the widget sound switch does not eliminate the popup — the sound element is created during page initialization.
- **Question / approval does not ring and has no bubble**: These two events are **on by default** (default **bubble only, no sound**). If you want sound, go to "Menu → Sound & Notifications → Global Settings", **click the "Question notification" / "Approval notification" row** to expand it, check the `[✓]` on the left of the "Question notification sound / Approval notification sound" row (unchecked = mute, but still bubbles), then choose a sound from the dropdown. If you do not need the notification, uncheck the master switch `[✓]` on the left of that section's entry row. (The summary on the right of the entry row shows the current config in real time.)
- **Balance reports "DEEPSEEK_API_KEY not configured"**: Configure the API key in DSH credentials; **or** log in to a DeepSeek account via "Settings → Account & Balance" (supported by newer DSH) — when no key is configured, the plugin automatically uses account state; no need to create a key on platform.
- **Balance is obtained, but it says "ledger unavailable / writing stopped to protect original records"**: The ledger file (`.dshw-usage.json`) was corrupted externally or has an abnormal structure; the plugin **refuses to overwrite** it to avoid data loss. First back it up/rename it so the plugin can rebuild, then use "Balance correction" to make up entries as needed.
- **Saving settings reports `403` / changing config on another machine does not take effect**: Since 0.3.15, **write operations can only be performed on the machine running DSH, using `127.0.0.1` (local address) in the UI**. When accessing from LAN or a reverse proxy, reading is fine but writing is rejected. If you need remote management, use `DSHW_ADMIN_HOSTS` to explicitly authorize that machine (see "Credentials → Security boundary").
- **Prompt "This address is not ...'s built-in endpoint; refused to send credentials"**: This is the 0.3.15 security policy — **custom endpoint addresses do not get credentials by default**. After confirming it is your own gateway (New API / self-hosted, etc.), **on the local machine** open the panel and check "Allow sending credentials to custom addresses" for that model.
- **Today's usage shows `--`**: First wait for one successful balance observation; statistics start from that observation time, and consumption before the starting point is not in this interval.
- **Today's usage differs from the official website**: First check the same account, same currency, and same statistical interval; if there are top-ups or other balance adjustments, use "Little Whale Accounting → DeepSeek (built-in) → Settings → Balance correction" to enter the actual credited amount. The balance endpoint only returns a balance snapshot and does not provide top-up records; when top-up and consumption occur in the same refresh interval, the actual credited amount is needed for correction.
- **After top-up, the consumption number does not change**: This is expected — top-up does not increase consumption; above the number "pending balance adjustment verification" appears, prompting you to fill in the cumulative credited amount for this statistical interval.
- **Per-turn cost does not show**: Confirm the `[✓]` on the **left of the "Per-turn cost notification" row** in "Sound & Notifications → Global Settings" is checked (the summary on the right of the entry row directly shows `Disabled` or the current config); a turn must fully end (`turn/end`) to be settled. When the balance-change bubble and the cost bubble compete for the layer, the reminder degrades to a centered card.
- **Content of the per-turn cost bubble**: "Sound & Notifications → Global Settings" → **expand "Per-turn cost notification"** → "Edit notification content" (modular, use `{cost}` for amount); in the same section you can set auto-close seconds, notification volume, and task-end sound.
- **Task-end sound does not play**: This switch is **on by default** (default sound is built-in **`A`**, with built-in Minecraft·Experience Orb also selectable); go to "Sound & Notifications → Global Settings" → **expand "Per-turn cost notification"**, confirm the `[✓]` on the left of the "Task-end sound" row is checked (unchecking = mute). If a custom clip file is deleted, it falls back/mutes.
- **After changing / deleting the API key, earlier accounting days become "local estimate ¥0.00"**: Accounting is **booked by key fingerprint** (one key, one ledger); changing the key is like changing the ledger — data is **not lost**, it is all in `.dshw-usage.json` under `accounting.books`. The current version already makes the UI display dates from historical books normally (labeled "observed consumption · historical account"), and shows "N accounting books detected" at the top of the "Little Whale Accounting" panel; **the two books are not added together** (the plugin cannot determine whether the two are the same account), but details for the same day can be viewed day by day in that panel's "Daily and per-entry details".
- **Cannot drag the whale on mobile**: This version already uses touch events to handle dragging; please hard-refresh the page to get the latest `whale-widget.js`; if it still does not work, please report your browser model.
- **How to enter the menu after hiding the menu button**: Right-click the whale on desktop; long-press the whale for about 1.5 seconds on mobile.
- **Changed frontend code does not take effect**: The frontend `assets/whale-widget.js` is hot-read by the host by mtime; **hard refresh** (Ctrl+F5) is enough; changing the host `lib/index.js` requires **restarting `dsh web`**.
- **Model names are confusing**: The ledger records API model ids; `deepseek-flash` is DeepSeek-V4.1-Flash, and old names `deepseek-v4-flash` / `-vision-exp` are now also provided by the same V4.1-Flash and billed at Flash pricing (already labeled in the panel).

## Pricing table

Amounts are in **CNY / million tokens**, `[off-peak, peak]`; peak = weekday 9:00–12:00, 14:00–18:00 (Beijing time), off-peak price is half the peak price; from 2026-08-23, weekends are off-peak all day. The table is at the top of `lib/index.js` in `PRICING` / `BASE_PRICE` / `PRO_PRICE`; when the official price changes, edit here.

| Model | Cache hit | Cache miss | Output |
|---|---|---|---|
| `deepseek-flash` (DeepSeek-V4.1-Flash) | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro` (V4 Pro) | 0.15 / 0.30 | 4.5 / 9.0 | 13.5 / 27.0 |

> Old model names `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` are still callable and billed at Flash price.

## Development and maintenance

- In the repo, `lib/index.js` is the host body, `lib/accounting.mjs` is the accounting kernel (fixed-point amount arithmetic + observation/correction ledger), and `assets/whale-widget.js` is the frontend body; host changes (including the accounting kernel) require restarting `dsh web`; frontend-only changes take effect with a hard page refresh.
- For the full spec, visual parameters, route list, architecture conclusions, and generation prompt, see [`whale-widget-prompt.md`](whale-widget-prompt.md).
- Local debugging: after `dsh plugin --profile web add link:.`, change frontend → Ctrl+F5; change host → restart `dsh web`.

## Acknowledgements

- **0.3.16's "old accounting hidden by separate book after changing/deleting API key"** (amounts overwritten on the switching day, earlier days degraded to "local estimate") was reported by GitHub user [@0Sakura721](https://github.com/0Sakura721) in [#163](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/163), and **directly provided the root cause location** (`lib/index.js` uses key hash as account identifier; `accounting.mjs`'s `observeBalance` / `currentBook` only read the active book) and data evidence — enabling this fix to be done properly with the judgment that "data is not lost, there is just no entry point". 0.3.16 fixes accordingly (old book dates are displayed as usual and labeled "observed consumption · historical account"). Thanks to him.
- **0.3.16's "download manager grabbing widget sound requests"** (IDM etc. popping a download box every time DSH opens; closing sound still pops) was reported by GitHub user [@VaeKaras](https://github.com/VaeKaras) in [#158](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/158), with complete reproduction steps, the grabbed URL shape, and the observation that "turning off sound has no effect" — the README adds this known issue and the site exclusion method accordingly. Thanks to him.
- **Official desktop "new install may also require reopening the client"** was tested and fed back by GitHub user [@MengLs1620](https://github.com/MengLs1620) in [#162](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/162); the README's "how it takes effect" was corrected accordingly. Thanks to him.
- **"Make the whale girl respond to task status and give sound notifications"** was proposed by GitHub user [@Jy-EggRoll](https://github.com/Jy-EggRoll) in [#160](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/160), and **submitted implementation PR [#161](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/161)** (the data shape `{ok, pending:{kind,id,ts}}` of `GET /dsh-whale/wait.json` is consistent with the mainline final solution; this README's `wait.json` route description adopts his wording). 0.3.16's question/approval notification sounds and resident bubble were implemented according to the mainline solution (four-entry panel / per-event volume and preview / preemption and top). Thanks to him, and we welcome him to continue participating in this project's engineering improvements.
- **0.3.15's credential security fix** (writing a custom model could make the host use the real API key to request any address, thereby exfiltrating credentials) was responsibly reported by **Bilibili user "星丶白羽莲"**: he provided reproduction steps, environment, and preconditions together, enabling this tightening of the boundary **without killing legitimate uses such as self-hosted gateways**. Thanks for his support.
- **DSH account login state balance reading** (endpoint and auth header, location of credential records, recommended calling method for DSH's own `deepseekAccount` service, and three integration pitfalls: account identifier character set, gift credit must be included in the basis, service may not exist) was provided with complete specs and a **reference implementation verified on his own machine** by GitHub user [@yybai25](https://github.com/yybai25) in [#157](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/157); **0.3.14 implemented accordingly** (only calls the DSH service, does not touch account tokens). Thanks for his contribution.
- The top-up accounting fix plan (separate accounting for balance increases and decreases, explicit balance correction formula, observation window isolated by account/currency, atomic ledger writes and migration backup) was independently designed and implemented as a runnable fix branch by GitHub user [@Yang-huai406](https://github.com/Yang-huai406); **0.3.1 ported and merged on the basis of that plan**, while retaining this project's existing sound fixes. Thanks for his support.
- OpenCode Go subscription quota (multi-window quota `quota.json.windows`, per-window display and compact reset countdown, window selection for the "Subscription Quota" module) was submitted by GitHub user [@ELFsay](https://github.com/ELFsay) ([#99](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/99)) and merged into `main`. Thanks for his contribution.
- **Contributors of historical merged PRs** (in merge order, all have entered this repo's code / release process):
  - [@ztzpro](https://github.com/ztzpro) ([#1](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/1)): **converted the balance whale widget into a standard DSH plugin package** (today's `cordis.patch.yml` + bundle structure comes from here);
  - [@under-the-ocean](https://github.com/under-the-ocean) ([#6](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/6) / [#7](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/7)): push triggers **automatic npm publishing**, upgraded npm to support Trusted Publishing (OIDC) — the current release process is still this set;
  - [@21253soursweetlemon](https://github.com/21253soursweetlemon) ([#16](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/16) / [#18](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/18)): gif load failure degrades to text lines, right-edge scrollbar avoidance, **anchor position memory** (window changes do not leave it hanging, can snap back to original position — the starting point of the position system);
  - [@fangbm](https://github.com/fangbm) ([#15](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/15) / [#19](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/19) / [#31](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/31) / [#33](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/33) / [#46](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/46)): stable order of multi-currency balances, two defects in per-turn cost bubbles, **all day off-peak on weekends**, accounting currency awareness, automatically create Release and generate PR changelog on publish;
  - [@xiaolinnnnnnn](https://github.com/xiaolinnnnnnn) ([#26](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/26)): Windows desktop (Tauri v2) refactor.

## License

This project's **code** is open source under the **MIT License**, see [LICENSE](LICENSE).

⚠️ **Art assets under `assets/` (images / animated images / sound effects) are not covered by MIT**: they are provided by the maintainer or generated with AI tools, distributed as-is with the plugin, for use only to run this plugin; no sublicense is granted, and they are not claimed to be original works. For item-by-item sources, metadata cleanup notes, and rights claims (takedown) methods, see **[PROVENANCE.md](PROVENANCE.md)**.
