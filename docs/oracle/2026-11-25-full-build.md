# Full build parity, 2026-11-25 (#107)

The engine's `rebuild` and Python's `reconstruir` built the derived database on servidor-azul (8 cores) from the same inputs: the real dumps pinned in `config/versoes-catalogo.json`, a copy of the real filmes-dados (migrated to English for the engine), the repo's config, `FILMES_HOJE=2026-11-25`. Engine at `87ad986`, Python 3.12.3, Node v26.8.2. Both ran at the same time, on a machine shared with another session's builds, so the times are not a benchmark (#106 has the idle ones: 16 min 08 s and 15 min 42 s).

|                      | wall        | peak RSS | database |
| -------------------- | ----------- | -------- | -------- |
| engine `rebuild`     | 19 min 50 s | 1.64 GB  | 3.0 GB   |
| Python `reconstruir` | 19 min 57 s | 0.68 GB  | 3.0 GB   |

The `reconstruir` JSON (`tabelas` counts) is identical. Compared with `node packages/engine/oracle/compare-databases.ts <python.sqlite> <ts.sqlite>` (#76 §4.4: schema, columns, counts, rows as multisets by EXCEPT both ways plus distinct counts; REAL exact except the two similarity columns, 1e-12 relative), 5 min 51 s. Table names and counts only: the rows hold the Pessoas' taste.

The 1,318 REAL values that differ are 1–2 ulp apart: the SQL `ln` of the similarity precompute is V8's `Math.log` in the engine and glibc's `log` in Python.

Schema (`sqlite_master` SQL of every table, view and index): identical.

| table                 | rows (Python) |  rows (TS) | columns | only Python | only TS | REAL differing / max relative |
| --------------------- | ------------: | ---------: | ------- | ----------: | ------: | ----------------------------- |
| adultos               |           608 |        608 | same    |           0 |       0 |                               |
| ajustes               |             1 |          1 | same    |           0 |       0 |                               |
| apelidos              |             1 |          1 | same    |           0 |       0 |                               |
| arestas               |     1,832,351 |  1,832,351 | same    |           0 |       0 |                               |
| atores_imdb           |       173,250 |    173,250 | same    |           0 |       0 |                               |
| classificacoes        |       127,579 |    127,579 | same    |           0 |       0 |                               |
| declarados            |            90 |         90 | same    |           0 |       0 |                               |
| elenco_principal_imdb |       410,085 |    410,085 | same    |           0 |       0 |                               |
| entidades             |       255,802 |    255,802 | same    |           0 |       0 |                               |
| faixas_etarias        |        57,699 |     57,699 | same    |           0 |       0 |                               |
| filmes                |       147,705 |    147,705 | same    |           0 |       0 |                               |
| generos_imdb          |       298,813 |    298,813 | same    |           0 |       0 |                               |
| genoma                |    10,547,319 | 10,547,319 | same    |           0 |       0 |                               |
| idiomas_originais     |       111,536 |    111,536 | same    |           0 |       0 |                               |
| itens_letterboxd      |         2,254 |      2,254 | same    |           0 |       0 |                               |
| ja_visto              |         1,061 |      1,061 | same    |           0 |       0 |                               |
| metadados_wikidata    |     1,295,647 |  1,295,647 | same    |           0 |       0 |                               |
| normas_tags_movielens |        51,323 |     51,323 | same    |           0 |       0 | 1001 / 3.09e-16               |
| notas                 |         1,102 |      1,102 | same    |           0 |       0 |                               |
| perguntas_abertas     |             3 |          3 | same    |           0 |       0 |                               |
| pessoas               |             4 |          4 | same    |           0 |       0 |                               |
| reacoes               |             8 |          8 | same    |           0 |       0 |                               |
| relatos               |             5 |          5 | same    |           0 |       0 |                               |
| rotulos_wikidata      |       752,539 |    752,539 | same    |           0 |       0 |                               |
| series_de_filmes      |           983 |        983 | same    |           0 |       0 |                               |
| sessao_presentes      |            12 |         12 | same    |           0 |       0 |                               |
| sessao_recomendacao   |           170 |        170 | same    |           0 |       0 |                               |
| sessoes               |             4 |          4 | same    |           0 |       0 |                               |
| slugs_letterboxd      |       273,480 |    273,480 | same    |           0 |       0 |                               |
| subclasses_wikidata   |         3,862 |      3,862 | same    |           0 |       0 |                               |
| tags_movielens        |     1,071,057 |  1,071,057 | same    |           0 |       0 |                               |
| tags_no_catalogo      |       132,729 |    132,729 | same    |           0 |       0 | 317 / 2.04e-16                |
| vetos                 |             6 |          6 | same    |           0 |       0 |                               |
| vizinhos              |     2,739,572 |  2,739,572 | same    |           0 |       0 |                               |
| watchlist             |         1,104 |      1,104 | same    |           0 |       0 |                               |

Result: **clean** (REAL exact except `tags_no_catalogo.valor` and `normas_tags_movielens.norma`, within 1e-12 relative).
