import { Effect } from 'effect'
import {
  EDITABLE,
  LEVELS,
  LINKS,
  personAdjust,
  personCreate,
  personEdit,
  personQuestions,
  personRemove,
  personReport,
  personSeen,
  personSkip,
  personState,
  personVeto,
  personView,
  REMOVABLE,
  STATEMENT_REACTIONS,
} from '@filmes/engine'
import { z } from 'zod'
import { defineTool, invalidUsage, ownerAuthor, personName } from '../tool.ts'

const ACTIONS = [
  'create',
  'view',
  'state',
  'report',
  'veto',
  'seen',
  'adjust',
  'skip',
  'questions',
  'remove',
  'edit',
] as const

/** What each action cannot go without. */
const NEEDS: Readonly<Record<(typeof ACTIONS)[number], readonly string[]>> = {
  create: ['name'],
  view: ['person'],
  state: ['person', 'text'],
  report: ['person', 'text'],
  veto: ['person', 'text'],
  seen: ['person', 'film'],
  adjust: ['person', 'link', 'level'],
  skip: ['person', 'text'],
  questions: ['person'],
  remove: ['person', 'remove'],
  edit: ['person', 'edit'],
}

/** Not an option, not blank. */
const word = (what: string) =>
  z.string().trim().min(1).regex(/^[^-]/, `${what} não pode começar com '-'`)

const input = z.object({
  action: z
    .enum(ACTIONS)
    .describe(
      'create (criar), view (ver), state (declarar), report (relatar), veto (vetar), seen (já visto), ' +
        'adjust (ajustar), skip (pular uma pergunta), questions (perguntas abertas), remove (remover) ou edit (editar)',
    ),
  person: personName('slug, nome ou apelido; "dono" é o Dono').optional(),
  name: word('nome').optional().describe('create: nome da Pessoa'),
  aliases: z
    .array(word('apelido'))
    .optional()
    .describe('create: como o Dono a chama'),
  slug: word('slug')
    .optional()
    .describe('create: nome do arquivo; padrão é o nome sem acento'),
  owner: z.boolean().optional().describe('create: esta Pessoa é Dono'),
  email: z
    .string()
    .optional()
    .describe(
      'create: o e-mail do Google do Dono, com que ele entra no site e no conector; obrigatório com owner, só com owner',
    ),
  text: z
    .string()
    .regex(/\S/, 'o texto não pode ser vazio')
    .optional()
    .describe(
      'state, report, veto: o que foi dito, como foi dito; skip: a pergunta como foi feita',
    ),
  film: z
    .string()
    .regex(/^tt\d+$/, 'ID do IMDb: tt seguido de dígitos')
    .optional()
    .describe('alvo: o filme (tt...)'),
  entity: z
    .string()
    .regex(/^Q\d+$/, 'ID do Wikidata: Q seguido de dígitos')
    .optional()
    .describe(
      'alvo, ou assunto de skip: a entidade (Q...) de diretor, ator ou gênero',
    ),
  group: word('grupo')
    .optional()
    .describe(
      'veto, skip: grupo de tags de config/tag_vetoes.toml: silly_comedy ("comédia boba") ou slow ("lento")',
    ),
  reaction: z
    .enum(STATEMENT_REACTIONS)
    .optional()
    .describe(
      'state, report: love (ama), like (gosta), dislike (não gosta) ou hate (odeia); precisa de alvo',
    ),
  specific: z
    .boolean()
    .optional()
    .describe(
      'state, report: nomeia filme, diretor, ator ou subgênero; o padrão vem do alvo',
    ),
  rating: z
    .string()
    .regex(/^\d+([.,]\d+)?(\/10)?$/, 'nota como "4,5" ou "8/10"')
    .optional()
    .describe(
      'seen: a Nota que a Pessoa deu, de 0,5 a 5 ("4,5") ou de 1 a 10 ("8/10")',
    ),
  review: z
    .boolean()
    .optional()
    .describe('state: é review ou tag que a própria Pessoa escreveu'),
  source: word('fonte')
    .optional()
    .describe('state, report, seen: de onde veio, ex.: "questionário"'),
  link: z
    .enum(LINKS)
    .optional()
    .describe(
      'adjust: o elo, director (diretor), writer (roteiro), cast (elenco), series (série), genre (gênero), cinematography (fotografia) ou producer (produtor)',
    ),
  level: z
    .enum(LEVELS)
    .optional()
    .describe(
      'adjust: none (nada), low (pouco), high (muito); normal desfaz o Ajuste',
    ),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data AAAA-MM-DD')
    .optional()
    .describe('AAAA-MM-DD; padrão hoje'),
  remove: z
    .object({
      kind: z
        .enum(REMOVABLE)
        .describe(
          'stated (Declarado), report (Relato), veto, seen (Já visto) ou open_question (pergunta aberta)',
        ),
      id: z
        .string()
        .trim()
        .min(1)
        .describe(
          'o factId que view mostra, ou o alvo (tt..., Q..., grupo) quando só um item tem esse alvo',
        ),
    })
    .optional()
    .describe('remove: o item a tirar'),
  edit: z
    .object({
      kind: z
        .enum(EDITABLE)
        .describe(
          'stated (Declarado), report (Relato), veto ou seen (Já visto)',
        ),
      id: z
        .string()
        .trim()
        .min(1)
        .describe(
          'o factId que view mostra, ou o alvo (tt..., Q..., grupo) quando só um item tem esse alvo',
        ),
    })
    .optional()
    .describe(
      'edit: o item a corrigir; text, film, entity, group, reaction, source e rating mandados trocam o que ele tem, o resto fica',
    ),
  clear: z
    .array(z.enum(['target', 'reaction', 'rating']))
    .optional()
    .describe(
      'edit: o que o item perde: target (o alvo de um Declarado ou Relato), reaction, rating (a Nota de um Já visto)',
    ),
})

