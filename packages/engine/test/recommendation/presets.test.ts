// Programas (#402): `presets.toml` read and checked, and the Leitura do
// pedido reading a Programa's name into its Climas and Restrições. The
// cases write their own `presets.toml`, so the shipped one can change.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import { ADDITION_FIELDS, readPresets, readRequest } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const PRESETS = `
["Noite com as crianças"]
moods = ["Leve", "pra rir"]
no_moods = ["assustador"]
child = 0
no_sad = true
max_duration = 110

[Encontro]
moods = ["romântico"]
unseen = true
since = 1990
language = "fr"
no_slow = true
`

const useFixtureWithPresets = (toml = PRESETS): Fixture => {
  const fixture = useFixture()
  writeFileSync(join(fixture.config, 'presets.toml'), toml)
  return fixture
}

describe('presets.toml', () => {
  test('the shipped file reads', async () => {
    const presets = await useFixture().ok(readPresets)

    expect(presets.length).toBeGreaterThan(0)
  })

  test('each Programa in the file order, its Climas as moods.toml spells them', async () => {
    const presets = await useFixtureWithPresets().ok(readPresets)

    expect(presets).toEqual([
      {
        name: 'Noite com as crianças',
        fields: {
          moods: ['leve', 'pra rir'],
          noMoods: ['assustador'],
          child: 0,
          maxDuration: 110,
          noSad: true,
        },
      },
      {
        name: 'Encontro',
        fields: {
          moods: ['romântico'],
          since: 1990,
          language: 'fr',
          unseen: true,
          noSlow: true,
        },
      },
    ])
  })

  test.each([
    ['a Clima outside moods.toml', 'moods = ["alegre"]', "o Clima 'alegre'"],
    [
      'a Nada de um Clima outside moods.toml',
      'no_moods = ["alegre"]',
      "o Clima 'alegre'",
    ],
    ['a key it does not know', 'climas = ["leve"]', 'climas'],
    ['a Restrição that makes no sense', 'child = 30', '--crianca'],
    ['a value of the wrong kind', 'unseen = "sim"', 'unseen'],
  ])('%s is invalid_config', async (_, line, message) => {
    const fixture = useFixtureWithPresets(`[Encontro]\n${line}\n`)

    const outcome = await fixture.run(readPresets)

    expect(outcome).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'invalid_config' } },
    })
    expect(JSON.stringify(outcome.output)).toContain(
      "presets.toml ['Encontro']",
    )
    expect(JSON.stringify(outcome.output)).toContain(message)
  })
})

describe('the Leitura do pedido reads a Programa', () => {
  test('its name is its Climas and Restrições', async () => {
    const reading = await useFixtureWithPresets().ok(
      readRequest({ text: 'encontro com a Iara' }),
    )

    expect(reading.request).toEqual({
      moods: ['romântico'],
      since: 1990,
      language: 'fr',
      unseen: true,
      noSlow: true,
      attendees: ['iara'],
    })
    expect(reading.understood.map((i) => [i.field, i.words, i.label])).toEqual([
      ['preset', 'encontro', 'Programa: Encontro'],
      ['attendees', 'Iara', 'Presente: Iara'],
    ])
    expect(reading.notUnderstood).toEqual([])
  })

  test('a longer name wins over the words in it', async () => {
    const reading = await useFixtureWithPresets().ok(
      readRequest({ text: 'Noite com as criancas, pra rir' }),
    )

    expect(reading.understood.map((i) => i.field)).toEqual(['preset', 'moods'])
    expect(reading.request).toEqual({
      moods: ['leve', 'pra rir'],
      noMoods: ['assustador'],
      child: 0,
      maxDuration: 110,
      noSad: true,
    })
  })

  test('a Clima of its own joins the Programa’s', async () => {
    const reading = await useFixtureWithPresets().ok(
      readRequest({ text: 'encontro, algo tenso' }),
    )

    expect(reading.request.moods).toEqual(['romântico', 'tenso'])
  })

  test('the Cartaz’s Acrescentar reads it too', async () => {
    const reading = await useFixtureWithPresets().ok(
      readRequest({ text: 'encontro', fields: ADDITION_FIELDS }),
    )

    expect(reading.understood.map((i) => i.field)).toEqual(['preset'])
  })
})
