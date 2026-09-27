# Contributing Guide

Thank you for considering contributing! To make sure nobody's effort goes to waste, please take a minute to read this document first — whether you're a human, a whale girl, or a silicon-based lifeform!

## How Can I Contribute?

- Bug reports and feature suggestions are always welcome in the issues! Bugs **will** be fixed, but not every feature request will necessarily be accepted. This is intentional: we want to avoid the codebase becoming infinitely bloated and turning into the kind of software we all hate.  
  When opening an issue, please clearly state whether **you intend to implement it yourself** or whether **you would like the maintainer or another contributor to implement it**.

- Every PR must be linked to an issue and include `close #<issue-number>`.  
  You may freely submit PRs related to bug issues. However, `feat` (new feature) PRs and `refactoring` PRs must reference an issue that has already been approved by the maintainer. Otherwise, the PR will be closed.

## Anything Else I Should Know?

- PRs may be created entirely with AI assistance, but we would prefer the **PR description itself to be written by you**, explaining what you actually changed and why. PRs that appear to be entirely AI-generated may be closed.

- Please keep the code **simple and decoupled**. The existing huge single-file implementations and tightly coupled code will gradually be split apart. Please do not make future refactoring more difficult.

- **Translations are welcome.** Please preserve the original meaning, Markdown structure, technical identifiers, commands, file names, API paths, and code examples. If a translation was substantially AI-assisted, mentioning that in the PR description is appreciated.[^1]

## Repository Structure and Notes

If your PR changes the repository structure, please also update this section of `CONTRIBUTING.md` so it remains current.

### Branches

| What you want to change | Branch to use | Notes |
| ------------------------------------------------------------ | ---------------- | ---------------------------------------- |
| **Widget inside the DSH Web interface** (the main product of this repository, described by the README) | **`main`** | npm package `dsh-whale-widget` |
| Codex desktop companion widget | `For-Codex` | npm package `api-balance-whale`, **maintained independently** |
| Windows desktop version (Tauri) | `For–WinDesktop` | / |

At present, platform-porting changes should be submitted to the corresponding branch. PRs targeting `main` for platform-specific ports will be closed.

The three branches may eventually be consolidated into a single codebase — unless your multi-platform refactoring proposal has already been approved by the maintainer.

### Directory Structure

Below is what you will see when you first open the repository. Line counts are based on the LF contents stored in Git — the actual repository content, not CRLF line endings from a Windows working tree — and use the same counting method as the maintainer's self-check scripts.

```text
dsh-whale-widget/
├── package.json                     35 lines   DSH bundle plugin metadata (dsh.bundle.patch → cordis.patch.yml)
├── cordis.patch.yml                 15 lines   Plugin mount declaration
├── README.md                       471 lines   Installation / usage / pricing / complete directory structure (read before changing code)
├── PROVENANCE.md                    35 lines   Asset sources and license scope (required reading before modifying assets/)
├── whale-widget-prompt.md          202 lines   Complete specification, visual parameters, route list, maintenance prompt (entry point for further development)
│
├── lib/
│   ├── index.js                  3,953 lines   Host-side implementation: 23 routes + accounting integration + sound/image/character services
│   └── accounting.mjs              252 lines   Accounting core: fixed-point money operations + balance observation/correction ledger
│
├── assets/
│   ├── whale-widget.js          16,853 lines   Frontend widget implementation (**host hot-reads this single file by mtime**)
│   ├── DSH2.png / DSniang1.png / DSniang02.png   Character images and README display image
│   ├── rua.gif / bubble-petpet.gif / bubble-money1.gif
│   ├── Ya1.mp3 / Ya2.mp3 / D1.mp3 / D2.mp3  Preset sound effects
│   └── minecraft-exp-orb.wav / task-end-a.wav
│
├── tools/
│   └── z-layer-audit.mjs            59 lines   Overlay z-layer self-check (runs in CI and during releases)
│
└── .github/workflows/
    ├── ci.yml                       68 lines   Push / PR to main: layer audit + syntax checks + development-machine path scan
    └── publish.yml                 186 lines   **Manually triggered**: publish to npm + create GitHub Release
```

