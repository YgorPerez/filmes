"""Cartaz HTML da Recomendação (#35): `cartaz --sessao <id>` lê a Sessão gravada.

Na fixture, o top 5 do Bruno com a Iara abre com As Horas Lentas e Sal e Ferrugem
(veja o LEIAME). O HTML é lido com o html.parser da biblioteca padrão.
"""

import re
import shutil
from html.parser import HTMLParser
from pathlib import Path

import pytest

from conftest import FIXTURE

GRAVACOES = FIXTURE / "gravacoes"
VAZIOS = {"meta", "img", "br", "link", "hr", "input"}


class No:
    def __init__(self, tag, attrs, pai=None):
        self.tag, self.attrs, self.pai = tag, dict(attrs), pai
        self.filhos, self.partes = [], []

    @property
    def classes(self):
        return (self.attrs.get("class") or "").split()

    @property
    def texto(self):
        return "".join(p if isinstance(p, str) else p.texto for p in self.partes)

    def todos(self, classe=None, tag=None):
        for filho in self.filhos:
            if (classe is None or classe in filho.classes) and (tag is None or filho.tag == tag):
                yield filho
            yield from filho.todos(classe, tag)

    def um(self, classe=None, tag=None):
        achados = list(self.todos(classe, tag))
        assert len(achados) == 1, (classe, tag, len(achados))
        return achados[0]


