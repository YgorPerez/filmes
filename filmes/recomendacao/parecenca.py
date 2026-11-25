"""Parecença entre um filme de referência e os outros do Catálogo (#67).

    medir(conn, referencia, config) -> dict[filme_id, Par]   # config: [parecido] de pesos.toml

Cada fonte dá um número de 0 a 1 para o par (referência, filme):

- genoma: as tags mais próprias da referência no Tag Genome (relevância acima da
  média da tag) e quanto do excesso de cada uma o filme também tem;
- tags_movielens: cosseno entre os vetores TF-IDF das tags do tags.csv
  (log de 1 + usuários, vezes a raridade da tag);
- vizinhos: o cosseno do vizinho item-item da referência, ambos / raiz(base da
  referência × base do vizinho), dividido pelo do vizinho mais forte dela; o
  filme do MovieLens que não está entre os vizinhos dela conta 0;
- genero: Jaccard dos gêneros do IMDb;
- pessoas: 1 se divide o diretor; senão, quantos dos 3 primeiros atores divide, sobre 3.

Fonte sem dado de um dos dois lados fica de fora do par, e a parecença é a média
das presentes com os pesos de `[parecido.peso]` (o peso de quem falta se
redistribui). Só entra filme com genoma, tags ou vizinhos acima de 0, ou com o
mesmo diretor: gênero e atores em comum, sozinhos (até os 3 primeiros), não
fazem um filme parecido, e milhares de filmes obscuros os dividem.

A média de cada tag no genoma, a raridade de cada tag e a norma do vetor de cada
filme saem prontas da reconstrução (`filmes/banco/etapas/70_parecenca.py`).
"""

import json
import math
import sqlite3
from dataclasses import dataclass, field


@dataclass
class Par:
    fontes: dict = field(default_factory=dict)      # fonte -> parecença de 0 a 1
    temas: dict = field(default_factory=dict)       # tag em comum -> (peso, fonte, data), para a explicação
    vizinho: tuple | None = None                    # (base, ambos, fonte, data) do vizinho da referência
    diretor: tuple | None = None                    # (fonte, data) da aresta, se divide o diretor

    def valor(self, pesos: dict) -> float:
        total = sum(pesos[f] for f in self.fontes)
        return sum(pesos[f] * v for f, v in self.fontes.items()) / total if total else 0.0

    def temas_principais(self, quantos=3) -> list[tuple]:
        """As tags em comum de maior peso: (tag, fonte, data)."""
        ordem = sorted(self.temas.items(), key=lambda item: (-item[1][0], item[0]))[:quantos]
        return [(tag, fonte, data) for tag, (_, fonte, data) in ordem]


def lista_json(ids) -> str:
    """IDs como lista JSON, para `IN (SELECT value FROM json_each(?))`."""
    return json.dumps(sorted(ids))


def medir(conn: sqlite3.Connection, referencia: str, config: dict) -> dict:
    pares: dict[str, Par] = {}

    def par(filme_id) -> Par:
        return pares.setdefault(filme_id, Par())

    # Fonte que a referência tem: o filme com dado nela e nada em comum fica com 0.
    presentes = {
        "genoma": _genoma(conn, referencia, config, par),
        "tags_movielens": _tags(conn, referencia, config, par),
        "vizinhos": _vizinhos(conn, referencia, par),
        "pessoas": _pessoas(conn, referencia, par),
    }
    pares.pop(referencia, None)
    pares = {f: p for f, p in pares.items() if _tem_algo_em_comum(p)}
    for fonte, sql in _COM_DADO.items():
        if not presentes[fonte]:
            continue
        faltam = [f for f, p in pares.items() if fonte not in p.fontes]
        for (filme_id,) in conn.execute(sql, (lista_json(faltam),)):
            pares[filme_id].fontes[fonte] = 0.0
    _generos(conn, referencia, pares)
    return pares


def _tem_algo_em_comum(par: Par) -> bool:
    """Genoma, tags ou vizinhos acima de 0, ou o mesmo diretor. Atores em comum (mesmo os
    3 primeiros) e o gênero, sozinhos, trazem filme obscuro que só ganha pela
    redistribuição do peso."""
    return any(par.fontes.get(f, 0) > 0 for f in _DO_MOVIELENS) or par.diretor is not None


