"""Lê os JSONs de filmes do Raw Export do Trakt."""

import datetime as dt
import io
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from filmes.erros import ErroFilmes

_ARQUIVO = re.compile(r"(ratings(?:-movies)?|(?:watched-)?history|watched-movies)(?:-\d+)?\.json")
_CAMPOS_DE_DATA = {
    "ratings": "rated_at",
    "ratings-movies": "rated_at",
    "history": "watched_at",
    "watched-history": "watched_at",
    "watched-movies": "last_watched_at",
}


@dataclass(frozen=True)
class Filme:
    nome: str | None
    imdb: str | None
    tmdb: str | None
    trakt: int | None


@dataclass(frozen=True)
class Linha:
    filme: Filme
    instante: str
    nota: float | None


def ler(caminho, *, conteudo=None) -> list[Linha]:
    try:
        with zipfile.ZipFile(caminho if conteudo is None else io.BytesIO(conteudo)) as zip_:
            arquivos = []
            for entrada in zip_.infolist():
                achado = _ARQUIVO.fullmatch(PurePosixPath(entrada.filename).name)
                if achado and not entrada.is_dir():
                    arquivos.append((entrada, _CAMPOS_DE_DATA[achado[1]]))
            if not arquivos:
                raise ErroFilmes("arquivo_invalido", f"{caminho.name}: ZIP sem notas ou histórico do Trakt")
            tem_historico = any(campo == "watched_at" for _, campo in arquivos)
            return [
                linha
                for entrada, campo in arquivos
                if not (tem_historico and campo == "last_watched_at")
                for linha in _linhas(zip_.read(entrada), entrada.filename, campo)
            ]
    except FileNotFoundError as erro:
        raise ErroFilmes("arquivo_ausente", f"arquivo não encontrado: {caminho}") from erro
    except (zipfile.BadZipFile, UnicodeError, RuntimeError, NotImplementedError) as erro:
        raise ErroFilmes("arquivo_invalido", f"{caminho.name}: ZIP do Trakt inválido") from erro


def _linhas(conteudo, arquivo, campo):
    try:
        objetos = json.loads(conteudo)
    except (ValueError, UnicodeError) as erro:
        raise ErroFilmes("arquivo_invalido", f"{arquivo}: JSON inválido") from erro
    if not isinstance(objetos, list):
        raise ErroFilmes("arquivo_invalido", f"{arquivo}: o JSON deve conter uma lista")
    for numero, objeto in enumerate(objetos, 1):
        onde = f"{arquivo}, item {numero}"
        if not isinstance(objeto, dict):
            raise ErroFilmes("arquivo_invalido", f"{onde}: era esperado um objeto")
        tipo = objeto.get("type")
        if tipo not in (None, "movie"):
            continue
        dados = objeto.get("movie")
        if not isinstance(dados, dict):
            if "movie" not in objeto and tipo != "movie":
                continue
            # Um filme removido do Trakt pode aparecer sem o objeto de metadados.
            dados = {}
        ids = dados.get("ids")
        if not isinstance(ids, dict):
            ids = {}
        imdb = ids.get("imdb")
        tmdb = ids.get("tmdb")
        filme = Filme(
            nome=dados.get("title") if isinstance(dados.get("title"), str) else None,
            imdb=imdb if isinstance(imdb, str) and re.fullmatch(r"tt[0-9]+", imdb) else None,
            tmdb=str(tmdb) if re.fullmatch(r"[1-9][0-9]*", str(tmdb)) else None,
            trakt=ids.get("trakt") if type(ids.get("trakt")) is int else None,
        )
        nota = None
        if campo == "rated_at":
            valor = objeto.get("rating")
            if type(valor) is not int or not 1 <= valor <= 10:
                raise ErroFilmes("arquivo_invalido", f"{onde}: nota fora da escala inteira de 1 a 10")
            nota = valor / 2
        yield Linha(filme, _instante(objeto.get(campo), onde, campo), nota)


def _instante(valor, onde, campo):
    try:
        instante = dt.datetime.fromisoformat(valor)
        if instante.tzinfo is None:
            instante = instante.replace(tzinfo=dt.UTC)
        return instante.astimezone(dt.UTC).isoformat(timespec="microseconds")
    except (TypeError, ValueError, OverflowError) as erro:
        raise ErroFilmes("arquivo_invalido", f"{onde}: data inválida em {campo}") from erro
