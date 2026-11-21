"""Leitura do ZIP de export do Letterboxd.

O Letterboxd não documenta as colunas; estas são as dos exports reais que a
pesquisa (#4, docs/research/letterboxd.md no ramo research/letterboxd) leu:

    watched.csv     Date,Name,Year,Letterboxd URI
    ratings.csv     Date,Name,Year,Letterboxd URI,Rating
    diary.csv       Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
    reviews.csv     Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
    watchlist.csv   Date,Name,Year,Letterboxd URI

O filme é a chave `(Name, Year)`. O `Letterboxd URI` não serve: no diário e nas
reviews ele aponta para a entrada do diário, não para o filme. `reviews.csv` tem
HTML, vírgulas e quebras de linha entre aspas, por isso o módulo `csv` de verdade.
As pastas `deleted/`, `orphaned/` e `lists/` do ZIP ficam de fora.
"""

import csv
import datetime as dt
import html
import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

from filmes.banco import fato_id
from filmes.erros import ErroFilmes

ARQUIVOS = ("watched", "ratings", "diary", "reviews", "watchlist")
_PASTAS_FORA = {"deleted", "orphaned", "lists"}


@dataclass(frozen=True)
class Linha:
    """Uma linha de um dos CSVs, já com os campos que viram Fato."""
    arquivo: str                 # watched, ratings, diary, reviews, watchlist; rss (rss_letterboxd.py)
    nome: str
    ano: int | None
    data: str                    # Date: quando a linha foi registrada no Letterboxd
    visto_em: str | None = None  # Watched Date (diário e reviews)
    nota: float | None = None
    review: str | None = None    # texto puro, sem HTML
    tags: tuple[str, ...] = ()
    tmdb: str | None = None      # ID do filme no TMDB (só o RSS traz)

    @property
    def id(self) -> str:
        return id_do_filme(self.nome, self.ano)

    @property
    def quando(self) -> str:
        """A data do Fato: o dia em que viu, quando o export diz; senão, o dia do registro."""
        return self.visto_em or self.data


def slug(nome: str) -> str:
    """O slug que o Letterboxd costuma dar ao filme: sem acento, minúsculo,
    apóstrofo apagado e cada sequência de outros símbolos virando um hífen.
    `Hit & Run` vira `hit-run`; `Noite d'Estreia` vira `noite-destreia`."""
    sem_apostrofo = re.sub(r"['’‘`]", "", nome)
    ascii_ = unicodedata.normalize("NFKD", sem_apostrofo).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")


def id_do_filme(nome: str, ano: int | None) -> str:
    """ID estável para o par (Name, Year), mesmo quando dois nomes dão o mesmo slug."""
    base = slug(nome)[:80] or "sem-titulo"
    sufixo = fato_id("letterboxd", nome, ano).split(":")[1]
    return f"{base}-{ano}-{sufixo}" if ano is not None else f"{base}-{sufixo}"


def ler(caminho: Path, *, conteudo: bytes | None = None) -> list[Linha]:
    try:
        with zipfile.ZipFile(caminho if conteudo is None else io.BytesIO(conteudo)) as z:
            achados = _achar_csvs(z)
            if not achados:
                raise ErroFilmes("arquivo_invalido",
                                 f"{caminho.name}: não parece um export do Letterboxd (sem watched.csv, ratings.csv, "
                                 "diary.csv, reviews.csv nem watchlist.csv)")
            linhas = []
            for arquivo in ARQUIVOS:
                if arquivo in achados:
                    texto = z.read(achados[arquivo]).decode("utf-8-sig")
                    linhas += _ler_csv(arquivo, texto)
            return linhas
    except zipfile.BadZipFile:
        raise ErroFilmes("arquivo_invalido", f"{caminho.name}: não é um ZIP")
    except (UnicodeDecodeError, csv.Error, RuntimeError) as erro:
        raise ErroFilmes("arquivo_invalido", f"{caminho.name}: {erro}") from erro
    except FileNotFoundError:
        raise ErroFilmes("arquivo_ausente", f"arquivo não encontrado: {caminho}")


def _achar_csvs(z: zipfile.ZipFile) -> dict[str, str]:
    """O caminho de cada CSV no ZIP. Aceita os arquivos na raiz ou numa pasta só."""
    achados = {}
    for nome in sorted(z.namelist(), key=lambda n: n.count("/")):
        partes = nome.split("/")
        if len(partes) > 2 or _PASTAS_FORA & set(partes[:-1]):
            continue
        base = partes[-1].removesuffix(".csv")
        if partes[-1].endswith(".csv") and base in ARQUIVOS:
            achados.setdefault(base, nome)
    return achados


def _ler_csv(arquivo: str, texto: str) -> list[Linha]:
    leitor = csv.DictReader(io.StringIO(texto, newline=""), strict=True)
    faltando = {"Date", "Name", "Year"} - set(leitor.fieldnames or [])
    if faltando:
        raise ErroFilmes("arquivo_invalido", f"{arquivo}.csv: faltam as colunas {', '.join(sorted(faltando))}")
    linhas = []
    for linha in leitor:
        numero = leitor.line_num
        onde = f"{arquivo}.csv, linha {numero}"
        nome = (linha.get("Name") or "").strip()
        if not nome:
            raise ErroFilmes("arquivo_invalido", f"{onde}: filme sem nome")
        linhas.append(Linha(
            arquivo=arquivo,
            nome=nome,
            ano=_ano(linha.get("Year"), onde),
            data=_data(linha.get("Date"), onde),
            visto_em=_data(linha.get("Watched Date"), onde, obrigatoria=False),
            nota=_nota(linha.get("Rating"), onde),
            review=_texto_da_review(linha.get("Review")),
            tags=tuple(t.strip() for t in (linha.get("Tags") or "").split(",") if t.strip()),
        ))
    return linhas


def _ano(valor, onde):
    valor = (valor or "").strip()
    if not valor:
        return None
    if not re.fullmatch(r"[0-9]{4}", valor):
        raise ErroFilmes("arquivo_invalido", f"{onde}: ano inválido: {valor!r}")
    return int(valor)


def _data(valor, onde, obrigatoria=True):
    valor = (valor or "").strip()
    if not valor:
        if obrigatoria:
            raise ErroFilmes("arquivo_invalido", f"{onde}: linha sem data")
        return None
    try:
        return dt.date.fromisoformat(valor).isoformat()
    except ValueError:
        raise ErroFilmes("arquivo_invalido", f"{onde}: data inválida: {valor!r}")


def _nota(valor, onde):
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        nota = float(valor)
    except ValueError:
        raise ErroFilmes("arquivo_invalido", f"{onde}: nota inválida: {valor!r}")
    if not 0.5 <= nota <= 5:
        raise ErroFilmes("arquivo_invalido", f"{onde}: nota fora de 0,5 a 5: {valor!r}")
    return nota


def _texto_da_review(valor):
    """HTML da review vira texto numa linha só: tags somem, entidades viram caractere."""
    if not valor or not valor.strip():
        return None
    sem_tags = re.sub(r"<[^>]+>", " ", valor)
    texto = " ".join(html.unescape(sem_tags).split())
    return re.sub(r" ([,.;:!?])", r"\1", texto) or None
