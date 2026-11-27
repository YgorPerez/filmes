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

/** "Sexta, 21 nov" from "2026-11-21"; the date itself when it is not one. */
const day = (iso: string) => {
  const [year, month, date] = iso.split('-').map(Number)
  const when = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1))
  return Number.isNaN(when.getTime()) || !month || !date
    ? iso
    : `${WEEKDAYS[when.getUTCDay()]}, ${date} ${MONTHS[month - 1]}`
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
    lead: 'Saem 5 filmes, cada um com o motivo de cada Presente gostar.',
  },
  guide: {
    title: 'Para começar',
    payoff:
      'Dá para pedir filme já. Sem isso, a lista sai só com palpites; com 10 notas, cada filme vem com o seu motivo.',
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
    when: (date: string, names: readonly string[]) =>
      `${day(date)} · ${together(names)}`,
    you: 'Você',
    films: 'Filmes da Sessão',
    open: 'Falta contar como foi',
    openText: 'Viram algum? Conte qual e o que cada um achou.',
    feedback: 'Contar como foi',
    feedbackLabel: (id: string) => `Contar como foi a Sessão ${id}`,
    chosen: (title: string) => `vimos ${title}`,
    nothing: 'não vimos nada',
  },
} as const
