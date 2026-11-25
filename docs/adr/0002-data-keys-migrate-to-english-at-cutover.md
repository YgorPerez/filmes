# filmes-dados and config keys migrate to English once, at cutover

ADR 0001 puts frontmatter keys, `config/*.toml` keys and closed-list values in English. Those files are read by two engines during the port: the Python engine, which reads Portuguese keys, and the TypeScript engine, which should only know the English ones. filmes-dados is a separate private repository with real Pessoas and Sessions, edited by hand and, after launch, by the VPS (ADR 0005).

## Decision

- **A migration script maps every Portuguese key and closed-list value to its English code name**, following `GLOSSARY.md`, and renames the folders (`pessoas/` → `people/`, `sessoes/` → `sessions/`) and the `config/*.toml` files; file stems (slugs, Session ids) stay. Keys are snake_case. It has a round-trip test (PT → EN → PT gives the same files) over the fixture and over a copy of the real filmes-dados.
- **Cutover runs it once on filmes-dados, in one commit.** The script never touches the real repository by itself. `config/*.toml` moves in the same change that makes the TypeScript engine read it.
- **Until cutover, filmes-dados stays in Portuguese.** The parity oracle (ADR 0004) feeds the original files to Python and the migrated copy to TypeScript.
- **The TypeScript engine reads only English keys.** No alias layer that accepts both.
- **What stays in PT-BR**: Markdown bodies (`## Declarados`, `## Relatos`, `## Já vistos`, the Recommendation), free text values (a Veto's text, a label, a comment, a Source name) and Clima names, which the Dono types.

## Why

Migrating at cutover keeps one shape of the data alive at a time: a dual-read layer would live as long as nobody removes it, and every reader would have to know both names. The round-trip test is what lets the cutover commit be trusted without reading every file.

## Consequences

- The Python engine cannot read filmes-dados after cutover. Cutover therefore happens when the TypeScript engine serves every read and write, and Python only remains for reconstruct (ADR 0004), which also reads filmes-dados: either reconstruct is ported by then or it reads a PT copy made by the script's reverse direction.
- A new frontmatter key or closed-list value is born in English, in the TypeScript schema, with a GLOSSARY code name.
