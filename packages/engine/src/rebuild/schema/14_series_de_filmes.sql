-- Os itens do Wikidata que são série de filmes ou franquia: P31 numa classe sob
-- Q24856 (série de filmes) ou Q196600 (franquia de mídia) pela P279. O P179 de
-- um filme também aponta para listas e rankings ("os 100 melhores da BBC"); a
-- aresta de série que não cai aqui sai na reconstrução. Tabela vazia (manifesto
-- anterior ao #49): as arestas de série ficam todas.
CREATE TABLE series_de_filmes (
    item   TEXT NOT NULL,                   -- QID da série
    classe TEXT NOT NULL,                   -- QID do P31 que a põe sob Q24856 ou Q196600
    PRIMARY KEY (item, classe)
) WITHOUT ROWID;