> The line counts above will naturally change as the code evolves and are **not hard requirements**. To verify or update them, use `git ls-tree -r --long main` to inspect the file list and `git show main:<path>` to count the lines yourself. After making changes, please also update the corresponding numbers in this section and in the README.

### Release Process (Read Before Changing the Version Number)

**Releases are triggered manually. A push does not publish a new version.**

- **Routine checks**: `.github/workflows/ci.yml` runs automatically on pushes to `main` and PRs targeting `main`. It performs checks only, has `contents: read` permissions, and **never publishes anything**. It runs three checks: the layer audit, syntax checks for the frontend and host files, and a scan ensuring that the release copy contains no absolute paths from the development machine.

- **Actual release**: `.github/workflows/publish.yml` is **only triggered manually** — either using **Run workflow** on the GitHub Actions page or with `gh workflow run publish.yml`. You can provide a "release reason", which will be placed at the beginning of the Release notes. It also supports a `dry_run` mode, which runs all release gates and generates the Release notes but **does not publish anything or create a Release**.

- **The version number is not incremented automatically**: the version that gets published is exactly the value of the `version` field in `package.json`.  
  Change the version → push → manually trigger the workflow → npm package is published and the `v<version>` tag and GitHub Release are created.

- **Why releases must be manual**: once a version with a particular version number has been published to npm, it **cannot be overwritten**; it can only be deprecated. Therefore, automatically publishing whenever a push happens to contain a version change would be unsafe. Someone must explicitly approve this step.

- **Pre-release gates**: before publishing, `publish.yml` reruns the same checks as `ci.yml` — layer audit + syntax checks + development-machine path scan. **If the audit fails, publishing is blocked.** Additionally, if the version number from `package.json` already exists on npm, the workflow skips publication rather than failing because of a duplicate release attempt.

- **The release copy must be stripped first**: before publishing the host package, `_strip-dev-paths.mjs --apply` must be run once. It removes development-machine candidate paths such as `RUA_GIF_CANDIDATES` / `IMAGE_CANDIDATES`. If this is forgotten, existing users may receive a package that attempts to read local paths that do not exist on their machines — exactly the problem that the `TestBox` scan in CI is intended to prevent.

- Releases may only be triggered from `main`. If **Use workflow from** is set to another branch when manually triggering the workflow, the workflow deliberately fails with an explanatory message.

### Runtime Data Location

All runtime data is stored under `$DSH_HOME` (default: `~/.dsh`):

| File / Directory | Purpose |
| -------------------------- | ---------------------------------------------- |
| `.dshw-size.json` | Appearance and switches (scale, volume, sound group, snapping-related settings) |
| `.dshw-usage.json` | Accounting ledger + daily balance observations + usage settings |
| `.dshw-turn.json` | Per-turn cost `seq` (prevents new turns from being mistaken for old ones after hot reload) |
| `.dshw-bubble.json` | Custom bubble configuration (click sequence + module library) |
| `.dshw-api.json` | Custom API model registry (**contains no keys**) |
| `.dshw-usage-archive.json` | Ledger archive (details: 90 days / 20,000 entries; daily summaries: 365 days) |
| `.dshw-codex.json` | Codex local-session statistics cache (**contains no credentials**) |
| `whale-roles/` | Custom character images + `roles.json` index |
| `whale-audio/` | Audio fragments + `audio.json` index |
| `whale-bubble-imgs/` | Bubble image library + `bubble-imgs.json` index |

### About Those Two Huge Files

`assets/whale-widget.js` (16,853 lines) and `lib/index.js` (3,953 lines) really are already huge. We know.

They are planned to be split into smaller modules over time. Until that refactoring is complete, please write new code in a refactoring-friendly way:

- Keep new logic as self-contained as possible.
- Minimize dependencies on global state.
- Do not increase the existing coupling.
- Avoid making the eventual split more difficult than it already is.

[^1]: The initial English translation of the repository documentation was AI-assisted using **OpenAI ChatGPT (GPT-5.6 Sol)**, with the technical structure, identifiers, commands, and Markdown preserved.
