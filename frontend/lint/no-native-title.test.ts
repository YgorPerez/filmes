import { RuleTester } from 'vite-plus/lint/plugins-dev'
import { describe, it } from 'vite-plus/test'
import html from './no-native-title.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'tsx' } },
})

tester.run('html/no-native-title', html.rules['no-native-title'], {
  valid: [
    // A component prop.
    '<PageHead title="Sessões" />',
    '<Page.Section title="x" />',
    // The embedded content's accessible name.
    '<iframe title="O trailer" src="/t" />',
    // The SVG <title> element is not an attribute.
    '<svg><title>Seta</title></svg>',
    '<span aria-label="nota">?</span>',
  ],
  invalid: [
    {
      code: '<span title="nota prevista">8</span>',
      errors: [{ messageId: 'onTouch' }],
    },
    {
      code: '<abbr title="Internet Movie Database">IMDb</abbr>',
      errors: [{ messageId: 'onTouch' }],
    },
  ],
})
