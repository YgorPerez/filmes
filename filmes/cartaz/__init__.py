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

Numa versão refeita com `--manter` (#59), o filme que entrou leva o selo "novo" e
o topo diz o que saiu e por quê, a partir de `saidas`. Enquanto o parecido vale
na Sessão (#68), a leitura do pedido no topo diz "parecidos com X".

O cartaz responde (#60), como o do match-reply: a página não manda nada a lugar
nenhum. Cada card tem Já vi (um chip por Presente, "Você" para o Dono, e "Todos"
com mais de um Presente; para cada Pessoa marcada, nota de 1 a 10 e o que achou),
Trocar, estrelas de 1 a 5 e comentário; embaixo, depois do último filme, o campo acrescentar e um botão
só, Copiar pro chat. Quem monta o texto é `textoDoCartaz(estado)`, em `cartaz.js`,
embutido no `<script>`. Sem JavaScript, o cartaz se lê como antes e o botão não
faz nada.

Formato do texto copiado (o que `cartaz responder`, #61, lê):

    #cartaz 2026-11-20-iara v2
    acrescentar: chegou a Ana, algo leve
    1 tt9000104 · já vi: bruno=8 · estrelas: 4
    3 tt9000106 · já vi: todos
    4 tt9000107 · já vi: bruno, teo · trocar · comentário: lindo, mas · longo
    5 tt9000108 · estrelas: 2

- Cabeçalho, sempre a primeira linha: `#cartaz <sessao-id> v<n>`, com `n` o número
  da versão que o cartaz mostra (`len(versoes) + 1` quando foi gerado).
- `acrescentar: <texto>` na segunda linha, só se o campo tiver texto.
- Uma linha por filme com alguma marcação, na ordem da tela: `<posição> <id do
  IMDb>`, depois as marcações separadas por ` · `, sempre nesta ordem:
  - `já vi: <slug>, <slug>=<nota>, ...`: cada Pessoa marcada, com `=<nota>` (inteira
    de 1 a 10, a escala do Feedback) se a dela foi preenchida. Os slugs saem na
    ordem dos Presentes. `já vi: todos` quando todos os Presentes (mais de um)
    estão marcados e ninguém deu nota nem disse o que achou.
  - `achou <slug>: <texto>`, uma por Pessoa marcada que disse o que achou, na ordem
    dos Presentes. Um ` · ` dentro do texto vira ` - `. (O leitor aceita também o
    `achou: <texto>` antigo, com uma Pessoa só no Já vi.)
  - `trocar`
  - `estrelas: <1 a 5>`
  - `comentário: <texto>`, sempre a última: o texto vai até o fim da linha e pode
    ter ` · `.
- A posição é a da tela (`mostrados`, se o cartaz veio de `--filmes`); quem lê
  aplica pelo ID, que vale mesmo num texto de versão velha.
- Texto livre (acrescentar e comentário) vira uma linha só: espaços e quebras
  seguidos viram um espaço, sem espaço nas pontas.
- O texto termina com quebra de linha. Sem marcação nenhuma, sai só o cabeçalho, e
  o botão avisa "Nada marcado ainda." em vez de copiar.
"""

from html import escape
from pathlib import Path

from filmes.banco import abrir_leitura
from filmes.erros import ErroFilmes
from filmes.recomendacao import cabecalho
from filmes.recomendacao import restricoes
from filmes.recomendacao.restricoes import Contexto
from filmes.sessao import arquivo

AQUI = Path(__file__).resolve().parent
CSS = (AQUI / "cartaz.css").read_text(encoding="utf-8")
JS = (AQUI / "cartaz.js").read_text(encoding="utf-8")
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
        novos = {r["id"]: r.get("novo", False) for r in frente.get("recomendacao") or []}
        cards = []
        for filme in filmes:
            linha = conn.execute("SELECT * FROM filmes WHERE id = ?", (filme["id"],)).fetchone()
            if linha is None:
                raise ErroFilmes("dados_invalidos", f"Sessão {sessao_id}: {filme['id']} não está no Catálogo")
            filme["novo"] = novos.get(filme["id"], False)
            cards.append(_card(filme, linha, cabecalho.do_filme(contexto, linha), pessoas, primeiro=not cards,
                               dono=frente.get("dono")))
    finally:
        conn.close()
    topo = _pedido(frente, pessoas, amb.pesos) + _saiu(frente, pessoas)
    versao = arquivo.versao_atual(frente)["versao"]
    dados = (f'data-sessao="{escape(sessao_id)}" data-versao="{versao}" '
             f'data-presentes="{escape(" ".join(presentes))}"')
    titulo = f"Recomendação de {frente['data']}"
    html = (
        "<!doctype html>\n"
        '<html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(titulo)}</title></head><body>\n"
        f"<style>\n{CSS}</style>\n"
        f'<div class="cartaz" {dados}>\n{topo}\n{"".join(cards)}\n{RESPONDER}</div>\n'
        f"<script>\n{JS}</script>\n"
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
    partes.extend(escape(restricoes.rotulo(r)) for r in contexto.get("restricoes") or [])
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


def _saiu(frente, pessoas) -> str:
    """A linha do que saiu da versão anterior e por quê, das `saidas` de um `--manter` (#59)."""
    saidas = frente.get("saidas") or []
    if not saidas:
        return ""
    dono = frente.get("dono")

    def nome(slug):
        return "você" if slug == dono else pessoas.get(slug, {}).get("nome", slug)

    def motivo(s):
        if s["motivo"] == "ja_visto":
            quem = s.get("pessoas") or []
            nomes = " e ".join(filter(None, [", ".join(nome(p) for p in quem[:-1]), nome(quem[-1])])) if quem else ""
            return f"{nomes} já {'viu' if len(quem) == 1 else 'viram'}".strip()
        if s["motivo"] in {"restricao", "nota_minima", "parecido"}:
            return s.get("rotulo") or s.get("restricao")
        if s["motivo"] == "veto":
            de = "seu Veto" if s.get("pessoa") == dono else f"Veto de {nome(s.get('pessoa'))}"
            return f"{de}: “{s.get('texto', '')}”"
        return "trocado"

    itens = " · ".join(f"{s['posicao']} {escape(s['titulo'])} ({escape(motivo(s))})" for s in saidas)
    return f'<div class="saiu">Saiu: {itens}</div>'


def _quem(frente, pessoas) -> str:
    if len(pessoas) == 1:
        [(slug, pessoa)] = pessoas.items()
        return "Você" if slug == frente.get("dono") else pessoa["nome"]
    return f"Vocês {POR_EXTENSO.get(len(pessoas), len(pessoas))}"


RESPONDER = (
    '<div class="responder">'
    '<label class="campo">Acrescentar <span>contexto da noite ou gosto: “chegou a Ana”, “algo leve”</span>'
    '<textarea class="acrescentar" rows="2"></textarea></label>'
    '<button class="copiar" type="button">Copiar pro chat</button>'
    '<p class="aviso" role="status" aria-live="polite"></p>'
    '<p class="guardado"></p>'
    '<textarea class="saida" readonly hidden aria-label="texto pra colar no chat"></textarea>'
    '<noscript><p class="semjs">Sem JavaScript o botão não copia: responda no chat.</p></noscript>'
    "</div>"
)


def _responde(filme, pessoas, dono) -> str:
    """Os controles do card: Já vi por Presente (e Todos, com mais de um), e para cada
    Pessoa marcada uma linha com nota de 1 a 10 e o que achou; Trocar, estrelas de 1 a 5 e comentário. Quem monta o texto é o cartaz.js."""
    n = filme["posicao"]
    chips = "".join(
        f'<label class="opcao"><input type="checkbox" class="javi" value="{escape(slug)}">'
        f'{"Você" if slug == dono else escape(p["nome"])}</label>'
        for slug, p in pessoas.items()
    )
    if len(pessoas) > 1:
        chips += '<label class="opcao"><input type="checkbox" class="javi-todos">Todos</label>'
    detalhes = "".join(
        f'<div class="javi-detalhe" data-pessoa="{escape(slug)}" hidden>'
        f'<span class="quem">{"Você" if slug == dono else escape(p["nome"])}</span>'
        '<label class="opcao nota-campo">nota <input type="number" class="nota" min="1" max="10" step="1" '
        'inputmode="numeric" disabled></label>'
        f'<label class="opcao achou-campo"><textarea class="achou" rows="1" disabled '
        f'aria-label="o que {"você" if slug == dono else escape(p["nome"])} achou do filme {n}" '
        'placeholder="o que achou"></textarea></label></div>'
        for slug, p in pessoas.items()
    )
    estrelas = "".join(
        f'<input type="radio" id="e{n}-{v}" name="e{n}" value="{v}" aria-label="{v} de 5">'
        f'<label for="e{n}-{v}" aria-hidden="true">★</label>'
        for v in range(5, 0, -1)   # de trás para a frente: o CSS inverte e pinta as menores com `~`
    )
    return (
        '<div class="responde">'
        f'<div class="linha"><span class="rot">Já vi</span>{chips}</div>{detalhes}'
        '<div class="linha"><label class="opcao"><input type="checkbox" class="trocar">Trocar</label>'
        f'<fieldset class="estrelas"><legend>quanto animou</legend>{estrelas}</fieldset></div>'
        f'<textarea class="comentario" rows="1" aria-label="comentário sobre o filme {n}" placeholder="comentário"></textarea>'
        "</div>"
    )


def _card(filme, linha, ficha, pessoas, primeiro, dono=None) -> str:
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
    return f'''<article class="card" data-posicao="{filme["posicao"]}" data-id="{escape(filme["id"])}">
  <a class="capa" href="{imdb}" target="_blank" rel="noopener">
    {imagem}
    {selo}
    <span class="faixa">{pontos}</span>
  </a>
  <div class="corpo">
    <h2><span class="n">{filme["posicao"]}</span>{escape(titulo)}{original}{'<span class="novo">novo</span>' if filme["novo"] else ""}</h2>
    {sinopse}
    <div class="chips">{"".join(f'<span class="chip">{escape(c)}</span>' for c in chips)}<a class="chip imdb" href="{imdb}" target="_blank" rel="noopener">{nota_imdb}{_votos(ficha["votos_imdb"])} votos</a></div>
  </div>
  <div class="porque"><h3>Por que cada um vai gostar <span>{cobertura}</span></h3><ul>{_linhas(filme, pessoas, sem_fato)}</ul></div>
  {_responde(filme, pessoas, dono)}
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
