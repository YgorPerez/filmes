"""Liga as triplas do Wikidata ao tconst e carrega os Fatos do Catálogo."""

from filmes.banco import fato_id
from filmes.catalogo import classificacao, wikidata

FONTE = "Wikidata"


def carregar(conn, pasta, dumps):
    _carregar_ids(conn, pasta, dumps)
    _carregar_rotulos(conn, pasta, dumps)
    _carregar_series(conn, pasta, dumps)
    filmes_por_item = {}
    for item, filme in conn.execute("""
        SELECT m.item, f.id FROM metadados_wikidata m JOIN filmes f ON f.id = m.valor
        WHERE m.propriedade = 'P345'
        ORDER BY m.item, f.id
    """):
        filmes_por_item.setdefault(item, []).append(filme)
    entidades = {}
    for nome, versao in sorted(dumps.items()):
        if nome.startswith(("wikidata-conteudo", "wikidata-elenco")):
            arquivo = pasta / versao["sha256"] / nome
            for linha in wikidata.linhas(arquivo):
                item = _id(linha, "item")
                if item in filmes_por_item:
                    _carregar_conteudo(conn, linha, filmes_por_item[item], entidades, versao["data"])


def _carregar_ids(conn, pasta, dumps):
    for nome, versao in sorted(dumps.items()):
        if nome.startswith("wikidata-ids"):
            arquivo = pasta / versao["sha256"] / nome
            conn.executemany("""
                INSERT INTO metadados_wikidata (item, propriedade, valor, fonte, data)
                VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, (
                (_id(linha, "item"), _id(linha, "p"), linha["valor"]["value"], FONTE, versao["data"])
                for linha in wikidata.linhas(arquivo)
            ))
    conn.execute("""
        INSERT INTO slugs_letterboxd (slug, item, imdb, tmdb, tmdb_serie, ano)
        SELECT s.valor, s.item, MIN(CASE WHEN m.propriedade = 'P345' THEN m.valor END),
               MIN(CASE WHEN m.propriedade = 'P4947' THEN m.valor END),
               MIN(CASE WHEN m.propriedade = 'P4983' THEN m.valor END),
               MIN(CASE WHEN m.propriedade = 'P577' AND m.valor GLOB '[0-9][0-9][0-9][0-9]-*'
                        THEN CAST(substr(m.valor, 1, 4) AS INTEGER) END)
        FROM metadados_wikidata s JOIN metadados_wikidata m USING (item)
        WHERE s.propriedade = 'P6127'
        GROUP BY s.item, s.valor
    """)


def _carregar_series(conn, pasta, dumps):
    for nome, versao in sorted(dumps.items()):
        if nome.startswith("wikidata-series"):
            conn.executemany(
                "INSERT INTO series_de_filmes (item, classe) VALUES (?, ?) ON CONFLICT DO NOTHING",
                ((wikidata.qid(linha["item"]), wikidata.qid(linha["valor"]))
                 for linha in wikidata.linhas(pasta / versao["sha256"] / nome)),
            )


def _carregar_rotulos(conn, pasta, dumps):
    for nome, versao in sorted(dumps.items()):
        if not nome.startswith("wikidata-rotulos"):
            continue
        arquivo = pasta / versao["sha256"] / nome
        conn.executemany("""
            INSERT INTO rotulos_wikidata (item, pt, en, mul, codigo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (item) DO UPDATE SET pt = COALESCE(excluded.pt, pt),
                en = COALESCE(excluded.en, en), mul = COALESCE(excluded.mul, mul),
                codigo = COALESCE(excluded.codigo, codigo)
        """, (
            (_id(linha, "valor"), *(linha.get(campo, {}).get("value") for campo in ("pt", "en", "mul", "codigo")))
            for linha in wikidata.linhas(arquivo)
        ))


def _carregar_conteudo(conn, linha, filmes, entidades, data):
    propriedade = _id(linha, "p")
    valor = linha["valor"]["value"]
    alvo = wikidata.qid(linha["valor"])
    rotulos, codigo_idioma = (), None
    if alvo:
        if alvo not in entidades:
            linha_rotulos = conn.execute("SELECT pt, en, mul, codigo FROM rotulos_wikidata WHERE item = ?", (alvo,))
            pt, en, mul, codigo = linha_rotulos.fetchone() or (None, None, None, None)
            rotulos = (pt, en, mul)
            rotulo = pt or en or mul or alvo
            conn.execute("INSERT INTO entidades (id, rotulo) VALUES (?, ?)", (alvo, rotulo))
            entidades[alvo] = (rotulo, rotulos, codigo)
        rotulo, rotulos, codigo_idioma = entidades[alvo]
    else:
        rotulo = valor

    for filme in filmes:
        if alvo and propriedade in wikidata.ARESTAS:
            aresta = (filme, wikidata.ARESTAS[propriedade], alvo, FONTE, data)
            conn.execute("""
                INSERT INTO arestas (fato_id, filme_id, predicado, entidade_id, fonte, data)
                VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, (fato_id("arestas", *aresta), *aresta))
        if alvo and propriedade == "P364":
            idioma = (filme, alvo, codigo_idioma, rotulo, FONTE, data)
            conn.execute("""
                INSERT INTO idiomas_originais (fato_id, filme_id, idioma_id, codigo, rotulo, fonte, data)
                VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, (fato_id("idiomas_originais", *idioma), *idioma))
        if propriedade in wikidata.CLASSIFICACOES:
            # O código que a tabela reconhece pode estar só no rótulo inglês ou mul.
            codigo = next((r for r in rotulos if r and classificacao.converter(propriedade, r)), rotulo)
            faixa = (filme, propriedade, codigo, FONTE, data, alvo)
            conn.execute("""
                INSERT INTO classificacoes (fato_id, filme_id, propriedade, rotulo, fonte, data, valor_wikidata)
                VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, (fato_id("classificacoes", *faixa), *faixa))


def _id(linha, chave):
    return linha[chave]["value"].rsplit("/", 1)[-1]