class _Arvore(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.raiz = self.atual = No("#raiz", {})

    def handle_starttag(self, tag, attrs):
        no = No(tag, attrs, self.atual)
        self.atual.filhos.append(no)
        self.atual.partes.append(no)
        if tag not in VAZIOS:
            self.atual = no

    def handle_endtag(self, tag):
        no = self.atual
        while no is not self.raiz and no.tag != tag:
            no = no.pai
        if no is not self.raiz:
            self.atual = no.pai

    def handle_data(self, data):
        self.atual.partes.append(data)


def arvore(html):
    leitor = _Arvore()
    leitor.feed(html)
    return leitor.raiz


def _cartaz(banco, tmp_path, *presentes, recomendar=()):
    sessao = banco.ok("recomendar", "--presentes", *presentes, *recomendar)
    destino = tmp_path / "cartaz.html"
    saida = banco.ok("cartaz", "--sessao", sessao["sessao"]["id"], "--saida", str(destino))
    return sessao, saida, destino.read_text(encoding="utf-8")


def test_cartaz_e_um_documento_html_com_um_card_por_filme_na_ordem_da_sessao(banco, tmp_path):
    sessao, saida, html = _cartaz(banco, tmp_path, "dono", "iara")

    assert saida["arquivo"] == str(tmp_path / "cartaz.html")
    assert saida["sessao"] == sessao["sessao"]["id"]
    assert html.startswith("<!doctype html>")
    cards = list(arvore(html).um("cartaz").todos("card"))
    assert [c.tag for c in cards] == ["article"] * 5
    assert [c.um(tag="h2").texto for c in cards] == [
        f"{f['posicao']}{f['titulo']}" for f in sessao["filmes"]
    ]


def _card(html, titulo):
    [card] = [c for c in arvore(html).todos("card") if titulo in c.um(tag="h2").texto]
    return card


@pytest.fixture
def com_rafa(cli, dados, tmp_path):
    """A Rafa deu as mesmas Notas que o Bruno aos dois filmes de Rui Tavares, nas mesmas
    datas: em A Volta do Mar, a Evidência mais forte dos dois é a mesma linha de metadado."""
    catalogo = tmp_path / "catalogo"
    shutil.copytree(FIXTURE / "catalogo", catalogo)
    with (catalogo / "notas.csv").open("a", encoding="utf-8") as notas:
        notas.write("rafa,tt9000401,5.0,2019-01-10,Letterboxd da Rafa\n")
        notas.write("rafa,tt9000402,4.0,2018-07-07,Letterboxd da Rafa\n")
    (dados / "pessoas" / "rafa.md").write_text("---\nnome: Rafa\napelidos: []\nvetos: []\nimports: []\n---\n")
    cli.env["FILMES_CATALOGO"] = str(catalogo)
    cli.ok("reconstruir")
    return cli


def test_presentes_com_a_mesma_evidencia_dividem_a_linha_e_quem_nao_tem_fato_fica_sem_forca(com_rafa, tmp_path):
    _, _, html = _cartaz(com_rafa, tmp_path, "dono", "rafa", "teo", recomendar=("--quantos", "60"))
    porque = _card(html, "A Volta do Mar").um("porque")

    [junta, sem_fato] = porque.todos(tag="li")
    assert [a.texto for a in junta.todos("av")] == ["B", "R"]
    assert junta.um("avs").attrs["aria-label"] == "Bruno, Rafa"
    assert junta.um("forca").attrs["aria-label"] == "Força moderada"
    assert junta.um("txt").texto == (
        "dirigido por Rui Tavares, como 2 filmes a que deu 4 ou mais: Fronteira (2008) e Inverno em Lisboa (2011)"
        "Wikidata"
    )
    assert sem_fato.classes == ["semfato"]
    assert [(a.texto, a.classes) for a in sem_fato.todos("av")] == [("T", ["av", "vazio"])]
    assert sem_fato.um("forca").texto == "" and "aria-label" not in sem_fato.um("forca").attrs
    assert sem_fato.um("txt").texto == "Teo: sem fato sobre este filme"
    assert "Fato sobre 2 de 3" in porque.um(tag="h3").texto


def test_a_faixa_da_capa_tem_um_ponto_por_presente_vazado_para_quem_nao_tem_fato(com_rafa, tmp_path):
    _, _, html = _cartaz(com_rafa, tmp_path, "dono", "rafa", "teo", recomendar=("--quantos", "60"))
    pontos = list(_card(html, "A Volta do Mar").um("faixa").todos("ponto"))

    assert [(p.attrs["title"], p.classes) for p in pontos] == [
        ("Bruno", ["ponto"]), ("Rafa", ["ponto"]), ("Teo: sem fato", ["ponto", "vazio"]),
    ]
    assert [p.attrs["style"] for p in pontos] == ["--cor:var(--chart-1)", "--cor:var(--chart-2)", "--cor:var(--chart-3)"]


def test_todo_seletor_do_css_fica_dentro_de_cartaz(banco, tmp_path):
    _, _, html = _cartaz(banco, tmp_path, "dono")
    [estilo] = arvore(html).todos(tag="style")
    css = re.sub(r"@media[^{]*\{", "", estilo.texto)

    seletores = [s.strip() for regra in css.split("}") if "{" in regra for s in regra.split("{")[0].split(",")]
    assert seletores and all(s == ".cartaz" or s.startswith(".cartaz ") for s in seletores), seletores


def test_cabecalho_do_card_traz_capa_em_w500_nota_titulo_em_portugues_e_sinopse(banco, tmp_path):
    banco.env.update(FILMES_TMDB_CHAVE="x", FILMES_GRAVACOES=str(GRAVACOES))
    _, saida, html = _cartaz(banco, tmp_path, "dono")
    horas, sal = _card(html, "As Horas Lentas"), _card(html, "Sal & Ferrugem")

    assert horas.um(tag="img").attrs["src"] == "https://image.tmdb.org/t/p/w500/hOrAsLeNtAs9104.jpg"
    assert horas.um("selo").texto == "★ 7,4"
    assert horas.um("sinopse").texto == ("Numa cidade do interior, uma relojoeira percebe que os relógios "
                                         "da casa atrasam um minuto por noite.")
    assert [c.texto for c in horas.um("chips").todos("chip")][-1].startswith("★ 7,4 IMDb · ")
    assert horas.um("chip", tag="a").attrs["href"] == "https://www.imdb.com/title/tt9000104/"
    assert sal.um(tag="h2").texto == "2Sal & FerrugemSal e Ferrugem"
    assert sal.um("orig").texto == "Sal e Ferrugem"
    assert list(sal.todos(tag="img")) == [] and list(sal.todos("selo")) == []
    assert saida["avisos"] == []


def test_topo_le_o_pedido_e_traz_a_legenda(banco, tmp_path):
    _, _, html = _cartaz(banco, tmp_path, "dono", "iara", recomendar=(
        "--duracao-max", "125", "--clima", "leve", "--sem-ja-visto", "--pedido", "algo leve pra hoje"))
    pedido = arvore(html).um("pedido")

    assert pedido.um("fala").texto == "“algo leve pra hoje”"
    assert "Vocês dois · até 2h05 · nota 7+ no IMDb · leve · nada repetido" in pedido.texto
    assert [l.texto for l in pedido.todos("leg")] == ["BBruno", "IIara", "●●● forte · ●●○ moderada · ●○○ fraca"]


def test_sem_saida_o_cartaz_vai_para_a_pasta_de_cartazes_ao_lado_do_banco(banco):
    sessao = banco.ok("recomendar", "--presentes", "dono")["sessao"]["id"]

    saida = banco.ok("cartaz", "--sessao", sessao)

    arquivo = Path(saida["arquivo"])
    assert arquivo == Path(banco.env["FILMES_BANCO"]).parent / "cartazes" / f"{sessao}.html"
    assert arquivo.read_text(encoding="utf-8").startswith("<!doctype html>")


def test_sessao_desconhecida_e_erro(banco):
    codigo, saida = banco.rodar("cartaz", "--sessao", "2026-01-01-ninguem")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "sessao_desconhecida"
