-- Vizinhos de gosto (#174): as notas de uma amostra de usuários do ml-32m, de
-- quem o motor acha os mais próximos de cada Pessoa. A ingestão real guarda os
-- usuários com userId múltiplo de 10 e pelo menos 50 notas em filmes ligados
-- ao IMDb; a fixture preenche por CSV. Não são Fatos: a Evidência sai do que
-- os vizinhos deram ao Candidato, com a Fonte e a data de fonte_gosto_movielens.
CREATE TABLE notas_gosto_movielens (
    usuario  INTEGER NOT NULL,             -- userId do MovieLens
    filme_id TEXT NOT NULL,
    nota     REAL NOT NULL CHECK (nota BETWEEN 0.5 AND 5),
    PRIMARY KEY (usuario, filme_id)
) WITHOUT ROWID;
CREATE INDEX notas_gosto_por_filme ON notas_gosto_movielens(filme_id, usuario, nota);

-- A Fonte e a data da amostra: uma linha ("MovieLens ml-32m", 2023-10-13).
CREATE TABLE fonte_gosto_movielens (
    fonte TEXT NOT NULL,
    data  TEXT NOT NULL
);

-- O percentil de cada nota de cada usuário na escala dele (a parte das notas
-- dele abaixo desta, mais metade das iguais), calculado na reconstrução
-- (etapa 71_escalas_de_gosto), como o Percentil da Nota de uma Pessoa.
CREATE TABLE percentis_gosto_movielens (
    usuario   INTEGER NOT NULL,
    nota      REAL NOT NULL,
    percentil REAL NOT NULL CHECK (percentil BETWEEN 0 AND 1),
    PRIMARY KEY (usuario, nota)
) WITHOUT ROWID;
