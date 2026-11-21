"""Conferência da resposta por filme e por Pessoa, a partir da Sessão gravada.

Cada filme da resposta abre com um título numerado. Logo abaixo dele vem o
cabeçalho de apresentação (capa, ficha, sinopse, cobertura), que não é
Evidência e não é conferido. Da primeira linha de lista em diante, cada linha
do bloco precisa ser uma Evidência da Sessão para aquele filme e aquele rótulo.

Dois formatos de Evidência valem:

    - **Você:** <texto> (<fonte>, <data>) *(forte, nota)*
    - ●●● **Você:** <texto> (<fonte>, <data>) *(nota)*         # #32: Força no marcador

No segundo, o rótulo pode juntar Presentes ("Ana e Teo") quando a linha vale
para cada um deles, como o "sem fato".
"""

import re
from pathlib import Path

from filmes.dados import pessoas
from filmes.evidencia import FORCAS, TIPOS
from filmes.sessao import arquivo

_MARCADORES = {"●●●": "forte", "●●○": "moderada", "●○○": "fraca"}
_TITULO = re.compile(r"^\s*(?:#{1,6}\s+)?(?:\*\*)?(\d+)\.\s")
_EM_BLOCOS = re.compile(r"^\s*#{1,6}\s+(\d+)\.\s+(.+?)\s*$")
_EVIDENCIA = re.compile(rf"^\s*(?:[-+*]\s|(?:\*\*)?Evidência:|(?:{'|'.join(_MARCADORES)})\s)")
_LISTA = re.compile(r"^\s*[-+*]\s")
_FORCA_TIPO = re.compile(rf"\((?:(?:{'|'.join(FORCAS)}), )?(?:{'|'.join(TIPOS)})\)\*?$")
_COM_MARCADOR = re.compile(rf"^- ({'|'.join(_MARCADORES)}) \*\*(.+?):\*\* (.*) \*\(({'|'.join(TIPOS)})\)\*$")
_MARCA_PALPITE = "sem fato que o sustente"
# Formato antigo (#30): a capa antes do título e a quebra `\` no fim dele.
_CAPA = re.compile(r"^!\[[^\]]*\]\([^)\s]*\)\s+")


def verificar(repo: Path, sessao_id: str, resposta: str) -> list[str]:
    frente, corpo = arquivo.ler(repo, sessao_id)
    dono = frente.get("dono")
    if "dono" not in frente:
        dono = next((p.slug for p in pessoas.ler_todas(repo) if p.dono), None)

    filmes = _ler_recomendacao(frente, corpo, dono)
    invalidas = []
    permitidas = set()
    estado = None   # None fora de filme; "cabecalho" logo depois do título; "evidencias" da primeira linha de lista em diante
    for linha in resposta.splitlines():
        titulo = _CAPA.sub("", linha).removesuffix("\\")
        if _TITULO.match(titulo):
            filme = _filme_do_titulo(titulo, filmes)
            if filme is None:
                invalidas.append(linha)
            permitidas = filme["linhas"] if filme else set()
            estado = "cabecalho"
        elif linha.strip() == "---":
            estado = None
        elif estado == "cabecalho" and not _LISTA.match(linha):
            continue
        elif not linha.strip():
            estado = None if estado == "evidencias" else estado
        elif estado or _EVIDENCIA.match(linha) or _FORCA_TIPO.search(linha):
            estado = estado and "evidencias"
            if not _permitida(linha, permitidas):
                invalidas.append(linha)
    return invalidas


def _filme_do_titulo(titulo: str, filmes: dict) -> dict | None:
    """O filme da Sessão que o título da resposta nomeia, ou None.

    Formato antigo: `**N. Título** (ano, duração)`, igual ao que a Sessão gravou.
    Em blocos: `### N. Título`, ou `### N. Título em português *(Título original)*`,
    com ` — sem fato que o sustente` no fim quando o filme só tem palpites.
    """
    for filme in filmes.values():
        if titulo == filme["antigo"]:
            return filme
    casou = _EM_BLOCOS.match(titulo)
    filme = filmes.get(int(casou.group(1))) if casou else None
    if filme is None:
        return None
    nome = casou.group(2)
    marca = f" — {_MARCA_PALPITE}"
    if nome.endswith(marca) != filme["palpite"]:
        return None
    nome = nome.removesuffix(marca)
    original = filme["titulo"]
    if nome == original or (nome.endswith(f" *({original})*") and nome != f"*({original})*"):
        return filme
    return None


def _permitida(linha: str, permitidas: set[str]) -> bool:
    if linha in permitidas:
        return True
    casou = _COM_MARCADOR.match(linha)
    if not casou:
        return False
    marcador, rotulo, texto, tipo = casou.groups()
    rotulos = [rotulo]
    if rotulo not in {p.split(":**", 1)[0].removeprefix("- **") for p in permitidas}:
        rotulos = [r for r in re.split(r", | e ", rotulo) if r]
    forca = _MARCADORES[marcador]
    return all(f"- **{r}:** {texto} *({forca}, {tipo})*" in permitidas for r in rotulos)


def _ler_recomendacao(frente: dict, corpo: str, dono: str | None) -> dict[int, dict]:
    """posição -> {titulo, palpite, antigo, linhas}, do corpo da Sessão."""
    por_posicao = {str(f["posicao"]): f for f in frente["recomendacao"]}
    filmes = {}
    linhas_do_filme = set()
    rotulos = ()
    indice = 0
    for linha in corpo.splitlines():
        if linha[:1].isdigit():
            posicao = linha.partition(".")[0]
            filme = por_posicao.get(posicao)
            antigo = _cabecalho_da_resposta(linha, filme) if filme else None
            linhas_do_filme = set()
            if antigo:
                filmes[int(posicao)] = {
                    "titulo": filme["titulo"],
                    "palpite": linha.endswith(f" · {_MARCA_PALPITE}"),
                    "antigo": antigo,
                    "linhas": linhas_do_filme,
                }
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
