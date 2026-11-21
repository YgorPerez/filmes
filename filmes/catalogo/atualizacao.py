"""Baixa os dumps e troca o manifesto só quando todos estiverem disponíveis."""

import gzip
import json
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPException
from itertools import batched
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import ijson

from filmes.ambiente import RAIZ
from filmes.catalogo import versoes, wikidata
from filmes.erros import ErroFilmes

IMDB_URL = "https://datasets.imdbws.com/"
AGENTE = "filmes/0.1 (https://github.com/YgorPerez/filmes)"
FALHAS = (OSError, EOFError, HTTPException, ValueError, ijson.JSONError)
LOTE_ROTULOS = 20_000
LOTE_WDQS = 500


def atualizar(amb, progresso):
    if amb.catalogo.resolve().is_relative_to(RAIZ):
        raise ErroFilmes("config_invalida", "ponha FILMES_CATALOGO fora do repositório de código")
    gravacoes = os.environ.get("FILMES_GRAVACOES")
    gravacoes = Path(gravacoes) / "catalogo" if gravacoes else None
    amb.catalogo.mkdir(parents=True, exist_ok=True)

    try:
        with TemporaryDirectory(dir=amb.catalogo) as pasta:
            execucao = _Atualizacao(amb, Path(pasta), gravacoes)
            etapas = len(versoes.IMDB) + len(wikidata.GRUPOS) + 1
            for posicao, nome in enumerate(versoes.IMDB):
                progresso(posicao, etapas, f"Baixando {nome}")
                execucao.imdb(nome)
            for posicao, grupo in enumerate(wikidata.GRUPOS, start=len(versoes.IMDB)):
                execucao.wikidata(grupo, lambda fracao, mensagem: progresso(posicao + fracao, etapas, mensagem))
            execucao.rotulos(lambda fracao, mensagem: progresso(etapas - 1 + fracao, etapas, mensagem))
            versoes.gravar(amb.versoes, execucao.dumps)
    except FALHAS as erro:
        raise ErroFilmes("atualizacao_falhou", str(erro)) from erro
    progresso(etapas, etapas, "Versões do Catálogo gravadas")
    return {"versoes": str(amb.versoes), "dumps": execucao.dumps}


