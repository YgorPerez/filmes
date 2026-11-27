import type { GuideStep } from './setup-steps'

const WEEKDAYS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
]
const MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

const DAY_MS = 86_400_000

/** The UTC midnight of "2026-11-21"; null when it is not a date. */
const utc = (iso: string) => {
  const [year, month, date] = iso.split('-').map(Number)
  if (!year || !month || !date) return null
  const when = Date.UTC(year, month - 1, date)
  return Number.isNaN(when) ? null : when
}

/** The Sessão's day from today: "Hoje", "Ontem", the weekday alone within
 * the week ("Sexta"), then "Sexta, 21 nov". Without today, the last; the
 * date itself when it is not one. */
const day = (iso: string, today: string | null) => {
  const when = utc(iso)
  if (when === null) return iso
  const now = today === null ? null : utc(today)
  const ago = now === null ? null : Math.round((now - when) / DAY_MS)
  const date = new Date(when)
  const weekday = WEEKDAYS[date.getUTCDay()] ?? ''
  if (ago === 0) return 'Hoje'
  if (ago === 1) return 'Ontem'
  if (ago !== null && ago > 1 && ago < 7) return weekday
  return `${weekday}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** "Você e Teo", "Você, Teo e Ana". */
const together = (names: readonly string[]) =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`

export const HOME = {
  request: 'Pedir filme',
  ask: {
    title: 'O que vai ser hoje?',
    blanks: ['Quem está', 'Quanto tempo', 'O que a noite pede'],
    blanksLabel:
      'O pedido: quem está, quanto tempo vocês têm e o que a noite pede.',
    lead: 'Saem 5 filmes, cada um com o motivo de cada um que está na sala gostar.',
  },
  guide: {
    title: 'Para começar',
    payoff:
      'Dá para pedir filme já. Sem notas, a lista sai só com palpites; com 10, cada filme vem com o seu motivo.',
    state: { done: 'feito', skipped: 'pulado', pending: 'falta fazer' },
    doneRatings: (n: number) =>
      n === 1 ? 'feito, 1 nota' : `feito, ${n} notas`,
    skip: 'Pular',
    skipping: 'Pulando…',
    skipLabel: (name: string) => `Pular: ${name}`,
    resume: 'Retomar',
    close: 'Fechar',
    quick: 'Leva uns 2 minutos.',
    counter: (n: number) => `${Math.min(n, 10)} de 10`,
    counterLabel: (n: number) => `${Math.min(n, 10)} de 10 Notas`,
    copied: 'Copiado',
    pasteIt: 'Copiado. Agora cole no Claude, em Conectores.',
    copyAddress: 'Copiar endereço',
    copyFailed: 'Não deu para copiar. Selecione o endereço e copie.',
    howToConnect: 'Ver como conectar',
    steps: {
      taste: {
        name: 'Meu gosto',
        title: 'Meu gosto: dê 10 notas ou importe',
        text: 'Dê nota a filmes que você já viu, ou traga as suas notas do Letterboxd, do Trakt, do IMDb ou do Simkl.',
        rate: 'Dar notas',
        import: 'Importar',
      },
      connector: {
        name: 'Conector no Claude',
        title: 'Conector no Claude',
        text: 'Para pedir filme conversando com o Claude, também no celular.',
      },
    } satisfies Record<
      GuideStep['step'],
      { name: string; title: string; text: string; [action: string]: string }
    >,
    how: [
      'Abra o claude.ai no navegador (ou o app do computador) e vá em Configurações, Conectores.',
      'Toque em Adicionar conector personalizado e cole o endereço.',
      'Entre com a sua conta Google. Depois disso o conector aparece também no app do Claude no celular.',
    ],
    auto: 'Este passo se marca sozinho quando o Claude entrar com o seu e-mail.',
  },
  latest: {
    title: 'Última Sessão',
    when: (date: string, today: string | null, names: readonly string[]) =>
      `${day(date, today)} · ${together(names)}`,
    you: 'Você',
    films: 'Filmes da Sessão',
    open: 'Falta contar como foi',
    openText: 'Viram algum? Conte qual e o que cada um achou.',
    feedback: 'Contar como foi',
    chosen: (title: string) => `Viram ${title}`,
    nothing: 'Não viram nada',
    billboard: 'Ver o Cartaz',
    again: 'Pedir de novo:',
    againWhat: (names: readonly string[], constraints: readonly string[]) =>
      [together(names), ...constraints].join(', '),
    none: 'Sua primeira Sessão aparece aqui.',
  },
} as const
