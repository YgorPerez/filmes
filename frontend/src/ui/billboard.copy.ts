// The Cartaz's words, for the app and for the MCP Apps view (#111).

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** "a", "a e b", "a, b e c". */
const andList = (items: readonly string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`

export const BILLBOARD = {
  label: 'Cartaz',
  dropped: 'Saiu da prateleira:',
  empty:
    'Nenhum filme passou nas Restrições. Abra outra Sessão com menos limites.',
  strength: { strong: 'forte', moderate: 'moderada', weak: 'fraca' },
  strengthLabel: (name: string) => `Força ${name}`,

  card: {
    poster: (title: string) => `Capa de ${title}`,
    isNew: 'novo',
    bet: 'aposta',
    betHint:
      'Aposta: pouca Evidência, mas quem tem gosto parecido deu nota alta',
    imdb: (rating: string | null, votes: string) =>
      `${rating === null ? '' : `${rating} `}IMDb · ${votes} votos`,
    /** The hint of a Presente's dot: "Ana: 8,3 de 10 · 12 vizinhos". */
    predicted: (name: string, rating: string, raters: number) =>
      `${name}: ${rating} de 10 · ${plural(raters, 'vizinho', 'vizinhos')}`,
    /** Who an Evidência is about, opening its line: "Ana e Bruno". */
    whose: (names: readonly string[]) => andList(names),
    why: 'Por que cada um vai gostar',
    withoutFact: (names: string) => `${names}: sem fato sobre este filme`,
    swapStamp: 'Trocar',
    seenStamp: 'Já vi',
  },

  section: {
    again: 'de novo',
  },

  marks: {
    seen: 'Já vi',
    seenGroup: (n: number) => `Já vi o filme ${n}`,
    all: 'Todos',
    ratingLabel: (who: string, n: number) =>
      `nota de ${who} para o filme ${n}, de 1 a 10`,
    note: (name: string | null) =>
      name === null ? 'Sua nota' : `Nota de ${name}`,
    thought: 'o que achou',
    thoughtLabel: (who: string, n: number) =>
      `o que ${who} achou do filme ${n}`,
    swap: 'Trocar',
    stars: 'quanto animou',
    star: (value: number) => `${value} de 5`,
    comment: 'comentário',
    openComment: 'Comentar',
    commentLabel: (n: number) => `comentário sobre o filme ${n}`,
  },

  reply: {
    title: 'Responder',
    bar: 'O que você marcou',
    addition: 'Acrescentar',
    additionHint: 'contexto da noite ou gosto: “chegou a Ana”, “só 1h30”',
    moods: 'Clima',
    moodsHint: 'outro Clima refaz a lista inteira',
    send: 'Enviar',
    copy: 'Copiar pro chat',
    output: 'texto pra colar no chat',
    nothing: 'Nada marcado ainda.',
    copied: 'Copiado. Cole no chat.',
    select:
      'Não deu pra copiar sozinho: o texto está selecionado na caixa, copie e cole no chat.',
    kept: 'O que você marcar fica guardado neste navegador, mesmo trocando de aba.',
    noScript:
      'Sem JavaScript as marcações não saem daqui: responda no chat ou ative o JavaScript.',
    /** What was marked, in a sentence: "1 Trocar, 1 Já vi e estrelas em
     * 2 filmes". Empty with nothing marked. */
    summary: (counts: {
      swap: number
      seen: number
      stars: number
      comments: number
      addition: boolean
      mood: boolean
    }) =>
      andList(
        [
          counts.swap > 0 && `${counts.swap} Trocar`,
          counts.seen > 0 && `${counts.seen} Já vi`,
          counts.stars > 0 &&
            `estrelas em ${plural(counts.stars, 'filme', 'filmes')}`,
          counts.comments > 0 &&
            plural(counts.comments, 'comentário', 'comentários'),
          counts.addition && 'o acrescentar',
          counts.mood && 'outro Clima',
        ].filter((item): item is string => typeof item === 'string'),
      ),
  },

  // The MCP Apps view (`mcp-view/`): Enviar goes to `answer_billboard`
  // through the host, and Claude gets a message when it has to regenerate.
  view: {
    loading: 'Montando o Cartaz…',
    list: 'Os filmes do Cartaz',
    mark: 'Marcar',
    open: 'Ver o Cartaz',
    sending: 'Enviando…',
    recorded: 'Anotado.',
    regenerating: 'Anotado. O Claude refaz a lista no chat.',
    toClaude: 'Anotado. O Claude lê o que você escreveu no chat.',
    notNotified:
      'Anotado, mas o aviso pro Claude não saiu: peça no chat pra ele refazer a lista.',
    failed: (message: string) =>
      `Não deu pra enviar: ${message} Use Copiar pro chat.`,
    unavailable: 'Este app não envia daqui. Use Copiar pro chat.',
  },
} as const
