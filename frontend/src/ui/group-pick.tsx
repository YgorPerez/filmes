import { useState } from 'react'
import type { PairwisePage, PickGroup } from '#/platform/pairwise'
import { buttonVariants } from './kit/button-variants'
import { PostForm } from './kit/post-form'
import { Alert } from './kit/status'
import { GROUP_PICK } from './group-pick.copy'
import type { PairwiseLink } from './pairwise'
import { FilmCover } from './session-link'

/** One group: a checkbox with the group's name, its labels and its three
 * tapes, each over its title. The whole card is the checkbox's label, so a
 * tap anywhere on it marks the group; marked, it takes the 2px `ink`
 * outline on `surface-2`, as an Opção (DESIGN.md). */
function GroupCard({
  group,
  full,
  onToggle,
}: {
  group: PickGroup
  /** The most groups are marked: the others wait. */
  full: boolean
  onToggle: (checked: boolean) => void
}) {
  const [checked, setChecked] = useState(false)
  return (
    <label className="flex cursor-pointer flex-col gap-sm rounded-card border-(length:--border-width-stroke) border-rule bg-surface p-md has-checked:border-2 has-checked:border-ink has-checked:bg-surface-2 has-disabled:cursor-default has-disabled:opacity-60">
      <span className="flex items-center gap-sm">
        <input
          type="checkbox"
          name="grupo"
          value={group.id}
          disabled={full && !checked}
          onChange={(e) => {
            setChecked(e.target.checked)
            onToggle(e.target.checked)
          }}
          className="size-5 shrink-0 accent-ink"
        />
        <span className="font-display text-control font-bold text-ink">
          {group.name}
        </span>
      </span>
      <span className="text-meta text-ink-2">{group.labels.join(' · ')}</span>
      <span className="grid max-w-[312px] grid-cols-3 gap-sm">
        {group.films.map((film) => (
          <span key={film.id} className="flex min-w-0 flex-col gap-2xs">
            <FilmCover
              poster={film.poster}
              title={film.title}
              small
              className="w-full"
            />
            <span className="text-label text-balance text-ink-2">
              {film.title}
            </span>
          </span>
        ))}
      </span>
    </label>
  )
}

/** `/participar/perguntas` before the pairs (#415): "Qual destes grupos tem
 * mais a sua cara?", the groups as cards to mark, 1 to `max` of them, as a
 * plain form to `/participar/perguntas/grupos` (with the JavaScript, by
 * `fetch`, and once `max` are marked the others wait). "Pronto" sends the
 * marked groups; "Nenhum tem a minha cara" sends none. Then the pairs. */
export function GroupPickQuestion({
  groups,
  link,
  failed = false,
  back,
  owner = null,
}: {
  groups: NonNullable<PairwisePage['groups']>
  link: PairwiseLink
  failed?: boolean
  back: string
  owner?: string | null
}) {
  const [picked, setPicked] = useState(0)
  const { max, choices } = groups
  return (
    <section aria-labelledby="pergunta" className="flex flex-col gap-lg">
      <h1 id="pergunta" className="font-display text-page-title text-balance">
        {GROUP_PICK.title}
      </h1>
      <p className="max-w-[60ch] text-pretty text-ink-2">
        {GROUP_PICK.lead(owner, max)}
      </p>
      {failed && <Alert>{GROUP_PICK.failed(max)}</Alert>}
      <PostForm
        action="/participar/perguntas/grupos"
        label={GROUP_PICK.title}
        className="flex flex-col gap-md"
      >
        {(busy) => (
          <>
            <input type="hidden" name="sessao" value={link.session} />
            <input type="hidden" name="chave" value={link.token} />
            <input type="hidden" name="presente" value={link.person} />
            <fieldset className="flex flex-col gap-md">
              <legend className="sr-only">{GROUP_PICK.legend}</legend>
              <div className="grid max-w-[880px] gap-md min-[560px]:grid-cols-2">
                {choices.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    full={picked >= max}
                    onToggle={(on) => setPicked((n) => n + (on ? 1 : -1))}
                  />
                ))}
              </div>
            </fieldset>
            <p
              aria-live="polite"
              className="text-meta font-bold text-ink tabular-nums"
            >
              {GROUP_PICK.picked(picked, max)}
            </p>
            <div className="flex flex-wrap items-center gap-sm">
              <button
                type="submit"
                name="acao"
                value="escolher"
                disabled={busy}
                className={buttonVariants()}
              >
                {GROUP_PICK.send}
              </button>
              <button
                type="submit"
                name="acao"
                value="nenhum"
                disabled={busy}
                className={buttonVariants({ variant: 'option' })}
              >
                {GROUP_PICK.none}
              </button>
            </div>
          </>
        )}
      </PostForm>
      <a href={back} className={buttonVariants({ variant: 'link' })}>
        {GROUP_PICK.back}
      </a>
    </section>
  )
}
