"""Redação das linhas de Evidência em português. O Claude copia, não reescreve."""


def nota(valor: float) -> str:
    """5.0 vira "5"; 4.5 vira "4,5"."""
    return f"{valor:g}".replace(".", ",")


# Como a Nota declarada abre a frase da semente ("amo" vira 5, "odeio" vira 1).
_DITO = {
    ("declarado", 5.0): "disse que ama", ("declarado", 1.0): "disse que odeia",
    ("relato", 5.0): "segundo o Dono, ama", ("relato", 1.0): "segundo o Dono, odeia",
}


def semente(tipo: str, valor: float, filme: str) -> str:
    """O começo da linha de uma Nota-semente: "deu 4,5 a X", "disse que ama X",
    "segundo o Dono, odeia X"."""
    if tipo == "nota":
        return f"deu {nota(valor)} a {filme}"
    return f"{_DITO[(tipo, valor)]} {filme}"


def lista(itens: list[str]) -> str:
    if len(itens) <= 1:
        return "".join(itens)
    return ", ".join(itens[:-1]) + " e " + itens[-1]


def filme(titulo: str, ano) -> str:
    return f"{titulo} ({ano})" if ano else titulo


def inteiro(valor: int) -> str:
    """3104 vira "3.104"."""
    return f"{valor:,}".replace(",", ".")


def duracao(minutos: int) -> str:
    """104 vira "1h44"; 120 vira "2h"; 45 vira "45min"."""
    horas, resto = divmod(minutos, 60)
    if not horas:
        return f"{resto}min"
    return f"{horas}h{resto:02d}" if resto else f"{horas}h"
