-- Sinais de Review: o que estranhos do MovieLens fizeram com os filmes.
-- A fixture preenche estas tabelas por CSV; a ingestão real (#26) preenche as
-- mesmas a partir do ml-32m e do Tag Genome 2021. Os IDs são tconst do IMDb,
-- vindos de links.csv no ml-32m e de raw/metadata.json no Tag Genome.
-- Sem chave estrangeira para filmes:
-- o MovieLens tem filmes fora do Catálogo, e os sinais só olham os Candidatos.

-- Vizinhança item-item, lida como "das <base> pessoas que deram 4 ou mais a
-- <filme_id>, <ambos> (em %) fizeram o mesmo com <vizinho_id>". Top-k vizinhos
-- por filme. A proporção é ambos / base; guardar as duas contagens evita
-- arredondar na fronteira.
CREATE TABLE vizinhos (
    fato_id    TEXT PRIMARY KEY,
    filme_id   TEXT NOT NULL,              -- X: o filme da Nota-semente
    vizinho_id TEXT NOT NULL,              -- Y: o filme sugerido
    base       INTEGER NOT NULL CHECK (base > 0),                  -- usuários que deram 4+ a X
    ambos      INTEGER NOT NULL CHECK (ambos BETWEEN 0 AND base),  -- desses, os que deram 4+ a Y
    fonte      TEXT NOT NULL,              -- "MovieLens ml-32m"
    data       TEXT NOT NULL,              -- data do dataset (2023-10-13)
    UNIQUE (filme_id, vizinho_id),
    CHECK (vizinho_id <> filme_id)
);

-- tags.csv do MovieLens, agregado: quantos usuários distintos deram a tag ao filme.
CREATE TABLE tags_movielens (
    fato_id  TEXT PRIMARY KEY,
    filme_id TEXT NOT NULL,
    tag      TEXT NOT NULL,                -- em minúsculas, sem espaço nas pontas
    usuarios INTEGER NOT NULL CHECK (usuarios > 0),
    fonte    TEXT NOT NULL,                -- "MovieLens ml-32m"
    data     TEXT NOT NULL,                -- data do dataset (2023-10-13)
    UNIQUE (filme_id, tag)
);
CREATE INDEX tags_movielens_por_tag ON tags_movielens(tag);

-- ratings.csv do MovieLens, agregado: quantas notas de cada valor (0,5 a 5) a
-- população deu (#172). A régua lê por ela a Nota de quem tem menos Notas que
-- `[rating_percentile] min_ratings`. Não é Fato: não vira Evidência.
CREATE TABLE notas_movielens (
    nota       REAL PRIMARY KEY CHECK (nota BETWEEN 0.5 AND 5),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0)
);

-- Tag Genome 2021: relevância prevista (0 a 1) de cada tag para cada filme.
CREATE TABLE genoma (
    fato_id    TEXT PRIMARY KEY,
    filme_id   TEXT NOT NULL,
    tag        TEXT NOT NULL,              -- em minúsculas, sem espaço nas pontas
    relevancia REAL NOT NULL CHECK (relevancia BETWEEN 0 AND 1),
    fonte      TEXT NOT NULL,              -- "Tag Genome 2021"
    data       TEXT NOT NULL,              -- data do dataset (2021-12-30)
    UNIQUE (filme_id, tag)
);
CREATE INDEX genoma_por_tag ON genoma(tag);
