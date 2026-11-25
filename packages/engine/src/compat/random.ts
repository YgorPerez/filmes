// Python's `random.Random(seed)` as far as `avaliar` uses it: the MT19937
// generator seeded from an int (`init_by_array` over the int's 32-bit
// words, as CPython's `random_seed`), `getrandbits`, `_randbelow` and
// CPython 3.12's `sample`. The MovieLens sample of the evaluation is
// `Random(27).sample(sorted(ids), 1000)`, so the same seed draws the same
// users in both engines (risk R11 of #76).

const N = 624
const M = 397
const MATRIX_A = 0x9908b0df
const UPPER_MASK = 0x80000000
const LOWER_MASK = 0x7fffffff

export class PyRandom {
  private readonly state = new Uint32Array(N)
  private index = N + 1

  /** `Random(seed)` for a non-negative or negative int (its absolute value
   * is used, as CPython does). */
  constructor(seed: number | bigint) {
    let rest = BigInt(seed)
    if (rest < 0n) rest = -rest
    const key: number[] = []
    do {
      key.push(Number(rest & 0xffffffffn))
      rest >>= 32n
    } while (rest > 0n)
    this.initByArray(key)
  }

  private initGenrand(seed: number) {
    const mt = this.state
    mt[0] = seed >>> 0
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30)
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
    this.index = N
  }

  private initByArray(key: readonly number[]) {
    const mt = this.state
    this.initGenrand(19650218)
    let i = 1
    let j = 0
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30)
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1664525)) + key[j]! + j) >>> 0
      i++
      j++
      if (i >= N) {
        mt[0] = mt[N - 1]!
        i = 1
      }
      if (j >= key.length) j = 0
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30)
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1566083941)) - i) >>> 0
      i++
      if (i >= N) {
        mt[0] = mt[N - 1]!
        i = 1
      }
    }
    mt[0] = 0x80000000
  }

  /** `genrand_uint32`. */
  private next(): number {
    const mt = this.state
    if (this.index >= N) {
      let kk = 0
      for (; kk < N - M; kk++) {
        const y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK)
        mt[kk] = mt[kk + M]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK)
        mt[kk] = mt[kk + (M - N)]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      const y = (mt[N - 1]! & UPPER_MASK) | (mt[0]! & LOWER_MASK)
      mt[N - 1] = mt[M - 1]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      this.index = 0
    }
    let y = mt[this.index++]!
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** `getrandbits(k)` for 0 ≤ k ≤ 32 (the only sizes the engine needs). */
  getrandbits(k: number): number {
    if (!Number.isInteger(k) || k < 0 || k > 32)
      throw new RangeError(`getrandbits(${k}) is limited to 32 bits here`)
    if (k === 0) return 0
    return this.next() >>> (32 - k)
  }

  /** `_randbelow_with_getrandbits(n)`: a uniform int in [0, n). */
  randbelow(n: number): number {
    if (n === 0) return 0
    const k = 32 - Math.clz32(n)
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  /** `sample(population, k)` of CPython 3.12: the same picks, in the same
   * order. */
  sample<A>(population: readonly A[], k: number): A[] {
    const n = population.length
    if (!(k >= 0 && k <= n))
      throw new RangeError(
        'ValueError: Sample larger than population or is negative',
      )
    const result: A[] = []
    let setsize = 21
    if (k > 5) setsize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4))
    if (n <= setsize) {
      const pool = [...population]
      for (let i = 0; i < k; i++) {
        const j = this.randbelow(n - i)
        result.push(pool[j]!)
        pool[j] = pool[n - i - 1]!
      }
    } else {
      const selected = new Set<number>()
      for (let i = 0; i < k; i++) {
        let j = this.randbelow(n)
        while (selected.has(j)) j = this.randbelow(n)
        selected.add(j)
        result.push(population[j]!)
      }
    }
    return result
  }
}
