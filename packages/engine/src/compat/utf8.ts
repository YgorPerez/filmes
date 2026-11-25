// Python's UTF-8 decoding of bytes: the same text as `TextDecoder`, and on a
// malformed sequence the message of Python's `UnicodeDecodeError`, which
// the import shows (`'utf-8' codec can't decode byte 0xff in position 2:
// invalid start byte`).

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** The bytes a lead byte accepts right after it, and how many continuation
 * bytes follow it in all. */
const lead = (byte: number): readonly [number, number, number] | null => {
  if (byte >= 0xc2 && byte <= 0xdf) return [0x80, 0xbf, 1]
  if (byte === 0xe0) return [0xa0, 0xbf, 2]
  if (byte === 0xed) return [0x80, 0x9f, 2]
  if (byte >= 0xe1 && byte <= 0xef) return [0x80, 0xbf, 2]
  if (byte === 0xf0) return [0x90, 0xbf, 3]
  if (byte === 0xf4) return [0x80, 0x8f, 3]
  if (byte >= 0xf1 && byte <= 0xf3) return [0x80, 0xbf, 3]
  return null
}

const hex = (byte: number) => `0x${byte.toString(16).padStart(2, '0')}`

/** The first malformed sequence, as Python reports it. */
const firstError = (bytes: Uint8Array): string => {
  let at = 0
  while (at < bytes.length) {
    const byte = bytes[at] ?? 0
    if (byte < 0x80) {
      at += 1
      continue
    }
    const expected = lead(byte)
    let reason = 'invalid start byte'
    let end = at + 1
    if (expected !== null) {
      const [low, high, count] = expected
      let next = at + 1
      let ok = true
      for (let i = 0; i < count; i++, next++) {
        if (next >= bytes.length) {
          reason = 'unexpected end of data'
          ok = false
          break
        }
        const cont = bytes[next] ?? 0
        const [min, max] = i === 0 ? [low, high] : [0x80, 0xbf]
        if (cont < min || cont > max) {
          reason = 'invalid continuation byte'
          ok = false
          break
        }
      }
      if (ok) {
        at = next
        continue
      }
      end = next
    }
    return end - at === 1
      ? `'utf-8' codec can't decode byte ${hex(byte)} in position ${at}: ${reason}`
      : `'utf-8' codec can't decode bytes in position ${at}-${end - 1}: ${reason}`
  }
  return "'utf-8' codec can't decode"
}

export type Decoded =
  | { readonly text: string; readonly error?: undefined }
  | { readonly error: string }

/** `bytes.decode('utf-8')`, or with `sig` `bytes.decode('utf-8-sig')`
 * (a leading BOM is dropped, and positions count after it). */
export const pyDecodeUtf8 = (bytes: Uint8Array, sig = false): Decoded => {
  const body =
    sig && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes
  try {
    return { text: decoder.decode(body) }
  } catch {
    return { error: firstError(body) }
  }
}
