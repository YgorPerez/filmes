"""Atribuições obrigatórias das fontes usadas numa Recomendação.

O nome não é "créditos" para não se confundir com o Crédito das Sessões.

Textos da pesquisa de termos (ramo research/termos, docs/research/termos.md) e,
para o TMDB, do aviso que os termos dele pedem. O IMDb entra sempre: todo
Candidato sai dos datasets dele. As outras fontes entram quando alguma
Evidência devolvida tem a Fonte com o nome delas ("Trakt da Ana"); o TMDB
também entra quando algum filme sai com capa.
Wikidata (CC0), Letterboxd, MovieLens ml-32m e OMDb não pedem atribuição na tela.
"""

SEMPRE = "IMDb"

# Fonte -> texto exigido, na ordem em que saem.
TEXTOS = {
    "IMDb": "Information courtesy of IMDb (https://www.imdb.com). Used with permission.",
    "Does the Dog Die": "Powered by DoesTheDogDie.com",
    "Tag Genome": "Tag Genome 2021, de Kotkov, Maslov e Neovius "
                  "(https://grouplens.org/datasets/movielens/tag-genome-2021/), sob licença CC BY-NC 3.0 "
                  "(https://creativecommons.org/licenses/by-nc/3.0/)",
    "Trakt": "filmes uses Trakt but is not endorsed or certified by Trakt",
    "TMDB": "This product uses the TMDB API but is not endorsed or certified by TMDB.",
}


def das_fontes(fontes) -> list[dict]:
    usadas = [f.casefold() for f in fontes if f]
    return [
        {"fonte": fonte, "texto": texto}
        for fonte, texto in TEXTOS.items()
        if fonte == SEMPRE or any(fonte.casefold() in usada for usada in usadas)
    ]
