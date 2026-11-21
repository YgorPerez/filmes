"""Bônus de grupo ou sozinho: linha do filme conforme o tamanho da Sessão.

Com 2 ou mais Presentes, um Candidato com tag de "grupo" (config/grupo_sozinho.toml)
ganha a linha "para ver em grupo"; com 1 Presente, um com tag de "sozinho" ganha
"para ver sozinho". Só bônus: o filme do outro eixo não perde nada. Uma linha por
filme, a mais forte (veja `_tags.py`). O peso está em [grupo] da config.
"""


from filmes.ambiente import RAIZ, ler_toml
from filmes.recomendacao.sinais import _tags

VOCABULARIO = RAIZ / "config" / "grupo_sozinho.toml"


def sinais_do_filme(rodada):
    eixos = ler_toml(VOCABULARIO)
    eixo, rotulo = ("grupo", "para ver em grupo") if rodada.em_grupo else ("sozinho", "para ver sozinho")
    tags = [t.lower() for t in eixos.get(eixo, [])]
    yield from _tags.melhores(rodada, rotulo, tags, peso=rodada.pesos["grupo"]["peso"]).values()