type Input = z.infer<typeof input>

/** The target of a Declarado, Relato or Veto: one of film and entity. */
const targetOf = (i: Input) => i.film ?? i.entity

/** An edit's new target: the one sent, or null when `clear` has it. */
const editedTarget = (i: Input) => {
  const target = i.group ?? targetOf(i)
  if (i.clear?.includes('target')) return { target: null }
  return target === undefined ? {} : { target }
}

/** An edit's field: the value sent, null when `clear` has it, or nothing. */
const cleared = <K extends 'reaction' | 'rating', V>(
  i: Input,
  key: K,
  value: V | undefined,
) => {
  if (i.clear?.includes(key)) return { [key]: null } as Record<K, null>
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>)
}

const run = (i: Input) =>
  Effect.gen(function* () {
    const missing = NEEDS[i.action].filter(
      (field) => i[field as keyof Input] === undefined,
    )
    if (missing.length > 0)
      return yield* invalidUsage(
        `person ${i.action} precisa de: ${missing.join(', ')}`,
      )
    if (i.film !== undefined && i.entity !== undefined)
      return yield* invalidUsage('mande film ou entity, um só')
    const author = yield* ownerAuthor
    const person = i.person ?? ''
    const dated = i.date === undefined ? {} : { date: i.date }
    switch (i.action) {
      case 'create':
        return yield* personCreate({
          author,
          name: i.name!,
          aliases: i.aliases ?? [],
          ...(i.slug !== undefined && { slug: i.slug }),
          owner: i.owner ?? false,
          ...(i.email !== undefined && { email: i.email }),
        })
      case 'view':
        return yield* personView(person)
      case 'questions':
        return yield* personQuestions(person)
      case 'state':
      case 'report': {
        const statement = {
          author,
          person,
          text: i.text!,
          target: targetOf(i),
          reaction: i.reaction,
          specific: i.specific,
          source: i.source,
          ...dated,
        }
        return i.action === 'state'
          ? yield* personState({ ...statement, review: i.review })
          : yield* personReport(statement)
      }
      case 'veto': {
        const target = i.group ?? targetOf(i)
        if (target === undefined)
          return yield* invalidUsage(
            'person veto precisa de film, entity ou group',
          )
        if (i.group !== undefined && targetOf(i) !== undefined)
          return yield* invalidUsage('o Veto tem um alvo só')
        return yield* personVeto({
          author,
          person,
          text: i.text!,
          target,
          group: i.group !== undefined,
          ...dated,
        })
      }
      case 'seen':
        return yield* personSeen({
          author,
          person,
          film: i.film!,
          rating: i.rating,
          source: i.source,
          ...dated,
        })
      case 'adjust':
        return yield* personAdjust({
          author,
          person,
          link: i.link!,
          level: i.level!,
          ...dated,
        })
      case 'skip':
        return yield* personSkip({
          author,
          person,
          text: i.text!,
          subject: i.group ?? i.entity,
          group: i.group !== undefined,
          ...dated,
        })
      case 'remove':
        return yield* personRemove({
          author,
          person,
          kind: i.remove!.kind,
          id: i.remove!.id,
        })
      case 'edit':
        return yield* personEdit({
          author,
          person,
          kind: i.edit!.kind,
          id: i.edit!.id,
          ...(i.text !== undefined && { text: i.text }),
          ...(i.source !== undefined && { source: i.source }),
          ...editedTarget(i),
          ...cleared(i, 'reaction', i.reaction),
          ...cleared(i, 'rating', i.rating),
        })
    }
  })

