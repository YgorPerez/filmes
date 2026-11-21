"""Régua de Força por Tipo (issue #7, comentário de resolução). Regra fixa, sem config.

Só as linhas que o motor já usa estão aqui; cada ticket acrescenta a sua.
"""

import datetime as dt

from filmes.evidencia import FORCAS

NOTA_ALTA = 4.0       # "Nota alta" no caminho de gosto
ANOS_FRESCOR = 5      # Nota com mais de 5 anos cai um nível
ANOS_DECLARADO = 2    # Declarado e Relato com mais de 2 anos caem um nível
FORCA_JA_VISTO = "forte"


def descer(forca: str) -> str:
    return FORCAS[max(0, FORCAS.index(forca) - 1)]


def subir(forca: str) -> str:
    return FORCAS[min(len(FORCAS) - 1, FORCAS.index(forca) + 1)]


def forca_nota(nota: float, data: str, hoje: dt.date, de_feedback: bool = False) -> tuple[str, int]:
    """Força e direção (+1 a favor, -1 contra) de uma Nota de filme parecido.

    Forte: 4,5–5 (ou 0,5–1,5 contra). Moderada: 4 (ou 2). Fraca: 3–3,5.
    A spec não diz nada de 2,5; aqui ela é fraca contra.
    Dada há mais de 5 anos, cai um nível (fraca continua fraca).
    Vinda do Feedback de uma Sessão, sobe um nível depois disso, até forte.
    """
    if nota >= 4.5:
        forca, direcao = "forte", 1
    elif nota >= 4:
        forca, direcao = "moderada", 1
    elif nota >= 3:
        forca, direcao = "fraca", 1
    elif nota >= 2.5:
        forca, direcao = "fraca", -1
    elif nota >= 2:
        forca, direcao = "moderada", -1
    else:
        forca, direcao = "forte", -1
    if _mais_velha_que(data, ANOS_FRESCOR, hoje):
        forca = descer(forca)
    if de_feedback:
        forca = subir(forca)
    return forca, direcao


def forca_feedback(tipo: str, nota: float | None, data: str, hoje: dt.date) -> str:
    """Força de uma reação do Feedback (Tipo nota ou relato) sobre o Filme escolhido.

    Nota: a régua de Nota, um nível acima. Relato: fala do próprio filme, então o
    Declarado equivalente é específico (forte); o Relato fica um nível abaixo,
    cai mais um depois de 2 anos e sobe um por vir do Feedback.
    """
    if tipo == "nota":
        return forca_nota(nota, data, hoje, de_feedback=True)[0]
    forca = descer("forte")
    if _mais_velha_que(data, ANOS_DECLARADO, hoje):
        forca = descer(forca)
    return subir(forca)


def forca_caminho(notas_altas: int, predicado: str) -> str | None:
    """Metadado no caminho de gosto: 3+ Notas altas da Pessoa no mesmo nó é forte,
    2 é moderada, 1 é fraca. Gênero sozinho fica no máximo em fraca."""
    if notas_altas <= 0:
        return None
    forca = "forte" if notas_altas >= 3 else "moderada" if notas_altas == 2 else "fraca"
    return "fraca" if predicado == "genero" else forca


def _mais_velha_que(data: str, anos: int, hoje: dt.date) -> bool:
    dia = dt.date.fromisoformat(data)
    try:
        limite = hoje.replace(year=hoje.year - anos)
    except ValueError:  # 29 de fevereiro
        limite = hoje.replace(year=hoje.year - anos, day=28)
    return dia < limite
