import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { EXPORT_REFUSALS } from '#/content/export-refusal'
import { EXPORT } from './export.copy'
import { Export, type ExportPeople } from './export'

const CHOICES: ExportPeople = {
  people: [
    { person: 'bruno', name: 'Bruno', ratings: 12 },
    { person: 'iara', name: 'Iara', ratings: 1 },
    { person: 'leo', name: 'Leo', ratings: 0 },
  ],
  selected: 'iara',
}

describe('Export', () => {
  it('downloads with a plain GET form, the Dono chosen first', () => {
    const html = renderToStaticMarkup(<Export choices={CHOICES} />)
    expect(html).toMatch(
      /<form [^>]*action="\/exportar\/imdb\.csv" method="get"/,
    )
    expect(html).toContain('<select name="pessoa"')
    expect(html).toContain(
      '<option value="iara" selected="">Iara · 1 Nota</option>',
    )
    expect(html).toContain('<option value="bruno">Bruno · 12 Notas</option>')
    expect(html).toContain('<option value="leo">Leo · nenhuma Nota</option>')
    expect(html).toMatch(/<button type="submit"[^>]*>Baixar CSV do IMDb/)
    expect(html).not.toContain('role="alert"')
  })

  it('tells how to take the file to the MovieLens', () => {
    const html = renderToStaticMarkup(<Export choices={CHOICES} />)
    expect(html).toContain(EXPORT.movielensTitle)
    for (const step of EXPORT.movielens) expect(html).toContain(step)
  })

  it.each(EXPORT_REFUSALS)('says why the download failed: %s', (refusal) => {
    const html = renderToStaticMarkup(
      <Export choices={CHOICES} refusal={refusal} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(EXPORT.refusals[refusal])
    expect(html).toContain('<form')
  })

  it('has no form when the engine cannot run here', () => {
    const html = renderToStaticMarkup(<Export choices={null} />)
    expect(html).toContain(EXPORT.unavailable)
    expect(html).not.toContain('<form')
  })
})