export default defineTool({
  name: 'person',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  description:
    'As Pessoas no repo de dados e o gosto delas. create: nome, apelidos, slug, owner (Dono) com o email do Google dele. view: tudo o que se sabe da ' +
    'Pessoa (Vetos, Ajustes, Declarados, Relatos com Força, Já vistos, Notas, perguntas abertas, imports). ' +
    'state (Declarado): o que a própria Pessoa disse do gosto dela; report (Relato): o que o Dono sabe do gosto de outra ' +
    'Pessoa; veto: um tipo de filme que ela nunca vê. Alvo por ID: film (tt...) ou entity (Q... de diretor, ator ou gênero). ' +
    'Sobre um filme, reaction love vira Nota 5 e hate vira Nota 1. Sem alvo, o texto fica guardado mas não muda a ordem. ' +
    'O Veto precisa de alvo: film, entity ou group (silly_comedy para "não quer comédia boba", slow para "nada lento"). ' +
    'seen: a Pessoa já viu o filme; com rating, grava também a Nota (de 0,5 a 5, ou de 1 a 10 escrita "8/10"). ' +
    'adjust: quanto um elo do caminho de conteúdo pesa para a Pessoa ("pra ele ator não importa" é link cast, level none); ' +
    'none tira as Evidências do elo, low vale metade e desce a Força um nível, high vale 1,5 vez, normal desfaz; o ' +
    'Declarado sobre um ator ou diretor nomeado continua valendo. skip: guarda uma pergunta de gosto que a Pessoa pulou ' +
    '(text, com o assunto em entity ou group quando houver); pulada de novo, soma e, na segunda vez, sai (dropped: true). ' +
    'questions: as perguntas abertas. remove: tira um item gravado por engano (remove.kind e remove.id, o factId que view ' +
    'mostra ou o alvo); open_question tira uma pergunta aberta respondida. edit: corrige um Declarado, Relato, Veto ou Já visto no ' +
    'lugar (edit.kind e edit.id); manda só o que muda (text, film, entity, group, reaction, source; no Já visto, rating e ' +
    'source, o filme não muda) e clear para tirar alvo, reação ou Nota; o item mantém a data e ganha "editado" com a data ' +
    'de hoje; o que veio de import ou do Feedback não se edita. Falta de campo é erro invalid_usage. ' +
    'O que se grava ou tira vale já na próxima Recomendação e na próxima Sessão; cada gravação é um commit em nome do Dono.',
  input,
  run,
})
