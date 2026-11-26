// The Oxlint `screens` plugin, from pesquisa-relacionamentos'
// `frontend/lint/no-vi-waitfor-in-screens.ts`.
//
// `no-vi-waitfor-in-screens`: in a screen test, the wait is Testing
// Library's. Its `waitFor` and `findBy*` run each try inside `act()`, so the
// effects and state updates React scheduled land before the next check, and
// `configure({ asyncUtilTimeout })` sets their limit for every test at once.
// Vitest's `vi.waitFor` knows nothing of React: it checks between renders
// and gives up after 1 s, whatever the test file asked of Testing Library.
// Turned on only in `*.test.tsx`.
import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

const noViWaitFor = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'No `vi.waitFor` in screen tests.' },
    messages: {
      shortWait:
        'In a screen test, wait with `waitFor` or `findBy*` from @testing-library/react, which retry inside `act()`; `vi.waitFor` does not, and gives up after 1 s.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'vi' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'waitFor'
        )
          context.report({ node, messageId: 'shortWait' })
      },
    }
  },
})

export default definePlugin({
  meta: { name: 'screens' },
  rules: { 'no-vi-waitfor-in-screens': noViWaitFor },
})
