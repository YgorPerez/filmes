"""Importa Notas e Já vistos de filmes usando os IDs presentes no export."""

from dataclasses import asdict

from filmes.banco import fato_id
from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.importar import arquivos, zip_trakt
from filmes.importar.letterboxd import escrita
from filmes.recomendacao.atribuicoes import TEXTOS

TIPO = "trakt"
_TABELAS = ("notas", "ja_visto")


def importar(amb, nome, arquivo):
    try:
        conteudo = arquivo.read_bytes()
    except FileNotFoundError as erro:
        raise ErroFilmes("arquivo_ausente", f"arquivo não encontrado: {arquivo}") from erro
    novas = zip_trakt.ler(arquivo, conteudo=conteudo)
    with escrita(amb) as conn:
        pessoa = pessoas.resolver(amb.dados, nome)
        antes = _contar_fatos(conn, pessoa)
        linhas = _linhas_registradas(amb, pessoa)
        relatorio = _carregar_pessoa(conn, pessoa, linhas + novas)
        depois = _contar_fatos(conn, pessoa)
        salvo, novo = arquivos.guardar(amb, pessoa, TIPO, arquivo.name, conteudo)
    return relatorio | {
        "pessoa": pessoa.slug,
        "arquivo": salvo,
        "arquivo_novo": novo,
        "fatos": depois,
        "fatos_novos": {t: depois[t] - antes[t] for t in _TABELAS},
        "atribuicoes": [{"fonte": "Trakt", "texto": TEXTOS["Trakt"]}],
    }


def carregar(conn, amb):
    for pessoa in pessoas.ler_todas(amb.dados):
        linhas = _linhas_registradas(amb, pessoa)
        if linhas:
            _carregar_pessoa(conn, pessoa, linhas)


def _linhas_registradas(amb, pessoa):
    return [linha for arquivo in arquivos.registrados(amb.dados, pessoa, TIPO)
            for linha in zip_trakt.ler(arquivo)]


def _carregar_pessoa(conn, pessoa, linhas):
    for tabela in _TABELAS:
        conn.execute(f"DELETE FROM {tabela} WHERE pessoa = ? AND fato_id LIKE 'trakt:%'", (pessoa.slug,))
    tem_metadados = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE name = 'metadados_wikidata'"
    ).fetchone() is not None
    fonte = f"Trakt de {pessoa.nome}"
    resolucoes = {}
    resolvidos = {"imdb": set(), "tmdb": set()}
    pendentes = []
    for linha in linhas:
        filme = linha.filme
        if filme not in resolucoes:
            resolucoes[filme] = _resolver(conn, filme, tem_metadados)
            if resolucoes[filme] is None:
                pendentes.append(asdict(filme))
        achado = resolucoes[filme]
        if achado:
            id_, caminho = achado
            resolvidos[caminho].add(id_)
            _fato(conn, pessoa.slug, fonte, id_, linha)

    # Um ID direto tem precedência na contagem quando mais de um export traz o filme.
    resolvidos["tmdb"] -= resolvidos["imdb"]
    return {"resolvidos": {c: len(ids) for c, ids in resolvidos.items()}, "sem_resolucao": pendentes}


def _resolver(conn, filme, tem_metadados):
    if filme.imdb and conn.execute("SELECT 1 FROM filmes WHERE id = ?", (filme.imdb,)).fetchone():
        return filme.imdb, "imdb"
    if not filme.tmdb:
        return None
    ids = {id_ for (id_,) in conn.execute(
        "SELECT f.id FROM slugs_letterboxd s JOIN filmes f ON f.id = s.imdb WHERE s.tmdb = ?",
        (filme.tmdb,),
    )}
    if tem_metadados:
        ids.update(id_ for (id_,) in conn.execute("""
            SELECT f.id FROM metadados_wikidata t
            JOIN metadados_wikidata i ON i.item = t.item AND i.propriedade = 'P345'
            JOIN filmes f ON f.id = i.valor
            WHERE t.propriedade = 'P4947' AND t.valor = ?
        """, (filme.tmdb,)))
    if len(ids) == 1:
        return ids.pop(), "tmdb"
    return None


def _fato(conn, pessoa, fonte, filme, linha):
    data = linha.instante[:10]
    if linha.nota is None:
        id_ = fato_id(TIPO, "ja_visto", pessoa, filme, linha.instante)
        conn.execute("""
            INSERT INTO ja_visto (fato_id, pessoa, filme_id, fonte, data, tipo)
            VALUES (?, ?, ?, ?, ?, 'declarado') ON CONFLICT(fato_id) DO NOTHING
        """, (id_, pessoa, filme, fonte, data))
    else:
        id_ = fato_id(TIPO, "notas", pessoa, filme, linha.instante, linha.nota)
        conn.execute("""
            INSERT INTO notas (fato_id, pessoa, filme_id, fonte, data, nota)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fato_id) DO NOTHING
        """, (id_, pessoa, filme, fonte, data, linha.nota))


def _contar_fatos(conn, pessoa):
    return {t: conn.execute(
        f"SELECT count(*) FROM {t} WHERE pessoa = ? AND fato_id LIKE 'trakt:%'", (pessoa.slug,),
    ).fetchone()[0] for t in _TABELAS}
