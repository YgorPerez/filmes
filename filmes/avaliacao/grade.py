"""Grade dos pesos de aresta e dos multiplicadores de Força."""

from copy import deepcopy
from itertools import product
from statistics import mean

from filmes.evidencia import FORCAS


def valores(pesos):
    return {
        "caminho.peso": {nome: _variacoes(valor) for nome, valor in sorted(pesos["caminho"]["peso"].items())},
        "forca.multiplicador": {forca: _variacoes(pesos["forca"]["multiplicador"][forca]) for forca in FORCAS},
    }


def _variacoes(valor):
    if valor == 0:
        return (0, 0.25, 0.5)
    return (round(0.75 * valor, 12), valor, round(1.25 * valor, 12))


def combinacoes(pesos, espaco):
    parametros = [(secao, nome, opcoes) for secao, campos in espaco.items() for nome, opcoes in campos.items()]
    for escolha in product(*(opcoes for _, _, opcoes in parametros)):
        config = deepcopy(pesos)
        for (secao, nome, _), valor in zip(parametros, escolha):
            tabela, campo = secao.split(".")
            config[tabela][campo][nome] = valor
        forcas = config["forca"]["multiplicador"]
        if forcas["fraca"] <= forcas["moderada"] <= forcas["forte"]:
            yield config


def melhores(pesos, resultados):
    def media(offline, metrica):
        valores = [m[metrica] for m in offline.values() if m[metrica] is not None]
        return mean(valores) if valores else None

    def entrada(config, offline):
        return {
            "pesos": {"caminho.peso": config["caminho"]["peso"],
                      "forca.multiplicador": config["forca"]["multiplicador"]},
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
