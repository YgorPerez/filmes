"""O que a resolução do Letterboxd guarda no repo de dados: `imports/letterboxd.md`.

O Wikidata é refeito a cada `reconstruir`, a partir do Catálogo. O resto não pode
ser: a busca do TMDB depende de rede e de cache, e a fila depende do Dono. Por
isso cada resposta do TMDB que decidiu algo, e cada decisão do Dono, fica neste
arquivo, uma entrada por filme (pelo id `vento-norte-2020`):

    situacao: tmdb        o TMDB achou um filme só com o título; `filme` é o tconst
    situacao: minisserie  o TMDB achou só uma série com o título
    situacao: pendente    o TMDB não achou, ou achou mais de um; `candidatos` lista o que veio
    situacao: confirmado  o Dono disse qual é o filme (`filme`)
    situacao: descartado  o Dono disse que não é filme ou que é para ignorar (`motivo`)

As duas últimas valem antes de tudo, inclusive do Wikidata.
"""

from pathlib import Path

from filmes.dados import markdown

CAMINHO = Path("imports") / "letterboxd.md"
SITUACOES = ("tmdb", "minisserie", "pendente", "confirmado", "descartado")

_CORPO = (
    "Resoluções do import do Letterboxd que não saem do Wikidata: as respostas do TMDB e as\n"
    "decisões do Dono na fila. `reconstruir` lê este arquivo; os comandos `importar` e `fila` o escrevem.\n"
)


def ler(repo: Path) -> dict[str, dict]:
    arquivo = repo / CAMINHO
    if not arquivo.exists():
        return {}
    frente, _ = markdown.ler(arquivo)
    return {str(d["id"]): d for d in frente.get("filmes") or []}


def salvar(repo: Path, decisoes: dict[str, dict]) -> None:
    filmes = [decisoes[i] for i in sorted(decisoes)]
    markdown.escrever(repo / CAMINHO, {"filmes": filmes}, _CORPO)
