-- Hierarquia de gêneros do Wikidata (P279, "subclasse de"): cada gênero que
-- algum filme usa e as classes acima dele. Um Veto a gênero desce por aqui
-- até os subgêneros. Não é Fato sobre filme; vem do dump wikidata-subgeneros.
CREATE TABLE subclasses_wikidata (
    item   TEXT NOT NULL,                   -- QID da subclasse
    classe TEXT NOT NULL,                   -- QID da classe imediatamente acima
    PRIMARY KEY (item, classe)
) WITHOUT ROWID;
CREATE INDEX subclasses_por_classe ON subclasses_wikidata(classe);
