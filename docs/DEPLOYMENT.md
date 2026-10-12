# Deployment status / 部署边界

Verified in this release: Windows anonymous local Convex deployment on
127.0.0.1:4212/4213, Vite on 127.0.0.1:5274, clean database bootstrap,
fresh owner provisioning, free mode. Backend code deployment by the local CLI
is local installation, not a public website deployment.

Docker / Linux VPS / Convex Cloud / Fly.io are **unverified** here. Original
AI Town Dockerfile (Node 18) and Compose (3210/3211/5173, latest images) do not
match this project and are excluded rather than advertised as working.
No cloud account or paid service was created, and no site was deployed.

Upstream references, not tested project recipes:
- https://docs.convex.dev/self-hosting
- https://docs.convex.dev/cli/local-deployments
- https://github.com/get-convex/convex-backend/tree/precompiled-2026-10-06-a3538c6/self-hosted

Before publishing a website: pin runtime/image versions, generate independent
signing/admin secrets, provision owner over an admin-only channel, set backend
HOUSE_ENVIRONMENT=production and HOUSE_LLM_UNLIMITED_DEV=0, disable test tools,
set correct CONVEX_SITE_URL/SITE_URL and frontend VITE_CONVEX_URL, retain database
volumes, set budgets, validate HTTPS/WebSocket /house/ deep links, permissions,
restart/recovery and backups. The current Python management scripts are strictly
for the documented local 4212/4213 runtime, not remote production administration.
Do not expose Vite, an anonymous development backend or the admin dashboard.

Convex backend FSL permits applicable uses but restricts competing substitutes;
hosting a personal house appears a permitted purpose (an inference, not a
license grant). Read the pinned license before redistributing native images.
