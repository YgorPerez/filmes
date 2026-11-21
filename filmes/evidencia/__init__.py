"""Evidência: o uso de um Fato como Motivo, com Força e Tipo.

A Força sai só daqui, pela régua de `regua.py`. Os sinais da recomendação
criam Evidências com `base` (peso com sinal: positivo a favor, negativo contra);
a contribuição na ordenação é `base × multiplicador da Força` (config de pesos).
"""

from dataclasses import dataclass

FORCAS = ("fraca", "moderada", "forte")
TIPOS = ("metadado", "nota", "declarado", "relato", "review", "palpite")


@dataclass(frozen=True)
class Evidencia:
    pessoa: str | None      # None: linha do filme (duração, classificação...), não fala de um Presente
    filme_id: str
    texto: str
    fonte: str | None       # None só em palpite
    data: str | None
    forca: str
    tipo: str
    fato_id: str | None
    base: float

    def __post_init__(self):
        assert self.forca in FORCAS, self.forca
        assert self.tipo in TIPOS, self.tipo

    def contribuicao(self, pesos: dict) -> float:
        chave = "palpite" if self.tipo == "palpite" else self.forca
        return self.base * pesos["forca"]["multiplicador"][chave]

    def como_json(self, pesos: dict) -> dict:
        return {
            "pessoa": self.pessoa,
            "texto": self.texto,
            "fonte": self.fonte,
            "data": self.data,
            "forca": self.forca,
            "tipo": self.tipo,
            "fato_id": self.fato_id,
            "contribuicao": round(self.contribuicao(pesos), 4),
        }
