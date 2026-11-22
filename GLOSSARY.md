# Glossário

O vocabulário do recomendador de filmes: quem assiste, o que se pede, e de onde vem cada motivo de uma recomendação.

## Pessoas

**Pessoa**:
Alguém cujo gosto o sistema guarda: o Dono ou qualquer pessoa que assiste com ele.
_Evitar_: usuário, amigo, perfil

**Dono**:
A Pessoa que opera o sistema pelo Claude. Só ele pede recomendações, descreve as outras Pessoas e registra o Feedback.
_Evitar_: usuário, admin

## Sessão

**Sessão**:
Um encontro para ver um filme. Nasce no pedido do Dono, guarda os Presentes, o contexto, a Recomendação e o Filme escolhido, e fecha quando o Feedback é registrado. Sessão sem Feedback fica aberta.
_Evitar_: pedido, noite, rolê

**Presentes**:
As Pessoas de uma Sessão. Não existe grupo guardado: cada Sessão tem os seus Presentes.
_Evitar_: grupo, turma

**Veto**:
A recusa permanente de uma Pessoa a um tipo de filme, como "Leo nunca vê terror". Vale em toda Sessão em que ela está entre os Presentes e tira o filme antes de qualquer ordenação.
_Evitar_: filtro, bloqueio

**Ajuste**:
Quanto um elo entre filmes (diretor, roteiro, elenco, série, gênero) pesa para uma Pessoa: nada, pouco, normal ou muito. "Pro Lorenzo ator não importa" é o Ajuste de elenco dele em nada. Vale para o que o motor deduz das Notas dela; o que a Pessoa disse sobre um ator ou diretor nomeado continua valendo.
_Evitar_: peso da Pessoa, importância, preferência

**Restrição**:
Um limite que vale só numa Sessão, como "tem criança" ou "sem legenda". Tira o filme antes de qualquer ordenação, como o Veto.
_Evitar_: filtro, veto da sessão

**Clima**:
O que uma Sessão quer sem excluir nenhum filme: a energia ("algo leve"), a ocasião ("aniversário da Ana"), a vontade do momento. Puxa a ordem, nunca tira um filme.
_Evitar_: desejo, mood, preferência

**Contexto**:
Tudo o que o pedido diz além dos Presentes: as Restrições e o Clima.

**Catálogo**:
Todos os filmes que o sistema conhece.

**Candidato**:
Um filme do Catálogo que sobreviveu aos Vetos e às Restrições de uma Sessão e entra na ordenação.

**Regra de escolha**:
Como uma Sessão junta o gosto dos Presentes para ordenar os Candidatos. Cada Sessão pode usar uma; a padrão é média sem miséria com justiça entre sessões.
_Evitar_: regra de grupo, acordo, agregação

**Crédito**:
O quanto uma Pessoa ficou atrás dos outros Presentes nas Sessões recentes que dividiu com quem está na Sessão de hoje, medido pelo Feedback. Quem tem Crédito pesa mais na Regra de escolha; quem gostou mais que a média não perde nada.
_Evitar_: dívida, vez, saldo

**Recomendação**:
O top 5 que uma Sessão recebe, cada filme com os seus Motivos.
_Evitar_: sugestão, lista

**Versão da Sessão**:
Uma Recomendação de uma Sessão aberta. Quando o Dono pede outra lista na mesma Sessão, a atual vira uma versão anterior, guardada com o pedido e os Presentes dela, e a nova passa a valer. O número da versão conta a partir de 1.
_Evitar_: rodada, tentativa

**Filmes mostrados**:
Os filmes da Recomendação que o Dono de fato viu na tela, na ordem em que apareceram. O Feedback grava a posição do Filme escolhido nessa lista.
_Evitar_: exibidos, lista da tela

**Filme escolhido**:
O filme que os Presentes de fato assistiram, saia ele da Recomendação ou não.

**Feedback**:
O registro que fecha uma Sessão: o Filme escolhido e como cada Presente reagiu. Cada reação vira um Fato com a Sessão como Fonte, de Tipo relato quando o Dono fala por outra Pessoa e nota quando a própria Pessoa avalia.
_Evitar_: avaliação, review

**Comentário**:
O que um Presente achou do Filme escolhido, dito junto da Nota ou do Relato dele no Feedback. Vira um Declarado específico da Pessoa sobre o filme, com a Sessão como Fonte.
_Evitar_: opinião, review

**Já visto**:
O Fato de que uma Pessoa já assistiu a um filme. Pesa contra o filme e aparece como Motivo, mas não é Veto: rever um filme continua possível, e só sai se o Dono pedir como Restrição.
_Evitar_: assistido, histórico

## Evidência

**Fato**:
Um dado guardado no banco, com Fonte e data. Ex.: Ana deu 4,5 a Paddington 2 em 2024-03-02, segundo o export do Letterboxd dela.
_Evitar_: dado, sinal

**Fonte**:
De onde um Fato veio: uma base pública, o export de uma Pessoa, uma resposta de questionário, uma descrição do Dono ou o Feedback de uma Sessão.
_Evitar_: origem

**Motivo**:
Uma razão para um filme estar na Recomendação.
_Evitar_: justificativa, explicação

**Evidência**:
O uso de um Fato como Motivo. É ela que tem Força: o mesmo Fato pode ser forte para um Motivo e fraco para outro.
_Evitar_: prova

**Força**:
Quanto uma Evidência sustenta o seu Motivo: forte, moderada ou fraca.
_Evitar_: peso, confiança

**Tipo**:
A natureza do Fato por trás de uma Evidência, contada do ponto de vista da Pessoa de quem o Motivo fala. Pode ser metadado, nota, declarado, relato, review ou palpite.
_Evitar_: categoria

**Metadado**:
Um Fato sobre o filme em si, vindo de uma base pública: elenco, diretor, gênero, duração, classificação.

**Nota**:
A avaliação que uma Pessoa deu a um filme, sempre dita com o nome de quem deu.
_Evitar_: nota própria, nota de amigo, rating

**Declarado**:
O que uma Pessoa disse sobre o próprio gosto ou sobre um filme, por exemplo num questionário ou numa review que ela escreveu.

**Relato**:
O que o Dono disse sobre o gosto de outra Pessoa, como "Leo odeia filme lento". Vale menos que a própria Pessoa dizendo.
_Evitar_: descrição, declarado

**Review**:
Um sinal tirado de opiniões de terceiros, que não estão entre as Pessoas, como as tags de uma base pública ou quantos estranhos que gostaram de um filme gostaram de outro.

**Palpite**:
Um Motivo sem Fato que o sustente.
_Evitar_: chute, inferência
