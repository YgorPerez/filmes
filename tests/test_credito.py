"""Crédito: quem ficou atrás nas Sessões recentes pesa mais na Regra padrão.

Para cada Sessão em grupo com Feedback, a diferença é a média das reações dos
Presentes menos a reação da Pessoa, de 0 a 1 (Nota n vira (n − 0,5) / 4,5;
Relato gostou 1, neutro 0,5, não gostou 0). O Crédito é a média dessas
diferenças nas 5 Sessões mais recentes que ela dividiu com algum Presente de
hoje, com piso 0. Na Regra padrão, u' = u − 0,5 × Crédito.

Na fixture, Quim deu 5 a Ponte Aérea (Otávio Lins), 3,5 a Maré Baixa (Helena
Prado), 4,5 a Barulho (Caio Brandão) e 2 a Fronteira (Rui Tavares). Com o Bruno:
- As Horas Lentas agrada muito o Bruno e pouco o Quim (o Quim é o mínimo);
  Voo Noturno agrada os dois na mesma medida, menos do que As Horas Lentas
  agrada o Bruno.
- Asfalto Quente agrada o Quim e não o Bruno (o Bruno é o mínimo); A Volta do
  Mar agrada o Bruno e pouco o Quim.
"""

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def sem_bonus_da_nota(banco, tmp_path):
    """As margens destes cenários são pequenas: o bônus da nota do IMDb (#56) de As
    Horas Lentas (7,4) mudaria a ordem sem o Crédito. Aqui só o Crédito mexe nela."""
    pesos = tmp_path / "pesos-sem-nota.toml"
    texto = Path("config/pesos.toml").read_text(encoding="utf-8")
    assert "\npeso = 0.3\n\n[sem_tristeza]" in texto
    pesos.write_text(texto.replace("\npeso = 0.3\n\n[sem_tristeza]", "\npeso = 0.0\n\n[sem_tristeza]"), encoding="utf-8")
    banco.env["FILMES_PESOS"] = str(pesos)


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_quem_ficou_atras_ganha_credito_e_o_filme_dele_sobe_com_a_linha_de_credito(banco):
    antes = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")
    assert antes["credito"] == {"bruno": 0, "quim": 0}
    assert _titulos(antes).index("Voo Noturno") < _titulos(antes).index("As Horas Lentas")

    # Bruno detestou Pequenos Milagres; o Quim amou.
    banco.ok("feedback", "--sessao", antes["sessao"]["id"], "--filme", "Pequenos Milagres",
             "--nota", "dono=1", "--nota", "quim=5")
    depois = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")

    # Reações 0,111 e 1; média 0,556. Bruno ficou 0,444 atrás; Quim, à frente, não perde nada.
    assert depois["credito"] == {"bruno": 0.4444, "quim": 0}
    assert _titulos(depois).index("As Horas Lentas") < _titulos(depois).index("Voo Noturno")
    [linha] = _filme(depois, "As Horas Lentas")["linhas_do_filme"]
    assert linha == {
        "pessoa": "bruno",
        "texto": "na Sessão de 2026-11-20 (Pequenos Milagres), Bruno deu 1 e a média dos Presentes foi 3",
        "fonte": "Feedback da Sessão 2026-11-20", "data": "2026-11-20", "forca": "forte", "tipo": "nota",
        "fato_id": linha["fato_id"], "contribuicao": 0,
    }
    assert linha["fato_id"] in [f for [f] in banco.consultar("SELECT fato_id FROM notas WHERE pessoa = 'bruno'")]
    assert _filme(depois, "Voo Noturno")["linhas_do_filme"] == []
    assert _filme(antes, "As Horas Lentas")["linhas_do_filme"] == []


def test_filme_que_subiu_mas_em_que_quem_tem_credito_e_o_minimo_nao_leva_a_linha(banco):
    # O Farol de Areia agrada o Bruno (0,784) um pouco mais que o Quim (0,574). Com o
    # Crédito, o Bruno passa a ser o mínimo dele (0,562); ele sobe só porque outros
    # caíram mais, e não é o filme do Bruno.
    antes = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")
    banco.ok("feedback", "--sessao", antes["sessao"]["id"], "--filme", "Pequenos Milagres",
             "--nota", "dono=1", "--nota", "quim=5")
    depois = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")

    assert _titulos(depois).index("O Farol de Areia") < _titulos(antes).index("O Farol de Areia")
    assert _filme(depois, "O Farol de Areia")["linhas_do_filme"] == []


