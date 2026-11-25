"""Import do Letterboxd: do ZIP ou do RSS de uma Pessoa aos Fatos no banco.

O ZIP é o export que a Pessoa baixa. O RSS público só é baixado com o
consentimento dela (decisão de licenças, #12); fora ele, o motor nunca toca no
site do Letterboxd, cujos termos proíbem acesso automatizado.

Cadeia de resolução de cada filme `(Name, Year)`:

1. Decisão do Dono na fila (`confirmado` ou `descartado` em imports/letterboxd.md).
2. Se o RSS trouxe o ID do TMDB: o item do Wikidata com esse ID na P4947, ou a
   resposta do TMDB para esse ID registrada em imports/letterboxd.md.
3. Wikidata: `slug(Name)` e `slug(Name)-Year` na P6127, aceitando o item cuja P577
   mais antiga cai em Year ± 1; no empate, vence o slug com o ano. Item só com ID
   de série no TMDB é minissérie e sai.
4. TMDB, como registrado em imports/letterboxd.md pela última consulta.
5. O resto fica na fila.

`importar` consulta o TMDB para o que chega ao passo 4 e registra o resultado da resolução.
`carregar` (usado por `reconstruir` e depois de todo comando que muda algo) só lê
o que já está registrado, sem rede.

Fatos, todos com fato_id `letterboxd:...` e Fonte "Letterboxd de <nome>":
Nota (ratings, e a nota do diário e da review no dia em que viu), Já visto
(watched e diário), Declarado específico (o texto de cada review e cada tag,
datado do dia em que viu) e watchlist. Do RSS saem só Já visto e Nota, com Fonte
"RSS do Letterboxd de <nome>". O fato_id não depende da origem: a mesma entrada
do diário no RSS e no ZIP é um Fato só, e a Fonte do ZIP vence.
"""

import sqlite3
import unicodedata
from collections import Counter
from contextlib import closing, contextmanager
from dataclasses import dataclass, field
from pathlib import Path

from filmes.ambiente import Ambiente
from filmes.banco import fato_id
from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.importar import decisoes as registro
from filmes.importar import arquivos, rss_letterboxd, zip_letterboxd
from filmes.importar.zip_letterboxd import Linha
from filmes.sob_demanda import tmdb

TIPO = "letterboxd"
TIPO_RSS = "letterboxd-rss"
CAMINHOS = ("wikidata", "tmdb", "manual")
TABELAS_DE_FATO = ("notas", "ja_visto", "declarados", "watchlist")


@dataclass(frozen=True)
class Resolucao:
    situacao: str                    # resolvido, descartado, fila
    caminho: str | None = None       # wikidata, tmdb, manual
    filme_id: str | None = None
    razao: str | None = None
    tmdb_id: str | None = None


@dataclass
class Contexto:
    """O que uma fonte sob demanda precisa (veja `filmes.sob_demanda.fonte`)."""
    amb: Ambiente
    avisos: list[str] = field(default_factory=list)
    fontes: dict = field(default_factory=dict)


# --- a cadeia ---------------------------------------------------------------

def resolver(conn, nome: str, ano: int | None, decisao: dict | None, tmdb_id: str | None = None) -> Resolucao:
    """Resolve sem rede: Dono, ID do TMDB, Wikidata, o que o TMDB já respondeu, fila."""
    if decisao and decisao["situacao"] == "confirmado":
        return Resolucao("resolvido", "manual", filme_id=decisao["filme"])
    if decisao and decisao["situacao"] == "descartado":
        return Resolucao("descartado", "manual", razao=decisao.get("razao") or "descartado pelo Dono")
    if tmdb_id:
        pelo_id = pelo_id_do_tmdb(conn, tmdb_id, decisao)
        if pelo_id:
            return pelo_id
    if ano is None:
        return Resolucao("fila", razao="o export não traz o ano do filme")
    achado = _pelo_wikidata(conn, nome, ano)
    if achado and achado.situacao != "fila":
        return achado
    tmdb_id = achado.tmdb_id if achado else None
    if decisao and decisao["situacao"] == "tmdb":
        return Resolucao("resolvido", "tmdb", filme_id=decisao["filme"])
    if decisao and decisao["situacao"] == "minisserie":
        return Resolucao("descartado", "tmdb", razao="minissérie (no TMDB, a série com esse título tem mais votos que qualquer filme)")
    if decisao and decisao["situacao"] == "pendente":
        return Resolucao("fila", razao=decisao.get("razao"), tmdb_id=tmdb_id)
    return Resolucao("fila", razao="o Wikidata não deu um ID do IMDb, e o TMDB ainda não respondeu (`fila reprocessar` tenta de novo)",
                     tmdb_id=tmdb_id)


