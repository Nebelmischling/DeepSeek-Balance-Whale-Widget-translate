# DeepSeek Balance Whale Widget — Complete Generation Prompt

> Purpose: Keep a persistent "whale balance widget" in the bottom-right corner of the DeepSeek Harness (DSH) Web interface.
> This prompt consolidates the complete requirements, architecture, all behavioral specifications, visual parameters, and lessons learned, and can be handed directly to an AI for reproduction or maintenance.
> Paths such as `C:\Users\Meteor\.dsh\profiles\web\` and `D:\TestBox\deepseek\` are local example paths. Replace them with the actual paths in your environment when migrating.
> Current version: v0.2.5 (including dual-mode today's usage, peak/off-peak pricing, random lines, sound effects, hamburger menu, and per-turn conversation cost tracking).

---

## 1. Requirements Overview

Implement a balance widget in the bottom-right corner of the DSH Web interface:

- Whale cut-out character (`assets/DSniang1.png`) + a **white speech bubble drawn in code** (SVG ellipse + tail), with three lines of text overlaid inside the bubble.
- Balance comes from the official DeepSeek API `GET https://api.deepseek.com/user/balance`. Select the display item from `balance_infos` (prefer CNY with balance > 0, otherwise any non-zero item, then fall back to the CNY item, and finally the first item; the order of the multi-currency array returned by the API is not fixed, so do not use `[0]` directly). Request header: `Authorization: Bearer <key>`. Read the key from the DSH credential service as `DEEPSEEK_API_KEY`.
- **Today's usage** has two modes selectable from the menu:
  - Whale ledger (default, no token required): automatically records observed balance differences, persists them to `.dshw-usage.json`, and resets/archives across days.
  - Real-time · Token: reads `DEEPSEEK_PLATFORM_TOKEN`, calls the platform usage API, and converts usage according to peak/off-peak pricing.
- **Per-turn conversation cost tracking**: the host plugin listens to `session/event`, captures real usage from `assistant/message` (`input/cache/output/reasoning tokens`), and aggregates by `turn`; on `turn/end`, it settles the cost for the turn (reusing the peak/off-peak pricing table) and writes it to `/dsh-whale/last-turn.json` (`seq` increments). The frontend polls once per second. When it sees a new `seq` and "Automatically show cost after each conversation turn" is enabled, it shows a cost bubble (two centered lines: style A `"Previous conversation turn cost:"` + style B in red `"¥X.XX"`). Auto-close time is configurable in seconds (`0` = do not auto-close). While the cost bubble is visible, balance changes must not trigger a normal bubble.
- Supports: dragging, quarter-zone snapping to all four edges (top/bottom/left/right), horizontal mirroring when snapped left (text mirrored back for readability), hamburger menu (size/sound/volume/usage mode/peak text/bubble toggle/per-turn cost toggle and auto-close time), press squish/bounce + sound effects, rolling balance-number animation, 60-second automatic refresh + click-to-refresh, random phrase bubbles (click to switch/close), and **automatic activation every time the interface opens (persistent auto-start)**.

## 2. Architecture (Read This First)

Definitions of dynamic Cordis plugins (`cordis_define`/`cordis_run`) exist only in process memory and must be run again after a page reload, so they **cannot** satisfy "automatically enable every time the interface opens". Therefore use a **standard DSH bundle plugin** (npm package + `dsh.bundle.patch`) mounted into the Web composition:

