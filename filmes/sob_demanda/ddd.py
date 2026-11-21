"""Does the Dog Die: votos sim e não por tema de conteúdo ("a dog dies"),
para a Restrição de gatilho. Cache de 30 dias; chave em FILMES_DDD_CHAVE.

Os termos proíbem baixar a base e pedem "Powered by DoesTheDogDie.com" em
toda tela que mostra o dado: só se consulta o filme que chegaria ao top 50, e
o texto do tema vai citado como veio.

A busca é pelo ID do IMDb; a resposta guardada é a da página do filme
(`item` e `topicItemStats`). O formato segue a API pública antiga do site; a
documentação da 3.0 não abre para leitura automatizada e não foi conferida.
"""

import urllib.parse
from dataclasses import dataclass

from filmes.sob_demanda.fonte import Fonte, pegar_json

NOME = "Does the Dog Die"
URL = "https://www.doesthedogdie.com"
ATRIBUICAO = "Powered by DoesTheDogDie.com"


@dataclass(frozen=True)
class Tema:
    nome: str        # como o Does the Dog Die escreve: "a dog dies"
    sim: int
    nao: int


@dataclass(frozen=True)
class Temas:
    por_nome: dict   # nome ou id do tema, em minúsculas -> Tema
    data: str
    fato_id: str

    def tema(self, pedido: str) -> Tema | None:
        return self.por_nome.get(pedido.strip().casefold())


class DoesTheDogDie(Fonte):
    nome = NOME
    pasta = "ddd"
    variavel_chave = "FILMES_DDD_CHAVE"
    validade_dias = 30
    sem_a_fonte = "o gatilho fica sem informação e nenhum filme sai por ele"

    def temas(self, imdb_id: str) -> Temas | None:
        """Os temas que o Does the Dog Die tem para o filme, ou None sem resposta."""
        registro = self.obter(imdb_id)
        if registro is None or not registro.corpo.get("topicItemStats"):
            return None
        por_nome = {}
        for stat in registro.corpo["topicItemStats"]:
            topico = stat.get("topic") or {}
            if not topico.get("name"):
                continue
            tema = Tema(nome=topico["name"], sim=int(stat.get("yesSum") or 0), nao=int(stat.get("noSum") or 0))
            for chave in (topico["name"], topico.get("doesName"), topico.get("id")):
                if chave is not None:
                    por_nome.setdefault(str(chave).strip().casefold(), tema)
        return Temas(por_nome=por_nome, data=registro.obtido_em, fato_id=f"{self.pasta}:{imdb_id}")

    def buscar(self, imdb_id, api):
        cabecalhos = {"X-API-KEY": api}
        busca = pegar_json(f"{URL}/dddsearch?{urllib.parse.urlencode({'imdb': imdb_id})}", cabecalhos)
        itens = (busca or {}).get("items") or []
        if not itens:
            return self.nao_encontrado()
        return pegar_json(f"{URL}/media/{itens[0]['id']}", cabecalhos) or self.nao_encontrado()

    def nao_encontrado(self):
        return {}


def de(contexto) -> DoesTheDogDie:
    return DoesTheDogDie.de(contexto)
