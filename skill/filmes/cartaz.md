# Cartaz que responde

O cartaz é o lugar das marcações: em cada filme, Já vi (por Presente, com
nota de 1 a 10), Trocar, estrelas e comentário; no topo, o campo
acrescentar e o botão Copiar pro chat. O Dono marca, copia e cola no chat
um texto que começa com `#cartaz <sessao> v<n>`.

## Texto colado

Uma mensagem com uma linha `#cartaz` vai inteira, como veio, para
`responder_cartaz`, com a Sessão do cabeçalho em `sessao`. Conversa em
volta da linha pode ir junto: a ferramenta acha o texto do cartaz. Ela
grava os Já vistos, as estrelas, os comentários e o acrescentar, e
devolve `regerar`, `manter`, `saem`, `acrescentar` e `comentarios`.

1. Leia o `acrescentar` e os `comentarios` e separe cada trecho em uma
   destas classes:
   - **Contexto da noite**: vale só para esta Sessão, como "chegou a Ana",
     "só temos 1h30", "algo leve", "nada pesado hoje". Ele regera sem
     pedir confirmação.
   - **Gosto permanente**: diz como alguém é, como "o Leo odeia musical" ou
     "a Ana ama a Helena Prado". Ele espera o sim do passo 4.
   - **Só sobre o filme**: "lindo, mas longo". Fica na Sessão, onde a
     ferramenta já gravou.

   Só o Trocar troca filme. Um comentário, mesmo negativo, deixa o filme
   na tela.
2. Com `regerar` falso, diga numa linha o que foi gravado (Já vistos,
   estrelas) e os `avisos`. A tela continua a mesma.
3. Com `regerar` verdadeiro, chame `recomendar` com `sessao` e com
   `manter` igual ao `manter` devolvido. Monte o pedido inteiro, como em
   [Pedido que muda](SKILL.md#pedido-que-muda): os Presentes, o tempo, os
   Climas e as Restrições da versão anterior, mais o contexto da noite
   traduzido nos campos de `recomendar` ("chegou a Ana" entra em
   `presentes`, "nada pesado" vira `sem_tristeza`). Em `pedido`, junte o
   pedido anterior e o acrescentar. Depois gere e mostre o cartaz novo
   como em [Cartaz no T3 Code](SKILL.md#cartaz-no-t3-code). O cartaz já
   marca os que entraram com "novo" e diz o que saiu e por quê.
4. Para cada gosto permanente, um por vez, mostre numa linha a frase que
   vai gravar e o registro, e espere o sim:

   > Gravar como Relato do Leo: "o Leo odeia musical" (odeia Musical)?

   O registro segue [Pessoas e gosto](pessoas.md): Veto para "nunca vê",
   Declarado (`especificidade: "generico"`, `fonte: "cartaz <sessao>"`)
   para o que o Dono diz de si, Relato para o que ele diz de outra
   Pessoa. Com o sim, grave. Se o registro for um Veto que pega um filme
   da tela, regere com `manter` igual à tela atual: o motor tira o
   vetado e explica em `saidas`.

Texto de versão velha vale pelo filme, e `avisos` diz o que foi ignorado.
Erro `uso_invalido` (Sessão errada, marcação desconhecida, Já vi de quem
não estava) não grava nada: diga o erro numa linha e peça o texto certo.

## Perguntas de gosto

Depois de cada cartaz mostrado, faça 1 ou 2 perguntas de gosto sobre os
Presentes, no AskUserQuestion, cada uma ligada a um filme da tela e com
um assunto do Catálogo: o diretor, um ator, um gênero (entidade `Q...`)
ou um grupo de `config/vetos_por_tag.toml`. O filme em si não é assunto.

1. Comece pelas perguntas abertas dos Presentes cujo assunto está na
   tela:

   ```sql
   SELECT DISTINCT p.pessoa, p.texto, p.assunto, p.rotulo FROM perguntas_abertas p
   JOIN arestas a ON a.entidade_id = p.assunto
   WHERE p.pessoa IN (<presentes>) AND a.filme_id IN (<filmes da tela>)
   ```

   Pergunta com assunto de grupo (`comedia_boba`, `lento`) entra quando um
   filme da tela tem as tags ou os gêneros do grupo.
2. Complete com perguntas novas onde o gosto está no escuro: o Presente
   em `cobertura.sem_fato` de um filme da tela, ou um elo do filme (a
   diretora, o gênero) sobre o qual ele não tem Fato.
3. Escreva cada pergunta com o filme que a motivou e respostas para
   clicar, a última sempre "pular":

   > A Ana curte filme de terror psicológico? (o 3, A Casa Funda, é um)
   > · ama · gosta · não curte · nunca vê · pular

   O texto livre vem pelo "Other" do AskUserQuestion.
4. Resposta "pular": chame `pessoa` com `acao: "pular"`, a Pessoa, o
   `texto` da pergunta e o assunto em `entidade` ou `grupo`. Com
   `saiu: true`, ela foi pulada pela segunda vez e não volta.
5. Resposta dada: vira gosto permanente pelo passo 4 de
   [Texto colado](#texto-colado), com a linha e o sim antes de gravar
   (fonte `pergunta do cartaz <sessao>`). Se a pergunta era aberta,
   tire-a com `pessoa`, `acao: "remover"` e `pergunta` igual ao assunto.
   Uma resposta que é contexto da noite ("hoje ela não tá pra terror")
   regera direto, como o acrescentar.
