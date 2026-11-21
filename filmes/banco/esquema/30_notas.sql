-- Notas: cada linha é um Fato de Tipo nota. A fixture preenche por CSV;
-- os imports (#23, #24) e o Feedback (#20) preenchem a mesma tabela.
-- Sem chave estrangeira em filme_id: um import pode trazer filme fora do Catálogo.

CREATE TABLE notas (
    fato_id  TEXT PRIMARY KEY,
    pessoa   TEXT NOT NULL,
    filme_id TEXT NOT NULL,
    nota     REAL NOT NULL CHECK (nota BETWEEN 0.5 AND 5),
    data     TEXT NOT NULL,                 -- quando a Pessoa deu a Nota
    fonte    TEXT NOT NULL                  -- "Letterboxd do Bruno"
);
CREATE INDEX notas_por_pessoa ON notas(pessoa, filme_id);

-- A Nota que vale de cada Pessoa para cada filme: a mais recente.
-- As outras continuam guardadas em notas (spec, história 41).
CREATE VIEW notas_vigentes AS
SELECT fato_id, pessoa, filme_id, nota, data, fonte FROM (
    SELECT *, row_number() OVER (PARTITION BY pessoa, filme_id ORDER BY data DESC, fato_id) AS ordem
    FROM notas
) WHERE ordem = 1;
