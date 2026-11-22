"""Grade dos pesos de aresta e dos multiplicadores de Força.

Os multiplicadores variam todos juntos (produto). Os pesos de aresta variam um
de cada vez: com cinco predicados, o produto completo daria 243 conjuntos de
pesos de aresta para cada conjunto de multiplicadores, e a grade deixaria de
ser pequena. O N do corte das Evidências mais fortes (`[utilidade]
evidencias_maximas`) varia sozinho, com o resto como está na config (#57).
"""

from copy import deepcopy
from itertools import product
from statistics import mean

from filmes.evidencia import FORCAS

EVIDENCIAS_MAXIMAS = (3, 5, 8, 10)


def valores(pesos):
    return {
        "caminho.peso": {nome: _variacoes(valor) for nome, valor in sorted(pesos["caminho"]["peso"].items())},
        "forca.multiplicador": {forca: _variacoes(pesos["forca"]["multiplicador"][forca]) for forca in FORCAS},
        "utilidade": {"evidencias_maximas": EVIDENCIAS_MAXIMAS},
    }


def _secao(config, secao):
    """O dicionário de `config` que a seção ("caminho.peso", "utilidade") nomeia."""
    tabela = config
    for parte in secao.split("."):
        tabela = tabela[parte]
    return tabela


def _variacoes(valor):
    if valor == 0:
        return (0, 0.25, 0.5)
    return (round(0.75 * valor, 12), valor, round(1.25 * valor, 12))


def combinacoes(pesos, espaco):
    parametros = [(secao, nome, opcoes) for secao, campos in espaco.items() for nome, opcoes in campos.items()]
    for escolha in product(*(opcoes for _, _, opcoes in parametros)):
        config = deepcopy(pesos)
        for (secao, nome, _), valor in zip(parametros, escolha):
            _secao(config, secao)[nome] = valor
        forcas = config["forca"]["multiplicador"]
        arestas_mudadas = sum(valor != pesos["caminho"]["peso"][nome] for nome, valor in config["caminho"]["peso"].items())
        corte_mudou = config["utilidade"]["evidencias_maximas"] != pesos["utilidade"]["evidencias_maximas"]
        if corte_mudou and (arestas_mudadas or forcas != pesos["forca"]["multiplicador"]):
            continue
        if forcas["fraca"] <= forcas["moderada"] <= forcas["forte"] and arestas_mudadas <= 1:
            yield config


def melhores(pesos, resultados):
    def media(offline, metrica):
        valores = [m[metrica] for m in offline.values() if m[metrica] is not None]
        return mean(valores) if valores else None

    def entrada(config, offline):
        return {
            "pesos": {"caminho.peso": config["caminho"]["peso"],
                      "forca.multiplicador": config["forca"]["multiplicador"],
                      "utilidade": {"evidencias_maximas": config["utilidade"]["evidencias_maximas"]}},
            "recall_50": media(offline, "recall_50"),
            "cobertura_top_5": media(offline, "cobertura_top_5"),
            "offline": offline,
        }

    def chave(entrada):
        alterados = sum(
            entrada["pesos"][secao][nome] != originais[secao][nome]
            for secao, valores in entrada["pesos"].items() for nome in valores
        )
        recall, cobertura = entrada["recall_50"], entrada["cobertura_top_5"]
        return (-(recall if recall is not None else -1), -(cobertura if cobertura is not None else -1), alterados)

    originais = entrada(pesos, {})["pesos"]
    return sorted((entrada(config, medidas) for config, medidas in resultados), key=chave)[:3]
