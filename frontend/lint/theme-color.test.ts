import { RuleTester } from 'vite-plus/lint/plugins-dev'
import { describe, it } from 'vite-plus/test'
import theme from './theme-color.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'tsx' } },
})

tester.run('theme/raw-color', theme.rules['raw-color'], {
  valid: [
    "const meta = { name: 'theme-color', content: 'var(--color-ground)' }",
    '<p className="text-ink bg-surface" />',
    // Anchors and ids are not colors.
    '<a href="#pedir">Pedir</a>',
    '<a href="#filmes-da-sessao">ver os filmes</a>',
    "const id = '#pergunta-2'",
    // The HTML entity is not a color.
    "const s = '&#123;'",
  ],
  invalid: [
    {
      code: "const meta = { name: 'theme-color', content: '#eef1f4' }",
      errors: [{ messageId: 'raw' }],
    },
    {
      code: '<p style={{ color: "#121417" }} />',
      errors: [{ messageId: 'raw' }],
    },
    {
      code: "const background = 'rgba(18, 20, 23, 0.62)'",
      errors: [{ messageId: 'raw' }],
    },
    {
      code: 'const f = `color-mix(in srgb, ${a} 30%, transparent)`',
      errors: [{ messageId: 'raw' }],
    },
    {
      code: "const c = '#FFF'",
      errors: [{ messageId: 'raw' }],
    },
  ],
})
