import { describe, expect, it } from 'vite-plus/test'
import { countInGrep, findDirective, judge, readDiff } from './suppressions.ts'

// The directives are assembled in pieces: written whole, this file would be
// read as a suppression by the auditor itself (and by Oxlint).
const OX = 'oxlint' + '-disable'
const TS = '@ts-' + 'expect-error'
const MEMO = "'use no " + "memo'"
const NOQA = '# no' + 'qa'

describe('findDirective', () => {
  it('finds the directive that opens a comment and says whether it has a reason', () => {
    expect(
      findDirective(`  // ${OX}-next-line no-console -- the CLI log`),
    ).toEqual({
      name: 'oxlint-disable',
      hasReason: true,
    })
    expect(findDirective(`/* ${OX} no-console */`)).toEqual({
      name: 'oxlint-disable',
      hasReason: false,
    })
    expect(findDirective(`  // ${TS} the package type is wrong`)).toEqual({
      name: '@ts-expect-error',
      hasReason: true,
    })
    expect(findDirective(`  // ${TS}`)).toEqual({
      name: '@ts-expect-error',
      hasReason: false,
    })
  })

  it('`use no memo` wants the reason in a comment on the same line', () => {
    expect(
      findDirective(`  ${MEMO} // the compiler breaks the effect`),
    ).toEqual({
      name: 'use no memo',
      hasReason: true,
    })
    expect(findDirective(`  ${MEMO}`)).toEqual({
      name: 'use no memo',
      hasReason: false,
    })
  })

  it('a directive quoted mid-sentence turns nothing off', () => {
    expect(findDirective(`const text = 'use ${OX} with a reason'`)).toBeNull()
    expect(findDirective('// nothing here')).toBeNull()
  })
})

const diff = (file: string, ...lines: string[]) =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,0 +10,3 @@',
    ...lines,
  ].join('\n')

describe('readDiff', () => {
  it('splits the new ones with and without a reason, with the line of each', () => {
    const read = readDiff(
      diff(
        'frontend/src/ui/profile.tsx',
        '+const a = 1',
        `+// ${OX}-next-line no-alert -- the alert is the screen`,
        `+// ${TS}`,
      ),
    )
    expect(read.withReason).toEqual([
      expect.objectContaining({
        file: 'frontend/src/ui/profile.tsx',
        line: 11,
        name: 'oxlint-disable',
      }),
    ])
    expect(read.withoutReason).toEqual([
      expect.objectContaining({ line: 12, name: '@ts-expect-error' }),
    ])
  })

  it('does not read documentation, vendored code or the auditor itself', () => {
    const read = readDiff(
      [
        diff('docs/agents/integration.md', `+// ${OX}`),
        diff('.agents/skills/x/a.ts', `+// ${OX}`),
        diff('.github/scripts/suppressions.test.ts', `+// ${OX}`),
      ].join('\n'),
    )
    expect(read.withoutReason).toEqual([])
  })

  it('lists each changed auditor configuration', () => {
    const read = readDiff(
      [
        diff('frontend/doctor.config.ts', '+      files: ["x"],'),
        diff('frontend/package.json', '+    "react": "^19.4.0",'),
        diff(
          'packages/rules/package.json',
          '+    "fallow": "fallow health --min-score 50",',
        ),
        diff('.github/suppression-ceiling.json', '+    "fallow-ignore": 1,'),
      ].join('\n'),
    )
    expect([...read.configuration.keys()]).toEqual([
      'frontend/doctor.config.ts',
      'packages/rules/package.json',
      '.github/suppression-ceiling.json',
    ])
  })
  it('a deleted auditor configuration is listed too', () => {
    const read = readDiff(
      [
        'diff --git a/frontend/.fallowrc.jsonc b/frontend/.fallowrc.jsonc',
        '--- a/frontend/.fallowrc.jsonc',
        '+++ /dev/null',
        '@@ -1,1 +0,0 @@',
        '-{ "ignore": [] }',
      ].join('\n'),
    )
    expect([...read.configuration.keys()]).toEqual(['frontend/.fallowrc.jsonc'])
  })
})

