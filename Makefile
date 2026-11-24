.PHONY: check test-py typecheck test-ts instalar

# Verificação do motor Python e do servidor MCP que chama a CLI dele. O resto
# do workspace (formato, lint, tipos, cobertura, fallow, React Doctor) é o
# `pnpm check`.
check: test-py typecheck test-ts

test-py: .venv
	uv run pytest -q

typecheck: node_modules
	pnpm --filter @filmes/mcp --silent typecheck

test-ts: .venv node_modules
	pnpm --filter @filmes/mcp --silent test

instalar: .venv node_modules

.venv: pyproject.toml uv.lock
	uv sync
	@touch .venv

node_modules: package.json pnpm-lock.yaml pnpm-workspace.yaml mcp/package.json
	pnpm install --frozen-lockfile
	@touch node_modules
