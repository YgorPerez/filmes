-- O que as Restrições da Sessão consultam no Catálogo. A fixture preenche por
-- CSV; a ingestão real (#25) preenche as mesmas tabelas a partir do Wikidata.

-- Idioma original (P364). Um filme pode ter mais de um.
CREATE TABLE idiomas_originais (
    fato_id   TEXT PRIMARY KEY,
    filme_id  TEXT NOT NULL REFERENCES filmes(id),
    idioma_id TEXT NOT NULL,                -- QID do idioma, ex.: Q5146
    codigo    TEXT,                         -- ISO 639-1 (P218), ex.: pt
    rotulo    TEXT NOT NULL,                -- "português"
    fonte     TEXT NOT NULL,                -- "Wikidata"
    data      TEXT NOT NULL                 -- data do dump
);
CREATE INDEX idiomas_por_filme ON idiomas_originais(filme_id);

-- Já visto: quem já assistiu a qual filme. Por ora, quem deu Nota a ele.
-- O Feedback (#20) acrescenta aqui os Presentes das Sessões fechadas.
CREATE VIEW ja_vistos AS
SELECT DISTINCT pessoa, filme_id FROM notas;

-- Classificação etária como está na fonte, uma linha por propriedade e valor.
-- A conversão para a escala L, 6, 10, 12, 14, 16, 18 fica em faixas_etarias.
CREATE TABLE classificacoes (
    fato_id     TEXT PRIMARY KEY,
    filme_id    TEXT NOT NULL REFERENCES filmes(id),
    propriedade TEXT NOT NULL,              -- P3216 (ClassInd), P1657 (MPA), P2629 (BBFC)...
    rotulo      TEXT NOT NULL,              -- como o sistema escreve: "12A", "PG-13", "FSK 6"
    fonte       TEXT NOT NULL,              -- "Wikidata"
    data        TEXT NOT NULL,
    valor_wikidata TEXT                    -- QID quando o valor é um item
);
CREATE INDEX classificacoes_por_filme ON classificacoes(filme_id);

-- isAdult = 1 no title.basics do IMDb, inclusive para IDs fora de filmes.
CREATE TABLE adultos (
    fato_id  TEXT PRIMARY KEY,
    filme_id TEXT NOT NULL,
    fonte    TEXT NOT NULL,                 -- "IMDb"
    data     TEXT NOT NULL
);

-- Cada classificação que a tabela de conversão aceita, já na escala da ClassInd.
-- Preenchida na reconstrução a partir de classificacoes (etapas/60_faixas_etarias.py).
-- O fato_id é o da linha de classificacoes de onde ela veio.
CREATE TABLE faixas_etarias (
    fato_id     TEXT PRIMARY KEY REFERENCES classificacoes(fato_id),
    filme_id    TEXT NOT NULL REFERENCES filmes(id),
    faixa       TEXT NOT NULL,              -- L, 6, 10, 12, 14, 16, 18
    idade       INTEGER NOT NULL,           -- a faixa em anos, L = 0, para comparar
    sistema     TEXT NOT NULL,              -- ClassInd, MPA, BBFC...
    propriedade TEXT NOT NULL,
    rotulo      TEXT NOT NULL,
    convertida  INTEGER NOT NULL,           -- 0 só para a ClassInd
    fonte       TEXT NOT NULL,
    data        TEXT NOT NULL
);
CREATE INDEX faixas_por_filme ON faixas_etarias(filme_id);
