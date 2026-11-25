-- Sessões e Feedback, do repo de dados (sessoes/<id>.md). O arquivo é a verdade:
-- reconstruir carrega todos, e recomendar e feedback regravam a Sessão que tocaram.
-- Sem chave estrangeira para filmes: o Filme escolhido pode sair do Catálogo numa atualização.

CREATE TABLE sessoes (
    id                        TEXT PRIMARY KEY,   -- nome do arquivo sem .md: 2026-11-20-iara
    data                      TEXT NOT NULL,
    regra                     TEXT NOT NULL,      -- padrao, media, de
    regra_pessoa              TEXT,               -- na regra "de"
    pedido                    TEXT,
    escolhido                 TEXT,               -- NULL enquanto aberta e em "não vimos nada"
    escolhido_na_recomendacao INTEGER,            -- posição; NULL se veio de fora
    feedback_em               TEXT                -- NULL enquanto aberta
);

CREATE TABLE sessao_presentes (
    sessao TEXT NOT NULL REFERENCES sessoes(id),
    pessoa TEXT NOT NULL,
    PRIMARY KEY (sessao, pessoa)
);

CREATE TABLE sessao_recomendacao (
    sessao   TEXT NOT NULL REFERENCES sessoes(id),
    posicao  INTEGER NOT NULL,
    filme_id TEXT NOT NULL,
    PRIMARY KEY (sessao, posicao)
);

-- Cada reação do Feedback é um Fato. A de Tipo nota tem o mesmo fato_id da linha
-- que ela gera em notas; a de Tipo relato só existe aqui.
-- valor é a reação de 0 a 1 que o Crédito usa: (nota - 0,5) / 4,5, ou 1 / 0,5 / 0.
CREATE TABLE reacoes (
    fato_id   TEXT PRIMARY KEY,
    sessao    TEXT NOT NULL REFERENCES sessoes(id),
    pessoa    TEXT NOT NULL,
    filme_id  TEXT NOT NULL,
    tipo      TEXT NOT NULL CHECK (tipo IN ('nota', 'relato')),
    nota      REAL,                               -- Tipo nota
    reacao    TEXT,                               -- Tipo relato: gostou, neutro, não gostou
    repassada INTEGER NOT NULL DEFAULT 0,         -- Nota que o Dono repassou de outra Pessoa
    valor     REAL NOT NULL CHECK (valor BETWEEN 0 AND 1),
    data      TEXT NOT NULL,                      -- data do Feedback
    fonte     TEXT NOT NULL
);
CREATE INDEX reacoes_por_sessao ON reacoes(sessao, pessoa);

-- Já visto: a Pessoa assistiu ao filme. O Feedback grava um por Presente; os imports
-- (watched do Letterboxd, histórico do Trakt) gravam aqui também, sem sessao.
-- tipo: declarado quando a própria Pessoa diz (o Dono no Feedback, o diário dela),
-- relato quando o Dono diz por ela.
CREATE TABLE ja_visto (
    fato_id  TEXT PRIMARY KEY,
    pessoa   TEXT NOT NULL,
    filme_id TEXT NOT NULL,
    tipo     TEXT NOT NULL CHECK (tipo IN ('declarado', 'relato')),
    data     TEXT NOT NULL,
    fonte    TEXT NOT NULL,
    sessao   TEXT
);
CREATE INDEX ja_visto_por_pessoa ON ja_visto(pessoa, filme_id);
