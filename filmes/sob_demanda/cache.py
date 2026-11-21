"""Cache das respostas sob demanda, com validade, num SQLite à parte.

Fica fora do banco derivado: `reconstruir` troca o arquivo do banco e não
pode apagar o que levou chamadas de API para juntar. O arquivo é
`FILMES_CACHE` ou, sem ela, `<banco>-cache.sqlite` ao lado do banco.
"""

import datetime as dt
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS respostas (
    fonte     TEXT NOT NULL,
    chave     TEXT NOT NULL,
    corpo     TEXT NOT NULL,                -- JSON da resposta, como veio
    obtido_em TEXT NOT NULL,                -- AAAA-MM-DD
    expira_em TEXT NOT NULL,                -- vale enquanto hoje < expira_em
    PRIMARY KEY (fonte, chave)
)
"""


@dataclass(frozen=True)
class Registro:
    corpo: dict
    obtido_em: str


def caminho(amb) -> Path:
    return amb.cache


class Cache:
    def __init__(self, arquivo: Path):
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(arquivo)
        self.conn.execute(_ESQUEMA)

    def ler(self, fonte: str, chave: str, hoje: dt.date) -> Registro | None:
        linha = self.conn.execute(
            "SELECT corpo, obtido_em FROM respostas WHERE fonte = ? AND chave = ? AND expira_em > ?",
            (fonte, chave, hoje.isoformat()),
        ).fetchone()
        return Registro(json.loads(linha[0]), linha[1]) if linha else None

    def gravar(self, fonte: str, chave: str, corpo: dict, hoje: dt.date, validade_dias: int) -> Registro:
        expira = hoje + dt.timedelta(days=validade_dias)
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO respostas (fonte, chave, corpo, obtido_em, expira_em) VALUES (?, ?, ?, ?, ?)",
                (fonte, chave, json.dumps(corpo, ensure_ascii=False), hoje.isoformat(), expira.isoformat()),
            )
        return Registro(corpo, hoje.isoformat())