_DO_MOVIELENS = ("genoma", "tags_movielens", "vizinhos")


# Os filmes de uma lista que têm dado na fonte.
_COM_DADO = {
    "genoma": "SELECT DISTINCT filme_id FROM genoma WHERE filme_id IN (SELECT value FROM json_each(?))",
    "tags_movielens": "SELECT DISTINCT filme_id FROM tags_movielens WHERE filme_id IN (SELECT value FROM json_each(?))",
    "vizinhos": "SELECT DISTINCT filme_id FROM vizinhos WHERE filme_id IN (SELECT value FROM json_each(?))",
    "pessoas": """SELECT filme_id FROM arestas WHERE predicado = 'diretor'
                    AND filme_id IN (SELECT value FROM json_each(?1))
                  UNION SELECT filme_id FROM elenco_principal_imdb WHERE filme_id IN (SELECT value FROM json_each(?1))""",
}


def _tema(par: Par, tag: str, peso: float, fonte: str, data: str) -> None:
    if peso > 0 and peso > par.temas.get(tag, (0.0,))[0]:
        par.temas[tag] = (peso, fonte, data)


def _genoma(conn, referencia, config, par) -> bool:
    da_ref = conn.execute(
        "SELECT tag, relevancia FROM genoma WHERE filme_id = ? ORDER BY relevancia DESC, tag LIMIT ?",
        (referencia, config["tags_genoma_consideradas"]),
    ).fetchall()
    if not da_ref:
        return False
    tags = [l["tag"] for l in da_ref]
    # A média de cada tag no genoma, pré-calculada na reconstrução (tags_no_catalogo).
    media = _por_tag(conn, "genoma", tags)
    excesso = {l["tag"]: l["relevancia"] - media[l["tag"]] for l in da_ref}
    proprias = dict(sorted(((t, e) for t, e in excesso.items() if e > 0),
                           key=lambda item: (-item[1], item[0]))[:config["tags_genoma"]])
    total = sum(proprias.values())
    if not total:
        return False
    for l in conn.execute(
            "SELECT filme_id, tag, relevancia, fonte, data FROM genoma WHERE tag IN (SELECT value FROM json_each(?)) "
            "ORDER BY filme_id, tag",
            (lista_json(proprias),)):
        comum = min(proprias[l["tag"]], max(l["relevancia"] - media[l["tag"]], 0.0))
        p = par(l["filme_id"])
        p.fontes["genoma"] = p.fontes.get("genoma", 0.0) + comum / total
        _tema(p, l["tag"], comum / total, l["fonte"], l["data"])
    return True


def _tags(conn, referencia, config, par) -> bool:
    da_ref = {l["tag"]: l["usuarios"] for l in conn.execute(
        "SELECT tag, usuarios FROM tags_movielens WHERE filme_id = ? ORDER BY tag", (referencia,))}
    if not da_ref:
        return False
    # TF-IDF: log(1 + usuários) vezes a raridade da tag. "overrated" e "love" estão em
    # milhares de filmes e dizem pouco; "writers" diz mais. A raridade e a norma de cada
    # filme vêm prontas da reconstrução (tags_no_catalogo, normas_tags_movielens).
    raridade = _por_tag(conn, "tags_movielens", da_ref)
    vetor_ref = {t: math.log1p(u) * raridade[t] for t, u in da_ref.items()}
    norma_ref = math.sqrt(sum(w * w for w in vetor_ref.values()))
    if not norma_ref:
        return False
    # Só as tags de mais peso da referência buscam filmes; o produto usa todas.
    busca = sorted(vetor_ref, key=lambda t: (-vetor_ref[t], t))[:config["tags_movielens"]]
    produtos, comuns = {}, {}
    for l in conn.execute(
            "SELECT t.filme_id, t.tag, t.usuarios, t.fonte, t.data, n.norma FROM tags_movielens t "
            "JOIN normas_tags_movielens n ON n.filme_id = t.filme_id "
            "WHERE t.tag IN (SELECT value FROM json_each(?1)) AND t.filme_id IN "
            "(SELECT filme_id FROM tags_movielens WHERE tag IN (SELECT value FROM json_each(?2))) "
            "ORDER BY t.filme_id, t.tag",
            (lista_json(vetor_ref), lista_json(busca))):
        if not l["norma"]:
            continue
        w = math.log1p(l["usuarios"]) * raridade[l["tag"]] / (norma_ref * l["norma"])
        produtos[l["filme_id"]] = produtos.get(l["filme_id"], 0.0) + vetor_ref[l["tag"]] * w
        if l["tag"] in busca:
            comuns.setdefault(l["filme_id"], []).append((l, w))
    for filme_id, produto in produtos.items():
        p = par(filme_id)
        p.fontes["tags_movielens"] = produto
        for l, w in comuns.get(filme_id, []):
            _tema(p, l["tag"], vetor_ref[l["tag"]] * w, l["fonte"], l["data"])
    return True


