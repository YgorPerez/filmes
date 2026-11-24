# Common brief for map #72 (filmes online)

- Repo: github.com/YgorPerez/filmes. The gh account with access is `YgorPerez`: run `gh auth switch -u YgorPerez` before any gh/git network call.
- Spec: issue #72 (read it with `gh issue view 72 -R YgorPerez/filmes`). Your ticket is the issue named in your task. Read the repo's CLAUDE.md first.
- Integration branch: `spec/72-online` (on origin). Your checkout must be based on it: `git fetch origin && git merge-base --is-ancestor origin/spec/72-online HEAD || git reset --hard origin/spec/72-online` before you start, then `git switch -c ticket/<n>-<slug>`.
- Reference stack/process repo (read only, never modify): /var/www/html/pesquisa-relacionamentos. Copy its shapes, not its domain.
- Per the map: code, file names, comments, ADRs and commit messages in English; UI text and prose in PT-BR.
- Shared notes for this map live in this directory (<notes dir>). Write any research/notes another ticket could use to `<n>-<topic>.md` here.
- For code tickets, call the Skill tool with `tdd` to build it. `make check` (and `pnpm check` once #73 lands) must be green.
- Before reporting done: `git fetch origin && git merge origin/spec/72-online`, re-run the checks, push your `ticket/*` branch to origin. Do NOT open a PR, do NOT push to `spec/72-online` or master, do NOT close issues: the orchestrator merges.
- Anything only the user can do (secrets, consoles, real-device tests): don't fake it; list it in your report.
- Final report, short: branch, head SHA, checks run and result, what's left for the user, decisions you took that weren't in the ticket.
