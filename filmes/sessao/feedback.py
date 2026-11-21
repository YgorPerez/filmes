"""Feedback: grava no arquivo da Sessão o Filme escolhido e as reações, e fecha a Sessão.

Reações, como o Dono as diz:
- `--nota dono=4`: a Nota do Dono. `--nota iara=4,5`: um número que a Iara deu,
  repassado pelo Dono. As duas são Nota. `--nota iara=9/10` é a escala de 10:
  grava a Nota 4,5 e guarda o 9/10.
- `--relato iara=gostou` (gostou, neutro, não gostou): a impressão do Dono. É Relato.
- `--comentario iara=texto`: o que ela achou, junto da nota ou do Relato dela. Vira
  Declarado específico sobre o Filme escolhido (veja `fatos.py`).
- Presente sem reação: não gera Fato nem conta no Crédito, mas ganha o Já visto.

Se a Sessão tem `mostrados` (`cartaz --filmes`), o Feedback grava também a posição do
Filme escolhido nessa lista, em `escolhido_nos_mostrados`, e devolve `posicao_mostrada`.
"""

import re
import sqlite3

from filmes.ambiente import Ambiente
from filmes.dados import nota as nota_dita
from filmes.erros import ErroFilmes
from filmes.evidencia import regua, texto
from filmes.recomendacao import presentes as pessoas_presentes
from filmes.sessao import arquivo, banco, escrita, fatos


def registrar(amb: Ambiente, sessao_id: str, filme: str | None, notas: list[str], relatos: list[str],
              comentarios: list[str] = ()) -> dict:
    """`filme` None é "não vimos nada": fecha a Sessão sem Filme escolhido e sem reação."""
    with escrita(amb) as conn:
        frente, corpo = arquivo.ler(amb.dados, sessao_id)
        if not arquivo.aberta(frente):
            raise ErroFilmes("sessao_fechada", f"a Sessão {sessao_id} já tem Feedback")
        dono = {slug for (slug,) in conn.execute("SELECT slug FROM pessoas WHERE dono = 1")}
        reacoes = _reacoes(conn, frente["presentes"], dono, notas, relatos)
        _comentarios(conn, frente["presentes"], reacoes, comentarios)
        recomendacao = frente.get("recomendacao") or []
        mostrados = frente.get("mostrados")
        if filme is None:
            if reacoes:
                raise ErroFilmes("uso_invalido", '"não vimos nada" não leva reação')
            escolhido, posicao, mostrada = None, None, None
        else:
            escolhido = _filme(conn, filme, recomendacao)
            posicao = _posicao(recomendacao, escolhido)
            mostrada = _posicao(mostrados or [], escolhido)
        frente["escolhido"] = escolhido["id"] if escolhido else None
        frente["escolhido_na_recomendacao"] = posicao
        if mostrados is not None:
            frente["escolhido_nos_mostrados"] = mostrada
        frente["feedback"] = {"registrado_em": amb.hoje, "reacoes": reacoes}
        banco.carregar(conn, sessao_id, frente)
        arquivo.escrever(amb.dados, sessao_id, frente, corpo)

    com_reacao = {r["pessoa"] for r in reacoes}
    if escolhido:
        escolhido = {**escolhido, "posicao": posicao}
        if mostrados is not None:
            escolhido["posicao_mostrada"] = mostrada
    return {
        "sessao": {"id": sessao_id, "arquivo": arquivo.relativo(sessao_id)},
        "escolhido": escolhido,
        "fatos": _fatos(sessao_id, frente, dono, escolhido, amb) if escolhido else [],
        "sem_reacao": [p for p in frente["presentes"] if p not in com_reacao] if escolhido else [],
    }


