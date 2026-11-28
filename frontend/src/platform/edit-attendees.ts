import { editSessionAttendees } from '@filmes/engine'
import { all, field } from '#/content/form-fields'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import { appEngine } from './engine'
import { appPoster, formPoster, seeOther } from './form-post'
import { appNotes } from './notes'

/** The Session left the open list (unknown, counted or deleted): back to it. */
const GONE = new Set(['unknown_session', 'closed_session', 'deleted_session'])

export async function serveAttendeeEdit(request: Request, session: string) {
  const { owner, origin } = appPoster(request)
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const form = await request.formData()
  const attendees = all(form, 'presentes')
  const path = sessionPath(session)
  const editor = `${path}?editar=presentes`
  if (attendees.length === 0) return seeOther(`${editor}&erroPresentes=vazio`)

  if (field(form, 'contada') === 'sim') {
    const params = new URLSearchParams({ corrigir: 'sim' })
    for (const person of attendees) params.append('presentes', person)
    return seeOther(`${feedbackPath(session)}?${params}`)
  }

  const edited = await appEngine().run(
    editSessionAttendees(session, attendees),
    {
      owner: poster.person,
    },
  )
  if (edited.exitCode !== 0) {
    const { code, message } = edited.output.error
    if (GONE.has(code)) return seeOther(path)
    console.error(`engine: ${code}: ${message}`)
    return seeOther(`${editor}&erroPresentes=falha`)
  }
  const token = appNotes().remember({
    warnings: edited.output.warnings,
    addition: null,
  })
  return seeOther(`${path}?feito=regerada${token ? `&nota=${token}` : ''}`)
}
