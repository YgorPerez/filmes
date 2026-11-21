"""Cabeçalho de cada filme da Recomendação: link do IMDb, gêneros e capa.

São campos de apresentação, fora das Evidências: não são Motivo, não têm
Força e o verificador não olha para eles. A capa vem do TMDB sob demanda,
só para os filmes devolvidos; sem chave ou com falha, sai nula e a fonte
avisa uma vez em "avisos".
"""

from filmes.catalogo.generos import em_portugues
from filmes.sob_demanda import tmdb  # módulo, não a classe: tmdb.py importa recomendacao.atribuicoes


def do_filme(contexto, filme) -> dict:
    generos = contexto.conn.execute(
        "SELECT genero FROM generos_imdb WHERE filme_id = ? ORDER BY ordem", (filme["id"],))
    return {
        "imdb": f"https://www.imdb.com/title/{filme['id']}/",
        "generos": [em_portugues(g) for (g,) in generos],
        "capa": tmdb.CapasTMDB.de(contexto).capa(filme["id"]),
    }
