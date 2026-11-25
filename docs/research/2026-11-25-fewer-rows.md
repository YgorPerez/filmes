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
- The #84 real-database run (seed 84) was repeated on copies; see the ticket.
