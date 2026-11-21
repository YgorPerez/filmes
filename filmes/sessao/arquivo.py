"""O arquivo da Sessão no repo de dados: `sessoes/<data>-<presentes>.md`.

Frontmatter (protótipo de #10):

    data: 2026-11-20
    presentes: [bruno, iara]           # slugs
    contexto: {pedido, duracao_max, clima, restricoes}
    regra: {nome: padrao}              # ou {nome: de, pessoa: iara}
    escolhido: tt9000104               # null enquanto aberta e em "não vimos nada"
    escolhido_na_recomendacao: 1       # posição; null se o filme veio de fora
    feedback:                          # null enquanto aberta
      registrado_em: 2026-11-21
      reacoes:
        - {pessoa: bruno, tipo: nota, nota: 4.0}
        - {pessoa: iara, tipo: nota, nota: 4.5, repassada: true}
        - {pessoa: teo, tipo: relato, reacao: gostou}
    recomendacao:                      # a lista, para o Feedback achar a posição
      - {posicao: 1, id: tt9000104, titulo: As Horas Lentas}

O corpo guarda a Recomendação com todas as Evidências no formato completo de linha.
"""

import datetime as dt
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from filmes.dados import markdown
from filmes.erros import ErroFilmes

PASTA = "sessoes"


def relativo(sessao_id: str) -> str:
    return f"{PASTA}/{sessao_id}.md"


def caminho(repo: Path, sessao_id: str) -> Path:
    if not sessao_id or Path(sessao_id).name != sessao_id or sessao_id in {".", ".."}:
        raise ErroFilmes("uso_invalido", "passe o ID da Sessão sem o caminho do arquivo")
    return repo / PASTA / f"{sessao_id}.md"


def ids(repo: Path) -> list[str]:
    return sorted(a.stem for a in (repo / PASTA).glob("*.md"))


def ordem(registro) -> tuple[str, str, int]:
    sessao_id = registro["id"]
    base, _, sufixo = sessao_id.rpartition("-")
    if len(base) > 10 and sufixo.isascii() and sufixo.isdecimal():
        return registro["data"], base, int(sufixo)
    return registro["data"], sessao_id, 1


def ler(repo: Path, sessao_id: str) -> tuple[dict, str]:
    arquivo = caminho(repo, sessao_id)
    if not arquivo.exists():
        raise ErroFilmes("sessao_desconhecida", f"não há Sessão '{sessao_id}' em {repo / PASTA}")
    frente, corpo = markdown.ler(arquivo)
    for campo in ("data", "presentes", "regra"):
        if campo not in frente:
            raise ErroFilmes("dados_invalidos", f"{arquivo}: falta o campo {campo}")
    if frente["regra"] == "media-sem-miseria-com-justica":
        frente["regra"] = {"nome": "padrao"}
    if "recomendacao" not in frente:
        frente["recomendacao"] = [
            {"posicao": int(posicao), "id": filme, "titulo": titulo}
            for posicao, titulo, filme in re.findall(r"^(\d+)\. (.+) \((tt\d+)\)$", corpo, re.MULTILINE)
        ]
    return frente, corpo


def escrever(repo: Path, sessao_id: str, frente: dict, corpo: str) -> None:
    destino = caminho(repo, sessao_id)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=destino.parent, delete=False) as arquivo:
        temporario = Path(arquivo.name)
    try:
        markdown.escrever(temporario, frente, corpo)
        temporario.replace(destino)
    finally:
        temporario.unlink(missing_ok=True)


def aberta(frente: dict) -> bool:
    return not frente.get("feedback")


def novo_id(repo: Path, data: dt.date, partes: list[str]) -> str:
    """`<data>-<presentes>`, com sufixo -2, -3... quando o nome já existe."""
    base = f"{data.isoformat()}-{'-'.join(partes)}"
    n = 1
    while True:
        sessao_id = base if n == 1 else f"{base}-{n}"
        if not caminho(repo, sessao_id).exists():
            return sessao_id
        n += 1


def corpo(recomendacao: dict, nomes: dict) -> str:
    """A Recomendação no formato completo: por filme, as Evidências de cada Presente
    e as linhas do filme, todas, inclusive as que a resposta não mostra."""
    linhas = ["## Recomendação", ""]
    for filme in recomendacao["filmes"]:
        cabecalho = f"{filme['posicao']}. {filme['titulo']}{_ano_duracao(filme)} · {filme['id']}"
        if filme.get("so_palpites"):
            cabecalho += " · sem fato que o sustente"
        linhas.append(cabecalho)
        for pessoa, evidencias in filme["evidencias"].items():
            linhas.append(f"   - {nomes.get(pessoa, pessoa)}")
            linhas.extend(f"     - {linha_completa(e)}" for e in evidencias)
        if filme.get("linhas_do_filme"):
            linhas.append("   - Filme")
            linhas.extend(f"     - {linha_completa(e)}" for e in filme["linhas_do_filme"])
    return "\n".join(linhas) + "\n"


def linha_completa(evidencia: dict) -> str:
    partes = [f"Evidência: {evidencia['texto']}"]
    if evidencia["fonte"]:
        fonte = evidencia["fonte"] + (f", {evidencia['data']}" if evidencia["data"] else "")
        partes.append(f"Fonte: {fonte}")
    partes += [f"Força: {evidencia['forca']}", f"Tipo: {evidencia['tipo']}"]
    return " · ".join(partes)


def _ano_duracao(filme: dict) -> str:
    partes = []
    if filme.get("ano"):
        partes.append(str(filme["ano"]))
    minutos = filme.get("duracao_min")
    if minutos:
        partes.append(f"{minutos // 60}h{minutos % 60:02d}" if minutos >= 60 else f"{minutos}min")
    return f" ({', '.join(partes)})" if partes else ""
