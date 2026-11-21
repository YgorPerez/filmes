ALTER TABLE filmes ADD COLUMN nota_imdb REAL;
ALTER TABLE filmes ADD COLUMN data_imdb TEXT;
ALTER TABLE filmes ADD COLUMN data_votos_imdb TEXT;

-- IDs do Wikidata, inclusive de títulos fora do Catálogo, para os imports.
-- P577 guarda as datas de estreia usadas para conferir o ano de um slug.
CREATE TABLE metadados_wikidata (
    item        TEXT NOT NULL,
    propriedade TEXT NOT NULL,
    valor       TEXT NOT NULL,
    fonte       TEXT NOT NULL,
    data        TEXT NOT NULL,
    PRIMARY KEY (item, propriedade, valor)
) WITHOUT ROWID;
CREATE INDEX metadados_wikidata_por_valor ON metadados_wikidata(propriedade, valor);

CREATE TABLE rotulos_wikidata (
    item TEXT PRIMARY KEY,
    pt   TEXT,
    en   TEXT,
    mul  TEXT,
    codigo TEXT          -- P218 quando o item é um idioma
) WITHOUT ROWID;
