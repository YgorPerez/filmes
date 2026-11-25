-- Pergunta aberta: pergunta de gosto que o Claude fez e a Pessoa pulou, do frontmatter
-- do arquivo dela. Volta uma vez, quando o assunto aparece na tela; pulada duas vezes,
-- sai do arquivo e daqui. O assunto é uma entidade do Catálogo (Q...) ou um grupo de
-- tags de config/vetos_por_tag.toml; sem assunto, a pergunta é só o texto.
CREATE TABLE perguntas_abertas (
    fato_id TEXT PRIMARY KEY,
    pessoa  TEXT NOT NULL REFERENCES pessoas(slug),
    texto   TEXT NOT NULL,
    assunto TEXT,
    rotulo  TEXT,                       -- rótulo do assunto, como estava no arquivo
    data    TEXT NOT NULL,              -- a última vez que foi pulada
    puladas INTEGER NOT NULL CHECK (puladas >= 1)
);
CREATE INDEX perguntas_abertas_por_assunto ON perguntas_abertas(assunto);
