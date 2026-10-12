# AI 小屋 · AI Living House

一个基于 [AI Town](https://github.com/a16z-infra/ai-town) 改造的中文 AI 合租屋。
三位居民住在连通的卧室与客厅里，服务端持续推进活动、保存事件；
浏览器只是观察窗口。屋主可私聊，模型回复与模拟内容有独立来源标签。

A Chinese AI living house adapted from AI Town. Three residents share an indoor
world maintained by a persistent Convex engine. React/PixiJS observes the world;
owner-only chat, bounded model conversations and source-linked cognition live
on the server. Each installation creates its own database and credentials.

![Fresh local house, mock mode](docs/images/house.png)

## 技术与来源 / Stack and provenance

React 18、PixiJS 7、TypeScript、Vite 7、Convex 1.46.0、Convex Auth。
复用 AI Town `8e05997f2409275669c8344b84a51692e83f3f33` 的世界引擎、寻路、
状态机、事务持久化、调度与历史插值。新增室内地图/中文界面、三居民人格、
屋主用户名认证、私聊 ACL、事件追溯、统一 LLM 网关与预算账本、长期记忆、
观点/关系修订及认知纪元隔离。没有叠加第二套世界后端。

The MIT license covers AI Town code and project additions. Convex's native backend
has its own FSL license; it is downloaded separately and is not relicensed as MIT.
See [third-party notices](THIRD_PARTY_NOTICES.md) and [artwork](ARTWORK.md).

## 功能和验证边界 / Features and limits

- 三位居民、卧室/公共区、移动/阅读/休息/思考/有限交流，持久世界和事件。
- 屋主用户名/密码认证、独立私人聊天、服务端权限与输入校验。
- OpenAI-compatible / Anthropic-compatible real gateway: explicit opt-in, budgets,
  reservation ledger, timeouts, retry limits, circuit breaker, conversation limits.
- Source-linked long-term memory, conservative beliefs and directed relationships;
  these are retained existing implementations beyond the core 0.1 scope.
- 无 Key 可运行明确标记的模拟/规则模式；模拟对话不是 AI 回答。
- 原项目曾验证 1 小时无人访问、重启恢复、真实私聊和有限自主交流。
  此副本只重测免费流程，不携带任何历史聊天、私有数据库或供应商证明。
- 尚未验证生产部署、TLS、公网负载、24 小时稳定性或上游模型真实身份。
  认知质量仅部分通过：世界细节仍可能被模型编造，关系真实增减未证明。

## 从零启动 / Fresh local installation

Validated baseline: Windows, Node 24.11.1 / npm 11.6.2, Python 3.11.9.
Node >=22.12 is required by Vite; Linux/macOS portability has not been re-tested.
Convex's first start requires internet to download its pinned native backend
`precompiled-2026-10-06-a3538c6`. No Convex account, Docker or LLM key is required
for the local free mode. A cached runtime was used for the release smoke test.

```powershell
cd ai-living-house
npm ci
npm run test
npm run build
npm run dev:backend
```

Keep the backend terminal running. In a second terminal in this same directory:
If the first start asks `Set up Convex AI files?`, choose `n` to reproduce this setup.

```powershell
npm run init
node scripts/owner_admin.mjs --keys
python scripts/set_owner_password.py
npm run dev:frontend
```

Open **http://127.0.0.1:5274/house/**. Choose your own username and password via
hidden input; the web UI has no public registration. `init` is admin-only, creates
safe residents/layout in a new database, and preserves an existing world. Do not
copy `.convex` or `.env.local` from another installation. The CLI creates both
locally. `.env.example` is a reference; copying it does not configure backend secrets.

端口为前端 5274、后端 4212、认证 HTTP actions 4213，均仅 loopback；
与原开发项目不同。请在每个命令前确认当前目录。停止这份副本的终端即可停止
副本服务；不要批量结束 Node 进程。保留副本 `.convex` 才能重启恢复同一世界。

## 接入自己的模型 / Your own model

Keep free mode until you choose and verify a provider, price, model and privacy terms.
No provider credentials or private endpoint is supplied. Keys belong only to the
backend, never `VITE_*`. This preparation does not call a paid model.

```powershell
python scripts/configure_llm.py --configure
# Review configuration/prices first. The next command explicitly enables paid chat:
python scripts/configure_llm.py --enable-paid
# Optional paid autonomous conversations (explicit consent required by this tool):
python scripts/configure_llm.py --enable-paid --autonomous
# Disable new paid calls and return to marked mock mode:
python scripts/configure_llm.py --mock
```

Defaults: 1 CNY/day, 30 CNY/month, concurrency <=2, <=6 requests/minute,
<=6 utterances per autonomous conversation. Provider usage is untrusted by default;
client estimates are not provider invoices. Without a valid key/price/budget in live
mode the gateway fails closed, rules keep running and no AI reply is fabricated.
The original unrestricted local dev mode is retained in code for compatibility but
requires the original 3212/3213 runtime; it cannot activate on these release ports.

## 部署 / Deployment

See [deployment status](docs/DEPLOYMENT.md). This release verifies local self-run
only. It does not ship an untested Docker/Fly/Cloud recipe as working deployment.
Static `dist/` alone is insufficient: the authoritative backend must remain running.
Known dependency advisories remain (48 high in the full tree, 13 high with dev
dependencies omitted); see verification before considering public hosting.

## MVP 0.2 Roadmap

第四位居民与完整四卧室、屋主群聊/广播、每日来源摘要、认知语义与隐私诱导测试、
24 小时无人访问实验、Linux/Docker/TLS/重启及恢复演练、依赖安全维护。
Existing memory/belief/relationship code is an incremental foundation, not proof
that MVP 0.2 is complete.

See [release verification](docs/VERIFICATION.md). MIT; retain all upstream notices.
