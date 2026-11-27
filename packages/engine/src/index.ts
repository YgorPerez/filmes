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
  SEARCH_KINDS,
  SEARCH_LIMIT,
  SEARCH_LIMIT_MAX,
  SEARCH_MIN_LENGTH,
  searchCatalog,
  type CatalogSearch,
  type CatalogSearchRequest,
  type EntityMatch,
  type FilmMatch,
  type FilmRef,
  type SearchKind,
} from './catalog/search.ts'
export { searchKey } from './catalog/search-key.ts'
export {
  filmCard,
  type FilmCard,
  type FilmCardRequest,
} from './catalog/film-card.ts'
export {
  EXPORT_FORMATS,
  exportRatings,
  type ExportFormat,
  type ExportResult,
} from './export/export.ts'
export { IMDB_HEADER } from './export/imdb.ts'
export { LETTERBOXD_HEADER } from './export/letterboxd.ts'
export { resolveAttendees } from './recommendation/attendees.ts'
export {
  attributionsOf,
  CREDITS,
  TRAKT_ATTRIBUTION,
  type Attribution,
  type Credit,
} from './recommendation/attributions.ts'
export {
  catalogFilm,
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
  type ConstraintModule,
  type ConstraintName,
  type ConstraintSet,
  type Drop,
  type Pass,
  type StoredConstraint,
  type Verdict,
} from './recommendation/constraints.ts'
export {
  CONSTRAINT_MODULES,
  constraintLabel,
  inheritConstraints,
  readConstraints,
  replacingList,
  storedConstraints,
  type ConstraintRequest,
} from './recommendation/constraints/index.ts'
export {
  DEFAULT_SERIES_ORDER,
  SERIES_ORDER_MODES,
  type SeriesOrderMode,
  type UnseenBefore,
} from './recommendation/constraints/series-order.ts'
export {
  groupSatisfaction,
  satisfactionLine,
  type GroupSatisfaction,
} from './recommendation/group-satisfaction.ts'
export {
  filmHeader,
  firstSentence,
  type FilmHeader,
} from './recommendation/header.ts'
export { readMoods, resolveMoods, type Mood } from './recommendation/moods.ts'
export {
  mergeReadFields,
  readRequest,
  REQUEST_READING_MAX_LENGTH,
  type ReadAmbiguity,
  type ReadItem,
  type RequestReading,
  type RequestReadingInput,
} from './reading/read-request.ts'
export { ADDITION_FIELDS, withAddition } from './reading/addition.ts'
export type { ReadCandidate, ReadField, ReadFields } from './reading/reader.ts'
export {
  drawBets,
  type BetCandidate,
  type BetOdds,
} from './recommendation/bet.ts'
export {
  filmReason,
  type FilmReason,
  type ReasonKind,
} from './recommendation/reason.ts'
export {
  rank,
  rankRequest,
  recommend,
  requestCount,
  type RankOptions,
  type Recommendation,
  type PredictedRating,
  type RecommendedFilm,
  type RecommendRequest,
} from './recommendation/recommend.ts'
export {
  DEFAULT_RULE,
  NEUTRAL_UTILITY,
  RULE_NAMES,
  ruleKey,
  ruleToJson,
  usesSatisfaction,
  type Rule,
  type RuleName,
} from './recommendation/rule.ts'
export { SIGNALS } from './recommendation/signals/index.ts'
export type {
  Round,
  Signal,
  SignalEffect,
} from './recommendation/signals/Signal.ts'
export {
  byConstraint,
  droppedFilms,
  isKept,
  isNew,
  keptWarning,
  place,
  prepareRegenerate,
  type DropCause,
  type Dropped,
  type Regenerate,
  type RemovalCause,
} from './recommendation/kept.ts'
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
  currentVersion,
  filmsInBody,
  fullLine,
  isOpen,
  KIND_IN_BODY,
  newSessionId,
  onScreen,
  readSession,
  sessionBody,
  sessionDuration,
  sessionIds,
  sessionPath,
  sessionRelative,
  sessionsFolder,
  SESSIONS_FOLDER,
  shownFilms,
  STRENGTH_IN_BODY,
  VERSION_EXTRAS,
  writeSession,
  type BodyEvidence,
  type BodyFilm,
  type FilmInBody,
  type SessionFile,
  type ShownFilm,
} from './sessions/file.ts'
export {
  comments,
  feedbackSource,
  ratingValue,
  reactions,
  REPORT_LEVELS,
  sessionSeen,
  type Comment,
  type Reaction,
  type ReportLevel,
  type SessionSeen,
} from './sessions/facts.ts'
export {
  DB_RULES,
  loadSessions,
  ownersOf,
  reloadSessions,
  syncSession,
} from './sessions/database.ts'
export {
  satisfactionNow,
  type PersonSatisfactionNow,
  type SatisfactionNow,
} from './sessions/satisfaction-now.ts'
export {
  dropComment,
  recordFeedback,
  type ChosenFilm,
  type FeedbackFact,
  type FeedbackRequest,
  type FeedbackResult,
} from './sessions/feedback.ts'
export {
  listSessions,
  openSession,
  openSessions,
  recommendationFields,
  sessionContext,
  type OpenSession,
  type RecommendSessionRequest,
  type SessionRecommendation,
  type SessionRef,
  type SessionSummary,
} from './sessions/open.ts'
export {
  openSessionFront,
  recommendSession,
  redoSession,
} from './sessions/redo.ts'
export { sessionRedoRequest } from './sessions/redo-request.ts'
export {
  answerPairwise,
  decidePairwise,
  pairwiseAnswers,
  pairwiseQuestions,
  pairwiseSource,
  PAIRWISE_RATING,
  type PairwiseAnswer,
  type PairwiseDecision,
  type PairwiseQuestions,
  type PairwiseRequest,
  type WaitingAnswer,
  type WaitingAnswers,
} from './sessions/pairwise.ts'
export {
  castVotes,
  votedBy,
  yesVotes,
  type CastVotes,
  type CastVotesRequest,
  type VoteValue,
} from './sessions/votes.ts'
export {
  engineLayer,
  errorOutcome,
  makeEngine,
  type Engine,
  type EngineServices,
  type ErrorOutput,
  type Outcome,
  type RunOptions,
} from './runtime/Engine.ts'
export type { TraktConnection } from './sources/Trakt.ts'
export { Owner, ownerOf } from './runtime/Owner.ts'
export {
  ERROR_CODES,
  EngineError,
  engineError,
  type ErrorCode,
  type ErrorReason,
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
  checkDatabase,
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
  ENGINE_AUTHOR,
  pushNow,
  pushStatus,
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
  isPyDate,
  isPyFloat,
  isPyInt,
  isSequence,
  parseYaml,
  pyDate,
  pyIterate,
  pyReprValue,
  pyStrValue,
  pyTruthy,
  stringifyYaml,
  yamlToJson,
  YamlError,
  type PyDate,
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
  SETUP_STEPS,
  SKIPS_TO_DROP,
  STATEMENT_REACTIONS,
  statementLine,
  type Adjustment,
  type OpenQuestion,
  type Person,
  type Section,
  type SectionItem,
  type Seen,
  type SetupStep,
  type Statement,
  type StatementReaction,
  type Veto,
} from './people/Person.ts'
export {
  createPerson,
  decodePerson,
  decodePersonSync,
  encodePerson,
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
  writePerson,
  type PersonServices,
  type PersonWriteError,
  type WrittenBy,
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
export { OMDB_NAME, Omdb, type OmdbRating } from './sources/Omdb.ts'
export {
  Fetch,
  SourceFailure,
  Transport,
  type SourceProfile,
} from './sources/Source.ts'
export { SourceCache, type CachedAnswer } from './sources/SourceCache.ts'
export { TMDB_ATTRIBUTION, TMDB_NAME, Tmdb, type Card } from './sources/Tmdb.ts'
export {
  personAdjust,
  personQuestions,
  personSkip,
  personVeto,
  tagGroupLabel,
  type AdjustInput,
  type AdjustResult,
  type NormalAdjustmentJson,
  type QuestionsResult,
  type SkipInput,
  type SkipResult,
  type VetoInput,
  type VetoResult,
} from './people/taste.ts'
export {
  personRemove,
  REMOVABLE,
  type Removable,
  type RemovedJson,
  type RemoveInput,
  type RemoveResult,
} from './people/remove.ts'
export {
  setupGuide,
  SETUP_RATINGS,
  skipSetupStep,
  type SetupGuide,
  type SetupGuideInput,
  type SetupStepState,
  type SkipSetupInput,
  type SkipSetupResult,
} from './people/setup.ts'
export {
  grantAccess,
  revokeAccess,
  type AccessResult,
  type GrantAccessInput,
  type RevokeAccessInput,
} from './people/access.ts'
export {
  importLetterboxd,
  importLetterboxdRss,
  LETTERBOXD_KIND,
  LETTERBOXD_RSS_KIND,
  letterboxdReport,
  loadLetterboxd,
  personLetterboxdRows,
  reloadLetterboxd,
  reprocessLetterboxd,
  RESOLUTION_PATHS,
  type CountsByPath,
  type DiscardedItem,
  type FactCounts,
  type ImportItem,
  type LetterboxdImport,
  type LetterboxdImportInput,
  type LetterboxdReport,
  type LetterboxdReprocess,
  type LetterboxdRssImportInput,
  type QueueCandidate,
  type ReprocessedItem,
  type ResolutionPath,
} from './imports/letterboxd.ts'
export {
  confirmQueueItem,
  discardQueueItem,
  reopenQueueItem,
  viewQueue,
  type QueueDecision,
  type QueueItem,
  type QueueView,
} from './imports/letterboxd-queue.ts'
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
export {
  fetchLetterboxdRss,
  letterboxdRssUrl,
  readLetterboxdRss,
  RSS_ORIGIN,
} from './imports/letterboxd-rss.ts'
export {
  readUpload,
  storedImports,
  storeImport,
  type Stored,
  type Upload,
} from './imports/stored.ts'
export { CsvDictReader, CsvError, type CsvRow } from './imports/csv.ts'
export { Zip, ZipError } from './imports/zip.ts'
export {
  verifyAnswer,
  type Verification,
  type VerifyRequest,
} from './verify/verify.ts'
export { exportSource, type ExportSource } from './imports/export-source.ts'
export {
  readTraktExport,
  type TraktFilm,
  type TraktRow,
} from './imports/trakt-export.ts'
export {
  importTrakt,
  loadTrakt,
  reloadPersonTrakt,
  reloadTrakt,
  TRAKT_KIND,
  type TraktFactCounts,
  type TraktImport,
  type TraktImportInput,
  type TraktReport,
  type TraktUnresolved,
} from './imports/trakt.ts'
export {
  importImdb,
  IMDB_KIND,
  imdbFactCounts,
  loadImdb,
  reloadImdb,
  reloadPersonImdb,
  type ImdbFactCounts,
  type ImdbImport,
  type ImdbImportInput,
  type ImdbOutside,
} from './imports/imdb.ts'
export {
  importSimkl,
  loadSimkl,
  reloadPersonSimkl,
  reloadSimkl,
  SIMKL_KIND,
  simklFactCounts,
  type SimklFactCounts,
  type SimklImport,
  type SimklImportInput,
  type SimklReport,
  type SimklUnresolved,
} from './imports/simkl.ts'
export {
  isSimklBackup,
  readSimklBackup,
  type SimklFilm,
  type SimklRow,
  type SimklRowKind,
} from './imports/simkl-backup.ts'
export {
  isImdbRatings,
  readImdbRatings,
  type ImdbRatingRow,
} from './imports/imdb-ratings.ts'
export {
  personImports,
  type ImportRecord,
  type PersonImports,
} from './imports/report.ts'
export {
  removeImport,
  type ImportRemoval,
  type ImportRemovalInput,
} from './imports/remove.ts'
export { rebuild, type Rebuilt } from './rebuild/rebuild.ts'
export { schemaHash } from './rebuild/schema.ts'
export { SCHEMA_VERSION } from './rebuild/schema-version.ts'
export {
  update,
  type PinnedDump,
  type Updated,
  type UpdateProgress,
  type UpdateRequest,
} from './catalog/update.ts'
export { withDatabaseFile } from './sqlite/Sqlite.ts'
export { reloadData, type DataReload } from './data/reload.ts'
export {
  evaluate,
  evaluationsFolder,
  progressTo,
  type EvaluateRequest,
  type Evaluation,
  type EvaluationProgress,
  type OnlineMeasures,
} from './evaluation/evaluate.ts'
export type { Measures } from './evaluation/offline.ts'
export {
  BATCH as NEIGHBOR_BATCH,
  computeNeighbors,
  TOP_K as NEIGHBOR_TOP_K,
  type NeighborOptions,
  type NeighborPair,
} from './catalog/neighbors.ts'
export { countTags, reviewFacts } from './catalog/review.ts'
export {
  dumpYaml as dumpReportYaml,
  type ReportValue,
} from './evaluation/yaml.ts'
export {
  billboardText,
  type BillboardMarks,
  type BillboardState,
} from './billboard/text.ts'
export {
  answerBillboard,
  readReply,
  type BillboardReply,
  type BillboardReplyRequest,
  type FilmNote,
  type ReadMarks,
  type ReadReply,
  type ReplySeen,
} from './billboard/reply.ts'
export {
  billboard,
  billboardModel,
  billboardPeople,
  PERSON_COLORS,
  imdbRatingLabel,
  showFilms,
  votesText,
  type Billboard,
  type BillboardDropped,
  type BillboardFilm,
  type BillboardLine,
  type BillboardPrediction,
  type BillboardChosen,
  type BillboardReaction,
  type BillboardPerson,
  type BillboardRequest,
  type BillboardRequestInput,
  type BillboardResult,
  type BillboardSection,
} from './billboard/model.ts'
export {
  RATING_QUEUE_LIMIT,
  RATING_QUEUE_LIMIT_MAX,
  RATING_SCREEN_SOURCE,
  personRate,
  ratingQueue,
  type GivenRating,
  type PersonRateInput,
  type PersonRateResult,
  type QueueFilm,
  type RatingQueue,
  type RatingQueueRequest,
} from './people/rating.ts'
export {
  tasteSummary,
  type TasteSummary,
  type TasteSummaryRequest,
} from './people/taste-summary.ts'
