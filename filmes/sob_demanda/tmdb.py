"""TMDB: busca de filme por título e ano, para o que o Wikidata não resolveu no
import do Letterboxd. Cache de 6 meses; chave em FILMES_TMDB_CHAVE (a chave v3,
que vai como `api_key`, ou o token de leitura v4, que vai no cabeçalho).

Três pedidos, cada um uma entrada no cache e um arquivo nas gravações:

    filme-<slug>-<ano>    GET /search/movie?query=<título>&primary_release_year=<ano>
    serie-<slug>-<ano>    GET /search/tv?query=<título>&first_air_date_year=<ano>
    externos-<id>         GET /movie/<id>/external_ids, de onde sai o imdb_id

O `<slug>` é o do título (veja `zip_letterboxd.slug`): dois títulos com o mesmo
slug são iguais para a regra de aceitação, então dividem a resposta.
Os termos do TMDB pedem o aviso de `CREDITO` onde os dados dele aparecem.
"""

import urllib.parse

from filmes.importar.zip_letterboxd import slug
from filmes.recomendacao.creditos import TEXTOS
from filmes.sob_demanda.fonte import Fonte, pegar_json

URL = "https://api.themoviedb.org/3"
CREDITO = {"fonte": "TMDB", "texto": TEXTOS["TMDB"]}


class TMDB(Fonte):
    nome = "TMDB"
    pasta = "tmdb"
    variavel_chave = "FILMES_TMDB_CHAVE"
    validade_dias = 182
    sem_a_fonte = "o que o Wikidata não resolveu fica na fila manual"

    def __init__(self, contexto):
        super().__init__(contexto)
        self._pedidos = {}   # chave do cache -> (caminho, parâmetros), para `buscar`
        self.usado = False   # alguma resposta do TMDB decidiu algo nesta execução

    def filmes(self, titulo: str, ano: int) -> list[dict] | None:
        """Resultados da busca de filme; None quando o TMDB está fora."""
        return self._resultados(f"filme-{slug(titulo)}-{ano}", "/search/movie",
                                {"query": titulo, "primary_release_year": ano, "include_adult": "false"})

    def series(self, titulo: str, ano: int) -> list[dict] | None:
        return self._resultados(f"serie-{slug(titulo)}-{ano}", "/search/tv",
                                {"query": titulo, "first_air_date_year": ano, "include_adult": "false"})

    def imdb(self, tmdb_id) -> str | None:
        chave = f"externos-{tmdb_id}"
        self._pedidos[chave] = (f"/movie/{tmdb_id}/external_ids", {})
        registro = self.obter(chave)
        if registro is None:
            return None
        return registro.corpo.get("imdb_id") or None

    def _resultados(self, chave, caminho, parametros):
        self._pedidos[chave] = (caminho, parametros)
        registro = self.obter(chave)
        return None if registro is None else list(registro.corpo.get("results") or [])

    def buscar(self, chave, api):
        caminho, parametros = self._pedidos[chave]
        parametros = dict(parametros)
        cabecalhos = {}
        if len(api) > 40:  # token v4 (JWT)
            cabecalhos["Authorization"] = f"Bearer {api}"
        else:
            parametros["api_key"] = api
        corpo = pegar_json(f"{URL}{caminho}?{urllib.parse.urlencode(parametros)}", cabecalhos)
        return self.nao_encontrado() if corpo is None else corpo

    def nao_encontrado(self):
        return {"results": []}


def de(contexto) -> TMDB:
    return TMDB.de(contexto)
