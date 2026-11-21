"""Régua de Força por Tipo (issue #7, comentário de resolução). Regra fixa, sem config.

Só as linhas que o motor já usa estão aqui; cada ticket acrescenta a sua.
"""

import datetime as dt

from filmes.evidencia import FORCAS

NOTA_ALTA = 4.0       # "Nota alta" no caminho de gosto
ANOS_FRESCOR = 5      # Nota com mais de 5 anos cai um nível
ANOS_DITO = 2         # Declarado e Relato com mais de 2 anos caem um nível


def descer(forca: str) -> str:
    return FORCAS[max(0, FORCAS.index(forca) - 1)]


def subir(forca: str) -> str:
    return FORCAS[min(len(FORCAS) - 1, FORCAS.index(forca) + 1)]


def forca_nota(nota: float, data: str, hoje: dt.date) -> tuple[str, int]:
    """Força e direção (+1 a favor, -1 contra) de uma Nota de filme parecido.

    Forte: 4,5–5 (ou 0,5–1,5 contra). Moderada: 4 (ou 2). Fraca: 3–3,5.
    A spec não diz nada de 2,5; aqui ela é fraca contra.
    Dada há mais de 5 anos, cai um nível (fraca continua fraca).
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
    return forca, direcao


def forca_caminho(notas_altas: int, predicado: str) -> str | None:
    """Metadado no caminho de gosto: 3+ Notas altas da Pessoa no mesmo nó é forte,
    2 é moderada, 1 é fraca. Gênero sozinho fica no máximo em fraca."""
    if notas_altas <= 0:
        return None
    forca = "forte" if notas_altas >= 3 else "moderada" if notas_altas == 2 else "fraca"
    return "fraca" if predicado == "genero" else forca


def forca_dito(tipo: str, especifico: bool, data: str, hoje: dt.date) -> str:
    """Declarado específico (nomeia filme, diretor, ator, subgênero) é forte; genérico é moderada.
    Uma review ou tag que a própria Pessoa escreveu é Declarado específico.
    Relato fica um nível abaixo do Declarado equivalente. Os dois caem um nível depois de 2 anos."""
    forca = "forte" if especifico else "moderada"
    if tipo == "relato":
        forca = descer(forca)
    if _mais_velha_que(data, ANOS_DITO, hoje):
        forca = descer(forca)
    return forca


def forca_metadado_do_pedido() -> str:
    """Metadado que responde ao pedido (duração, classificação, idioma, gatilho): sempre forte."""
    return "forte"


def forca_palpite() -> str:
    """Palpite, um Motivo sem Fato: sempre fraca."""
    return "fraca"


def _mais_velha_que(data: str, anos: int, hoje: dt.date) -> bool:
    dia = dt.date.fromisoformat(data)
    try:
        limite = hoje.replace(year=hoje.year - anos)
    except ValueError:  # 29 de fevereiro
        limite = hoje.replace(year=hoje.year - anos, day=28)
    return dia < limite
