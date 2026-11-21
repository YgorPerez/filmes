"""Arquivos originais de import no repo de dados."""

import hashlib
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from filmes.dados import pessoas
from filmes.erros import ErroFilmes


def registrados(repo, pessoa, tipo):
    for importado in pessoa.imports:
        if isinstance(importado, dict) and importado.get("tipo") == tipo:
            arquivo = repo / importado["arquivo"]
            if not arquivo.exists():
                raise ErroFilmes("dados_invalidos",
                                 f"pessoas/{pessoa.slug}.md registra o import {importado['arquivo']}, "
                                 "que não está no repo de dados")
            yield arquivo


def guardar(amb, pessoa, tipo, nome_original, conteudo) -> tuple[str, bool]:
    sha = hashlib.sha256(conteudo).hexdigest()
    for importado in pessoa.imports:
        if isinstance(importado, dict) and importado.get("tipo") == tipo and importado.get("sha256") == sha:
            return importado["arquivo"], False
    relativo = Path("imports") / pessoa.slug / f"{tipo}-{sha}.zip"
    destino = amb.dados / relativo
    destino.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=destino.parent, delete=False) as arquivo:
        temporario = Path(arquivo.name)
        try:
            arquivo.write(conteudo)
            arquivo.close()
            os.replace(temporario, destino)
        finally:
            temporario.unlink(missing_ok=True)
    pessoa.imports.append({"tipo": tipo, "arquivo": relativo.as_posix(), "data": amb.hoje.isoformat(),
                           "original": nome_original, "sha256": sha})
    pessoas.salvar(amb.dados, pessoa)
    return relativo.as_posix(), True
