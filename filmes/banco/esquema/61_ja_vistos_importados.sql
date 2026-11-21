-- O diário e watched.csv usam a mesma tabela que o Feedback (#20).
CREATE TABLE IF NOT EXISTS ja_visto (
    fato_id  TEXT PRIMARY KEY,
    pessoa   TEXT NOT NULL,
    filme_id TEXT NOT NULL,
    tipo     TEXT NOT NULL CHECK (tipo IN ('declarado', 'relato')),
    data     TEXT NOT NULL,
    fonte    TEXT NOT NULL,
    sessao   TEXT
);
CREATE INDEX IF NOT EXISTS ja_visto_por_pessoa ON ja_visto(pessoa, filme_id);

DROP VIEW ja_vistos;
CREATE VIEW ja_vistos AS
SELECT pessoa, filme_id FROM notas
UNION
SELECT pessoa, filme_id FROM ja_visto;
