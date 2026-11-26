// Whether a form post came from this site, for the Link da Sessão's
// routes: the group swipe's Votos (#182) and the Perguntas par a par
// (#181). Server only.

/** A form of this site. The link's pages send no referrer
 * (`no-referrer`), so a browser posts their forms with `Origin: null`;
 * then `Sec-Fetch-Site`, which a page cannot forge, says where the form
 * was. Without it, the `Origin` must be this site's. */
export function fromThisSite(
  request: Request,
  origin: string | undefined,
): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site !== null) return site === 'same-origin'
  return origin !== undefined && request.headers.get('origin') === origin
}
