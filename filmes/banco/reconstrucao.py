"""Reconstrói o banco do zero: esquema, depois as etapas de carga, em ordem.

Monta num arquivo temporário e troca no fim, para nunca deixar banco pela metade.
"""

import importlib
import os
import pkgutil
import sqlite3
from pathlib import Path
from tempfile import NamedTemporaryFile

from filmes.ambiente import RAIZ, Ambiente
from filmes.banco import etapas
from filmes.erros import ErroFilmes

ESQUEMA = Path(__file__).resolve().parent / "esquema"


def reconstruir(amb: Ambiente) -> dict:
    destino = amb.banco
    if not (amb.catalogo / "filmes.csv").is_file() and destino.resolve().is_relative_to(RAIZ):
        raise ErroFilmes("config_invalida", "ponha FILMES_BANCO fora do repositório de código")
    destino.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=destino.parent, prefix=destino.name + ".", suffix=".novo", delete=False) as f:
        temporario = Path(f.name)
    conn = None
    try:
        conn = sqlite3.connect(temporario)
        conn.execute("PRAGMA foreign_keys = ON")
        for arquivo in sorted(ESQUEMA.glob("*.sql")):
            conn.executescript(arquivo.read_text())
        for info in sorted(pkgutil.iter_modules(etapas.__path__), key=lambda m: m.name):
            importlib.import_module(f"filmes.banco.etapas.{info.name}").carregar(conn, amb)
        conn.commit()
        tabelas = {
            nome: conn.execute(f'SELECT count(*) FROM "{nome}"').fetchone()[0]
            for (nome,) in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        }
        conn.close()
        conn = None
        os.replace(temporario, destino)
    finally:
        if conn is not None:
            conn.close()
        temporario.unlink(missing_ok=True)
    return {"banco": str(destino), "tabelas": tabelas}