describe('countInGrep', () => {
  it('counts each directive in the tree, from the `git grep` output', () => {
    const output = [
      `abc:frontend/src/ui/a.tsx:3:// ${OX}-next-line x -- reason`,
      `abc:frontend/src/ui/b.tsx:9:  // ${OX} y -- reason`,
      `abc:frontend/src/ui/b.tsx:20:const t = "text that quotes ${OX}"`,
      `abc:packages/content/src/c.ts:1:// ${TS} reason`,
      `abc:frontend/src/routeTree.gen.ts:3:// @ts-${'nocheck'}`,
      `abc:docs/x.md:1:// ${OX}`,
    ].join('\n')
    expect(countInGrep(output)).toEqual({
      'oxlint-disable': 2,
      '@ts-expect-error': 1,
    })
  })
})

describe('# noqa in Python', () => {
  it('is counted in .py files and wants the reason after the codes', () => {
    expect(
      findDirective(`x = 1  ${NOQA}: E501 -- the URL is one token`),
    ).toEqual({ name: '# noqa', hasReason: true })
    expect(findDirective(`import os  ${NOQA}: F401`)).toEqual({
      name: '# noqa',
      hasReason: false,
    })
    expect(findDirective(`x = 1  ${NOQA}`)).toEqual({
      name: '# noqa',
      hasReason: false,
    })
    expect(
      countInGrep(
        [
          `abc:filmes/cli.py:3:import os  ${NOQA}: F401 -- re-exported`,
          `abc:docs/x.md:1:${NOQA}`,
        ].join('\n'),
      ),
    ).toEqual({ '# noqa': 1 })
    expect(
      readDiff(diff('filmes/cli.py', `+import os  ${NOQA}: F401`))
        .withoutReason,
    ).toEqual([
      expect.objectContaining({ file: 'filmes/cli.py', name: '# noqa' }),
    ])
  })
})

describe('judge', () => {
  const nothing = {
    withoutReason: [],
    withReason: [],
    configuration: new Map<string, string[]>(),
  }
  const finding = {
    file: 'frontend/src/ui/a.tsx',
    line: 3,
    name: 'oxlint-disable',
    text: '// …',
  }

  it('with nothing new and at the ceiling, passes', () => {
    const { passes } = judge({
      ...nothing,
      count: {},
      ceiling: {},
    })
    expect(passes).toBe(true)
  })

  it('above the ceiling fails', () => {
    const { passes, lines } = judge({
      ...nothing,
      withReason: [finding],
      count: { 'oxlint-disable': 1 },
      ceiling: { 'oxlint-disable': 0 },
    })
    expect(passes).toBe(false)
    expect(lines.join('\n')).toContain(
      'oxlint-disable: 1, and the ceiling is 0',
    )
  })

  it('without a reason always fails', () => {
    const { passes } = judge({
      ...nothing,
      withoutReason: [finding],
      count: { 'oxlint-disable': 1 },
      ceiling: { 'oxlint-disable': 1 },
    })
    expect(passes).toBe(false)
  })

  it('with a reason and at the ceiling, passes and lists it', () => {
    const { passes, lines } = judge({
      ...nothing,
      withReason: [finding],
      count: { 'oxlint-disable': 1 },
      ceiling: { 'oxlint-disable': 1 },
    })
    expect(passes).toBe(true)
    expect(lines.join('\n')).toContain('### New suppressions')
  })

  it('below the ceiling passes and asks to lower it', () => {
    const { passes, lines } = judge({
      ...nothing,
      count: {},
      ceiling: { '@ts-expect-error': 2 },
    })
    expect(passes).toBe(true)
    expect(lines.join('\n')).toContain('lower in')
  })
})
