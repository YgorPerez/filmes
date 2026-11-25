# Code, ADRs, issues and commits are in English; what the user sees stays in PT-BR

filmes started out entirely in Portuguese: modules, commands, flags, frontmatter keys, `config/*.toml` keys, commit messages. Map #72 moves it onto the pesquisa-relacionamentos stack and rewrites the engine in TypeScript, so most identifiers are written again anyway. On 2026-11-24 the user decided the new code is in English, as in pesquisa-relacionamentos ([ADR 0039 there](https://github.com/YgorPerez/pesquisa-relacionamentos/blob/main/docs/adr/0039-code-in-english.md)).

## Decision

These are in English:

- file and folder names, identifiers, comments, and CLI, build and log messages;
- package names and `package.json` scripts;
- MCP tool names and their parameter names;
- `config/*.toml` keys and file names, filmes-dados frontmatter keys, and the values of closed lists (a Strength, a Constraint name, a drop cause), migrated as ADR 0002 says;
- ADRs, issues, pull requests and commit messages.

Each domain term has an English code name, written in brackets next to it in `GLOSSARY.md`, and every identifier uses that name. Types are PascalCase (`Session`), fields and values camelCase in TypeScript (`attendees`) and snake_case in file keys (`open_questions`).

These stay in PT-BR:

- interface copy, in the web app and in the Cartaz;
- public URLs;
- MCP tool descriptions and the server `instructions`, written with the GLOSSARY terms, because Claude speaks PT-BR to the Dono through them;
- free text the Dono or a Pessoa wrote (a Veto's text, a comment, a label) and the Markdown bodies of filmes-dados files;
- `GLOSSARY.md` definitions, `AGENTS.md`, `README.md` and other prose.

## Why

The people who use filmes are Brazilian, so what they see or type stays in their language. Everything else is read by whoever maintains the repository and by agents, and the reference stack, its libraries and its documentation are in English. One language per layer also ends the half-and-half names (`definirFerramenta`, `fato_id`) the Python engine and the MCP server accumulated.

## Consequences

- New code, ADRs, issues and commits are in English. A domain name missing from the glossary goes there before it becomes an identifier.
- The Python engine keeps its Portuguese names until the port removes it (ADR 0004); its code is not renamed in place.
- Git history keeps its Portuguese commit messages; they are not rewritten.
