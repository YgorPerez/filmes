// The words of the Pessoas list (`/pessoas`) and its "Acrescentar Pessoa"
// form. A Pessoa's own page has hers in `person.copy.ts`.
import type { PersonCreateRefusal } from '#/content/person-create'
import type { PeopleRefusal } from '#/content/person-action'

export const PEOPLE = {
  title: 'Pessoas',
  lead: 'Quem assiste com você e o que o filmes sabe de cada gosto.',
  myTaste: 'Meu gosto',
  owner: 'Dono',
  aliases: (aliases: readonly string[]) => `também ${aliases.join(', ')}`,
  empty: 'Nenhuma Pessoa ainda. Acrescente quem assiste com você.',
  unavailable:
    'Não deu para abrir as Pessoas: o site está com um problema, e ele ficou registrado no log do servidor.',
  gone: {
    pessoa: 'Essa Pessoa não existe mais: alguém a removeu.',
    baixar: 'Não deu para baixar o CSV: essa Pessoa não existe mais.',
  } satisfies Record<PeopleRefusal, string>,
  removed: 'Pessoa removida.',
  ratings: (n: number) =>
    n === 1 ? '1 Nota' : `${n.toLocaleString('pt-BR')} Notas`,
  vetoes: (n: number) => (n === 1 ? '1 Veto' : `${n} Vetos`),
  unknown: 'falta conhecer',
  create: {
    title: 'Acrescentar Pessoa',
    name: 'Nome',
    aliases: 'Apelidos',
    /** The example in the hint, not a placeholder: one reads as typed. */
    aliasesHint: 'opcional, separados por vírgula; ex.: Lu, Luana',
    owner: 'É Dono: entra no site e no conector',
    email: 'E-mail do Google',
    emailHint: 'o e-mail com que entra',
    testUsers:
      'Enquanto a tela de consentimento do Google estiver em teste, um Dono novo também precisa estar em Test users no Google Cloud, ou o primeiro login falha.',
    submit: 'Acrescentar',
    submitting: 'Acrescentando…',
    refusals: {
      nome: 'Esse nome não dá um nome de arquivo válido. Use letras, números ou espaços.',
      reservado: '“dono” é reservado para achar o Dono. Escolha outro nome.',
      existe: 'Já existe uma Pessoa com esse nome.',
      'nome-usado':
        'Esse nome ou um desses apelidos já é de outra Pessoa. Escolha outro.',
      email: 'Um Dono precisa de um e-mail do Google válido para entrar.',
      'email-usado': 'Esse e-mail já é de outra Pessoa.',
      indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
      falha:
        'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
    } satisfies Record<PersonCreateRefusal, string>,
  },
} as const
