// The exact decimal value of a double, and rounding it half to even. Python
// rounds and formats on the exact binary value (`round(0.125, 2)` is 0.12,
// `f"{1.25:.1f}"` is "1.2"); JavaScript's `toFixed` rounds the tie up.

/** |x| as `digits × 10^exponent`, exactly, for a finite x. */
export const exactDecimal = (
  x: number,
): { readonly digits: bigint; readonly exponent: number } => {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, x)
  const bits = view.getBigUint64(0)
  const biased = Number((bits >> 52n) & 0x7ffn)
  const fraction = bits & 0xf_ffff_ffff_ffffn
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n)
  const power = biased === 0 ? -1074 : biased - 1075
  // m × 2^-k is m × 5^k / 10^k.
  return power >= 0
    ? { digits: mantissa << BigInt(power), exponent: 0 }
    : { digits: mantissa * 5n ** BigInt(-power), exponent: power }
}

/** `digits × 10^exponent` rounded to an integer, half to even. */
export const roundHalfEven = (digits: bigint, exponent: number): bigint => {
  if (exponent >= 0) return digits * 10n ** BigInt(exponent)
  const unit = 10n ** BigInt(-exponent)
  const quotient = digits / unit
  const twice = (digits % unit) * 2n
  if (twice > unit || (twice === unit && quotient % 2n === 1n)) {
    return quotient + 1n
  }
  return quotient
}

/** Whether the sign bit is set: true for -0 and for every negative. */
export const negative = (x: number): boolean => x < 0 || Object.is(x, -0)

/** The shortest digits that read back as |x| (no trailing zeros), and where
 * the point goes: |x| is `0.digits × 10^point`. Python's `repr` and
 * JavaScript's `String` pick the same digits; only the layout differs. */
export const shortestDigits = (
  x: number,
): { readonly digits: string; readonly point: number } => {
  if (x === 0) return { digits: '0', point: 1 }
  const [mantissa = '', exponent = '0'] = Math.abs(x).toExponential().split('e')
  return {
    digits: mantissa.replace('.', ''),
    point: Number(exponent) + 1,
  }
}

/** Python's exponent: a sign and at least two digits ("e+06", "e-300"). */
export const pyExponent = (exponent: number): string =>
  `e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`
