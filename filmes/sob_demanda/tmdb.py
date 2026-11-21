"""TMDB: busca de filme por título e ano, para o que o Wikidata não resolveu no
import do Letterboxd. Cache de 6 meses; chave em FILMES_TMDB_CHAVE (a chave v3,
que vai como `api_key`, ou o token de leitura v4, que vai no cabeçalho).

Três pedidos, cada um uma entrada no cache e um arquivo nas gravações:

    filme-<slug>-<ano>-<hash>    GET /search/movie?query=<título>&primary_release_year=<ano>
    serie-<slug>-<ano>-<hash>    GET /search/tv?query=<título>&first_air_date_year=<ano>
    externos-<id>         GET /movie/<id>/external_ids, de onde sai o imdb_id

A busca usa o título como veio do export. O cache distingue nomes que geram
o mesmo slug.
Os termos do TMDB pedem o aviso de `ATRIBUICAO` onde os dados dele aparecem.
"""

import hashlib
import re
import urllib.parse

from filmes.importar.zip_letterboxd import slug
from filmes.recomendacao.atribuicoes import TEXTOS
from filmes.sob_demanda.fonte import Fonte, pegar_json

URL = "https://api.themoviedb.org/3"
ATRIBUICAO = {"fonte": "TMDB", "texto": TEXTOS["TMDB"]}


class TMDB(Fonte):
    nome = "TMDB"
    pasta = "tmdb"
    variavel_chave = "FILMES_TMDB_CHAVE"
    validade_dias = 182
    sem_a_fonte = "o que o Wikidata não resolveu fica na fila manual"

    def __init__(self, contexto):
        super().__init__(contexto)
        self._pedidos = {}   # chave do cache -> (caminho, parâmetros), para `buscar`

    @staticmethod
    def _chave(tipo, titulo, ano):
        hash_ = hashlib.sha256(titulo.encode()).hexdigest()[:12]
        return f"{tipo}-{slug(titulo)[:80]}-{ano}-{hash_}"

    @classmethod
    def filmes_em_cache(cls, cache, titulo, ano, hoje):
        registro = cache.ler(cls.pasta, cls._chave("filme", titulo, ano), hoje)
        return None if registro is None else registro.corpo.get("results", [])

    def filmes(self, titulo: str, ano: int) -> list[dict] | None:
        """Resultados da busca de filme; None quando o TMDB está fora."""
        return self._resultados(self._chave("filme", titulo, ano), "/search/movie",
                                {"query": titulo, "primary_release_year": ano, "include_adult": "false"})

    def series(self, titulo: str, ano: int) -> list[dict] | None:
        return self._resultados(self._chave("serie", titulo, ano), "/search/tv",
                                {"query": titulo, "first_air_date_year": ano, "include_adult": "false"})

    def imdb(self, tmdb_id) -> str | None:
        chave = f"externos-{tmdb_id}"
        if not re.fullmatch(r"[0-9]+", str(tmdb_id)):
            return None
        registro = self._obter(chave, f"/movie/{tmdb_id}/external_ids", {})
        if registro is None:
            return None
        imdb = registro.corpo.get("imdb_id") or ""
        return imdb if re.fullmatch(r"tt[0-9]+", imdb) else None

    def _resultados(self, chave, caminho, parametros):
        registro = self._obter(chave, caminho, parametros)
        return None if registro is None else registro.corpo.get("results", [])

    def _obter(self, chave, caminho, parametros):
        self._pedidos[chave] = (caminho, parametros)
        try:
            return self.obter(chave)
        finally:
            del self._pedidos[chave]

    def buscar(self, chave, api):
        caminho, parametros = self._pedidos[chave]
        parametros = dict(parametros)
        cabecalhos = {}
        if len(api) > 40:  # token v4 (JWT)
            cabecalhos["Authorization"] = f"Bearer {api}"
        else:
            parametros["api_key"] = api
        corpo = pegar_json(f"{URL}{caminho}?{urllib.parse.urlencode(parametros)}", cabecalhos)
        if corpo is None:
            return self.nao_encontrado()
        if caminho.startswith("/search/"):
            for pagina in range(2, corpo.get("total_pages", 1) + 1):
                query = urllib.parse.urlencode(parametros | {"page": pagina})
                resposta = pegar_json(f"{URL}{caminho}?{query}", cabecalhos)
                if resposta:
                    corpo["results"].extend(resposta.get("results", []))
        return corpo

    def nao_encontrado(self):
        return {"results": []}
