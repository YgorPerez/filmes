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

**Acesso** [access, `grantAccess`, `revokeAccess`]:
O e-mail do Google que faz uma Pessoa ser Dono e entrar no site e no conector. Um admin dá o Acesso a uma Pessoa que já existe e o tira na página dela; sem ele, o próximo pedido da conta é recusado, e o gosto dela fica (#166).
_Evitar_: conta, permissão

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

**Ajuste** [adjustment, `Adjustment`; elo [link: `director`, `writer`, `cast`, `series`, `genre`, `cinematography`, `producer`]; nível [level: `none`, `low`, `normal`, `high`]]:
Quanto um Elo entre filmes (diretor, roteiro, elenco, série, gênero, fotografia, produtor) pesa para uma Pessoa: nada, pouco, normal ou muito. "Pro Lopo ator não importa" é o Ajuste de elenco dele em nada. Vale para o que o motor deduz das Notas dela; o que a Pessoa disse sobre um ator ou diretor nomeado continua valendo.
_Evitar_: peso da Pessoa, importância, preferência

**Pergunta aberta** [open question, `OpenQuestion`]:
Pergunta de gosto que o Claude fez sobre um Presente e ele pulou ("a Ana curte terror psicológico?"). Fica no arquivo da Pessoa com o assunto (entidade do Catálogo ou grupo de tags), a data e quantas vezes foi pulada; volta uma vez, quando o assunto aparece na tela, e pulada duas vezes, sai. Não é Fato: a resposta, quando vem, vira Declarado ou Relato.

**Guia de início** [setup guide, `SetupGuide`; passo [setup step, `SetupStep`: `taste`, `import`, `connector`]]:
Os três passos que a home mostra ao Dono que ainda não terminou de começar: Meu gosto (feito com 10 Notas ou um import), Importar do Letterboxd ou do Trakt (feito com um import) e Conector no Claude (feito quando o Claude se conectou ao filmes com o e-mail dele). Nunca bloqueia: pedir filme vale desde o primeiro dia. Some quando cada passo está feito ou pulado (mapa #140).
_Evitar_: onboarding, tutorial, cadastro

**Meu gosto** [my taste, `MY_TASTE`]:
A página da Pessoa do Dono que está logado, numa aba própria do app (`/meu-gosto`): as Notas dela (dar, importar, exportar), o gosto, os Vetos e os Ajustes. É a mesma página de Pessoa das outras, vista por ela mesma (mapa #218). Também é o nome do primeiro passo do Guia de início.
_Evitar_: perfil, minha conta

**Passo pulado** [skipped setup step, `skippedSetup`]:
Um passo do Guia de início que o Dono pulou. Fica no frontmatter do arquivo dele (`skipped_setup: [import]`), e por isso vale em todo aparelho. No guia da home ele tem estado próprio, "pulado", com "Retomar", e não conta como feito; só para dar o guia por encerrado ele vale como feito.

**Restrição** [constraint, `Constraint`]:
Um limite que vale só numa Sessão, como "tem criança" ou "sem legenda". Tira o filme antes de qualquer ordenação, como o Veto.
_Evitar_: filtro, veto da sessão

**Série na ordem** [series order, `series_order`; modo [mode: `previous`, `all`, `off`]]:
A Restrição, ligada por padrão, que tira a continuação de uma série de filmes quando algum Presente não viu o filme antes dela. A série é a do Wikidata com classe "série de filmes"; franquia (Marvel, Star Wars) não conta. A ordem vem da data de estreia, e data igual ou ausente não põe um filme antes do outro. Três modos: só se viram o anterior (o padrão), só se viram todos os anteriores, ou tanto faz. O filme só sai; o anterior não é empurrado para a lista.
_Evitar_: sequência, franquia, saga

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

**Aposta** [bet, `bet`]:
O filme da 5ª vaga da Recomendação (`[bet] position`): um Candidato com Nota prevista boa e pouca Evidência, que a Regra deixaria de fora. Sai por amostragem de Thompson: cada Presente com Nota prevista sorteia uma Nota em torno dela, tanto mais espalhada quanto mais incerta, e vence a maior média dos sorteios. O sorteio parte do id da Sessão, então refazer a mesma Sessão sorteia o mesmo. Vetos e Restrições valem para ela. O Já vi e o Trocar tiram a Aposta da Sessão, e a Nota do Já vi muda os vizinhos de gosto do próximo sorteio. Mantida, continua Aposta. No Cartaz, leva o selo "aposta".
_Evitar_: exploração, coringa, surpresa

**Histórico de apostas** [bet record, `BetRecord`, `bet_marks`, `cautious_bet`, `min_predicted_floor`]:
Os acertos e fracassos das Apostas de cada Pessoa, lidos das Sessões em que esteve Presente. Um Filme escolhido com reação à altura da mediana dela ou um Já vi com Nota alta conta como acerto. Trocar explícito e Já vi com Nota contra contam como fracasso. A Sessão guarda as marcações da Aposta em `bet_marks` (`seen` ou `swapped`) e marca com `cautious_bet` a Aposta que exigiu Nota prevista maior. Um histórico bom reduz o mínimo da Nota prevista até o piso `min_predicted_floor`. O Decaimento da Nota dá menos peso às respostas antigas.

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
Um filme da versão anterior que o Dono quer na próxima. Ao regerar, ocupa um dos números dos Mantidos, em ordem de Votos, e só as vagas ganham filme novo. Sai por Restrição ou Veto do pedido refeito, ou por estar abaixo da nota mínima do IMDb, nunca por gosto novo. O que sai da versão anterior vira uma saída, com o motivo: Já visto, trocado, a Restrição, o Veto ou a nota mínima.
_Evitar_: fixado, travado

**Cartaz** [billboard, `Billboard`]:
A Recomendação mostrada como página no T3 Code. Ele responde: em cada filme o Dono marca Já vi, Trocar, estrelas e comentário, e embaixo, depois do último filme, acrescenta contexto ou gosto; o botão Copiar pro chat junta tudo num texto que começa com `#cartaz <sessao> v<n>`, e o Dono cola no chat. Estrelas e comentário medem a Recomendação e ficam na Sessão, sem mexer no gosto; só o Trocar troca filme.
_Evitar_: formulário, painel

**Seção do Cartaz** [billboard section, `BillboardSection`]:
Os filmes vizinhos do Cartaz que estão ali pelo mesmo Motivo, sob um título com ele e com quem o tem ("Porque você e Iara gostam de Rui Tavares", "Gente de gosto parecido com você gostou"). O Motivo de um filme é o da Evidência a favor mais forte dele entre os Presentes: uma entidade de que gostam, um filme de que gostaram ou os vizinhos de gosto; é gravado na Sessão quando a Recomendação sai. A Aposta tem a seção dela, e o filme sem Motivo a favor fica em "Outras escolhas". A ordem e o tamanho da Recomendação não mudam: um Motivo que volta depois de outro abre outra seção, com o mesmo título e "de novo" (#183).
_Evitar_: grupo, fileira, categoria

**Resposta** [reply, `replies`]:
O que o Dono colou do Cartaz (o texto `#cartaz <sessao> v<n>`), gravado na versão da Sessão: a data, as estrelas e o comentário de cada filme e o Acrescentar.
_Evitar_: retorno, devolutiva

**Acrescentar** [addition, `addition`]:
O texto livre que o Dono escreve embaixo do Cartaz, depois do último filme: contexto da noite ou gosto novo. O contexto regera direto; o gosto só é gravado com um sim do Dono.
_Evitar_: observação, extra

**Leitura do pedido** [request reading, `RequestReading`]:
O que o motor entende, sem modelo de linguagem, de uma frase que o Dono digita no app web ("eu e a Iara, algo leve, até 2h"): os Presentes, o Clima, as Restrições, quantos filmes e a Regra "de", cada item com as palavras de onde veio, o que ficou sem entender e o nome ou o título que pode ser mais de um. O vocabulário fica em `config/request_reading.toml`; a mesma frase sai sempre igual. Nunca lê gosto: uma oração como "a Ana odeia terror" volta sem entender. No chat, quem lê a frase é o Claude.
_Evitar_: parser, interpretação

**Trocado** [swapped, `swapped`]:
Um filme que o Dono tirou da tela de uma versão: o Trocar do Cartaz, o não de um Presente no Voto e, ao refazer, o que ele mandou trocar e o que não ficou como Mantido. Fica fora da Sessão até o fim.
_Evitar_: descartado, rejeitado

**Voto** [vote, `votes`, `replaces`; `yes`, `no`]:
O sim ou o não de um Presente a um filme da tela, dado no celular pelo Link da Sessão, um filme de cada vez (o swipe do grupo, #182). Fica na versão da Sessão com quem votou e a data. O não é um Trocado daquele Presente: o filme sai e a Sessão regera. Na contagem vale o último envio de cada Presente, cujo primeiro Voto tem `replaces: true`. Os Mantidos com mais sins vêm primeiro, nos números que os Mantidos já tinham, e os empates mantêm a ordem. Se a ordem muda, o sim por si só regera a Sessão (#205). Voto não é Fato e não mexe no gosto.
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

**Import** [import, `import`; tipo [kind: `letterboxd`, `letterboxd-rss`, `trakt`, `trakt-api`, `imdb`, `simkl`, `tvtime`]]:
Um export de uma Pessoa (o ZIP do Letterboxd ou do Trakt, o CSV de avaliações do IMDb, o backup do Simkl, o do TV Time, o RSS público do Letterboxd dela ou a foto do Trakt dela lida pela API) guardado no repo de dados e registrado no arquivo dela. Do backup do TV Time (o export GDPR ou o do TV Time Liberator) fica só a parte dos filmes: as linhas de filme, com as colunas que o import lê, nunca as credenciais da conta, as séries nem o `user_id`. É a Fonte das Notas, dos Já vistos e da Watchlist que traz; tirar o Import tira os Fatos que só ele trazia. O RSS só entra com o sim da Pessoa.
_Evitar_: upload; "sincronização" para o Import de um arquivo (o termo vale só para a Leitura do Trakt)

**Conexão com o Trakt** [Trakt connection, `TraktConnection`; o registro, `trakt_grants`]:
A autorização que uma Pessoa dá ao filmes para ler e gravar na conta dela do Trakt: ela entra em `/trakt` com o e-mail do arquivo dela, marca o consentimento e conecta pelo Trakt. O registro só existe com o consentimento e fica no banco de login da VPS (`auth.sqlite`), com os tokens cifrados, fora do repo de dados. Desconectar apaga o registro e revoga o token no Trakt; um token que o Trakt recusa também apaga o registro, e ela precisa conectar de novo. O motor recebe do app só o acesso de cada Pessoa [Trakt access, `TraktAccess`]: o token, nada sem conexão, ou "recusado" [`TRAKT_REVOKED`].
_Evitar_: login do Trakt, integração

**Leitura do Trakt** [Trakt sync, `syncTrakt`]:
O que o filmes lê do Trakt de uma Pessoa pela API: o histórico, as notas e a watchlist de filmes, da conta dela pela Conexão com o Trakt ou de um perfil público pelo nome. Fica em filmes-dados como um Import `trakt-api`, uma foto que a seguinte substitui, e carrega como o ZIP do Trakt. Roda no "Sincronizar agora" do import e quando uma Sessão nova abre, para cada Presente conectado ou com nome; uma falha vira aviso. Se o Trakt recusou a Conexão dela, a leitura vai pelo nome do perfil, quando ela tem um, e leva o mesmo aviso do Envio ao Trakt: reconectar o Trakt. "Sincronizar" vale aqui, e só aqui: trazer agora o Trakt dela para o filmes, num sentido só, trocando a foto anterior.

**Envio ao Trakt** [Trakt write-back, `syncTraktFeedback`]:
O que o filmes grava no Trakt de cada Presente com Conexão com o Trakt, depois de gravar o Feedback: o Filme escolhido e os Já vi do Cartaz no histórico, e as Notas, de 1 a 10. Filme que o Trakt não conhece fica de fora, com um aviso que o nomeia, e o resto segue. Se o Trakt falhar, o Feedback fica salvo e o resultado leva um aviso.
_Evitar_: sincronização (é a Leitura do Trakt, no sentido contrário), export

**Fila de resolução** [resolution queue, `queue`]:
Os filmes de um Import do Letterboxd ou do TV Time que o filmes não achou no Catálogo sozinho e esperam o Dono: confirmar com o tconst, o link do IMDb ou o do TMDB, ou descartar com um motivo. A fila é uma só para todas as Pessoas, e a decisão vale para quem tem o filme.
_Evitar_: pendências

**Fila de Notas** [rating queue, `ratingQueue`]:
Os filmes que a tela de notas oferece a um Dono sem Import, um de cada vez, para ele dar Nota ou dizer "não vi": os de mais votos no IMDb que ele não viu, variando a década e o gênero. Cada Nota dada ali vira um Já visto com Nota, gravado num commit só quando ele diz "Pronto".
_Evitar_: questionário

**Pergunta par a par** [pairwise question, `PairwiseQuestion`]:
"Qual dos dois você gostou mais?", feita a um Presente pelo Link da Sessão: dois filmes que ele ainda não tem como Já visto, escolhidos pela entropia das notas do MovieLens vezes a popularidade (Rashid et al. 2002, #170), porque um filme que muita gente viu e que divide opiniões diz mais sobre quem responde. Escolher um diz que viu os dois; "não vi os dois" pula o par. A resposta fica na Sessão até o Dono gravar ou descartar: gravada, o escolhido vira Nota 3,5 (Força fraca) e o outro, Já visto sem Nota (#181).
_Evitar_: quiz, duelo, questionário

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

**Elo** [link, `Link`: `director`, `writer`, `cast`, `series`, `genre`, `cinematography`, `producer`]:
A mesma entidade em dois filmes, pela qual o caminho de conteúdo leva uma Nota de um ao outro: diretor, roteiro, elenco, série, gênero, fotografia (o diretor de fotografia, P344 do Wikidata) e produtor (P162). No banco, cada um é o predicado de `arestas` em português (`diretor`, `fotografia`, `produtor`...). Cada Elo tem um peso em `[path.weight]` e um teto de Força na régua. Música, estúdio e país estão no Catálogo, mas não são Elos (#283).
_Evitar_: aresta (é a linha do banco), relação

**Prêmio ou indicação** [award or nomination, `awards`]:
Uma distinção do Wikidata da lista de `config/awards.toml`. Cada distinção aparece como linha do filme no Cartaz. A Regra soma o bônus uma vez por filme, e a distinção não conta como Fato da Recomendação.

**Nota da crítica** [critics' score, `critics`]:
O Tomatometer do Rotten Tomatoes e o Metascore do Metacritic, lidos da resposta do OMDb só para os filmes que chegam às primeiras posições. Aparece como linha do filme no Cartaz ("93% no Rotten Tomatoes"), soma um bônus que só reordena essas posições e não conta como Fato.

**Nota** [rating, `Rating`]:
A avaliação que uma Pessoa deu a um filme, sempre dita com o nome de quem deu.
_Evitar_: nota própria, nota de amigo, rating

**Percentil da Nota** [rating percentile, `ratingPercentile`]:
Onde uma Nota fica na Escala da Pessoa, de 0 a 1: a parte das Notas da escala abaixo dela, mais metade das iguais. A régua tira a Força de uma Nota do percentil, pelos cortes de `[rating_percentile]` em `config/weights.toml`: o top 10% é forte.
_Evitar_: posição, ranking

**Escala da Pessoa** [rating scale, `RatingScale`]:
As Notas contra as quais a régua lê uma Nota dela: as próprias Notas da Pessoa, quando ela tem pelo menos o mínimo de `[rating_percentile]`; abaixo dele, as notas da população do MovieLens, na mesma escala de 0,5 a 5. As do Letterboxd, do Trakt, do IMDb, do Simkl e do TV Time entram juntas.

**Nota alta** [high rating, `isHighRating`]:
Uma Nota que a régua lê a favor com Força moderada ou forte, só pelo percentil, sem o Feedback. É o que o metadado agregado do caminho de conteúdo conta ("como 3 filmes a que deu nota alta"). Num Declarado de filme, só o "ama".

**Decaimento** [rating decay, `ratingDecay`]:
O quanto o tempo apaga uma Nota: a contribuição dela cai à metade a cada meia-vida (`half_life_years`) e nunca fica abaixo de um piso (`floor`). A Força da Nota não muda com a idade. Declarado, Relato e Já visto não decaem.
_Evitar_: envelhecimento, validade

**Declarado** [stated, `stated`]:
O que uma Pessoa disse sobre o próprio gosto ou sobre um filme, por exemplo num questionário ou numa review que ela escreveu.

**Watchlist** [watchlist, `watchlist`]:
Os filmes que uma Pessoa marcou para ver no Letterboxd, no Trakt, no Simkl ou no TV Time. Cada um é um Declarado a favor, de Força moderada, até ela ter Já visto o filme. Vale a watchlist do import mais recente que traz uma.

**Relato** [report, `report`]:
O que o Dono disse sobre o gosto de outra Pessoa, como "Leo odeia filme lento". Vale menos que a própria Pessoa dizendo.
_Evitar_: descrição, declarado

**Review** [review, `review`]:
Um sinal tirado de opiniões de terceiros, que não estão entre as Pessoas, como as tags de uma base pública ou quantos estranhos que gostaram de um filme gostaram de outro.

**Vizinhos de gosto** [taste neighbors, `tasteNeighbors`]:
Os usuários do MovieLens mais perto do gosto de uma Pessoa: os que, nos filmes que ela também viu, deram notas no mesmo percentil que as dela, cada um lido na própria escala. Quantos e com quantos filmes em comum ficam em `[taste_neighbors]` de `config/weights.toml`. O que eles deram a um Candidato é uma Review ("23 pessoas de gosto parecido deram 4,3 em média a este filme"), com Força pela régua: quantos o viram, quanto concordam e quanto dividem com ela.
_Evitar_: usuários parecidos, almas gêmeas

**Nota prevista** [predicted rating, `predictedRating`]:
A Nota que o motor espera que uma Pessoa dê a um filme, de 1 a 10 como o Já vi do Cartaz: o percentil médio dos vizinhos de gosto que viram o filme, lido de volta na Escala da Pessoa, de modo que o mesmo percentil é uma Nota mais alta para quem dá Notas altas. Sai com quantos vizinhos a sustentam e com o desvio entre eles [deviation, `deviation`], que diz quanto ela é incerta. Não é Fato nem Nota: é uma previsão, e o `evaluate` mede o erro dela contra as Notas retidas. A Sessão guarda a de cada filme da versão, e o Cartaz mostra a guardada, mesmo que os vizinhos mudem depois. É a Nota prevista calibrada; a de antes da Calibração [raw, `raw`] fica para o `evaluate`.
_Evitar_: nota esperada, match

**Calibração da Nota prevista** [prediction calibration, `predictionCalibration`]:
A correção da Nota prevista de uma Pessoa pelas Notas dela: nos filmes a que ela deu Nota, o que os vizinhos de gosto teriam previsto sem aquela Nota (cada filme deixado de fora na escolha deles) contra o percentil que ela deu, numa reta (deslocamento e inclinação no percentil). Quem tem vizinhos mais generosos que ela recebe uma Nota prevista mais baixa. Com poucos filmes assim, a reta vale pouco: pesa n / (n + `[prediction_calibration] pseudo_count`), e o resto fica sem correção. A Nota da Pergunta par a par fica fora, e no `evaluate` só entram as Notas de antes do corte. Muda o número, não a Evidência dos vizinhos nem a Força dela.
_Evitar_: ajuste (é outra coisa), correção de viés

**Erro da Nota prevista** [prediction error, `predictionError`]:
A média das diferenças absolutas [mean absolute error, `meanAbsoluteError`] entre a Nota prevista calibrada e a Nota da Pessoa, na escala de 1 a 10. A página da Pessoa usa os filmes comparados na Calibração e mostra a média junto do número de filmes, a partir de `[rating_percentile] min_ratings`.

**Palpite** [guess, `guess`]:
Um Motivo sem Fato que o sustente.
_Evitar_: chute, inferência
