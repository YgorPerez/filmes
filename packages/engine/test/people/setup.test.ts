// The Guia de início [setup guide] of the home (#143, map #140): which of
// its steps a Dono has done, and the steps she skipped, kept in her file
// (`skipped_setup:`) so the skip holds on every device.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  readPerson,
  savePerson,
  setupGuide,
  skipSetupStep,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const file = (fixture: Fixture, slug: string) =>
  join(fixture.data, 'people', `${slug}.md`)

const VERA = { owner: 'vera' }

const stepsOf = (guide: {
  steps: readonly { step: string; done: boolean; skipped: boolean }[]
}) => Object.fromEntries(guide.steps.map((s) => [s.step, s]))

describe('the steps a Dono skipped', () => {
  test('are read from skipped_setup and written back after imports', async () => {
    const fixture = useFixture()
    const text = readFileSync(file(fixture, 'vera'), 'utf8')
    writeFileSync(
      file(fixture, 'vera'),
      text.replace('---\n', '---\nskipped_setup: [connector, import]\n'),
    )

    const vera = await fixture.ok(readPerson(file(fixture, 'vera')))
    expect(vera.skippedSetup).toEqual(['connector', 'import'])

    await fixture.ok(savePerson(vera))
    const written = readFileSync(file(fixture, 'vera'), 'utf8')
    expect(written).toContain(
      'imports: []\nskipped_setup: [connector, import]\n',
    )
    expect(await fixture.ok(readPerson(file(fixture, 'vera')))).toEqual(vera)
  })

  test('an unknown step in the file is invalid data', async () => {
    const fixture = useFixture()
    const text = readFileSync(file(fixture, 'vera'), 'utf8')
    writeFileSync(
      file(fixture, 'vera'),
      text.replace('---\n', '---\nskipped_setup: [tour]\n'),
    )

    const outcome = await fixture.run(readPerson(file(fixture, 'vera')))
    expect(outcome).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'invalid_data' } },
    })
  })

  test('a Pessoa who skipped nothing has no skipped_setup key', async () => {
    const fixture = useFixture()
    const bruno = await fixture.ok(readPerson(file(fixture, 'bruno')))
    expect(bruno.skippedSetup).toEqual([])
    await fixture.ok(savePerson(bruno))
    expect(readFileSync(file(fixture, 'bruno'), 'utf8')).not.toContain(
      'skipped_setup',
    )
  })
})

describe('the setup guide', () => {
  test('Meu gosto is done with 10 Notas; the connector comes from the caller', async () => {
    const fixture = useFixture()

    const bruno = await fixture.ok(
      setupGuide({ person: 'bruno', connected: true }),
    )

    expect(bruno.person).toBe('bruno')
    expect(bruno.steps.map((s) => s.step)).toEqual([
      'taste',
      'import',
      'connector',
    ])
    expect(stepsOf(bruno)).toEqual({
      taste: { step: 'taste', done: true, skipped: false },
      import: { step: 'import', done: false, skipped: false },
      connector: { step: 'connector', done: true, skipped: false },
    })
    expect(bruno.complete).toBe(false)
    // The home counts them toward the 10 of Meu gosto.
    expect(bruno.ratings).toBeGreaterThanOrEqual(10)
  })

  test('a Dono with no Notas and no import has every step pending', async () => {
    const fixture = useFixture()

    const vera = await fixture.ok(
      setupGuide({ person: 'dono', connected: false }),
      {},
      VERA,
    )

    expect(vera.person).toBe('vera')
    expect(vera.steps.every((s) => !s.done && !s.skipped)).toBe(true)
    expect(vera.complete).toBe(false)
    expect(vera.ratings).toBe(0)
  })
})

describe('the setup guide', () => {
  test('one import does both Meu gosto and the import', async () => {
    const fixture = useFixture()
    const text = readFileSync(file(fixture, 'vera'), 'utf8')
    writeFileSync(
      file(fixture, 'vera'),
      text.replace(
        'imports: []',
        'imports:\n- {kind: trakt, file: imports/vera/trakt-1.zip, date: 2026-11-20}',
      ),
    )

    const vera = await fixture.ok(
      setupGuide({ person: 'vera', connected: true }),
    )

    expect(vera.steps.every((s) => s.done)).toBe(true)
    expect(vera.complete).toBe(true)
  })

  test('with no database, the Notas count as none', async () => {
    const fixture = useFixture()

    const bruno = await fixture.ok(
      setupGuide({ person: 'bruno', connected: false }),
      { FILMES_BANCO: join(fixture.root, 'missing.sqlite') },
    )

    expect(stepsOf(bruno).taste?.done).toBe(false)
    expect(bruno.ratings).toBe(0)
  })
})

describe('skipping a step', () => {
  test('keeps it in her file, and the guide counts it as out of the way', async () => {
    const fixture = useFixture()

    const skipped = await fixture.ok(
      skipSetupStep({ person: 'dono', step: 'import' }),
      {},
      VERA,
    )

    expect(skipped).toEqual({ person: 'vera', step: 'import', new: true })
    expect(readFileSync(file(fixture, 'vera'), 'utf8')).toContain(
      'skipped_setup: [import]',
    )
    const guide = await fixture.ok(
      setupGuide({ person: 'vera', connected: false }),
    )
    expect(stepsOf(guide).import).toEqual({
      step: 'import',
      done: false,
      skipped: true,
    })
  })

  test('twice is the same, and every step skipped completes the guide', async () => {
    const fixture = useFixture()
    for (const step of ['taste', 'import', 'connector'] as const)
      await fixture.ok(skipSetupStep({ person: 'vera', step }))

    const again = await fixture.ok(
      skipSetupStep({ person: 'vera', step: 'taste' }),
    )

    expect(again.new).toBe(false)
    expect(readFileSync(file(fixture, 'vera'), 'utf8')).toContain(
      'skipped_setup: [taste, import, connector]',
    )
    const guide = await fixture.ok(
      setupGuide({ person: 'vera', connected: false }),
    )
    expect(guide.complete).toBe(true)
  })
})
