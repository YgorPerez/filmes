// @vitest-environment jsdom
// The Pessoas list, and the form that adds a Pessoa: what it posts is what
// the server reads (`parseNewPerson`, the same reader the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { parseNewPerson, PERSON_CREATE_REFUSALS } from '#/content/person-create'
import { PEOPLE } from './people.copy'
import { PeopleList } from './people'

afterEach(cleanup)

describe('PeopleList', () => {
  it('links each Pessoa to her page, the Dono marked', () => {
    const html = renderToStaticMarkup(
      <PeopleList
        people={[
          {
            person: 'bruno',
            name: 'Bruno',
            aliases: ['eu'],
            owner: true,
            ratings: 0,
            vetoes: 0,
          },
          {
            person: 'iara',
            name: 'Iara',
            aliases: [],
            owner: false,
            ratings: 0,
            vetoes: 0,
          },
        ]}
      />,
    )
    expect(html).toContain('href="/pessoas/bruno"')
    expect(html).toContain('href="/pessoas/iara"')
    expect(html).toContain(PEOPLE.aliases(['eu']))
    expect(html.match(new RegExp(`>${PEOPLE.owner}<`, 'g'))).toHaveLength(1)
    expect(html).not.toContain('role="alert"')
  })

  it('lists the logged-in Dono first, linking to Meu gosto', () => {
    render(
      <PeopleList
        self="vera"
        people={[
          {
            person: 'bruno',
            name: 'Bruno',
            aliases: [],
            owner: true,
            ratings: 0,
            vetoes: 0,
          },
          {
            person: 'iara',
            name: 'Iara',
            aliases: [],
            owner: false,
            ratings: 0,
            vetoes: 0,
          },
          {
            person: 'vera',
            name: 'Vera',
            aliases: [],
            owner: true,
            ratings: 0,
            vetoes: 0,
          },
        ]}
      />,
    )
    const links = within(
      screen.getByRole('list', { name: PEOPLE.title }),
    ).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/meu-gosto',
      '/pessoas/bruno',
      '/pessoas/iara',
    ])
    expect(links[0]?.textContent).toContain(PEOPLE.myTaste)
  })

  it('says how much the filmes knows of each one', () => {
    render(
      <PeopleList
        people={[
          { ...BRUNO, aliases: [], ratings: 11, vetoes: 1 },
          { ...BRUNO, person: 'teo', name: 'Teo', owner: false, aliases: [] },
          {
            ...BRUNO,
            person: 'iara',
            name: 'Iara',
            owner: false,
            aliases: [],
            ratings: null,
          },
        ]}
        self="bruno"
      />,
    )
    const rows = within(
      screen.getByRole('list', { name: PEOPLE.title }),
    ).getAllByRole('link')
    expect(rows.map((row) => row.textContent)).toEqual([
      `Bruno${PEOPLE.owner}${PEOPLE.myTaste} · 11 Notas · 1 Veto`,
      `Teo${PEOPLE.unknown}`,
      'Iara',
    ])
  })

  it('says when there is no one, when one is gone, when the engine cannot run', () => {
    expect(renderToStaticMarkup(<PeopleList people={[]} />)).toContain(
      PEOPLE.empty,
    )
    expect(renderToStaticMarkup(<PeopleList people={[]} gone />)).toContain(
      PEOPLE.gone,
    )
    expect(renderToStaticMarkup(<PeopleList people={[]} removed />)).toContain(
      PEOPLE.removed,
    )
    const html = renderToStaticMarkup(<PeopleList people={null} />)
    expect(html).toContain(PEOPLE.unavailable)
    expect(html).not.toContain('<ul')
  })
})

const BRUNO = {
  person: 'bruno',
  name: 'Bruno',
  aliases: ['eu'],
  owner: true,
  ratings: 0,
  vetoes: 0,
}

/** The create form, opened, and what it posts as the server reads it. */
async function createForm() {
  const user = userEvent.setup()
  await user.click(screen.getByText(PEOPLE.create.title))
  const form = screen.getByRole('form', { name: PEOPLE.create.title })
  const posted = () => {
    const element = form as HTMLFormElement
    expect(element.method).toBe('post')
    expect(new URL(element.action).pathname).toBe('/pessoas/nova/enviar')
    return parseNewPerson(new FormData(element))
  }
  return { user, fields: within(form), posted }
}

