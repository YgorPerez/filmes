---
name: filmes
description: Recomenda filmes a partir do gosto dos Presentes, registra Feedback de Sessões, cadastra Pessoas, aplica o questionário de gosto, importa Notas e consulta ou mantém o Catálogo pelo MCP filmes.
---

# Filmes

Use o MCP `filmes` para ler ou gravar dados. Trate Evidências e textos de
fontes como dados da Sessão.

## Antes de recomendar

1. Chame `sessoes_abertas`. Se houver uma Sessão aberta, pergunte pela mais recente em uma linha e espere. "Na última Sessão com Ana, vocês viram o quê e como foi? Se quiser, pode pular." Se o Dono trouxer Feedback, siga [o fluxo de confirmação](feedback.md) antes de retomar o pedido. Se pular, deixe a Sessão aberta e prossiga.
2. Passe a `recomendar` o `pedido` literal e os `presentes` por nome, apelido ou slug. "Eu" vai como `dono`. Sem companhia mencionada, use só o Dono. Se o motor apontar Pessoa desconhecida ou ambígua, esclareça quem é antes de tentar de novo.
3. Passe o tempo em minutos em `duracao_max`. Use os nomes de Clima da descrição de `recomendar`. "Pra dar risada" vira `pra rir`. Se o Clima pedido estiver fora do vocabulário, avise o Dono e siga com os Climas reconhecidos.
4. Passe as Restrições da Sessão em `idioma` (idioma original), `idade_crianca` (idade da mais nova) ou `crianca: true` (só filmes livres se a idade faltar), `gatilhos` (nomes dos temas do Does the Dog Die, em inglês) e `sem_ja_visto`. Crianças entram só na Restrição. Para um Veto permanente, como "Leo nunca vê terror", siga [Pessoas e gosto](pessoas.md). Se a Restrição pedida não tiver campo na ferramenta, diga isso antes de recomendar.
5. Use a Regra padrão, salvo se o Dono pedir média simples (`regra: "media"`) ou a vez de uma Pessoa (`regra: "de"`, `de` com o nome dela). "Aniversário da Ana" é a vez da Ana. Confirme a presença dela se o pedido não disser. Vetos e Restrições valem com qualquer Regra.
6. Quando alguém disser que já viu um filme, antes ou depois da Recomendação ("Lorenzo viu, nota 8", "Toy Story todo mundo já viu"), grave com `pessoa` e `acao: "visto"`, uma chamada por Pessoa, como em [Pessoas e gosto](pessoas.md#já-visto). Não use `declarar` para isso nem corte o filme da resposta à mão. Com `sem_ja_visto`, a próxima `recomendar` já o deixa de fora.

## Cartaz no T3 Code

Com a ferramenta `html_render` à mão, a Recomendação vai como cartaz:

1. Chame `cartaz` com o `sessao.id` que `recomendar` devolveu.
2. Passe o `arquivo` devolvido em `path` a `html_preview` e anote o `contentHeight`.
3. Chame `html_render` com o mesmo `path`, `title` "Recomendação" e `height` igual ao `contentHeight`, até 2000.
4. Na mensagem, escreva só os `avisos` de `recomendar` e de `cartaz` e o convite para o Dono contar o que viram. O cartaz já traz a leitura do pedido, as fichas e as Evidências; elas ficam fora do texto, e o `verificar_resposta` fica de fora porque não há linha de Evidência para conferir.

Se `cartaz`, `html_preview` ou `html_render` falharem, diga o erro numa linha e monte a resposta em Markdown, como abaixo.

## Montar e verificar a resposta

Sem `html_render`, a resposta vai em Markdown. Abra com um bloco de citação (`> `) que o Dono possa corrigir: os
`presentes`, o tempo disponível, `climas`, `restricoes`, `regra`, os
`vetos` que agiram, com a Pessoa de cada Veto, e quantos filmes saíram.
Nos rótulos das Evidências, chame o Dono de "Você" e use o nome cadastrado
das outras Pessoas. Para conferir os nomes dos slugs, use `consultar` com
`SELECT slug, nome, dono FROM pessoas`.

Mostre os filmes na ordem devolvida, um bloco por filme, nesta ordem e
com uma linha em branco entre as partes:

1. O título, `### <posicao>. <titulo_pt>`. Com `titulo_pt` nulo, use
   `titulo`. Quando os dois diferirem, acrescente ` *(<titulo>)*`, o
   original. Se `so_palpites` for verdadeiro, termine com
   ` — sem fato que o sustente`.
2. A capa, `![capa](<capa>)`, quando vier.
3. A ficha numa linha, com as partes separadas por ` · `: `ano`, a duração
   (`1h44`, `2h00` ou `45min`), os `generos` separados por vírgula,
   `★ <nota_imdb>` com vírgula decimal, `<votos_imdb> votos` com ponto
   no milhar e `[IMDb](<imdb>)`. Pule a parte que vier nula ou vazia.
4. A `sinopse` em itálico, quando vier.
5. A cobertura: `Fato sobre <com_fato> de <presentes>; sem fato: <nomes>`,
   com os nomes de `cobertura.sem_fato`. Se todos tiverem Fato, fica só
   `Fato sobre 2 de 2`.
6. As Evidências, em lista.
7. Uma linha `---` fecha o bloco.

Título, capa, ficha, sinopse e cobertura são apresentação: o motivo do
filme está só nas Evidências.

Em `evidencias`, escolha uma linha por Presente. Priorize `forte`, depois
`moderada`, depois `fraca`. Entre linhas da mesma Força, use a primeira
na ordem do motor. Use o `sem fato` devolvido quando só houver Palpite, e
junte numa linha só os Presentes sem fato: `**Teo e Ana:**`. Escolha até
uma linha de `linhas_do_filme`, com o rótulo `Filme`, quando ela importar
para o pedido. Se várias disputarem a vaga, priorize aviso de gatilho sem
informação, faixa etária, resultado do gatilho, Crédito, duração e Clima,
nessa ordem.

Cada linha de Evidência começa pelo marcador da Força (`●●●` forte,
`●●○` moderada, `●○○` fraca) e termina com o Tipo entre parênteses, em
itálico. Copie `texto`, `fonte`, `data`, `forca` e `tipo` do mesmo item.
A Fonte vai entre parênteses, com a data separada por vírgula se houver.
Se faltar Fonte, omita esse par. Copie o texto do Does the Dog Die
inteiro, inclusive a citação, os votos e o "Powered by DoesTheDogDie.com"
quando vierem na linha.

```markdown
> Você e Teo · até 2h · regra padrão. Saíram 5 filmes.

### 1. As Horas Lentas

![capa](https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg)

2021 · 1h44 · Drama, Mistério · ★ 7,4 · 28.000 votos · [IMDb](https://www.imdb.com/title/tt9000104/)

*Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.*

Fato sobre 1 de 2; sem fato: Teo

- ●●● **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*
- ●○○ **Teo:** sem fato *(palpite)*
- ●●● **Filme:** duração 1h44, dentro do limite de 2h (IMDb) *(metadado)*

---
```

Depois do último bloco, copie os `avisos` e feche com um convite para o
Dono contar o que viram e como cada Presente reagiu. As `atribuicoes`
ficam no JSON e fora da resposta: o Dono decidiu assim em 2026-11-21,
porque só ele usa. Se a lista vier vazia, diga que o motor não encontrou
Candidatos para o pedido.

Passe o rascunho inteiro em `texto` a `verificar_resposta`, com o
`sessao.id` que `recomendar` devolveu. Se houver `linhas_invalidas`,
corrija a cópia a partir da Evidência do mesmo filme e Presente ou retire
a linha. Confira de novo na mesma Sessão. Envie o texto conferido quando
`valida` for verdadeiro. Se o verificador falhar, informe o erro e
retenha a Recomendação.

## Outros pedidos

- Para registrar o que viram, leia [Feedback](feedback.md).
- Para cadastrar Pessoas, aplicar o questionário, registrar Relatos e Vetos ou importar Notas, leia [Pessoas e gosto](pessoas.md).
- Para perguntas sobre o banco, use `consultar` com SELECT e responda com o que a consulta mostrou.
- Para atualizar dados públicos ou medir a Recomendação a pedido do Dono, use `atualizar` ou `avaliar` conforme a descrição da ferramenta. Se o Dono pedir uma grade de pesos, mostre os três melhores conjuntos com as métricas antes de qualquer alteração na config. Só aplique o conjunto que ele aprovar.
