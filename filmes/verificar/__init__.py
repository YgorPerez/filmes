"""Conferência da resposta por filme e por Pessoa, a partir da Sessão gravada."""

import re
from pathlib import Path

from filmes.dados import pessoas
from filmes.evidencia import FORCAS, TIPOS
from filmes.sessao import arquivo

_CABECALHO = re.compile(r"^\s*(?:#{1,6}\s+)?(?:\*\*)?\d+\.\s")
_EVIDENCIA = re.compile(r"^\s*(?:[-+*]\s|(?:\*\*)?Evidência:)")
_FORCA_TIPO = re.compile(rf"\((?:{'|'.join(FORCAS)}), (?:{'|'.join(TIPOS)})\)\*?$")
_MARCA_PALPITE = "sem fato que o sustente"
# Cabeçalho de apresentação (#30): a capa antes do título, a quebra `\` no fim
# dele e, na linha de baixo, gêneros e link do IMDb. Não são Evidência.
_CAPA = re.compile(r"^!\[[^\]]*\]\([^)\s]*\)\s+")
_GENEROS_E_IMDB = re.compile(r"^(?:[^*\[]+ · )?\[IMDb\]\(https://www\.imdb\.com/title/tt[0-9]+/\)$")


def verificar(repo: Path, sessao_id: str, resposta: str) -> list[str]:
    frente, corpo = arquivo.ler(repo, sessao_id)
    dono = frente.get("dono")
    if "dono" not in frente:
        dono = next((p.slug for p in pessoas.ler_todas(repo) if p.dono), None)

    filmes = _ler_recomendacao(frente, corpo, dono)
    invalidas = []
    permitidas = set()
    no_bloco = False
    for linha in resposta.splitlines():
        titulo = _CAPA.sub("", linha).removesuffix("\\")
        if titulo in filmes:
            permitidas = filmes[titulo]
            no_bloco = True
        elif _CABECALHO.match(titulo):
            invalidas.append(linha)
            permitidas = set()
            no_bloco = True
        elif not linha.strip():
            no_bloco = False
        elif _GENEROS_E_IMDB.match(linha.strip()):
            continue
        elif no_bloco or _EVIDENCIA.match(linha) or _FORCA_TIPO.search(linha):
            if linha not in permitidas:
                invalidas.append(linha)
    return invalidas


def _ler_recomendacao(frente: dict, corpo: str, dono: str | None) -> dict[str, set[str]]:
    por_posicao = {str(f["posicao"]): f for f in frente["recomendacao"]}
    filmes = {}
    linhas_do_filme = set()
    rotulos = ()
    indice = 0
    for linha in corpo.splitlines():
        if linha[:1].isdigit():
            filme = por_posicao.get(linha.partition(".")[0])
            cabecalho = _cabecalho_da_resposta(linha, filme) if filme else None
            linhas_do_filme = filmes.setdefault(cabecalho, set()) if cabecalho else set()
            rotulos = ()
            indice = 0
        elif linha.startswith("   - "):
            nome = linha.removeprefix("   - ")
            # O arquivo escreve os grupos na ordem dos Presentes, seguido pela linha do filme.
            rotulos = (nome,)
            if indice < len(frente["presentes"]) and frente["presentes"][indice] == dono:
                rotulos += ("Você",)
            indice += 1
        elif linha.startswith("     - Evidência: "):
            resumo = _resumir(linha.removeprefix("     - Evidência: "))
            if resumo is not None:
                linhas_do_filme.update(f"- **{rotulo}:** {resumo}" for rotulo in rotulos)
    return filmes


def _cabecalho_da_resposta(linha: str, filme: dict) -> str | None:
    titulo = f"{filme['posicao']}. {filme['titulo']}"
    if not linha.startswith(titulo):
        return None
    metadados, separador, fim = linha[len(titulo):].rpartition(f" · {filme['id']}")
    if not separador or fim not in ("", f" · {_MARCA_PALPITE}"):
        return None
    marca = f" — {_MARCA_PALPITE}" if fim else ""
    return f"**{titulo}**{metadados}{marca}"


def _resumir(linha: str) -> str | None:
    texto, _, tipo = linha.rpartition(" · Tipo: ")
    texto, _, forca = texto.rpartition(" · Força: ")
    if tipo not in TIPOS or forca not in FORCAS:
        return None
    if tipo != "palpite":
        motivo, separador, fonte = texto.rpartition(" · Fonte: ")
        if separador:
            texto = f"{motivo} ({fonte})"
    return f"{texto} *({forca}, {tipo})*"
