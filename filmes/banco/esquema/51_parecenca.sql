-- O que a parecença (filmes/recomendacao/parecenca.py) usa do Tag Genome e das
-- tags do MovieLens inteiros, calculado uma vez na reconstrução
-- (filmes/banco/etapas/70_parecenca.py) em vez de a cada `recomendar --parecido`.

-- Por tag: no genoma, a média da relevância sobre todos os filmes do genoma (o
-- filme sem a linha conta 0); nas tags do MovieLens, a raridade, ln(filmes com
-- alguma tag / filmes com esta).
CREATE TABLE tags_no_catalogo (
    fonte TEXT NOT NULL CHECK (fonte IN ('genoma', 'tags_movielens')),
    tag   TEXT NOT NULL,
    valor REAL NOT NULL,
    PRIMARY KEY (fonte, tag)
) WITHOUT ROWID;

-- A norma do vetor TF-IDF das tags do MovieLens de cada filme:
-- raiz da soma de (ln(1 + usuários) × raridade)².
CREATE TABLE normas_tags_movielens (
    filme_id TEXT PRIMARY KEY,
    norma    REAL NOT NULL
) WITHOUT ROWID;
