"""Reconstrói o banco do zero: esquema, depois as etapas de carga, em ordem.

Monta num arquivo temporário e troca no fim, para nunca deixar banco pela metade.
"""

import importlib
import os
import pkgutil
import sqlite3
from pathlib import Path

from filmes.ambiente import Ambiente
from filmes.banco import etapas

ESQUEMA = Path(__file__).resolve().parent / "esquema"


def reconstruir(amb: Ambiente) -> dict:
    destino = amb.banco
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_name(destino.name + ".novo")
    temporario.unlink(missing_ok=True)

    conn = sqlite3.connect(temporario)
    try:
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
    except BaseException:
        conn.close()
        temporario.unlink(missing_ok=True)
        raise
    conn.close()
    os.replace(temporario, destino)
    return {"banco": str(destino), "tabelas": tabelas}
