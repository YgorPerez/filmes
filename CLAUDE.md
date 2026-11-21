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
uv run python -m filmes consultar "SELECT titulo FROM filmes LIMIT 5" --json
node mcp/src/stdio.ts          # servidor MCP por stdio (registrado em .mcp.json)
```

Para brincar com a fixture: `FILMES_DADOS=tests/fixture/dados FILMES_CATALOGO=tests/fixture/catalogo FILMES_BANCO=/tmp/filmes.sqlite`.

Sem `--json`, a saída é o mesmo JSON indentado. Erro sai com código diferente de 0 e `{"erro": {"codigo", "mensagem"}}` no stdout; código 2 é uso inválido.

## Layout

```
config/pesos.toml          pesos versionados (multiplicadores de Força, peso por aresta, utilidade, votos mínimos)
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
  sessao/ importar/ sob_demanda/ avaliacao/ verificar/   reservados para os tickets seguintes
mcp/src/
  servidor.ts              registra cada ferramenta de ferramentas/
  ferramentas/<nome>.ts    uma ferramenta por arquivo
  cli.ts                   chama python -m filmes como subprocesso
skill/filmes/SKILL.md      skill do Claude
tests/                     testes Python, só pela CLI
tests/fixture/             mini Catálogo (catalogo/*.csv) e repo de dados fictício (dados/)
mcp/test/                  testes do MCP, chamando a CLI de verdade sobre a mesma fixture
```

## Convenções

- **Pontos de extensão por arquivo.** Comando novo, ferramenta MCP nova, tabela nova, etapa de carga nova e sinal novo são arquivos novos numa pasta; nenhum registro central muda. Isso evita conflito entre tickets paralelos.
- **Testes só pelas costuras.** Python: `tests/conftest.py` dá a fixture `cli` (banco vazio) e `banco` (já reconstruído); `cli.ok(...)`, `cli.rodar(...)` e `cli.consultar(sql)`. Nada de importar `filmes` nos testes. MCP: cliente do SDK sobre `InMemoryTransport`, com a CLI real. Nenhum teste usa rede.
- **Fixture.** `tests/fixture/catalogo/<tabela>.csv` vai direto para a tabela de mesmo nome; coluna `fato_id` ausente é calculada do conteúdo da linha. Uma tabela nova é um `.sql` em `filmes/banco/esquema/` mais um CSV. O `LEIAME.md` da fixture diz quem deu Nota a quê; acrescente filmes com IDs novos em vez de mudar os existentes, para não quebrar testes de outros.
- **Força** só sai de `filmes/evidencia/regua.py`, por regra fixa. Números que se calibram (multiplicadores, pesos) ficam em `config/pesos.toml`.
- **Fato** tem `fato_id` estável entre reconstruções (`filmes.banco.fato_id`), Fonte e data.
- **Hoje** vem de `amb.hoje` (os testes fixam `FILMES_HOJE=2026-11-20`); nunca chame `date.today()` direto.
- Prosa, mensagens de erro e commits em português.
