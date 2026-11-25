// The catalog's files as streams of text lines, a batch per chunk, so a
// dump of gigabytes never sits in memory whole: gzip as Python's
// `gzip.open(path, "rt", encoding="utf-8", newline="")`, any byte stream
// (a ZIP member) as `TextIOWrapper(..., encoding="utf-8", newline="")`.
// The steps consume the batches inside an Effect with `forEachBatch`.

import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { Effect } from 'effect'
import { LineSplitter } from './csv-stream.ts'

/** The decompressed bytes of a gzip file (every member, as Python's). */
export async function* gzipBytes(path: string): AsyncGenerator<Buffer> {
  const source = createReadStream(path, { highWaterMark: 1 << 20 })
  const gunzip = createGunzip({ chunkSize: 1 << 20 })
  source.on('error', (error) => gunzip.destroy(error))
  try {
    for await (const chunk of source.pipe(gunzip)) yield chunk as Buffer
  } finally {
    source.destroy()
    gunzip.destroy()
  }
}

/** UTF-8 text, a decoded chunk at a time; invalid UTF-8 throws, as
 * Python's strict decoding does. The BOM stays (`utf-8`, not `utf-8-sig`). */
export async function* utf8Text(
  bytes: AsyncIterable<Buffer>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  for await (const chunk of bytes) yield decoder.decode(chunk, { stream: true })
  const rest = decoder.decode()
  if (rest.length > 0) yield rest
}

/** The lines of a text stream (each with its line break), a batch per
 * chunk. */
export async function* lineBatches(
  text: AsyncIterable<string>,
): AsyncGenerator<string[]> {
  const splitter = new LineSplitter()
  for await (const chunk of text) {
    const lines = splitter.push(chunk)
    if (lines.length > 0) yield lines
  }
  const last = splitter.end()
  if (last.length > 0) yield last
}

/** Runs `use` on each batch of an async source, in order. A source that
 * throws is a defect (Python's uncaught exception: `internal`); the source
 * is closed on any exit. */
export const forEachBatch = <A, E, R>(
  source: AsyncIterable<A>,
  use: (batch: A) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E, R> =>
  Effect.suspend(() => {
    const iterator = source[Symbol.asyncIterator]()
    const loop: Effect.Effect<void, E, R> = Effect.gen(function* () {
      for (;;) {
        const next = yield* Effect.promise(() => iterator.next())
        if (next.done === true) return
        yield* use(next.value)
      }
    })
    return loop.pipe(
      Effect.ensuring(
        Effect.promise(async () => {
          await iterator.return?.()
        }),
      ),
    )
  })
