"""Conversão de classificação etária para a escala L, 6, 10, 12, 14, 16, 18.

Tabela da pesquisa de classificação etária (ramo research/classificacao-etaria),
com a faixa 6 decidida no #15: pega a idade mínima para ver sem acompanhante e
arredonda para cima, até a próxima faixa. Assim a conversão nunca deixa passar
uma criança mais nova. Exceções decididas na pesquisa e no #15:

- MPA R vira 16, não 18 (bate com a ClassInd em 41% dos casos, contra 25%).
- FSK 6, Kijkwijzer 6 e Medierådet 7 caem na faixa 6.
- O "livre" da EIRIN (G) e do CNC francês (tous publics) conta como sem informação:
  os dois saem mais brandos que a ClassInd em mais de 80% dos filmes.

Rótulo fora da tabela também conta como sem informação.
"""

import re

ESCALA = ("L", "6", "10", "12", "14", "16", "18")
CLASSIND = "P3216"

# propriedade do Wikidata -> (sistema, {rótulo normalizado: faixa})
SISTEMAS = {
    CLASSIND: ("ClassInd", {"l": "L", "al": "L", "livre": "L", "6": "6", "10": "10", "12": "12",
                            "14": "14", "16": "16", "18": "18"}),
    "P1657": ("MPA", {"g": "L", "pg": "10", "m": "10", "gp": "10", "pg-13": "14", "r": "16",
                      "nc-17": "18", "x": "18"}),
    "P2629": ("BBFC", {"u": "L", "pg": "10", "12": "12", "12a": "12", "15": "16", "18": "18", "x": "18"}),
    "P1981": ("FSK", {"0": "L", "6": "6", "12": "12", "16": "16", "18": "18"}),
    "P2684": ("Kijkwijzer", {"al": "L", "6": "6", "9": "10", "12": "12", "14": "14", "16": "16", "18": "18"}),
    "P5970": ("Medierådet", {
        "a": "L", "tilladt for alle": "L", "suitable for a general audience": "L",
        "7": "6", "suitable for a general audience, but not recommended for children under 7": "6",
        "11": "12", "for ages 11 and up": "12", "12": "12", "for ages 12 and up": "12",
        "15": "16", "for ages 15 and up": "16", "16": "16", "prohibited for children under 16": "16",
    }),
    "P2756": ("EIRIN", {"pg12": "12", "r15+": "16", "r18+": "18"}),
    "P2758": ("CNC", {
        "-12": "12", "no minors under twelve": "12",
        "-16": "16", "no minors under sixteen": "16",
        "-18": "18", "no minors under eighteen": "18",
        "x": "18", "x rating (incitement to violence)": "18", "x rating (pornographic content)": "18",
    }),
}
MPA = "P1657"


def idade(faixa: str) -> int:
    """A faixa em anos, para comparar com a idade da criança. L é 0."""
    return 0 if faixa == "L" else int(faixa)


def converter(propriedade: str, rotulo: str) -> tuple[str, str] | None:
    """(sistema, faixa) de um rótulo, ou None se a tabela não o aceita."""
    if propriedade not in SISTEMAS:
        return None
    sistema, tabela = SISTEMAS[propriedade]
    faixa = tabela.get(_normalizar(rotulo, sistema))
    return (sistema, faixa) if faixa else None


def _normalizar(rotulo: str, sistema: str) -> str:
    """ "FSK 12" vira "12"; "  PG-13 " vira "pg-13"."""
    texto = re.sub(r"\s+", " ", rotulo.strip().casefold())
    prefixo = sistema.casefold() + " "
    texto = texto.removeprefix(prefixo)
    if sistema == "BBFC":
        texto = texto.removeprefix("certificado ").removesuffix(" certificate")
    return texto
