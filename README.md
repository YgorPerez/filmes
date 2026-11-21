# filmes

Recomendação de filmes para você e seus amigos, sozinho ou em grupo. Cada motivo de uma recomendação aponta para uma evidência com fonte e força.

O planejamento está no mapa do wayfinder (issue com label `wayfinder:map`). As decisões de partida estão em [docs/grilling-2026-11-20.md](docs/grilling-2026-11-20.md).

## Instalar no Claude Code

Com Python 3.12+, `uv`, Node 23.6+ e Claude Code instalados, rode os
comandos na raiz do repo.

```sh
make instalar
mkdir -p .claude/skills
ln -s ../../skill/filmes .claude/skills/filmes
```

Crie a pasta do repo de dados, se ela ainda não existir. Use esse repo
para Pessoas, imports e Sessões. Em `config/local.toml`, ponha os
caminhos da sua máquina.

```toml
[caminhos]
dados = "/caminho/para/filmes-dados"
catalogo = "/caminho/para/dumps-do-catalogo"
banco = "/caminho/para/filmes.sqlite"
```

Quando a pasta configurada tiver os dados do Catálogo, monte o SQLite e
inicie o Claude na raiz do repo.

```sh
uv run python -m filmes reconstruir --json
claude
```

O Claude Code encontra o servidor `filmes` no [`.mcp.json`](.mcp.json).
Aprove o servidor do projeto quando o Claude pedir e veja a conexão
em `/mcp`. O atalho `/filmes` carrega a skill. Na primeira vez, peça
"me cadastre como Dono, meu nome é …" ou use uma Pessoa que já tenha
`dono: true`. Depois, peça "sou só eu, tenho 1h40 e quero algo leve".
[Documentação do MCP](https://code.claude.com/docs/en/mcp) e
[instalação de skills](https://code.claude.com/docs/en/skills).

Para experimentar sem dumps, use a fixture numa pasta temporária.

```sh
demo=$(mktemp -d)
cp -R tests/fixture/dados "$demo/dados"
export FILMES_DADOS="$demo/dados"
export FILMES_CATALOGO="$PWD/tests/fixture/catalogo"
export FILMES_BANCO="$demo/filmes.sqlite"
uv run python -m filmes reconstruir --json
claude
```

A fixture já tem Bruno como Dono. Rode `make check` para verificar a CLI
e o MCP sem rede.
