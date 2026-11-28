-- Escolha de grupo: um grupo de filmes de config/film_groups.toml que a Pessoa disse
-- ter mais a cara dela, no Link da Sessão (#415), do arquivo dela. Uma linha por
-- filme do grupo, na ordem do arquivo. Os filmes são sementes fracas da vizinhança
-- do MovieLens; não são Nota nem Já visto, e ficam fora da Escala, da Calibração
-- e dos Vizinhos de gosto.
CREATE TABLE escolhas_de_grupo (
    fato_id  TEXT NOT NULL,
    pessoa   TEXT NOT NULL REFERENCES pessoas(slug),
    grupo    TEXT NOT NULL,                 -- a chave do grupo em film_groups.toml
    rotulo   TEXT NOT NULL,                 -- o nome do grupo, como estava no arquivo
    filme_id TEXT NOT NULL,
    ordem    INTEGER NOT NULL,              -- 0, 1, 2: a ordem dos filmes no arquivo
    data     TEXT NOT NULL,
    fonte    TEXT NOT NULL,
    PRIMARY KEY (fato_id, filme_id)
);
CREATE INDEX escolhas_de_grupo_por_pessoa ON escolhas_de_grupo(pessoa);
