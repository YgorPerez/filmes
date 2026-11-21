"""Vocabulário fixo de Climas, versionado em `config/climas.toml`.

    resolver(pedidos) -> (climas, avisos)

Aceita o nome do Clima sem diferença de maiúscula nem de acento ("Ação", "acao").
Um nome fora do vocabulário não é erro: volta como aviso e a Recomendação segue
sem ele, porque um Clima só puxa a ordem.
"""

import tomllib
import unicodedata
from dataclasses import dataclass

from filmes.ambiente import RAIZ
from filmes.erros import ErroFilmes

VOCABULARIO = RAIZ / "config" / "climas.toml"


@dataclass(frozen=True)
class Clima:
    nome: str
    tags: tuple[str, ...]
    generos: tuple[str, ...]


def todos() -> list[Clima]:
    try:
        with open(VOCABULARIO, "rb") as f:
            tabela = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError) as erro:
        raise ErroFilmes("config_invalida", f"{VOCABULARIO}: {erro}")
    return [Clima(nome, tuple(t.lower() for t in d.get("tags", [])), tuple(d.get("generos", [])))
            for nome, d in tabela.items()]


def resolver(pedidos: list[str]) -> tuple[list[Clima], list[str]]:
    vocabulario = {_chave(c.nome): c for c in todos()}
    climas, avisos = [], []
    for pedido in pedidos:
        clima = vocabulario.get(_chave(pedido))
        if clima is None:
            nomes = ", ".join(c.nome for c in vocabulario.values())
            avisos.append(f"o Clima '{pedido.strip()}' não está no vocabulário e ficou de fora; os Climas são: {nomes}")
        elif clima not in climas:
            climas.append(clima)
    return climas, avisos


def _chave(nome: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", nome.casefold())
    return " ".join("".join(c for c in sem_acento if not unicodedata.combining(c)).replace("-", " ").split())
