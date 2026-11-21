"""Hierarquia de gêneros do Wikidata (P279), para o Veto a gênero descer aos
subgêneros. O dump é opcional no manifesto; sem ele, a tabela fica vazia e o
Veto age só no gênero vetado e no gênero equivalente do IMDb."""

from filmes.catalogo import wikidata


def carregar(conn, pasta, dumps):
    for nome, versao in sorted(dumps.items()):
        if nome.startswith("wikidata-subgeneros"):
            conn.executemany(
                "INSERT INTO subclasses_wikidata (item, classe) VALUES (?, ?) ON CONFLICT DO NOTHING",
                ((wikidata.qid(linha["item"]), wikidata.qid(linha["valor"]))
                 for linha in wikidata.linhas(pasta / versao["sha256"] / nome)
                 if wikidata.qid(linha["item"]) and wikidata.qid(linha["valor"])),
            )
