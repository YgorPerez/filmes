"""Regerar mantendo filmes (#59, decisão do Dono de 2026-11-23).

Ao refazer uma Sessão com `--manter`, os mantidos ficam no número que tinham na
versão anterior (a lista do cartaz, `mostrados`, ou a Recomendação sem cartaz) e
só as vagas ganham filme novo. Uma Restrição ou um Veto do pedido refeito tiram
também o mantido que os viole; gosto novo não tira mantido, só muda quem entra
nas vagas.

`saidas` diz, para cada filme da versão anterior que não está na nova, o motivo:

    {"posicao", "id", "titulo", "motivo": "ja_visto", "pessoas": [slugs]}
    {"posicao", "id", "titulo", "motivo": "trocado"}
    {"posicao", "id", "titulo", "motivo": "restricao", "restricao": nome, "rotulo": "nada triste"}
    {"posicao", "id", "titulo", "motivo": "veto", "pessoa": slug, "texto": "o Veto como foi dito"}

`posicao` é o número que o filme tinha na versão anterior. `ja_visto` vale quando
algum Presente tem Já visto do filme com data igual ou posterior à da versão
anterior (o "Já vi" do cartaz); o Já visto mais antigo já estava lá quando o
filme foi mostrado, e a saída conta como `trocado`.
"""

import sqlite3
from dataclasses import dataclass

from filmes.recomendacao import restricoes, vetos
from filmes.sessao import arquivo


@dataclass(frozen=True)
class Regerar:
    anterior: tuple          # {posicao, id, titulo} da versão anterior, como o Dono viu
    data: str                # data da versão anterior, AAAA-MM-DD
    posicoes: dict           # filme_id -> posição, só dos mantidos que estavam na versão anterior

    def mantido(self, filme_id) -> bool:
        return filme_id in self.posicoes


def preparar(frente: dict, manter: list[str]) -> tuple[Regerar, list[str]]:
    """O que fica e o que estava na tela da versão atual da Sessão, e os avisos dos mantidos
    que não estavam nela."""
    versao = arquivo.versao_atual(frente)
    tela = arquivo.na_tela(versao)
    posicoes = {f["id"]: f["posicao"] for f in tela}
    avisos = [f"--manter {filme_id}: o filme não estava na versão anterior da Sessão; ficou de fora"
              for filme_id in manter if filme_id not in posicoes]
    return Regerar(tuple(tela), str(versao["data"]), {f: posicoes[f] for f in manter if f in posicoes}), avisos


def incluir(conn: sqlite3.Connection, elegiveis: dict, regerar: Regerar) -> dict:
    """Os elegíveis mais os mantidos que deixaram de ser Candidatos (nota ou votos): o
    mantido só sai por Restrição ou Veto."""
    faltam = [f for f in regerar.posicoes if f not in elegiveis]
    if not faltam:
        return elegiveis
    linhas = conn.execute(f"SELECT * FROM filmes WHERE id IN ({', '.join('?' * len(faltam))})", faltam)
    return {**elegiveis, **{linha["id"]: linha for linha in linhas}}


def pelo_veto(conn, presentes, filme, minimos) -> dict:
    """O motivo da saída de um mantido que um Veto tirou."""
    _, agiram = vetos.aplicar(conn, presentes, {filme["id"]: filme}, minimos)
    veto = agiram[0]
    return {"motivo": "veto", "pessoa": veto["pessoa"], "texto": veto["texto"]}


def pela_restricao(restricao) -> dict:
    """O motivo da saída de um mantido que uma Restrição tirou."""
    return {"motivo": "restricao", "restricao": restricao.nome,
            "rotulo": restricoes.rotulo({"nome": restricao.nome, **restricao.como_json()})}


def posicionar(regerar: Regerar, fixos: list, vagas: list, quantos: int) -> list[tuple[int, object]]:
    """(posição, item): os mantidos no número deles e as vagas, em ordem, nos números livres."""
    ocupadas = {regerar.posicoes[item.filme["id"]] for item in fixos}
    livres = [p for p in range(1, max(quantos, *ocupadas, 0) + 1) if p not in ocupadas]
    return sorted([*((regerar.posicoes[item.filme["id"]], item) for item in fixos), *zip(livres, vagas)],
                  key=lambda par: par[0])


def saidas(conn, presentes, regerar: Regerar, ficaram: set, tirados: dict) -> list[dict]:
    """Cada filme da versão anterior que não está na nova, com o motivo. `tirados` dá o
    motivo dos mantidos que uma Restrição ou um Veto tiraram."""
    lista = []
    for filme in regerar.anterior:
        if filme["id"] in ficaram:
            continue
        base = {"posicao": filme["posicao"], "id": filme["id"], "titulo": filme.get("titulo")}
        if filme["id"] in tirados:
            lista.append({**base, **tirados[filme["id"]]})
            continue
        viram = _viram(conn, presentes, filme["id"], regerar.data)
        lista.append({**base, "motivo": "ja_visto", "pessoas": viram} if viram else {**base, "motivo": "trocado"})
    return lista


def aviso(filme: dict, motivo: dict) -> str:
    porque = motivo["rotulo"] if motivo["motivo"] == "restricao" else f"Veto de {motivo['pessoa']} ({motivo['texto']})"
    return f"{filme['titulo']} saiu, apesar de mantido: {porque}"


def _viram(conn, presentes, filme_id, desde) -> list[str]:
    marcas = ", ".join("?" * len(presentes))
    vistos = {p for (p,) in conn.execute(
        f"SELECT DISTINCT pessoa FROM ja_vistos WHERE filme_id = ? AND data >= ? AND pessoa IN ({marcas})",
        [filme_id, desde, *presentes])}
    return [p for p in presentes if p in vistos]
