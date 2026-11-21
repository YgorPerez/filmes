"""Linha do filme a partir de tags do MovieLens, do Tag Genome ou de gênero.

Os sinais de Clima e de grupo/sozinho usam o mesmo caminho: para um conjunto de
tags (e, no Clima, de gêneros), cada Candidato ganha no máximo uma Evidência, a
mais forte que achar. Um filme com cinco tags do mesmo Clima não ganha cinco
bônus. Empate de Força: tags.csv antes do genome, o genome antes do gênero,
depois a maior contagem ou relevância.
"""

from decimal import ROUND_DOWN, Decimal

from filmes.evidencia import Evidencia, regua, texto


def melhores(rodada, rotulo: str, tags, generos=(), peso: float = 1.0) -> dict:
    """Candidato -> a Evidência mais forte entre as tags e gêneros dados."""
    achadas = {}

    def considerar(filme_id, evidencia, desempate):
        if filme_id not in rodada.candidatos:
            return
        chave = (regua.FORCAS.index(evidencia.forca), *desempate)
        if filme_id not in achadas or chave > achadas[filme_id][0]:
            achadas[filme_id] = (chave, evidencia)

    marcas = ",".join("?" * len(tags))
    for l in rodada.conn.execute(
            f"SELECT * FROM tags_movielens WHERE tag IN ({marcas}) ORDER BY filme_id, tag", list(tags)):
        forca = regua.forca_tag_movielens(l["usuarios"])
        if forca:
            considerar(l["filme_id"], Evidencia(
                pessoa=None, filme_id=l["filme_id"], forca=forca, tipo="review",
                texto=f'{rotulo}: {texto.inteiro(l["usuarios"])} usuários do MovieLens marcaram o filme '
                      f'com a tag "{l["tag"]}"',
                fonte=l["fonte"], data=l["data"], fato_id=l["fato_id"], base=peso,
            ), (2, l["usuarios"], l["tag"]))

    for l in rodada.conn.execute(
            f"SELECT * FROM genoma WHERE tag IN ({marcas}) ORDER BY filme_id, tag", list(tags)):
        forca = regua.forca_genoma(l["relevancia"])
        if forca:
            considerar(l["filme_id"], Evidencia(
                pessoa=None, filme_id=l["filme_id"], forca=forca, tipo="review",
                texto=f'{rotulo}: relevância {_decimal(l["relevancia"])} da tag "{l["tag"]}" para o filme '
                      f'no Tag Genome',
                fonte=l["fonte"], data=l["data"], fato_id=l["fato_id"], base=peso,
            ), (1, l["relevancia"], l["tag"]))

    if generos:
        marcas = ",".join("?" * len(generos))
        for l in rodada.conn.execute(
                f"""SELECT a.filme_id, a.fato_id, a.fonte, a.data, e.rotulo FROM arestas a
                    JOIN entidades e ON e.id = a.entidade_id
                    WHERE a.predicado = 'genero' AND a.entidade_id IN ({marcas})
                    ORDER BY a.filme_id, e.rotulo""", list(generos)):
            considerar(l["filme_id"], Evidencia(
                pessoa=None, filme_id=l["filme_id"], forca=regua.forca_genero_no_clima(), tipo="metadado",
                texto=f"{rotulo}: do gênero {l['rotulo']}",
                fonte=l["fonte"], data=l["data"], fato_id=l["fato_id"], base=peso,
            ), (0, 0, l["rotulo"]))

    return {filme_id: evidencia for filme_id, (_, evidencia) in achadas.items()}


def _decimal(valor: float) -> str:
    """Duas casas, cortadas e não arredondadas: 0,799 sai "0,79", abaixo do limiar
    de 0,80 da régua, como a Força da linha."""
    return str(Decimal(str(valor)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)).replace(".", ",")
