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
  /** The one line a redone Cartaz opens with: "Refeito: 2 saíram, 2
   * novos.", and the button that shows why each one left. */
  redone: (left: number, arrived: number) =>
    `Refeito: ${
      [
        left > 0 && plural(left, 'saiu', 'saíram'),
        arrived > 0 && plural(arrived, 'novo', 'novos'),
      ]
        .filter(Boolean)
        .join(', ') || 'mesma lista'
    }.`,
  redoneWhy: 'por quê',
  /** The Força key, behind its "?" (#272). */
  legend: 'O que querem dizer os pontos',
  legendLead: 'Os pontos antes de cada motivo dizem a Força da Evidência.',
  /** The Evidência every film of a section shares, said once under its
   * title (#272). */
  shared: 'Vale para todos desta seção',
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
      rating === null
        ? `IMDb: sem nota · ${votes} votos`
        : `${rating} IMDb · ${votes} votos`,
    /** The link to the film's trailer on YouTube (#289). */
    trailer: 'trailer',
    /** The hint of a Presente's dot: "Ana: 8,3 de 10 · 12 vizinhos", or
     * "Ana: 8,3 de 10" when the version did not keep how many. */
    predicted: (name: string, rating: string, raters?: number) =>
      raters === undefined
        ? `${name}: ${rating} de 10`
        : `${name}: ${rating} de 10 · ${plural(raters, 'vizinho', 'vizinhos')}`,
    /** Who an Evidência is about, opening its line: "Ana e Bruno". */
    whose: (names: readonly string[]) => andList(names),
    why: 'Por que cada um vai gostar',
    /** Every line of the card is the section's, said under its title. */
    sectionWhy: 'Os motivos da seção, logo acima.',
    withoutFact: (names: string) => `${names}: sem fato sobre este filme`,
    /** What the Dono gave it in this Session (#272). */
    notes: 'Você marcou',
    notesStars: (n: number) => `${n} de 5 estrelas`,
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
    /** The bar's left side before any mark. */
    hint: 'Marque Já vi, Trocar ou estrelas',
    /** The acrescentar's words the reading did not take (#272): the
     * Cartaz is not redone until the Dono decides. */
    unread: (words: readonly string[]) =>
      `Não entendi ${words.map((w) => `“${w}”`).join(', ')}. Enviar assim deixa isso só como anotação.`,
    sendAnyway: 'Enviar assim',
    edit: 'Corrigir',
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
  // through the host, then asks the chat to follow up.
  view: {
    loading: 'Montando o Cartaz…',
    list: 'Os filmes do Cartaz',
    mark: 'Marcar',
    open: 'Ver o Cartaz',
    sending: 'Enviando…',
    recorded: 'Anotado.',
    failed: (message: string) =>
      `Não deu pra enviar: ${message} Use Copiar pro chat.`,
    unavailable: 'Este app não envia daqui. Use Copiar pro chat.',
  },
} as const
