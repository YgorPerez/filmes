"""Régua de Força por Tipo (issue #7, comentário de resolução). Regra fixa, sem config.

Só as linhas que o motor já usa estão aqui; cada ticket acrescenta a sua.
"""

import datetime as dt

from filmes.evidencia import FORCAS

NOTA_ALTA = 4.0       # "Nota alta" no caminho de gosto
ANOS_FRESCOR = 5      # Nota com mais de 5 anos cai um nível
ANOS_DITO = 2         # Declarado e Relato com mais de 2 anos caem um nível
FORCA_JA_VISTO = "forte"
BASE_MINIMA_VIZINHANCA = 30
PORCENTO_MINIMO_VIZINHANCA = 25


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


def forca_semente(tipo: str, nota: float, data: str, hoje: dt.date, de_feedback: bool = False) -> tuple[str, int]:
    """Força e direção de uma Nota-semente de qualquer Tipo. Nota segue a régua de Nota;
    Nota declarada ("amo" vira 5, "odeio" vira 1) e a contada pelo Dono seguem a de
    Declarado específico e Relato."""
    if tipo == "nota":
        return forca_nota(nota, data, hoje, de_feedback=de_feedback)
    return forca_dito(tipo, True, data, hoje), (1 if nota >= 3 else -1)


def forca_feedback(tipo: str, nota: float | None, data: str, hoje: dt.date) -> str:
    """Força de uma reação do Feedback (Tipo nota ou relato) sobre o Filme escolhido.

    Nota: a régua de Nota, um nível acima. Relato: fala do próprio filme, então o
    Declarado equivalente é específico (forte); o Relato fica um nível abaixo,
    cai mais um depois de 2 anos e sobe um por vir do Feedback.
    """
    if tipo == "nota":
        return forca_nota(nota, data, hoje, de_feedback=True)[0]
    return subir(forca_dito("relato", True, data, hoje))


def forca_caminho(notas_altas: int, predicado: str) -> str | None:
    """Metadado no caminho de gosto: 3+ Notas altas da Pessoa no mesmo nó é forte,
    2 é moderada, 1 é fraca. Gênero sozinho fica no máximo em fraca."""
    if notas_altas <= 0:
        return None
    forca = "forte" if notas_altas >= 3 else "moderada" if notas_altas == 2 else "fraca"
    return "fraca" if predicado == "genero" else forca


def forca_vizinhanca(base: int, ambos: int, teto: str) -> str | None:
    """Review de vizinhança item-item: de `base` pessoas que deram 4+ ao filme da
    Nota-semente, `ambos` deram 4+ ao Candidato.

    Forte com base 500+ e 60% ou mais, moderada com 100+ e 40%, fraca com 30+ e 25%;
    abaixo disso não vira Evidência. Nunca passa de `teto`, a Força da Nota-semente.
    A proporção é comparada em inteiros, sem arredondar.
    """
    for forca, base_minima, porcento in (("forte", 500, 60), ("moderada", 100, 40), ("fraca", BASE_MINIMA_VIZINHANCA, PORCENTO_MINIMO_VIZINHANCA)):
        if base >= base_minima and 100 * ambos >= porcento * base:
            return min(forca, teto, key=FORCAS.index)
    return None


def forca_tag_movielens(usuarios: int) -> str | None:
    """Review de tag do tags.csv do MovieLens: forte com 10+ usuários distintos,
    moderada com 3 a 9; com menos de 3 não vira Evidência."""
    if usuarios >= 10:
        return "forte"
    if usuarios >= 3:
        return "moderada"
    return None


def forca_genoma(relevancia: float) -> str | None:
    """Review do Tag Genome: no máximo moderada (relevância 0,8 ou mais), fraca de
    0,6 a 0,8; abaixo de 0,6 não vira Evidência. É previsão de modelo, por isso
    vale menos que uma contagem de usuários."""
    if relevancia >= 0.8:
        return "moderada"
    if relevancia >= 0.6:
        return "fraca"
    return None


def forca_genero_no_clima() -> str:
    """Metadado de gênero que responde a um Clima: fraca, porque gênero é amplo
    demais (a mesma razão que o limita a fraca no caminho de gosto). A spec não
    diz nada; a régua do metadado "que responde ao pedido" fala de duração e
    classificação, que são exatas."""
    return "fraca"


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
