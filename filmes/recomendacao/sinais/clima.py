"""Bônus de Clima: linha do filme para cada Clima pedido que o filme sustenta.

Cada Clima do vocabulário (config/climas.toml) tem tags do MovieLens e gêneros.
Um Candidato ganha, por Clima pedido, a Evidência mais forte entre elas (veja
`_tags.py`). A Evidência não tem Pessoa: soma à pontuação da Regra de escolha,
nunca à utilidade de alguém. O peso está em [clima] da config.
"""

from filmes.recomendacao.sinais import _tags

CREDITOS = _tags.CREDITOS


def sinais_do_filme(rodada):
    peso = rodada.pesos["clima"]["peso"]
    for clima in rodada.climas:
        yield from _tags.melhores(rodada, f"Clima {clima.nome}", clima.tags, clima.generos, peso).values()
