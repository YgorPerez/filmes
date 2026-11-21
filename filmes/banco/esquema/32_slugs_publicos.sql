-- Contrato compartilhado com o import do Letterboxd (#23).
CREATE TABLE IF NOT EXISTS slugs_letterboxd (
    slug       TEXT NOT NULL,
    item       TEXT NOT NULL,
    imdb       TEXT,
    tmdb       TEXT,
    tmdb_serie TEXT,
    ano        INTEGER,
    PRIMARY KEY (slug, item)
);
