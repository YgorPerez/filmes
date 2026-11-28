// Groups of films for the Escolha de grupo's stories and tests (#415): the
// fixture's films, without covers.
import type { PairwisePage } from '#/platform/pairwise'

const film = (id: string, title: string, year: number) => ({
  id,
  title,
  year,
  poster: null,
})

const group = (
  id: string,
  name: string,
  labels: string[],
  films: ReturnType<typeof film>[],
) => ({ id, name, labels, films })

export const GROUPS: NonNullable<PairwisePage['groups']> = {
  max: 3,
  choices: [
    group(
      'tides',
      'Faróis e marés',
      ['litorâneo', 'melancólico', 'contemplativo'],
      [
        film('tt9000101', 'O Farol de Areia', 2012),
        film('tt9000103', 'Cidade de Vidro', 2018),
        film('tt9000102', 'Maré Baixa', 2015),
      ],
    ),
    group(
      'noise',
      'Barulho e fronteira',
      ['urbano', 'tenso', 'seco'],
      [
        film('tt9000303', 'Rio Abaixo', 2014),
        film('tt9000401', 'Fronteira', 2008),
        film('tt9000501', 'Barulho', 2013),
      ],
    ),
    group(
      'small',
      'Pequenas alegrias',
      ['leve', 'familiar', 'para sorrir'],
      [
        film('tt9000601', 'Pequenos Milagres', 2019),
        film('tt9000201', 'Ponte Aérea', 2016),
        film('tt9000202', 'O Último Bonde', 2019),
      ],
    ),
    group(
      'night',
      'Noites longas',
      ['sombrio', 'tenso', 'noturno'],
      [
        film('tt9000702', 'A Última Estação', 2018),
        film('tt9000105', 'Sal e Ferrugem', 2023),
        film('tt9000203', 'Noite de Estreia', 2022),
      ],
    ),
  ],
}
