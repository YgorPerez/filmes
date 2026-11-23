"""`cartaz responder` (#61): lê o texto que o Dono colou do cartaz e grava.

    responder(amb, sessao_id, texto) -> dict

O texto é o do botão Copiar pro chat (formato no docstring de `filmes.cartaz`).
Pode vir com conversa em volta: vale a linha `#cartaz <sessao> v<n>` e as
linhas seguintes que casam com o formato; a primeira que não casa encerra.

- Já vi: Já visto da Pessoa, com a data de hoje e a fonte "cartaz <sessão>";
  com nota (1 a 10, a escala do Feedback), Nota de metade do número. "todos"
  são os Presentes da versão que o texto mostra.
  Colar de novo não soma outro Já visto: o da mesma Fonte e filme fica, com a
  nota nova se veio outra.
- Estrelas, comentário e acrescentar: em `respostas` da versão do texto. Não
  viram Fato nem mexem no gosto. Resposta igual a uma que a versão já tem não
  é gravada de novo.
- Linha de filme que não estava na tela da versão do texto é pulada, com aviso.
- Trocar e Já vi tiram o filme da tela atual. Aplica-se pelo ID: um texto de
  versão velha vale do mesmo jeito; o Trocar de um filme que já não está na
  tela é ignorado, com aviso.

Devolve o pedido de regerar: `regerar` (algum filme caiu ou veio acrescentar),
`manter` (os IDs que ficam, na ordem da tela), `saem` (com o motivo),
`acrescentar` e `comentarios`, como vieram. Quem refaz é o Claude, com
`recomendar --sessao ID --manter ...`.
"""

import re
from dataclasses import replace

from filmes.banco import abrir_leitura
from filmes.banco import pessoas as fatos_da_pessoa
from filmes.dados import nota as nota_dita
from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.sessao import arquivo, banco, conferir_aberta, escrita

_CABECALHO = re.compile(r"^\s*#cartaz\s+(\S+)\s+v(\d+)\s*$")
_ACRESCENTAR = re.compile(r"^\s*acrescentar:\s*(.*?)\s*$")
_FILME = re.compile(r"^\s*(\d+)\s+(tt\d+)((?:\s+·\s+.*)?)\s*$")
_NOTA_DO_JA_VI = re.compile(r"^(.+?)\s*=\s*(\d+)$")


def ler(texto: str) -> dict:
    """{sessao, versao, acrescentar, filmes: [{posicao, id, ja_vi, trocar, estrelas, comentario}]}."""
    linhas = texto.splitlines()
    inicio = next((i for i, linha in enumerate(linhas) if _CABECALHO.match(linha)), None)
    if inicio is None:
        raise ErroFilmes("uso_invalido", "o texto não é de cartaz: falta a linha '#cartaz <sessão> v<n>'")
    cabecalho = _CABECALHO.match(linhas[inicio])
    lido = {"sessao": cabecalho[1], "versao": int(cabecalho[2]), "acrescentar": None, "filmes": []}
    for linha in linhas[inicio + 1:]:
        if not linha.strip():
            continue
        if (casou := _ACRESCENTAR.match(linha)) and lido["acrescentar"] is None and not lido["filmes"]:
            lido["acrescentar"] = _uma_linha(casou[1]) or None
        elif casou := _FILME.match(linha):
            lido["filmes"].append(_marcacoes(int(casou[1]), casou[2], casou[3]))
        else:
            break
    return lido


def _marcacoes(posicao: int, filme: str, resto: str) -> dict:
    marcado = {"posicao": posicao, "id": filme, "ja_vi": None, "trocar": False, "estrelas": None, "comentario": None}
    resto = re.sub(r"^\s+·\s+", "", resto)
    if resto.startswith("comentário:"):
        resto = " · " + resto
    resto, separador, comentario = resto.partition(" · comentário:")
    if separador:
        marcado["comentario"] = _uma_linha(comentario) or None
    for parte in filter(None, (p.strip() for p in resto.split(" · "))):
        nome, _, valor = parte.partition(":")
        valor = valor.strip()
        if parte == "trocar":
            marcado["trocar"] = True
        elif nome == "já vi" and valor:
            marcado["ja_vi"] = valor
        elif nome == "estrelas" and valor in {"1", "2", "3", "4", "5"}:
            marcado["estrelas"] = int(valor)
        else:
            raise ErroFilmes("uso_invalido", f"marcação desconhecida no cartaz, filme {posicao} {filme}: {parte!r}")
    return marcado


