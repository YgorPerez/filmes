"""Regerar mantendo filmes (#59, decisão do Dono de 2026-11-23).

Ao refazer uma Sessão com `--manter`, os mantidos ficam no número que tinham na
versão anterior (a lista do cartaz, `mostrados`, ou a Recomendação sem cartaz) e
só as vagas ganham filme novo. Se a lista nova é mais curta que o número de um
mantido, a numeração se fecha, na mesma ordem, sem buraco. Uma Restrição ou um Veto do pedido refeito tiram
também o mantido que os viole, e a nota mínima e os votos mínimos do IMDb valem
para ele como para qualquer Candidato; gosto novo não tira mantido, só muda quem
entra nas vagas.

`saidas` diz, para cada filme da versão anterior que não está na nova, o motivo:

    {"posicao", "id", "titulo", "motivo": "ja_visto", "pessoas": [slugs]}
    {"posicao", "id", "titulo", "motivo": "trocado"}
    {"posicao", "id", "titulo", "motivo": "restricao", "restricao": nome, "rotulo": "nada triste"}
    {"posicao", "id", "titulo", "motivo": "veto", "pessoa": slug, "texto": "o Veto como foi dito"}
    {"posicao", "id", "titulo", "motivo": "nota_minima", "rotulo": "nota 6,5 no IMDb, abaixo de 7"}

`posicao` é o número que o filme tinha na versão anterior. `ja_visto` vale quando
algum Presente, de agora ou da versão anterior, tem Já visto do filme com data igual ou posterior à da versão
anterior (o "Já vi" do cartaz); o Já visto mais antigo já estava lá quando o
filme foi mostrado, e a saída conta como `trocado`.

Uma Restrição nova que troca a lista inteira (o parecido novo, #68) é o motivo
`restricao` de quem sai sem ser Já vi nem trocado pelo Dono (`trocados`: o
Trocar do cartaz, `--trocar` e o que não ficou do `--manter`).

O filme que volta da versão anterior não leva o selo "novo", mantido ou não.
"""

import sqlite3
from dataclasses import dataclass

from filmes.evidencia import texto
from filmes.recomendacao import restricoes, vetos
from filmes.sessao import arquivo


@dataclass(frozen=True)
class Regerar:
    anterior: tuple          # {posicao, id, titulo} da versão anterior, como o Dono viu
    data: str                # data da versão anterior, AAAA-MM-DD
    posicoes: dict           # filme_id -> posição, só dos mantidos que estavam na versão anterior
    presentes: tuple = ()    # os Presentes da versão anterior
    trocados: frozenset = frozenset()   # o que o Dono trocou da versão anterior
    troca: object = None     # a Restrição nova que troca a lista inteira, se há

    def mantido(self, filme_id) -> bool:
        return filme_id in self.posicoes

    def novo(self, filme_id) -> bool:
        return all(f["id"] != filme_id for f in self.anterior)

    def titulo(self, filme_id) -> str:
        return next((f.get("titulo") or filme_id for f in self.anterior if f["id"] == filme_id), filme_id)


def preparar(frente: dict, manter: list[str], trocados=frozenset(), troca=None) -> tuple[Regerar, list[str]]:
    """O que fica e o que estava na tela da versão atual da Sessão, e os avisos dos mantidos
    que não estavam nela. `trocados` é o que o Dono trocou dela; `troca`, a Restrição nova
    que troca a lista inteira."""
    versao = arquivo.versao_atual(frente)
    tela = arquivo.na_tela(versao)
    posicoes = {f["id"]: f["posicao"] for f in tela}
    avisos = [f"--manter {filme_id}: o filme não estava na versão anterior da Sessão; ficou de fora"
              for filme_id in manter if filme_id not in posicoes]
    return Regerar(tuple(tela), str(versao["data"]), {f: posicoes[f] for f in manter if f in posicoes},
                   tuple(versao["presentes"]), frozenset(trocados), troca), avisos


def pela_nota_minima(conn: sqlite3.Connection, filme_id: str, catalogo: dict) -> dict:
    """O motivo da saída de um mantido que não é Candidato: a nota mínima do IMDb e os
    votos mínimos valem sempre, para o mantido também."""
    filme = conn.execute("SELECT nota_imdb, votos FROM filmes WHERE id = ?", [filme_id]).fetchone()
    if filme is None:
        rotulo = "fora do Catálogo"
    elif filme["nota_imdb"] is not None and filme["nota_imdb"] < catalogo["nota_imdb_minima"]:
        rotulo = f"nota {texto.nota(filme['nota_imdb'])} no IMDb, abaixo de {texto.nota(catalogo['nota_imdb_minima'])}"
    else:
        rotulo = f"{_milhar(filme['votos'] or 0)} votos no IMDb, abaixo de {_milhar(catalogo['votos_minimos'])}"
    return {"motivo": "nota_minima", "rotulo": rotulo}


def _milhar(n: int) -> str:
    return f"{n:,}".replace(",", ".")


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
    """(posição, item): os mantidos no número deles e as vagas, em ordem, nos números livres.

    Sem buraco: quando a lista nova é mais curta que o número de um mantido (`--quantos`
    menor, ou vagas que faltaram), os que vêm depois do último número preenchido descem,
    na mesma ordem. Os mantidos de antes do primeiro buraco ficam no número deles."""
    ocupadas = {regerar.posicoes[item.filme["id"]] for item in fixos}
    livres = [p for p in range(1, max(quantos, *ocupadas, 0) + 1) if p not in ocupadas]
    em_ordem = sorted([*((regerar.posicoes[item.filme["id"]], item) for item in fixos), *zip(livres, vagas)],
                      key=lambda par: par[0])
    return [(posicao, item) for posicao, (_, item) in enumerate(em_ordem, start=1)]


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
        # Quem estava na versão anterior e saiu também viu o filme que o Dono marcou.
        quem = [*presentes, *(p for p in regerar.presentes if p not in presentes)]
        viram = _viram(conn, quem, filme["id"], regerar.data)
        if viram:
            lista.append({**base, "motivo": "ja_visto", "pessoas": viram})
        elif regerar.troca is not None and filme["id"] not in regerar.trocados:
            lista.append({**base, **pela_restricao(regerar.troca)})
        else:
            lista.append({**base, "motivo": "trocado"})
    return lista


def aviso(titulo: str, motivo: dict) -> str:
    porque = f"Veto de {motivo['pessoa']} ({motivo['texto']})" if motivo["motivo"] == "veto" else motivo["rotulo"]
    return f"{titulo} saiu, apesar de mantido: {porque}"


def _viram(conn, presentes, filme_id, desde) -> list[str]:
    marcas = ", ".join("?" * len(presentes))
    vistos = {p for (p,) in conn.execute(
        f"SELECT DISTINCT pessoa FROM ja_vistos WHERE filme_id = ? AND data >= ? AND pessoa IN ({marcas})",
        [filme_id, desde, *presentes])}
    return [p for p in presentes if p in vistos]
