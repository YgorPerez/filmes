from filmes.dados import pessoas


def carregar(conn, amb):
    for p in pessoas.ler_todas(amb.dados):
        conn.execute("INSERT INTO pessoas (slug, nome, dono) VALUES (?, ?, ?)", (p.slug, p.nome, int(p.dono)))
        for apelido in sorted(set(p.apelidos)):
            conn.execute("INSERT INTO apelidos (pessoa, apelido) VALUES (?, ?)", (p.slug, apelido))
