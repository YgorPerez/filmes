"""Amostra do ml-32m separada antes de calcular a vizinhança item-item."""

import csv
import datetime as dt
from array import array
from collections import defaultdict
from dataclasses import dataclass, replace
from random import Random

from filmes.avaliacao.pessoas import Perfil, separar
from filmes.banco import fato_id
from filmes.erros import ErroFilmes
from filmes.evidencia import regua

SEMENTE = 27
TAMANHO = 1000
_FONTE = "MovieLens ml-32m"
_DATA = "2023-10-13"


@dataclass
class Amostra:
    perfis: list[Perfil]
    usuarios: frozenset[int]
    filmes: dict[int, str]
    votos: tuple


def ler(pasta, progresso):
    ratings, links = pasta / "ratings.csv", pasta / "links.csv"
    if not ratings.is_file() and not links.is_file():
        return None
    if not ratings.is_file() or not links.is_file():
        raise ErroFilmes("dados_invalidos", f"{pasta}: são necessários ratings.csv e links.csv para avaliar o MovieLens")
    try:
        filmes = {
            int(movie_id): "tt" + imdb_id
            for movie_id, imdb_id in _linhas(links, ("movieId", "imdbId"))
            if imdb_id
        }
        ids = {int(linha[0]) for linha in _linhas(ratings, ("userId", "movieId", "rating", "timestamp"))}
        sorteados = frozenset(Random(SEMENTE).sample(sorted(ids), min(TAMANHO, len(ids))))
        progresso(14, "Separando as Notas de treino e da amostra")
        imdbs = sorted(set(filmes.values()))
        colunas = {imdb: i for i, imdb in enumerate(imdbs)}
        usuarios, itens = array("i"), array("i")
        avaliacoes = defaultdict(dict)
        for usuario, movie_id, nota, instante in _linhas(ratings, ("userId", "movieId", "rating", "timestamp")):
            filme = filmes.get(int(movie_id))
            if filme is None:
                continue
            usuario, nota = int(usuario), float(nota)
            if usuario in sorteados:
                instante = int(instante)
                anterior = avaliacoes[usuario].get(filme)
                if anterior is None or instante > anterior[0]:
                    avaliacoes[usuario][filme] = (instante, nota)
            elif nota >= regua.NOTA_ALTA:
                usuarios.append(usuario)
                itens.append(colunas[filme])
        perfis = [perfil for u, notas in sorted(avaliacoes.items()) if (perfil := _perfil(u, notas))]
        return Amostra(perfis, sorteados, filmes, (imdbs, usuarios, itens))
    except (ValueError, csv.Error) as erro:
        raise ErroFilmes("dados_invalidos", f"{pasta}: {erro}") from erro


def _linhas(caminho, colunas):
    with caminho.open(encoding="utf-8-sig", newline="") as fluxo:
        leitor = csv.reader(fluxo)
        cabecalho = next(leitor, [])
        indices = [cabecalho.index(coluna) for coluna in colunas]
        for linha in leitor:
            if len(linha) != len(cabecalho):
                raise ValueError(f"{caminho.name}, linha {leitor.line_num}: número de colunas inválido")
            yield tuple(linha[i] for i in indices)


def _perfil(usuario, avaliacoes):
    pessoa = f"movielens:{usuario}"
    datas = {filme: dt.datetime.fromtimestamp(instante, dt.UTC).isoformat()
             for filme, (instante, _) in avaliacoes.items()}
    notas = {filme: nota for filme, (_, nota) in avaliacoes.items()}
    perfil = separar(pessoa, datas, notas)
    if perfil is None:
        return None
    treino = []
    for filme, data in datas.items():
        if data < perfil.corte:
            valores = (pessoa, filme, notas[filme], data[:10], _FONTE)
            treino.append((fato_id("notas", *valores), *valores))
    return replace(perfil, corte=perfil.corte[:10], treino=tuple(treino))


