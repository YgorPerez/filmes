-- O comentário de um Presente no Feedback é um Declarado específico sobre o Filme
-- escolhido (#40). Vem do arquivo da Sessão, não do arquivo da Pessoa, e leva a Sessão
-- aqui para o Feedback poder recarregar só as linhas dela.
ALTER TABLE declarados ADD COLUMN sessao TEXT;
CREATE INDEX declarados_por_sessao ON declarados(sessao);
