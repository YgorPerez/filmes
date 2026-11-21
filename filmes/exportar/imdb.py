"""As Notas de uma Pessoa no CSV de avaliações do IMDb ("Your Ratings" > Export).

É o único formato que o import do MovieLens aceita (movielens.org, Import or
Export Data). Vai a Nota vigente de cada filme (a mais recente), dobrada para a
escala de 1 a 10 do IMDb. O que o Catálogo não tem fica em branco; filme fora
dele sai só com o tconst, a nota, a data e a URL.
"""

import csv
from pathlib import Path

from filmes.banco import abrir_leitura

CABECALHO = ["Const", "Your Rating", "Date Rated", "Title", "Original Title", "URL", "Title Type",
             "IMDb Rating", "Runtime (mins)", "Year", "Genres", "Num Votes", "Release Date", "Directors"]

_CONSULTA = """
SELECT n.filme_id, n.nota, n.data, f.id, f.titulo, f.nota_imdb, f.duracao_min, f.ano, f.votos,
       (SELECT group_concat(genero, ', ') FROM
            (SELECT genero FROM generos_imdb WHERE filme_id = n.filme_id ORDER BY ordem)),
       (SELECT group_concat(rotulo, ', ') FROM
            (SELECT e.rotulo FROM arestas a JOIN entidades e ON e.id = a.entidade_id
             WHERE a.filme_id = n.filme_id AND a.predicado = 'diretor' ORDER BY e.rotulo))
FROM notas_vigentes n LEFT JOIN filmes f ON f.id = n.filme_id
WHERE n.pessoa = ?
ORDER BY n.data DESC, n.filme_id
"""


def nota_do_imdb(nota: float) -> int:
    """De 0,5 a 5 estrelas para 1 a 10; meia estrela vira inteiro exato."""
    return int(nota * 2 + 0.5)


def gravar(banco: Path, pessoa: str, saida: Path) -> dict:
    conn = abrir_leitura(banco)
    try:
        linhas = conn.execute(_CONSULTA, (pessoa,)).fetchall()
    finally:
        conn.close()
    saida.parent.mkdir(parents=True, exist_ok=True)
    fora = 0
    with open(saida, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.writer(arquivo)
        escritor.writerow(CABECALHO)
        for filme_id, nota, data, no_catalogo, titulo, nota_imdb, duracao, ano, votos, generos, diretores in linhas:
            fora += no_catalogo is None
            escritor.writerow([
                filme_id, nota_do_imdb(nota), data, titulo or "", "",
                f"https://www.imdb.com/title/{filme_id}/", "Movie" if no_catalogo else "",
                _texto(nota_imdb), _texto(duracao), _texto(ano), generos or "",
                _texto(votos if no_catalogo else None), "", diretores or "",
            ])
    return {"notas": len(linhas), "fora_do_catalogo": fora}


def _texto(valor):
    return "" if valor is None else str(valor)