class _Atualizacao:
    def __init__(self, amb, pasta, gravacoes):
        self.catalogo = amb.catalogo
        self.hoje = amb.hoje.isoformat()
        self.pasta = pasta
        self.gravacoes = gravacoes
        self.dumps = {}
        self.itens = set()

    def imdb(self, nome):
        url = IMDB_URL + nome
        arquivo = self.pasta / nome
        if self.gravacoes:
            with (self.gravacoes / nome.removesuffix(".gz")).open("rb") as resposta:
                _comprimir(resposta, arquivo)
            data = self.hoje
        else:
            with _abrir(url) as resposta, arquivo.open("wb") as destino:
                shutil.copyfileobj(resposta, destino, length=1024 * 1024)
                data = resposta.headers.get("x-amz-meta-run-date", self.hoje)
        with gzip.open(arquivo, "rb") as dump:
            if not dump.readline().startswith(b"tconst\t"):
                raise ValueError(f"cabeçalho inesperado em {nome}")
            while dump.read(1024 * 1024):
                pass
        self._guardar(arquivo, "IMDb", url, data)

    def wikidata(self, grupo, progresso):
        propriedades = wikidata.GRUPOS[grupo]
        nome = versoes.nome_wikidata(grupo)
        progresso(0, f"Consultando o QLever ({grupo})")
        try:
            self._sparql(nome, "QLever", wikidata.QLEVER, wikidata.consulta(grupo, propriedades))
        except FALHAS as erro:
            progresso(0.1, f"QLever falhou ({grupo}): {erro}. Consultando o WDQS por predicado.")
            for posicao, propriedade in enumerate(propriedades, start=1):
                progresso(0.1 + 0.9 * posicao / (len(propriedades) + 1),
                          f"Consultando o WDQS ({grupo}, {propriedade})")
                nome = versoes.nome_wikidata(grupo, propriedade)
                self._sparql(nome, "WDQS", wikidata.WDQS, wikidata.consulta(grupo, (propriedade,)))

    def _sparql(self, nome, fonte, url, consulta):
        arquivo = self.pasta / nome
        if self.gravacoes:
            resposta = (self.gravacoes / nome.removesuffix(".gz")).open("rb")
        else:
            resposta = _abrir(url, consulta)
        with resposta:
            _comprimir(resposta, arquivo)
        itens = set()
        campos = ("valor",) if nome == versoes.ROTULOS else ("item", "p", "valor")
        for linha in wikidata.linhas(arquivo):
            if any("value" not in linha.get(campo, {}) for campo in campos):
                raise ValueError(f"linha SPARQL sem os campos esperados em {nome}")
            for campo in ("item", "valor"):
                item = wikidata.qid(linha.get(campo))
                if item:
                    itens.add(item)
        self.itens.update(itens)
        self._guardar(arquivo, fonte, url, self.hoje)

    def rotulos(self, progresso):
        nome = versoes.ROTULOS
        progresso(0, "Consultando o QLever (rótulos)")
        if self.gravacoes:
            self._sparql(nome, "QLever", wikidata.QLEVER, "")
            return

        lotes = list(batched(sorted(self.itens), LOTE_ROTULOS))
        arquivo = self.pasta / nome
        usou_wdqs = False
        with _gzip(arquivo) as fluxo, ThreadPoolExecutor(max_workers=2) as pool:
            fluxo.write(b'{"head":{"vars":["valor","pt","en","mul","codigo"]},"results":{"bindings":[')
            separador = b""
            for numero, (linhas, fallback) in enumerate(pool.map(_buscar_rotulos, lotes), start=1):
                usou_wdqs |= fallback
                for linha in linhas:
                    fluxo.write(separador + json.dumps(linha, ensure_ascii=False, separators=(",", ":")).encode())
                    separador = b","
                progresso(numero / (len(lotes) + 1), f"Rótulos do Wikidata: lote {numero}/{len(lotes)}")
            fluxo.write(b"]}}")
        fonte = "QLever e WDQS" if usou_wdqs else "QLever"
        self._guardar(arquivo, fonte, wikidata.QLEVER, self.hoje)
        if usou_wdqs:
            self.dumps[nome]["fallback"] = wikidata.WDQS

    def _guardar(self, arquivo, fonte, url, data):
        hash_dump = versoes.sha256(arquivo)
        destino = self.catalogo / hash_dump / arquivo.name
        destino.parent.mkdir(exist_ok=True)
        self.dumps[arquivo.name] = {
            "data": data, "sha256": hash_dump, "bytes": arquivo.stat().st_size, "fonte": fonte, "url": url,
        }
        os.replace(arquivo, destino)


def _buscar_rotulos(itens):
    def consultar(url, lote):
        with _abrir(url, wikidata.consulta_rotulos(lote), post=True) as resposta:
            linhas = list(wikidata.resposta(resposta))
        if {wikidata.qid(linha.get("valor")) for linha in linhas} != set(lote):
            raise ValueError("lote de rótulos do Wikidata incompleto")
        return linhas
    try:
        return consultar(wikidata.QLEVER, itens), False
    except FALHAS:
        linhas = []
        for lote in batched(itens, LOTE_WDQS):
            linhas.extend(consultar(wikidata.WDQS, lote))
        return linhas, True


def _gzip(arquivo):
    return gzip.GzipFile(str(arquivo), mode="wb", mtime=0, compresslevel=3)


def _comprimir(resposta, arquivo):
    with _gzip(arquivo) as gzipado:
        shutil.copyfileobj(resposta, gzipado, length=1024 * 1024)


def _abrir(url, consulta=None, post=False):
    headers = {"User-Agent": AGENTE}
    corpo = None
    if consulta:
        parametros = urlencode({"query": consulta})
        headers["Accept"] = "application/sparql-results+json"
        if post:
            corpo = parametros.encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            url += "?" + parametros
    pedido = Request(url, data=corpo, headers=headers)
    for tentativa in range(3):
        try:
            return urlopen(pedido, timeout=180)
        except HTTPError as erro:
            # Limites do WDQS e erros transitórios de gateway.
            codigo = erro.code
            espera = erro.headers.get("Retry-After", "")
            erro.close()
            if tentativa == 2 or codigo not in (429, 502, 503):
                raise
            time.sleep(min(60, int(espera)) if espera.isdecimal() else 2 ** tentativa)
        except URLError:
            if tentativa == 2:
                raise
            time.sleep(2 ** tentativa)
