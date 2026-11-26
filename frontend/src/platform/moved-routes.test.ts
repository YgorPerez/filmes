// The paths that moved in the layout pass (#219, map #218): each old page
// redirects to where its screen lives now, keeping the query, and a
// Pessoa's own page is Meu gosto.
import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vite-plus/test'
import { Route as Export } from '#/routes/exportar/index'
import { Route as FeedbackList } from '#/routes/feedback/index'
import { Route as Feedback } from '#/routes/feedback/$sessao/index'
import { Route as Queue } from '#/routes/fila/index'
import { Route as Imports } from '#/routes/importar/index'
import { Route as PersonImportsOld } from '#/routes/importar/$pessoa/index'
import { Route as Ratings } from '#/routes/notas/index'
import { Route as Person } from '#/routes/_owner/pessoas/$pessoa/index'
import { Route as PersonImports } from '#/routes/_owner/pessoas/$pessoa/importar'

type BeforeLoad = (ctx: {
  params: Record<string, string>
  location: { searchStr: string }
  context: { owner: { person: string } }
}) => unknown

/** Where the route's `beforeLoad` sends the request, or null if it lets
 * the page load. */
const target = (
  route: { options: { beforeLoad?: unknown } },
  path: { params?: Record<string, string>; search?: string } = {},
): string | null => {
  const beforeLoad = route.options.beforeLoad as BeforeLoad
  try {
    beforeLoad({
      params: path.params ?? {},
      location: { searchStr: path.search ?? '' },
      context: { owner: { person: 'bruno' } },
    })
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options.href ?? null
    throw thrown
  }
  return null
}

describe('the moved paths', () => {
  it.each([
    ['/meu-gosto/notas?feito=3', Ratings, {}, '?feito=3'],
    ['/meu-gosto/fila', Queue, {}, ''],
    ['/meu-gosto/exportar?erro=pessoa', Export, {}, '?erro=pessoa'],
    ['/meu-gosto/importar', Imports, {}, ''],
    ['/pessoas/teo/importar', PersonImportsOld, { pessoa: 'teo' }, ''],
    ['/sessoes?filtro=para-contar', FeedbackList, {}, ''],
    [
      '/sessoes/2026-11-20-teo/contar',
      Feedback,
      { sessao: '2026-11-20-teo' },
      '',
    ],
  ] as const)('sends the old page to %s', (to, route, params, search) => {
    expect(target(route, { params, search })).toBe(to)
  })

  it("sends the Dono's own Pessoa page and imports to Meu gosto", () => {
    expect(
      target(Person, { params: { pessoa: 'bruno' }, search: '?feito=vetado' }),
    ).toBe('/meu-gosto?feito=vetado')
    expect(target(Person, { params: { pessoa: 'teo' } })).toBeNull()
    expect(target(PersonImports, { params: { pessoa: 'bruno' } })).toBe(
      '/meu-gosto/importar',
    )
    expect(target(PersonImports, { params: { pessoa: 'teo' } })).toBeNull()
  })
})
