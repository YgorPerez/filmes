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

## Cartaz no T3 Code

No T3 Code, a Recomendação aparece como cartaz HTML na conversa. A skill
chama a ferramenta `cartaz`, que roda `python -m filmes cartaz --sessao <id>`
e grava um documento completo em `cartazes/<sessão>.html`, na pasta do
banco (`--saida` escolhe outro arquivo). Depois, o `html_render` do T3
mostra o arquivo, e o texto da resposta fica só com os avisos.

O cartaz abre com a leitura do pedido e a legenda dos Presentes. Cada
filme ganha um card com a capa do TMDB em w500 (160 px, ou 104 px no
celular), a nota do IMDb sobre a capa e uma faixa com um ponto por Presente,
cheio para quem tem Fato sobre o filme e vazado para quem não tem. Ao
lado vêm o título em português com o original, a sinopse e as etiquetas
de ano, duração, gêneros e votos. Em "Por que cada um vai gostar" fica a
Evidência mais forte de cada Presente. Quem tem a mesma Evidência divide
a linha, e quem não tem Fato fica numa linha à parte, sem marcador de
Força. O CSS vale só dentro de `.cartaz` e usa as variáveis de tema do T3,
então o cartaz segue o tema claro ou escuro. Todo o texto sai do motor.

Fora do T3, a resposta continua em Markdown, como descrito abaixo.

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
([filmes/catalogo/generos.py](filmes/catalogo/generos.py)); nota e votos
também saem do IMDb. Capa (pôster em w185), título em português e sinopse
vêm de uma só consulta ao TMDB em pt-BR, feita na hora só para os filmes
devolvidos e guardada por 6 meses no cache. A sinopse é a primeira frase
do overview. A consulta precisa da chave em `FILMES_TMDB_CHAVE`. Sem a
chave, ou se o TMDB não responder, os três saem nulos, o título original
vale e a Recomendação avisa. Nada disso é motivo de filme: o verificador
da resposta confere só as linhas de Evidência.

A resposta não mostra os créditos das fontes, porque só o Dono usa o
`filmes`. O JSON de `recomendar` continua trazendo `atribuicoes`.

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

`atualizar` busca os TSVs de títulos, votos e créditos (`title.principals`)
do IMDb, as triplas e rótulos do Wikidata, o ID do IMDb de cada ator do
elenco e os ZIPs MovieLens ml-32m e Tag Genome 2021. Com os créditos, o
caminho de conteúdo por elenco sabe quem é coadjuvante: ator fora dos 3
primeiros créditos de ator do filme gera Evidência no máximo fraca. Um
manifesto sem esses dois dumps ainda reconstrói, com a régua do elenco
de antes. Se uma consulta falhar
no QLever, busca aquele conjunto por predicado no WDQS. O progresso da CLI
sai em stderr. No MCP, a ferramenta
`atualizar` envia notificações de progresso ao cliente que as solicita.

O manifesto [config/versoes-catalogo.json](config/versoes-catalogo.json) é o
único arquivo da atualização que vai para o git. Ele fixa a data e o SHA-256
de cada dump. Para escrever ou ler outro manifesto, use `FILMES_VERSOES` ou
`[caminhos] versoes` em `config/local.toml`.

Para reconstruir uma versão anterior, use seu manifesto e guarde os arquivos
que ele lista, cada um em `<catalogo>/<sha256>/<nome do dump>`.
`reconstruir` confere os hashes e monta o banco sem rede. A carga do MovieLens
guarda até 50 vizinhos por filme, ordenados pela proporção de usuários que
deram 4+ aos dois filmes entre os que deram 4+ ao filme de partida. Em caso de
empate, vale a ordem do ID do IMDb. A carga também guarda contagens de usuários
por tag no ml-32m e escores do Tag Genome 2021. Manifestos anteriores à ingestão
da GroupLens ainda podem ser reconstruídos, com essas tabelas vazias. A fixture
em `tests/fixture/catalogo` usa as tabelas em CSV.

O catálogo é para uso pessoal e não comercial. [Datasets do IMDb](https://developer.imdb.com/non-commercial-datasets/).
