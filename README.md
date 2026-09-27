# DSH Little Whale Accounting Widget (DeepSeek Balance Whale Widget)

![DSH Little Whale Accounting Widget](assets/DSH2.png)

A persistent widget in the bottom-right corner of the DeepSeek Harness (DSH) Web interface: Little Whale bubble image + DeepSeek API balance + today's usage + per-turn conversation cost, with **fully customizable bubble content** (click sequences, modular layout, parallel weighted bubble selection, random phrases/random images). A standard DSH bundle plugin that installs with a single `dsh plugin` command and requires no session token.

## Which Branch Should You Use?

This repository contains two **mutually incompatible** product lines. Choose the one that matches where you want the widget to run:

| Where you want it | Which branch | Installation method |
|---|---|---|
| **Bottom-right of the DSH Web interface** (the plugin described by this README) | `main` (default branch) | `dsh plugin --profile web add dsh-whale-widget` (recommended; installs the published npm release); you can also install directly from this repository with `dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget`, but that installs the **current state of `main`, not the published release** |
| **Bottom-right of the official desktop client (Electron)** | `main` (same package) | ⚠️ **Do not use** `--profile web` (the desktop client reads the `desktop` profile, and the CLI also rejects `--profile desktop`) — in a desktop-client session, **let DSH install it itself**. See “Official Desktop Client (Electron) — Read This First” below |
| **Codex desktop application** (follows the Codex window, no standalone web page) | [`For-Codex`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/tree/For-Codex) | Use the branch's `api-balance-whale`: extract it to `%USERPROFILE%\plugins\api-balance-whale`, then register the scheduled task according to the branch's [installation guide](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/For-Codex/docs/INSTALL-AND-ROLLBACK-0.2.0.md) (you can also simply ask Codex to install it for you~) |

⚠️ **The two branches are mutually incompatible**: the `For-Codex` plugin cannot be installed into DSH Web using `dsh plugin … add`; likewise, the plugin from this repository's main branch cannot run inside the Codex desktop app. The first row in the table describes the capabilities of this repository's default branch (`main`); the second product line uses the other branch.

⚠️ For the same branch, the two installation methods (npm package name / `github:`) are **alternatives — do not mix them**. They use the same package name, so installing both will cause conflicts. If you currently have the `github:` version installed and want to switch to the npm package, first run `dsh plugin --profile web remove dsh-whale-widget`.

> The two product lines are **maintained independently** (no shared code / no cross-branch dependencies): `main` = DSH Web plugin, `For-Codex` = Codex desktop port. Their version lines, release processes, and tests do not affect one another.

## Features

### Accounting and Display

- 🐋 **Persistent auto-start**: automatically appears every time the DSH Web interface opens (standard DSH bundle plugin)
- 💰 **Balance**: auto-refresh every 60 seconds + click the whale to refresh manually; numbers use a **rolling animation** when the balance changes; brief network errors automatically keep the last known balance instead of showing an error. **Two data sources, with API key taking priority**: ① `DEEPSEEK_API_KEY` from DSH credentials; ② **DSH account login state** — automatically used when you have logged into a DeepSeek account via “Settings → Account & Balance” and no API key is configured (**you do not need to create a key on the platform**)
- 📊 **Today's Usage (Little Whale Accounting)**: requires no token. **Balance decreases** are accumulated as spending based on observations; **balance increases** (top-ups / promotional credit) are recorded separately and do not erase prior spending. When a balance increase is detected, the widget shows “Pending Balance Adjustment”; you can reconcile it under “Little Whale Accounting → **DeepSeek (Built-in) → Settings → Balance Reconciliation**” using the actual cumulative credited amount and any non-call deductions. Both **“Observed Spending” and “Balance Reconciliation” are based on the DeepSeek account scope** (derived from balance observations for that API key and excluding other providers; only “Local Model Cost” is a local estimate across all models). Per-turn details are retained for 90 days or up to 20,000 entries, daily archives for 365 days, and older data is archived to `.dshw-usage-archive.json`; amounts are recorded to 8 decimal places and displayed to 2 decimals
- 💬 **Per-turn conversation cost**: listens to local DSH session events and converts each model's **actual usage** (input / cache / output / reasoning tokens) into cost. A cost bubble appears at the end of each turn; it can be enabled/disabled and its auto-close timeout is configurable (`0` = do not auto-close). **Bubble content is customizable** (modular; use `{cost}` for the amount). Path: Menu → “Sounds & Notifications” → “Global Settings” → expand “Per-Turn Cost Notification” → “Edit Notification Content”
- ⛰️ **Peak/off-peak pricing**: weekday peak hours are 09:00–12:00 and 14:00–18:00 (Beijing Time); all other times are off-peak. Since 2026-08-23, **weekends are off-peak all day**. The peak/off-peak module supports status text, countdowns, and multiple styles such as “Liang Wenfeng Valley / !?Qiang Qiang?! / Minimal”
- 📒 **Usage history window**: today's model spending, last 7 days, and all records; model-share bars; per-date expandable itemized details (including time and amount); search by date or **model name**; model names include friendly annotations (`deepseek-flash` → `DeepSeek-V4.1-Flash`, legacy names are labeled “same as V4.1 Flash”)

### Interaction

- 🖱️ **Drag + snap**: customizable snap zones on all four edges (percentage or pixels), with combinable corners; snapping can be disabled for free positioning
- 🔄 When snapped to the left edge, the whole widget **mirrors horizontally** (text is reversed accordingly, with animation)
- 🧸 **Q-bounce press effect** for the character (the bottom coordinate remains unchanged while pressed)
- 🎚️ **Main menu**: character, size slider, **Sounds & Notifications** (this row now only contains the “Global Settings” entry button; the master sound toggle moved into the panel), global bubble toggle + “Press Bubble Settings”, scrollbar avoidance, snap settings, hide-menu-button option, and resource management (including low-balance warning, daily budget, Little Whale Accounting)
- 🔊 **Notifications & sound settings** (Main Menu → “Sounds & Notifications” → “Global Settings”): **four entry rows** — **Press Sound** (sound group, volume), **Per-Turn Cost Notification** (bubble notification, auto-close seconds, task completion sound, notification volume), **Question Notification**, and **Approval Notification**. Each entry row contains that event's **master toggle** and a **summary of its current settings** (for example `Default Sound Group · 100%`, `Auto-close 180s · Ding~`). **Click a row to expand** that section's settings (multiple sections can be expanded simultaneously). **Every sound has its own volume**, and every row has a “Preview” button; `[✓]` at the left of a sound row controls whether that sound **plays** (disabled sound = bubble can still appear). Bottom bar: `Cancel / Restore Defaults / Save` — panel changes stay **in memory only** until you click “Save”; “Cancel” fully restores the previous state (including after “Restore Defaults”)
- 🙈 **Hideable menu button**: once hidden, **right-click the whale on desktop** or **long-press the whale for about 1.5 seconds on mobile** to open the menu
- 📱 **Mobile-friendly**: the whale supports touch dragging (custom touch handling prevents page gestures from being mistaken for scrolling and blocking drag); the bubble editor supports **long-pressing for 0.4 seconds to enter drag-reorder mode**; the browser's default tap-highlight rectangle is removed

