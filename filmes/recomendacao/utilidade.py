"""Utilidade individual de 0 a 1, ou desconhecida (None) sem Evidência com Fato."""

import math


def individual(evidencias: list, pesos: dict) -> float | None:
    com_fato = [e for e in evidencias if e.tipo != "palpite"]
    if not com_fato:
        return None
    soma = sum(e.contribuicao(pesos) for e in com_fato)
    return 1 / (1 + math.exp(-pesos["utilidade"]["k"] * soma))