def pelo_id_do_tmdb(conn, tmdb_id: str, decisao: dict | None) -> Resolucao | None:
    """O filme que o ID do TMDB dá sem rede: pela P4947 do Wikidata, quando aponta
    um tconst só, ou pela resposta do TMDB para esse mesmo ID."""
    imdbs = {imdb for (imdb,) in conn.execute(
        """SELECT imdb FROM slugs_letterboxd WHERE tmdb = ? AND imdb IS NOT NULL
           UNION SELECT i.valor FROM metadados_wikidata t
           JOIN metadados_wikidata i ON i.item = t.item AND i.propriedade = 'P345'
           WHERE t.propriedade = 'P4947' AND t.valor = ?
           ORDER BY 1""",
        (tmdb_id, tmdb_id),
    )}
    if len(imdbs) == 1:
        return Resolucao("resolvido", "wikidata", filme_id=imdbs.pop())
    if decisao and decisao["situacao"] == "tmdb" and str(decisao.get("tmdb")) == str(tmdb_id):
        return Resolucao("resolvido", "tmdb", filme_id=decisao["filme"])
    return None


def _pelo_wikidata(conn, nome, ano) -> Resolucao | None:
    base = zip_letterboxd.slug(nome)
    if not base:
        return None
    com_ano = f"{base}-{ano}"
    linhas = conn.execute(
        """SELECT slug, item, imdb, tmdb, tmdb_serie FROM slugs_letterboxd
           WHERE slug IN (?, ?) AND ano BETWEEN ? AND ? ORDER BY item""",
        (base, com_ano, ano - 1, ano + 1),
    ).fetchall()
    itens = {l["item"]: l for l in linhas}
    if len(itens) > 1:
        itens = {l["item"]: l for l in linhas if l["slug"] == com_ano}
    if len(itens) != 1:
        return None
    [item] = itens.values()
    if item["tmdb_serie"] and not item["tmdb"]:
        return Resolucao("descartado", "wikidata", razao=f"minissérie ({item['item']} só tem ID de série no TMDB)")
    if item["imdb"]:
        return Resolucao("resolvido", "wikidata", filme_id=item["imdb"])
    return Resolucao("fila", tmdb_id=item["tmdb"])


def consultar_tmdb(fonte: tmdb.TMDB, nome: str, ano: int, tmdb_id: str | None) -> dict | None:
    """A decisão que a busca do TMDB dá ao filme, ou None se o TMDB não respondeu.

    Aceita um filme só com título igual (sem diferença de caixa, acento e pontuação),
    primeiro no ano, depois em ano ± 1. Curta quase sem votos sai dos candidatos
    quando sobra outro. Uma série com o título no ano e mais votos que todos os
    filmes é minissérie. Mais de um filme vai para a fila com os candidatos."""
    base = _decisao(fonte, nome, ano)
    if tmdb_id:
        imdb = fonte.imdb(tmdb_id)
        if imdb:
            return base | {"situacao": "tmdb", "filme": imdb}
        if fonte.desligada:
            return None
    iguais = filmes_com_mesmo_titulo(fonte.filmes, nome, ano)
    if iguais is None:
        return None
    iguais = _sem_curtas(fonte, iguais)
    if iguais is None:
        return None
    series = fonte.series(nome, ano)
    if series is None:
        return None
    votos_da_serie = max((s.get("vote_count") or 0 for s in series
                          if _mesmo_titulo(nome, s, "name", "original_name")), default=None)
    if votos_da_serie is not None and votos_da_serie > max(
            (f.get("vote_count") or 0 for f in iguais), default=-1):
        return base | {"situacao": "minisserie"}
    if len(iguais) == 1:
        [filme] = iguais
        imdb = fonte.imdb(filme["id"])
        if imdb:
            return base | {"situacao": "tmdb", "filme": imdb}
        if fonte.desligada:
            return None
        return base | {"situacao": "pendente", "razao": "o TMDB achou o filme, mas sem ID do IMDb"}
    if iguais:
        return base | {"situacao": "pendente", "razao": "o TMDB achou mais de um filme com esse título"}
    return base | {"situacao": "pendente", "razao": "nem o Wikidata nem o TMDB acharam o filme"}


def consultar_id_do_tmdb(fonte: tmdb.TMDB, nome: str, ano: int | None, tmdb_id: str) -> dict | None:
    """A decisão que o ID do TMDB do RSS dá ao filme, ou None sem tconst ou sem resposta."""
    imdb = fonte.imdb(tmdb_id)
    if not imdb:
        return None
    return _decisao(fonte, nome, ano) | {"situacao": "tmdb", "filme": imdb, "tmdb": str(tmdb_id)}


