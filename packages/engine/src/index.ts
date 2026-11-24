// The engine in TypeScript, with Effect v4 throughout (map #72). The Python
// engine (`filmes/`) still answers the CLI and the MCP until the port is done.

export * from './compat/index.ts'
export {
  contribution,
  evidenceToJson,
  makeEvidence,
  requestLine,
  withoutFact,
  type Evidence,
  type EvidenceJson,
} from './evidence/Evidence.ts'
export * from './evidence/ruler.ts'
export {
  KINDS,
  STRENGTHS,
  type Kind,
  type Level,
  type Link,
  type Strength,
} from './evidence/strength.ts'
export * from './evidence/wording.ts'
export { resolveAttendees } from './recommendation/attendees.ts'
export {
  chooseCandidates,
  prepareSelection,
  type Candidate,
  type CandidateSelection,
} from './recommendation/candidates.ts'
export {
  DEFAULT_RULE,
  NEUTRAL_UTILITY,
  RULE_NAMES,
  ruleKey,
  ruleToJson,
  usesCredit,
  type Rule,
  type RuleName,
} from './recommendation/rule.ts'
export { individualUtility } from './recommendation/utility.ts'
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
  SOURCE_KEY_VARIABLES,
  type ConfigName,
  type EnvironmentShape,
  type PathName,
  type SourceKeyVariable,
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
export {
  DDD_ATTRIBUTION,
  DDD_NAME,
  DoesTheDogDie,
  findTopic,
  type Topic,
  type Topics,
} from './sources/DoesTheDogDie.ts'
export { OMDB_NAME, Omdb, type AgeRating } from './sources/Omdb.ts'
export {
  Fetch,
  SourceFailure,
  Transport,
  type SourceProfile,
} from './sources/Source.ts'
export { SourceCache, type CachedAnswer } from './sources/SourceCache.ts'
export { TMDB_ATTRIBUTION, TMDB_NAME, Tmdb, type Card } from './sources/Tmdb.ts'
