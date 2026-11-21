"""Import do Letterboxd: do ZIP de uma Pessoa aos Fatos no banco.

Cadeia de resolução de cada filme `(Name, Year)`, sem nunca tocar no site do
Letterboxd (os termos dele proíbem acesso automatizado):

1. Decisão do Dono na fila (`confirmado` ou `descartado` em imports/letterboxd.md).
2. Wikidata: `slug(Name)` e `slug(Name)-Year` na P6127, aceitando o item cuja P577
   mais antiga cai em Year ± 1; no empate, vence o slug com o ano. Item só com ID
   de série no TMDB é minissérie e sai.
3. TMDB, como registrado em imports/letterboxd.md pela última consulta.
4. O resto fica na fila.

`importar` consulta o TMDB para o que chega ao passo 4 e registra o resultado da resolução.
`carregar` (usado por `reconstruir` e depois de todo comando que muda algo) só lê
o que já está registrado, sem rede.

Fatos, todos com fato_id `letterboxd:...` e Fonte "Letterboxd de <nome>":
Nota (ratings, e a nota do diário e da review no dia em que viu), Já visto
(watched e diário), Declarado específico (o texto de cada review e cada tag,
datado do dia em que viu) e watchlist.
"""

import hashlib
import os
import sqlite3
import unicodedata
from collections import Counter
from contextlib import closing, contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import NamedTemporaryFile

from filmes.ambiente import Ambiente
from filmes.banco import fato_id
from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.importar import decisoes as registro
from filmes.importar import zip_letterboxd
from filmes.importar.zip_letterboxd import Linha
from filmes.sob_demanda import tmdb

TIPO = "letterboxd"
CAMINHOS = ("wikidata", "tmdb", "manual")
TABELAS_DE_FATO = ("notas", "ja_visto", "declarados", "watchlist")


@dataclass(frozen=True)
class Resolucao:
    situacao: str                    # resolvido, descartado, fila
    caminho: str | None = None       # wikidata, tmdb, manual
    filme_id: str | None = None
    motivo: str | None = None
    tmdb_id: str | None = None


@dataclass
class Contexto:
    """O que uma fonte sob demanda precisa (veja `filmes.sob_demanda.fonte`)."""
    amb: Ambiente
    avisos: list[str] = field(default_factory=list)
    fontes: dict = field(default_factory=dict)


# --- a cadeia ---------------------------------------------------------------

def resolver(conn, nome: str, ano: int | None, decisao: dict | None) -> Resolucao:
    """Resolve sem rede: Dono, Wikidata, o que o TMDB já respondeu, fila."""
    if decisao and decisao["situacao"] == "confirmado":
        return Resolucao("resolvido", "manual", filme_id=decisao["filme"])
    if decisao and decisao["situacao"] == "descartado":
        return Resolucao("descartado", "manual", motivo=decisao.get("motivo") or "descartado pelo Dono")
    if ano is None:
        return Resolucao("fila", motivo="o export não traz o ano do filme")
    achado = _pelo_wikidata(conn, nome, ano)
    if achado and achado.situacao != "fila":
        return achado
    tmdb_id = achado.tmdb_id if achado else None
    if decisao and decisao["situacao"] == "tmdb":
        return Resolucao("resolvido", "tmdb", filme_id=decisao["filme"])
    if decisao and decisao["situacao"] == "minisserie":
        return Resolucao("descartado", "tmdb", motivo="minissérie (só há série com esse título no TMDB)")
    if decisao and decisao["situacao"] == "pendente":
        return Resolucao("fila", motivo=decisao.get("motivo"), tmdb_id=tmdb_id)
    return Resolucao("fila", motivo="o Wikidata não deu um ID do IMDb, e o TMDB ainda não foi consultado",
                     tmdb_id=tmdb_id)


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
        return Resolucao("descartado", "wikidata", motivo=f"minissérie ({item['item']} só tem ID de série no TMDB)")
    if item["imdb"]:
        return Resolucao("resolvido", "wikidata", filme_id=item["imdb"])
    return Resolucao("fila", tmdb_id=item["tmdb"])


def consultar_tmdb(fonte: tmdb.TMDB, nome: str, ano: int, tmdb_id: str | None) -> dict | None:
    """A decisão que a busca do TMDB dá ao filme, ou None se o TMDB não respondeu.

    Aceita um filme só com título igual (sem diferença de caixa, acento e pontuação),
    primeiro no ano, depois em ano ± 1. Mais de um vai para a fila com os candidatos.
    Nenhum filme e uma série com o título no ano é minissérie."""
    base = {"id": zip_letterboxd.id_do_filme(nome, ano), "nome": nome, "ano": ano,
            "data": fonte.contexto.amb.hoje.isoformat()}
    if tmdb_id:
        imdb = fonte.imdb(tmdb_id)
        if imdb:
            return base | {"situacao": "tmdb", "filme": imdb}
        if fonte.desligada:
            return None
    iguais = filmes_com_mesmo_titulo(fonte.filmes, nome, ano)
    if iguais is None:
        return None
    if len(iguais) == 1:
        [filme] = iguais
        imdb = fonte.imdb(filme["id"])
        if fonte.desligada:
            return None
        if imdb:
            return base | {"situacao": "tmdb", "filme": imdb}
        return base | {"situacao": "pendente", "motivo": "o TMDB achou o filme, mas sem ID do IMDb"}
    if iguais:
        return base | {"situacao": "pendente", "motivo": "o TMDB achou mais de um filme com esse título"}
    series = fonte.series(nome, ano)
    if series is None:
        return None
    if any(_mesmo_titulo(nome, s, "name", "original_name") for s in series):
        return base | {"situacao": "minisserie"}
    return base | {"situacao": "pendente", "motivo": "nem o Wikidata nem o TMDB acharam o filme"}


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
    linhas = []
    for importado in pessoa.imports:
        if isinstance(importado, dict) and importado.get("tipo") == TIPO:
            arquivo = repo / importado["arquivo"]
            if not arquivo.exists():
                raise ErroFilmes("dados_invalidos",
                                 f"pessoas/{pessoa.slug}.md registra o import {importado['arquivo']}, que não está no repo de dados")
            linhas += zip_letterboxd.ler(arquivo)
    return linhas


