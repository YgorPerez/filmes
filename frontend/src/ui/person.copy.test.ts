// The words a Pessoa page builds: the Nota on 1 to 10, its source, what a
// field lacks, the fold of the empty fichas.
import { describe, expect, it } from 'vite-plus/test'
import { PERSON } from './person.copy'

describe('the Pessoa copy', () => {
  it('writes a Nota on the 1 to 10 scale', () => {
    expect(PERSON.ratingText(4.5)).toBe('nota 9')
    expect(PERSON.ratingText(3.75)).toBe('nota 7,5')
  })

  it('names the source by its service, with the stars of one that rates on 5', () => {
    // On her own page, the service alone (#274).
    expect(PERSON.ratingSource(4.5, 'Letterboxd da Iara', 'Iara')).toBe(
      'Letterboxd (4,5★)',
    )
    expect(PERSON.ratingSource(0.5, 'Trakt de Bruno', 'Bruno')).toBe('Trakt')
    expect(PERSON.ratingSource(4.5, 'Letterboxd da Iara')).toBe(
      'Letterboxd da Iara (4,5★)',
    )
    expect(PERSON.ratingSource(4, 'Feedback', 'Iara')).toBe('Feedback')
    expect(PERSON.ratingSource(4, 'notas no site')).toBe('Dar notas')
    expect(PERSON.ratingSource(4, null)).toBeNull()
  })

  it.each([
    ['nota', 'rating', 'A Nota vai de 1 a 10.'],
    ['filme', 'film', /^Falta o filme: busque pelo título/],
    ['nota', 'film', 'O filme é o tt… dele no Catálogo.'],
    ['alvo', 'id', /^Busque pelo nome/],
    ['alvo', 'target', /^Falta o alvo/],
    ['alvo', 'reaction', /^Uma reação precisa de um alvo/],
    ['texto', 'required', 'Falta o texto: o que foi dito.'],
    ['outro', 'required', 'Falta preencher este campo.'],
  ] as const)('says what %s lacks (%s)', (field, problem, text) => {
    expect(PERSON.fieldProblem({ field, problem })).toMatch(text)
  })

  it('labels the genres and the directors she likes apart', () => {
    expect(PERSON.glance.likes(['Drama', 'Crime'], ['Helena Prado'])).toBe(
      'Pelas suas Notas, você gosta dos gêneros Drama e Crime e da direção de Helena Prado.',
    )
    expect(PERSON.glance.likes(['Drama'], [])).toBe(
      'Pelas suas Notas, você gosta do gênero Drama.',
    )
  })

  it('names the empty fichas and her name in the Sessões', () => {
    expect(PERSON.empty('Já vistos sem Nota')).toBe(
      'Já vistos sem Nota: nenhum',
    )
    expect(PERSON.summary.likes('Quim', ['Drama'])).toBe(
      'Pelas Notas, Quim gosta de Drama.',
    )
    expect(
      PERSON.summary.likes('Quim', ['Drama', 'Crime', 'Rui Tavares']),
    ).toBe('Pelas Notas, Quim gosta de Drama, Crime e Rui Tavares.')
    expect(PERSON.refine(['Ajustes', 'Declarados (2)'])).toBe(
      'Afinar: Ajustes e Declarados (2)',
    )
    expect(PERSON.savedIn.vetos.gravado).toBe('Veto gravado.')
    expect(PERSON.sessions.reaction(null)).toBe('sem reação')
    expect(PERSON.sessions.reaction(0.2)).toBe('não gostou')
    expect(PERSON.ownName('Bruno', [])).toBe('Nas Sessões, você é Bruno.')
    expect(PERSON.glance.notes(1)).toBe('1 Nota')
    expect(PERSON.glance.notes(1200)).toBe('1.200 Notas')
    expect(PERSON.plainLabel('tag: chuva')).toBe('a tag “chuva”')
  })
})