def _uma_linha(texto: str) -> str:
    return " ".join(texto.split())


def responder(amb, sessao_id: str, texto: str) -> dict:
    lido = ler(texto)
    if lido["sessao"] != sessao_id:
        raise ErroFilmes("uso_invalido", f"o texto é do cartaz da Sessão {lido['sessao']}, não da {sessao_id}")
    try:
        frente = conferir_aberta(amb, sessao_id)
    except ErroFilmes as erro:
        if erro.codigo != "sessao_desconhecida":
            raise
        raise ErroFilmes("uso_invalido", erro.mensagem)
    atual = arquivo.versao_atual(frente)
    if not 1 <= lido["versao"] <= atual["versao"]:
        raise ErroFilmes("uso_invalido", f"a Sessão {sessao_id} não tem a versão {lido['versao']}")
    versao = atual if lido["versao"] == atual["versao"] else frente["versoes"][lido["versao"] - 1]

    avisos = []
    da_versao = {f["id"] for f in arquivo.na_tela(versao)}
    for marcado in lido["filmes"]:
        if marcado["id"] not in da_versao:
            avisos.append(f"{marcado['posicao']} {marcado['id']} ignorado: o filme não estava na tela da "
                          f"versão {lido['versao']}")
    lido["filmes"] = [m for m in lido["filmes"] if m["id"] in da_versao]

    vistos = _gravar_ja_vistos(amb, sessao_id, versao["presentes"], lido["filmes"])
    resposta = _resposta(amb, lido)
    if resposta:
        _gravar_resposta(amb, sessao_id, lido["versao"], resposta)

    tela = arquivo.na_tela(atual)
    na_tela = {f["id"] for f in tela}
    viram = {}
    for v in vistos:
        viram.setdefault(v["filme"], []).append(v["pessoa"])
    trocar = set()
    for marcado in lido["filmes"]:
        if not marcado["trocar"]:
            continue
        if marcado["id"] in na_tela:
            trocar.add(marcado["id"])
        else:
            avisos.append(f"trocar {marcado['id']} ignorado: o filme não está mais na tela da versão "
                          f"{atual['versao']}")
    saem, manter = [], []
    for item in tela:
        base = {"posicao": item["posicao"], "id": item["id"], "titulo": item.get("titulo")}
        if item["id"] in viram:
            saem.append({**base, "motivo": "ja_visto", "pessoas": viram[item["id"]]})
        elif item["id"] in trocar:
            saem.append({**base, "motivo": "trocado"})
        else:
            manter.append(item["id"])
    titulos = {f["id"]: f.get("titulo") for f in [*arquivo.na_tela(versao), *tela]}
    comentarios = [{"posicao": m["posicao"], "id": m["id"], "titulo": titulos.get(m["id"]), "comentario": m["comentario"]}
                   for m in lido["filmes"] if m["comentario"]]
    estrelas = [{"posicao": m["posicao"], "id": m["id"], "titulo": titulos.get(m["id"]), "estrelas": m["estrelas"]}
                for m in lido["filmes"] if m["estrelas"]]
    return {
        "sessao": {"id": sessao_id, "arquivo": arquivo.relativo(sessao_id)},
        "versao": lido["versao"],
        "versao_atual": atual["versao"],
        "regerar": bool(saem or lido["acrescentar"]),
        "manter": manter,
        "saem": saem,
        "acrescentar": lido["acrescentar"],
        "comentarios": comentarios,
        "estrelas": estrelas,
        "vistos": vistos,
        "avisos": avisos,
    }


