# filmes

Recomendador de filmes com evidência. Motor em Python (`python -m filmes <comando> --json`), servidor MCP em TypeScript que chama essa CLI como subprocesso, e uma skill para o Claude. A spec é a issue #16; o vocabulário está em `GLOSSARY.md` e vale nos nomes de código, testes e mensagens.

## Verificação

```sh
make check
```

Roda os testes Python (`uv run pytest`), o typecheck do MCP (`tsc --noEmit`) e os testes do MCP (`node --test`). Instala o que faltar (`uv sync`, `npm ci`) na primeira vez. Tudo verde antes de qualquer commit que vá para a integração.

Precisa de `uv` e de Node 23.6 ou mais novo (o MCP roda `.ts` direto, sem build).

## Rodar

```sh
# config/local.toml (fora do git) ou variáveis de ambiente:
#   FILMES_DADOS=<repo de dados>  FILMES_CATALOGO=<pasta dos dumps>  FILMES_BANCO=<sqlite>
uv run python -m filmes reconstruir --json
uv run python -m filmes recomendar --presentes dono --json
uv run python -m filmes recomendar --presentes dono --duracao-max 120 --crianca 7 --gatilho "a dog dies" --json
uv run python -m filmes consultar "SELECT titulo FROM filmes LIMIT 5" --json
node mcp/src/stdio.ts          # servidor MCP por stdio (registrado em .mcp.json)
```

Para brincar com a fixture: `FILMES_DADOS=tests/fixture/dados FILMES_CATALOGO=tests/fixture/catalogo FILMES_BANCO=/tmp/filmes.sqlite`.

Fontes sob demanda (OMDb para a classificação de criança, Does the Dog Die para gatilho, TMDB para a capa e o import do Letterboxd) leem a chave de `FILMES_OMDB_CHAVE`, `FILMES_DDD_CHAVE` e `FILMES_TMDB_CHAVE`. Sem chave, a Recomendação sai assim mesmo, com um aviso em `"avisos"`. As respostas ficam 30 dias em `FILMES_CACHE`, ou em `<banco>-cache.sqlite` ao lado do banco, que `reconstruir` não apaga. Com `FILMES_GRAVACOES=tests/fixture/gravacoes`, as fontes leem respostas gravadas em vez da rede (é o que os testes fazem).

Sem `--json`, a saída é o mesmo JSON indentado. Erro sai com código diferente de 0 e `{"erro": {"codigo", "mensagem"}}` no stdout; código 2 é uso inválido.

## Layout

```
config/pesos.toml          pesos versionados (multiplicadores de Força, peso por aresta, utilidade, votos mínimos)
config/climas.toml         vocabulário fixo de Climas: Clima -> tags do MovieLens e gêneros
config/grupo_sozinho.toml  tags do MovieLens que dão bônus numa Sessão em grupo ou sozinha
filmes/
  cli.py                   contrato da CLI; acha os comandos em comandos/
  ambiente.py              caminhos, pesos e "hoje" de uma execução
  erros.py                 ErroFilmes(codigo, mensagem)
  comandos/<nome>.py       um arquivo por comando (sessoes_abertas.py vira sessoes-abertas)
  banco/                   SQLite derivado
    esquema/NN_area.sql    esquema, aplicado em ordem de nome
    etapas/NN_area.py      cargas da reconstrução, rodadas em ordem de nome
    reconstrucao.py
  dados/                   repo de dados: Pessoas e Sessões em Markdown com frontmatter
  catalogo/                ingestão do Catálogo; tabelas.py carrega CSV pronto
  evidencia/               Evidencia, régua de Força (regua.py), redação (texto.py)
  recomendacao/            Candidatos, utilidade, ordem; sinais/<caminho>.py, um por caminho
                           (sinais(rodada, pessoa) para uma Pessoa, sinais_do_filme(rodada) para a linha do filme)
    restricoes/<nome>.py   uma Restrição da Sessão por arquivo (duração, idioma, criança, gatilho, sem Já visto)
    cabecalho.py           link, gêneros, nota e votos do IMDb, capa, título pt e sinopse do TMDB; fora das Evidências
    atribuicoes.py         atribuições obrigatórias das fontes usadas
  sob_demanda/             fontes consultadas na hora, com cache de validade: fonte.py, cache.py, omdb.py, ddd.py, tmdb.py
  sessao/                  arquivo da Sessão, Feedback, Fatos do Feedback e Crédito
  importar/                imports do Letterboxd e do Trakt, fila de resolução e decisões do Dono
  avaliacao/               `avaliar`: corte offline, amostra do MovieLens, grade de pesos e relatório
  verificar/               confere a resposta do Claude contra a Sessão
  cartaz/                  cartaz HTML da Sessão para o T3 Code; CSS em cartaz.css, só sob .cartaz
mcp/src/
  servidor.ts              registra cada ferramenta de ferramentas/
  ferramenta.ts            formato de uma ferramenta (definirFerramenta) e validações comuns
  ferramentas/<nome>.ts    uma ferramenta por arquivo
  cli.ts                   chama python -m filmes como subprocesso
skill/filmes/SKILL.md      skill do Claude
tests/                     testes Python, só pela CLI
tests/fixture/             mini Catálogo (catalogo/*.csv), repo de dados fictício (dados/) e respostas gravadas das fontes sob demanda (gravacoes/)
mcp/test/                  testes do MCP, chamando a CLI de verdade sobre a mesma fixture
```