CURTA_MINUTOS = 40
CURTA_VOTOS = 10


def _sem_curtas(fonte, candidatos):
    """Os candidatos sem os curtas (menos de 40 min e de 10 votos), se sobrar algum;
    None se o TMDB parou de responder. A duração só é pedida para quem tem poucos votos."""
    if len(candidatos) < 2:
        return candidatos
    longas = []
    for filme in candidatos:
        if (filme.get("vote_count") or 0) < CURTA_VOTOS:
            duracao = fonte.duracao(filme["id"])
            if duracao is None and fonte.desligada:
                return None
            if duracao and duracao < CURTA_MINUTOS:
                continue
        longas.append(filme)
    return longas or candidatos


def _decisao(fonte, nome, ano):
    return {"id": zip_letterboxd.id_do_filme(nome, ano), "nome": nome, "ano": ano,
            "data": fonte.contexto.amb.hoje.isoformat()}


def filmes_com_mesmo_titulo(buscar, nome, ano):
    for anos in ((ano,), (ano - 1, ano + 1)):
        iguais = {}
        for tentativa in anos:
            resultados = buscar(nome, tentativa)
            if resultados is None:
                return None
            for filme in resultados:
                if _mesmo_titulo(nome, filme, "title", "original_title"):
                    iguais[filme["id"]] = filme
        if iguais:
            return list(iguais.values())
    return []


def _chave_do_titulo(titulo):
    decomposto = unicodedata.normalize("NFKD", titulo.casefold())
    return "".join(c for c in decomposto if c.isalnum())


def _mesmo_titulo(nome, resultado, *campos):
    alvo = _chave_do_titulo(nome)
    return bool(alvo) and any(alvo == _chave_do_titulo(resultado.get(c) or "") for c in campos)


def candidato(resultado):
    data = resultado.get("release_date") or ""
    return {"tmdb": resultado["id"], "titulo": resultado.get("title"), "titulo_original": resultado.get("original_title"),
            "ano": int(data[:4]) if data[:4].isdigit() else None,
            "link": f"https://www.themoviedb.org/movie/{resultado['id']}"}


# --- carga no banco ---------------------------------------------------------

def carregar(conn: sqlite3.Connection, amb, *, decididos=None) -> None:
    """Refaz no banco todos os Fatos de Letterboxd de todas as Pessoas, sem rede."""
    for tabela in TABELAS_DE_FATO:
        conn.execute(f"DELETE FROM {tabela} WHERE fato_id LIKE 'letterboxd:%'")
    conn.execute("DELETE FROM itens_letterboxd")
    if decididos is None:
        decididos = registro.ler(amb.dados)
    for pessoa in pessoas.ler_todas(amb.dados):
        linhas = linhas_da_pessoa(amb.dados, pessoa)
        if linhas:
            _carregar_pessoa(conn, pessoa, linhas, decididos)


def linhas_da_pessoa(repo: Path, pessoa) -> list[Linha]:
    """As linhas dos ZIPs e depois as dos RSS, para a Fonte do ZIP vencer no Fato repetido."""
    return ([linha for arquivo in arquivos.registrados(repo, pessoa, TIPO)
             for linha in zip_letterboxd.ler(arquivo)]
            + [linha for arquivo in arquivos.registrados(repo, pessoa, TIPO_RSS)
               for linha in rss_letterboxd.ler(arquivo)])


def _por_filme(linhas) -> dict[str, list[Linha]]:
    por_filme: dict[str, list[Linha]] = {}
    for linha in linhas:
        por_filme.setdefault(linha.id, []).append(linha)
    return por_filme


def _id_do_tmdb(do_filme) -> str | None:
    """O ID do TMDB que alguma linha do filme traz (só o RSS traz)."""
    return next((linha.tmdb for linha in do_filme if linha.tmdb), None)