def tirar_comentario(amb: Ambiente, sessao_id: str, pessoa: str) -> None:
    """Tira o Comentário da Pessoa da reação dela, no arquivo da Sessão e no banco. A reação fica."""
    with escrita(amb) as conn:
        frente, corpo = arquivo.ler(amb.dados, sessao_id)
        for reacao in (frente.get("feedback") or {}).get("reacoes") or []:
            if reacao["pessoa"] == pessoa:
                reacao.pop("comentario", None)
        banco.carregar(conn, sessao_id, frente)
        arquivo.escrever(amb.dados, sessao_id, frente, corpo)


def _posicao(lista, escolhido):
    return next((r["posicao"] for r in lista if r["id"] == escolhido["id"]), None)


def _reacoes(conn, presentes, dono, notas, relatos):
    por_pessoa = {}
    for item in notas:
        pessoa, valor = _par(conn, presentes, "--nota", item)
        reacao = {"pessoa": pessoa, "tipo": "nota", **_nota(item, valor)}
        if pessoa not in dono:
            reacao["repassada"] = True
        _uma_por_pessoa(por_pessoa, reacao)
    for item in relatos:
        pessoa, valor = _par(conn, presentes, "--relato", item)
        if pessoa in dono:
            raise ErroFilmes("uso_invalido", f"--relato {item}: o Dono fala por si com --nota")
        nivel = _nivel(valor)
        if nivel is None:
            raise ErroFilmes("uso_invalido", f"--relato {item}: o Relato é gostou, neutro ou não gostou")
        _uma_por_pessoa(por_pessoa, {"pessoa": pessoa, "tipo": "relato", "reacao": nivel})
    return [por_pessoa[p] for p in presentes if p in por_pessoa]


def _nota(item, valor):
    """A Nota de 0,5 a 5; na escala de 10, o número dito fica em `nota_original`, para a Sessão mostrar."""
    try:
        nota, original = nota_dita.ler(valor)
    except ErroFilmes as erro:
        raise ErroFilmes(erro.codigo, f"--nota {item}: {erro.mensagem}")
    return {"nota": nota} if original is None else {"nota": nota, "nota_original": original}


def _comentarios(conn, presentes, reacoes, comentarios):
    """Põe cada comentário na reação da mesma Pessoa. Sem reação dela, é erro."""
    por_pessoa = {r["pessoa"]: r for r in reacoes}
    for item in comentarios:
        pessoa, valor = _par(conn, presentes, "--comentario", item)
        reacao = por_pessoa.get(pessoa)
        if reacao is None:
            raise ErroFilmes("uso_invalido", f"--comentario {item}: o comentário acompanha a nota ou o Relato de {pessoa}")
        if "comentario" in reacao:
            raise ErroFilmes("uso_invalido", f"mais de um comentário para {pessoa}")
        reacao["comentario"] = " ".join(valor.split())


def _par(conn, presentes, opcao, item):
    nome, sep, valor = item.partition("=")
    if not sep or not nome.strip() or not valor.strip():
        raise ErroFilmes("uso_invalido", f"{opcao} {item}: use PESSOA=VALOR")
    [pessoa] = pessoas_presentes.resolver(conn, [nome])
    if pessoa not in presentes:
        raise ErroFilmes("uso_invalido", f"{opcao} {item}: {pessoa} não estava entre os Presentes da Sessão")
    return pessoa, valor.strip()


def _uma_por_pessoa(por_pessoa, reacao):
    if reacao["pessoa"] in por_pessoa:
        raise ErroFilmes("uso_invalido", f"mais de uma reação para {reacao['pessoa']}")
    por_pessoa[reacao["pessoa"]] = reacao


def _nivel(valor):
    chave = re.sub(r"[-_\s]+", " ", valor.strip().casefold()).replace("nao ", "não ")
    return chave if chave in fatos.NIVEIS else None


