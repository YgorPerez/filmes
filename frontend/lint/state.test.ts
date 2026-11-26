import { RuleTester } from 'vite-plus/lint/plugins-dev'
import { describe, it } from 'vite-plus/test'
import state from './state.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const rule = state.rules['localstorage-through-open-storage']

tester.run('state/localstorage-through-open-storage', rule, {
  valid: [
    "openStorage()?.getItem('filmes-cartaz:s1:v1')",
    "sessionStorage.setItem('filmes:visit', '1')",
    // A local name that only looks like the global is not localStorage.
    'const { localStorage } = options; localStorage.getItem("x")',
    'object.localStorage',
  ],
  invalid: [
    {
      code: "localStorage.getItem('filmes-cartaz:s1:v1')",
      errors: [{ messageId: 'throughOpenStorage' }],
    },
    {
      code: "window.localStorage.setItem('filmes-cartaz:s1:v1', '{}')",
      errors: [{ messageId: 'throughOpenStorage' }],
    },
    {
      code: 'globalThis.localStorage.clear()',
      errors: [{ messageId: 'throughOpenStorage' }],
    },
  ],
})
