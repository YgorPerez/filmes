-- Os 3 primeiros créditos de ator ou atriz de cada filme no title.principals do
-- IMDb, na ordem do campo `ordering`. Filme sem linha aqui: o IMDb não diz quem
-- é protagonista, e a régua do elenco fica como está.
CREATE TABLE elenco_principal_imdb (
    filme_id  TEXT NOT NULL REFERENCES filmes(id),
    ordem     INTEGER NOT NULL,             -- 1 a 3, entre os atores e atrizes do filme
    ator_imdb TEXT NOT NULL,                -- nconst
    PRIMARY KEY (filme_id, ordem)
) WITHOUT ROWID;

-- O nconst de cada ator ou atriz do Wikidata (P345), para casar a aresta de elenco com o crédito.
CREATE TABLE atores_imdb (
    item TEXT NOT NULL,                     -- QID
    imdb TEXT NOT NULL,                     -- nconst
    PRIMARY KEY (item, imdb)
) WITHOUT ROWID;
CREATE INDEX atores_imdb_por_imdb ON atores_imdb(imdb);

-- A entidade de elenco que está entre os 3 primeiros créditos do filme.
CREATE VIEW elenco_principal AS
SELECT DISTINCT c.filme_id, a.item AS entidade_id
FROM elenco_principal_imdb c JOIN atores_imdb a ON a.imdb = c.ator_imdb;