### Bubble System (Core)

- 💬 **Click sequence**: the first click shows the “First Click Bubble”; further clicks enter the “Repeat Click” queue. Queue items can be added, removed, and reordered freely, and two bubbles can be placed **side by side as a weighted A/B choice** (one is selected per turn according to its weight)
- 🔁 **Press the character to advance the queue** (optional; enabled in the “Custom Bubbles” window): when enabled, **one press on the character advances one item** (1→2→3…; pressing once more after the final item closes the bubble, and the next press starts again at item 1). When disabled, the original behavior is used — pressing the character returns to the “First Click Bubble”. This setting exists only in that window and takes effect together with the window's “Save” action
- 🧩 **Modular content**: each bubble consists of one or more modules arranged in rows, with support for
  - Text, hyperlinks
  - **Random phrases** (multiple weighted sentences; one is selected each time without repeating consecutively)
  - **Images/animated images** (chosen from the bubble image library; occupies an entire row)
  - **Random images** (multiple weighted images; one is selected without repeating consecutively and also occupies a full row)
  - Balance, today's usage, peak/off-peak period, **conversation name** (built-in values obtained automatically, with customizable placeholders and styles; conversation names support a “**keep length**” setting — excess characters display as `...`, and `0` = no truncation)
- 🎨 **Per-module styling**: font (including custom fonts), font size, bold/italic/underline, solid color or **marquee gradient** color, background color; text and random phrases support quick editing on hover
- 🖐️ **Drag layout**: native drag-and-drop on desktop, long-press drag on mobile; modules can be inserted at the start/end of an existing row, split into new rows, and entire rows can be reordered. **Maximum 6 modules per row and 6 rows per bubble**; image modules occupy a whole row and only one image-type module is allowed per bubble
- 📚 **Module library**: save frequently used modules to the library and later click or drag them into any bubble for reuse

### Notifications

- 🔔 **Low-balance warning**: displays a notification when the balance falls below the configured threshold; content is editable (including image/random-image modules)
- 💸 **Daily budget**: displays a notification when today's usage reaches the configured amount; content is likewise editable
- 💬 **Per-turn cost notification**: displays a cost bubble when a conversation turn ends; the content is also editable (modular, use `{cost}` for the amount). The **toggle, auto-close seconds, notification volume, task-completion sound, and content editor entry point** are all located in the “Per-Turn Cost Notification” section under “Sounds & Notifications → Global Settings” (it is no longer a separate row in the main menu)
- ⏳ **Waiting-for-interaction sounds**: when DSH **needs you to answer a question** or **needs you to approve an authorization**, it can play a sound and show a bubble notification (both are disabled by default; when enabled, they use the same sound library as the task-completion sound). `{session}` in notification content is replaced with the **current conversation name** (or “Current Conversation” if unavailable; overly long names are automatically truncated to 12 characters + `...`). **The same unanswered question only plays once** (refreshing the page does not make it play again)
- All three support configurable auto-close seconds; if bubble mode is unavailable, they automatically fall back to a centered card (image modules are also rendered inside the card)

### Sounds / Characters / Images

- 🔊 **Press & release sounds**: two built-in presets, “Little Yellow Duck” and “Sound Effect 1”; you can also import audio clips and freely combine them into **custom sound groups** (slots may be left empty = silence for that event)
- 🎵 **Task completion sound**: plays when a turn finishes; includes two built-in presets — default **Minecraft · Experience Orb** (`assets/minecraft-exp-orb.wav`) and **A** (`assets/task-end-a.wav`). Any clip or sound group can also be selected
- ⏳ **Question / approval sounds**: play when DSH needs an answer or approval; they share the same sound library as the task-completion sound, with **independent volume controls**. `[✓]` at the left of the sound row controls whether it plays (disabled sound = the bubble notification can still appear)
- 🔉 **Independent volume for every sound**: press sound, task completion sound, question sound, and approval sound each have their own volume slider (default 100%), and every row includes “Preview”
- ✂️ **Audio clip management**: visual trimming and preview during import; the resource management window (Menu → Resource Management → “Manage”) provides two collapsible **Images / Audio** sections for viewing/previewing/deleting resources. The count appears directly on the right of each entry row (for example `Characters 1 · Bubble Images 2`, `Sound Groups 3 · Clips 4`); click a row to expand details. “Import Clip” is located inside the Audio section. Collapsing/expanding a section also stops any clip currently being previewed
- 🐳 **Custom characters**: upload your own whale images (library management, with fallback to default)
- 🖼️ **Bubble image library**: includes built-in `petpet` and `money1` images; you can also upload png/gif files for use by image/random-image modules

### Custom APIs (Multi-Provider Balance / Quota)

In addition to the built-in DeepSeek balance, you can add any provider under “Little Whale Accounting → Models”; each model has independent low-balance warning / daily budget / quota settings:

