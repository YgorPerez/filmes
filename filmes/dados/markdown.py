"""Markdown com frontmatter YAML, o formato de todo arquivo do repo de dados."""

from pathlib import Path

import yaml

from filmes.erros import ErroFilmes


def ler(caminho: Path) -> tuple[dict, str]:
    """Devolve (frontmatter, corpo)."""
    texto = caminho.read_text(encoding="utf-8")
    if not texto.startswith("---\n"):
        return {}, texto
    fim = texto.find("\n---", 4)
    if fim == -1:
        raise ErroFilmes("dados_invalidos", f"{caminho}: frontmatter sem o '---' de fechamento")
    try:
        frente = yaml.safe_load(texto[4:fim]) or {}
    except yaml.YAMLError as erro:
        raise ErroFilmes("dados_invalidos", f"{caminho}: frontmatter inválido: {erro}")
    corpo = texto[fim + 4:].lstrip("\n")
    return frente, corpo


def escrever(caminho: Path, frente: dict, corpo: str = "") -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    yaml_txt = yaml.safe_dump(frente, allow_unicode=True, sort_keys=False, default_flow_style=None)
    caminho.write_text(f"---\n{yaml_txt}---\n{corpo}", encoding="utf-8")
