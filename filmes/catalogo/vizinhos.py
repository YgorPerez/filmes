"""Vizinhança item-item pelas avaliações de 4 ou mais no MovieLens.

`calcular` é a regra única: o Catálogo (`vizinhos`) e a avaliação offline
(`filmes.avaliacao.movielens`) chamam a mesma função, para que a avaliação
meça a vizinhança que vai para produção.
"""

from array import array

import numpy as np
from scipy.sparse import csr_matrix

from filmes.evidencia import regua

TOP_K = 50
LOTE = 128


def vizinhos(notas, links):
    """Vizinhos de todos os filmes, a partir das linhas de ratings.csv e do mapa movieId -> tconst."""
    filmes = sorted(set(links.values()))
    indices = {filme: posicao for posicao, filme in enumerate(filmes)}
    por_movie_id = {id_: indices[filme] for id_, filme in links.items()}
    itens, usuarios = array("i"), array("i")
    for linha in notas:
        item = por_movie_id.get(linha["movieId"])
        if item is not None and float(linha["rating"]) >= regua.NOTA_ALTA:
            itens.append(item)
            usuarios.append(int(linha["userId"]))
    yield from calcular(filmes, itens, usuarios)


def calcular(filmes, itens, usuarios, sementes=None, ao_lote=lambda feitos, total: None):
    """Os TOP_K vizinhos de cada filme, como (filme, vizinho, base, ambos).

    `itens[i]` e `usuarios[i]` são um voto 4+: o índice do filme em `filmes` e o
    usuário. `sementes` limita o cálculo às linhas desses índices; `ao_lote`
    recebe o andamento. A base é o número de usuários distintos que deram 4+ ao
    filme; os empates na contagem seguem o tconst.
    """
    if not len(usuarios):
        return
    matriz = csr_matrix(
        (np.ones(len(itens), dtype=np.int32), (itens, usuarios)),
        shape=(len(filmes), max(usuarios) + 1),
    )
    # IDs diferentes do MovieLens podem apontar para o mesmo tconst.
    # Os votos repetidos já vêm somados; cada usuário conta uma vez.
    matriz.data.fill(1)
    bases = np.diff(matriz.indptr)
    por_usuario = matriz.T.tocsr()
    linhas = list(range(len(filmes))) if sementes is None else sorted(sementes)
    for inicio in range(0, len(linhas), LOTE):
        ao_lote(inicio, len(linhas))
        lote = linhas[inicio:inicio + LOTE]
        comuns = matriz[lote] @ por_usuario
        for local, (de, ate) in enumerate(zip(comuns.indptr, comuns.indptr[1:])):
            item = lote[local]
            colunas = comuns.indices[de:ate]
            contagens = comuns.data[de:ate]
            outros = colunas != item
            colunas, contagens = colunas[outros], contagens[outros]
            ordem = colunas - contagens.astype(np.int64) * len(filmes)
            if len(ordem) > TOP_K:
                escolhidos = np.argpartition(ordem, TOP_K - 1)[:TOP_K]
                colunas, contagens = colunas[escolhidos], contagens[escolhidos]
            for posicao in np.argsort(colunas):
                yield filmes[item], filmes[colunas[posicao]], int(bases[item]), int(contagens[posicao])
