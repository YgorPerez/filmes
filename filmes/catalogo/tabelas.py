"""Carga de tabelas prontas: `<catalogo>/<tabela>.csv` vai direto para `<tabela>`.

O cabeçalho do CSV nomeia as colunas. Se a tabela tem `fato_id` e o CSV não,
o ID sai do conteúdo da linha (veja `filmes.banco.fato_id`). Célula vazia vira NULL.
Um CSV sem tabela de mesmo nome é erro, para a fixture não ter arquivo esquecido.
"""

import csv
import sqlite3
from pathlib import Path

from filmes.banco import fato_id
from filmes.erros import ErroFilmes


def carregar(conn: sqlite3.Connection, pasta: Path) -> None:
    if not pasta.is_dir():
        raise ErroFilmes("catalogo_ausente", f"pasta do catálogo não encontrada em {pasta}")
    # Na ordem em que o esquema criou as tabelas, para as chaves estrangeiras valerem.
    tabelas = [nome for (nome,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid")]
    for arquivo in sorted(pasta.glob("*.csv")):
        if arquivo.stem not in tabelas:
            raise ErroFilmes("catalogo_invalido", f"{arquivo.name}: não há tabela '{arquivo.stem}' no esquema")
    for tabela in tabelas:
        arquivo = pasta / f"{tabela}.csv"
        if arquivo.exists():
            _carregar_csv(conn, tabela, arquivo)


def _carregar_csv(conn, tabela, arquivo):
    colunas_tabela = [linha[1] for linha in conn.execute(f'PRAGMA table_info("{tabela}")')]
    with open(arquivo, newline="", encoding="utf-8") as f:
        leitor = csv.reader(f)
        cabecalho = next(leitor, None)
        if not cabecalho:
            return
        desconhecidas = set(cabecalho) - set(colunas_tabela)
        if desconhecidas:
            raise ErroFilmes("catalogo_invalido", f"{arquivo.name}: colunas fora do esquema: {sorted(desconhecidas)}")
        gerar_id = "fato_id" in colunas_tabela and "fato_id" not in cabecalho
        colunas = cabecalho + (["fato_id"] if gerar_id else [])
        sql = f'INSERT INTO "{tabela}" ({", ".join(colunas)}) VALUES ({", ".join("?" * len(colunas))})'
        for numero, linha in enumerate(leitor, start=2):
            valores = [v if v != "" else None for v in linha]
            if gerar_id:
                valores.append(fato_id(tabela, *linha))
            try:
                conn.execute(sql, valores)
            except sqlite3.Error as erro:
                raise ErroFilmes("catalogo_invalido", f"{arquivo.name}, linha {numero}: {erro}")
