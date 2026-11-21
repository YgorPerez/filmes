# filmes

Recomendação de filmes para você e seus amigos, sozinho ou em grupo. Cada motivo de uma recomendação aponta para uma evidência com fonte e força.

O planejamento está no mapa do wayfinder (issue com label `wayfinder:map`). As decisões de partida estão em [docs/grilling-2026-11-20.md](docs/grilling-2026-11-20.md).

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
