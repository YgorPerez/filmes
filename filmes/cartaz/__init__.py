"""Cartaz HTML da Recomendação, a partir da Sessão gravada.

    gerar(amb, sessao_id, mostrados=None) -> {"html", "filmes", "avisos"}

Com `mostrados` (IDs do IMDb), o cartaz traz só esses filmes da Recomendação, na
ordem dada e numerados de 1 em diante, que é a lista que o Dono vê.

O cartaz é um documento completo (`<!doctype html>`) para o T3 Code mostrar na
conversa. Todo o texto sai daqui: a leitura do pedido, o cabeçalho de cada filme
e, em "Por que cada um vai gostar", a Evidência mais forte de cada Presente.
Presentes com a mesma Evidência dividem uma linha; quem não tem Fato fica numa
linha à parte, sem marcador de Força.

As Evidências vêm do corpo da Sessão. O cabeçalho (gêneros, nota, capa, título
em português, sinopse) é refeito do banco e do TMDB, que responde do cache.
O CSS (`cartaz.css`) só vale dentro de `.cartaz` e usa as variáveis de tema do T3.
As atribuições das fontes ficam fora, como na resposta em Markdown (decisão do
Dono de 2026-11-21).
"""

from html import escape
from pathlib import Path

from filmes.banco import abrir_leitura
from filmes.erros import ErroFilmes
from filmes.recomendacao import cabecalho
from filmes.recomendacao.restricoes import Contexto
from filmes.recomendacao.restricoes import ano
from filmes.sessao import arquivo

