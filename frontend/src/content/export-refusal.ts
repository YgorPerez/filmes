/** Why the export page (`EXPORT_PATH`) shows a refusal: the `erro` of its query, which the
 * download writes when it cannot give the file (`platform/export.ts`). */
export const EXPORT_REFUSALS = [
  // No Pessoa has that slug any more (renamed or removed since the page).
  'pessoa',
  // The engine cannot run here: no database yet, no config, broken data.
  'indisponivel',
] as const

export type ExportRefusal = (typeof EXPORT_REFUSALS)[number]

export const isExportRefusal = (value: unknown): value is ExportRefusal =>
  (EXPORT_REFUSALS as readonly unknown[]).includes(value)
