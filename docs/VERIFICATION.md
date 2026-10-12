# Release verification / 免费复现验收

2026-10-12, Asia/Shanghai. This is a local source release candidate, not a
production deployment certificate.

## Completed

- `npm ci`: clean dependency installation from lockfile; no copied node_modules.
- `npm run test`: 20 suites, 148 tests passed (free in-memory/mocked tests).
- `npm run build`: TypeScript + Vite passed; large bundle warning remains.
- Anonymous Convex backend started from an absent `.convex` at 4212/4213;
  3 residents bootstrapped from source, independently generated signing keys
  and owner credentials, frontend at 5274. Original ports/data were not used.
- 16 fresh runtime/browser checks passed: 3 residents, disabled model/no supplier
  key, anonymous init/private history/usage rejected, events continue without
  a browser, canvas renders, new owner logs in, private message saved and survives
  reload, mobile has no horizontal overflow, logout, no page errors or external
  browser requests, supplier key still absent.
- README screenshot was generated from the fresh mock database before login;
  reviewed visually. It contains public rule events, no private conversations
  or credentials. It is not evidence of live model conversation.
- After a second clean `npm ci`, the backend was restarted: same world,
  3 residents and monotonic event sequence recovered; model stayed disabled.

The first native startup used this machine's existing official runtime cache;
download on a machine without that cache is not independently re-tested. No
private database/admin key/API key was reused. The tested database contains only
new demo state and local test chat and is ignored, not included in Git/archive.

## Security maintenance remains

The pinned lockfile's `npm audit` reported **57** vulnerabilities:
1 low, 8 moderate, 48 high, 0 critical. `--omit=dev` reported **20**:
1 low, 6 moderate, 13 high. npm severity is a package advisory, not proof of a
reachable exploit in the active house UI; nevertheless these require review and
dependency maintenance before recommending public production hosting.
Clerk/legacy frontend and Tailwind bring some runtime-tree advisories; several
toolchain advisories require major upgrades and some have no available fix.
No forced mass dependency migration was performed during source packaging.

## Not certified

Paid provider integration in this copy, provider billing/model identity, production
Cloud/Docker/Linux/TLS, external load/security, full semantic cognition quality,
24-hour stability. Historical personal-project results are contextual claims,
not fresh release verification. No paid model was called during preparation.

After final publication changes, rerun `npm ci`, `npm run test`, `npm run build`
and `npm run check:release` in the new repository. Never point smoke tests at a
running personal database. Gate scans detect known patterns, not every possible
secret; independently review any newly added config/media/private artifacts.
