"""Executa a Recomendação com os Fatos disponíveis antes do corte."""

from dataclasses import dataclass, replace
from datetime import date

from filmes.recomendacao import recomendar


def preparar(conn, perfis, amostra):
    """As vistas TEMP isolam a avaliação mesmo com o banco principal só de leitura."""
    conn.execute("CREATE TEMP TABLE cortes (pessoa TEXT PRIMARY KEY, data TEXT)")
    conn.execute("CREATE TEMP TABLE retidos (pessoa TEXT, filme_id TEXT, PRIMARY KEY (pessoa, filme_id))")
    conn.executemany("INSERT INTO cortes VALUES (?, ?)", ((p.pessoa, p.corte) for p in perfis))
    conn.executemany(
        "INSERT INTO retidos VALUES (?, ?)", ((p.pessoa, f) for p in perfis for f in p.retidos)
    )
    conn.execute("CREATE TEMP TABLE treino_movielens AS SELECT * FROM main.notas WHERE 0")
    conn.execute("CREATE INDEX temp.treino_por_pessoa ON treino_movielens(pessoa, filme_id)")
    conn.executemany("""
        INSERT INTO treino_movielens (fato_id, pessoa, filme_id, nota, data, fonte, tipo)
        VALUES (?, ?, ?, ?, ?, ?, 'nota')
    """, (nota for perfil in amostra for nota in perfil.treino))
    for tabela, alvo in (
        ("notas", "filme_id"),
        ("ja_visto", "filme_id"),
        ("declarados", "alvo"),
        ("relatos", "alvo"),
        ("vetos", "alvo"),
    ):
        movielens = "UNION ALL SELECT * FROM treino_movielens" if tabela == "notas" else ""
        conn.execute(f"""
            CREATE TEMP VIEW {tabela} AS
            SELECT f.* FROM main.{tabela} f
            JOIN cortes c ON c.pessoa = f.pessoa
            WHERE f.data < c.data AND NOT EXISTS (
                SELECT 1 FROM retidos r WHERE r.pessoa = f.pessoa AND r.filme_id = f.{alvo}
            )
            {movielens}
        """)
    (sql,) = conn.execute("SELECT sql FROM main.sqlite_schema WHERE name = 'notas_vigentes'").fetchone()
    conn.execute(sql.replace("CREATE VIEW", "CREATE TEMP TABLE", 1))
    conn.execute("CREATE INDEX temp.vigentes_por_pessoa ON notas_vigentes(pessoa, filme_id)")


@dataclass
class Medidas:
    perfis: int = 0
    recuperados: int = 0
    retidos_4_mais: int = 0
    com_evidencia: int = 0
    filmes_top_5: int = 0

    def acrescentar(self, filmes, alvos):
        topo = filmes[:5]
        self.perfis += 1
        self.recuperados += sum(filme["id"] in alvos for filme in filmes)
        self.retidos_4_mais += len(alvos)
        self.com_evidencia += sum(_sustentado(filme) for filme in topo)
        self.filmes_top_5 += len(topo)

    def como_json(self):
        return {
            **vars(self),
            "recall_50": self.recuperados / self.retidos_4_mais if self.retidos_4_mais else None,
            "cobertura_top_5": self.com_evidencia / self.filmes_top_5 if self.filmes_top_5 else None,
        }


def _sustentado(filme):
    return any(
        e["tipo"] != "palpite" and e["forca"] in {"forte", "moderada"}
        for linhas in (filme["linhas_do_filme"], *filme["evidencias"].values())
        for e in linhas
    )


def medir(conn, amb, perfis, selecao, avancar):
    medidas = Medidas()
    for perfil in perfis:
        treino = replace(amb, hoje=date.fromisoformat(perfil.corte))
        lista = recomendar(conn, treino, [perfil.pessoa], 50, selecao=selecao)["filmes"]
        medidas.acrescentar(lista, perfil.alvos)
        avancar()
    return medidas