- 🧩 **Provider templates (34; selection automatically fills credential name / currency / endpoint / field path / event matching / probe URL)**:
  - **Balance or quota can be queried directly**: DeepSeek (built-in), OpenRouter, Kimi / Moonshot (CN / International), StepFun, Novita, Zhipu GLM Coding Plan (CN / International z.ai), Kimi Coding, MiniMax Coding (CN / International), **OpenCode Go (subscription, three windows: 5h / week / month)**, OpenAI-compatible relay (OneAPI / New API)
  - **No official “query balance with API key” endpoint** (marked “(No balance API)” in the dropdown; after selection, `probeUrl` is used to validate the key, balance shows “—”, and today's usage is estimated from session events): SiliconFlow (CN / EN), Volcengine Ark, OpenAI, Anthropic Claude, Google Gemini, xAI Grok, Groq, Mistral AI, Together AI, Fireworks AI, DeepInfra, Cerebras, Alibaba Cloud Model Studio (Qwen), Baidu Qianfan (ERNIE), Tencent Hunyuan, iFlytek Spark, ModelScope, local models (Ollama / LM Studio)
  - **Fully manual**: Custom HTTP (enter URL and field paths yourself), Codex (local sessions, no API required)
- 🔑 **Keys are never stored in config**: keys are written to DSH's official credential service; the config file stores only the **credential name** (for example `OPENROUTER_API_KEY`). Deleting a model also removes that model's quota modules and settings
- 💰 **Balance**: read using the template's endpoint and JSON field paths (supports paths such as `a.b[0].c` and a `scale` multiplier); click “Test Connectivity” to validate the key first
- 📉 **Today's usage**: for providers with a balance API, records the observed **decrease amount** (the first observation of the day is the starting point; increases such as top-ups do not cancel spending). Providers without a balance API display a **local-session estimate**
- 🎯 **Quota (subscription / resource pack)**: enter the total amount and used quota will **accumulate automatically from DSH session tokens** (counting `input + cacheRead + output`; reasoning tokens are already included in output and usage persists across days). You can also switch to manual input. Reset options: “No Reset / Daily / Monthly”
- 🧾 **Subscription-quota API (`kind:'quota'` templates)**: directly reads the provider's official “window used % + reset time” API and complements the session-counted quota above. **A single endpoint may return multiple windows** (currently OpenCode Go has 5h / week / month windows); each window shows its used percentage and its own compact reset countdown. Templates use `quota.json.windows` to describe field paths for each window
- 💱 **Unit price (optional)**: located under the “Key / API” panel → expand “API & Fields (Advanced)” → “Unit Price (Optional)”. Each model can define its own prices for **cache hit / uncached input / output**, in “currency / million tokens”. Currencies supported: CNY and USD; **when USD is selected, an exchange rate (CNY/USD) is required**. Accounting and the ledger are **always settled in CNY** (USD prices are converted using the exchange rate). Unit prices **do not distinguish peak/off-peak periods** (same price in both periods). Leave blank to use the built-in price table (DeepSeek flash / pro). Note: **the built-in DeepSeek model does not support custom pricing** (it always uses the built-in peak/off-peak rates); when quota unit is “Amount (CNY)”, used quota **must be entered manually**
- 🫧 **Bubble modules**: every model automatically gets two modules, “Balance · <model name>” and “Quota · <model name>”, with placeholders `{balance}`, `{today}`, `{quota}`, `{quota_used}`, `{quota_left}`, `{quota_total}`, `{quota_reset}`

> Note: not every provider offers an API that can “query balance using an API key”. **SiliconFlow's** balance API was officially retired ([2026-08-11 release note](https://api-docs.siliconflow.cn/docs/release-notes/overview)): `/user/info` stopped service on **2026-08-14**, with the announcement stating that a replacement API would be provided later; none was available as of this release. **Volcengine Ark** balance/usage, like **Alibaba Cloud Model Studio / Baidu Qianfan / Tencent Hunyuan**, belongs to each cloud platform's AK/SK-signed OpenAPI, while **OpenAI / Anthropic / Gemini / xAI / Groq / Mistral / Together / Fireworks / DeepInfra / Cerebras** simply do not provide public balance-query endpoints. These templates therefore consistently use “no balance API + probe to validate the key”, and today's usage is estimated from session events. Provider **subscription-quota** endpoints (Zhipu / Kimi Coding / MiniMax Coding / OpenCode Go) only work for subscription-plan accounts: a Zhipu request from a token-resource-pack account returns “current user does not have a coding plan”; in that case, use the “Quota (subscription / resource pack)” automatic tracking described above.
>
> Templates provide **default values only**: after selecting a template, you can freely edit endpoint addresses and field paths. Blank fields will **continue to use the template defaults** (leaving them blank does not disable the field).

### Codex Mode (Local Session Statistics)

> ⚠️ **Limitation**: Codex support currently covers only **partial API adaptation**. This widget **cannot be installed inside Codex** (it is a DSH Web plugin; Codex is only read as a data source). Subscription windows have not been validated against a real subscription sample yet; please report any issues you encounter.

The widget can directly read local Codex session logs and count token usage — so this is **not limited to activity inside DSH**; usage from Codex CLI / desktop is visible as well.

- 📂 **Data source**: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` (including `archived_sessions/`), plain-text JSONL; reads local files only, **does not access the network, requires no key**, and does not write to `~/.codex`
- 📈 **Counting method**: prefers accumulating **differences** in the log's cumulative value (`total_token_usage`), naturally preventing multiple records from the same turn from being counted twice; model attribution is determined by `turn_context.payload.model`; aggregates by day + model with an incremental cache (`$DSH_HOME/.dshw-codex.json`, containing only aggregates and file offsets)
- 🖥️ **Display**: the model list shows `Codex today x · last 7 days y tokens`; the model submenu shows today / this month / total / last 7 days and the number of session files; the “Test” button directly returns local statistics
- 🎯 **Quota**: under that model's “Quota”, the usage source can be set to **Codex local-session tokens** (no reset = cumulative − baseline, daily = today, monthly = this month), reusing the same display and bubble modules
- 🪟 **Subscription windows (5h / week)**: `rate_limits` in the log includes window snapshots. When a ChatGPT subscription is present, the submenu automatically adds something like `5h used x% · resets in 2h 30m | week used y% · resets in 3 days` (field names are handled defensively; this row is hidden for API-key billing or when there is no subscription)

## Directory Structure

```text
dsh-whale-widget/
├── package.json              # DSH bundle plugin metadata (dsh.bundle.patch points to cordis.patch.yml)
├── README.md                 # This file
├── cordis.patch.yml          # Plugin mount declaration
├── lib/
│   ├── index.js              # Host-side plugin core (routes + accounting + sound/image/character services)
│   └── accounting.mjs        # Accounting core (fixed-point money math + balance observation/reconciliation ledger)
├── assets/
│   ├── whale-widget.js       # Front-end widget core (hot-read by the host according to mtime)
│   ├── DSH2.png              # Image displayed at the top of the README
│   ├── DSniang1.png          # Little Whale character (cut-out; bubbles are drawn by code)
│   ├── DSniang02.png         # Backup full image (for compatibility with legacy manual-install paths)
│   ├── rua.gif               # Random dialogue/cute animated image (optional)
│   ├── Ya1.mp3 / Ya2.mp3     # Preset “Little Yellow Duck” press / release sounds
│   ├── D1.mp3 / D2.mp3       # Preset “Sound Effect 1” press / release sounds
│   ├── minecraft-exp-orb.wav # Built-in default task-completion sound (Minecraft · Experience Orb)
│   ├── task-end-a.wav        # Built-in task-completion preset (A)
│   ├── bubble-petpet.gif     # Built-in bubble image: petpet
│   └── bubble-money1.gif     # Built-in bubble image: money1 (used by the default low-balance warning content)
└── whale-widget-prompt.md    # Full specification/maintenance prompt (for secondary development)
```

Runtime data (all stored under `$DSH_HOME`, default `~/.dsh`; set the `DSH_HOME` environment variable to move it elsewhere):

| File / directory | Purpose |
|---|---|
| `.dshw-size.json` | Widget appearance and switches (scale, volume, sound group, peak/off-peak style, snapping, etc.) |
| `.dshw-usage.json` | Accounting ledger + daily balance observation/reconciliation summaries + usage settings (task completion sound, low-balance warning, daily budget, per-turn cost notification content, plus **`events`**: sound selection, independent volume, and bubble configuration for the four events press / per-turn cost / question / approval; **the per-turn cost auto-close duration is stored as `turnCostCloseMs` in `.dshw-size.json`**) |
| `.dshw-usage.json.before-recharge-fix.bak` | Legacy-format ledger backup (automatically created before 0.3.1 first writes to an old ledger; not overwritten if it already exists) |
| `.dshw-turn.json` | Per-turn cost `seq` (prevents the front end from treating a new turn as an old turn after hot reload) |
| `.dshw-bubble.json` | Custom bubble configuration (click sequence + module library + press-character-to-advance-queue toggle) |
| `.dshw-api.json` | Custom API model registry (provider / credential name / API fields / custom unit price / quota and usage accumulation; **contains no keys**) |
| `.dshw-usage-archive.json` | Ledger archive (per-turn details and daily summaries beyond the retention period; details 90 days/20,000 entries, daily summaries 365 days) |
| `.dshw-codex.json` | Codex local-session statistics cache (aggregation by day/model + file offsets; **contains no credentials**) |
| `whale-roles/` | Custom character images + `roles.json` index |
| `whale-audio/` | Audio clips `<id>.wav` + `audio.json` index (sound groups/clips) |
| `whale-bubble-imgs/` | Bubble-library images + `bubble-imgs.json` index |

## Installation

### Official Desktop Client (Electron) — Read This First ⚠️

**The desktop client does not read the `web` profile.** The official desktop client uses the **`desktop` profile** (`%USERPROFILE%\.dsh\profiles\desktop`), and the `dsh plugin` CLI **deliberately refuses** to modify it:

```
error: profile "desktop" is managed exclusively by the Electron application
```

Therefore, the `--profile web` commands in “Method A–D” below **do not apply to the desktop client**. If you install that way, the plugin lands in the `web` profile while the desktop window reads the `desktop` profile, so it will not see anything at all. The symptom is “nothing in the bottom-right corner (not even ☰), with no console error either.”

**Correct desktop installation: let DSH inside the desktop client install it itself.**

In a desktop-client session, just say something like “Install dsh-whale-widget” — it will call the built-in `plugin_manager` tool, whose **scope is the current profile** (desktop client = `desktop`). The client's built-in plugin manager uses its **bundled pnpm** to install the package into the profile directory and adds `dsh-whale-widget` to that profile's `dsh.profile.bundles`. To pin a version, you can use an install spec such as `dsh-whale-widget@<version>` (for example `dsh-whale-widget@0.3.13`, using **the latest version available at that time**).

> The equivalent manual route would be to run the client's bundled pnpm once inside that profile directory and then manually add the package to `dsh.profile.bundles`, but this is **not recommended** — that directory is managed by the client itself.

**How changes take effect (tested)**: installing a new package usually **applies hot** (tool returns `"application":"applied"`); **switching versions (upgrading) requires restarting the client** (returns `"restart-required"`).

> ⚠️ **Hot application is not always enough**: some users have confirmed that **after a fresh install, nothing appeared in the bottom-right corner until the client was restarted once** (issue #162). Therefore, **if you do not see the widget after installation, restart the client first** (`dsh web` is similar on the command-line side: restart it + press `Ctrl+F5` in the browser), then use the two self-checks below.

**How to self-check after installation** (one check for the host side and one for the client side):

- **Host side**: `%USERPROFILE%\.dsh\.dshw-turn.json` exists and its `seq` increases as conversations progress;
- **Client side**: `dshw-pos` / `dshw-last-seq` appears under the desktop client's `%APPDATA%\@deepseek-ai\dsh-desktop\Local Storage\leveldb` — these two keys are written **only by the widget front end**.

If the desktop UI does not show the plugin version, inspect `dsh.profile.bundles` in `%USERPROFILE%\.dsh\profiles\desktop\package.json` and `pnpm-lock.yaml` in the same directory.

> Methods A–D below are all installation methods for **Web (`dsh web`)**.

### Method A: You Already Have a Complete Plugin Package (Local Directory / Archive) (Recommended)

Use this if someone sent you a zip directly or you already have an extracted plugin directory (it should contain `package.json`, `cordis.patch.yml`, `lib/`, `assets/`, and `README.md`).

```powershell
# 1) If it is a zip: extract it first to a fixed directory that will not later be moved or deleted
#    (do not use a temporary/download directory)
#    Example: D:\Plugins\dsh-whale-widget
#    Install the level that contains package.json; do not nest it inside another same-named directory

# 2) Confirm that the key files are present (missing assets/ means missing images/sounds)
Test-Path "D:\Plugins\dsh-whale-widget\package.json",
          "D:\Plugins\dsh-whale-widget\lib\index.js",
          "D:\Plugins\dsh-whale-widget\assets\whale-widget.js"

# 3) If the same plugin was previously installed from GitHub / npm, remove it first to avoid version conflicts
dsh plugin --profile web remove dsh-whale-widget

# 4) Install using an absolute path (quote paths that contain spaces)
dsh plugin --profile web add link:D:\Plugins\dsh-whale-widget
```

Notes:

- `link:` performs a **symlink installation**: changes in the source directory take effect immediately; however, the source directory **must not be moved/renamed after installation**. If you move it, run `add` again
- To install by copying instead, use `dsh plugin --profile web add file:D:\Plugins\dsh-whale-widget` (subsequent source-directory changes will not sync; run `add` again)
- The package includes built-in resources such as `assets/minecraft-exp-orb.wav` and `assets/task-end-a.wav`; **deleting files from `assets/` causes the corresponding features to silently degrade** (no image/no sound)
- After installation, restart `dsh web` and then refresh the browser with F5

### Method B: Install Directly from GitHub

No local clone is required; install with one command:

```powershell
dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
```

Notes:

- After installation, the plugin appears on DSH's **plugin management page**, where it can later be updated directly without rerunning the command manually
- If your network requires a proxy, set the proxy environment variables first:
  ```powershell
  $env:http_proxy="http://<ip>:<port>"; $env:https_proxy="http://<ip>:<port>"; $env:all_proxy="socks5://<ip>:<port>"; dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
  ```
- Restart `dsh web` after installation, then refresh the browser with F5

### Method C: Local Installation (from the Current Repository)

Run this from the **repository root** (the directory containing `package.json`):

```powershell
dsh plugin --profile web add link:.
```

Notes:

- `dsh plugin` forwards the argument to pnpm and, on success, automatically adds `dsh-whale-widget` to `dsh.profile.bundles`
- **`link:.` means link the current directory** (the repository root itself is the plugin package). If the repository is elsewhere, use an absolute path:
  ```powershell
  dsh plugin --profile web add link:D:\your\path\DeepSeek-Balance-Whale-Widget
  ```
- ⚠️ Do not use `link:.\dsh-whale-widget` — there is **no** `dsh-whale-widget/` subdirectory in the repository; doing so installs it as a normal dependency rather than as the plugin
- Restart `dsh web` after installation, then refresh the browser with F5
- If you **move the source directory**, you must run `add link:<new path>` again; if a conflict is reported, first run `dsh plugin --profile web remove dsh-whale-widget`, then add it again

### Method D: Install After Publishing to npm

```powershell
dsh plugin --profile web add dsh-whale-widget
```

### Installation Instructions for AI (Copy Directly to an AI Assistant)

```
Please help me install the plugin dsh-whale-widget. There are two possible sources: the GitHub repository
MeteorNOX/DeepSeek-Balance-Whale-Widget, or I already have the plugin's "complete package" locally.

Steps:
1. Make sure pnpm is available (if not, first run: npm install -g pnpm)
2. Install it in the Web profile (choose the option that matches the source I actually have):

   [Source 1: Install from GitHub]
     dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
   Or link-install from a local git repository:
     dsh plugin --profile web add link:<absolute repository path>
   (Note: the repository root itself is the plugin package. Do not use a path such as link:.\dsh-whale-widget with an extra subdirectory.)

   [Source 2: I already have a complete package locally (zip or extracted directory)]
   First verify what the "complete package" looks like: one directory containing
     package.json, cordis.patch.yml, lib/index.js,
     assets/ (including whale-widget.js, DSniang1.png, Ya1.mp3, minecraft-exp-orb.wav, task-end-a.wav, etc.), README.md
   Then do the following:
   a) If I was given a zip: extract it to a **fixed directory that will not later be moved or deleted**, for example
        D:\Plugins\dsh-whale-widget
      Do not extract it to a temporary/download directory or somewhere that will be cleaned up; do not add another directory layer —
      install **the directory level that contains package.json**, not an outer same-named archive directory
   b) Check file completeness (if any line returns False, tell me first and do not continue installing):
        Test-Path "<package directory>\package.json"
        Test-Path "<package directory>\lib\index.js"
        Test-Path "<package directory>\assets\whale-widget.js"
      Also confirm that package.json has name = dsh-whale-widget and contains the dsh.bundle.patch field
   c) If the same plugin was previously installed from GitHub / npm, remove it first to avoid version conflicts:
        dsh plugin --profile web remove dsh-whale-widget
   d) Install using an **absolute path** (quote paths containing spaces):
        dsh plugin --profile web add link:<package directory>
      link: is a symlink installation: changes in the source directory take effect immediately, but the directory must not be moved/renamed after installation;
      if it is moved, run add again. To install by copying instead, use:
        dsh plugin --profile web add file:<package directory>
      (with file:, later source-directory changes do not sync and you must run add again)

