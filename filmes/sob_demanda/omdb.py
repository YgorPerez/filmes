"""OMDb: o campo `Rated`, para a Restrição de criança quando nenhuma fonte
local tem classificação. Cache de 30 dias; chave em FILMES_OMDB_CHAVE.

Os termos do OMDb proíbem montar índice: só se consulta o filme que chegaria
ao top 50 de uma Sessão.
"""

import urllib.parse
from dataclasses import dataclass

from filmes.sob_demanda.fonte import FalhaDaFonte, Fonte, pegar_json

NOME = "OMDb"
URL = "https://www.omdbapi.com/"


@dataclass(frozen=True)
class Classificacao:
    rated: str
    data: str
    fato_id: str


class OMDb(Fonte):
    nome = NOME
    pasta = "omdb"
    variavel_chave = "FILMES_OMDB_CHAVE"
    validade_dias = 30
    sem_a_fonte = "filmes sem classificação local saem da Sessão com criança"

    def classificacao(self, imdb_id: str) -> Classificacao | None:
        """O `Rated` do filme, ou None sem resposta ou sem valor."""
        registro = self.obter(imdb_id)
        if registro is None or registro.corpo.get("Response") != "True":
            return None
        rated = (registro.corpo.get("Rated") or "").strip()
        if not rated or rated == "N/A":
            return None
        return Classificacao(rated=rated, data=registro.obtido_em, fato_id=f"{self.pasta}:{imdb_id}")

    def buscar(self, imdb_id, api):
        corpo = pegar_json(f"{URL}?{urllib.parse.urlencode({'i': imdb_id, 'apikey': api})}")
        if corpo is None:
            return self.nao_encontrado()
        if corpo.get("Response") == "False" and "not found" not in (corpo.get("Error") or "").casefold():
            raise FalhaDaFonte(corpo.get("Error") or "erro sem mensagem")
        return corpo

    def nao_encontrado(self):
        return {"Response": "False", "Error": "Movie not found!"}


def de(contexto) -> OMDb:
    return OMDb.de(contexto)
