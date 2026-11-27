import type { ConsultValue, SchemaTable } from '@filmes/engine'
import type { ConsultAnswer } from '#/platform/operations'
import { buttonVariants } from './kit/button-variants'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { OPERATIONS } from './operations.copy'
import { Alert, Detail, Disclosure, Section, Submit } from './operations-parts'

const COPY = OPERATIONS.consult

/** Past this many characters a cell wraps, at the words, within a column of
 * 32 characters: a long text never squeezes the other columns. */
const LONG_CELL = 40

/** The console's address for `sql`, back at the console. */
const consultHref = (sql: string) =>
  `/operacoes?sql=${encodeURIComponent(sql)}#consultar`

function Cell({ value }: { value: ConsultValue }) {
  if (value === null) return <span className="text-ink-2">{COPY.null}</span>
  const text = String(value)
  if (text.length <= LONG_CELL) return <>{text}</>
  return (
    <span className="block w-[32ch] whitespace-normal wrap-break-word">
      {text}
    </span>
  )
}

/** The console's answer: the table (its header even with no row), or the
 * engine's refusal with its code. */
function ConsultResult({ answer }: { answer: ConsultAnswer }) {
  if ('error' in answer) {
    const { code, message } = answer.error
    const known = COPY.errors[code]
    return (
      <Alert>
        {known ?? COPY.other}
        <Detail>
          <code>{code}</code>
          {code === 'invalid_sql' && <> ({message})</>}
        </Detail>
      </Alert>
    )
  }
  return (
    <div className="flex flex-col gap-xs border-t border-rule pt-xl">
      <h3 id="resultado-consulta" className="font-display text-step-title">
        {COPY.results}
      </h3>
      <p role="status" className="text-meta text-ink-2">
        {answer.total === 0
          ? COPY.empty
          : COPY.rows(answer.total, answer.rows.length)}
      </p>
      {answer.columns.length > 0 && (
        <div
          role="region"
          aria-labelledby="resultado-consulta"
          tabIndex={0}
          className="max-h-[60vh] overflow-auto rounded-field border border-rule min-[900px]:max-h-[50vh]"
        >
          <table className="w-max min-w-full text-left text-meta tabular-nums">
            <thead className="sticky top-0 bg-surface-2 font-display font-bold">
              <tr>
                {answer.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="px-md py-xs whitespace-nowrap"
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer.rows.map((row) => (
                <tr key={row.key} className="border-t border-rule">
                  {row.cells.map((cell) => (
                    <td
                      key={cell.key}
                      className="px-md py-sm align-top whitespace-nowrap"
                    >
                      <Cell value={cell.value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** The tables and views, each a link to its first rows, with its columns:
 * what to query without knowing the schema by heart. */
function Tables({ schema }: { schema: readonly SchemaTable[] }) {
  return (
    <Disclosure summary={COPY.tables(schema.length)}>
      <p className="mb-md text-meta text-ink-2">{COPY.tablesHint}</p>
      <ul className="flex flex-col gap-sm">
        {schema.map((table) => (
          <li key={table.name} className="flex flex-col">
            <span className="flex flex-wrap items-baseline gap-sm">
              <a
                href={consultHref(`SELECT * FROM ${table.name} LIMIT 20`)}
                className="inline-flex min-h-touch items-center font-mono font-semibold text-ink underline underline-offset-3"
              >
                {table.name}
              </a>
              {table.kind === 'view' && (
                <span className="text-meta text-ink-2">{COPY.view}</span>
              )}
            </span>
            <span className="font-mono text-meta text-ink-2">
              {table.columns.join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}

/** A few queries the admin runs often, as plain links. */
function SavedQueries() {
  return (
    <nav aria-label={COPY.saved} className="flex flex-col gap-xs">
      <p className="font-display text-label text-ink-2 uppercase">
        {COPY.saved}
      </p>
      <ul className="flex flex-wrap gap-xs">
        {COPY.queries.map((query) => (
          <li key={query.name}>
            <a
              href={consultHref(query.sql)}
              className={buttonVariants({ variant: 'option' })}
            >
              {query.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The read-only SQL console: a plain GET of this page, so the query is in
 * the address and works before the JavaScript loads. */
export function ConsultSection({
  answer,
  schema,
}: {
  answer: ConsultAnswer | null
  schema: readonly SchemaTable[] | null
}) {
  return (
    <Section id="consultar" title={COPY.title} lead={COPY.lead}>
      <form method="get" action="/operacoes" className="flex flex-col gap-xl">
        <FieldLabel label={COPY.label}>
          <textarea
            name="sql"
            required
            rows={5}
            spellCheck={false}
            defaultValue={answer?.sql}
            placeholder={COPY.placeholder}
            className={`${FIELD} resize-y font-mono`}
          />
        </FieldLabel>
        <Submit variant="primary">{COPY.run}</Submit>
      </form>
      {answer && <ConsultResult answer={answer} />}
      <SavedQueries />
      {schema && schema.length > 0 && <Tables schema={schema} />}
    </Section>
  )
}
