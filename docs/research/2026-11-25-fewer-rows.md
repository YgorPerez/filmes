# Fewer rows from SQL to JS in `recomendar` (#127)

2026-11-25, servidor-azul. #124 measured `recomendar` on the real database at 8.6 s p50 and 14.8 s p95. SQL took about 80% of that, and a request handed about 2.3 million rows to JS. This ticket makes SQL return only the rows of the round's Candidates.

**Result:** on the same 32 seeded requests, p50 went from 5.52 s to 1.27 s and p95 from 9.35 s to 3.47 s (all runs). The median request handed 116k rows to JS instead of 2.27M. All 128 paired answers were byte for byte the same.

## What changed (TS engine only)

- **Content path (`signals/content.ts`).** `EDGES` takes the Candidate ids as a JSON list (`json_each`) and returns only their edges. The cast's "first 3 IMDb credits" check is now a column of `EDGES`, a lookup on `elenco_principal_imdb` and `atores_imdb` per edge. Before, each Presente's request read the whole `elenco_principal` view (297k rows) and `DISTINCT filme_id FROM elenco_principal_imdb` (138k rows).
- **Neighbourhood (`signals/neighbors.ts`)**, **Clima and group-or-alone tags (`signals/tags.ts`)**, **Vetos (`vetoes.ts`)**: filtered to the Candidates in SQL. The tag queries also skip rows below the ruler's own minimums (`MOVIELENS_TAG_MIN_USERS`, `GENOME_MIN_RELEVANCE`, exported from `evidence/ruler.ts`). A row below them gave no Evidence anyway.
- **Query plans.** A 14k-id `json_each` tempts SQLite to drive the whole query from the list. That is good where the table has an index on the film column and the list is the smaller side (`EDGES`, `generos_imdb`). It is bad elsewhere: `vizinhos` has no index on `vizinho_id`, and on `genoma` it ran 7× slower. A unary `+` on the column (`+filme_id IN (…)`) keeps SQLite on the query's own index and checks the list per row. Each choice was timed on the copy.
- Not changed: the content signal's `SEEDS` (#126 owns its `ORDER BY`), similarity, and the Restrições' catalog-wide reads.

## Setup

- **Data.** A read-only `node:sqlite` backup of the real database (3.0 GB, 147,705 films) and its source cache, into a scratch folder. Config: `config/` migrated to English. An empty filmes-dados. Each side read its own copy. All copies were deleted afterwards.
- **Requests.** #124's generator (`research/124-duckdb/requests.ts`, seed 124, 32 requests): 3–4 Presentes, the Regra cycled, a Clima 60% of the time, the 56 restriction sets cycled, 20 films each. `recommend` runs without opening a Session. One request (`--desde` after `--ate`) fails on both sides with the same usage error and is left out of the timings, which leaves 124 per side.
- **Engines.** "Before" is `spec/72-port` at 2bfabfe and "after" is this branch. Each runs in its own long-lived process, with every statement timed through the `Sqlite` seam. The two alternate request by request, and the one that goes first alternates too.
- **Passes.** 2 rounds. Each round evicts both database files from the page cache, starts fresh processes, then runs a **cold** pass and a **warm** pass.
- **Load.** The machine was shared with other sessions; load average (1 min) during the run: min 1.1, median 1.6, max 7.8.

## Results

`recommend` wall time per request, in seconds:

| run  | before p50 | before p95 | after p50 | after p95 | p50 speedup | p95 speedup |
| ---- | ---------- | ---------- | --------- | --------- | ----------- | ----------- |
| cold | 5.62       | 11.91      | 1.34      | 5.52      | 4.2×        | 2.2×        |
| warm | 5.47       | 6.45       | 1.06      | 2.28      | 5.2×        | 2.8×        |
| all  | 5.52       | 9.35       | 1.27      | 3.47      | 4.3×        | 2.7×        |

Pairing each request with itself (same round and pass), the before/after time ratio has a median of 4.21×, with p5 2.15× and p95 9.67×.

|                                          | before        | after        |
| ---------------------------------------- | ------------- | ------------ |
| rows handed to JS per request, p50 / p95 | 2.27M / 2.50M | 116k / 494k  |
| statements per request, p50              | 118           | 112          |
| SQL share of wall time                   | 77%           | 72%          |
| peak RSS of the process                  | 1.13–1.25 GB  | 0.57–0.65 GB |

The "before" baseline here (5.5 s p50) is lower than #124's 8.6 s. That run had a much higher machine load (median 7.7) and ran a DuckDB worker beside each request.

### What is left

These are the slowest statements on the after side (round 2, 64 requests):

| statement                               | share of SQL time | note                                                                 |
| --------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| content `EDGES`                         | 26%               | about 16 calls per request, now about 1.5k rows each                 |
| `no_sad`: `tags_movielens UNION genoma` | 25%               | one call when the Restrição is asked, about 2.2 s each, catalog-wide |
| similarity: the MovieLens tags join     | 5%                | `--parecido` only                                                    |
| Vetos: `generos_imdb` by genre          | 5%                |                                                                      |

