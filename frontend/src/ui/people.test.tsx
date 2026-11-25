import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { PEOPLE } from './person.copy'
import { PeopleList } from './people'

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
