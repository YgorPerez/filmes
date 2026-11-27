// The Pessoas screens' shared parts: a section with its items, the forms and
// their fields, and the Catálogo search with its answer.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, within } from 'storybook/test'
import {
  ActionForm,
  Alert,
  CatalogSearch,
  Disclosure,
  Item,
  Items,
  Meta as ItemMeta,
  Notice,
  RemoveForm,
  Section,
  SessionFilmLookup,
  Submit,
  TargetField,
  TextField,
} from './person-parts'

// The search's own prop: the story leaves the server module alone.
type SearchAnswer = NonNullable<ComponentProps<typeof CatalogSearch>['answer']>

const FOUND: SearchAnswer = {
  query: 'fronteira',
  found: {
    query: 'fronteira',
    films: [
      {
        id: 'tt9000401',
        title: 'Fronteira',
        year: 2008,
        votes: 40000,
        rating: 7.2,
        directors: ['Rui Tavares'],
      },
      {
        id: 'tt9001903',
        title: 'Fronteira II',
        year: null,
        votes: 8000,
        rating: null,
        directors: [],
      },
    ],
    people: [
      {
        id: 'Q9000006',
        label: 'Lia Moura',
        links: ['director', 'cast'],
        filmCount: 2,
        knownFor: [{ id: 'tt9000601', title: 'Pequenos Milagres', year: 2019 }],
      },
    ],
    genres: [],
    series: [
      {
        id: 'Q9001903',
        label: 'Trilogia da Fronteira',
        links: ['series'],
        filmCount: 1,
        knownFor: [{ id: 'tt9000401', title: 'Fronteira', year: 2008 }],
      },
    ],
  },
}

const pick = (id: string) => `/sessoes/nova?parecido=${id}`

const meta = {
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A section as the Pessoa's page has it: items with "Tirar", and the
 * folded form that adds one. */
export const SectionWithForm: Story = {
  render: () => (
    <Section id="vetos" title="Vetos" lead="O que ela nunca vê.">
      <Items empty="Nenhum Veto ainda.">
        {[
          <Item
            key="1"
            actions={
              <RemoveForm
                slug="iara"
                what="veto"
                id="vetos:1"
                label="nunca vê terror"
              />
            }
          >
            nunca vê terror
            <ItemMeta parts={['Terror', null, '2026-11-19']} />
          </Item>,
        ]}
      </Items>
      <Disclosure summary="Acrescentar Veto">
        <ActionForm slug="iara" action="vetar" label="Acrescentar Veto">
          <TextField name="texto" label="O Veto, como foi dito" required />
          <TargetField
            name="alvo"
            label="Diga o quê: um filme, uma pessoa, um gênero ou um grupo"
            scope="all"
            groups={[
              { key: 'silly_comedy', label: 'comédia boba' },
              { key: 'slow', label: 'lento' },
            ]}
          />
          <Submit>Gravar</Submit>
        </ActionForm>
      </Disclosure>
    </Section>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Vetos' }),
    ).toBeVisible()
  },
}

/** A Já visto's film: a search by title, never an ID to paste (#273). */
export const FilmTarget: Story = {
  render: () => (
    <ActionForm slug="iara" action="visto" label="Acrescentar Já visto">
      <TargetField name="filme" label="Filme" scope="films" />
      <Submit>Gravar</Submit>
    </ActionForm>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('searchbox', { name: 'Filme' }),
    ).toBeVisible()
  },
}

export const EmptySection: Story = {
  render: () => (
    <Section id="relatos" title="Relatos">
      <Items empty="Nenhum Relato ainda.">{[]}</Items>
    </Section>
  ),
}

export const Status: Story = {
  render: () => (
    <div className="flex flex-col gap-xl">
      <Notice>Gravado.</Notice>
      <Alert>Esse ID não está no Catálogo.</Alert>
    </div>
  ),
}

export const SearchFound: Story = {
  render: () => (
    <CatalogSearch
      action="/pessoas/iara"
      scope="all"
      answer={FOUND}
      pick={pick}
    />
  ),
}

export const SearchNothing: Story = {
  render: () => (
    <CatalogSearch
      action="/sessoes/nova"
      scope="films"
      answer={{
        query: 'zzz',
        found: { query: 'zzz', films: [], people: [], genres: [], series: [] },
      }}
    />
  ),
}

export const SearchRefused: Story = {
  render: () => (
    <CatalogSearch
      action="/pessoas/iara"
      scope="all"
      answer={{ query: 'é', refused: 'curta' }}
    />
  ),
}

/** The search inside a form that posts (Nova Sessão, Contar como foi). */
export const SessionLookup: Story = {
  render: () => (
    <form method="post" action="/sessoes/nova/enviar">
      <SessionFilmLookup
        name="buscar"
        label="Parecido com"
        answer={FOUND}
        pick={pick}
      />
    </form>
  ),
}
