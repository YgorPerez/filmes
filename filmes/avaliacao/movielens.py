"""Amostra do ml-32m separada antes de calcular a vizinhança item-item."""

import csv
import datetime as dt
from array import array
from collections import defaultdict
from dataclasses import dataclass, replace
from random import Random

from filmes.avaliacao.pessoas import Pessoa, separar
from filmes.banco import fato_id
from filmes.catalogo import review, versoes
from filmes.erros import ErroFilmes
from filmes.evidencia import regua

SEMENTE = 27
TAMANHO = 1000


@dataclass
class Amostra:
    pessoas_medidas: list[Pessoa]
    usuarios: frozenset[int]
    filmes: dict[int, str]
    votos: tuple
    fonte_e_data: tuple[str, str]


def ler(pasta, manifesto, progresso):
    ratings, links = pasta / "ratings.csv", pasta / "links.csv"
    if not ratings.is_file() and not links.is_file():
        return None
    if not ratings.is_file() or not links.is_file():
        raise ErroFilmes("dados_invalidos", f"{pasta}: são necessários ratings.csv e links.csv para avaliar o MovieLens")
    # Fonte e data como as do Catálogo (catalogo/review.py), lidas do manifesto.
    fonte_e_data = versoes.fonte_e_data(manifesto, versoes.MOVIELENS)
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
        pessoas_medidas = [medida for u, notas in sorted(avaliacoes.items())
                           if (medida := _pessoa(u, notas, fonte_e_data[0]))]
        return Amostra(pessoas_medidas, sorteados, filmes, (imdbs, usuarios, itens), fonte_e_data)
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


def _pessoa(usuario, avaliacoes, fonte):
    pessoa = f"movielens:{usuario}"
    datas = {filme: dt.datetime.fromtimestamp(instante, dt.UTC).isoformat()
             for filme, (instante, _) in avaliacoes.items()}
    notas = {filme: nota for filme, (_, nota) in avaliacoes.items()}
    medida = separar(pessoa, datas, notas)
    if medida is None:
        return None
    treino = []
    for filme, data in datas.items():
        if data < medida.corte:
            valores = (pessoa, filme, notas[filme], data[:10], fonte)
            treino.append((fato_id("notas", *valores), *valores))
    return replace(medida, corte=medida.corte[:10], treino=tuple(treino))


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
    """A vizinhança de produção (catalogo/vizinhos.py), só com os usuários fora da
    amostra e só para os filmes que alguém usa como semente."""
    from filmes.catalogo.vizinhos import calcular  # numpy e scipy só quando há MovieLens

    imdbs, usuarios, itens = amostra.votos
    sementes = {
        filme for (filme,) in conn.execute("""
            SELECT DISTINCT n.filme_id FROM notas_vigentes n JOIN filmes f ON f.id = n.filme_id WHERE n.nota >= 3
        """)
    }
    linhas = [i for i, filme in enumerate(imdbs) if filme in sementes]

    def ao_lote(feitos, total):
        progresso(20 + 14 * feitos // total, "Calculando vizinhos sem os usuários sorteados")

    pares = calcular(imdbs, itens, usuarios, sementes=linhas, ao_lote=ao_lote)
    yield from review.fatos("vizinhos", pares, amostra.fonte_e_data)


def _tags(caminho, amostra):
    try:
        linhas = list(_linhas(caminho, ("userId", "movieId", "tag")))
        mapa = {str(movie_id): filme for movie_id, filme in amostra.filmes.items()}
        contagens = list(review.contar_tags(linhas, mapa, excluidos=amostra.usuarios))
    except (ValueError, csv.Error) as erro:
        raise ErroFilmes("dados_invalidos", f"{caminho}: {erro}") from erro
    yield from review.fatos("tags_movielens", contagens, amostra.fonte_e_data)