CSS = (Path(__file__).resolve().parent / "cartaz.css").read_text(encoding="utf-8")
MARCADOR = {"forte": "●●●", "moderada": "●●○", "fraca": "●○○"}
ORDEM_DA_FORCA = {"forte": 0, "moderada": 1, "fraca": 2}
CORES = 6   # o T3 define --chart-1 a --chart-6
POR_EXTENSO = {2: "dois", 3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez"}


def gerar(amb, sessao_id: str, mostrados: list[str] | None = None) -> dict:
    frente, corpo = arquivo.ler(amb.dados, sessao_id)
    filmes = arquivo.filmes_do_corpo(frente, corpo)
    if mostrados is not None:
        filmes = _so_os_mostrados(sessao_id, filmes, mostrados)
    presentes = frente["presentes"]
    conn = abrir_leitura(amb.banco)
    try:
        nomes = dict(conn.execute("SELECT slug, nome FROM pessoas"))
        contexto = Contexto(conn=conn, amb=amb, presentes=presentes)
        pessoas = _pessoas(presentes, nomes)
        cards = []
        for filme in filmes:
            linha = conn.execute("SELECT * FROM filmes WHERE id = ?", (filme["id"],)).fetchone()
            if linha is None:
                raise ErroFilmes("dados_invalidos", f"Sessão {sessao_id}: {filme['id']} não está no Catálogo")
            cards.append(_card(filme, linha, cabecalho.do_filme(contexto, linha), pessoas, primeiro=not cards))
    finally:
        conn.close()
    topo = _pedido(frente, pessoas, amb.pesos)
    titulo = f"Recomendação de {frente['data']}"
    html = (
        "<!doctype html>\n"
        '<html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(titulo)}</title></head><body>\n"
        f"<style>\n{CSS}</style>\n"
        f'<div class="cartaz">\n{topo}\n{"".join(cards)}</div>\n'
        "</body></html>\n"
    )
    return {"html": html, "filmes": len(cards), "avisos": contexto.avisos}


def _so_os_mostrados(sessao_id, filmes, mostrados) -> list[dict]:
    por_id = {f["id"]: f for f in filmes}
    if not mostrados:
        raise ErroFilmes("uso_invalido", "--filmes vazio: passe os IDs do IMDb dos filmes mostrados")
    if len(set(mostrados)) != len(mostrados):
        raise ErroFilmes("uso_invalido", "--filmes repete um filme")
    fora = [f for f in mostrados if f not in por_id]
    if fora:
        raise ErroFilmes("uso_invalido", f"{', '.join(fora)} fora da Recomendação da Sessão {sessao_id}")
    return [{**por_id[f], "posicao": posicao} for posicao, f in enumerate(mostrados, start=1)]


def _pessoas(presentes, nomes) -> dict:
    """slug -> {nome, inicial, cor}. A inicial é o menor começo do nome que não se
    repete entre os Presentes ("Léo" e "Lorenzo" viram "Lé" e "Lo")."""
    lista = {p: nomes.get(p, p) for p in presentes}
    pessoas = {}
    for posicao, (slug, nome) in enumerate(lista.items()):
        outros = [n.casefold() for s, n in lista.items() if s != slug]
        tamanho = 1
        while tamanho < len(nome) and any(o.startswith(nome[:tamanho].casefold()) for o in outros):
            tamanho += 1
        pessoas[slug] = {"nome": nome, "inicial": nome[:tamanho].capitalize(),
                         "cor": f"var(--chart-{posicao % CORES + 1})"}
    return pessoas


def _pedido(frente, pessoas, pesos) -> str:
    contexto = frente.get("contexto") or {}
    partes = [f"<b>{escape(_quem(frente, pessoas))}</b>"]
    if contexto.get("duracao_max"):
        partes.append(f"até {arquivo.duracao(contexto['duracao_max'])}")
    partes.append(f"nota {_numero(pesos['catalogo']['nota_imdb_minima'])}+ no IMDb")
    partes.extend(escape(c) for c in contexto.get("clima") or [])
    partes.extend(escape(_restricao(r)) for r in contexto.get("restricoes") or [])
    regra = frente.get("regra") or {}
    if regra.get("nome") == "media":
        partes.append("pela média")
    elif regra.get("nome") == "de":
        partes.append(f"pelo gosto de {escape(pessoas.get(regra.get('pessoa'), {}).get('nome', regra.get('pessoa')))}")
    fala = f'<div class="fala">“{escape(contexto["pedido"])}”</div>' if contexto.get("pedido") else ""
    legenda = "".join(
        f'<span class="leg">{_avatar(p)}{escape(p["nome"])}</span>' for p in pessoas.values()
    ) + '<span class="leg">●●● forte · ●●○ moderada · ●○○ fraca</span>'
    return f'<div class="pedido">{fala}<div>{" · ".join(partes)}</div><div class="legenda">{legenda}</div></div>'


def _quem(frente, pessoas) -> str:
    if len(pessoas) == 1:
        [(slug, pessoa)] = pessoas.items()
        return "Você" if slug == frente.get("dono") else pessoa["nome"]
    return f"Vocês {POR_EXTENSO.get(len(pessoas), len(pessoas))}"


def _restricao(restricao) -> str:
    nome = restricao.get("nome")
    if nome == "sem_ja_visto":
        return "nada repetido"
    if nome == "sem_tristeza":
        return "nada triste"
    if nome == "idioma":
        return f"idioma original: {restricao['idioma']}"
    if nome == "crianca":
        return f"com criança de {restricao['idade']} anos" if restricao.get("idade") else "com criança"
    if nome == "ano":
        return ano.intervalo(restricao.get("desde"), restricao.get("ate"))
    if nome == "gatilho":
        return "sem " + ", ".join(f"“{t}”" for t in restricao.get("temas") or [])
    return str(nome)


def _card(filme, linha, ficha, pessoas, primeiro) -> str:
    sem_fato = [p for p, es in filme["evidencias"].items() if not any(e["tipo"] != "palpite" for e in es)]
    titulo = ficha["titulo_pt"] or linha["titulo"]
    original = (f'<span class="orig">{escape(linha["titulo"])}</span>'
                if ficha["titulo_pt"] and ficha["titulo_pt"] != linha["titulo"] else "")
    imdb = escape(ficha["imdb"])
    nota = ficha["nota_imdb"]
    pontos = "".join(
        f'<span class="ponto{" vazio" if p in sem_fato else ""}" style="--cor:{d["cor"]}" '
        f'title="{escape(d["nome"])}{": sem fato" if p in sem_fato else ""}"></span>'
        for p, d in pessoas.items()
    )
    if ficha["capa"]:
        imagem = (f'<img src="{escape(ficha["capa"].replace("/w185/", "/w500/"))}" alt="Capa de {escape(titulo)}" '
                  f'loading="{"eager" if primeiro else "lazy"}">')
    else:
        imagem = f'<span class="semcapa">{escape(titulo)}</span>'
    selo = f'<span class="selo">★ {_nota(nota)}</span>' if nota is not None else ""
    chips = [str(linha["ano"])] if linha["ano"] else []
    if linha["duracao_min"]:
        chips.append(arquivo.duracao(linha["duracao_min"]))
    chips.extend(ficha["generos"])
    nota_imdb = f"★ {_nota(nota)} IMDb · " if nota is not None else "IMDb · "
    sinopse = f'<p class="sinopse">{escape(ficha["sinopse"])}</p>' if ficha["sinopse"] else ""
    presentes = len(pessoas)
    cobertura = f"Fato sobre {presentes - len(sem_fato)} de {presentes}"
    return f'''<article class="card">
  <a class="capa" href="{imdb}" target="_blank" rel="noopener">
    {imagem}
    {selo}
    <span class="faixa">{pontos}</span>
  </a>
  <div class="corpo">
    <h2><span class="n">{filme["posicao"]}</span>{escape(titulo)}{original}</h2>
    {sinopse}
    <div class="chips">{"".join(f'<span class="chip">{escape(c)}</span>' for c in chips)}<a class="chip imdb" href="{imdb}" target="_blank" rel="noopener">{nota_imdb}{_votos(ficha["votos_imdb"])} votos</a></div>
  </div>
  <div class="porque"><h3>Por que cada um vai gostar <span>{cobertura}</span></h3><ul>{_linhas(filme, pessoas, sem_fato)}</ul></div>
</article>
'''


def _linhas(filme, pessoas, sem_fato) -> str:
    """A Evidência mais forte de cada Presente com Fato, juntando quem tem a mesma;
    as linhas na ordem da Força, e quem não tem Fato numa linha no fim."""
    grupos = {}
    for pessoa, evidencias in filme["evidencias"].items():
        if pessoa in sem_fato:
            continue
        mais_forte = next(e for e in evidencias if e["tipo"] != "palpite")
        chave = tuple(mais_forte[c] for c in ("texto", "fonte", "data", "forca", "tipo"))
        grupos.setdefault(chave, []).append(pessoa)
    linhas = []
    for (texto, fonte, _, forca, _), quem in sorted(grupos.items(), key=lambda g: ORDEM_DA_FORCA[g[0][3]]):
        nomes = ", ".join(pessoas[p]["nome"] for p in quem)
        fonte = f'<span class="fonte">{escape(fonte)}</span>' if fonte else ""
        linhas.append(
            f'<li><span class="avs" aria-label="{escape(nomes)}">{"".join(_avatar(pessoas[p]) for p in quem)}</span>'
            f'<span class="forca forca-{forca}" aria-label="Força {forca}"><span aria-hidden="true">{MARCADOR[forca]}</span></span>'
            f'<span class="txt">{escape(texto)}{fonte}</span></li>'
        )
    if sem_fato:
        nomes = ", ".join(pessoas[p]["nome"] for p in sem_fato)
        linhas.append(
            f'<li class="semfato"><span class="avs" aria-label="{escape(nomes)}">'
            f'{"".join(_avatar(pessoas[p], vazio=True) for p in sem_fato)}</span><span class="forca"></span>'
            f'<span class="txt">{escape(nomes)}: sem fato sobre este filme</span></li>'
        )
    return "".join(linhas)


def _avatar(pessoa, vazio=False) -> str:
    classe = "av vazio" if vazio else "av"
    return (f'<span class="{classe}" style="--cor:{pessoa["cor"]}" title="{escape(pessoa["nome"])}">'
            f'{escape(pessoa["inicial"])}</span>')


def _nota(nota: float) -> str:
    return f"{nota:.1f}".replace(".", ",")


def _numero(valor) -> str:
    return (str(int(valor)) if float(valor).is_integer() else str(valor)).replace(".", ",")


def _votos(votos: int) -> str:
    if votos >= 1_000_000:
        return f"{votos / 1e6:.1f} mi".replace(".", ",")
    if votos >= 1000:
        return f"{round(votos / 1000)} mil"
    return str(votos)
