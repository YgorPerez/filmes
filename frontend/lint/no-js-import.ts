// The Oxlint `modules` plugin, from pesquisa-relacionamentos'
// `frontend/lint/no-js-import.ts`.
//
// `no-js-import`: a relative import names the file that exists, `./loop.ts`,
// and not `./loop.js`. The `.js` that points to a `.ts` only resolves through
// Vite or `tsc`; `node` alone, which runs the repo's scripts by stripping the
// types (`node scripts/verify-push.ts`), does not find it. It catches
// `import` and `export ... from`, `import()` and the `import('...')` type;
// it does not look at packages.

import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

const RELATIVE_JS = /^\.\.?\/.*\.jsx?$/

const noJsImport = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'A relative import names the `.ts` or the `.tsx`.' },
    messages: {
      js: 'Relative import with `.js`: name the real file, the `.ts` or the `.tsx`.',
    },
    schema: [],
  },
  create(context) {
    const check = (
      source: { type: string; value?: unknown } | null | undefined,
    ) =>
      source?.type === 'Literal' &&
      typeof source.value === 'string' &&
      RELATIVE_JS.test(source.value)
    return {
      ImportDeclaration(node) {
        if (check(node.source))
          context.report({ node: node.source, messageId: 'js' })
      },
      ExportNamedDeclaration(node) {
        if (node.source && check(node.source))
          context.report({ node: node.source, messageId: 'js' })
      },
      ExportAllDeclaration(node) {
        if (check(node.source))
          context.report({ node: node.source, messageId: 'js' })
      },
      ImportExpression(node) {
        if (check(node.source))
          context.report({ node: node.source, messageId: 'js' })
      },
      TSImportType(node) {
        // The type's `import('./x.js')`. Oxlint gives the source in
        // `source`; the old TS-ESTree, in a literal type in `argument`.
        const { source, argument } = node as unknown as {
          source?: { type: string; value?: unknown }
          argument?: {
            type: string
            literal?: { type: string; value?: unknown }
          }
        }
        const literal = source ?? argument?.literal
        if (literal && check(literal)) context.report({ node, messageId: 'js' })
      },
    }
  },
})

export default definePlugin({
  meta: { name: 'modules' },
  rules: { 'no-js-import': noJsImport },
})
