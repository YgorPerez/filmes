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
    bet: 'aposta',
    betHint:
      'Aposta: pouca Evidência, mas quem tem gosto parecido deu nota alta',
    imdb: (rating: string | null, votes: string) =>
      rating === null
        ? `IMDb: sem nota · ${votes} votos`
        : `${rating} IMDb · ${votes} votos`,
    /** The link to the film's trailer on YouTube (#289). */
    trailer: 'trailer',
    /** The Nota prevista line under "Por que" (#326): "previsto · Ana 8,3
     * · Iara 7,1". */
    predicted: 'previsto',
    /** The hint of a name in it, when the version kept how many taste
     * neighbours back it. */
    predictedHint: (raters: number) =>
      `pela nota de ${plural(raters, 'pessoa', 'pessoas')} de gosto parecido`,
    predictedLabel: (name: string, hint: string) => `${name}: ${hint}`,
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
    /** The Já vi note's field: "o que Iara achou (opcional)". */
    thought: (who: string) => `o que ${who} achou (opcional)`,
    thoughtLabel: (who: string, n: number) =>
      `o que ${who} achou do filme ${n}`,
    swap: 'Trocar',
    /** Why the Trocar came on by itself (#326): "Trocar marcado: você já
     * viu", "Trocar marcado: 2 estrelas". */
    swapWhy: {
      seen: (who: readonly string[]) =>
        `Trocar marcado: ${andList(who)} ${who.length === 1 ? 'já viu' : 'já viram'}`,
      stars: (n: number) =>
        `Trocar marcado: ${plural(n, 'estrela', 'estrelas')}`,
    },
    stars: 'quanto animou',
    /** More than this many Presentes: their Já vi options open from one
     * "Já vi…" (#277). */
    seenFolded: 4,
    seenMore: 'Já vi…',
    star: (value: number) => `${value} de 5`,
    comment: 'comentário',
    openComment: 'Comentar',
    commentLabel: (n: number) => `comentário sobre o filme ${n}`,
  },

  reply: {
    title: 'Responder',
    /** What was marked, by name, one line per kind, for the inline card
     * (#277): "Trocar: Cais 2", "Já vi: Fronteira (Iara)". */
    marked: (m: {
      swap: readonly string[]
      seen: readonly { title: string; people: readonly string[] }[]
      stars: readonly { title: string; stars: number }[]
      comments: readonly string[]
      addition: string
      moods: readonly string[] | null
    }) =>
      [
        m.swap.length > 0 && `Trocar: ${andList(m.swap)}`,
        m.seen.length > 0 &&
          `Já vi: ${m.seen.map((s) => `${s.title} (${andList(s.people)})`).join(', ')}`,
        m.stars.length > 0 &&
          `Estrelas: ${m.stars.map((s) => `${s.title} ${s.stars}★`).join(', ')}`,
        m.comments.length > 0 && `Comentário: ${andList(m.comments)}`,
        m.addition !== '' && `Acrescentar: “${m.addition}”`,
        m.moods !== null &&
          `Clima: ${m.moods.length > 0 ? m.moods.join(', ') : 'nenhum'}`,
      ].filter((item): item is string => typeof item === 'string'),
    bar: 'O que você marcou',
    addition: 'Acrescentar',
    additionHint: 'contexto da noite ou gosto: “chegou a Ana”, “só 1h30”',
    moods: 'Clima',
    moodsHint: 'outro Clima refaz a lista inteira',
    /** The fold the Clima chips sit in (#277). */
    moodsOpen: 'Mudar o clima (refaz a lista)',
    /** The Climas chosen, in bold in the bar: "Clima: leve, pra rir". */
    moodsChosen: (moods: readonly string[]) =>
      `Clima: ${moods.length > 0 ? moods.join(', ') : 'nenhum'}`,
    send: 'Enviar',
    /** Enviar once this very reply went: nothing new to send (#277). */
    sent: 'Enviado ✓',
    retry: 'Tentar de novo',
    clear: 'Limpar',
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
    /** The view's one h1, for a screen reader: "Cartaz: Vocês dois". */
    heading: (who: string) => `Cartaz: ${who}`,
    list: 'Os filmes do Cartaz',
    mark: 'Marcar',
    open: 'Ver o Cartaz',
    markAgain: 'Marcar de novo',
    sentTitle: 'Enviado',
    /** "v2" beside the label, from the second version on. */
    version: (n: number) => `v${n}`,
    /** What a regenerate changed, on the inline card: "Saiu: Cais 2
     * (trocado) · entrou: Fronteira". */
    changes: (
      dropped: readonly { title: string; reason: string }[],
      entered: readonly string[],
    ) =>
      [
        dropped.length > 0 &&
          `Saiu: ${dropped.map((d) => `${d.title} (${d.reason})`).join(', ')}`,
        entered.length > 0 && `entrou: ${andList(entered)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    /** No film passed: the request's limits, and what to say to Claude. */
    empty: (limits: readonly string[]) =>
      `Nenhum filme passou ${limits.length > 0 ? `nos limites deste pedido (${limits.join(' · ')})` : 'nas Restrições deste pedido'}. Peça no chat com mais tempo ou menos limites.`,
    /** A host without fullscreen shows the Cartaz inline: it opens whole
     * from here (#277). */
    seeAll: 'Ver o Cartaz inteiro',
    sending: 'Enviando…',
    recorded: 'Anotado.',
    /** Enviar's tool call went and the engine refused it. */
    failed: (code: string | null) =>
      code === 'closed_session'
        ? 'Essa Sessão já foi fechada: não dá pra mandar marcações. Peça uma nova no chat.'
        : code === 'unknown_session'
          ? 'Não achei essa Sessão. Peça a lista de novo no chat.'
          : 'Não consegui enviar. Tente de novo ou copie pro chat.',
    /** The host cannot call the tool from here. */
    unavailable: 'Não dá pra enviar por aqui. Toque em Copiar e cole no chat.',
    /** The `billboard` result was an error: never the engine's own words,
     * which may carry the server's paths. */
    error: (code: string | null) =>
      code === 'unknown_session'
        ? 'Não achei essa Sessão. Peça a lista de novo no chat.'
        : 'Não consegui montar o Cartaz. Peça a lista de novo no chat.',
  },
} as const
