"""Bônus da nota do IMDb: linha do filme para o Candidato com nota acima da mínima.

O bônus é [nota_imdb] peso × (nota − mínima) / (10 − mínima), com a mínima de
[catalogo] nota_imdb_minima: um filme no limite ganha 0, um 10 ganha o peso
inteiro. Como o do Clima, soma à pontuação da Regra de escolha e nunca à
utilidade de alguém (decisão do Dono, 2026-11-22). A linha não conta como Fato
sobre o filme: um filme só com ela continua entre os só com palpites.
"""

from filmes.banco import fato_id
from filmes.evidencia import Evidencia, regua, texto

TABELA = "nota_imdb"  # prefixo do fato_id da linha: `e_da_nota` a reconhece no JSON da saída


def e_da_nota(linha: dict) -> bool:
    """A linha do filme (como sai no JSON) é a da nota do IMDb, que não conta como Fato."""
    return (linha.get("fato_id") or "").startswith(TABELA + ":")


def sinais_do_filme(rodada):
    peso = rodada.pesos["nota_imdb"]["peso"]
    minima = rodada.pesos["catalogo"]["nota_imdb_minima"]
    if not peso or minima >= 10:
        return
    for filme_id, filme in rodada.candidatos.items():
        nota = filme["nota_imdb"]
        if nota is None or nota <= minima:
            continue
        yield Evidencia(
            pessoa=None, filme_id=filme_id, texto=f"nota {texto.nota(nota)} no IMDb",
            fonte="IMDb", data=filme["data_imdb"], forca=regua.forca_nota_imdb(), tipo="metadado",
            fato_id=fato_id(TABELA, filme_id, nota), base=peso * (nota - minima) / (10 - minima),
            conta_como_fato=False,
        )
