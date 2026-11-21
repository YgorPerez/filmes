"""Redação das linhas de Evidência em português. O Claude copia, não reescreve."""


def nota(valor: float) -> str:
    """5.0 vira "5"; 4.5 vira "4,5"."""
    return f"{valor:g}".replace(".", ",")


def lista(itens: list[str]) -> str:
    if len(itens) <= 1:
        return "".join(itens)
    return ", ".join(itens[:-1]) + " e " + itens[-1]


def filme(titulo: str, ano) -> str:
    return f"{titulo} ({ano})" if ano else titulo


def inteiro(valor: int) -> str:
    """3104 vira "3.104"."""
    return f"{valor:,}".replace(",", ".")
