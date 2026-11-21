"""Fila de resolução do Letterboxd, compartilhada entre as Pessoas."""

import re
from contextlib import closing

from filmes.erros import ErroFilmes
from filmes.importar import decisoes, letterboxd
from filmes.sob_demanda import tmdb
from filmes.sob_demanda.cache import Cache, caminho


def ver(conn, amb):
    itens = {}
    for linha in conn.execute(
        "SELECT id, nome, ano, pessoa, razao FROM itens_letterboxd "
        "WHERE situacao = 'fila' ORDER BY nome, ano, id, pessoa"
    ):
        id_ = linha["id"]
        if id_ not in itens:
            item = dict(linha)
            item.pop("pessoa")
            item["pessoas"] = []
            item["candidatos"] = []
            itens[id_] = item
        itens[id_]["pessoas"].append(linha["pessoa"])
    arquivo = caminho(amb)
    if itens and arquivo.exists():
        cache = Cache(arquivo)
        with closing(cache.conn):
            for item in itens.values():
                if item["ano"] is None:
                    continue
                filmes = letterboxd.filmes_com_mesmo_titulo(
                    lambda titulo, ano: tmdb.TMDB.filmes_em_cache(cache, titulo, ano, amb.hoje),
                    item["nome"], item["ano"],
                )
                item["candidatos"] = [letterboxd.candidato(f) for f in filmes or ()]
    return {"itens": list(itens.values()),
            "atribuicoes": [tmdb.ATRIBUICAO] if any(i["candidatos"] for i in itens.values()) else []}


def decidir(conn, amb, id_, *, filme=None, razao=None):
    item = conn.execute(
        "SELECT nome, ano FROM itens_letterboxd WHERE id = ? AND situacao = 'fila' LIMIT 1", (id_,)
    ).fetchone()
    registro = decisoes.ler(amb.dados)
    if item is None:
        anterior = registro.get(id_, {})
        if (filme is None and anterior.get("situacao") == "descartado" and anterior.get("razao") == razao
                or filme is not None and anterior.get("entrada") == filme):
            return anterior | {"novo": False}
        raise ErroFilmes("item_fora_da_fila", f"'{id_}' não está na fila; consulte `fila ver`")

    decisao = {"id": id_, "nome": item["nome"], "ano": item["ano"], "data": amb.hoje.isoformat(),
               "fonte": "Dono", "tipo": "declarado"}
    atribuicoes = []
    if filme is None:
        if not razao or not razao.strip():
            raise ErroFilmes("uso_invalido", "informe a razão do descarte")
        decisao.update(situacao="descartado", razao=razao.strip())
    else:
        imdb, atribuicoes = _filme(conn, amb, filme)
        decisao.update(situacao="confirmado", filme=imdb, entrada=filme)
    registro[id_] = decisao
    letterboxd.carregar(conn, amb, decididos=registro)
    decisoes.salvar(amb.dados, registro)
    return decisao | {"novo": True, "atribuicoes": atribuicoes}


def _filme(conn, amb, entrada):
    imdb = re.fullmatch(r"(?:https://(?:www\.)?imdb\.com/title/)?(tt[0-9]+)/?(?:[?#].*)?", entrada)
    if imdb:
        return imdb[1], []
    id_tmdb = re.fullmatch(r"https://(?:www\.)?themoviedb\.org/movie/([0-9]+)(?:-[^/?#]+)?/?(?:[?#].*)?", entrada)
    if id_tmdb is None:
        raise ErroFilmes("uso_invalido", "use um tconst (tt...) ou um link de filme do IMDb ou do TMDB")
    ids = conn.execute(
        "SELECT DISTINCT imdb FROM slugs_letterboxd WHERE tmdb = ? AND imdb IS NOT NULL", (id_tmdb[1],)
    ).fetchall()
    if len(ids) == 1:
        return ids[0]["imdb"], []
    contexto = letterboxd.Contexto(amb)
    convertido = tmdb.TMDB.de(contexto).imdb(id_tmdb[1])
    if convertido:
        return convertido, [tmdb.ATRIBUICAO]
    aviso = contexto.avisos[0] if contexto.avisos else "o TMDB não devolveu um ID do IMDb"
    raise ErroFilmes("filme_sem_imdb", f"{aviso}. Use o tconst ou o link do IMDb para confirmar.")
