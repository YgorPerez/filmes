"""Pessoas no repo de dados: um arquivo `pessoas/<slug>.md` por Pessoa."""

from dataclasses import dataclass, field
from pathlib import Path

from filmes.dados import markdown
from filmes.erros import ErroFilmes


@dataclass
class Pessoa:
    slug: str
    nome: str
    apelidos: list[str] = field(default_factory=list)
    dono: bool = False
    vetos: list = field(default_factory=list)
    imports: list = field(default_factory=list)
    corpo: str = ""


def ler_todas(repo: Path) -> list[Pessoa]:
    pasta = repo / "pessoas"
    if not repo.is_dir():
        raise ErroFilmes("dados_ausentes", f"repo de dados não encontrado em {repo}")
    pessoas = [_ler(arquivo) for arquivo in sorted(pasta.glob("*.md"))]
    donos = [p.slug for p in pessoas if p.dono]
    if len(donos) > 1:
        raise ErroFilmes("dados_invalidos", f"mais de uma Pessoa com dono: true ({', '.join(donos)})")
    return pessoas


def _ler(arquivo: Path) -> Pessoa:
    frente, corpo = markdown.ler(arquivo)
    if "nome" not in frente:
        raise ErroFilmes("dados_invalidos", f"{arquivo}: falta o campo nome")
    return Pessoa(
        slug=arquivo.stem,
        nome=str(frente["nome"]),
        apelidos=[str(a) for a in frente.get("apelidos") or []],
        dono=bool(frente.get("dono", False)),
        vetos=list(frente.get("vetos") or []),
        imports=list(frente.get("imports") or []),
        corpo=corpo,
    )
