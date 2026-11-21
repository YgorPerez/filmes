"""Perfis de treino e Notas retidas pelo corte no diário de cada Pessoa."""

from collections import defaultdict
from dataclasses import dataclass
from math import ceil

from filmes.dados import pessoas as dados
from filmes.evidencia.regua import NOTA_ALTA
from filmes.erros import ErroFilmes
from filmes.importar.letterboxd import linhas_da_pessoa


@dataclass(frozen=True)
class Perfil:
    pessoa: str
    corte: str
    retidos: frozenset[str]
    alvos: frozenset[str]
    treino: tuple = ()


def separar(pessoa, diario, notas):
    """Retém os 20% mais recentes dos filmes do diário, arredondados para cima."""
    if len(diario) < 2:
        return None
    ordenados = sorted(diario, key=lambda filme: (diario[filme], filme))
    retidos = frozenset(ordenados[-ceil(len(diario) / 5):])
    corte = min(diario[filme] for filme in retidos)
    alvos = frozenset(filme for filme in retidos if notas.get(filme, 0) >= NOTA_ALTA)
    return Perfil(pessoa, corte, retidos, alvos)


def perfis(conn, amb):
    diarios = _diarios(conn, amb)
    historico_de_notas = defaultdict(dict)
    notas = defaultdict(dict)
    for pessoa, filme, nota, data in conn.execute("""
        SELECT n.pessoa, n.filme_id, n.nota, n.data FROM notas n
        JOIN pessoas p ON p.slug = n.pessoa
        WHERE n.tipo = 'nota' AND n.sessao IS NULL
          AND (n.fonte LIKE 'Letterboxd %' OR n.fonte LIKE 'Trakt %')
          AND n.data <= ?
        ORDER BY n.data DESC, n.fato_id
    """, (amb.hoje.isoformat(),)):
        historico_de_notas[pessoa][filme] = data
        notas[pessoa].setdefault(filme, nota)

    resultado = []
    for pessoa in sorted(notas):
        diario = diarios[pessoa] or historico_de_notas[pessoa]
        perfil = separar(pessoa, diario, notas[pessoa])
        if perfil:
            resultado.append(perfil)
    return resultado


def _diarios(conn, amb):
    try:
        repo = amb.dados
    except ErroFilmes as erro:
        if erro.codigo != "config_ausente":
            raise
        repo = None

    hoje = amb.hoje.isoformat()
    diarios = defaultdict(dict)
    resolvidos = {
        (pessoa, item): filme
        for pessoa, item, filme in conn.execute(
            "SELECT pessoa, id, filme_id FROM itens_letterboxd WHERE situacao = 'resolvido'"
        )
    }
    if resolvidos and repo is not None:
        for pessoa in dados.ler_todas(repo):
            for linha in linhas_da_pessoa(repo, pessoa):
                filme = resolvidos.get((pessoa.slug, linha.id))
                if filme and linha.arquivo in ("diary", "reviews") and linha.quando <= hoje:
                    _primeira_data(diarios[pessoa.slug], filme, linha.quando)

    for pessoa, filme, data in conn.execute("""
        SELECT pessoa, filme_id, data FROM ja_visto
        WHERE sessao IS NULL AND fonte LIKE 'Trakt %' AND data <= ?
    """, (hoje,)):
        _primeira_data(diarios[pessoa], filme, data)
    return diarios


def _primeira_data(diario, filme, data):
    diario[filme] = min(diario.get(filme, data), data)
