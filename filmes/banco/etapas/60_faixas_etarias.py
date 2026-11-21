from filmes.catalogo import classificacao

_SQL = "SELECT fato_id, filme_id, propriedade, rotulo, fonte, data FROM classificacoes ORDER BY fato_id"


def carregar(conn, amb):
    for fato, filme, propriedade, rotulo, fonte, data in conn.execute(_SQL).fetchall():
        convertida = classificacao.converter(propriedade, rotulo)
        if convertida is None:
            continue
        sistema, faixa = convertida
        conn.execute(
            """INSERT INTO faixas_etarias (fato_id, filme_id, faixa, idade, sistema, propriedade, rotulo,
                                           convertida, fonte, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fato, filme, faixa, classificacao.idade(faixa), sistema, propriedade, rotulo,
             int(propriedade != classificacao.CLASSIND), fonte, data),
        )
