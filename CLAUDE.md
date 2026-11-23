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

Fontes sob demanda (OMDb para a classificação de criança, Does the Dog Die para gatilho, TMDB para a capa e o import do Letterboxd) leem a chave de `FILMES_OMDB_CHAVE`, `FILMES_DDD_CHAVE` e `FILMES_TMDB_CHAVE`. Sem chave, a Recomendação sai assim mesmo, com um aviso em `"avisos"`. As respostas ficam 30 dias em `FILMES_CACHE`, ou em `<banco>-cache.sqlite` ao lado do banco, que `reconstruir` não apaga. Com `FILMES_GRAVACOES=tests/fixture/gravacoes`, as fontes leem respostas gravadas em vez da rede (é o que os testes fazem). Falha passageira (conexão derrubada, tempo esgotado, HTTP 429 ou 5xx) é tentada até 3 vezes; se persistir, a fonte fica desligada até o fim da execução, e `fila reprocessar [--pessoa X]` consulta o TMDB de novo para os itens do import que ficaram sem resposta.

Sem `--json`, a saída é o mesmo JSON indentado. Erro sai com código diferente de 0 e `{"erro": {"codigo", "mensagem"}}` no stdout; código 2 é uso inválido.

## Layout

```
config/pesos.toml          pesos versionados (multiplicadores de Força, peso por aresta, utilidade, votos mínimos)
config/climas.toml         vocabulário fixo de Climas: Clima -> tags do MovieLens e gêneros
config/grupo_sozinho.toml  tags do MovieLens que dão bônus numa Sessão em grupo ou sozinha
config/vetos_por_tag.toml  grupos de tags que um Veto pode nomear (comédia boba, lento); lento é também o --sem-lento
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
    restricoes/<nome>.py   uma Restrição da Sessão por arquivo (duração, ano, idioma, criança, gatilho, sem Já visto, nada triste, nada lento, sem repetido)
    cabecalho.py           link, gêneros, nota e votos do IMDb, capa, título pt e sinopse do TMDB; fora das Evidências
    atribuicoes.py         atribuições obrigatórias das fontes usadas
    mantidos.py            regerar com --manter: posições dos mantidos, selo novo e saídas
  sob_demanda/             fontes consultadas na hora, com cache de validade: fonte.py, cache.py, omdb.py, ddd.py, tmdb.py
  sessao/                  arquivo da Sessão, Feedback, Fatos do Feedback e Crédito
  importar/                imports do Letterboxd (ZIP e RSS) e do Trakt, fila de resolução e decisões do Dono
  exportar/                Notas de uma Pessoa em formato de outro serviço (imdb.py: o CSV que o MovieLens importa)
  avaliacao/               `avaliar`: corte offline, amostra do MovieLens, grade de pesos e relatório
  verificar/               confere a resposta do Claude contra a Sessão
  cartaz/                  cartaz HTML da Sessão para o T3 Code; CSS em cartaz.css, só sob .cartaz
                           cartaz.js monta o texto do Copiar pro chat; responder.py lê esse texto colado
mcp/src/
  servidor.ts              registra cada ferramenta de ferramentas/
  ferramenta.ts            formato de uma ferramenta (definirFerramenta) e validações comuns
  ferramentas/<nome>.ts    uma ferramenta por arquivo
  cli.ts                   chama python -m filmes como subprocesso
skill/filmes/SKILL.md      skill do Claude; feedback.md, pessoas.md e cartaz.md (texto colado e perguntas de gosto)
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
- **Teto do elo.** No caminho de conteúdo, a Evidência sai com a menor Força entre a da semente e a do elo: diretor e série até forte, roteiro e elenco até moderada, gênero até fraca. Vale também para o metadado agregado ("como 3 filmes a que deu 4 ou mais"); não vale para o Declarado ou Relato sobre a própria entidade. Decisão do Dono de 2026-11-22.
- **Ajuste.** Cada Pessoa pode ter um Ajuste por elo (`ajustes:` no frontmatter, `pessoa ajustar`): nada tira as Evidências do elo, pouco vale metade e desce a Força um nível, muito vale 1,5 vez sem subir a Força. O Declarado sobre a entidade vence o Ajuste. Decisão do Dono de 2026-11-22.
- **Corte das N mais fortes.** A utilidade de uma Pessoa num filme soma só as N contribuições de maior módulo (`[utilidade] evidencias_maximas`); o Já visto fica fora do corte e sempre conta. Sem isso, quem tem mil Notas satura em 1. Decisão do Dono de 2026-11-22.
- **Veto por grupo de tags.** O alvo de um Veto pode ser um grupo de `config/vetos_por_tag.toml` (`pessoa vetar ... --grupo comedia_boba`): sai o filme com um dos gêneros do IMDb do grupo e uma das tags com o mínimo de `[vetos_por_tag]`. O Lorenzo veta "comédia boba". Decisão do Dono de 2026-11-22 (#56).
- **Nota do IMDb na ordem.** Acima da mínima, a nota soma um bônus do filme à pontuação da Regra, como o do Clima: `[nota_imdb] peso × (nota − 7) / 3`, com peso 0,3. A linha "nota 8,5 no IMDb" vai em `linhas_do_filme` e não conta como Fato (filme só com ela continua "só palpites"). Decisão do Dono de 2026-11-22 (#56).
- **Nada lento.** `--sem-lento` é Restrição da Sessão: tira o filme com uma tag do grupo `lento` de `config/vetos_por_tag.toml` (slow, slow paced, meditative, contemplative, boring), com os mínimos de `[vetos_por_tag]`, em qualquer gênero. O grupo também serve de alvo de Veto. Decisão do Dono de 2026-11-22 (#57).
- **Sem repetido.** Ao refazer com `--sessao`, a Restrição `sem_repetido` liga sozinha e tira o que a Sessão já mostrou: os `mostrados` do cartaz de cada versão, ou a Recomendação inteira da versão sem `mostrados` (o que o cartaz sem `--filmes` mostra, a mesma lista que `--manter` e `cartaz responder` aceitam). Outras Sessões não contam. Decisão do Dono de 2026-11-22 (#57); a lista inteira no lugar das 5 primeiras veio da revisão do #64.
- **Sem fato é neutro.** Na Regra de escolha (padrão, média e "de fulano"), Presente sem Fato sobre o filme conta como 0,5, e o Crédito não mexe nesse 0,5. Na saída, a utilidade dele continua `null`, com a linha "sem fato". Decisão do Dono de 2026-11-21 (#37), que muda a do #8.
- **Cartaz que responde.** No cartaz, o Dono marca por filme Já vi (por Presente, cada uma com nota de 1 a 10 e o que achou, que vira Declarado específico dela sobre o filme), Trocar, estrelas e comentário, e embaixo, depois do último filme, o acrescentar; Copiar pro chat gera o texto `#cartaz <sessao> v<n>`, que `cartaz responder` grava. Regera só se um filme caiu (Já vi de um Presente ou Trocar) ou se veio acrescentar, com `recomendar --manter`: os mantidos ficam no número, os que entram têm o selo "novo" e `saidas` diz o que saiu e por quê. Uma Restrição ou um Veto novos tiram o mantido; gosto novo só vale para os que entram. Estrelas e comentário ficam na Sessão e não mexem no gosto; comentário não troca filme. Texto de versão velha vale pelo filme. O cartaz guarda as marcações no localStorage (chave por Sessão e versão) e as restaura quando o T3 recarrega o quadro; no T3 Code o quadro não tem localStorage, então lá nada é guardado (decisão do Dono de 2026-11-23: colar antes de trocar de aba). O contexto da noite regera direto; gosto permanente (do acrescentar, de comentário ou de resposta) só é gravado depois de um sim do Dono. A cada cartaz, a skill faz 1 ou 2 perguntas de gosto com "pular"; a pulada fica em `perguntas_abertas:` da Pessoa, volta uma vez quando o assunto está na tela e, pulada duas vezes, sai. Decisão do Dono de 2026-11-23 (#64).
- **Já visto.** Toda Nota é também Já visto (view `ja_vistos`): pesa contra o filme para a Pessoa que deu a Nota.
