# Fonte de classificação etária para o veto de criança

Ticket: [#13](https://github.com/YgorPerez/filmes/issues/13). Pesquisa feita em 2026-11-20.

## Resposta curta

O Wikidata tem 31 propriedades de classificação de cinema, não só a ClassInd. Somadas, cobrem 62.057 filmes. Entre os filmes do Wikidata com 100 votos ou mais no IMDb, 37% têm pelo menos uma classificação. Com 1.000 votos ou mais, 62%. A ClassInd sozinha cobre 4% e 9% desses mesmos recortes.

Recomendo esta ordem: ClassInd quando existir; senão, a faixa mais alta entre MPA, BBFC, FSK, Kijkwijzer e Medierådet, convertidas pela tabela abaixo; senão, o filme não passa no veto de criança. CNC (França) e EIRIN (Japão) só contam quando restringem (12, 16, 18). O "livre" deles (tous publics, G) quase nunca bate com a ClassInd.

OMDb e Does the Dog Die não resolvem o buraco. O OMDb não documenta o campo `Rated`, e o Does the Dog Die não tem classificação etária, só avisos de conteúdo.

## Como medi

Mesmo método da [pesquisa do catálogo](https://github.com/YgorPerez/filmes/blob/research/catalogo/docs/research/catalogo.md): SPARQL no [QLever](https://qlever.dev/api/wikidata), filmes com P31 = Q11424 (sem subclasses).

1. Listei as propriedades que são instância de "Wikidata property representing cinema content ratings" (Q105208518). Deu 31.
2. Puxei numa consulta todas as triplas filme–propriedade–valor dessas 31 propriedades, com o ID do IMDb (P345). Foram 144.439 linhas em 6 segundos.
3. Cruzei com `title.ratings.tsv.gz` dos [datasets do IMDb](https://data.imdb.com/non-commercial-datasets/) baixado em 2026-11-20.

Denominadores, na mesma data: 358.538 filmes no Wikidata, 279.881 com ID do IMDb, 130.222 com 100 votos ou mais, 48.425 com 1.000 votos ou mais.

## Cobertura no Wikidata

| Propriedade | Sistema | Filmes | 100+ votos | 1.000+ votos |
|---|---|---|---|---|
| P2758 | CNC (França) | 26.464 | 21.419 | 14.111 |
| P1981 | FSK (Alemanha) | 18.131 | 16.517 | 13.391 |
| P2684 | Kijkwijzer (Holanda) | 15.200 | 14.758 | 12.558 |
| P5970 | Medierådet (Dinamarca) | 10.244 | 7.687 | 6.409 |
| P2756 | EIRIN (Japão) | 9.859 | 7.377 | 5.526 |
| P1657 | MPA (EUA) | 6.356 | 6.319 | 5.975 |
| P2747 | Filmiroda (Hungria, 2004–2011) | 6.131 | 6.066 | 5.457 |
| P3306 | ICAA (Espanha) | 5.251 | 4.943 | 4.079 |
| P2363 | NMHH (Hungria) | 5.009 | 4.752 | 4.034 |
| P3216 | ClassInd (Brasil) | 4.846 | 4.720 | 4.178 |
| P2637 | RARS (Rússia) | 4.285 | 3.942 | 3.332 |
| P2629 | BBFC (Reino Unido) | 3.393 | 3.355 | 3.136 |
| P3156 | Australian Classification | 3.300 | 3.185 | 2.673 |
| P3402 | CNC (Romênia) | 3.029 | 2.972 | 2.752 |
| P3834 | RTC (México) | 2.536 | 2.518 | 2.378 |
| P7573 | IFCO (Irlanda) | 2.510 | 2.473 | 2.214 |
| P5150 | IGAC (Portugal) | 2.473 | 2.449 | 2.252 |
| P3650 | JMK (Áustria) | 2.374 | 2.316 | 2.090 |
| P6658 | RCQ (Quebec) | 2.182 | 2.013 | 1.815 |
| P5201 | IMDA (Singapura) | 1.465 | 1.464 | 1.440 |
| P3818 | KMRB (Coreia do Sul) | 1.381 | 1.343 | 1.220 |
| P3428 | INCAA (Argentina) | 1.215 | 1.208 | 1.171 |
| P4437 | FPB (África do Sul) | 1.191 | 1.177 | 1.161 |
| P8889 | MTRCB (Filipinas) | 939 | 874 | 727 |
| P9086 | BAMID (Turquia) | 737 | 692 | 561 |
| P7327 | OFLC (Nova Zelândia) | 421 | 358 | 303 |
| P8874 | Hong Kong | 386 | 368 | 316 |
| P5152 | KAVI (Finlândia) | 283 | 278 | 254 |
| P6452 | CBFC (Índia) | 150 | 122 | 82 |
| P10994 | KFCB (Quênia) | 24 | 23 | 22 |
| P11611 | Noruega | 7 | 7 | 7 |

A ClassInd dá 4.846 aqui e 4.860 na pesquisa do catálogo. Não investiguei a diferença de 14.

Cobertura somada:

| Conjunto | Filmes | 100+ votos | 1.000+ votos |
|---|---|---|---|
| Só ClassInd | 4.846 | 4.720 (3,6%) | 4.178 (8,6%) |
| ClassInd + MPA | 9.258 | 9.096 (7,0%) | 8.214 (17,0%) |
| ClassInd + MPA + FSK + BBFC | 23.805 | 21.991 (16,9%) | 17.871 (36,9%) |
| ClassInd + MPA + FSK + BBFC + Kijkwijzer + Medierådet (os que recomendo) | 34.905 | 30.112 (23,1%) | 22.850 (47,2%) |
| Qualquer uma das 31 | 62.057 (17,3%) | 48.274 (37,1%) | 30.136 (62,2%) |

Percentuais sobre os filmes do Wikidata em cada recorte. A cauda de 31 propriedades rende pouco além dos seis sistemas grandes: a maioria dos filmes cobertos tem uma propriedade só (39.354 de 62.057).

## Conferindo a conversão contra a ClassInd

Converti oito sistemas para a escala da ClassInd e comparei com a própria ClassInd nos filmes que têm as duas. É a forma mais barata de ver se a tabela de conversão funciona com dados brasileiros. Uma faixa de distância é, por exemplo, 12 contra 14.

| Sistema | Filmes com ClassInd também | Mesma faixa | Até 1 faixa de diferença | Mais brando por 2+ faixas |
|---|---|---|---|---|
| MPA | 1.942 | 41% | 91% | 1% |
| BBFC | 1.602 | 45% | 90% | 3% |
| FSK | 2.236 | 36% | 83% | 12% |
| Kijkwijzer | 2.801 | 36% | 83% | 15% |
| Medierådet | 1.587 | 33% | 78% | 18% |
| EIRIN | 1.498 | 16% | 41% | 59% |
| CNC (França) | 2.657 | 6% | 20% | 80% |

"Mais brando por 2+ faixas" é o erro que importa para o veto: um filme 14 que a conversão deixa passar como L ou 10. MPA e BBFC quase não erram assim. FSK, Kijkwijzer e Medierådet erram mais, porque a Europa tende a dar 12 para o que a ClassInd dá 14. CNC e EIRIN dão "livre" para quase tudo e por isso não servem para dizer que um filme é seguro.

Para filmes sem ClassInd, testei duas formas de juntar MPA, BBFC, FSK, Kijkwijzer e Medierådet (3.557 filmes com ClassInd para conferir):

| Regra | Mesma faixa | Até 1 faixa de diferença | Mais brando por 2+ faixas |
|---|---|---|---|
| Faixa mais alta | 36% | 84% | 6% |
| Mediana | 41% | 87% | 9% |

A mediana acerta um pouco mais, mas deixa passar mais filmes pesados. Num veto, prefiro errar para o lado rígido, então fico com a faixa mais alta.

Dois ajustes saíram dessa conferência. O R da MPA, convertido pela regra geral (menor de 17 só com responsável, logo 18), bate com a ClassInd em 25% dos casos. Tratado como 16, bate em 41%: no Brasil, os filmes R são 14 ou 16 na maioria (376 e 451 de 1.046). E o PG-13 fica em 14 porque o arredondamento manda, embora a ClassInd dê 12 um pouco mais vezes (316 contra 263). É o lado seguro.

## Tabela de conversão

Escala de destino: L, 10, 12, 14, 16, 18. A regra geral é pegar a idade mínima para ver sem acompanhante e arredondar para cima, até a próxima faixa da ClassInd. Assim a conversão nunca deixa uma criança mais nova passar.

A ClassInd ganhou em 2025 a faixa "não recomendado para menores de 6 anos" ([Guia Prático, 5ª edição](https://www.gov.br/mj/pt-br/assuntos/seus-direitos/classificacao-1/classind-audio-visual-2025-vs-10-nova-faixa.pdf), índice, A.2). O Wikidata ainda não tem esse valor em P3216. Deixei o 6 fora da escala para seguir o ticket. Se o perfil da criança guardar a idade exata, dá para acrescentar depois sem mexer no resto: FSK 6, Kijkwijzer 6 e Medierådet 7 cairiam nele.

| Sistema | Fonte oficial | L | 10 | 12 | 14 | 16 | 18 |
|---|---|---|---|---|---|---|---|
| ClassInd (P3216) | [Guia Prático 2025](https://www.gov.br/mj/pt-br/assuntos/seus-direitos/classificacao-1/classind-audio-visual-2025-vs-10-nova-faixa.pdf) | L | 10 | 12 | 14 | 16 | 18 |
| MPA (P1657) | [motionpictures.org/film-ratings](https://www.motionpictures.org/film-ratings/) | G | PG, M, GP | | PG-13 | R | NC-17, X |
| BBFC (P2629) | [bbfc.co.uk/our-age-ratings](https://www.bbfc.co.uk/our-age-ratings) | U | PG | 12, 12A | | 15 | 18, X |
| FSK (P1981) | [fsk.de/altersstufen](https://www.fsk.de/altersstufen/) | FSK 0 | FSK 6 | FSK 12 | | FSK 16 | FSK 18 |
| Kijkwijzer (P2684) | [NICAM, via Better Internet for Kids](https://better-internet-for-kids.europa.eu/en/rules-guidelines/viewing-guide-dutch-audiovisual-classification-system) | AL | 6, 9 | 12 | 14 | 16 | 18 |
| Medierådet (P5970) | [medieraadet.dk, aldersmærker](https://medieraadet.dk/film/medieraadets-aldersmaerker) | A (tilladt for alle) | 7 | 11, 12 | | 15, 16 | |
| EIRIN (P2756) | [eirin.jp/english/008.html](https://www.eirin.jp/english/008.html) | (G: ignorar) | | PG12 | | R15+ | R18+ |
| CNC França (P2758) | [cnc.fr, visas et classification](https://www.cnc.fr/professionnels/visas-et-classification) | (tous publics: ignorar) | | -12 | | -16 | -18, X |

Notas por sistema, com o que a fonte oficial diz:

- **MPA.** PG-13: "Some material may be inappropriate for pre-teenagers". R: "Contains some adult material". NC-17: "Clearly adult. Children are not admitted." O site da MPA não dá idade para PG; pus em 10 porque PG pede orientação dos pais e a ClassInd dá L, 10 ou 12 a esses filmes quase na mesma proporção.
- **BBFC.** 12A e 12 usam o mesmo critério, e o 12A só deixa menor de 12 entrar acompanhado. 15: "No one younger than 15 may see content with a 15 age rating in a cinema", que arredonda para 16.
- **FSK.** A FSK 12 admite crianças a partir de 6 anos no cinema com os pais ("Parental Guidance: FSK 12 Filme im Kino für Kinder ab 6 Jahren"). Ignorei essa exceção: o veto olha a idade sem acompanhante.
- **Kijkwijzer.** As faixas 14 e 18 existem só desde 2020. Antes disso, filmes pesados levavam 16, então um 16 antigo pode valer 18. A página oficial do NICAM recusou acesso automatizado (HTTP 403); usei a página da Comissão Europeia que cita o NICAM.
- **Medierådet.** É o sistema dinamarquês. A página oficial lista quatro marcas: "Tilladt for alle", "Frarådes børn under 7 år", "Tilladt for børn fra 11 år" e "Tilladt for børn fra 15 år". O Wikidata também tem valores "12" e "16" (1.737 filmes), que a página atual não menciona. Entram arredondados, mas não sei de quando são.
- **EIRIN.** G é "suitable for all ages". Mesmo assim, o EIRIN sai mais brando que a ClassInd em 80% dos filmes que têm os dois, quase sempre por causa do G. Trate G como ausência de dado.
- **CNC França.** O CNC sai mais brando que a ClassInd em 93% dos filmes que têm os dois. O motivo é o "tous publics" (com ou sem "avertissement"), que vai para filmes que no Brasil são 14 ou 16. Só os níveis de interdição (-12, -16, -18, X) entram.

Os outros 23 sistemas não entram na v1. Eles somam cobertura (de 34.905 para 62.057 filmes), mas cada um pede uma linha na tabela e uma fonte oficial, e não conferi nenhum contra a ClassInd. Quando valer a pena, a mesma regra se aplica: idade do rótulo arredondada para cima, com "livre" ignorado até a conferência mostrar que ele presta.

## OMDb

A [página da API](https://www.omdbapi.com/) não documenta o campo `Rated`: não diz de onde ele vem nem de que país é. O exemplo de resposta está vazio. A chave grátis dá 1.000 requisições por dia ([apikey.aspx](https://www.omdbapi.com/apikey.aspx)). Os [termos](https://www.omdbapi.com/legal.htm) limitam o uso a "personal, non-commercial purposes" (§4.1) e proíbem montar índice do conteúdo sem autorização escrita (§4.2.4).

Não medi a cobertura do `Rated`, porque não tenho chave. Pelo nome dos valores que o OMDb costuma devolver (PG-13, R), é a classificação americana, o mesmo sistema do P1657. Isso é palpite, não está na documentação. Se for isso, o OMDb serve como fonte extra de MPA para filmes sem P1657, consultado só para os candidatos de cada sessão.

## Does the Dog Die

Não tem classificação etária. A [API v3](https://api.doesthedogdie.com/api/3.0) devolve, por filme, votos sim e não em tópicos de conteúdo ("a dog dies", "there are jump scares") e um nível de gravidade por tópico ("Implied", "Depicted", "Excessive"). A busca aceita `?imdb=` e `?tmdb=`. Servem de motivo extra para vetar ("tem cena de abuso, 40 votos sim"), não de faixa etária.

Limites e termos ([API Terms of Service](https://api.doesthedogdie.com/api/terms)):

- Plano grátis: 30 requisições por minuto, 5.000 por mês, só uso não comercial (§9.1).
- Cache local permitido só para desempenho, renovado a cada 30 dias.
- Proibido "systematically download, harvest, index, or extract the Data or any substantial portion of it". Logo, só sob demanda, nunca no catálogo.
- Proibido usar a API para "develop, improve, or refine any machine learning model, neural network, classifier, automated detection system, or other algorithmic system". Usar o dado como entrada de um filtro não é desenvolver um classificador, mas a frase é larga. Fica registrado como risco.
- Atribuição obrigatória em toda tela que mostra o dado, com a frase exata "Powered by DoesTheDogDie.com". Na resposta do Claude, entra na linha de evidência.

## Outras fontes da lista v1

- **Trakt.** O resumo do filme traz `certification`, e a documentação avisa: "Only `us` certifications are currently returned." O endpoint `/movies/{id}/releases/{country}` dá a classificação de cada país, mas a própria documentação diz que esse dado vem do TMDB ([Trakt API](https://trakt.docs.apiary.io/), seção Releases). Ele herda o problema de licença do TMDB apontado na pesquisa do catálogo. Limite: 1.000 chamadas a cada 5 minutos.
- **IMDb.** Os datasets não trazem classificação etária. O `title.basics` só tem `isAdult`, que já serve para vetar pornografia sem custo.
- **TMDB.** Tem classificação por país em `release_dates`, mas os termos vetam o uso do projeto (ver pesquisa do catálogo).

## Quando não há dado

Sem classificação, o filme não passa no veto de criança. Num veto rígido, "não sei" não pode virar "pode". Na prática, com criança na sessão, os candidatos ficam restritos aos 30 mil filmes de 100+ votos que têm alguma classificação. É pouco perto de 130 mil, mas sobra filme para um top 5.

Ordem de resolução para cada filme:

1. `isAdult = 1` no IMDb: vetado.
2. ClassInd (P3216): usa direto. Evidência de força forte, tipo metadado.
3. Senão, a faixa mais alta entre MPA, BBFC, FSK, Kijkwijzer e Medierådet convertidas, e mais CNC e EIRIN se forem restritivos. Força moderada, e a linha diz o sistema de origem ("FSK 12 convertido para 12").
4. Senão, OMDb `Rated` sob demanda, se estiver no padrão MPA. Força moderada.
5. Senão, sem classificação: fora dos candidatos quando há criança. O LLM pode citar o filme como "sem classificação conhecida" se o usuário pedir por ele pelo nome, mas nunca o recomenda por conta própria.

O Does the Dog Die entra depois, como veto extra sobre os candidatos que passaram, não como faixa.

## Lacunas

- Cobertura do `Rated` do OMDb não medida (falta chave) e significado do campo não documentado.
- Os 23 sistemas menores não têm conversão conferida nem fonte oficial lida.
- A página oficial do NICAM (Kijkwijzer) e a página de aprovação do CNC francês não abriram para leitura automatizada; usei a Comissão Europeia e a lista de menções do próprio CNC.
- A conferência contra a ClassInd usa a ClassInd do Wikidata como verdade. Ela pode estar desatualizada ou ser de uma reclassificação para TV.
- Não verifiquei de quando é o índice do QLever.