def _gravar_ja_vistos(amb, sessao_id, presentes, filmes) -> list[dict]:
    pedidos = []
    for marcado in filmes:
        if marcado["ja_vi"]:
            for slug, nota in _quem_viu(amb, marcado, presentes):
                pedidos.append((slug, marcado["id"], nota))
    if not pedidos:
        return []
    with abrir_leitura(amb.banco) as conn:
        rotulos = {filme: fatos_da_pessoa.rotulo_do_alvo(conn, filme) for _, filme, _ in pedidos}
    vistos, mudadas = [], {}
    for slug, filme, nota in pedidos:
        pessoa = mudadas.get(slug) or pessoas.resolver(amb.dados, slug)
        fonte = f"cartaz {sessao_id}"
        anterior = next((v for v in pessoa.itens("já vistos") if v.fonte == fonte and v.alvo == filme), None)
        if anterior is None:
            pessoa.acrescentar("já vistos", pessoas.JaVisto(data=amb.hoje.isoformat(), fonte=fonte, alvo=filme,
                                                            rotulo=rotulos[filme], nota=nota))
            mudadas[slug] = pessoa
        elif nota is not None and nota != anterior.nota:
            # Colar de novo atualiza a nota do Já visto que o cartaz já gravou, sem somar outro.
            pessoa.tirar("já vistos", anterior)
            pessoa.acrescentar("já vistos", replace(anterior, nota=nota))
            mudadas[slug] = pessoa
        else:
            nota = anterior.nota
        vistos.append({"pessoa": slug, "filme": filme, "titulo": rotulos[filme], "nota": nota,
                       "novo": anterior is None})
    for pessoa in mudadas.values():
        pessoas.salvar(amb.dados, pessoa)
        fatos_da_pessoa.sincronizar(amb.banco, pessoa)
    return vistos


def _quem_viu(amb, marcado, presentes) -> list[tuple[str, float | None]]:
    valor = marcado["ja_vi"]
    if valor == "todos":
        return [(slug, None) for slug in presentes]
    if casou := _NOTA_DO_JA_VI.match(valor):
        nomes, nota = [casou[1]], nota_dita.ler(f"{casou[2]}/10")[0]
    else:
        nomes, nota = [n for n in (p.strip() for p in valor.split(",")) if n], None
    quem = []
    for nome in nomes:
        slug = pessoas.resolver(amb.dados, nome).slug
        if slug not in presentes:
            raise ErroFilmes("uso_invalido", f"já vi: {slug} não estava entre os Presentes do cartaz "
                                             f"({marcado['posicao']} {marcado['id']})")
        quem.append((slug, nota))
    return quem


def _resposta(amb, lido) -> dict | None:
    filmes = []
    for m in lido["filmes"]:
        item = {k: m[k] for k in ("estrelas", "comentario") if m[k]}
        if item:
            filmes.append({"posicao": m["posicao"], "id": m["id"], **item})
    if not filmes and not lido["acrescentar"]:
        return None
    resposta = {"data": amb.hoje}
    if lido["acrescentar"]:
        resposta["acrescentar"] = lido["acrescentar"]
    if filmes:
        resposta["filmes"] = filmes
    return resposta


def _gravar_resposta(amb, sessao_id, numero, resposta) -> None:
    with escrita(amb) as conn:
        frente, corpo = arquivo.ler(amb.dados, sessao_id)
        versoes = frente.get("versoes") or []
        alvo = frente if numero == len(versoes) + 1 else versoes[numero - 1]
        respostas = alvo.setdefault("respostas", [])
        if any(_sem_data(r) == _sem_data(resposta) for r in respostas):
            return   # o mesmo texto colado de novo
        respostas.append(resposta)
        banco.carregar(conn, sessao_id, frente)
        arquivo.escrever(amb.dados, sessao_id, frente, corpo)


def _sem_data(resposta: dict) -> dict:
    return {k: v for k, v in resposta.items() if k != "data"}
