"""Hierarquia de gêneros do Wikidata (P279), para o Veto a gênero descer aos subgêneros."""

from filmes.catalogo import subgeneros, versoes


def carregar(conn, amb):
    if (amb.catalogo / "filmes.csv").is_file():
        return
    subgeneros.carregar(conn, amb.catalogo, versoes.ler(amb.versoes, amb.catalogo))
