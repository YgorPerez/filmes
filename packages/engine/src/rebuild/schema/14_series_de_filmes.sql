-- Os itens do Wikidata que são série de filmes ou franquia: P31 numa classe sob
-- Q24856 (série de filmes) ou Q196600 (franquia de mídia) pela P279. O P179 de
-- um filme também aponta para listas e rankings ("os 100 melhores da BBC"); a
-- aresta de série que não cai aqui sai na reconstrução. Tabela vazia (manifesto
-- anterior ao #49): as arestas de série ficam todas.
--
-- `raiz` diz sob qual das duas a classe cai (#165): só a série de filmes conta
-- para a Série na ordem, a franquia (Marvel, Star Wars) não. Um dump anterior
-- ao #165 não traz a raiz; ela fica nula, salvo quando a própria classe é uma
-- das duas.
CREATE TABLE series_de_filmes (
    item   TEXT NOT NULL,                   -- QID da série
    classe TEXT NOT NULL,                   -- QID do P31 que a põe sob Q24856 ou Q196600
    raiz   TEXT,                            -- Q24856 ou Q196600; nula se o dump não diz
    UNIQUE (item, classe, raiz)
);
CREATE INDEX series_de_filmes_por_raiz ON series_de_filmes(raiz, item);

-- A data de estreia de cada filme (P577 do Wikidata, a mais antiga), que ordena
-- os filmes de uma série (#165). O Wikidata grava a data só com ano como 1º de
-- janeiro; aqui ela fica só com o ano. Filme sem P577 não tem linha.
CREATE TABLE estreias (
    filme_id TEXT PRIMARY KEY REFERENCES filmes(id),
    data     TEXT NOT NULL                  -- AAAA-MM-DD, ou AAAA quando só o ano é certo
) WITHOUT ROWID;
