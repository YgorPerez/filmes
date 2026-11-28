import { deleteSession } from '@filmes/engine'
import { SESSIONS_PATH } from '#/content/session-paths'
import { appEngine } from './engine'
import { appPoster, formPoster, seeOther } from './form-post'

export async function serveSessionDeletion(request: Request, id: string) {
  const { owner, origin } = appPoster(request)
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster

  const form = await request.formData()
  const mode = form.get('modo')
  if (mode !== null && mode !== 'keep_taste' && mode !== 'erase')
    return new Response('Opção de exclusão inválida.', { status: 400 })

  const result = await appEngine().run(
    deleteSession({ session: id, mode: mode ?? undefined }),
    { owner: poster.person },
  )
  if (result.exitCode === 0 || result.output.error.code === 'deleted_session')
    return seeOther(SESSIONS_PATH)
  return new Response(result.output.error.message, {
    status: 409,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
