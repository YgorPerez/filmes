import { recommendSession } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, imdbId, sessionId } from '../tool.ts'

/** The Climas of `config/moods.toml`; a test keeps them equal. */
export const MOODS = [
  'leve',
  'pra rir',
  'tenso',
  'romântico',
  'pra chorar',
  'pra pensar',
  'assustador',
  'ação',
  'sombrio',
]

const person = z
  .string()
  .regex(/^[^-\s]/, "nome de Pessoa não pode começar com '-' nem espaço")

export default defineTool({
  name: 'recommend',
  description:
    'Recomendação para uma Sessão: devolve o top 5 na ordem da Regra de escolha e abre uma Sessão (`session.id`). ' +
    'Antes, chame `open_sessions` e, se houver uma, pergunte por ela; o Dono pode pular. ' +
    'Cada filme em `films` traz `utility` (por Presente, 0 a 1, ou null quando não há Fato) e `evidence` agrupada por Presente ' +
    '(person, text, source, date, strength, kind, factId, contribution); quem não tem Fato sobre o filme recebe a linha "sem fato". ' +
    'Fora das Evidências, cada filme traz `imdbUrl`, `genres` (do IMDb, em português), `poster` (pôster do TMDB em w185), ' +
    '`titlePt` e `synopsis` (do TMDB em pt-BR; null sem chave do TMDB ou sem o dado), `imdbRating`, `imdbVotes`, `year`, `runtimeMinutes` ' +
    'e `coverage` ({withFact, attendees, withoutFact: slugs}). `onlyGuesses` marca filme sem Fato nenhum, que só entra no fim quando faltam Candidatos com Fato. ' +
    '`vetoes` lista os Vetos dos Presentes que tiraram filmes, com `filmsRemoved` e `byPath` ({direct, subgenres, imdbGenre, tags}): ' +
    'um Veto a gênero tira também os subgêneros do Wikidata e o gênero do IMDb; um Veto a grupo de tags, como comédia boba, conta em `tags`. ' +
    'Presentes por slug, nome ou apelido; "dono" é o Dono. ' +
    'Restrições opcionais (duração, ano de lançamento, idioma, criança, gatilhos, sem Já visto, nada triste, nada lento, parecido) tiram filmes antes da ordenação; ' +
    '`constraints` diz o que cada uma tirou. Cada filme que passa traz em `filmLines` as linhas das Restrições, do Clima, de grupo ou sozinho, ' +
    'da nota do IMDb acima de 7 e do Crédito, quando o Crédito fez o filme subir. Clima, grupo ou sozinho e a nota do IMDb puxam a ordem. ' +
    '`credit` traz o Crédito de cada Presente na Regra padrão em grupo. ' +
    'Com `similar`, só passam os parecidos com as referências, e cada filme traz a linha "parecido com X: ...", que não é Fato. ' +
    'Com `session`, refaz a Recomendação nessa Sessão aberta em vez de abrir outra, e `session.version` conta as versões. ' +
    'O que a Sessão já mostrou pode voltar; só sai, sozinho, o que o Dono trocou em alguma versão dela e o que algum Presente marcou Já vi nela, ' +
    'em `constraints.out_of_session` ({swapped, seen, removed}). O parecido fica na Sessão: o refazer sem `similar` continua com as referências da versão anterior; ' +
    '`similar` com outras referências substitui e `noSimilar` tira o filtro. Parecido novo troca a lista inteira: ignora `keep`, com aviso. ' +
    'Com `swap`, os filmes dados viram Trocados da Sessão antes de refazer ("outras opções" no chat: passe os da tela); sem `swap` nem `keep`, o refazer devolve a mesma lista. ' +
    'Com `keep`, os mantidos ficam no número da versão anterior e só as vagas ganham filme novo; cada filme traz `new` ' +
    '(false no que já estava na tela anterior), e a resposta traz `kept` e `dropped` ({position, id, title, cause}: `seen` com `people`, ' +
    '`swapped`, `constraint` com `constraint` e `label`, `veto` com `person` e `text`, `min_rating` com `label`, ou `mood`). ' +
    'O Clima puxa a ordem e nunca tira filme. Com `session`, Climas diferentes dos da versão anterior (por nome, em qualquer ordem) trocam a lista inteira: ' +
    'ignoram `keep`, com aviso, e quem sai sem ser Já vi nem Trocado sai com `cause: mood` e pode voltar. Num refazer, repita os Climas da versão anterior. ' +
    'Uma Restrição ou um Veto do pedido tiram também o mantido que os viola, e o mantido abaixo da nota ou dos votos mínimos do IMDb sai, com aviso; gosto novo não tira mantido. ' +
    'A resposta inclui `moods` (os Climas aceitos), `warnings` e `attributions`. Copie o texto do Does the Dog Die como veio.',
  input: z.object({
    attendees: z
      .array(person)
      .min(1)
      .describe('Presentes da Sessão, ex.: ["dono", "ana"]'),
    rule: z
      .enum(['default', 'average', 'by'])
      .optional()
      .describe(
        'Regra de escolha: default (menor utilidade entre os Presentes, desempate pela média; é o padrão), ' +
          'average (média simples, "tanto faz") ou by (só o gosto de uma Pessoa, "hoje é a vez da Ana")',
      ),
    by: person
      .optional()
      .describe(
        'na Regra "by", a Pessoa cujo gosto ordena; precisa estar entre os Presentes',
      ),
    moods: z
      .array(z.string())
      .optional()
      .describe(
        `Climas do pedido, do vocabulário fixo: ${MOODS.join(', ')}. ` +
          'Traduza o pedido livre para esses nomes, um ou mais: "algo leve" é leve; "leve e engraçado" é leve e pra rir; ' +
          '"pra dar risada" é pra rir; "de roer as unhas" é tenso; "pesado, escuro" é sombrio. ' +
          '"Tipo X, só que mais sombrio" é X em `similar` com sombrio aqui. Fora da lista, o motor devolve um aviso',
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('tamanho da lista; padrão 5'),
    request: z
      .string()
      .optional()
      .describe('o pedido do Dono como ele disse, guardado na Sessão'),
    session: sessionId(
      'ID da Sessão aberta a refazer quando o pedido muda antes de verem algo (outro tempo, Restrição, ' +
        'Presente ou Já visto); a versão anterior fica no histórico. Sem ele, abre uma Sessão nova',
    ).optional(),
    keep: z
      .array(imdbId)
      .optional()
      .describe(
        'com session: os filmes da versão anterior que ficam (o que o Dono não mandou trocar nem já viu). ' +
          'Ficam no mesmo número; só as vagas ganham filme novo',
      ),
    swap: z
      .array(imdbId)
      .optional()
      .describe(
        'com session: filmes que o Dono trocou, gravados como Trocados da Sessão antes de refazer; não voltam mais nela. ' +
          '"Nenhum desses, quero outros" no chat: passe todos os da tela',
      ),
    maxDuration: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('tempo disponível, em minutos'),
    since: z
      .number()
      .int()
      .optional()
      .describe(
        'ano de lançamento mínimo, inclusive: "de 1990 em diante" é 1990',
      ),
    until: z
      .number()
      .int()
      .optional()
      .describe(
        'ano de lançamento máximo, inclusive: "até 2005" é 2005; "anos 90" é since 1990 e until 1999',
      ),
    language: z
      .string()
      .min(1)
      .optional()
      .describe(
        'idioma original exigido, só quando pedido: "pt", "português" ou o QID',
      ),
    child: z
      .boolean()
      .optional()
      .describe('"tem criança" sem idade: vale livre (L)'),
    childAge: z
      .number()
      .int()
      .min(0)
      .max(17)
      .optional()
      .describe('idade da criança mais nova'),
    triggers: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe(
        'temas do Does the Dog Die a evitar, em inglês como o site escreve, ex.: ["a dog dies"]',
      ),
    unseen: z
      .boolean()
      .optional()
      .describe('tira os filmes que algum Presente já viu'),
    noSad: z
      .boolean()
      .optional()
      .describe(
        '"nada triste": tira filme com tag de tristeza ou de tema pesado no MovieLens e filme de tema pesado no Wikidata',
      ),
    noSlow: z
      .boolean()
      .optional()
      .describe(
        '"nada lento": tira filme com tag de ritmo lento no MovieLens (slow, slow paced, meditative, contemplative, boring)',
      ),
    similar: z
      .array(imdbId)
      .min(1)
      .optional()
      .describe(
        '"algo igual X" ou "entre X e Y": os filmes de referência (tt... do IMDb). Só passam os 50 ' +
          'mais parecidos com eles (média entre as referências), e a Regra de escolha ordena entre esses. Faltando ' +
          'parecidos, a lista sai menor, com aviso. O pedido é da noite: não grava gosto. Com session, fica nos ' +
          'refazeres seguintes sem repetir; referências novas trocam a lista inteira',
      ),
    noSimilar: z
      .boolean()
      .optional()
      .describe(
        'com session: tira o filtro de parecido que a Sessão trazia (o Dono pediu outra coisa)',
      ),
  }),
  run: ({ child, childAge, request, ...rest }) =>
    recommendSession({
      ...rest,
      request: request ?? null,
      ...(childAge !== undefined
        ? { child: childAge }
        : child
          ? { child: 0 }
          : {}),
    }),
})
