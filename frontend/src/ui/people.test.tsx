// @vitest-environment jsdom
// The Pessoas list, and the form that adds a Pessoa: what it posts is what
// the server reads (`parseNewPerson`, the same reader the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  parseNewPerson,
  PERSON_CREATE_REFUSALS,
} from '#/content/person-create'
import { PEOPLE } from './person.copy'
import { PeopleList } from './people'

afterEach(cleanup)

describe('PeopleList', () => {
  it('links each Pessoa to her page, the Dono marked', () => {
    const html = renderToStaticMarkup(
      <PeopleList
        people={[
          { person: 'bruno', name: 'Bruno', aliases: ['eu'], owner: true },
          { person: 'iara', name: 'Iara', aliases: [], owner: false },
        ]}
      />,
    )
    expect(html).toContain('href="/pessoas/bruno"')
    expect(html).toContain('href="/pessoas/iara"')
    expect(html).toContain(PEOPLE.aliases(['eu']))
    expect(html.match(new RegExp(`>${PEOPLE.owner}<`, 'g'))).toHaveLength(1)
    expect(html).not.toContain('role="alert"')
  })

  it('says when there is no one, when one is gone, when the engine cannot run', () => {
    expect(renderToStaticMarkup(<PeopleList people={[]} />)).toContain(
      PEOPLE.empty,
    )
    expect(renderToStaticMarkup(<PeopleList people={[]} gone />)).toContain(
      PEOPLE.gone,
    )
    const html = renderToStaticMarkup(<PeopleList people={null} />)
    expect(html).toContain(PEOPLE.unavailable)
    expect(html).not.toContain('<ul')
  })
})

const BRUNO = { person: 'bruno', name: 'Bruno', aliases: ['eu'], owner: true }

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

  it('posts a Dono with her Google e-mail, and warns about the Test users', async () => {
    render(<PeopleList people={[BRUNO]} />)
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

  it('comes back open with the reason and what the Dono typed', () => {
    render(
      <PeopleList
        people={[BRUNO]}
        create={{
          refusal: 'email-usado',
          typed: {
            nome: 'Farias',
            apelidos: 'Fa',
            dono: 'sim',
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