3. If pnpm reports that build scripts are blocked (allowBuilds-related), add the corresponding key under
   allowBuilds in ~/.dsh/profiles/web/pnpm-workspace.yaml, then rerun the command
4. Restart dsh web, then refresh the browser with F5

Verification after installation:
- dsh --profile web --dump-config should show dsh-whale-widget in bundles
- curl http://127.0.0.1:3080/dsh-whale/balance.json should return 200 JSON (including totalBalance)
- curl http://127.0.0.1:3080/dsh-whale/widget.js should return 200 JS
- curl "http://127.0.0.1:3080/dsh-whale/audio-fragment.wav?id=exp_orb" should return 200 audio/wav
- curl "http://127.0.0.1:3080/dsh-whale/audio-fragment.wav?id=end_a" should also return 200 audio/wav
  (these confirm that the package's built-in sound resources are present; a 404 means assets/ is incomplete)

Also check whether DEEPSEEK_API_KEY is configured in DSH credentials (if not, prompt the user to configure it; if the user signs in using a DSH account, newer DSH versions can read the balance even without a key, so **do not treat "no key" as a failure**).
```

## Credentials (Required Reading After Installation)

**There are two balance data sources (API key takes priority; the two paths do not interfere with each other):**

- **`DEEPSEEK_API_KEY` (recommended)**: DeepSeek API key used to fetch the balance (`GET https://api.deepseek.com/user/balance`). Configure it in the DSH credential service (credential-management UI / `.dsh/.credentials.yaml`).
- **DSH account login state (optional, API key **not required**)**: if you logged into a DeepSeek account through DSH's “Settings → Account & Balance”, the plugin automatically switches to DSH's own account service when **no API key** is configured (top-up wallet + promotional-credit wallet are summed as the accounting baseline). Tokens, platform request headers, and invalidation cleanup are all handled by DSH; **the plugin never accesses your account token**.
  - Requires a **newer DSH** version (for example desktop `0.1.7-rc.2`) that provides this service; on older versions, when not logged in, or when the account has no balance wallet, it falls back to the “not configured” message below.
  - The **ledgers for account-login mode and API-key mode are separate** (distinguished by account identity): after switching from an API key to account login, “Today's Usage” starts again from a new observation baseline.

> `DEEPSEEK_PLATFORM_TOKEN` is **not required**. The old “live · token” mode has been removed; today's usage is now uniformly calculated by **Little Whale Accounting** (balance delta + session events), so it works out of the box with zero session tokens.

### Security Boundaries (Since 0.3.15 — **Please Read This**)

Rules for where the plugin may send credentials and who may change that behavior:

1. **Credentials are only sent to endpoints hard-coded in that provider's built-in template.**
   If a custom model uses an API address that is **not included in that provider's template** (or if a template address uses `{base}` to point to an address you entered yourself), the plugin **does not send credentials there by default** and instead returns an explicit message.
   - Self-hosted gateways (New API / self-hosted / Ollama, etc.) legitimately require custom addresses: open the plugin panel **locally on this machine** and enable “**Allow credentials to be sent to custom addresses**” for that model. This is an explicit flag stored per model.
2. **Configuration and credential changes may only originate from the local machine (loopback).**
   All write requests (saving models, writing/deleting credentials, changing appearance settings, etc.) return `403` unless they originate from `127.0.0.1` / `localhost` / `[::1]`.
   - Why: if anyone holding a DSH Web session could write model configuration, they could choose “where credentials are sent” — which could send your API key directly to their server. **Read-only APIs are unaffected** (the widget can still be viewed normally over the LAN).
   - Need remote administration? Explicitly allow hosts with an environment variable: `DSHW_ADMIN_HOSTS=192.0.2.10:3080,myhost.lan` (comma-separated, optional ports; empty by default).
3. API addresses may not contain a username/password (`https://user:pass@host/`), and credential names may contain only letters, digits, and underscores.

When adding custom models, the following provider-specific credential names may also be used as needed (all are optional; configure only the ones you use):

| Credential name | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter balance (`/api/v1/credits`) |
| `MOONSHOT_API_KEY` | Kimi / Moonshot mainland-China balance (CNY) |
| `MOONSHOT_INTL_API_KEY` | Kimi / Moonshot international balance (USD, separate account system) |
| `SILICONFLOW_API_KEY` | SiliconFlow `/v1/models` connectivity probe |
| `ARK_API_KEY` | Volcengine Ark `/api/v3/models` connectivity probe |
| `ZHIPU_API_KEY` | Zhipu (subscription quota API / Coding endpoint) |
| `OPENCODE_GO_API_KEY` | OpenCode Go subscription quota (`opencode.ai/zen/go/v1/usage`, authenticated with `Authorization: Bearer <key>`) |
| `CUSTOM_API_KEY` | Custom HTTP / OpenAI-compatible relay |

> ⚠️ The “Credential Name” field in the custom-model panel determines which ref stores the key. When switching providers, make sure this field changes with the template; otherwise the new key is written into the previous provider's credential name (overwriting the original key). Since v679, newly added models automatically follow the selected template.

## Uninstallation

```powershell
dsh plugin --profile web remove dsh-whale-widget
```

## Upgrading from the Old Manual Installation

If you previously installed it using the old manual method (copying `whale-balance.mjs` + editing `cordis.patch.yml`), clean it up first:

```powershell
$web = "$env:USERPROFILE\.dsh\profiles\web"

Remove-Item "$web\whale-balance.mjs" -ErrorAction SilentlyContinue
Remove-Item "$web\whale-balance.cjs" -ErrorAction SilentlyContinue
Remove-Item "$web\DSniang1.png" -ErrorAction SilentlyContinue
Remove-Item "$web\DSniang02.png" -ErrorAction SilentlyContinue
```

Then edit `$web\cordis.patch.yml` and remove this old patch:

```yaml
- insert:
    - id: whale-balance-widget
      name: ./whale-balance.mjs?v=1
```

If the file contains only that block, change it directly to:

```yaml
[]
```

After cleanup, run the installation command above again.

## Verification

```powershell
dsh --profile web --dump-config | Select-String -Pattern "whale"

curl http://127.0.0.1:3080/dsh-whale/balance.json
curl http://127.0.0.1:3080/dsh-whale/size.json
curl http://127.0.0.1:3080/dsh-whale/widget.js
curl http://127.0.0.1:3080/dsh-whale/image.png
curl http://127.0.0.1:3080/dsh-whale/audio.json
```

- `/dsh-whale/balance.json` → 200 JSON containing `{ok:true, totalBalance, currency, todayUsage}`
- `/dsh-whale/size.json` → GET returns configuration; PUT writes it
- `/dsh-whale/widget.js` → 200 JS (front-end widget core)
- `/dsh-whale/image.png` → 200 `image/png`
- `/dsh-whale/audio.json` → 200, containing `groups` / `fragments` (built-in fragment `exp_orb` = Minecraft · Experience Orb, `end_a` = A)
- `/dsh-whale/audio-fragment.wav?id=exp_orb` → 200 `audio/wav` (built-in task-completion sound; no user import required)
- `/dsh-whale/audio-fragment.wav?id=end_a` → 200 `audio/wav` (built-in task-completion sound A)
- `/dsh-whale/wait.json` → 200 JSON containing `{ok:true, pending}`; `pending` is the currently pending “question / approval” (`{kind:'question'|'approval', id, ts}`) or `null` — this is the data source for the “Question Notification / Approval Notification” sounds and persistent bubble (polled once per second by default)
- After pressing F5 in the browser, the widget appears in the bottom-right corner

> ⚠️ **About the `curl` commands above**: all **23** `/dsh-whale/*` routes are protected by the **DSH browser trust fence** (`connection.requestRejection`).
> Therefore, a **plain `curl` without session credentials returns 401** (and a forged `Host` header returns 403) — this is expected behavior, not a broken endpoint.
> To verify that an endpoint is alive, a **401/403** response already confirms that the route is registered and the trust fence is working; accessing the same path in a browser (with a session) is what returns 200.
> In addition, **since 0.3.15, write requests (`POST`/`PUT`/`PATCH`/`DELETE`) must also originate locally** (Host must be `127.0.0.1`/`localhost`/`[::1]`), otherwise they return 403 — see “Security Boundaries” above.

## FAQ

- **The widget does not appear**:
  - **Web (`dsh web`)**: confirm that the installation command succeeded; `dsh --profile web --dump-config` should show `dsh-whale-widget`; restart `dsh web`, then press F5.
  - **Official desktop client**: first confirm that it was installed into the correct profile — the desktop client reads the **`desktop` profile** and **cannot** use `--profile web` (`--profile desktop` is also rejected by the CLI by design). See “**Official Desktop Client (Electron) — Read This First**” above, and use the **two self-checks** there to determine whether the plugin was “not installed correctly” or “installed but not rendered”. **A restart is recommended even after a fresh install** (issue #162: hot application is not always sufficient).
- **Access validation for all plugin endpoints (`/dsh-whale/*`)**: by default, requests are accepted only from **loopback addresses** (`127.0.0.1` / `localhost` / `[::1]`), while cross-site markers (`Sec-Fetch-Site: cross-site`) and requests whose Origin and Host are not same-origin are rejected. This is a trust fence protecting the local API from “malicious web pages reading/writing local endpoints” (issues #92 / #136). If you place `dsh web` behind a **reverse proxy or LAN address**, declare allowed Hosts with an environment variable (comma-separated, optional ports), otherwise requests return 403:
  ```bash
  DSHW_TRUSTED_HOSTS=dsh.example.com,10.0.0.5:3080 dsh web
  ```
- **Images/sounds do not appear or play**: confirm that the plugin package contains a complete `assets/` directory (`DSniang1.png`, `*.mp3`, `minecraft-exp-orb.wav`, etc.); missing resources cause the related features to silently degrade.
- **With IDM / Xunlei / Free Download Manager / Motrix or another download manager installed, opening DSH always shows a “download confirmation” dialog whose target URL is the widget's audio** (issue #158): the browser integration for these managers intercepts page audio requests as download tasks. **Recommended solution: add local addresses to the manager's site exclusion list** (IDM: `Options → File Types / Site Exclusions`, add `127.0.0.1` and `localhost`; use the equivalent setting in other managers — look for “exclude local address / do not monitor this site”). Disabling the widget's sound switch does not eliminate the dialog because the audio elements are created during page initialization.
- **No sound and no bubble for questions / approvals**: both events are **enabled by default** (default behavior is **bubble only, no sound**). To hear sounds, go to “Menu → Sounds & Notifications → Global Settings”, **click the “Question Notification” / “Approval Notification” row** to expand it, enable `[✓]` at the left of “Question Notification Sound / Approval Notification Sound” (unchecked = silent, but the bubble still appears), then select a sound from the dropdown. If you do not want the notification at all, clear the master `[✓]` at the left of that section's entry row. (The summary on the right of the entry row updates in real time.)
- **Balance reports “DEEPSEEK_API_KEY not configured”**: configure the API key in DSH credentials; **or** log into a DeepSeek account using “Settings → Account & Balance” (supported by newer DSH versions). When no key is configured, the plugin automatically uses account-login mode, so you do not need to create a platform key.
- **The balance loads, but the plugin reports “Ledger unavailable / writing stopped to protect existing records”**: the ledger file (`.dshw-usage.json`) was externally corrupted or has an invalid structure, so the plugin **refuses to overwrite it** to avoid data loss. Back it up and rename it so the plugin can rebuild a new one, then use “Balance Reconciliation” if needed.
- **Saving settings returns `403` / configuration changes from another machine do not take effect**: since 0.3.15, **write operations must be performed on the same machine running DSH, with the interface opened through `127.0.0.1` (local address)**. Reading through a LAN address or reverse proxy is fine; writes are rejected. For remote administration, explicitly authorize the remote machine with `DSHW_ADMIN_HOSTS` (see “Credentials → Security Boundaries”).
- **The plugin says “This address is not a built-in endpoint for …; credentials were not sent”**: this is a 0.3.15 security policy — **custom endpoint addresses do not receive credentials by default**. If the address is your own gateway (New API / self-hosted, etc.), open the panel **locally** and enable “Allow credentials to be sent to custom addresses” for that model.
- **Today's Usage shows `--`**: wait for one successful balance observation; accounting starts from that observation, so spending before the baseline is outside the current interval.
- **Today's Usage differs from the official site**: first verify that you are comparing the same account, currency, and time interval. If there were top-ups or other balance adjustments, use “Little Whale Accounting → DeepSeek (Built-in) → Settings → Balance Reconciliation” to enter the actual credited amount. The balance API returns balance snapshots only and does not provide top-up transactions, so if top-ups and spending occur between the same two refreshes, the actual credited amount is needed for reconciliation.
- **Spending did not change after a top-up**: this is expected — top-ups do not increase spending. “Pending Balance Adjustment” appears above the number and prompts you to enter the cumulative amount credited during the current accounting interval.
- **Per-turn cost does not appear**: make sure the `[✓]` **at the left** of the “Per-Turn Cost Notification” row in “Sounds & Notifications → Global Settings” is enabled (the summary on the right directly shows `Disabled` or the current configuration). A conversation turn must fully end (`turn/end`) before it is settled. If a balance-change bubble and cost bubble compete for the same layer, the notification falls back to a centered card.
- **Per-turn cost bubble content**: “Sounds & Notifications → Global Settings” → **expand “Per-Turn Cost Notification”** → “Edit Notification Content” (modular; use `{cost}` for the amount). Auto-close seconds, notification volume, and task completion sound are configured in the same section.
- **Task completion sound does not play**: this switch is **enabled by default** (the default sound is built-in **`A`**, with built-in Minecraft · Experience Orb also available). Go to “Sounds & Notifications → Global Settings” → **expand “Per-Turn Cost Notification”** and confirm that `[✓]` at the left of the “Task Completion Sound” row is enabled (unchecked = silent). If a custom clip file has been deleted, it falls back or becomes silent.
- **After changing / deleting the API key, older accounting days became “Local Estimate ¥0.00”**: accounting books are separated by **key fingerprint** (one key = one ledger book), so changing the key means switching books. The data is **not lost**; all books remain under `accounting.books` in `.dshw-usage.json`. The current version shows dates from historical books normally (labeled “Observed Spending · Historical Account”) and displays “Detected N accounting books” at the top of the “Little Whale Accounting” panel. **The books are not added together** (the plugin cannot know whether the two keys represent the same account), but details for the same date can be viewed day by day under “Daily & Itemized Details” in that panel.
- **The whale cannot be dragged on mobile**: this version takes over dragging with touch events. Hard-refresh the page to get the latest `whale-widget.js`; if it still fails, report the browser model/version.
- **How do I open the menu after hiding the menu button?** Right-click the whale on desktop, or long-press the whale for about 1.5 seconds on mobile.
- **Front-end code changes do not take effect**: the host hot-reads `assets/whale-widget.js` based on mtime, so a **hard refresh** (Ctrl+F5) is enough. Changes to host-side `lib/index.js` require **restarting `dsh web`**.
- **I do not understand the model names**: the ledger records API model IDs; `deepseek-flash` means DeepSeek-V4.1-Flash. Legacy names `deepseek-v4-flash` / `-vision-exp` are now served by the same V4.1-Flash model and priced as Flash (the panel includes annotations).

## Pricing Table

Prices are shown in **CNY / million tokens** as `[off-peak, peak]`; peak = weekdays 09:00–12:00 and 14:00–18:00 (Beijing Time), off-peak is half the peak price, and since 2026-08-23 weekends are off-peak all day. The table is defined near the top of `lib/index.js` in `PRICING` / `BASE_PRICE` / `PRO_PRICE`; update it there when official pricing changes.

| Model | Cache hit | Cache miss | Output |
|---|---|---|---|
| `deepseek-flash` (DeepSeek-V4.1-Flash) | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro` (V4 Pro) | 0.15 / 0.30 | 4.5 / 9.0 | 13.5 / 27.0 |

> Legacy model names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` remain callable and are billed at the Flash rate.

## Development and Maintenance

- In the repository, `lib/index.js` is the host-side core, `lib/accounting.mjs` is the accounting core (fixed-point money math + observation/reconciliation ledger), and `assets/whale-widget.js` is the front-end core. Host-side changes (including the accounting core) require restarting `dsh web`; front-end-only changes take effect after a hard refresh.
- See [`whale-widget-prompt.md`](whale-widget-prompt.md) for the full specification, visual parameters, route list, architecture decisions, and generation prompt.
- Local development: after `dsh plugin --profile web add link:.`, front-end change → Ctrl+F5; host change → restart `dsh web`.

## Acknowledgements

- **0.3.16: “Old accounting books hidden after changing/deleting the API key”** (the amount on the switching day was overwritten, and earlier days degraded to “Local Estimate”) was reported by GitHub user [@0Sakura721](https://github.com/0Sakura721) in [#163](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/163). They **directly identified the root-cause locations** (the key hash used as the account identifier in `lib/index.js`, and `observeBalance` / `currentBook` in `accounting.mjs` reading only the active book) and provided supporting data — making it possible to confirm in one pass that “the data was not lost; there was simply no entry point to it.” 0.3.16 fixed this accordingly (dates from old books are shown normally and labeled “Observed Spending · Historical Account”). Thank you.
- **0.3.16: “Download manager intercepts widget audio requests”** (IDM and similar tools showed a download dialog every time DSH opened, even with sound disabled) was reported by GitHub user [@VaeKaras](https://github.com/VaeKaras) in [#158](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/158). The reproduction steps, intercepted URL pattern, and observation that “disabling sound does not help” were all very complete — the README now documents the known issue and site-exclusion workaround. Thank you.
- The official desktop-client behavior where **“a fresh install may still require restarting the client”** was confirmed by GitHub user [@MengLs1620](https://github.com/MengLs1620) in [#162](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/162), and the README's activation instructions were corrected accordingly. Thank you.
- **“Make the whale character respond to task state and provide sound notifications”** was proposed by GitHub user [@Jy-EggRoll](https://github.com/Jy-EggRoll) in [#160](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/160), who also **submitted implementation PR [#161](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/161)** (its `GET /dsh-whale/wait.json` data shape `{ok, pending:{kind,id,ts}}` matches the final mainline solution; this README's description of the `wait.json` route adopts that format). 0.3.16 implemented question/approval notification sounds and persistent bubbles using the mainline design (four-entry panel / per-event volume and preview / priority takeover). Thank you, and contributions toward further engineering improvements are welcome.
- The **0.3.15 credential-security fix** (a custom model could cause the host to use a real API key to request an arbitrary address, exfiltrating credentials) was responsibly reported by **Bilibili user “星丶白羽莲”**: they supplied reproduction steps, environment, and prerequisites, making it possible to tighten the boundary **without breaking legitimate self-hosted-gateway use cases**. Thank you for the support.
- **Reading balance from DSH account login state** (endpoint and authentication headers, credential-record location, recommended use of DSH's own `deepseekAccount` service, plus three integration pitfalls: account-identifier character set, promotional credit must be included in the baseline, and the service may not exist) was fully specified by GitHub user [@yybai25](https://github.com/yybai25) in [#157](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues/157), including a **reference implementation already verified on their own machine**. **0.3.14 implemented it accordingly** (calling only the DSH service and never touching the account token). Thank you for the contribution.
- The top-up accounting fix (separate accounting for balance increases and decreases, explicit balance-reconciliation formula, observation windows isolated by account/currency, atomic ledger writes, and migration backups) was independently designed and implemented as a working fix branch by GitHub user [@Yang-huai406](https://github.com/Yang-huai406). **0.3.1 ported and merged that design** while preserving this project's existing sound fixes. Thank you for the support.
- OpenCode Go subscription quota support (multi-window quota via `quota.json.windows`, per-window display with compact reset countdown, and window selection for the “Subscription Quota” module) was submitted by GitHub user [@ELFsay](https://github.com/ELFsay) ([#99](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/99)) and has been merged into `main`. Thank you for the contribution.
- **Contributors to historically merged PRs** (in merge order; all changes are now part of this repository's code/release process):
  - [@ztzpro](https://github.com/ztzpro) ([#1](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/1)): **converted the balance whale widget into a standard DSH plugin package** (today's `cordis.patch.yml` + bundle structure originates here);
  - [@under-the-ocean](https://github.com/under-the-ocean) ([#6](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/6) / [#7](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/7)): **automatic npm publishing triggered by pushes**, and npm upgrade to support Trusted Publishing (OIDC) — the current release workflow still uses this system;
  - [@21253soursweetlemon](https://github.com/21253soursweetlemon) ([#16](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/16) / [#18](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/18)): text-dialogue fallback when GIF loading fails, right-edge scrollbar avoidance, and **anchor-position memory** (stays attached through window changes and snaps back to its original position — the starting point of the current positioning system);
  - [@fangbm](https://github.com/fangbm) ([#15](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/15) / [#19](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/19) / [#31](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/31) / [#33](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/33) / [#46](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/46)): stable ordering for multi-currency balances, two per-turn-cost bubble defects, **all-day weekend off-peak pricing**, accounting currency awareness, and automatic Release creation with PR changelog during publishing;
  - [@xiaolinnnnnnn](https://github.com/xiaolinnnnnnn) ([#26](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/pull/26)): Windows desktop (Tauri v2) refactor.

## License

This project's **code** is open source under the **MIT License**. See [LICENSE](LICENSE) for details.

⚠️ **Artwork under `assets/` (images / animated images / sound effects) is not covered by the MIT License**: these assets are provided by the maintainer or generated using AI tools, distributed with the plugin **as-is** solely for operating this plugin, with no sublicensing granted and no claim that they are original works. See **[PROVENANCE.md](PROVENANCE.md)** for per-item sources, metadata-cleanup notes, and rights/takedown procedures.
