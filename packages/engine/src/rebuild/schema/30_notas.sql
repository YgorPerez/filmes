-- Notas: cada linha é um Fato de Tipo nota. A fixture preenche por CSV;
-- os imports (#23, #24) e o Feedback (#20) preenchem a mesma tabela.
-- Sem chave estrangeira em filme_id: um import pode trazer filme fora do Catálogo.

CREATE TABLE notas (
    fato_id  TEXT PRIMARY KEY,
    pessoa   TEXT NOT NULL,
    filme_id TEXT NOT NULL,
    nota     REAL NOT NULL CHECK (nota BETWEEN 0.5 AND 5),
    data     TEXT NOT NULL,                 -- quando a Pessoa deu a Nota
    fonte    TEXT NOT NULL,                 -- "Letterboxd do Bruno"
    sessao   TEXT,                           -- a Sessão, quando a Nota veio do Feedback dela
    -- nota: a Pessoa deu. declarado: Nota declarada ("amo" vira 5, "odeio" vira 1),
    -- com o fato_id do Declarado. relato: o mesmo, contado pelo Dono.
    tipo     TEXT NOT NULL DEFAULT 'nota' CHECK (tipo IN ('nota', 'declarado', 'relato')),
    -- 1: a Nota de uma resposta às Perguntas par a par (#181). A régua a deixa
    -- fraca, e ela fica fora da Escala da Pessoa e dos vizinhos de gosto.
    par_a_par INTEGER NOT NULL DEFAULT 0 CHECK (par_a_par IN (0, 1))
);
CREATE INDEX notas_por_pessoa ON notas(pessoa, filme_id);

-- A Nota que vale de cada Pessoa para cada filme: a mais recente.
-- As outras continuam guardadas em notas (spec, história 41).
CREATE VIEW notas_vigentes AS
SELECT fato_id, pessoa, filme_id, nota, data, fonte, tipo, sessao, par_a_par FROM (
    SELECT *, row_number() OVER (PARTITION BY pessoa, filme_id ORDER BY data DESC, fato_id) AS ordem
    FROM notas
) WHERE ordem = 1;
