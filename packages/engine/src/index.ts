// The engine in TypeScript, with Effect v4 throughout (map #72). The Python
// engine (`filmes/`) still answers the CLI and the MCP until the port is done.

export {
  engineLayer,
  errorOutcome,
  makeEngine,
  type Engine,
  type EngineServices,
  type ErrorOutput,
  type Outcome,
} from './runtime/Engine.ts'
export {
  ERROR_CODES,
  EngineError,
  engineError,
  type ErrorCode,
} from './runtime/EngineError.ts'
export {
  Environment,
  type ConfigName,
  type EnvironmentShape,
  type PathName,
  type Vars,
} from './runtime/Environment.ts'
export { Run } from './runtime/Run.ts'
export { TIME_ZONE, Today } from './runtime/Today.ts'
export { Weights } from './runtime/Weights.ts'
export {
  Sqlite,
  SqliteError,
  type Authorizer,
  type Connection,
  type ReadOptions,
  type Row,
  type RunResult,
} from './sqlite/Sqlite.ts'
