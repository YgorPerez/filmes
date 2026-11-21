"""Declarados e Relatos com alvo entidade: "adoro os filmes da Sofia Rangel".

Cada Declarado ou Relato com reação vira uma Evidência em cada Candidato ligado
à entidade por alguma aresta. A Força sai da régua (específico ou genérico,
Declarado ou Relato, idade); a base é [pessoas] peso_dito, com o sinal da reação.

Os que têm alvo filme não passam por aqui: com ama ou odeia viram Nota declarada
e entram como semente do caminho de conteúdo.
"""

from filmes.evidencia import Evidencia, regua

_DIRECAO = {"ama": 1, "gosta": 1, "nao_gosta": -1, "odeia": -1}

# Como a ligação do Candidato com a entidade aparece no texto.
_LIGACAO = {
    "diretor": "dirigido por {entidade}",
    "elenco": "com {entidade} no elenco",
    "genero": "do gênero {entidade}",
}

_ABERTURA = {"declarados": 'disse "{texto}"', "relatos": 'segundo o Dono, "{texto}"'}
_TIPO = {"declarados": "declarado", "relatos": "relato"}

_SQL = """
SELECT d.fato_id, d.data, d.fonte, d.especifico, d.reacao, d.texto,
       a.filme_id, a.predicado, e.rotulo AS entidade
FROM {tabela} d
JOIN arestas a   ON a.entidade_id = d.alvo
JOIN entidades e ON e.id = d.alvo
WHERE d.pessoa = :pessoa AND d.reacao IS NOT NULL
ORDER BY d.fato_id, a.filme_id, a.predicado
"""


def sinais(rodada, pessoa):
    peso = rodada.pesos["pessoas"]["peso_dito"]
    for tabela in ("declarados", "relatos"):
        vistos = set()
        for linha in rodada.conn.execute(_SQL.format(tabela=tabela), {"pessoa": pessoa}):
            chave = (linha["fato_id"], linha["filme_id"])
            if linha["filme_id"] not in rodada.candidatos or chave in vistos:
                continue
            vistos.add(chave)
            ligacao = _LIGACAO.get(linha["predicado"], linha["predicado"] + ": {entidade}")
            yield Evidencia(
                pessoa=pessoa, filme_id=linha["filme_id"],
                texto=_ABERTURA[tabela].format(texto=linha["texto"]) + "; " + ligacao.format(entidade=linha["entidade"]),
                fonte=linha["fonte"], data=linha["data"],
                forca=regua.forca_dito(_TIPO[tabela], bool(linha["especifico"]), linha["data"], rodada.hoje),
                tipo=_TIPO[tabela], fato_id=linha["fato_id"], base=peso * _DIRECAO[linha["reacao"]],
            )
