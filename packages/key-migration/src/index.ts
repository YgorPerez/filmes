// The PT → EN key migration of filmes-dados and `config/` (ADR 0002), and the
// tables it reads. The parity oracle imports `outputToEnglish` and the
// migration; the port tickets read the tables for their names. Deleted with
// the Python engine.

export {
  migrateConfig,
  migrateConfigFile,
  migrateData,
  migrateDataFile,
  roundTrip,
  type Direction,
  type FileResult,
  type RoundTrip,
} from './migrate.ts'
export { outputToEnglish, outputToPortuguese, renameValue } from './output.ts'
export { MigrationError } from './rewrite-yaml.ts'
export * as config from './tables/config.ts'
export * as data from './tables/data.ts'
export * as output from './tables/output.ts'
