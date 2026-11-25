-- Pessoas, do repo de dados. Nenhuma idade é guardada.

CREATE TABLE pessoas (
    slug TEXT PRIMARY KEY,                  -- nome do arquivo em pessoas/
    nome TEXT NOT NULL,
    dono INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE apelidos (
    pessoa  TEXT NOT NULL REFERENCES pessoas(slug),
    apelido TEXT NOT NULL,
    PRIMARY KEY (pessoa, apelido)
);
