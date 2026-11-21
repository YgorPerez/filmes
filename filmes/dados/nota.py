"""A Nota como o Dono a escreve: "4", "4,5" e "4.5" são a escala de 0,5 a 5;
"9/10" é a escala de 10, que vai de 1 a 10 e vale a metade."""

from filmes.erros import ErroFilmes
from filmes.evidencia import texto as redacao


def ler(texto: str) -> tuple[float, str | None]:
    """(a Nota de 0,5 a 5, o "9/10" dito quando veio na escala de 10)."""
    numero, barra, escala = texto.strip().partition("/")
    try:
        valor = float(numero.strip().replace(",", "."))
    except ValueError:
        valor = None
    if valor is None or (barra and escala.strip() != "10"):
        raise ErroFilmes("uso_invalido", f'nota inválida: {texto!r} (use de 0,5 a 5, ou de 1 a 10 com "/10")')
    if barra:
        if not 1 <= valor <= 10:
            raise ErroFilmes("uso_invalido", f"nota de 1 a 10 fora da escala: {texto!r}")
        return valor / 2, f"{redacao.nota(valor)}/10"
    if not 0.5 <= valor <= 5:
        dica = f' (se é de 1 a 10, escreva "{texto.strip()}/10")' if 1 <= valor <= 10 else ""
        raise ErroFilmes("uso_invalido", f"nota fora da escala de 0,5 a 5: {texto!r}{dica}")
    return valor, None
