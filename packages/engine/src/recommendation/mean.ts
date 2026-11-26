export const mean = (values: ReadonlyArray<number>): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length
