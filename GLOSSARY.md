# Glossário

O vocabulário do recomendador de filmes: quem assiste, o que se pede, e de onde vem cada motivo de uma recomendação.

Cada termo traz, entre colchetes, o nome que ele tem no código, em inglês ([ADR 0001](docs/adr/0001-code-in-english.md)): o nome em prosa, o identificador e, quando o termo tem uma lista fechada, os valores dela. Um tipo usa o identificador em PascalCase; um campo, uma coleção ou um valor usa camelCase no TypeScript e snake_case nas chaves de arquivo (frontmatter do filmes-dados e `config/*.toml`). Texto da interface, URLs e prosa continuam em português, com o termo daqui.

## Pessoas

**Pessoa** [person, `Person`]:
Alguém cujo gosto o sistema guarda: o Dono ou qualquer pessoa que assiste com ele.
_Evitar_: usuário, amigo, perfil

**Dono** [owner, `owner`]:
A Pessoa que opera o sistema: pede recomendações, descreve as outras Pessoas e registra o Feedback das Sessões dela. Pode haver mais de um (#131); cada Sessão tem um Dono, e online é quem está logado (mapa #72).
_Evitar_: usuário, admin

## Sessão

**Sessão** [session, `Session`]:
Um encontro para ver um filme. Nasce no pedido do Dono, guarda os Presentes, o contexto, a Recomendação e o Filme escolhido, e fecha quando o Feedback é registrado. Sessão sem Feedback fica aberta.
_Evitar_: pedido, noite, rolê

**Link da Sessão** [session link, `sessionLink`]:
O endereço que o Dono da Sessão compartilha com os Presentes. Cada Presente se identifica pelo nome e pode participar enquanto a Sessão estiver aberta, sem login. O link dá acesso aos filmes da versão atual e às interações da Sessão, sem expor o gosto das Pessoas (#180).

**Presentes** [attendees, `attendees`]:
As Pessoas de uma Sessão. Não existe grupo guardado: cada Sessão tem os seus Presentes.
_Evitar_: grupo, turma

**Veto** [veto, `Veto`]:
A recusa permanente de uma Pessoa a um tipo de filme, como "Leo nunca vê terror". Vale em toda Sessão em que ela está entre os Presentes e tira o filme antes de qualquer ordenação. O alvo é um filme, uma entidade (gênero, diretor, ator) ou um grupo de tags com nome, como "comédia boba".
_Evitar_: filtro, bloqueio

**Ajuste** [adjustment, `Adjustment`; elo [link: `director`, `writer`, `cast`, `series`, `genre`]; nível [level: `none`, `low`, `normal`, `high`]]:
Quanto um elo entre filmes (diretor, roteiro, elenco, série, gênero) pesa para uma Pessoa: nada, pouco, normal ou muito. "Pro Lorenzo ator não importa" é o Ajuste de elenco dele em nada. Vale para o que o motor deduz das Notas dela; o que a Pessoa disse sobre um ator ou diretor nomeado continua valendo.
_Evitar_: peso da Pessoa, importância, preferência

**Pergunta aberta** [open question, `OpenQuestion`]:
Pergunta de gosto que o Claude fez sobre um Presente e ele pulou ("a Ana curte terror psicológico?"). Fica no arquivo da Pessoa com o assunto (entidade do Catálogo ou grupo de tags), a data e quantas vezes foi pulada; volta uma vez, quando o assunto aparece na tela, e pulada duas vezes, sai. Não é Fato: a resposta, quando vem, vira Declarado ou Relato.

**Guia de início** [setup guide, `SetupGuide`; passo [setup step, `SetupStep`: `taste`, `import`, `connector`]]:
Os três passos que a home mostra ao Dono que ainda não terminou de começar: Meu gosto (feito com 10 Notas ou um import), Importar do Letterboxd ou do Trakt (feito com um import) e Conector no Claude (feito quando o Claude se conectou ao filmes com o e-mail dele). Nunca bloqueia: pedir filme vale desde o primeiro dia. Some quando cada passo está feito ou pulado (mapa #140).
_Evitar_: onboarding, tutorial, cadastro

**Passo pulado** [skipped setup step, `skippedSetup`]:
Um passo do Guia de início que o Dono pulou. Fica no frontmatter do arquivo dele (`skipped_setup: [import]`), e por isso vale em todo aparelho. Na carteirinha ele tem estado próprio, o carimbo "pulei", e não conta como feito; só para dar o guia por encerrado ele vale como feito.

**Restrição** [constraint, `Constraint`]:
Um limite que vale só numa Sessão, como "tem criança" ou "sem legenda". Tira o filme antes de qualquer ordenação, como o Veto.
_Evitar_: filtro, veto da sessão

**Clima** [mood, `Mood`]:
O que uma Sessão quer sem excluir nenhum filme: a energia ("algo leve"), a ocasião ("aniversário da Ana"), a vontade do momento. Puxa a ordem, nunca tira um filme.
_Evitar_: desejo, mood, preferência

**Contexto** [context, `context`]:
Tudo o que o pedido diz além dos Presentes: as Restrições e o Clima. Vale só para a Sessão; o que diz como uma Pessoa é sempre (Veto, Declarado, Relato) é gosto, e só é gravado com um sim do Dono.

**Catálogo** [catalog, `Catalog`]:
Todos os filmes que o sistema conhece.

**Candidato** [candidate, `Candidate`]:
Um filme do Catálogo que sobreviveu aos Vetos e às Restrições de uma Sessão e entra na ordenação.

**Regra de escolha** [choice rule, `rule`: `default`, `average`, `by`]:
Como uma Sessão junta o gosto dos Presentes para ordenar os Candidatos. Cada Sessão pode usar uma; a padrão é média sem miséria com justiça entre sessões.
_Evitar_: regra de grupo, acordo, agregação

**Satisfação** [satisfaction, `satisfaction`]:
O quanto um Presente gostou dos Filmes escolhidos nas Sessões recentes: a média das reações dele no Feedback, de 0 a 1. Na Regra padrão em grupo, conta a satisfação acumulada nas últimas Sessões que ele dividiu com alguém da Sessão de hoje; quem ficou abaixo do mais satisfeito de hoje pesa mais, na medida da diferença (Stratigi et al., #170). Quem está no topo não perde nada. No `evaluate`, a satisfação mínima de uma Sessão é a reação mais baixa entre os Presentes.
_Evitar_: crédito, dívida, vez, saldo, felicidade, nota média

**Discordância** [disagreement, `disagreement`]:
A satisfação mais alta menos a mais baixa. Na Recomendação, entre os Presentes de hoje: é o quanto a Regra padrão pode puxar a ordem para quem ficou atrás. No `evaluate`, entre as reações de cada Sessão em que dois ou mais Presentes reagiram: o quanto o Filme escolhido dividiu o grupo.
_Evitar_: conflito, variância

**Recomendação** [recommendation, `Recommendation`]:
O top 5 que uma Sessão recebe, cada filme com os seus Motivos.
_Evitar_: sugestão, lista

**Parecença** [similarity, `similarity`]:
O quanto um filme se parece com um filme de referência, de 0 a 1: genoma, tags do MovieLens, vizinhos, gênero e diretor ou atores em comum, com os pesos de `[similar.weight]`. Mede-se a partir da referência, então não é simétrica. É o que o `--parecido` usa para filtrar.
_Evitar_: semelhança, distância

**Diversidade** [diversity, `diversity`]:
O quanto a Recomendação evita filmes parecidos entre si. Na ordem final (MMR, #177), cada lugar vai para o filme com a melhor pontuação da Regra de escolha descontada da maior Parecença com os filmes já escolhidos acima dele (`[diversity]` em `config/weights.toml`). O `evaluate` a mede pela Parecença média no top 5.
_Evitar_: variedade, mistura

**Versão da Sessão** [session version, `SessionVersion`]:
Uma Recomendação de uma Sessão aberta. Quando o Dono pede outra lista na mesma Sessão, a atual vira uma versão anterior, guardada com o pedido e os Presentes dela, e a nova passa a valer. O número da versão conta a partir de 1. Um filme de uma versão anterior pode voltar na nova; só o que o Dono trocou em alguma versão e o que algum Presente marcou Já vi na Sessão ficam fora dela até o fim.
_Evitar_: rodada, tentativa

**Mantido** [kept, `kept`]:
Um filme da versão anterior que o Dono quer na próxima. Ao regerar, fica no mesmo número e só as vagas ganham filme novo. Sai por Restrição ou Veto do pedido refeito, ou por estar abaixo da nota mínima do IMDb, nunca por gosto novo. O que sai da versão anterior vira uma saída, com o motivo: Já visto, trocado, a Restrição, o Veto ou a nota mínima.
_Evitar_: fixado, travado

**Cartaz** [billboard, `Billboard`]:
A Recomendação mostrada como página no T3 Code. Ele responde: em cada filme o Dono marca Já vi, Trocar, estrelas e comentário, e embaixo, depois do último filme, acrescenta contexto ou gosto; o botão Copiar pro chat junta tudo num texto que começa com `#cartaz <sessao> v<n>`, e o Dono cola no chat. Estrelas e comentário medem a Recomendação e ficam na Sessão, sem mexer no gosto; só o Trocar troca filme.
_Evitar_: formulário, painel

**Resposta** [reply, `replies`]:
O que o Dono colou do Cartaz (o texto `#cartaz <sessao> v<n>`), gravado na versão da Sessão: a data, as estrelas e o comentário de cada filme e o Acrescentar.
_Evitar_: retorno, devolutiva

**Acrescentar** [addition, `addition`]:
O texto livre que o Dono escreve embaixo do Cartaz, depois do último filme: contexto da noite ou gosto novo. O contexto regera direto; o gosto só é gravado com um sim do Dono.
_Evitar_: observação, extra

**Trocado** [swapped, `swapped`]:
Um filme que o Dono tirou da tela de uma versão: o Trocar do Cartaz, o não de um Presente no Voto e, ao refazer, o que ele mandou trocar e o que não ficou como Mantido. Fica fora da Sessão até o fim.
_Evitar_: descartado, rejeitado

**Voto** [vote, `votes`; `yes`, `no`]:
O sim ou o não de um Presente a um filme da tela, dado no celular pelo Link da Sessão, um filme de cada vez (o swipe do grupo, #182). Fica na versão da Sessão com quem votou e a data. O não é um Trocado daquele Presente: o filme sai e a Sessão regera. O sim sobe o filme: ao regerar, os Mantidos com mais sins, na Sessão inteira, vêm primeiro, nos números que os Mantidos já tinham, e as vagas não mudam. Voto não é Fato e não mexe no gosto.
_Evitar_: curtida, like

**Saída** [dropped, `dropped`; causa: `seen`, `swapped`, `constraint`, `veto`, `min_rating`, `mood`]:
Um filme da versão anterior que não está na nova, com a causa. A causa `mood` é de quem caiu porque o Dono pediu outro Clima: o filme continua elegível na Sessão. A causa não é Motivo: Motivo é por que um filme está na Recomendação.

**Capa** [poster, `poster`]:
O pôster do filme, vindo do TMDB. Não é o Cartaz, que é a Recomendação inteira.

**Regerar** [regenerate, `regenerate`]:
Fazer a próxima versão da Sessão a partir do Cartaz colado, trocando só o que caiu (Já visto, Trocar, Restrição ou Veto novos). O resto fica como Mantido; os que entram levam o selo "novo".
_Evitar_: refazer do zero, recomendar de novo

**Filmes mostrados** [shown films, `shown`]:
Os filmes da Recomendação que o Dono de fato viu na tela, na ordem em que apareceram. O Feedback grava a posição do Filme escolhido nessa lista.
_Evitar_: exibidos, lista da tela

**Filme escolhido** [chosen film, `chosen`]:
O filme que os Presentes de fato assistiram, saia ele da Recomendação ou não.

**Feedback** [feedback, `Feedback`]:
O registro que fecha uma Sessão: o Filme escolhido e como cada Presente reagiu. Cada reação vira um Fato com a Sessão como Fonte, de Tipo relato quando o Dono fala por outra Pessoa e nota quando a própria Pessoa avalia.
_Evitar_: avaliação, review

**Reação** [reaction, `reaction`, a coleção `reactions`: `liked`, `neutral`, `disliked`]:
Como um Presente recebeu o Filme escolhido no Feedback: gostou, neutro ou não gostou. Num Declarado ou num Relato, o mesmo campo diz como a Pessoa se sente sobre o alvo: ama, gosta, não gosta ou odeia (`love`, `like`, `dislike`, `hate`).
_Evitar_: avaliação, opinião

**Comentário** [comment, `comment`]:
O que um Presente achou do Filme escolhido, dito junto da Nota ou do Relato dele no Feedback. Vira um Declarado específico da Pessoa sobre o filme, com a Sessão como Fonte.
_Evitar_: opinião, review

**Já visto** [seen, `seen`]:
O Fato de que uma Pessoa já assistiu a um filme. Pesa contra o filme e aparece como Motivo, mas não é Veto: rever um filme continua possível, e só sai se o Dono pedir como Restrição ou se o Já vi foi marcado na Sessão que está sendo refeita.
_Evitar_: assistido, histórico

## Evidência

**Fato** [fact, `Fact`]:
Um dado guardado no banco, com Fonte e data. Ex.: Ana deu 4,5 a Paddington 2 em 2024-03-02, segundo o export do Letterboxd dela.
_Evitar_: dado, sinal

**Fonte** [source, `source`]:
De onde um Fato veio: uma base pública, o export de uma Pessoa, uma resposta de questionário, uma descrição do Dono ou o Feedback de uma Sessão.
_Evitar_: origem

**Import** [import, `import`; tipo [kind: `letterboxd`, `letterboxd-rss`, `trakt`]]:
Um export de uma Pessoa (o ZIP do Letterboxd ou do Trakt, ou o RSS público do Letterboxd dela) guardado no repo de dados e registrado no arquivo dela. É a Fonte das Notas e dos Já vistos que traz; tirar o Import tira os Fatos que só ele trazia. O RSS só entra com o sim da Pessoa.
_Evitar_: upload, sincronização

**Fila de resolução** [resolution queue, `queue`]:
Os filmes de um Import do Letterboxd que o filmes não achou no Catálogo sozinho e esperam o Dono: confirmar com o tconst, o link do IMDb ou o do TMDB, ou descartar com um motivo. A fila é uma só para todas as Pessoas, e a decisão vale para quem tem o filme.
_Evitar_: pendências

**Fila de Notas** [rating queue, `ratingQueue`]:
Os filmes que a tela de notas oferece a um Dono sem Import, um de cada vez, para ele dar Nota ou dizer "não vi": os de mais votos no IMDb que ele não viu, variando a década e o gênero. Cada Nota dada ali vira um Já visto com Nota, gravado num commit só quando ele diz "Pronto".
_Evitar_: questionário

**Motivo** [reason, `Reason`]:
Uma razão para um filme estar na Recomendação.
_Evitar_: justificativa, explicação

**Evidência** [evidence, `Evidence`]:
O uso de um Fato como Motivo. É ela que tem Força: o mesmo Fato pode ser forte para um Motivo e fraco para outro.
_Evitar_: prova

**Força** [strength, `strength`: `strong`, `moderate`, `weak`, `guess`]:
Quanto uma Evidência sustenta o seu Motivo: forte, moderada ou fraca. Um Motivo sem Fato sai com Força palpite (`guess`), como o Palpite.
_Evitar_: peso, confiança

**Tipo** [kind, `kind`: `metadata`, `rating`, `stated`, `report`, `review`, `guess`]:
A natureza do Fato por trás de uma Evidência, contada do ponto de vista da Pessoa de quem o Motivo fala. Pode ser metadado, nota, declarado, relato, review ou palpite.
_Evitar_: categoria

**Metadado** [metadata, `metadata`]:
Um Fato sobre o filme em si, vindo de uma base pública: elenco, diretor, gênero, duração, classificação.

**Nota** [rating, `Rating`]:
A avaliação que uma Pessoa deu a um filme, sempre dita com o nome de quem deu.
_Evitar_: nota própria, nota de amigo, rating

**Percentil da Nota** [rating percentile, `ratingPercentile`]:
Onde uma Nota fica na Escala da Pessoa, de 0 a 1: a parte das Notas da escala abaixo dela, mais metade das iguais. A régua tira a Força de uma Nota do percentil, pelos cortes de `[rating_percentile]` em `config/weights.toml`: o top 10% é forte.
_Evitar_: posição, ranking

**Escala da Pessoa** [rating scale, `RatingScale`]:
As Notas contra as quais a régua lê uma Nota dela: as próprias Notas da Pessoa, quando ela tem pelo menos o mínimo de `[rating_percentile]`; abaixo dele, as notas da população do MovieLens, na mesma escala de 0,5 a 5. As do Letterboxd e as do Trakt entram juntas.

**Nota alta** [high rating, `isHighRating`]:
Uma Nota que a régua lê a favor com Força moderada ou forte, só pelo percentil, sem a idade nem o Feedback. É o que o metadado agregado do caminho de conteúdo conta ("como 3 filmes a que deu Nota alta"). Num Declarado de filme, só o "ama".

**Declarado** [stated, `stated`]:
O que uma Pessoa disse sobre o próprio gosto ou sobre um filme, por exemplo num questionário ou numa review que ela escreveu.

**Relato** [report, `report`]:
O que o Dono disse sobre o gosto de outra Pessoa, como "Leo odeia filme lento". Vale menos que a própria Pessoa dizendo.
_Evitar_: descrição, declarado

**Review** [review, `review`]:
Um sinal tirado de opiniões de terceiros, que não estão entre as Pessoas, como as tags de uma base pública ou quantos estranhos que gostaram de um filme gostaram de outro.

**Nota prevista** [predicted rating, `predictedRating`]:
A Nota que o motor espera que uma Pessoa dê a um filme que ela não viu, de 1 a 10 como o Já vi do Cartaz. Não é Fato nem Nota: é uma previsão, e o `evaluate` mede o erro dela contra as Notas retidas. Ainda não existe; vem dos vizinhos de gosto (#174).
_Evitar_: nota esperada, match

**Palpite** [guess, `guess`]:
Um Motivo sem Fato que o sustente.
_Evitar_: chute, inferência
