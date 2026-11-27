# Markdown and git are the store, and the VPS is its only writer

Pessoas and Sessions live as Markdown with YAML frontmatter in filmes-dados, a private git repository, and everything else is derived: the SQLite database is rebuilt from the catalog dumps plus those files. Online, two Donos write through the web app and the MCP connector, and Ygor used to edit the files and run the engine on his own machine.

## Decision

- **Pessoas and Sessions stay Markdown in filmes-dados.** No database becomes the source of truth for them.
- **The VPS is the only writer.** Every write is a commit authored by the logged-in Pessoa and pushed with a deploy key that can write to that repository only. Nobody else pushes to filmes-dados after launch; a hand fix goes through the app, or through a commit the VPS pulls before its next write.
- **A failed push stays queued and is retried.** The commit is already in the VPS clone, so the write counts; after repeated failures the admin sees a banner.
- **The derived SQLite is built on servidor-azul, never on the VPS**, and shipped by `pnpm db:publish` (rsync plus a blue/green swap). The on-demand sources' cache is a separate file that survives the swap. Web login sessions and OAuth tokens live in `auth.sqlite`, with no backup. Trakt access and refresh tokens are encrypted with a VPS environment key and tied to the Pessoa and verified email. Disconnecting deletes the local grant.

## Why

The files are readable and editable by hand, and git gives history, authorship and backup for free; the data is small (a few Pessoas, a Session per evening). A single writer removes merge conflicts and races between the two Donos and a hand edit, which a git store cannot resolve on its own.

## Consequences

- Writes are serialised on the VPS; the engine never writes filmes-dados from a test or from another machine (tests use `tests/fixture/dados`).
- Losing the VPS volume loses at most the queued pushes; losing `auth.sqlite` forces a new login and Trakt reconnection.
