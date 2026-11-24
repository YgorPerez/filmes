# #73 workspace: what other tickets can rely on

Branch `ticket/73-workspace`.

- Workspace packages: `frontend` (TanStack Start + Nitro), `@filmes/engine` (packages/engine, empty, Effect 4.0.2), `@filmes/mcp` (mcp/, still shells out to Python).
- Versions follow pesquisa-relacionamentos' catalog: vite-plus 1.3.0, vitest 5.0.5, typescript 7.0.2, @effect/tsgo 0.53.4, effect 4.0.2. pnpm 12.10.1, Node 24.
- Build: `pnpm build` -> `frontend/.output/server/index.mjs`; run it with `PORT=<n> node .output/server/index.mjs` (from frontend/). `/` renders `<h1>filmes</h1>`. For #79's Dockerfile, copy `frontend/.output` only.
- `pnpm check` = vp check + `test:coverage` per package (frontend, engine) + root scripts' Vitest with coverage + fallow (frontend) + react-doctor (frontend). It does NOT run the MCP tests (they need the Python venv).
- `make check` = pytest + MCP typecheck + MCP tests (now Vitest, not node:test). Pytest takes ~6 min locally.
- Formatting: single quotes, no semicolons, 80 cols (Oxfmt). Ignored by fmt/lint: `filmes/`, `tests/`, `config/`, `skill/`, `README.md` (its sample is engine Markdown byte for byte).
- Root coverage floor: 85/75/90/85; frontend: 16/100/25/16 (routes are covered by the build job). Engine has `passWithNoTests` until its first module, which must remove it and set a floor.
- The engine is not a frontend dependency yet: fallow fails on unused deps. Add `@filmes/engine: workspace:*` to frontend when the first import lands.
- CI: `.github/workflows/pr.yml` runs on PRs to `master` and `spec/**`: jobs `check`, `build` (curls `/`), `python` (`make check`). `suppressions.yml` on every PR (label `supressao-revisada`).
- Push hook: `node scripts/install-hooks.ts` once per clone; `scripts/affected.ts` decides Vitest folders, MCP tests and pytest from the diff. `SKIP_TESTS="<reason>" git push` skips tests, not the audit.