def preparar(conn, pasta, amostra, progresso):
    conn.execute("CREATE TEMP TABLE vizinhos AS SELECT * FROM main.vizinhos WHERE 0")
    conn.execute("CREATE INDEX temp.vizinhos_por_filme ON vizinhos(filme_id)")
    conn.executemany(
        "INSERT INTO vizinhos (fato_id, filme_id, vizinho_id, base, ambos, fonte, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
        _vizinhos(conn, amostra, progresso),
    )
    conn.execute("CREATE TEMP TABLE tags_movielens AS SELECT * FROM main.tags_movielens WHERE 0")
    conn.execute("CREATE INDEX temp.tags_por_tag ON tags_movielens(tag)")
    caminho = pasta / "tags.csv"
    if caminho.is_file():
        progresso(34, "Contando as tags dos usuários de treino")
        conn.executemany(
            "INSERT INTO tags_movielens (fato_id, filme_id, tag, usuarios, fonte, data) VALUES (?, ?, ?, ?, ?, ?)",
            _tags(caminho, amostra),
        )


def _vizinhos(conn, amostra, progresso):
    import numpy as np
    from scipy.sparse import csr_matrix

    imdbs, usuarios, itens = amostra.votos
    if not len(usuarios):
        return
    treino = csr_matrix(
        (np.ones(len(usuarios), dtype=np.int32), (usuarios, itens)),
        shape=(max(usuarios) + 1, len(imdbs)),
    )
    # Um mesmo tconst pode aparecer em mais de um movieId. Cada usuário conta uma vez.
    treino.data[:] = 1
    por_filme = treino.T.tocsr()
    bases = np.diff(por_filme.indptr)
    sementes = {
        filme for (filme,) in conn.execute("""
            SELECT DISTINCT n.filme_id FROM notas_vigentes n JOIN filmes f ON f.id = n.filme_id WHERE n.nota >= 3
        """)
    }
    colunas = [
        i for i, filme in enumerate(imdbs) if filme in sementes and bases[i] >= regua.BASE_MINIMA_VIZINHANCA
    ]
    # Fatie a multiplicação para manter só um lote de pares em memória.
    ultimo_progresso = 20
    for inicio in range(0, len(colunas), 64):
        atual = 20 + 14 * inicio // len(colunas)
        if atual > ultimo_progresso:
            ultimo_progresso = atual
            progresso(atual, "Calculando vizinhos sem os usuários sorteados")
        lote = colunas[inicio:inicio + 64]
        pares = por_filme[lote] @ treino
        for linha, semente in enumerate(lote):
            base = int(bases[semente])
            primeiro, ultimo = pares.indptr[linha:linha + 2]
            ambos = pares.data[primeiro:ultimo]
            vizinhos = pares.indices[primeiro:ultimo]
            aceita = (vizinhos != semente) & (100 * ambos >= regua.PORCENTO_MINIMO_VIZINHANCA * base)
            for vizinho, total in zip(vizinhos[aceita], ambos[aceita]):
                valores = (imdbs[semente], imdbs[vizinho], base, int(total), _FONTE, _DATA)
                yield (fato_id("vizinhos", *valores), *valores)


def _tags(caminho, amostra):
    usuarios = defaultdict(set)
    try:
        for usuario, movie_id, tag in _linhas(caminho, ("userId", "movieId", "tag")):
            filme = amostra.filmes.get(int(movie_id))
            usuario = int(usuario)
            tag = tag.strip().lower()
            if filme and tag and usuario not in amostra.usuarios:
                usuarios[filme, tag].add(usuario)
    except (ValueError, csv.Error) as erro:
        raise ErroFilmes("dados_invalidos", f"{caminho}: {erro}") from erro
    for (filme, tag), distintos in sorted(usuarios.items()):
        valores = (filme, tag, len(distintos), _FONTE, _DATA)
        yield (fato_id("tags_movielens", *valores), *valores)
