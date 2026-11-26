-- Quanto as notas do MovieLens de cada filme se espalham: a entropia (em bits)
-- do histograma das notas de meio em meio ponto, e quantas notas são. As
-- Perguntas par a par (#181) escolhem os filmes por entropia × ln(avaliacoes)
-- (Rashid et al. 2002): um filme que muita gente viu e que divide opiniões diz
-- mais sobre quem responde. A ingestão real preenche a partir do ml-32m; a
-- fixture, por CSV. Não é Fato: não vira Evidência.

CREATE TABLE entropia_movielens (
    filme_id   TEXT PRIMARY KEY,
    avaliacoes INTEGER NOT NULL CHECK (avaliacoes > 0),
    entropia   REAL NOT NULL CHECK (entropia >= 0)
) WITHOUT ROWID;