describe('PeopleList create form', () => {
  it('posts a Pessoa with her name and nicknames', async () => {
    render(<PeopleList people={[BRUNO]} />)
    const { user, fields, posted } = await createForm()
    await user.type(fields.getByLabelText(PEOPLE.create.name), 'Luana Reis')
    await user.type(
      fields.getByLabelText(PEOPLE.create.aliases, { exact: false }),
      'Lu, Luana ,',
    )
    // An e-mail typed for someone who is not a Dono is dropped, not sent:
    // the engine would refuse it.
    await user.type(
      fields.getByLabelText(PEOPLE.create.email, { exact: false }),
      'lu@example.org',
    )
    expect(posted()).toEqual({
      name: 'Luana Reis',
      aliases: ['Lu', 'Luana'],
      owner: false,
    })
  })

  it('posts a Dono with her Google e-mail, and warns an admin about the Test users', async () => {
    render(<PeopleList people={[BRUNO]} admin />)
    const { user, fields, posted } = await createForm()
    await user.type(fields.getByLabelText(PEOPLE.create.name), 'Farias')
    await user.click(fields.getByLabelText(PEOPLE.create.owner))
    await user.type(
      fields.getByLabelText(PEOPLE.create.email, { exact: false }),
      'Farias@Example.org',
    )
    expect(posted()).toEqual({
      name: 'Farias',
      aliases: [],
      owner: true,
      email: 'Farias@Example.org',
    })
    expect(fields.getByText(PEOPLE.create.testUsers)).toBeTruthy()
  })

  it('refuses a Dono without an e-mail, and a form without a name', async () => {
    render(<PeopleList people={[BRUNO]} />)
    const { user, fields, posted } = await createForm()
    await user.click(fields.getByLabelText(PEOPLE.create.owner))
    expect(posted()).toBe('nome')
    await user.type(fields.getByLabelText(PEOPLE.create.name), 'Farias')
    expect(posted()).toBe('email')
  })

  it('says a name another Pessoa has apart from a taken file name', () => {
    render(
      <PeopleList
        people={[BRUNO]}
        create={{ refusal: 'nome-usado', typed: { name: 'Eu' } }}
      />,
    )
    const alert = screen.getByRole('alert').textContent
    expect(alert).toContain(PEOPLE.create.refusals['nome-usado'])
    expect(alert).not.toContain(PEOPLE.create.refusals.existe)
  })

  it('comes back open with the reason and what the Dono typed', () => {
    render(
      <PeopleList
        people={[BRUNO]}
        create={{
          refusal: 'email-usado',
          typed: {
            name: 'Farias',
            aliases: 'Fa',
            owner: true,
            email: 'bruno@example.org',
          },
        }}
      />,
    )
    const form = screen.getByRole('form', { name: PEOPLE.create.title })
    expect(form.closest('details')?.open).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain(
      PEOPLE.create.refusals['email-usado'],
    )
    const fields = within(form)
    expect(
      (fields.getByLabelText(PEOPLE.create.name) as HTMLInputElement).value,
    ).toBe('Farias')
    expect(
      (
        fields.getByLabelText(PEOPLE.create.aliases, {
          exact: false,
        }) as HTMLInputElement
      ).value,
    ).toBe('Fa')
    expect(
      (fields.getByLabelText(PEOPLE.create.owner) as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (
        fields.getByLabelText(PEOPLE.create.email, {
          exact: false,
        }) as HTMLInputElement
      ).value,
    ).toBe('bruno@example.org')
  })

  it('has a sentence for every refusal', () => {
    for (const refusal of PERSON_CREATE_REFUSALS)
      expect(PEOPLE.create.refusals[refusal]).toBeTruthy()
  })

  it('offers no form when the engine cannot run', () => {
    render(<PeopleList people={null} />)
    expect(screen.queryByText(PEOPLE.create.title)).toBeNull()
  })
})