describe('the Pessoa copy', () => {
  it('counts in the singular and the plural', () => {
    const { glance, summary } = PERSON
    expect(glance.likes([], ['Lia Couto'])).toBe(
      'Pelas suas Notas, você gosta da direção de Lia Couto.',
    )
    expect(glance.likes(['Terror', 'Drama', 'Crime'], [])).toBe(
      'Pelas suas Notas, você gosta dos gêneros Terror, Drama e Crime.',
    )
    expect(glance.steps.queue(1)).toBe(
      'dizer qual é o filme que espera na fila',
    )
    expect(glance.steps.queue(3)).toBe(
      'dizer quais são os 3 filmes que esperam na fila',
    )
    expect([summary.notes(1), summary.notes(1200)]).toEqual([
      '1 Nota',
      '1.200 Notas',
    ])
    expect([summary.vetoes(1), summary.vetoes(2)]).toEqual([
      '1 Veto',
      '2 Vetos',
    ])
    expect([summary.questions(1), summary.questions(2)]).toEqual([
      '1 pergunta aberta',
      '2 perguntas abertas',
    ])
    expect([summary.sessions(1), summary.sessions(4)]).toEqual([
      '1 Sessão',
      '4 Sessões',
    ])
  })
})

describe('the Pessoa copy', () => {
  it('counts the Notas, questions and Ajustes in the singular and the plural', () => {
    const { summary, notes, questions, adjustments } = PERSON
    expect(summary.steps.questions(1)).toBe('Responder a pergunta')
    expect(summary.steps.questions(2)).toBe('Responder as perguntas')
    expect([notes.pending(1), notes.pending(2)]).toEqual([
      '1 filme espera você',
      '2 filmes esperam você',
    ])
    expect([notes.list(1), notes.list(5)]).toEqual([
      'Ver a Nota',
      'Ver as 5 Notas',
    ])
    expect([questions.skips(1), questions.skips(3)]).toEqual([
      'pulada 1 vez',
      'pulada 3 vezes',
    ])
    expect([adjustments.changed(1), adjustments.changed(2)]).toEqual([
      '1 fora do normal',
      '2 fora do normal',
    ])
    expect(PERSON.removePerson.sessions('Quim', 1)).toMatch(
      /^Quim está em 1 Sessão:/,
    )
    expect(PERSON.removePerson.sessions('Quim', 2)).toMatch(
      /^Quim está em 2 Sessões:/,
    )
  })

  it('says her Satisfação and each reaction in words', () => {
    const { satisfaction, reaction } = PERSON.sessions
    expect(satisfaction('Iara', 0.8, 1)).toBe(
      'Iara tem saído contente da última Sessão em que disse o que achou.',
    )
    expect(satisfaction('Iara', 0.6, 3)).toBe(
      'Iara tem saído mais ou menos das últimas 3 Sessões em que disse o que achou.',
    )
    expect(satisfaction('Iara', 0.2, 2)).toMatch(/tem saído sem gostar muito/)
    expect(reaction(0.9)).toBe('gostou')
    expect(reaction(0.5)).toBe('mais ou menos')
  })
})

describe('the Pessoa copy', () => {
  it('words the Notas section for her and for another Pessoa', () => {
    const { notes, questions, access } = PERSON
    expect(notes.predictionError(1.24, 1200)).toBe(
      'a previsão erra 1,2 ponto em média, em 1.200 filmes',
    )
    expect(notes.predictionError(2.06, 30)).toBe(
      'a previsão erra 2,1 pontos em média, em 30 filmes',
    )
    expect(notes.movielens(true, 1, 'Iara')).toMatch(
      /^Para levar a Nota a outro/,
    )
    expect(notes.movielens(false, 1200, 'Iara')).toMatch(
      /^Para levar as 1\.200 Notas de Iara a outro/,
    )
    expect(notes.empty(true, 'Iara')).toMatch(/você já viu/)
    expect(notes.empty(false, 'Iara')).toMatch(/histórico de Iara/)
    expect(questions.likesText(null)).toBe('curte')
    expect(questions.likesText('terror')).toBe('curte terror')
    expect(questions.dislikesText(null)).toBe('não curte')
    expect(questions.dislikesText('terror')).toBe('não curte terror')
    expect(access.owner(null)).toBe('Tem acesso.')
    expect(access.owner('iara@exemplo.com')).toBe('Entra com iara@exemplo.com.')
  })

  it('names her other names only when she has some', () => {
    expect(PERSON.aliases([])).toBeNull()
    expect(PERSON.aliases(['Quinzinho'])).toBe('também Quinzinho')
  })
})
