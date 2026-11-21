"""Já visto: a Pessoa já assistiu ao Candidato. Pesa contra, sempre com Força forte.

Lê a tabela `ja_visto` (o Feedback grava; os imports de watched e histórico também
devem gravar). Uma Evidência por filme: o registro mais recente.
"""

from filmes.evidencia import Evidencia, regua

_SQL = """
SELECT filme_id, fato_id, tipo, data, fonte FROM (
    SELECT *, row_number() OVER (PARTITION BY filme_id ORDER BY data DESC, fato_id) AS ordem
    FROM ja_visto WHERE pessoa = ?
) WHERE ordem = 1 ORDER BY filme_id
"""


def sinais(rodada, pessoa):
    peso = rodada.pesos["ja_visto"]["peso"]
    for linha in rodada.conn.execute(_SQL, (pessoa,)):
        if linha["filme_id"] in rodada.candidatos:
            yield Evidencia(pessoa=pessoa, filme_id=linha["filme_id"], texto="já viu", fonte=linha["fonte"],
                            data=linha["data"], forca=regua.FORCA_JA_VISTO, tipo=linha["tipo"],
                            fato_id=linha["fato_id"], base=-peso)
