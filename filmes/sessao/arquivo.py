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
from pathlib import Path

from filmes.dados import markdown
from filmes.erros import ErroFilmes

PASTA = "sessoes"


def relativo(sessao_id: str) -> str:
    return f"{PASTA}/{sessao_id}.md"


def caminho(repo: Path, sessao_id: str) -> Path:
    return repo / PASTA / f"{sessao_id}.md"


def ids(repo: Path) -> list[str]:
    return sorted(a.stem for a in (repo / PASTA).glob("*.md"))


def ler(repo: Path, sessao_id: str) -> tuple[dict, str]:
    arquivo = caminho(repo, sessao_id)
    if not arquivo.exists():
        raise ErroFilmes("sessao_desconhecida", f"não há Sessão '{sessao_id}' em {repo / PASTA}")
    frente, corpo = markdown.ler(arquivo)
    for campo in ("data", "presentes", "regra"):
        if campo not in frente:
            raise ErroFilmes("dados_invalidos", f"{arquivo}: falta o campo {campo}")
    return frente, corpo


def escrever(repo: Path, sessao_id: str, frente: dict, corpo: str) -> None:
    markdown.escrever(caminho(repo, sessao_id), frente, corpo)


def aberta(frente: dict) -> bool:
    return not frente.get("feedback")


def novo_id(repo: Path, data: dt.date, partes: list[str]) -> str:
    """`<data>-<presentes>`. Se já houver uma Sessão fechada com esse nome, ganha -2, -3...
    Uma aberta com o mesmo nome é a mesma Sessão pedida de novo e é regravada."""
    base = f"{data.isoformat()}-{'-'.join(partes)}"
    n = 1
    while True:
        sessao_id = base if n == 1 else f"{base}-{n}"
        arquivo = caminho(repo, sessao_id)
        if not arquivo.exists() or aberta(markdown.ler(arquivo)[0]):
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
        if filme.get("do_filme"):
            linhas.append("   - Filme")
            linhas.extend(f"     - {linha_completa(e)}" for e in filme["do_filme"])
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