def _carregar_pessoa(conn, pessoa, linhas, decididos):
    for id_, do_filme in _por_filme(linhas).items():
        primeira = do_filme[0]
        r = resolver(conn, primeira.nome, primeira.ano, decididos.get(id_), _id_do_tmdb(do_filme))
        conn.execute(
            """INSERT INTO itens_letterboxd (pessoa, id, nome, ano, situacao, caminho, filme_id, razao)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (pessoa.slug, id_, primeira.nome, primeira.ano, r.situacao, r.caminho, r.filme_id, r.razao),
        )
        if r.situacao == "resolvido":
            for linha in do_filme:
                _fatos(conn, pessoa.slug, f"{linha.origem} de {pessoa.nome}", r.filme_id, linha)


def _fatos(conn, slug, fonte, filme, linha: Linha):
    def inserir(tabela, colunas, valores):
        id_ = fato_id(TIPO, tabela, slug, filme, *valores)
        alvo = "alvo" if tabela == "declarados" else "filme_id"
        conn.execute(
            f"INSERT INTO {tabela} (fato_id, pessoa, {alvo}, fonte, {', '.join(colunas)}) "
            f"VALUES (?, ?, ?, ?, {', '.join('?' * len(colunas))}) ON CONFLICT(fato_id) DO NOTHING",
            (id_, slug, filme, fonte, *valores),
        )

    if linha.arquivo == "watchlist":
        inserir("watchlist", ["data"], [linha.data])
        return
    if linha.arquivo == "ratings":
        if linha.nota is not None:
            inserir("notas", ["data", "nota"], [linha.data, linha.nota])
        return
    inserir("ja_visto", ["data", "tipo"], [linha.quando, "declarado"])
    if linha.arquivo in ("diary", "reviews", rss_letterboxd.ARQUIVO) and linha.nota is not None:
        inserir("notas", ["data", "nota"], [linha.quando, linha.nota])
    ditos = ([linha.review] if linha.review else []) + [f"tag: {t}" for t in linha.tags]
    for texto in ditos:
        inserir("declarados", ["data", "especifico", "rotulo", "texto"],
                [linha.quando, 1, linha.nome, texto])


# --- o comando importar -----------------------------------------------------

def importar(amb, nome: str, zip_: Path) -> dict:
    try:
        conteudo = zip_.read_bytes()
    except FileNotFoundError:
        raise ErroFilmes("arquivo_ausente", f"arquivo não encontrado: {zip_}")
    linhas_novas = zip_letterboxd.ler(zip_, conteudo=conteudo)
    return _importar(amb, nome, linhas_novas, (TIPO, zip_.name, conteudo, "zip"))


def importar_rss(amb, nome: str, usuario: str) -> dict:
    """Baixa o RSS público do usuário, guarda a cópia e importa como um ZIP."""
    conteudo = rss_letterboxd.baixar(amb, usuario)
    linhas_novas = rss_letterboxd.ler(Path(f"rss-{usuario}.xml"), conteudo=conteudo)
    return _importar(amb, nome, linhas_novas, (TIPO_RSS, rss_letterboxd.url(usuario), conteudo, "xml"))


def _importar(amb, nome, linhas_novas, original) -> dict:
    tipo, nome_original, conteudo, extensao = original
    contexto = Contexto(amb)
    with escrita(amb) as conn:
        pessoa = pessoas.resolver(amb.dados, nome)
        antes = _contar_fatos(conn, pessoa.slug)
        decididos, usou_tmdb = _registrar_respostas_do_tmdb(
            conn, amb, contexto, linhas_novas + linhas_da_pessoa(amb.dados, pessoa))
        arquivo, novo = arquivos.guardar(amb, pessoa, tipo, nome_original, conteudo, extensao)
        carregar(conn, amb, decididos=decididos)
        depois = _contar_fatos(conn, pessoa.slug)
        return relatorio(conn, pessoa.slug) | {
            "arquivo": arquivo,
            "arquivo_novo": novo,
            "fatos": depois,
            "fatos_novos": {t: depois[t] - antes[t] for t in TABELAS_DE_FATO},
            "avisos": contexto.avisos,
            "atribuicoes": [tmdb.ATRIBUICAO] if usou_tmdb or _usa_tmdb(conn, pessoa.slug) else [],
        }


def reprocessar(amb, nome: str | None = None) -> dict:
    """Consulta de novo o TMDB para os itens da fila sem resposta dele, de uma Pessoa
    ou de todas. O que o TMDB já respondeu sai do cache, sem rede."""
    contexto = Contexto(amb)
    with escrita(amb) as conn:
        todas = [pessoas.resolver(amb.dados, nome)] if nome else pessoas.ler_todas(amb.dados)
        slugs = [p.slug for p in todas]
        marcas = ",".join("?" * len(slugs))
        antes = {l["id"] for l in conn.execute(
            f"SELECT id FROM itens_letterboxd WHERE situacao = 'fila' AND pessoa IN ({marcas}) ORDER BY id", slugs)}
        decididos, usou_tmdb = _registrar_respostas_do_tmdb(
            conn, amb, contexto, [l for p in todas for l in linhas_da_pessoa(amb.dados, p)])
        carregar(conn, amb, decididos=decididos)
        itens = {}
        for l in conn.execute(
            f"""SELECT id, nome, ano, situacao, caminho, filme_id, razao, pessoa FROM itens_letterboxd
                WHERE pessoa IN ({marcas}) ORDER BY nome, ano, id, pessoa""", slugs):
            if l["id"] in antes:
                item = itens.setdefault(l["id"], {k: l[k] for k in l.keys() if k != "pessoa"} | {"pessoas": []})
                item["pessoas"].append(l["pessoa"])
        return {
            "pessoas": slugs,
            "resolvidos": [i for i in itens.values() if i["situacao"] == "resolvido"],
            "descartados": [i for i in itens.values() if i["situacao"] == "descartado"],
            "na_fila": [i for i in itens.values() if i["situacao"] == "fila"],
            "avisos": contexto.avisos,
            "atribuicoes": [tmdb.ATRIBUICAO] if usou_tmdb else [],
        }


def _registrar_respostas_do_tmdb(conn, amb, contexto, linhas) -> tuple[dict, bool]:
    """Consulta o TMDB para o que a cadeia sem rede deixa na fila e grava as respostas
    em imports/letterboxd.md. Devolve (as decisões, se o TMDB respondeu algo)."""
    decididos = registro.ler(amb.dados)
    fonte = tmdb.TMDB.de(contexto)
    usou_tmdb = mudou = False
    for id_, do_filme in _por_filme(linhas).items():
        linha, tmdb_id = do_filme[0], _id_do_tmdb(do_filme)
        decisao = decididos.get(id_)
        nova = None
        do_dono = decisao and decisao["situacao"] in ("confirmado", "descartado")
        if tmdb_id and not do_dono and not pelo_id_do_tmdb(conn, tmdb_id, decisao):
            nova = consultar_id_do_tmdb(fonte, linha.nome, linha.ano, tmdb_id)
        if nova is None:
            r = resolver(conn, linha.nome, linha.ano, decisao, tmdb_id)
            if r.situacao != "fila" or linha.ano is None:
                continue
            nova = consultar_tmdb(fonte, linha.nome, linha.ano, r.tmdb_id)
        if nova is not None:
            usou_tmdb = True
            if not decisao or any(decisao.get(c) != v for c, v in nova.items() if c != "data"):
                decididos[id_] = nova
                mudou = True
    if mudou:
        registro.salvar(amb.dados, decididos)
    return decididos, usou_tmdb


@contextmanager
def escrita(amb):
    with closing(abrir_escrita(amb.banco)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        yield conn


def abrir_escrita(banco: Path) -> sqlite3.Connection:
    if not banco.exists():
        raise ErroFilmes("banco_ausente", f"banco não encontrado em {banco}: rode `python -m filmes reconstruir`")
    conn = sqlite3.connect(banco, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'itens_letterboxd'").fetchone():
        conn.close()
        raise ErroFilmes("banco_desatualizado", "o banco ainda não tem o import do Letterboxd. Rode `reconstruir`.")
    return conn


def _contar_fatos(conn, slug) -> dict:
    return {t: conn.execute(f"SELECT count(*) FROM {t} WHERE pessoa = ? AND fato_id LIKE 'letterboxd:%'",
                            (slug,)).fetchone()[0]
            for t in TABELAS_DE_FATO}


def _usa_tmdb(conn, slug) -> bool:
    return conn.execute("SELECT 1 FROM itens_letterboxd WHERE pessoa = ? AND caminho = 'tmdb'", (slug,)).fetchone() is not None


def relatorio(conn, slug) -> dict:
    """Quantos filmes da Pessoa foram resolvidos por cada caminho, descartados e estão na fila."""
    contagem = Counter((l["situacao"], l["caminho"]) for l in conn.execute(
        "SELECT situacao, caminho FROM itens_letterboxd WHERE pessoa = ? ORDER BY situacao, caminho, id", (slug,)))
    fila = [dict(l) for l in conn.execute(
        "SELECT id, nome, ano, razao FROM itens_letterboxd WHERE pessoa = ? AND situacao = 'fila' ORDER BY id", (slug,))]
    descartados = [dict(l) for l in conn.execute(
        "SELECT id, nome, ano, caminho, razao FROM itens_letterboxd WHERE pessoa = ? AND situacao = 'descartado' ORDER BY id",
        (slug,))]
    return {
        "pessoa": slug,
        "filmes": sum(contagem.values()),
        "resolvidos": {c: contagem[("resolvido", c)] for c in CAMINHOS},
        "descartados": {c: contagem[("descartado", c)] for c in CAMINHOS},
        "fila": len(fila),
        "na_fila": fila,
        "descartados_itens": descartados,
    }
