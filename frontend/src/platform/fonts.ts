// The self-hosted fonts (DESIGN.md, Typography): Rubik 500, 700 and 800 and
// Permanent Marker 400, latin subset, in woff2, at `/fonts/*` with the
// stylesheet that declares them and their licenses. The app links
// `/fonts/fonts.css`; the Cartaz's MCP Apps view links the same file from
// the app's origin (`packages/mcp-server/src/billboard-view.ts`), since MCP
// Apps' CSP takes no font in `data:`. The view's frame is on the host's
// origin, so every answer lets any origin read it.
//
// The files live in `src/fonts/` and go into the server bundle (`?inline`,
// `?raw`): their paths and headers are this module's, not the static
// server's.

import permanentMarker400 from '../fonts/permanent-marker-latin-400.woff2?inline'
import permanentMarkerLicense from '../fonts/permanent-marker-LICENSE.txt?raw'
import rubikLicense from '../fonts/rubik-OFL.txt?raw'
import rubik500 from '../fonts/rubik-latin-500.woff2?inline'
import rubik700 from '../fonts/rubik-latin-700.woff2?inline'
import rubik800 from '../fonts/rubik-latin-800.woff2?inline'

const PREFIX = '/fonts/'

const FACES = [
  {
    family: 'Rubik',
    weight: 500,
    file: 'rubik-latin-500.woff2',
    data: rubik500,
  },
  {
    family: 'Rubik',
    weight: 700,
    file: 'rubik-latin-700.woff2',
    data: rubik700,
  },
  {
    family: 'Rubik',
    weight: 800,
    file: 'rubik-latin-800.woff2',
    data: rubik800,
  },
  {
    family: 'Permanent Marker',
    weight: 400,
    file: 'permanent-marker-latin-400.woff2',
    data: permanentMarker400,
  },
] as const

const fontFace = (face: (typeof FACES)[number]) =>
  [
    '@font-face {',
    `  font-family: '${face.family}';`,
    '  font-style: normal;',
    `  font-weight: ${face.weight};`,
    '  font-display: swap;',
    `  src: url('./${face.file}') format('woff2');`,
    '}',
  ].join('\n')

/** A data URL's bytes (what `?inline` gives). */
const bytesOf = (dataUrl: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) =>
    c.charCodeAt(0),
  )

interface File {
  readonly body: Uint8Array<ArrayBuffer> | string
  readonly type: string
}

const TEXT = 'text/plain; charset=utf-8'

const FILES: ReadonlyMap<string, File> = new Map<string, File>([
  ...FACES.map(
    (face) =>
      [face.file, { body: bytesOf(face.data), type: 'font/woff2' }] satisfies [
        string,
        File,
      ],
  ),
  [
    'fonts.css',
    {
      body: `${FACES.map(fontFace).join('\n\n')}\n`,
      type: 'text/css; charset=utf-8',
    },
  ],
  ['rubik-OFL.txt', { body: rubikLicense, type: TEXT }],
  [
    'permanent-marker-LICENSE.txt',
    { body: permanentMarkerLicense, type: TEXT },
  ],
])

/** The answer for `/fonts/*`, or null for any other path. */
export function fontRequest(request: Request): Response | null {
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith(PREFIX)) return null
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  const file = FILES.get(pathname.slice(PREFIX.length))
  if (!file) return new Response('Fonte não encontrada.', { status: 404 })
  return new Response(request.method === 'HEAD' ? null : file.body, {
    headers: {
      'content-type': file.type,
      // A month: the names carry no hash, and a new face gets a new name.
      'cache-control': 'public, max-age=2592000',
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    },
  })
}
