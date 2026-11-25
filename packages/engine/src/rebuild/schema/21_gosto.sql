-- O gosto que as Pessoas disseram e o que o Dono contou delas, do arquivo da Pessoa.
-- Alvo é um filme (tconst, "tt...") ou uma entidade do Catálogo (QID, "Q...").

-- Veto: tira os filmes do alvo em toda Sessão com a Pessoa entre os Presentes.
CREATE TABLE vetos (
    fato_id TEXT PRIMARY KEY,
    pessoa  TEXT NOT NULL REFERENCES pessoas(slug),
    alvo    TEXT NOT NULL,
    rotulo  TEXT NOT NULL,                  -- título ou rótulo do alvo, como estava no arquivo
    texto   TEXT NOT NULL,                  -- "nunca vê terror"
    data    TEXT NOT NULL
);
CREATE INDEX vetos_por_pessoa ON vetos(pessoa);

-- Declarado: o que a Pessoa disse do próprio gosto (questionário, review ou tag dela).
-- Relato: o que o Dono disse do gosto dela. As duas tabelas têm a mesma forma.
-- Com reação e alvo entidade, viram Evidência nos filmes ligados ao alvo; com alvo
-- filme e reação ama ou odeia, viram também Nota declarada (5 ou 1) em notas.
CREATE TABLE declarados (
    fato_id    TEXT PRIMARY KEY,
    pessoa     TEXT NOT NULL REFERENCES pessoas(slug),
    data       TEXT NOT NULL,
    fonte      TEXT NOT NULL,
    especifico INTEGER NOT NULL,            -- 1: nomeia filme, diretor, ator, subgênero; 0: genérico
    reacao     TEXT CHECK (reacao IN ('ama', 'gosta', 'nao_gosta', 'odeia')),
    alvo       TEXT,
    rotulo     TEXT,
    texto      TEXT NOT NULL
);
CREATE INDEX declarados_por_pessoa ON declarados(pessoa);

CREATE TABLE relatos (
    fato_id    TEXT PRIMARY KEY,
    pessoa     TEXT NOT NULL REFERENCES pessoas(slug),
    data       TEXT NOT NULL,
    fonte      TEXT NOT NULL,
    especifico INTEGER NOT NULL,
    reacao     TEXT CHECK (reacao IN ('ama', 'gosta', 'nao_gosta', 'odeia')),
    alvo       TEXT,
    rotulo     TEXT,
    texto      TEXT NOT NULL
);
CREATE INDEX relatos_por_pessoa ON relatos(pessoa);
