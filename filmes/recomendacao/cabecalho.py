"""Cabeçalho de cada filme da Recomendação: link do IMDb, gêneros, capa, título
em português e sinopse.

São campos de apresentação, fora das Evidências: não são Motivo, não têm
Força e o verificador não olha para eles. Capa, título em português e sinopse
vêm de uma só consulta ao TMDB em pt-BR, só para os filmes devolvidos; sem
chave ou com falha, saem nulos e a fonte avisa uma vez em "avisos".
"""

import re

from filmes.catalogo.generos import em_portugues
from filmes.sob_demanda import tmdb  # módulo, não a classe: tmdb.py importa recomendacao.atribuicoes

# Abreviações que terminam em ponto sem fechar a frase ("o Dr. Lemos").
_ABREVIACOES = {"sr", "sra", "srta", "dr", "dra", "prof", "profa", "st", "sto", "sta", "jr", "mr", "mrs", "ms"}
_FIM_DE_FRASE = re.compile(r"[.!?…]+[\"'”»)]*(?=\s|$)")


def do_filme(contexto, filme) -> dict:
    generos = contexto.conn.execute(
        "SELECT genero FROM generos_imdb WHERE filme_id = ? ORDER BY ordem", (filme["id"],))
    ficha = tmdb.CapasTMDB.de(contexto).ficha(filme["id"])
    return {
        "imdb": f"https://www.imdb.com/title/{filme['id']}/",
        "generos": [em_portugues(g) for (g,) in generos],
        "capa": ficha["capa"],
        "titulo_pt": ficha["titulo_pt"],
        "sinopse": primeira_frase(ficha["overview"]),
        "nota_imdb": filme["nota_imdb"],
        "votos_imdb": filme["votos"],
    }


def primeira_frase(texto: str | None) -> str | None:
    if not texto:
        return None
    for fim in _FIM_DE_FRASE.finditer(texto):
        anterior = texto[:fim.start()].rsplit(None, 1)
        if fim.group() == "." and anterior and anterior[-1].lower() in _ABREVIACOES:
            continue
        return texto[:fim.end()]
    return texto