def _filme(conn: sqlite3.Connection, pedido: str, recomendacao: list[dict]) -> dict:
    """Pelo ID do IMDb ou pelo título (com ou sem o ano entre parênteses).
    O título procura primeiro na Recomendação, depois no Catálogo inteiro."""
    pedido = pedido.strip()
    recomendados = {r["id"]: r for r in recomendacao}
    if re.fullmatch(r"tt\d+", pedido):
        linha = conn.execute("SELECT id, titulo, ano FROM filmes WHERE id = ?", (pedido,)).fetchone()
        return dict(linha) if linha else {"id": pedido, "titulo": recomendados.get(pedido, {}).get("titulo"), "ano": None}
    casado = re.fullmatch(r"(.+?)\s*\((\d{4})\)", pedido)
    titulo, ano = (casado[1], int(casado[2])) if casado else (pedido, None)
    conn.create_function("dobrar", 1, lambda t: t.casefold() if t else t, deterministic=True)
    candidatos = [dict(l) for l in conn.execute(
        "SELECT id, titulo, ano FROM filmes WHERE dobrar(titulo) = ? AND (? IS NULL OR ano = ?) ORDER BY votos DESC, id",
        (titulo.casefold(), ano, ano))]
    na_recomendacao = {c["id"]: c for c in candidatos if c["id"] in recomendados}
    for item in recomendacao:
        filme_id = item["id"]
        if filme_id not in na_recomendacao and item["titulo"].casefold() == titulo.casefold():
            linha = conn.execute("SELECT ano FROM filmes WHERE id = ?", (filme_id,)).fetchone()
            ano_do_filme = linha["ano"] if linha else None
            if ano is None or ano == ano_do_filme:
                na_recomendacao[filme_id] = {"id": filme_id, "titulo": item["titulo"], "ano": ano_do_filme}
    if len(na_recomendacao) == 1:
        return next(iter(na_recomendacao.values()))
    if na_recomendacao:
        candidatos = list(na_recomendacao.values())
    if len(candidatos) == 1:
        return candidatos[0]
    if not candidatos:
        raise ErroFilmes("filme_desconhecido", f"nenhum filme do Catálogo se chama '{pedido}'; passe o ID do IMDb")
    opcoes = "; ".join(f"{texto.filme(c['titulo'], c['ano'])} {c['id']}" for c in candidatos)
    raise ErroFilmes("filme_ambiguo", f"'{pedido}' pode ser mais de um filme: {opcoes}")


_RELATO = {"gostou": "gostou de {filme}", "neutro": "achou {filme} neutro", "não gostou": "não gostou de {filme}"}


def _fatos(sessao_id, frente, dono, escolhido, amb):
    """Os Fatos gravados, como linhas de Evidência sobre o Filme escolhido."""
    nome = texto.filme(escolhido["titulo"] or escolhido["id"], escolhido["ano"])
    linhas = []
    for r in fatos.reacoes(sessao_id, frente):
        frase = f"deu {r.nota_original or texto.nota(r.nota)} a {nome}" if r.tipo == "nota" else _RELATO[r.reacao].format(filme=nome)
        linhas.append({"pessoa": r.pessoa, "texto": frase, "fonte": r.fonte, "data": r.data,
                       "forca": regua.forca_feedback(r.tipo, r.nota, r.data, amb.hoje), "tipo": r.tipo,
                       "fato_id": r.fato_id})
    for c in fatos.comentarios(sessao_id, frente, dono):
        linhas.append({"pessoa": c.pessoa, "texto": f'disse "{c.texto}" de {nome}', "fonte": c.fonte, "data": c.data,
                       "forca": regua.forca_dito("declarado", True, c.data, amb.hoje), "tipo": "declarado",
                       "fato_id": c.fato_id})
    for v in fatos.ja_vistos(sessao_id, frente, dono):
        linhas.append({"pessoa": v.pessoa, "texto": "já viu", "fonte": v.fonte, "data": v.data,
                       "forca": regua.FORCA_JA_VISTO, "tipo": v.tipo, "fato_id": v.fato_id})
    return linhas
