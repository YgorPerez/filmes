// The Cartaz as an MCP Apps view: the `ui://` resource and the tool that
// links to it, as a host sees them. The view's own behaviour (the bundle in
// jsdom) is tested where it is built, `frontend/scripts/billboard-view.test.ts`.

import assert from 'node:assert/strict'
import {
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} from '@modelcontextprotocol/ext-apps/server'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { BILLBOARD_VIEW_URI } from '../src/billboard-view.ts'
import { connect } from './connect.ts'

describe('the Cartaz view', () => {
  test('is a ui:// resource: one HTML file, posters from the TMDB only', async () => {
    const { client } = await connect(useFixture())

    const { resources } = await client.listResources()
    const listed = resources.find((r) => r.uri === BILLBOARD_VIEW_URI)
    const { contents } = await client.readResource({ uri: BILLBOARD_VIEW_URI })

    assert.equal(listed?.mimeType, RESOURCE_MIME_TYPE)
    assert.equal(contents.length, 1)
    const [view] = contents
    assert.equal(view?.mimeType, 'text/html;profile=mcp-app')
    assert.ok(view && 'text' in view)
    assert.match(view.text, /^<!doctype html>/u)
    assert.match(view.text, /<script>/u)
    assert.match(view.text, /<style>/u)
    assert.deepEqual(view._meta, {
      ui: { csp: { resourceDomains: ['https://image.tmdb.org'] } },
    })
  })

  test("served by the app, it loads the fonts from the app's origin", async () => {
    const origin = 'https://cinema.example'
    const { client } = await connect(
      useFixture(),
      null,
      {},
      {
        appOrigin: origin,
      },
    )

    const { contents } = await client.readResource({ uri: BILLBOARD_VIEW_URI })

    const [view] = contents
    assert.ok(view && 'text' in view)
    const links = view.text.match(/<link [^>]+>/gu)
    assert.deepEqual(links, [
      `<link rel="stylesheet" href="${origin}/fonts/fonts.css">`,
    ])
    assert.ok(
      view.text.indexOf(links[0]) < view.text.indexOf('</head>'),
      'in the head',
    )
    assert.deepEqual(view._meta, {
      ui: { csp: { resourceDomains: ['https://image.tmdb.org', origin] } },
    })
  })

  test('billboard links its result to the view; the others do not', async () => {
    const { client } = await connect(useFixture())

    const { tools } = await client.listTools()
    const linked = Object.fromEntries(
      tools.map((t) => [t.name, t._meta?.ui ?? null]),
    )

    assert.deepEqual(linked.billboard, { resourceUri: BILLBOARD_VIEW_URI })
    const billboard = tools.find((t) => t.name === 'billboard')
    assert.equal(billboard?._meta?.[RESOURCE_URI_META_KEY], BILLBOARD_VIEW_URI)
    for (const name of ['recommend', 'answer_billboard', 'verify_answer'])
      assert.equal(linked[name], null, name)
  })

  test("the view can answer: the result it shows carries the Cartaz, and Enviar's call records", async () => {
    const { ok, client } = await connect(useFixture())
    const { session } = await ok('recommend', { attendees: ['dono'] })

    const shown = await ok('billboard', { session: session.id })
    const [first] = shown.billboard.films
    const answer = await client.callTool({
      name: 'answer_billboard',
      arguments: {
        session: session.id,
        text: `#cartaz ${session.id} v${shown.billboard.version}\n1 ${first.id} · trocar\n`,
      },
    })

    assert.equal(shown.billboard.open, true)
    assert.ok(!answer.isError)
  })
})
