# Release verification / 免费复现验收

2026-10-12, Asia/Shanghai. This is a local source release candidate, not a
production deployment certificate.

## Completed

- `npm ci`: clean dependency installation from lockfile; no copied node_modules.
- `npm run test`: 20 suites, 148 tests passed (free in-memory/mocked tests).
- `npm run build`: TypeScript + Vite passed; large bundle warning remains.
- `npm run lint`: exits successfully with 979 existing warnings and no errors.
- After the Tailwind v4 migration, a fresh free-mode browser smoke passed 16 checks: owner login, private-chat persistence, mobile layout, no browser errors/external requests, and no supplier key. No paid model was called.
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

## Dependency security maintenance

After dependency maintenance on 2026-10-12, `npm audit` and
`npm audit --omit=dev` both reported **0 known advisories** from the current npm
registry data. The refresh removes an unused Clerk login component and package,
updates Jest/ts-jest and TypeScript ESLint, migrates Tailwind to v4, and moves
build/type-only packages to `devDependencies`. A root override pins `argparse`
2.0.1 because the test tooling's nested `js-yaml` 3 chain otherwise selects
`sprintf-js` 1.0.3, while the current advisory affects every published
`sprintf-js` version through 1.1.3. Tests and a clean install pass with the override.

This is an advisory snapshot, not proof that the project is free of all security
issues or that future registry data will remain unchanged. npm still reports
deprecation notices for Lucia 3 and some older transitive packages; these are
maintenance notices, not current `npm audit` findings. Re-run both audit commands
when updating the lockfile and before a production deployment.

## Not certified

Paid provider integration in this copy, provider billing/model identity, production
Cloud/Docker/Linux/TLS, external load/security, full semantic cognition quality,
24-hour stability. Historical personal-project results are contextual claims,
not fresh release verification. No paid model was called during preparation.

After future dependency changes, rerun `npm ci`, `npm run test`, `npm run build`,
`npm run lint`, and `npm run check:release`. Never point smoke tests at a running
personal database. Gate scans detect known patterns, not every possible secret;
independently review any newly added config/media/private artifacts.
