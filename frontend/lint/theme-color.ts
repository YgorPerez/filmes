// The Oxlint `theme` plugin, from pesquisa-relacionamentos'
// `frontend/lint/theme-color.ts`: the color written by hand in the code (a
// `#121417`, an `rgb()` or a `color-mix()` in a string). The app's color
// is a DESIGN.md token, in `ui/tokens.css`: on screen, the theme class
// (`text-ink`, `bg-surface`, `bg-sticker-orange`); in a `style`, the
// variable (`var(--color-case)`), which also follows the dark theme.
//
// `shadcn/no-raw-colors` already catches the color in classes (`bg-[#fff]`)
// and in SVG attributes. This one catches the rest: the `style`, the meta,
// the loose string.

import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

/** A hex of 3, 4, 6 or 8 digits, or a CSS color function. The `#` of an
 * anchor (`#pedir`, `#pergunta`) is not hex. */
const COLOR =
  /(^|[^\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/i

const rawColor = defineRule({
  meta: {
    type: 'problem',
    docs: { description: "The app's color is a DESIGN.md token." },
    messages: {
      raw: 'Color written by hand. Use the theme class (`text-ink`, `bg-surface`, from `ui/tokens.css`) or, in a `style`, its variable (`var(--color-case)`). A new color goes into DESIGN.md first.',
    },
    schema: [],
  },
  create(context) {
    const raw = (text: unknown) => typeof text === 'string' && COLOR.test(text)
    return {
      Literal(node) {
        if (raw(node.value)) context.report({ node, messageId: 'raw' })
      },
      TemplateElement(node) {
        if (raw(node.value.cooked)) context.report({ node, messageId: 'raw' })
      },
    }
  },
})

export default definePlugin({
  meta: { name: 'theme' },
  rules: { 'raw-color': rawColor },
})
