// Python's `statistics.mean` of floats: the sum is exact (Fractions) and
// the quotient is rounded once, to the nearest double (ties to even), as
// `float(Fraction)` does. A plain `sum / n` rounds at every addition.

const bitLength = (n: bigint): number => (n === 0n ? 0 : n.toString(2).length)

/** A finite double as `mantissa × 2^exponent`, exactly. */
const toBinary = (x: number): { mantissa: bigint; exponent: number } => {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, x)
  const bits = view.getBigUint64(0)
  const sign = bits >> 63n ? -1n : 1n
  const biased = Number((bits >> 52n) & 0x7ffn)
  const fraction = bits & 0xf_ffff_ffff_ffffn
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n)
  return {
    mantissa: sign * mantissa,
    exponent: biased === 0 ? -1074 : biased - 1075,
  }
}

/** `num / den` rounded to the nearest double, ties to even (`den > 0`);
 * below the normal range, rounded at 2^-1074, as a subnormal. */
export const ratioToFloat = (num: bigint, den: bigint): number => {
  if (num === 0n) return 0
  const sign = num < 0n ? -1 : 1
  const n = num < 0n ? -num : num
  // Scale so the quotient has exactly 53 bits.
  let shift = 53 - (bitLength(n) - bitLength(den))
  let q = shift >= 0 ? (n << BigInt(shift)) / den : n / (den << BigInt(-shift))
  if (bitLength(q) > 53) shift -= 1
  const scaledNum = shift >= 0 ? n << BigInt(shift) : n
  const scaledDen = shift >= 0 ? den : den << BigInt(-shift)
  q = scaledNum / scaledDen
  const twice = (scaledNum % scaledDen) * 2n
  if (-shift < -1074) {
    // Below the normal range the last bit is 2^-1074.
    shift = 1074
    const below = n << BigInt(shift)
    q = below / den
    const rest = (below % den) * 2n
    if (rest > den || (rest === den && q % 2n === 1n)) q += 1n
    return sign * Number(q) * 2 ** -1074
  }
  if (twice > scaledDen || (twice === scaledDen && q % 2n === 1n)) q += 1n
  return sign * Number(q) * 2 ** -shift
}

/** `statistics.mean(values)` for a non-empty list of floats. */
export const pyMean = (values: readonly number[]): number => {
  if (values.length === 0)
    throw new RangeError(
      'StatisticsError: mean requires at least one data point',
    )
  if (values.some((v) => !Number.isFinite(v)))
    return values.reduce((a, b) => a + b, 0) / values.length
  const parts = values.map(toBinary)
  const low = Math.min(...parts.map((p) => p.exponent))
  const total = parts.reduce(
    (sum, p) => sum + (p.mantissa << BigInt(p.exponent - low)),
    0n,
  )
  // total × 2^low / n
  return low >= 0
    ? ratioToFloat(total << BigInt(low), BigInt(values.length))
    : ratioToFloat(total, BigInt(values.length) << BigInt(-low))
}