def _sessao_com_feedback(banco, presentes, *reacoes, filme="Pequenos Milagres"):
    sessao = banco.ok("recomendar", "--presentes", *presentes)["sessao"]["id"]
    banco.ok("feedback", "--sessao", sessao, "--filme", filme, *reacoes)


def test_relato_do_dono_conta_no_credito_em_tres_niveis(banco):
    _sessao_com_feedback(banco, ["dono", "quim"], "--nota", "dono=5", "--relato", "quim=não gostou")

    saida = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")

    # Reações 1 e 0: média 0,5, e o Quim ficou 0,5 atrás. Média 0,5 é 2,75 na escala de Nota.
    assert saida["credito"] == {"bruno": 0, "quim": 0.5}
    assert _titulos(saida).index("Asfalto Quente") < _titulos(saida).index("A Volta do Mar")
    [linha] = _filme(saida, "Asfalto Quente")["linhas_do_filme"]
    assert (linha["pessoa"], linha["fonte"], linha["tipo"], linha["forca"]) \
        == ("quim", "Feedback da Sessão 2026-11-20", "relato", "forte")
    assert linha["texto"] == ("na Sessão de 2026-11-20 (Pequenos Milagres), Quim não gostou"
                              " e a média dos Presentes foi 2,8")


def test_credito_nao_mexe_no_neutro_de_quem_nao_tem_fato(banco):
    # Quim fica com Crédito 0,5 (u' = u − 0,25). Em Voo Noturno ele tem Fato e cai para
    # 0,407. Em Maré Cheia ele não tem Fato e conta 0,5, sem o Crédito.
    _sessao_com_feedback(banco, ["dono", "quim"], "--nota", "dono=5", "--relato", "quim=não gostou")

    saida = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")

    assert saida["credito"]["quim"] == 0.5
    assert _titulos(saida).index("Maré Cheia") < _titulos(saida).index("Voo Noturno")


def test_sem_credito_o_filme_de_quem_ficou_atras_vem_depois(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "quim", "--quantos", "50")

    assert _titulos(saida).index("A Volta do Mar") < _titulos(saida).index("Asfalto Quente")


def test_presente_sem_reacao_nao_entra_no_credito(banco):
    _sessao_com_feedback(banco, ["dono", "quim"], "--nota", "dono=1")

    assert banco.ok("recomendar", "--presentes", "dono", "quim")["credito"] == {"bruno": 0, "quim": 0}


def test_nao_vimos_nada_nao_mexe_no_credito(banco):
    sessao = banco.ok("recomendar", "--presentes", "dono", "quim")["sessao"]["id"]
    banco.ok("feedback", "--sessao", sessao, "--nada")

    assert banco.ok("recomendar", "--presentes", "dono", "quim")["credito"] == {"bruno": 0, "quim": 0}


def test_sessao_aberta_nao_conta_no_credito(banco):
    banco.ok("recomendar", "--presentes", "dono", "quim")
    banco.env["FILMES_HOJE"] = "2026-11-21"

    assert banco.ok("recomendar", "--presentes", "dono", "quim")["credito"] == {"bruno": 0, "quim": 0}


def test_regra_media_e_de_fulano_nao_usam_credito(banco):
    _sessao_com_feedback(banco, ["dono", "quim"], "--nota", "dono=1", "--nota", "quim=5")

    for regra in (["--regra", "media"], ["--de", "quim"]):
        saida = banco.ok("recomendar", "--presentes", "dono", "quim", *regra, "--quantos", "50")
        assert saida["credito"] == {}
        linhas = [linha for filme in saida["filmes"] for linha in filme["linhas_do_filme"]]
        assert linhas and all(linha["pessoa"] is None for linha in linhas)


def test_dono_sozinho_nao_tem_credito(banco):
    _sessao_com_feedback(banco, ["dono", "quim"], "--nota", "dono=1", "--nota", "quim=5")

    assert banco.ok("recomendar", "--presentes", "dono")["credito"] == {}


