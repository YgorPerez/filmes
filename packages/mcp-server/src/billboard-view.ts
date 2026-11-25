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

/** What the view may load besides itself: the TMDB posters (w500). The
 * default CSP of MCP Apps already allows the inline JS and CSS. */
export const BILLBOARD_VIEW_META = {
  csp: { resourceDomains: ['https://image.tmdb.org'] },
}

/** The `_meta` of a tool whose result the view renders, with the legacy key
 * older hosts read. */
export const billboardViewTool = {
  ui: { resourceUri: BILLBOARD_VIEW_URI },
  [RESOURCE_URI_META_KEY]: BILLBOARD_VIEW_URI,
}

export function registerBillboardView(server: McpServer): void {
  registerAppResource(
    server,
    'Cartaz',
    BILLBOARD_VIEW_URI,
    {
      description:
        'O Cartaz da Sessão como tela: um card por filme e, com a Sessão aberta, as marcações (Já vi, Trocar, estrelas, comentário, acrescentar) com Enviar e Copiar pro chat.',
      _meta: { ui: BILLBOARD_VIEW_META },
    },
    async () => ({
      contents: [
        {
          uri: BILLBOARD_VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: BILLBOARD_VIEW_HTML,
          _meta: { ui: BILLBOARD_VIEW_META },
        },
      ],
    }),
  )
}