def _carregar_pessoa(conn, pessoa, linhas, decididos):
    fonte = f"Letterboxd de {pessoa.nome}"
    por_filme: dict[str, list[Linha]] = {}
    for linha in linhas:
        por_filme.setdefault(linha.id, []).append(linha)
    for id_, do_filme in por_filme.items():
        primeira = do_filme[0]
        r = resolver(conn, primeira.nome, primeira.ano, decididos.get(id_))
        conn.execute(
            """INSERT INTO itens_letterboxd (pessoa, id, nome, ano, situacao, caminho, filme_id, motivo)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (pessoa.slug, id_, primeira.nome, primeira.ano, r.situacao, r.caminho, r.filme_id, r.motivo),
        )
        if r.situacao == "resolvido":
            for linha in do_filme:
                _fatos(conn, pessoa.slug, fonte, r.filme_id, linha)


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
    if linha.arquivo in ("diary", "reviews") and linha.nota is not None:
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
    contexto = Contexto(amb)
    with escrita(amb) as conn:
        pessoa = pessoas.resolver(amb.dados, nome)
        antes = _contar_fatos(conn, pessoa.slug)
        decididos = registro.ler(amb.dados)
        fonte = tmdb.TMDB.de(contexto)
        usou_tmdb = mudou = False
        por_filme = {linha.id: linha for linha in linhas_novas}
        for linha in linhas_da_pessoa(amb.dados, pessoa):
            por_filme.setdefault(linha.id, linha)
        for id_, linha in por_filme.items():
            decisao = decididos.get(id_)
            r = resolver(conn, linha.nome, linha.ano, decisao)
            if r.situacao != "fila" or linha.ano is None or fonte.desligada:
                continue
            nova = consultar_tmdb(fonte, linha.nome, linha.ano, r.tmdb_id)
            if nova is not None:
                usou_tmdb = True
                if not decisao or any(decisao.get(c) != v for c, v in nova.items() if c != "data"):
                    decididos[id_] = nova
                    mudou = True
        arquivo, novo = _guardar(amb, pessoa, zip_.name, conteudo)
        carregar(conn, amb, decididos=decididos)
        if mudou:
            registro.salvar(amb.dados, decididos)
        depois = _contar_fatos(conn, pessoa.slug)
        return relatorio(conn, pessoa.slug) | {
            "arquivo": arquivo,
            "arquivo_novo": novo,
            "fatos": depois,
            "fatos_novos": {t: depois[t] - antes[t] for t in TABELAS_DE_FATO},
            "avisos": contexto.avisos,
            "creditos": [tmdb.CREDITO] if usou_tmdb or _usa_tmdb(conn, pessoa.slug) else [],
        }


def _guardar(amb, pessoa, nome_original, conteudo) -> tuple[str, bool]:
    sha = hashlib.sha256(conteudo).hexdigest()
    for importado in pessoa.imports:
        if isinstance(importado, dict) and importado.get("tipo") == TIPO and importado.get("sha256") == sha:
            return importado["arquivo"], False
    relativo = Path("imports") / pessoa.slug / f"letterboxd-{sha}.zip"
    destino = amb.dados / relativo
    destino.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=destino.parent, delete=False) as arquivo:
        temporario = Path(arquivo.name)
        try:
            arquivo.write(conteudo)
            arquivo.close()
            os.replace(temporario, destino)
        finally:
            temporario.unlink(missing_ok=True)
    pessoa.imports.append({"tipo": TIPO, "arquivo": relativo.as_posix(), "data": amb.hoje.isoformat(),
                           "original": nome_original, "sha256": sha})
    pessoas.salvar(amb.dados, pessoa)
    return relativo.as_posix(), True


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
        "SELECT situacao, caminho FROM itens_letterboxd WHERE pessoa = ?", (slug,)))
    fila = [dict(l) for l in conn.execute(
        "SELECT id, nome, ano, motivo FROM itens_letterboxd WHERE pessoa = ? AND situacao = 'fila' ORDER BY id", (slug,))]
    descartados = [dict(l) for l in conn.execute(
        "SELECT id, nome, ano, caminho, motivo FROM itens_letterboxd WHERE pessoa = ? AND situacao = 'descartado' ORDER BY id",
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
