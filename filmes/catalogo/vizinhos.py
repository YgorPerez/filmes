"""Vizinhança item-item pelas avaliações de 4 ou mais no MovieLens."""

from array import array

import numpy as np
from scipy.sparse import csr_matrix

TOP_K = 50
LOTE = 128


def vizinhos(notas, links):
    filmes = sorted(set(links.values()))
    indices = {filme: posicao for posicao, filme in enumerate(filmes)}
    por_movie_id = {id_: indices[filme] for id_, filme in links.items()}
    itens, usuarios = array("i"), array("i")
    for linha in notas:
        item = por_movie_id.get(linha["movieId"])
        if item is not None and float(linha["rating"]) >= 4:
            itens.append(item)
            usuarios.append(int(linha["userId"]))
    if not usuarios:
        return

    matriz = csr_matrix(
        (np.ones(len(itens), dtype=np.int32), (itens, usuarios)),
        shape=(len(filmes), max(usuarios) + 1),
    )
    del itens, usuarios
    # IDs diferentes do MovieLens podem apontar para o mesmo tconst.
    matriz.data.fill(1)
    bases = np.diff(matriz.indptr)
    por_usuario = matriz.T.tocsr()
    for inicio in range(0, len(filmes), LOTE):
        comuns = matriz[inicio:inicio + LOTE] @ por_usuario
        for local, (de, ate) in enumerate(zip(comuns.indptr, comuns.indptr[1:])):
            item = inicio + local
            colunas = comuns.indices[de:ate]
            contagens = comuns.data[de:ate]
            outros = colunas != item
            colunas, contagens = colunas[outros], contagens[outros]
            # A base é fixa na linha. Empates na contagem seguem o tconst.
            ordem = colunas - contagens.astype(np.int64) * len(filmes)
            if len(ordem) > TOP_K:
                escolhidos = np.argpartition(ordem, TOP_K - 1)[:TOP_K]
                colunas, contagens = colunas[escolhidos], contagens[escolhidos]
            for posicao in np.argsort(colunas):
                yield filmes[item], filmes[colunas[posicao]], int(bases[item]), int(contagens[posicao])
