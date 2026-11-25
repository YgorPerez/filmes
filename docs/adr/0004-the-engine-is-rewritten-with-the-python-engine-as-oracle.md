# The engine is rewritten in TypeScript, with the Python engine as its oracle

The engine is about forty commands, Constraints, signal paths and loaders in Python, with 400-odd tests through the CLI. filmes goes online as a TanStack Start app on a 1-core VPS, and the user decided (map #72, 2026-11-24) that the image ships without Python and that the app and the MCP call the engine directly, with no subprocess.

## Decision

- **The whole engine is rewritten in TypeScript before filmes goes online**, in `packages/engine`, with the order and the inventory from ticket #76.
- **Reconstruct is ported last, and launch does not wait for it.** The TypeScript engine reads the SQLite database the Python engine builds, which keeps the same schema. Python leaves the repository once the TypeScript reconstruct builds an identical database.
- **Parity is proven by an oracle** that runs both engines on the fixture and on a sample of the real database and compares their JSON, plus the pytest suite ported to Vitest through the same seams (the CLI contract, the fixture, recorded source responses). Python gets the original filmes-dados and TypeScript the migrated copy (ADR 0002).
- **Any difference the oracle finds is either fixed or recorded** as a decision in `AGENTS.md` ("Decisões que valem para todos") or in an ADR, with the reason. A difference nobody decided is a bug.
- **While both exist, the Python engine is frozen** except for fixes the oracle needs.

## Why

A port without an oracle trusts that every rule written in prose in `AGENTS.md`, every tie-break and every rounding survived the translation; the Recommendation would change silently. Comparing JSON on real data finds what the fixture does not cover. Porting reconstruct last lets launch happen on the database already built, since reconstruct runs on servidor-azul and not on the VPS.

## Consequences

- `make check` (Python) stayed in CI until Python left (#108).
- A behaviour change during the port is its own ticket, after parity, so the oracle keeps comparing like with like.

## How it ended (2026-11-25, #108)

- The oracle ran as decided: every pytest scenario on both engines over the fixture (#83), a seeded sample of requests on a copy of the real database and filmes-dados (#84, `docs/oracle/real-2026-11-25.md`), and a full build of the real catalog by both rebuilds, compared row for row (#107, `docs/oracle/2026-11-25-full-build.md`). All three ended clean; the differences left were each decided (`decisions.yaml`, last in the commit before #108).
- Reconstruct was ported last (#105, #106), and the site went online on the database Python built, as planned. filmes-dados was cut over to English the same day.
- Python then left: `filmes/`, the pytest suite, `pyproject.toml` and `uv.lock`, the stdio MCP server and the skill that called its CLI, the oracle and the CI jobs that ran them. The image never had Python.
- What the oracle proved stays as committed expected output: the Vitest tests that compared the two engines live now compare the engine with Vitest snapshots recorded from the Python engine while the comparison still passed, and the golden vectors (`*.jsonl.gz`) stay without the scripts that generated them. A snapshot of a whole output changes only with a decision about behaviour.
- The engine keeps the Python engine's observable rules (text, rounding, ordering, error messages) in `packages/engine/src/compat/` and in comments that name the Python function they follow: they are the spec, not a dependency.