def _arquivo(dados, sessao, data, presentes, reacoes, escolhido="tt9000601"):
    """Uma Sessão escrita direto no repo de dados, como o Feedback a deixaria."""
    linhas = "".join(f"    - {{pessoa: {p}, tipo: nota, nota: {n}}}\n" for p, n in reacoes)
    (dados / "sessoes").mkdir(exist_ok=True)
    (dados / "sessoes" / f"{sessao}.md").write_text(
        f"---\ndata: {data}\npresentes: [{', '.join(presentes)}]\n"
        "contexto: {pedido: null, duracao_max: null, clima: [], restricoes: []}\n"
        f"regra: {{nome: padrao}}\nescolhido: {escolhido}\nescolhido_na_recomendacao: null\n"
        f"feedback:\n  registrado_em: {data}\n  reacoes:\n{linhas}"
        "recomendacao: []\n---\n## Recomendação\n", encoding="utf-8")


def test_credito_olha_as_5_sessoes_mais_recentes_com_algum_presente_de_hoje(cli, dados):
    # Com o Quim: na mais antiga o Bruno ficou para trás; nas 5 seguintes, empate.
    _arquivo(dados, "2026-10-01-quim", "2026-10-01", ["bruno", "quim"], [("bruno", 0.5), ("quim", 5)])
    for dia in range(2, 7):
        _arquivo(dados, f"2026-10-0{dia}-quim", f"2026-10-0{dia}", ["bruno", "quim"], [("bruno", 4), ("quim", 4)])
    # Com a Iara, e sozinho: o Bruno ficou para trás, mas nada disso divide com o Quim.
    _arquivo(dados, "2026-11-01-iara", "2026-11-01", ["bruno", "iara"], [("bruno", 0.5), ("iara", 5)])
    _arquivo(dados, "2026-11-02-bruno", "2026-11-02", ["bruno"], [("bruno", 0.5)])
    cli.ok("reconstruir")

    assert cli.ok("recomendar", "--presentes", "dono", "quim")["credito"] == {"bruno": 0, "quim": 0}
    assert cli.ok("recomendar", "--presentes", "dono", "iara")["credito"] == {"bruno": 0.5, "iara": 0}
    # Com os três, contam as 5 mais recentes que o Bruno dividiu com o Quim ou a Iara.
    assert cli.ok("recomendar", "--presentes", "dono", "quim", "iara")["credito"]["bruno"] == 0.1


def test_filme_que_sobe_so_pela_restricao_sob_demanda_nao_leva_linha_de_credito(banco, tmp_path):
    fixture = Path(__file__).resolve().parent / "fixture"
    banco.env.update(FILMES_DDD_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(fixture / "gravacoes"))
    _sessao_com_feedback(banco, ["dono", "quim"], "--nota", "dono=1", "--nota", "quim=5")
    args = ("recomendar", "--presentes", "dono", "quim", "--quantos", "50", "--gatilho", "a dog dies")

    pesos = Path(__file__).resolve().parents[1] / "config" / "pesos.toml"
    sem_credito = tmp_path / "pesos.toml"
    sem_credito.write_text(pesos.read_text().replace("fator = 0.5", "fator = 0"))
    banco.env["FILMES_PESOS"] = str(sem_credito)
    antes = banco.ok(*args)
    del banco.env["FILMES_PESOS"]
    depois = banco.ok(*args)

    assert "As Horas Lentas" not in _titulos(depois)
    posicoes = {f["id"]: f["posicao"] for f in antes["filmes"]}
    for filme in depois["filmes"]:
        if filme["posicao"] >= posicoes[filme["id"]]:
            assert all(linha["pessoa"] is None for linha in filme["linhas_do_filme"]), filme["titulo"]


def test_credito_corta_a_janela_pelos_sufixos_numericos_no_mesmo_dia(cli, dados):
    data = "2026-11-20"
    base = f"{data}-quim"
    for numero in range(5, 10):
        _arquivo(dados, f"{base}-{numero}", data, ["bruno", "quim"], [("bruno", 5), ("quim", 5)])
    _arquivo(dados, f"{base}-10", data, ["bruno", "quim"], [("bruno", 0.5), ("quim", 5)])

    cli.ok("reconstruir")
    assert cli.ok("recomendar", "--presentes", "dono", "quim")["credito"] == {"bruno": 0.1, "quim": 0}
