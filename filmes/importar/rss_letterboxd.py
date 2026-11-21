"""Leitura do RSS público do Letterboxd de uma Pessoa, que só é baixado com o
consentimento dela (decisão de licenças, #12).

O RSS traz as ~50 entradas mais recentes do diário e das reviews, além das
listas. Cada entrada de filme traz:

    letterboxd:filmTitle, letterboxd:filmYear   o par (Name, Year) do export
    letterboxd:watchedDate                      o dia em que viu (ausente na review sem diário)
    letterboxd:memberRating                     a nota de 0,5 a 5, quando há
    tmdb:movieId                                o ID do filme no TMDB
    pubDate                                     quando a entrada foi publicada

As listas não têm `filmTitle` e ficam de fora. O texto da review também: o
`description` mistura pôster e texto, e o ticket pede só diário e notas.
"""

import datetime as dt
import email.utils
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from filmes.erros import ErroFilmes
from filmes.importar.zip_letterboxd import Linha

ARQUIVO = "rss"
TEMPO_LIMITE = 20  # segundos
_NS = {"letterboxd": "https://letterboxd.com", "tmdb": "https://themoviedb.org"}


def url(usuario: str) -> str:
    return f"https://letterboxd.com/{usuario}/rss/"


def baixar(amb, usuario: str) -> bytes:
    """O RSS do usuário. Com FILMES_GRAVACOES, lê `<gravacoes>/letterboxd/rss-<usuário>.xml`."""
    if not re.fullmatch(r"[A-Za-z0-9_]+", usuario):
        raise ErroFilmes("uso_invalido", f"usuário do Letterboxd inválido: {usuario!r}")
    if amb.gravacoes:
        arquivo = amb.gravacoes / "letterboxd" / f"rss-{usuario}.xml"
        if not arquivo.exists():
            raise _sem_rss(usuario)
        return arquivo.read_bytes()
    pedido = urllib.request.Request(url(usuario), headers={"User-Agent": "filmes"})
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resposta:
            return resposta.read()
    except urllib.error.HTTPError as erro:
        if erro.code == 404:
            raise _sem_rss(usuario) from erro
        raise ErroFilmes("fonte_indisponivel", f"o Letterboxd respondeu HTTP {erro.code} ao RSS de {usuario}") from erro
    except (urllib.error.URLError, TimeoutError, OSError) as erro:
        motivo = getattr(erro, "reason", erro)
        raise ErroFilmes("fonte_indisponivel", f"não deu para baixar o RSS de {usuario}: {motivo}") from erro


def _sem_rss(usuario):
    return ErroFilmes("rss_ausente", f"o Letterboxd não tem o usuário {usuario} (ou o perfil é privado)")


def ler(caminho: Path, *, conteudo: bytes | None = None) -> list[Linha]:
    try:
        raiz = ET.fromstring(caminho.read_bytes() if conteudo is None else conteudo)
    except ET.ParseError as erro:
        raise ErroFilmes("arquivo_invalido", f"{caminho.name}: o RSS não é XML válido ({erro})") from erro
    except FileNotFoundError:
        raise ErroFilmes("arquivo_ausente", f"arquivo não encontrado: {caminho}")
    if raiz.tag != "rss" or raiz.find("channel") is None:
        raise ErroFilmes("arquivo_invalido", f"{caminho.name}: não parece um RSS do Letterboxd")
    linhas = []
    for item in raiz.iter("item"):
        nome = _texto(item, "letterboxd:filmTitle")
        if not nome:
            continue
        onde = f"{caminho.name}, entrada {_texto(item, 'guid') or nome}"
        linhas.append(Linha(
            arquivo=ARQUIVO,
            nome=nome,
            ano=_ano(_texto(item, "letterboxd:filmYear"), onde),
            data=_publicacao(_texto(item, "pubDate"), onde),
            visto_em=_dia(_texto(item, "letterboxd:watchedDate"), onde),
            nota=_nota(_texto(item, "letterboxd:memberRating"), onde),
            tmdb=_texto(item, "tmdb:movieId") or None,
        ))
    return linhas


def _texto(item, campo):
    no = item.find(campo, _NS)
    return (no.text or "").strip() if no is not None else ""


def _ano(valor, onde):
    if not valor:
        return None
    if not re.fullmatch(r"[0-9]{4}", valor):
        raise ErroFilmes("arquivo_invalido", f"{onde}: ano inválido: {valor!r}")
    return int(valor)


def _publicacao(valor, onde):
    """O dia da publicação, no fuso em que foi publicada."""
    try:
        return email.utils.parsedate_to_datetime(valor).date().isoformat()
    except (TypeError, ValueError):
        raise ErroFilmes("arquivo_invalido", f"{onde}: data de publicação inválida: {valor!r}")


def _dia(valor, onde):
    if not valor:
        return None
    try:
        return dt.date.fromisoformat(valor).isoformat()
    except ValueError:
        raise ErroFilmes("arquivo_invalido", f"{onde}: data do diário inválida: {valor!r}")


def _nota(valor, onde):
    if not valor:
        return None
    try:
        nota = float(valor)
    except ValueError:
        raise ErroFilmes("arquivo_invalido", f"{onde}: nota inválida: {valor!r}")
    if not 0.5 <= nota <= 5:
        raise ErroFilmes("arquivo_invalido", f"{onde}: nota fora de 0,5 a 5: {valor!r}")
    return nota
