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

Siga os passos de [Catálogo local](#catálogo-local) para configurar o
repo de dados e montar o SQLite. Depois, inicie `claude` na raiz do repo.

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

## Catálogo local

Configure o caminho do repo de dados separadamente do código. Os dumps e o
SQLite ficam em `$XDG_DATA_HOME/filmes` por padrão. Sem essa variável, o
diretório é `~/.local/share/filmes`. Use `FILMES_CATALOGO` e `FILMES_BANCO`
para apontar para outros caminhos fora do repo.

```sh
export FILMES_DADOS=/caminho/do/repo-de-dados
uv run python -m filmes atualizar --json
uv run python -m filmes reconstruir --json
```

`atualizar` busca os TSVs de títulos e votos do IMDb e as triplas e rótulos do
Wikidata. Se uma consulta falhar no QLever, busca aquele conjunto por
predicado no WDQS. O progresso da CLI sai em stderr. No MCP, a ferramenta
`atualizar` envia notificações de progresso ao cliente que as solicita.

O manifesto [config/versoes-catalogo.json](config/versoes-catalogo.json) é o
único arquivo da atualização que vai para o git. Ele fixa a data e o SHA-256
de cada dump. Para escrever ou ler outro manifesto, use `FILMES_VERSOES` ou
`[caminhos] versoes` em `config/local.toml`.

Para reconstruir uma versão anterior, use seu manifesto e guarde os arquivos
que ele lista, cada um em `<catalogo>/<sha256>/<nome do dump>`.
`reconstruir` confere os hashes e monta o banco sem rede. A fixture em
`tests/fixture/catalogo` continua a usar as tabelas em CSV.

O catálogo é para uso pessoal e não comercial. [Datasets do IMDb](https://developer.imdb.com/non-commercial-datasets/).
