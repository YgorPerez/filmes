// The words of the Pessoas list (`/pessoas`) and its "Acrescentar Pessoa"
// form. A Pessoa's own page has hers in `person.copy.ts`.
import type { PersonCreateRefusal } from '#/content/person-create'

export const PEOPLE = {
  title: 'Pessoas',
  lead: 'Quem assiste com você e o que o filmes sabe do gosto de cada uma.',
  myTaste: 'Meu gosto',
  owner: 'Dono',
  aliases: (aliases: readonly string[]) => `também ${aliases.join(', ')}`,
  empty: 'Nenhuma Pessoa no repo de dados ainda.',
  unavailable:
    'As Pessoas ainda não estão prontas neste servidor: falta o banco do filmes.',
  gone: 'Essa Pessoa não está mais no repo de dados.',
  create: {
    title: 'Acrescentar Pessoa',
    name: 'Nome',
    aliases: 'Apelidos',
    aliasesHint: 'opcional, separados por vírgula',
    owner: 'É Dono: entra no site e no conector',
    email: 'E-mail do Google',
    emailHint: 'só para um Dono',
    testUsers:
      'Enquanto a tela de consentimento do Google estiver em teste, um Dono novo também precisa estar em Test users no Google Cloud, ou o primeiro login dele falha.',
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
    } satisfies Record<PersonCreateRefusal, string>,
  },
} as const
