// The Oxlint `cohesion` plugin, from pesquisa-relacionamentos'
// `frontend/lint/cohesion.ts`: what DESIGN.md unified has an owner, and
// these rules tie each piece to it. The owners are not here: each rule is
// turned on in the root `vite.config.ts` only outside the owners' files,
// with the reason.
//
// `hand-drawn-icons`: the app's icons are drawn in DESIGN.md's line (authored
// SVG on a 24px grid, 1.8 stroke, round caps), in `ui/kit/icon.tsx` and, for
// the self-contained MCP Apps view, `ui/billboard-icons.tsx`. A ready-made
// icon package, like `lucide-react`, does not come in.
// `no-shadow`: DESIGN.md's No Shadow Rule. Depth is tone and a 1px rule,
// never a blurred or offset shadow, and never a gradient. The only "shadows"
// are 2px rings with no blur (`ring-2`), which stay allowed.
//
// pesquisa-relacionamentos' other two rules have no counterpart here:
// `h1-owner` asks for one piece that draws every page title, and DESIGN.md
// gives the filmes `<h1>` several roles (Title, Counter title) on different
// screens; `halftone-owner` guards the halftone, which filmes does not have.

import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

/** The ready-made icon packages. */
const ICON_PACKAGES =
  /^(lucide-react|@heroicons\/|react-icons|@tabler\/icons|@phosphor-icons\/|@radix-ui\/react-icons)/

/** A Tailwind shadow or gradient class, with or without a variant in front
 * (`hover:shadow-md`). `ring-*` is not here: DESIGN.md's rings are allowed. */
const SHADOW =
  /(^|[\s:])(shadow|drop-shadow|inset-shadow|text-shadow)(-[\w./[\]-]+)?(?=\s|$)|(^|[\s:])bg-(linear|radial|conic|gradient)-[\w./[\]-]+(?=\s|$)/

/** The same, written in a `style`: `box-shadow`, `text-shadow`, a gradient. */
const SHADOW_STYLE = new Set(['boxShadow', 'textShadow', 'filter'])
const GRADIENT = /\b(repeating-)?(linear|radial|conic)-gradient\(/

const handDrawnIcons = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'The icons are drawn in the app.' },
    messages: {
      handDrawn:
        "The app's icons are drawn as SVG in DESIGN.md's line, in `ui/kit/icon.tsx`. Draw the icon there instead of importing a ready-made one.",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          typeof node.source.value === 'string' &&
          ICON_PACKAGES.test(node.source.value)
        )
          context.report({ node, messageId: 'handDrawn' })
      },
    }
  },
})

const noShadow = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'No shadow and no gradient (The No Shadow Rule).' },
    messages: {
      shadow:
        'DESIGN.md, The No Shadow Rule: separate by tone (floor, surface, surface 2) and a 1px rule, never by a shadow or a gradient. A ring with no blur is `ring-2`.',
    },
    schema: [],
  },
  create(context) {
    const has = (text: unknown) =>
      typeof text === 'string' && (SHADOW.test(text) || GRADIENT.test(text))
    return {
      Literal(node) {
        if (has(node.value)) context.report({ node, messageId: 'shadow' })
      },
      TemplateElement(node) {
        if (has(node.value.cooked))
          context.report({ node, messageId: 'shadow' })
      },
      // `style={{ boxShadow: ... }}`, whatever its value.
      Property(node) {
        const key = node.key
        const name =
          key.type === 'Identifier'
            ? key.name
            : key.type === 'Literal'
              ? key.value
              : undefined
        if (
          typeof name === 'string' &&
          SHADOW_STYLE.has(name) &&
          !(name === 'filter' && !isDropShadow(node.value))
        )
          context.report({ node, messageId: 'shadow' })
      },
    }
  },
})

/** A `filter` only counts when it is a `drop-shadow()`. */
function isDropShadow(value: unknown): boolean {
  const node = value as { type?: string; value?: unknown } | undefined
  return (
    node?.type === 'Literal' &&
    typeof node.value === 'string' &&
    node.value.includes('drop-shadow(')
  )
}

export default definePlugin({
  meta: { name: 'cohesion' },
  rules: {
    'hand-drawn-icons': handDrawnIcons,
    'no-shadow': noShadow,
  },
})
