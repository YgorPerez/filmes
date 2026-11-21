"""O que a resolução do Letterboxd guarda no repo de dados: `imports/letterboxd.md`.

`reconstruir` refaz a busca no Wikidata pelo Catálogo local. Para repetir o
resultado sem rede, lê neste arquivo as resoluções do TMDB e as decisões do
Dono, uma entrada por par (Name, Year). Os candidatos da busca ficam no cache.

    situacao: tmdb        o TMDB achou um filme só com o título; `filme` é o tconst
    situacao: minisserie  o TMDB achou só uma série com o título
    situacao: pendente    o TMDB não achou um filme único com ID do IMDb
    situacao: confirmado  o Dono disse qual é o filme (`filme`)
    situacao: descartado  o Dono disse que não é filme ou que é para ignorar (`razao`)

As duas últimas valem antes de tudo, inclusive do Wikidata.
"""

from pathlib import Path

from filmes.dados import markdown

CAMINHO = Path("imports") / "letterboxd.md"

_CORPO = (
    "Resoluções do import do Letterboxd que não saem do Wikidata: os IDs resolvidos e as\n"
    "decisões do Dono na fila. `reconstruir` lê este arquivo; os comandos `importar` e `fila` o escrevem.\n"
)


def ler(repo: Path) -> dict[str, dict]:
    arquivo = repo / CAMINHO
    if not arquivo.exists():
        return {}
    frente, _ = markdown.ler(arquivo)
    decisoes = {str(d["id"]): d for d in frente.get("filmes") or []}
    # Arquivos escritos antes da troca de nome guardam a razão do descarte em `motivo`.
    for d in decisoes.values():
        if "motivo" in d:
            d.setdefault("razao", d.pop("motivo"))
    return decisoes


def salvar(repo: Path, decisoes: dict[str, dict]) -> None:
    filmes = [decisoes[i] for i in sorted(decisoes)]
    markdown.escrever(repo / CAMINHO, {"filmes": filmes}, _CORPO)