1. **Plugin package**: `dsh-whale-widget/package.json` declares `dsh.bundle.patch`; `lib/index.js` is the host plugin entry point (ESM).
2. **Export format**: `const name = 'dsh-whale-widget'; const inject = ['webServer', 'credentials']; function apply(ctx) {...}; export { name, inject, apply }` (named exports, matching the `name` in `package.json`).
3. **Mount declaration**: inside the package, `cordis.patch.yml` uses `name: dsh-whale-widget` to insert the plugin into the configuration tree — **do not** use the form `name: ./xxx.mjs?v=N` (that is the hot-reload approach for manually copied profile files; distributing it to others would break startup because the path does not exist).
4. **Install/update**: `dsh plugin --profile web add dsh-whale-widget`; for local development, from the **repository root** (the directory containing `package.json`) use `dsh plugin --profile web add link:.` (note: the repository root itself is the plugin package, so **do not** write a subdirectory path such as `link:.\dsh-whale-widget`, otherwise pnpm will install it as a normal dependency instead of a bundle layer). Restart `dsh web` after installation.
5. **Portable paths**: at the top of `lib/index.js`, derive `PACKAGE_ROOT` using `fileURLToPath(import.meta.url)`. Images/sounds should prefer `path.join(PACKAGE_ROOT, 'assets', ...)`; size/ledger data should be written under `$DSH_HOME` (`process.env.DSH_HOME || ~/.dsh`). Old machine-specific absolute paths should only be used as fallbacks to allow smooth upgrades from old manual installations.
6. **Host context**: the host plugin runs in the host process (not in a dynamic sandbox) and can directly use global `fetch` (including custom headers), `node:fs`, `AbortSignal.timeout`, and other Node APIs.
7. **Lifecycle**: collect every disposer returned by `webServer.register` / `tapIndex` into an array and attach cleanup to `ctx.effect(() => () => { for (const d of disposers) try { d() } catch {} })` so HMR reloads automatically clean up registrations.

> Compatibility note: if an older dynamic plugin already occupies routes with the same names, run `cordis_stop`/`cordis_undefine` first to release them; otherwise registration will fail because of duplicate paths.

## 3. Host Side: webServer Routes

| Route | Method | Behavior |
|---|---|---|
| `/dsh-whale/image.png` | GET | Reads `assets/DSniang1.png` from the plugin package (falling back to the old local absolute path, with bytes cached in memory), `Content-Type: image/png`, `Cache-Control: no-store`; return 404 if reading fails. |
| `/dsh-whale/balance.json` | GET | Returns balance JSON: `{ok:true, totalBalance, currency, updatedAt, todayUsage, isPeak, usageMode}` or `{ok:false, code, error, transient?}`. **Always return 200 + JSON under all circumstances**, never hang or return an empty response. |
| `/dsh-whale/last-turn.json` | GET | Returns the cost of the most recently completed conversation turn: `{ok, seq, turn, amount, tokens, ts}`; if no record exists, `turn:null`. `seq` increments on every settlement and is used by the frontend to detect a "new turn". |
| `/dsh-whale/rua.gif` | GET | Reads `assets/rua.gif` from the plugin package (falling back to the old local absolute path, with bytes cached in memory), `Content-Type: image/gif`, `Cache-Control: no-store`. |
| `/dsh-whale/size.json` | GET / PUT | Persists widget configuration. GET returns `{scale, sound, vol, soundSet, usageMode, peakMode, bubbleOn, turnCostOn, turnCostCloseMs}`; PUT reads the body and writes it to disk (prefer `$DSH_HOME/.dshw-size.json`, fall back to `$DSH_HOME/profiles/web/` and old local paths), with CORS headers. Clear the balance cache when `usageMode` changes. |
| `/dsh-whale/sound/press.mp3` | GET | Returns the appropriate press sound based on `?set=duck|fx1` (`Ya1.mp3` / `D1.mp3`), reading from disk on every request, `no-store`. |
| `/dsh-whale/sound/release.mp3` | GET | Same as above, but for release sounds (`Ya2.mp3` / `D2.mp3`). |
| `/dsh-whale/widget.js` | GET | Returns the page widget source (vanilla JS), `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-store`. |
| `tapIndex` | — | Injects `<script defer src="/dsh-whale/widget.js"></script>` before `</body>` for every index.html response (idempotently skip if `html.indexOf('/dsh-whale/widget.js') !== -1`). |

### Robustness Requirements for Balance Fetching (Host)

- `fetch(BALANCE_URL, { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000) })`.
- **Retry**: retry network errors/timeouts/5xx once (500 ms delay); do not retry 4xx.
- **Transient-failure fallback**: for network errors/timeouts/5xx, if a cache exists, return the most recent successful value and mark it `stale: true` (the widget keeps showing the old balance without flashing an error). Do not fall back for 4xx; log via `console.error`.
- 25-second in-memory cache + deduplication of in-flight requests (reuse the same promise).

### Today's Usage (Two Modes)