The next step is to filter the Restrições' catalog-wide reads (`no_sad`, `language`'s `idiomas_originais`, `child`) to the films they are asked about, in the same way.

## Parity

- 128 of 128 paired answers have the same SHA-256 over the whole `Recommendation` JSON, with no rounding.
- The fixture oracle (`pnpm oracle`) is clean: 425 scenarios, 1,623 steps compared, 0 differences.
- The #84 real-database run (`pnpm oracle --real`, seed 84, 4 lanes, `--today 2026-11-25`, on copies) is clean, with the same counts as `docs/oracle/real-2026-11-25.md`: 316 scenarios, 1,432 steps compared, 938 explained by the same two decisions, 0 unexplained differences, 0 harness errors, 4 steps not run.

## The Restrições: `no_sad`, language and child (#129)

The three Restrições now ask SQL only for the films they are evaluating (`filmsJson` in `constraints.ts`, the same `json_each` list as the signals):

- **`no_sad`.** "Does the film have any tag" was a catalog-wide `tags_movielens UNION genoma` (51k rows). It is now one `EXISTS` per film on the `(filme_id, tag)` index of each table. The queries for the sad and heavy-theme tags stay catalog-wide. The tag index keeps them to a few thousand rows, and adding the list made each one slower (3 → 10 ms), because building a 14k-id list costs more than the rows it saves.
- **Language.** `idiomas_originais` (111k rows) is read through its film index, for the Candidates only.
- **Child.** `faixas_etarias` (58k rows) is read the same way. `adultos` (608 rows, no film index) is still read whole, which is cheaper than building the list.

One statement with a 14k-film list, timed alone on the copy (best of 3, warm):

| statement                     | before               | after              |
| ----------------------------- | -------------------- | ------------------ |
| `no_sad`: films with any tag  | 765 ms, 51,614 rows  | 26 ms, 11,847 rows |
| language: `idiomas_originais` | 304 ms, 111,536 rows | 39 ms, 15,011 rows |
| child: `faixas_etarias`       | 157 ms, 57,699 rows  | 96 ms, 33,287 rows |

### Setup

The same as above, with these differences. Requests: #124's generator with seed 124 and 56 requests (one whole cycle of the restriction sets), keeping the 27 that ask for at least one of the three (`--sem-tristeza`, `--idioma`, `--crianca`). "Before" is `spec/72-port` at ec30564 (#127 merged); "after" is this branch. 2 rounds, cold then warm, alternating, each side on its own database copy. Load average (1 min) during the run: min 1.6, median 8.1, max 10.2. That is much higher than in #127's run, so compare before and after within this table, not with the table above.

### Results

`recommend` wall time per request, in seconds (n = runs per side):

| requests that ask for | run  | n   | before p50 | before p95 | after p50 | after p95 |
| --------------------- | ---- | --- | ---------- | ---------- | --------- | --------- |
| any of the three      | cold | 54  | 2.21       | 12.07      | 1.60      | 9.43      |
| any of the three      | warm | 54  | 1.66       | 3.27       | 1.16      | 2.27      |
| any of the three      | all  | 108 | 1.97       | 7.34       | 1.34      | 6.56      |
| `no_sad`              | warm | 20  | 2.35       | 3.48       | 1.52      | 2.71      |
| `no_sad`              | all  | 40  | 2.75       | 6.32       | 1.61      | 3.26      |
| language              | warm | 20  | 0.93       | 3.16       | 0.56      | 2.15      |
| language              | all  | 40  | 1.15       | 9.23       | 0.71      | 8.79      |
| child                 | warm | 20  | 1.50       | 2.20       | 1.21      | 1.77      |
| child                 | all  | 40  | 1.68       | 2.68       | 1.35      | 2.57      |

- Pairing each request with itself, the before/after ratio has a median of 1.49×, with p5 1.03× and p95 2.31×.
- Rows handed to JS per request, p50 / p95: 157k / 330k before, 86k / 284k after. The SQL share of wall time went from 84% to 75%.
- Peak RSS: 0.67–0.69 GB before, 0.48–0.64 GB after.
- Under this load, `no_sad`'s catalog-wide `UNION` averaged 2.45 s per call (20 calls in round 2). The `EXISTS` that replaces it averages 0.11 s.
- The cold p95 of the language and "any" rows is set by a few requests whose cost is elsewhere (the content signal on a cold page cache); it barely moves.
- 108 of 108 paired answers have the same SHA-256 over the whole `Recommendation` JSON.

### Parity

- The fixture oracle (`pnpm oracle`) is clean: 426 scenarios, 1,625 steps compared, 0 differences.
- The #84 real-database run (seed 84, 4 lanes, `--today 2026-11-25`, on copies) is clean, with the same counts as #127: 316 scenarios, 1,432 steps compared, 938 explained by the same two decisions, 0 unexplained differences, 0 harness errors.

The slowest statement left is the content signal's `EDGES`, as before (#126 and later).
