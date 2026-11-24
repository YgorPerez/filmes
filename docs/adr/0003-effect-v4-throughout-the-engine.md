# Effect v4 throughout the engine

The TypeScript engine (`packages/engine`) replaces a Python engine whose errors are one exception type with a code (`ErroFilmes(codigo, mensagem)`), whose "today" and paths come from an environment object passed by hand (`amb`), and whose on-demand sources (OMDb, Does the Dog Die, TMDB) retry, cache and switch themselves off by hand. pesquisa-relacionamentos already validates its content with Effect v4 Schema.

## Decision

- **The engine is written in Effect v4 from the first module**: typed errors in the error channel, services and layers for the clock, the filmes-dados store, the SQLite database and each on-demand source, `Schema` for every file format and for the JSON the engine returns.
- **The edges unwrap it.** The web app's server functions, the MCP tools and the CLI run the engine's effects with a layer built once per process; nothing above `packages/engine` writes `Effect` code to call it.
- **Agents read the v4 source before writing Effect code**, as in pesquisa-relacionamentos (its ADR 0012): the v4 API differs from v3 and from the release candidates most training data shows. `AGENTS.md` says where the source lives.

## Why

Typed errors and services are the seams the parity oracle and the ported tests need: "today" fixed by a test clock instead of `FILMES_HOJE`, recorded source responses by a layer instead of `FILMES_GRAVACOES`, the failure of one source contained instead of an exception crossing the Recommendation. Mixing Effect and plain promises inside the engine would put those seams on only half of it.

## Consequences

- An error the user can see is a tagged error with a PT-BR message; its tag replaces the Python `codigo`.
- Bumping `effect` means re-reading the source of what changed.
