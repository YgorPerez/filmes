-- Import do Letterboxd (#23). As Notas vão para `notas`, as reviews e tags para
-- `declarados`; aqui ficam o resto e o que a resolução precisa.
-- Todo Fato que sai de um ZIP tem fato_id começando por "letterboxd:".

-- P6127 do Wikidata (Letterboxd film ID): o slug da URL do filme no Letterboxd e
-- os IDs que o item traz. A ingestão real (#25) preenche pelo QLever; a fixture, por CSV.
-- Um item pode ter mais de um slug, e um slug mais de um item.
CREATE TABLE slugs_letterboxd (
    slug       TEXT NOT NULL,               -- P6127, ex.: drive-2011
    item       TEXT NOT NULL,               -- QID
    imdb       TEXT,                        -- P345 (tconst)
    tmdb       TEXT,                        -- P4947 (TMDB filme)
    tmdb_serie TEXT,                        -- P4983 (TMDB série): sem tmdb, é minissérie
    ano        INTEGER,                     -- ano da P577 mais antiga do item
    PRIMARY KEY (slug, item)
);

-- O que a Pessoa marcou para ver um dia. Fato guardado; nenhum sinal o usa ainda.
CREATE TABLE watchlist (
    fato_id  TEXT PRIMARY KEY,
    pessoa   TEXT NOT NULL REFERENCES pessoas(slug),
    filme_id TEXT NOT NULL,
    data     TEXT NOT NULL,
    fonte    TEXT NOT NULL
);

-- Cada filme dos ZIPs de cada Pessoa e como ele foi resolvido. A fila manual é
-- situacao = 'fila'. O id identifica o par (Name, Year) para todas as Pessoas.
CREATE TABLE itens_letterboxd (
    pessoa     TEXT NOT NULL REFERENCES pessoas(slug),
    id         TEXT NOT NULL,
    nome       TEXT NOT NULL,               -- Name do export
    ano        INTEGER,                     -- Year do export
    situacao   TEXT NOT NULL CHECK (situacao IN ('resolvido', 'descartado', 'fila')),
    caminho    TEXT CHECK (caminho IN ('wikidata', 'tmdb', 'manual')),
    filme_id   TEXT,                        -- tconst, quando resolvido
    motivo     TEXT,                        -- por que foi descartado ou está na fila
    PRIMARY KEY (pessoa, id)
);
