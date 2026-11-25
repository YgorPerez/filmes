-- Gêneros do IMDb (coluna genres do title.basics), para o cabeçalho do filme
-- na Recomendação. Não é Fato nem entra nos sinais: o gênero que vira
-- Evidência é o do Wikidata, em arestas. `genero` fica como o IMDb escreve
-- ("Sci-Fi"); a tradução sai de filmes/catalogo/generos.py.
CREATE TABLE generos_imdb (
    filme_id TEXT NOT NULL REFERENCES filmes(id),
    ordem    INTEGER NOT NULL,              -- posição na coluna genres, a partir de 1
    genero   TEXT NOT NULL,
    PRIMARY KEY (filme_id, ordem)
) WITHOUT ROWID;