## Convenções

- **Pontos de extensão por arquivo.** Comando novo, ferramenta MCP nova, tabela nova, etapa de carga nova, sinal novo e Restrição nova são arquivos novos numa pasta; nenhum registro central muda. Isso evita conflito entre tickets paralelos.
- **Testes só pelas costuras.** Python: `tests/conftest.py` dá a fixture `cli` (banco vazio) e `banco` (já reconstruído); `cli.ok(...)`, `cli.rodar(...)` e `cli.consultar(sql)`. Nada de importar `filmes` nos testes. MCP: cliente do SDK sobre `InMemoryTransport`, com a CLI real. Nenhum teste usa rede.
- **Fixture.** `tests/fixture/catalogo/<tabela>.csv` vai direto para a tabela de mesmo nome; coluna `fato_id` ausente é calculada do conteúdo da linha. Uma tabela nova é um `.sql` em `filmes/banco/esquema/` mais um CSV. O `LEIAME.md` da fixture diz quem deu Nota a quê; acrescente filmes com IDs novos em vez de mudar os existentes, para não quebrar testes de outros.
- **Força** só sai de `filmes/evidencia/regua.py`, por regra fixa. Números que se calibram (multiplicadores, pesos) ficam em `config/pesos.toml`.
- **Fato** tem `fato_id` estável entre reconstruções (`filmes.banco.fato_id`), Fonte e data.
- **Hoje** vem de `amb.hoje` (os testes fixam `FILMES_HOJE=2026-11-20`); nunca chame `date.today()` direto.
- Prosa, mensagens de erro e commits em português.

## Decisões que valem para todos

- **Classificação etária.** EIRIN e CNC entram na cadeia de criança só quando restringem (PG12, -12...); o "livre" deles (G, tous publics) conta como sem informação.
- **Import do Letterboxd.** O ano do export pode diferir em 1 do ano do Wikidata ou do TMDB (Year ± 1); o ano exato vence no empate.
- **Nota mínima.** Candidato precisa de nota 7 ou mais no IMDb, além dos 1.000 votos (`[catalogo] nota_imdb_minima` em `config/pesos.toml`). Decisão do Dono de 2026-11-21: vale sempre.
- **Elenco coadjuvante.** No caminho de conteúdo, ator fora dos 3 primeiros créditos de ator do `title.principals` no Candidato gera Evidência no máximo fraca. Filme sem créditos carregados fica com a régua normal.
- **Sem fato é neutro.** Na Regra de escolha (padrão, média e "de fulano"), Presente sem Fato sobre o filme conta como 0,5, e o Crédito não mexe nesse 0,5. Na saída, a utilidade dele continua `null`, com a linha "sem fato". Decisão do Dono de 2026-11-21 (#37), que muda a do #8.
- **Já visto.** Toda Nota é também Já visto (view `ja_vistos`): pesa contra o filme para a Pessoa que deu a Nota.
