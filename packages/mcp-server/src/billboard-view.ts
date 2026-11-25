// The Cartaz [billboard] as an MCP Apps view: one `ui://` resource, a
// single HTML file with the React Cartaz, its JS and its CSS inline, that
// the host renders under the `billboard` tool's result. The HTML is built
// from the app's component (`frontend/src/mcp-view`) by
// `node frontend/scripts/billboard-view.ts`, which writes
// `billboard-view.gen.ts`; a frontend test fails when the two drift apart.

import {
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
  registerAppResource,
} from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { BILLBOARD_VIEW_HTML } from './billboard-view.gen.ts'

export const BILLBOARD_VIEW_URI = 'ui://filmes/cartaz.html'

const POSTERS = 'https://image.tmdb.org'

/** What the view may load besides itself: the TMDB posters (w500) and,
 * when the server knows the app's address, the app's fonts. The default
 * CSP of MCP Apps already allows the inline JS and CSS. */
export const billboardViewMeta = (appOrigin?: string) => ({
  csp: { resourceDomains: appOrigin ? [POSTERS, appOrigin] : [POSTERS] },
})

/** The view's HTML. With the app's address, the head links the app's
 * fonts (`frontend/src/platform/fonts.ts`): MCP Apps' CSP takes no font in
 * `data:`, so they come from the app's origin, declared in
 * `resourceDomains`. Without it (stdio), each role falls back to its
 * system stack. */
export const billboardViewHtml = (appOrigin?: string) =>
  appOrigin
    ? BILLBOARD_VIEW_HTML.replace(
        '</head>',
        () =>
          `<link rel="stylesheet" href="${appOrigin}/fonts/fonts.css">\n  </head>`,
      )
    : BILLBOARD_VIEW_HTML

/** The `_meta` of a tool whose result the view renders, with the legacy key
 * older hosts read. */
export const billboardViewTool = {
  ui: { resourceUri: BILLBOARD_VIEW_URI },
  [RESOURCE_URI_META_KEY]: BILLBOARD_VIEW_URI,
}

export function registerBillboardView(
  server: McpServer,
  appOrigin?: string,
): void {
  const meta = { ui: billboardViewMeta(appOrigin) }
  const html = billboardViewHtml(appOrigin)
  registerAppResource(
    server,
    'Cartaz',
    BILLBOARD_VIEW_URI,
    {
      description:
        'O Cartaz da Sessão como tela: um card por filme e, com a Sessão aberta, as marcações (Já vi, Trocar, estrelas, comentário, acrescentar) com Enviar e Copiar pro chat.',
      _meta: meta,
    },
    async () => ({
      contents: [
        {
          uri: BILLBOARD_VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: meta,
        },
      ],
    }),
  )
}
