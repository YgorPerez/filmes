"""Vizinhança item-item do MovieLens: Nota da Pessoa -> vizinho no MovieLens -> Candidato.

Cada Nota a favor (3 ou mais) da Pessoa num filme X vira semente. Para cada
vizinho Y de X que é Candidato, sai uma Evidência de Tipo review: "deu 5 a X, e
de 3.104 pessoas que deram 4+ a ele, 64% deram 4+ a este". A Força vem da base
e da proporção, limitada pela Força da Nota-semente (régua). Nota contra não é
semente: gostar de Y quem gostou de X não diz nada de quem não gostou de X.

O peso está em [vizinhanca] da config.
"""

from filmes.evidencia import Evidencia, regua, texto

_SQL = """
SELECT v.vizinho_id AS candidato, v.fato_id, v.base, v.ambos, v.fonte, v.data,
       n.nota, n.data AS nota_data, f.titulo, f.ano
FROM notas_vigentes n
JOIN vizinhos v ON v.filme_id = n.filme_id
JOIN filmes f   ON f.id = n.filme_id
WHERE n.pessoa = :pessoa
ORDER BY v.vizinho_id, v.fato_id
"""


def sinais(rodada, pessoa):
    peso = rodada.pesos["vizinhanca"]["peso"]
    for linha in rodada.conn.execute(_SQL, {"pessoa": pessoa}):
        if linha["candidato"] not in rodada.candidatos:
            continue
        forca_semente, direcao = regua.forca_nota(linha["nota"], linha["nota_data"], rodada.hoje)
        if direcao < 0:
            continue
        forca = regua.forca_vizinhanca(linha["base"], linha["ambos"], teto=forca_semente)
        if forca is None:
            continue
        yield Evidencia(
            pessoa=pessoa, filme_id=linha["candidato"],
            texto=(f"deu {texto.nota(linha['nota'])} a {texto.filme(linha['titulo'], linha['ano'])}, "
                   f"e de {texto.inteiro(linha['base'])} pessoas que deram 4+ a ele, "
                   f"{100 * linha['ambos'] // linha['base']}% deram 4+ a este"),
            fonte=linha["fonte"], data=linha["data"], forca=forca, tipo="review",
            fato_id=linha["fato_id"], base=peso,
        )
