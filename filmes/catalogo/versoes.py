"""O manifesto aponta para objetos imutáveis, identificados pelo SHA-256."""

import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from filmes.catalogo.wikidata import GRUPOS
from filmes.erros import ErroFilmes

IMDB = ("title.basics.tsv.gz", "title.ratings.tsv.gz")
ROTULOS = "wikidata-rotulos.json.gz"


def nome_wikidata(grupo, propriedade=None):
    sufixo = f"-{propriedade}" if propriedade else ""
    return f"wikidata-{grupo}{sufixo}.json.gz"


def sha256(arquivo):
    with arquivo.open("rb") as fluxo:
        return hashlib.file_digest(fluxo, "sha256").hexdigest()


def gravar(caminho, dumps):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=caminho.parent, delete=False) as f:
        temporario = Path(f.name)
        try:
            json.dump({"dumps": dumps}, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
            f.close()
            os.replace(temporario, caminho)
        finally:
            temporario.unlink(missing_ok=True)


def ler(caminho, catalogo):
    if not caminho.is_file():
        raise ErroFilmes("versoes_ausentes", f"manifesto ausente em {caminho}. Rode atualizar.")
    try:
        dumps = json.loads(caminho.read_text(encoding="utf-8"))["dumps"]
        obrigatorios = {*IMDB, ROTULOS}
        restantes = set(dumps) - obrigatorios
        if not obrigatorios <= set(dumps):
            raise ValueError("faltam os dumps do IMDb ou os rótulos do Wikidata")
        for grupo, propriedades in GRUPOS.items():
            principal = nome_wikidata(grupo)
            nomes = {principal} if principal in dumps else {nome_wikidata(grupo, p) for p in propriedades}
            if not nomes <= restantes:
                raise ValueError(f"faltam dumps do Wikidata ({grupo})")
            restantes -= nomes
        if restantes:
            raise ValueError(f"dumps desconhecidos: {', '.join(sorted(restantes))}")
        for nome, versao in dumps.items():
            hash_fixo = versao["sha256"]
            dt.date.fromisoformat(versao["data"])
            if not re.fullmatch("[0-9a-f]{64}", hash_fixo):
                raise ValueError(f"SHA-256 inválido para {nome}")
            arquivo = catalogo / hash_fixo / nome
            if not arquivo.is_file():
                raise ValueError(f"dump fixado ausente: {arquivo}")
            if sha256(arquivo) != hash_fixo:
                raise ValueError(f"SHA-256 diverge para {nome}")
        return dumps
    except (OSError, ValueError, KeyError, TypeError) as erro:
        raise ErroFilmes("versoes_invalidas", f"{caminho}: {erro}") from erro
