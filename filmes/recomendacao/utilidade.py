"""Utilidade individual de 0 a 1, ou desconhecida (None) sem Evidência com Fato.

Só as `[utilidade] evidencias_maximas` contribuições de maior módulo entram na
soma; o Já visto fica fora do corte e sempre conta. Sem o corte, quem tem mil
Notas encosta em dezenas de Evidências por filme e satura em 1.
"""

import math


def individual(evidencias: list, pesos: dict) -> float | None:
    com_fato = [e for e in evidencias if e.tipo != "palpite"]
    if not com_fato:
        return None
    contribuicoes = sorted((e.contribuicao(pesos) for e in com_fato if not e.ja_visto), key=abs, reverse=True)
    soma = sum(contribuicoes[:pesos["utilidade"]["evidencias_maximas"]])
    soma += sum(e.contribuicao(pesos) for e in com_fato if e.ja_visto)
    return 1 / (1 + math.exp(-pesos["utilidade"]["k"] * soma))
