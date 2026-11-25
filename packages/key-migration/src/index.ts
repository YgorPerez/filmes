// The PT → EN key migration of filmes-dados and `config/` (ADR 0002), and the
// tables it reads. The build migrates `config/` and a filmes-dados checkout
// still in Portuguese, the engine's tests the fixture; the tables name the
// engine's results (`output`) after the old CLI's.

export {
  migrateConfig,
  migrateConfigFile,
  migrateData,
  migrateDataFile,
  migrateDataPath,
  roundTrip,
  type Direction,
  type FileResult,
  type RoundTrip,
} from './migrate.ts'
export { outputToEnglish, outputToPortuguese, renameValue } from './output.ts'
export { MigrationError } from './error.ts'
export * as config from './tables/config.ts'
export * as data from './tables/data.ts'
export * as output from './tables/output.ts'
