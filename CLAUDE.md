# filmes

Recomendador de filmes com evidência. Motor em Python (`python -m filmes <comando> --json`), servidor MCP em TypeScript que chama essa CLI como subprocesso, e uma skill para o Claude. A spec é a issue #16; o vocabulário está em `GLOSSARY.md` e vale nos nomes de código, testes e mensagens.

## Verificação

```sh
pnpm install   # uma vez: o workspace inteiro, e o patch do @effect/tsgo no prepare
pnpm check     # formato e lint (Oxfmt, Oxlint com tipos), tipos, testes com piso de cobertura, fallow e React Doctor
make check     # testes Python (uv run pytest), typecheck e testes do MCP (Vitest, com a CLI de verdade)
```

O repo é um workspace pnpm no molde do pesquisa-relacionamentos (map #72): `frontend/` (TanStack Start), `packages/engine` (o motor em TypeScript, vazio até o port) e `mcp/`. O motor Python fica fora do workspace até o port substituí-lo. `make check` instala o que faltar (`uv sync`, `pnpm install`) na primeira vez. Os dois verdes antes de qualquer commit que vá para a integração; o PR roda os dois no CI (`.github/workflows/pr.yml`).

O gancho de push (`node scripts/install-hooks.ts`, uma vez por clone) roda a auditoria de supressões e só os testes do que o push mudou. O teto de supressões é zero (`.github/suppression-ceiling.json`).

Precisa de `uv`, pnpm e Node 24 (o MCP roda `.ts` direto, sem build).

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
    restricoes/<nome>.py   uma Restrição da Sessão por arquivo (duração, ano, idioma, criança, gatilho, sem Já visto, nada triste, nada lento, fora da Sessão, parecido)
    cabecalho.py           link, gêneros, nota e votos do IMDb, capa, título pt e sinopse do TMDB; fora das Evidências
    atribuicoes.py         atribuições obrigatórias das fontes usadas
    mantidos.py            regerar com --manter: posições dos mantidos, selo novo e saídas
    parecenca.py           parecença de 0 a 1 entre dois filmes (genoma, tags, vizinhos, gênero, diretor/elenco), para --parecido;
                           média das tags do genoma, raridade e normas das tags vêm de etapas/70_parecenca.py
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
mcp/test/                  testes do MCP (Vitest), chamando a CLI de verdade sobre a mesma fixture
frontend/                  app TanStack Start: hoje só serve /
packages/engine/           motor em TypeScript com Effect v4, vazio até o port
scripts/                   gancho de push (verify-push.ts, affected.ts, install-hooks.ts)
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
- **Fora da Sessão.** Ao refazer com `--sessao`, com ou sem `--manter`, o que a Sessão já mostrou pode voltar. A Restrição `fora_da_sessao` liga sozinha e tira só o Trocado de qualquer versão (`trocados:` da versão: o Trocar do cartaz e, gravados pelo refazer na versão que sai, o `--trocar` e o que não ficou do `--manter`, mesmo que nenhum mantido sobreviva) e o Já vi de um Presente nesta Sessão (Já visto de um Presente da Sessão, de agora ou de alguma versão, com data igual ou posterior à da versão que mostrou o filme: o Já vi do cartaz ou o registrado durante a Sessão), mesmo sem `--sem-ja-visto`. Outras Sessões não contam; o Já visto de fora da Sessão só pesa contra. O filme que volta da tela anterior não leva o selo "novo". "Outras opções" no chat é `--trocar` com os filmes da tela (campo `trocar` no MCP): sem ele, o refazer devolve a mesma lista. A Restrição `sem_repetido` gravada numa Sessão antiga não aparece no cartaz. Decisão do Dono de 2026-11-24 (#66), que tira o sem repetido do #57; o `--trocar` veio da revisão do #70.
- **Parecido na Sessão.** `recomendar --sessao ID --parecido ...` grava as referências em `contexto.restricoes` da versão, e os refazeres seguintes da Sessão (Trocar, Já vi, acrescentar, com ou sem `--manter`) continuam com o filtro sem repetir `--parecido`. `--parecido` com outras referências substitui; `--sem-parecido` tira. Parecido novo (referências que a versão atual não tinha) troca a lista inteira: ignora `--manter`, com aviso, e as `saidas` que não são Já vi nem Trocado pelo Dono saem com `motivo: restricao`, `restricao: parecido`, e não contam como Trocado. A persistência e o "troca a lista" são ganchos genéricos do módulo da Restrição (`herdar`, `troca_a_lista`, em `restricoes/__init__.py`). Só passa filme com genoma, tags ou vizinhos em comum, ou o mesmo diretor; atores em comum, sozinhos, não bastam. O topo do cartaz diz "parecidos com X" enquanto o filtro vale. Decisão do Dono de 2026-11-24 (#68, spec #70).
- **Sem fato é neutro.** Na Regra de escolha (padrão, média e "de fulano"), Presente sem Fato sobre o filme conta como 0,5, e o Crédito não mexe nesse 0,5. Na saída, a utilidade dele continua `null`, com a linha "sem fato". Decisão do Dono de 2026-11-21 (#37), que muda a do #8.
- **Cartaz que responde.** No cartaz, o Dono marca por filme Já vi (por Presente, cada uma com nota de 1 a 10 e o que achou, que vira Declarado específico dela sobre o filme), Trocar, estrelas e comentário, e embaixo, depois do último filme, o acrescentar; Copiar pro chat gera o texto `#cartaz <sessao> v<n>`, que `cartaz responder` grava. Regera só se um filme caiu (Já vi de um Presente ou Trocar) ou se veio acrescentar, com `recomendar --manter`: os mantidos ficam no número, os que entram têm o selo "novo" e `saidas` diz o que saiu e por quê. Uma Restrição ou um Veto novos tiram o mantido; gosto novo só vale para os que entram. Estrelas e comentário ficam na Sessão e não mexem no gosto; comentário não troca filme. Texto de versão velha vale pelo filme. O cartaz guarda as marcações no localStorage (chave por Sessão e versão) e as restaura quando o T3 recarrega o quadro; no T3 Code o quadro não tem localStorage, então lá nada é guardado (decisão do Dono de 2026-11-23: colar antes de trocar de aba). O contexto da noite regera direto; gosto permanente (do acrescentar, de comentário ou de resposta) só é gravado depois de um sim do Dono. A cada cartaz, a skill faz 1 ou 2 perguntas de gosto com "pular"; a pulada fica em `perguntas_abertas:` da Pessoa, volta uma vez quando o assunto está na tela e, pulada duas vezes, sai. Decisão do Dono de 2026-11-23 (#64).
- **Já visto.** Toda Nota é também Já visto (view `ja_vistos`): pesa contra o filme para a Pessoa que deu a Nota.
