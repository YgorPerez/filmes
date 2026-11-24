// The engine in TypeScript, with Effect v4 throughout (map #72). The Python
// engine (`filmes/`) still answers the CLI and the MCP until the port is done.

export * from './compat/index.ts'
export {
  consult,
  type ConsultResult,
  type ConsultValue,
} from './consult/consult.ts'
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
export { genreInPortuguese, WIKIDATA_GENRE } from './catalog/genres.ts'
export {
  EXPORT_FORMATS,
  exportRatings,
  IMDB_HEADER,
  imdbRating,
  type ExportFormat,
  type ExportResult,
} from './export/imdb.ts'
export { resolveAttendees } from './recommendation/attendees.ts'
export {
  attributionsOf,
  type Attribution,
} from './recommendation/attributions.ts'
export {
  chooseCandidates,
  prepareSelection,
  type Candidate,
  type CandidateSelection,
} from './recommendation/candidates.ts'
export {
  CONSTRAINT_ORDER,
  drop,
  makeConstraintSet,
  pass,
  type Constraint,
  type ConstraintContext,
  type ConstraintEffect,
  type ConstraintName,
  type ConstraintSet,
  type Drop,
  type Pass,
  type Verdict,
} from './recommendation/constraints.ts'
export {
  computeCredit,
  creditLine,
  type Credit,
} from './recommendation/credit.ts'
export {
  filmHeader,
  firstSentence,
  type FilmHeader,
} from './recommendation/header.ts'
export { readMoods, resolveMoods, type Mood } from './recommendation/moods.ts'
export {
  rank,
  recommend,
  type RankOptions,
  type Recommendation,
  type RecommendedFilm,
  type RecommendRequest,
} from './recommendation/recommend.ts'
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
export { SIGNALS } from './recommendation/signals/index.ts'
export type {
  Round,
  Signal,
  SignalEffect,
} from './recommendation/signals/Signal.ts'
export { individualUtility } from './recommendation/utility.ts'
export {
  applyVetoes,
  isTagGroup,
  markedByGroup,
  readTagGroups,
  type TagGroup,
  type VetoPath,
  type VetoReport,
} from './recommendation/vetoes.ts'
export { sessionOrder } from './sessions/order.ts'
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
export { num, numOrNull, text, textOrNull } from './sqlite/row.ts'
export {
  kindOf,
  levelOf,
  LINK_PREDICATE,
  linkOf,
  targetOf,
} from './sqlite/vocabulary.ts'
export {
  missingDatabase,
  Sqlite,
  SqliteError,
  type Authorizer,
  type Connection,
  type ReadOptions,
  type Row,
  type RunResult,
  type TypedStatement,
} from './sqlite/Sqlite.ts'
export {
  ALERT_AFTER_FAILURES,
  authorOf,
  DataWriter,
  type Author,
  type PushStatus,
  type WriteOptions,
} from './data/DataWriter.ts'
export { GitError } from './data/git.ts'
export {
  formatMarkdown,
  parseMarkdown,
  readMarkdown,
  writeMarkdown,
  type Markdown,
} from './data/markdown.ts'
export { formatRating, readRating, type ReadRating } from './data/rating.ts'
export {
  isMapping,
  isPyFloat,
  isPyInt,
  isSequence,
  parseYaml,
  pyIterate,
  pyReprValue,
  pyStrValue,
  pyTruthy,
  stringifyYaml,
  yamlToJson,
  YamlError,
  type YamlMapping,
  type YamlScalar,
  type YamlValue,
} from './data/yaml.ts'
export {
  addItem,
  items,
  LEVELS,
  LINKS,
  removeItem,
  sameQuestion,
  seenLine,
  skipQuestion,
  SKIPS_TO_DROP,
  STATEMENT_REACTIONS,
  statementLine,
  type Adjustment,
  type OpenQuestion,
  type Person,
  type Section,
  type SectionItem,
  type Seen,
  type Statement,
  type StatementReaction,
  type Veto,
} from './people/Person.ts'
export {
  createPerson,
  decodePerson,
  decodePersonSync,
  encodePerson,
  listPeople,
  peopleFolder,
  readPeople,
  readPerson,
  resolvePerson,
  savePerson,
  type NewPerson,
} from './people/people.ts'
export {
  adjustmentJson,
  openQuestionJson,
  personCreate,
  personReport,
  personSeen,
  personState,
  personView,
  savePersonAndSync,
  seenJson,
  statementJson,
  vetoJson,
  withPeopleDatabase,
  type AdjustmentJson,
  type NewPersonInput,
  type OpenQuestionJson,
  type PersonSummary,
  type PersonView,
  type RatingJson,
  type ReportResult,
  type SeenInput,
  type SeenJson,
  type SeenResult,
  type StatedResult,
  type StatementInput,
  type StatementJson,
  type VetoJson,
} from './people/actions.ts'
export {
  adjustmentId,
  DB_LEVELS,
  DB_LINKS,
  DB_REACTIONS,
  DB_TAG_GROUPS,
  dbTarget,
  loadPerson,
  onlyGenre,
  questionId,
  ratingKindFromDb,
  reactionFromDb,
  reloadPeople,
  seenId,
  statedRating,
  statementId,
  syncPerson,
  targetLabel,
  vetoId,
  type StatementTable,
} from './people/facts.ts'
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
export {
  importLetterboxd,
  LETTERBOXD_KIND,
  LETTERBOXD_RSS_KIND,
  letterboxdReport,
  loadLetterboxd,
  personLetterboxdRows,
  reloadLetterboxd,
  RESOLUTION_PATHS,
  type CountsByPath,
  type DiscardedItem,
  type FactCounts,
  type ImportItem,
  type LetterboxdImport,
  type LetterboxdImportInput,
  type LetterboxdReport,
  type ResolutionPath,
} from './imports/letterboxd.ts'
export {
  EXPORT_FILES,
  filmKey,
  readLetterboxdExport,
  RSS_FILE,
  type ExportFile,
  type LetterboxdRow,
} from './imports/letterboxd-export.ts'
export {
  readResolutions,
  RESOLUTIONS_PATH,
  saveResolutions,
  statusOf,
  textField,
  type Resolution,
  type Resolutions,
} from './imports/letterboxd-resolutions.ts'
export { readLetterboxdRss, RSS_ORIGIN } from './imports/letterboxd-rss.ts'
export {
  readUpload,
  storedImports,
  storeImport,
  type Stored,
  type Upload,
} from './imports/stored.ts'
export { CsvDictReader, CsvError, type CsvRow } from './imports/csv.ts'
export { Zip, ZipError } from './imports/zip.ts'