def _por_tag(conn, fonte, tags) -> dict:
    """O valor pré-calculado de cada tag numa fonte (tags_no_catalogo)."""
    return dict(conn.execute(
        "SELECT tag, valor FROM tags_no_catalogo WHERE fonte = ? AND tag IN (SELECT value FROM json_each(?))",
        (fonte, lista_json(tags))).fetchall())


def _vizinhos(conn, referencia, par) -> bool:
    """A proporção "de 412 que deram 4+ a X, 61% deram 4+ a Y" favorece o filme que todo
    mundo ama. A parecença divide os dois lados: ambos / raiz(base de X × base de Y), com
    a base de Y da linha em que ele é a semente (sem ela, a de X)."""
    da_ref = conn.execute(
        "SELECT vizinho_id, base, ambos, fonte, data FROM vizinhos WHERE filme_id = ? ORDER BY vizinho_id", (referencia,),
    ).fetchall()
    if not da_ref:
        return False
    bases = dict(conn.execute(
        "SELECT filme_id, max(base) FROM vizinhos WHERE filme_id IN (SELECT value FROM json_each(?)) GROUP BY filme_id",
        (lista_json(l["vizinho_id"] for l in da_ref),)).fetchall())
    cosseno = {l["vizinho_id"]: l["ambos"] / math.sqrt(l["base"] * bases.get(l["vizinho_id"], l["base"])) for l in da_ref}
    maior = max(cosseno.values())
    if not maior:
        return False
    for l in da_ref:
        p = par(l["vizinho_id"])
        p.fontes["vizinhos"] = cosseno[l["vizinho_id"]] / maior
        p.vizinho = (l["base"], l["ambos"], l["fonte"], l["data"])
    return True


def _pessoas(conn, referencia, par) -> bool:
    diretores = {l[0] for l in conn.execute(
        "SELECT entidade_id FROM arestas WHERE filme_id = ? AND predicado = 'diretor' ORDER BY entidade_id",
        (referencia,))}
    atores = {l[0] for l in conn.execute(
        "SELECT ator_imdb FROM elenco_principal_imdb WHERE filme_id = ? ORDER BY ator_imdb", (referencia,))}
    if diretores:
        for filme_id, fonte, data in conn.execute(
                "SELECT filme_id, fonte, data FROM arestas WHERE predicado = 'diretor' "
                "AND entidade_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, data DESC",
                (lista_json(diretores),)):
            p = par(filme_id)
            p.fontes["pessoas"] = 1.0
            p.diretor = p.diretor or (fonte, data)
    if atores:
        for filme_id, comuns in conn.execute(
                "SELECT filme_id, count(*) FROM elenco_principal_imdb "
                "WHERE ator_imdb IN (SELECT value FROM json_each(?)) GROUP BY filme_id ORDER BY filme_id",
                (lista_json(atores),)):
            p = par(filme_id)
            p.fontes["pessoas"] = max(p.fontes.get("pessoas", 0.0), min(comuns / 3, 1.0))
    return bool(diretores or atores)


def _generos(conn, referencia, pares) -> None:
    da_ref = {l[0] for l in conn.execute("SELECT genero FROM generos_imdb WHERE filme_id = ? ORDER BY genero", (referencia,))}
    if not da_ref or not pares:
        return
    generos = {}
    for filme_id, genero in conn.execute(
            "SELECT filme_id, genero FROM generos_imdb WHERE filme_id IN (SELECT value FROM json_each(?)) "
            "ORDER BY filme_id, genero",
            (lista_json(pares),)):
        generos.setdefault(filme_id, set()).add(genero)
    for filme_id, dele in generos.items():
        pares[filme_id].fontes["genero"] = len(da_ref & dele) / len(da_ref | dele)
