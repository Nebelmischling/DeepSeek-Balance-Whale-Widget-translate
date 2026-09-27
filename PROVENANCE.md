# Asset Sources and License Scope (PROVENANCE)

The **code** in this repository is licensed under the MIT License (see [`LICENSE`](LICENSE)). The **art assets** (images / animations / sound effects) in the `assets/` directory are **not covered by the MIT License** and are provided **as-is** according to the terms below.

## 1. License Scope

| Scope | License |
|---|---|
| `lib/`, `cordis.patch.yml`, `package.json`, documentation, and maintenance scripts | **MIT** (see `LICENSE`) |
| `assets/**` (images / animations / sound effects) | **MIT does not apply**: provided by the maintainer or generated using AI tools, distributed **as-is** with the plugin solely for use with this plugin; no sublicensing rights are granted, and no claim is made that the assets are original works. |

Reason for this separation: the code can be licensed explicitly, while the origin and rights status of art assets often cannot be documented with absolute certainty. Rather than granting a license that cannot be fully substantiated, the scope is stated transparently, with a commitment to address any rights claim that is received (see Section 4).

## 2. Itemized Sources

| File | Source / Notes |
|---|---|
| `DSniang1.png` (whale character; bubble drawn in code) | Image **generated using an AI tool**, then manually selected and cropped. The generation tool and original source **can no longer be determined** (embedded metadata has been removed; see Section 3). |
| `DSniang02.png` | Same as above (backup full image, retained for compatibility with older manual installation paths). |
| `DSH2.png` (display image at the top of the README) | Designed and laid out by the maintainer using an online design tool; replaced with a cleaned version in 2026-09 (all embedded metadata removed). |
| `rua.gif`, `bubble-petpet.gif` | Built-in animated image assets. |
| `bubble-money1.gif` | Built-in bubble image (illustration used by the default low-balance warning content). |
| `Ya1.mp3` / `Ya2.mp3`, `D1.mp3` / `D2.mp3` | Built-in sound effects (press / release). |
| `minecraft-exp-orb.wav`, `task-end-a.wav` | Built-in task-completion sounds (Minecraft experience orb / preset A). |

## 3. Metadata Cleanup

Image assets previously contained embedded XMP attribution metadata from design tools (tool name, template name, account ID, and even third-party brand names). Since **0.3.1**, all distributed PNG files have had the `eXIf` / `iTXt` / `tEXt` / `zTXt` metadata chunks **removed**, retaining only the chunks required for rendering: `IHDR` / `sRGB` / `gAMA` / `pHYs` / `IDAT` / `IEND`.

- Verification: parse the chunk sequence of each PNG and confirm that no text / EXIF chunks remain;
- Removal: rewrite the PNG chunk by chunk without touching pixel data (`IHDR` / `IDAT` / `IEND` are preserved unchanged), so the visual output remains exactly the same.

## 4. Rights Claims / Takedown

If you believe that any asset in `assets/` infringes your rights, please open an issue in this repository and specify the **file name** and the **basis for the claim**. After verification, we will **replace or remove it immediately**, without additional conditions. We also welcome freely redistributable replacement assets.
