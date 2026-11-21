.PHONY: check test-py typecheck test-ts instalar

# Verificação completa: testes Python, typecheck e testes do servidor MCP.
check: test-py typecheck test-ts

test-py: .venv
	uv run pytest -q

typecheck: mcp/node_modules
	npm --prefix mcp run --silent typecheck

test-ts: .venv mcp/node_modules
	npm --prefix mcp test --silent

instalar: .venv mcp/node_modules

.venv: pyproject.toml uv.lock
	uv sync
	@touch .venv

mcp/node_modules: mcp/package.json mcp/package-lock.json
	npm --prefix mcp ci
	@touch mcp/node_modules
