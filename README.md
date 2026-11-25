# filmes

Recomendação de filmes para você e seus amigos, sozinho ou em grupo. Cada motivo de uma recomendação aponta para uma evidência com fonte e força.

O planejamento está no mapa do wayfinder (issue com label `wayfinder:map`). As decisões de partida estão em [docs/grilling-2026-11-20.md](docs/grilling-2026-11-20.md).

## Usar

O filmes roda em [cinema.temestudo.cloud](https://cinema.temestudo.cloud): o app web, com login pelo Google, e o servidor MCP, que se conecta ao Claude como conector remoto. A Recomendação aparece no Claude como Cartaz (MCP Apps) e no app web.

## Desenvolver

Com Node 24 e pnpm, na raiz do repo:

```sh
pnpm install
pnpm check                    # formato, lint, tipos, testes, fallow e React Doctor
pnpm --filter frontend e2e    # o app no Chrome, sobre a fixture
```

Os testes não usam rede: montam o banco a partir da fixture em `tests/fixture`, que já tem Bruno como Dono. O `AGENTS.md` descreve onde mora cada coisa e como verificar.

## Como sai cada filme

A resposta em Markdown abre com uma citação que repete o pedido como o Claude entendeu,
os Vetos que agiram e quantos filmes saíram. Cada filme vem num bloco
fechado por `---`: título em português (o original ao lado, em itálico,
quando difere), capa, ficha, uma frase de sinopse, quantos Presentes têm
Fato sobre o filme e, por fim, as Evidências de cada Presente. O marcador
no começo da linha é a Força (●●● forte, ●●○ moderada, ●○○ fraca) e o
Tipo vai no fim.

```markdown
> Você e Teo · até 2h · regra padrão. Saíram 5 filmes.

### 1. As Horas Lentas

![capa](https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg)

2021 · 1h44 · Drama, Mistério · ★ 7,4 · 28.000 votos · [IMDb](https://www.imdb.com/title/tt9000104/)

*Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.*

Fato sobre 1 de 2; sem fato: Teo

- ●●● **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*
- ●○○ **Teo:** sem fato *(palpite)*

---
```

Os gêneros são os do IMDb, traduzidos por uma tabela fixa
([genres.ts](packages/engine/src/catalog/genres.ts)); nota e votos
também saem do IMDb. Capa (pôster em w185), título em português e sinopse
vêm de uma só consulta ao TMDB em pt-BR, feita na hora só para os filmes
devolvidos e guardada por 6 meses no cache. A sinopse é a primeira frase
do overview. A consulta precisa da chave em `FILMES_TMDB_CHAVE`. Sem a
chave, ou se o TMDB não responder, os três saem nulos, o título original
vale e a Recomendação avisa. Nada disso é motivo de filme: o verificador
da resposta confere só as linhas de Evidência.

A resposta não mostra os créditos das fontes, porque só o Dono usa o
`filmes`. A Recomendação continua trazendo `attributions`.

## Catálogo local

O catálogo e o banco são montados no servidor-azul e publicados na VPS
(ADR 0006). Os caminhos vêm de `config/local.toml` (fora do git) ou das
variáveis `FILMES_DADOS`, `FILMES_CATALOGO` e `FILMES_BANCO`, sempre fora do
repo.

```sh
pnpm catalog:update          # baixa os dumps e fixa o manifesto
pnpm db:publish --build      # monta o SQLite com o rebuild do motor e publica
```

`catalog:update` busca os TSVs de títulos, votos e créditos (`title.principals`)
do IMDb, as triplas e rótulos do Wikidata, o ID do IMDb de cada ator do
elenco e os ZIPs MovieLens ml-32m e Tag Genome 2021. Com os créditos, o
caminho de conteúdo por elenco sabe quem é coadjuvante: ator fora dos 3
primeiros créditos de ator do filme gera Evidência no máximo fraca. Um
manifesto sem esses dois dumps ainda reconstrói, com a régua do elenco
de antes. Se uma consulta falhar
no QLever, busca aquele conjunto por predicado no WDQS. O progresso sai em
stderr, uma linha JSON por passo.

O manifesto [config/catalog-versions.json](config/catalog-versions.json) é o
único arquivo da atualização que vai para o git. Ele fixa a data e o SHA-256
de cada dump. Para escrever ou ler outro manifesto, use `FILMES_VERSOES` ou
`[paths] versions` em `config/local.toml`.

Para reconstruir uma versão anterior, use seu manifesto e guarde os arquivos
que ele lista, cada um em `<catalogo>/<sha256>/<nome do dump>`.
O `rebuild` confere os hashes e monta o banco sem rede. A carga do MovieLens
guarda até 50 vizinhos por filme, ordenados pela proporção de usuários que
deram 4+ aos dois filmes entre os que deram 4+ ao filme de partida. Em caso de
empate, vale a ordem do ID do IMDb. A carga também guarda contagens de usuários
por tag no ml-32m e escores do Tag Genome 2021. Manifestos anteriores à ingestão
da GroupLens ainda podem ser reconstruídos, com essas tabelas vazias. A fixture
em `tests/fixture/catalogo` usa as tabelas em CSV.

O catálogo é para uso pessoal e não comercial. [Datasets do IMDb](https://developer.imdb.com/non-commercial-datasets/).
