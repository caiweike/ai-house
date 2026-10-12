# Third-party notices

## AI Town and project additions

AI Town by a16z-infra, based on commit
`8e05997f2409275669c8344b84a51692e83f3f33`:
https://github.com/a16z-infra/ai-town/tree/8e05997f2409275669c8344b84a51692e83f3f33

Its world engine, pathfinding, conversations, scheduling, persistence, utility
and legacy frontend source are retained/adapted under MIT. Preserve the original
2023 a16z-infra copyright and permission notice in `LICENSE`.
AI Living House adds the Chinese indoor observer UI, house routines/events,
owner/password auth, private chat, bounded model gateway/ledger and cognition.
Project additions and project-drawn artwork use MIT. MIT does not override the
specific licenses below or any installed dependency license.

## Embedded source exceptions

- `convex/util/FastIntegerCompression.ts`: derived from Daniel Lemire and
  contributors' FastIntegerCompression.js, adapted to TypeScript by AI Town.
  **Apache-2.0**, not MIT. Source attribution/change notice retained; full license
  supplied as `licenses/Apache-2.0.txt`.
  https://github.com/lemire/FastIntegerCompression.js
- `convex/util/xxhash.ts`: Jason Dent / Jason3S/xxhash, copyright 2019,
  MIT notice retained inside the file. https://github.com/Jason3S/xxhash

## Convex runtime versus SDK

- npm `convex` **1.46.0**: Apache-2.0, verified against its installed package's
  `LICENSE`. A copy is in `licenses/Apache-2.0.txt`.
- Native backend **precompiled-2026-10-06-a3538c6**: **FSL-1.1-Apache-2.0**.
  License checked at the pinned release:
  https://github.com/get-convex/convex-backend/blob/precompiled-2026-10-06-a3538c6/LICENSE.md
  Copy: `licenses/Convex-backend-FSL-1.1-Apache-2.0.md`.
  FSL restricts competing substitutes and grants a future Apache license after
  each version's second release anniversary. The native binary is downloaded
  separately, not bundled in this source repository or licensed as MIT.
  A personal AI house appears to be a permitted purpose; this is an inference
  from the license and not a claim that every hosted business use is allowed.

## npm dependencies

`docs/dependency-licenses.json` records installed names, exact versions and license
metadata for this lockfile. React / PixiJS / Vite / TypeScript / Convex Auth and
other packages retain their own notices. `memorystream` exposes legacy plural
`licenses` metadata, and `spawn-command` omits license metadata; their installed MIT
license files were inspected. `caniuse-lite` uses CC-BY-4.0 and `spdx-exceptions`
CC-BY-3.0; their data/attribution must be retained if redistributing dependencies.

`node_modules` and `dist` are not redistributed in this source release. If you
ship a compiled bundle/container later, collect all applicable installed license
texts and notices for that artifact, including the runtime FSL when bundled.

## Resources

See `ARTWORK.md`. The house renderer and house SVG are project-drawn. Unverified
upstream pixel GUI assets, raster maps/sprites, music/fonts/favicon and editor
are excluded. Removing them does not remove the running house's renderer/layout.
The remaining simple source SVG icons retain AI Town's MIT notice.

Agent-Worlds was only a research reference; no repository, backend or assets from
it are included in this release. No second world engine is bundled.