**Whale ledger (default, usageMode='ledger')**:
- After every successful balance fetch, record the observed `totalBalance` into `.dshw-usage.json`: `{ date, lastBalance, lastCurrency, todayUsage, history }`.
- During the same day: if the balance **decreases** compared with the previous observation, add the difference to `todayUsage`; if the balance increases (top-up), do not subtract anything, only update `lastBalance`.
- **Currency-aware**: if the observed currency differs from `lastCurrency`, only reset the baseline (`lastBalance`/`lastCurrency`) and do not record a difference — the numeric jump comes from a currency switch, not real spending (#13: when currency selection used `[0]`, random switching between CNY/USD incorrectly recorded each jump as spending, creating thousands of yuan of fake daily usage).
- Across days: archive `todayUsage` into `history` (keep the most recent 30 days), reset the current day to zero, and set `lastBalance` to the current balance.
- This mode does not require `DEEPSEEK_PLATFORM_TOKEN`; it only relies on `DEEPSEEK_API_KEY` to fetch the balance.

**Real-time · Token (usageMode='token')**:
- Read `DEEPSEEK_PLATFORM_TOKEN` (platform session token, not API key), request `https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=<local-midnight>&end=<+86400>&tz=28800`, with header `Authorization: Bearer <token>` and a 15-second timeout.
- Response structure: `data.biz_data.series[]`, each item `{model, buckets:[{time, usage:{RESPONSE_TOKEN, PROMPT_CACHE_HIT_TOKEN, PROMPT_CACHE_MISS_TOKEN}}]}`. **Important: the API returns token counts only, not monetary amounts**.
- **Peak/off-peak price conversion**: classify each hourly bucket by its exact hour in Beijing time (UTC+8), then apply the `PRICING` table (price per million tokens) and sum:
  - Peak hours: weekdays 9:00–12:00 and 14:00–18:00; **from 2026-08-23 onward (Beijing time), weekends (Saturday/Sunday) are entirely billed at off-peak rates**.
  - Prices (off-peak / peak): cache-hit input 0.05 / 0.10 CNY; cache-miss input 1.5 / 3.0 CNY; output 4.5 / 9.0 CNY.
  - The pricing table is defined near the top of `lib/index.js` in the `PEAK_HOURS` / `BASE_PRICE` / `PRO_PRICE` / `PRICING` constants. The weekend off-peak effective boundary is `WEEKEND_VALLEY_FROM_SEC`. Update these when DeepSeek changes pricing.
- If no token exists or the token is invalid, automatically fall back to ledger mode (`usageMode` is still reported as `'ledger'`).

### Per-Turn Conversation Cost (Host, Session Event Listener)

- The host plugin listens to all appended session event streams with `ctx.on('session/event', ...)` (Cordis global listeners can receive them; scope propagates upward by default).
- Capture events where `type === 'assistant/message'` and `data.usage` is present: `usage = { inputTokens, cacheReadTokens, outputTokens, reasoningTokens }` (real token counts returned by the model, not estimates).
- Aggregate by `data.turn`: sum usage across multiple steps of the same turn; reuse the peak/off-peak pricing table for cost conversion: `cacheRead→p.hit[off]`, `input→p.miss[off]`, `output+reasoning→p.out[off]` (`off` = whether the current period is peak).
- When `type === 'turn/end'`, settle the turn: write `lastTurn = { turn, amount, tokens, ts }`, then increment `lastTurnSeq`.
- Frontend polls `/dsh-whale/last-turn.json` every second. On the first response, it only aligns the `seq` (does not show an old turn). After that, a larger `seq` means a "new turn" → show the cost amount bubble.
- While the cost amount bubble is active: `render()` / `animateAmount()` must skip updates when protected by `costBubbleActive` (so balance rendering/animation does not overwrite the cost lines); balance changes must also not show a normal bubble (`showBubble()` includes `if (costBubbleActive) return`).
- Close behavior: click the bubble to close it manually, or automatically close after `turnCostCloseMs` (seconds × 1000); `0` means do not auto-close.

## 4. Page Widget (widget.js, Vanilla JS)

Page context (no sandbox), wrapped in an IIFE, with an idempotency guard on the first line: `if (window.__dshWhaleWidget) return; window.__dshWhaleWidget = true`.

### DOM Structure

```text
div.dshwv-root (position:fixed, handles positioning and mirroring)
├─ div.dshwv-body (absolute positioning fills parent, handles press squish/bounce scaling)
│  ├─ img.dshwv-img (src=/dsh-whale/image.png, cut-out whale, bottom-right 59.45%)
│  └─ div.dshwv-bubble (SVG bubble: large ellipse + tail + two small bubbles, z-index:1)
│     ├─ img.dshwv-gif (random phrase gif, hidden by default)
│     └─ div.dshwv-text (three lines: label / amount / hint, absolutely centered)
├─ button.dshwv-menu-btn (three-dot button in top-right, visible on hover)
└─ div.dshwv-menu (hamburger menu: size/sound/volume/usage/peak/bubble toggle + divider + per-turn cost toggle/auto-close time)
```

- The menu is mounted directly under `document.body` (`position:fixed`) and positioned above the button when opened (right edge aligned with the button's top-right; when mirrored on the left, align to the top-left).
- Bubble SVG geometry (1026×700 canvas): large ellipse center (454,247) rx373 ry232 (bbox x81..827 / y15..479); tail half-ellipse connects (301,465)-(413,484), center (356,472), tilted 10°; small bubble 1 at (352,561) rx37.5 ry26; small bubble 2 at (442,646) rx24.5 ry18; stroke `#203170`, width 18, `stroke-linejoin:round`. The three graphic elements use classes `dshwv-bshape / dshwv-b1 / dshwv-b2`, with `transform-box:fill-box`.

### Positioning and Snapping (Critical: Always Use left/top Pixel Positioning)

- **Default position**: bottom-right (initialize `state.left/top` from `getBoundingClientRect`).
- **Quarter-zone snapping** (horizontal and vertical axes evaluated independently, freely composable without interfering with each other): center x < viewport width/4 → snap to left edge; center x > 3×viewport width/4 → snap to right edge; center y < viewport height/4 → snap to top edge; center y > 3×viewport height/4 → snap to bottom edge; otherwise keep the release-point coordinate.
- **Why left/top pixels are mandatory**: if right snapping switches to `left:auto; right:0`, CSS transitions cannot interpolate between `auto` and numeric values, causing right-edge snapping to jump instantly (flash).
- **Anchor preservation**: store snap info (`state.h/v` + offsets) in state; `settle()` recalculates from anchors on window resize and size adjustments, keeping snapped widgets attached to the edge. Unanchored axes are only clamped to the viewport.
- **Fixed-corner scaling**: when resizing, keep the whale-side corner fixed (not mirrored = bottom-right, mirrored = bottom-left) so the whale does not "wander".
- Dragging uses pointer events + `setPointerCapture`; squared displacement ≥ 9 (>3 px) counts as a drag, otherwise it is a click (clicking the whale = open bubble + refresh). During dragging, use `transition:none` for 1:1 pointer tracking; on release, call `settle()` to animate smoothly into the snapped position.

### Horizontal Mirroring When Snapped Left

- When snapped to the left edge, add class `dshwv-left` to the root element → `transform: scaleX(-1)` mirrors the whole widget.
- Mirror the text block back with `scaleX(-1)` to keep text readable; numeric/amount content remains unchanged.
- Preserve the mirrored form while dragging; on release, determine from the drop position whether it should stay mirrored.
- **Critical**: transitions on the text block must be **split by property** — `transition: opacity .16s ease .36s, transform .3s ease`; otherwise the opening delay also delays `transform`, making the text lag and flicker during mirroring.

### Press Squish/Bounce (Toy Effect)

- Apply scaling on `.dshwv-body`: pointerdown → `scaleY(0.88) scaleX(1.05)`; pointerup/cancel → rebound to `scaleY(1) scaleX(1)`.
- `transform-origin: 50% 100%` (bottom center) — the bottom coordinate remains fixed while pressed.
- Transition: `transform .22s cubic-bezier(.34,1.56,.64,1)` (overshoot spring effect).
- Sound effects: play press sound on pointerdown (if held longer than the press sound, play release on pointerup; for short presses, overlap release with the last 100 ms of press — calculate using duration to avoid repeatedly playing the same file and cutting it off).

### Hamburger Menu

- Hovering the whale reveals the three-dot button in the top-right; click to toggle the menu.
- Row 1, size: range 0.6–2.5 (step 0.1) + number 1–20 (linear mapping 1→0.6, 20→2.5, default 1.5=10); while dragging the slider, keep the root element at `transition:none` (CSS transitions are otherwise evaluated after the JS block and cause jitter because scaling is applied around the wrong center).
- Row 2, sound: select `Yellow Duck` (duck, Ya1/Ya2) / `Sound Effect 1` (fx1, D1/D2).
- Row 3, volume: range 0–1; when volume is 0, sound is automatically disabled.
- Row 4, usage: select `Whale Ledger (Recommended)` (ledger) / `Real-time · Token (Usage: ask dsh)` (token).
- Persist all settings via PUT `/dsh-whale/size.json`; restore them with GET when the page opens.
- Menu uses `color-scheme:light` to remain readable under dark themes.

### Balance Refresh and State Machine

- **Automatic refresh**: `setInterval(refresh, 60000)`; **manual refresh**: click the whale (also opens the bubble).
- During the request, the hint line displays `"Loading…"` (keep the amount visible); when data arrives, **fade out then fade in** to `"Used today ¥X"`.
- Automatic refresh is silent; **only when the balance actually changes** should it show the bubble + roll the number (700 ms cubic ease-out) + start the rolling animation after 300 ms; settle after 900 ms.
- Client fetch has a 25-second AbortController timeout.
- State display: initial loading → amount `…` + `"Loading…"`; normal → amount + `"Used today ¥X"`; error → keep the most recent balance + show error information.

### Random Phrase Bubble (Click to Switch/Close)

- Click whale → bubble opens with normal content (balance + today's usage), auto-closes after **5 seconds** total.
- **First click on the bubble** → fade out/in to switch to a random phrase segment; **click again** → close (switching does not extend the total duration).
- Six phrase groups are selected by weighted random sampling (`pickRandomLines`):
  1. Weight 20: three lines (style A `"Current period:"` / style B period `"Off-peak"` in green or `"Peak"` in red (P-size, slightly smaller than amount style B) / style C `"Used today ¥X"`)
  2. Weight 7: centered B `"Good model... ↓"` / `"Good girl...↓"`
  3. Weight 7: centered A, six random lines (`"I don't know what users need me for…"` / `"Do I need to make money too?"` / `"I'm going to eat now"` / `"Stress is a big fat blue fish"` / `"DeepSleep"` / `"The user is completely furious"`), **automatic line wrapping** (`.dshwv-wrap`, max-width 560u)
  4. Weight 3: centered A, three random lines (`"Big spender"` / `"token freedom"` / `"cheap stuff"`), **automatic line wrapping**
  5. Weight 1: three lines `"What does"` (A) / `"mean"` (B) / `"this mean...?"` (A)
  6. Weight 1: centered B `"Oh whale whale... "`
- Style tiers: A=label (66u 600), B=amount (128u 800), P=period (104u 800), C=hint (56u gray #9fb0d9); `--dshw-u = var(--dshw-base)/1026`.
- Switching random segments uses a **fade-out/fade-in** (inline opacity transition 190 ms out / 220 ms in), separate from the bubble open/close animation.

## 5. Visual and Geometry Parameters (Exact Values)

| Item | Value |
|---|---|
| Whale character image | `assets/DSniang1.png`, 610×610 cut-out, bottom-right `right:0;bottom:0;width:59.45%` |
| Bubble canvas | SVG created in code, viewBox 0 0 1026 700, geometry described above |
| Bubble stroke | `#203170`, width 18, rounded joins |
| Text block position | `left:44.25%; top:38%; transform:translate(-50%,-50%)`, `text-align:center`, `color:#536ba9` |
| Linked font sizing | `--dshw-u: calc(var(--dshw-base) / 1026)`; A=66/600, B=128/800 (line-height 1.05), P=104/800, C=56/#9fb0d9 |
| Amount format | CNY → `¥ ` + toFixed(2); other currencies → `amount currency` |
| Widget base size | `--dshw-base: clamp(122px, calc(min(250px, min(100vw,100vh)*0.28) * var(--dshw-scale)), 625px)`; scale 0.6–2.5 (menu 1–20) |
| Snap threshold | Center point on each axis falls within the outer 1/4 zone (<1/4 or >3/4) |
| Click threshold | Displacement < 3 px (squared distance < 9) |
| Mirror animation | 0.3s ease (root + text synchronized; text transition split by property) |
| Press squish/bounce | scaleY(0.88) scaleX(1.05), origin 50% 100%, 0.22s cubic-bezier(.34,1.56,.64,1) |
| Number animation | 700 ms cubic ease-out (requestAnimationFrame) |
| Automatic refresh | 60 s; change notification 900 ms; bubble auto-closes after 5 s |
| Configuration persistence | `$DSH_HOME/.dshw-size.json` (fall back under profile); ledger `$DSH_HOME/.dshw-usage.json` |
| Peak detection | Beijing time: weekday peak 9–12 and 14–18; from 2026-08-23 onward weekends are entirely off-peak |
| Sound effects | press=Ya1/D1, release=Ya2/D2; read from disk on every request, no-store |
| z-index | 9999, `position: fixed`; menu 10000 |

## 6. Key Technical Conclusions (Lessons Learned for Reuse)

1. **Dynamic plugins cannot auto-start**: definitions live in process memory and must be run again after a page reload; for persistent auto-start, mount the plugin statically into the profile composition.
2. **Published-package patch should not use `?v=`**: `cordis.patch.yml` should contain `name: dsh-whale-widget` (bundle plugin name); `?v=N` is only for local hot reload of manually copied profile files (`.mjs` ESM cache busting via query string). Shipping it to others breaks startup because the path does not exist.
3. **Profile patch hot reload**: during local development, `cordis.patch.yml` is watched live by `watchUserPatches`; changes take effect immediately without a restart.
4. **Cache busting for hot reload**: local plugins must use `.mjs` + `name: ./xxx.mjs?v=N`, incrementing N every time code changes. `.cjs` require cache ignores query strings and was verified not to hot-reload.
5. **webServer handler exceptions**: an async handler that throws is caught by the dispatcher and results in a 400 empty response; routes must always return JSON (wrap the entire handler in try/catch).
6. **CSS transitions cannot interpolate `auto`**: always use left/top pixel positioning.
7. **Transition delay affects every property**: when you need "text appears with a delay but mirroring happens immediately", split transitions by property: `transition:opacity .16s ease .36s,transform .3s ease`.
8. **Slider jitter**: CSS transitions are evaluated after the JS block; keep `transition:none` for the entire slider drag.
9. **Platform usage API returns no monetary amount**: it only returns token buckets, so you must calculate cost yourself using peak/off-peak pricing. The API does not accept an API key; it requires a platform session token (`DEEPSEEK_PLATFORM_TOKEN`).
10. **Ledger-mode accuracy note**: it accumulates only "observed balance decreases"; spending while DSH is closed is missed (the next observation becomes the new baseline). Only token mode can provide exact usage figures.
11. **tapIndex idempotency**: check whether the script tag already exists before injecting it; attach the disposer via `ctx.effect` to avoid duplicate injection after HMR.
12. **Sound cache**: read audio files from disk on every request + `no-store` so replacing an mp3 does not leave stale bytes in the browser cache.

## 7. Deployment and Verification

1. Install `dsh-whale-widget` as a local package: from the repository root run `dsh plugin --profile web add link:.` (or, after publishing, `dsh plugin --profile web add dsh-whale-widget`), then restart `dsh web`.
2. Verify: `curl http://127.0.0.1:3080/dsh-whale/image.png` (200 image/png), `/dsh-whale/balance.json` (200 JSON including real balance and todayUsage), `/dsh-whale/size.json` (GET/PUT read-write loop), `/dsh-whale/widget.js` (200 JS), `/dsh-whale/sound/press.mp3?set=duck` (200 audio/mpeg), `curl http://127.0.0.1:3080/` (index contains the widget.js script tag).
3. After a browser **F5 refresh**, the widget appears.
4. Interaction self-test: dragging + quarter-zone snapping to all four edges (including corner combinations), mirroring when snapped left, menu (size/sound/volume/usage), press squish/bounce + sound effects, click whale to open bubble → first bubble click switches to a phrase → second click closes, 5-second auto-close, 60 s auto-refresh, rolling number animation when balance changes, ledger mode cross-day archiving.
