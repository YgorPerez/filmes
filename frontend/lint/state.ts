// The Oxlint `state` plugin, from pesquisa-relacionamentos'
// `frontend/lint/state.ts`. There the owner is `stored()`; here it is
// `openStorage()` (`src/ui/billboard-marks.ts`).
//
// `localstorage-through-open-storage`: localStorage only goes through
// `openStorage()`, which tries it before handing it over and gives `null`
// when the browser blocks it (a private window, the T3 Code frame, where the
// Cartaz has no localStorage). Whoever reads it directly throws there, and
// the Cartaz stops instead of just not keeping the marks.

import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

/** The names of the global object in the browser and in Node. */
const GLOBALS = new Set(['window', 'globalThis', 'self'])

const localstorageThroughOpenStorage = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'localStorage only goes through `openStorage()`.',
    },
    messages: {
      throughOpenStorage:
        'Use `openStorage()` from `#/ui/billboard-marks.ts`: it gives `null` where the browser blocks localStorage (the T3 Code frame).',
    },
    schema: [],
  },
  create(context) {
    return {
      // The bare `localStorage` that is not a variable of the file: the
      // global.
      'Program:exit'(program) {
        const scope = context.sourceCode.getScope(program)
        for (const reference of scope.through) {
          if (reference.identifier.name === 'localStorage') {
            context.report({
              node: reference.identifier,
              messageId: 'throughOpenStorage',
            })
          }
        }
      },
      // `window.localStorage` and the other names of the global.
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          GLOBALS.has(node.object.name) &&
          !node.computed &&
          node.property.type === 'Identifier' &&
          node.property.name === 'localStorage'
        ) {
          context.report({ node, messageId: 'throughOpenStorage' })
        }
      },
    }
  },
})

export default definePlugin({
  meta: { name: 'state' },
  rules: {
    'localstorage-through-open-storage': localstorageThroughOpenStorage,
  },
})
