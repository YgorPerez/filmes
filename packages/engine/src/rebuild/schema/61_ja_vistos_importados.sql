-- Quem já assistiu a qual filme: toda Nota (do import, do Feedback ou declarada)
-- e todo registro da tabela ja_visto (Feedback, diário e watched.csv do Letterboxd,
-- histórico do Trakt). O sinal Já visto e a Restrição "sem Já visto" leem daqui.
-- O tipo de uma Nota é o da Nota (nota, declarado ou relato).
CREATE VIEW ja_vistos AS
SELECT fato_id, pessoa, filme_id, tipo, data, fonte FROM notas
UNION ALL
SELECT fato_id, pessoa, filme_id, tipo, data, fonte FROM ja_visto;
