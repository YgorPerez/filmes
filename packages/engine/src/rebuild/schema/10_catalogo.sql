-- Catálogo: filmes, entidades (diretor, ator, gênero...) e as arestas filme-entidade.
-- A fixture preenche estas tabelas direto por CSV; a ingestão real (#25) preenche
-- as mesmas a partir dos dumps do IMDb e do Wikidata.

CREATE TABLE filmes (
    id          TEXT PRIMARY KEY,           -- tconst do IMDb
    titulo      TEXT NOT NULL,
    ano         INTEGER,
    duracao_min INTEGER,
    votos       INTEGER NOT NULL DEFAULT 0  -- numVotes do IMDb
);

CREATE TABLE entidades (
    id     TEXT PRIMARY KEY,                -- QID do Wikidata
    rotulo TEXT NOT NULL
);

-- Cada aresta é um Fato de Tipo metadado.
CREATE TABLE arestas (
    fato_id     TEXT PRIMARY KEY,
    filme_id    TEXT NOT NULL REFERENCES filmes(id),
    predicado   TEXT NOT NULL,              -- diretor, elenco, genero...
    entidade_id TEXT NOT NULL REFERENCES entidades(id),
    fonte       TEXT NOT NULL,
    data        TEXT NOT NULL               -- data do dump
);
CREATE INDEX arestas_por_entidade ON arestas(entidade_id, predicado);
CREATE INDEX arestas_por_filme ON arestas(filme_id, predicado);
