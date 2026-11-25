-- Ajuste: quanto um elo do caminho de conteúdo (diretor, roteiro, elenco, série,
-- gênero) pesa para a Pessoa, do frontmatter do arquivo dela. Elo sem linha é "normal".
CREATE TABLE ajustes (
    fato_id TEXT PRIMARY KEY,
    pessoa  TEXT NOT NULL REFERENCES pessoas(slug),
    elo     TEXT NOT NULL,
    nivel   TEXT NOT NULL CHECK (nivel IN ('nada', 'pouco', 'muito')),
    data    TEXT NOT NULL,
    UNIQUE (pessoa, elo)
);
