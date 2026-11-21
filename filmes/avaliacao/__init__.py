"""Mede a Recomendação offline e lê o Feedback das últimas Sessões."""

from contextlib import closing
from dataclasses import replace
from time import monotonic

from filmes.avaliacao import grade, movielens, offline, pessoas, relatorio
from filmes.banco import abrir_leitura
from filmes.recomendacao.candidatos import Selecao
from filmes.sessao.arquivo import ordem


def avaliar(amb, *, com_grade=False, progresso=lambda *_: None):
    progresso(0, "Lendo o Feedback e os diários")
    with closing(abrir_leitura(amb.banco)) as conn:
        conn.execute("BEGIN")
        online = _online(conn)
        pessoas_medidas = pessoas.pessoas_medidas(conn, amb)
        pasta_ml = amb.catalogo / "ml-32m"
        progresso(10, "Sorteando a amostra do MovieLens")
        amostra = movielens.ler(pasta_ml, amb.versoes, progresso)
        pessoas_ml = amostra.pessoas_medidas if amostra else []
        offline.preparar(conn, pessoas_medidas, pessoas_ml)
        if amostra:
            progresso(20, "Calculando vizinhos sem os usuários sorteados")
            movielens.preparar(conn, pasta_ml, amostra, progresso)
        medidas, calibracao = _medir(conn, amb, pessoas_medidas, pessoas_ml, com_grade, progresso)

    avisos = []
    if amostra is None:
        avisos.append("A amostra offline do MovieLens exige ml-32m/ratings.csv e ml-32m/links.csv no Catálogo.")
    elif len(amostra.usuarios) < movielens.TAMANHO:
        avisos.append(f"O MovieLens tinha só {len(amostra.usuarios)} usuários para sortear.")

    progresso(96, "Gravando o relatório")
    resultado = {
        "data": amb.hoje.isoformat(),
        "offline": medidas,
        "online": online,
        "prioridade": "online" if online["sessoes"] >= 10 else "offline",
        "pesos": amb.pesos,
        "versoes": relatorio.versoes(amb),
        "avisos": avisos,
        "amostra_movielens": {"semente": movielens.SEMENTE, "usuarios": len(amostra.usuarios) if amostra else 0},
    }
    if calibracao is not None:
        resultado["grade"] = calibracao
    resultado["arquivo"] = str(relatorio.gravar(amb.hoje, resultado))
    progresso(100, "Relatório gravado")
    return resultado


def _medir(conn, amb, pessoas_medidas, pessoas_ml, com_grade, progresso):
    quantidade = len(pessoas_medidas) + len(pessoas_ml)
    selecao = Selecao.preparar(conn, amb.pesos)
    espaco = grade.valores(amb.pesos) if com_grade else {}
    configs = list(grade.combinacoes(amb.pesos, espaco)) if espaco and quantidade else []
    total = quantidade * (1 + sum(config != amb.pesos for config in configs))
    feitos = 0
    porcentagem = 35
    ultima_notificacao = monotonic()
    mensagem = "Medindo recall e cobertura"
    progresso(porcentagem, mensagem)

    def avancar():
        nonlocal feitos, porcentagem, ultima_notificacao
        feitos += 1
        atual = 35 + 60 * feitos / total
        agora = monotonic()
        if int(atual) > int(porcentagem) or agora - ultima_notificacao >= 5:
            porcentagem = atual
            ultima_notificacao = agora
            progresso(atual, mensagem)

    def medir(config):
        ambiente = replace(amb, pesos=config)
        return {
            nome: offline.medir(conn, ambiente, amostra, selecao, avancar).como_json()
            for nome, amostra in (("pessoas", pessoas_medidas), ("movielens", pessoas_ml))
        }

    atual = medir(amb.pesos)
    if not com_grade:
        return atual, None
    mensagem = "Comparando os pesos da grade"
    resultados = [(config, atual if config == amb.pesos else medir(config)) for config in configs]
    return atual, {"valores": espaco, "combinacoes": len(configs), "melhores": grade.melhores(amb.pesos, resultados)}


def _online(conn):
    sessoes = sorted(conn.execute("""
        SELECT id, data, escolhido, escolhido_na_recomendacao FROM sessoes WHERE feedback_em IS NOT NULL
    """), key=ordem, reverse=True)[:10]
    # "Não vimos nada" fica na janela das 10, mas fora do denominador da taxa.
    com_filme = sum(sessao["escolhido"] is not None for sessao in sessoes)
    escolhidos = sum(1 <= (sessao["escolhido_na_recomendacao"] or 0) <= 5 for sessao in sessoes)
    ids = [sessao["id"] for sessao in sessoes]
    marcas = ",".join("?" for _ in ids)
    media, reacoes = conn.execute(
        f"SELECT avg(valor), count(*) FROM reacoes WHERE sessao IN ({marcas})", ids
    ).fetchone()
    return {
        "sessoes": len(sessoes),
        "com_filme": com_filme,
        "escolhidos_top_5": escolhidos,
        "taxa_top_5": escolhidos / com_filme if com_filme else None,
        "reacoes": reacoes,
        "reacao_media": media,
    }
