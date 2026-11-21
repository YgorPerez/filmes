"""O SQLite derivado: abrir para leitura e identificar Fatos.

A reconstrução está em `reconstrucao.py`. O esquema são os arquivos
`esquema/NN_area.sql`, aplicados em ordem; as cargas são os módulos
`etapas/NN_area.py`, rodados em ordem depois do esquema.
"""

import hashlib
import sqlite3
from pathlib import Path

from filmes.erros import ErroFilmes


def abrir_leitura(caminho: Path) -> sqlite3.Connection:
    """Abre o banco só para leitura; sem banco, pede `reconstruir`."""
    if not caminho.exists():
        raise ErroFilmes("banco_ausente", f"banco não encontrado em {caminho}: rode `python -m filmes reconstruir`")
    conn = sqlite3.connect(f"{caminho.resolve().as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def fato_id(tabela: str, *valores) -> str:
    """ID estável de um Fato: o nome da tabela e um hash do conteúdo da linha.

    O mesmo Fato tem o mesmo ID a cada reconstrução, seja qual for a ordem de carga.
    """
    conteudo = "\x1f".join("" if v is None else str(v) for v in valores)
    return f"{tabela}:{hashlib.sha1(conteudo.encode()).hexdigest()[:12]}"
