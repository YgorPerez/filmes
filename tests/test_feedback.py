"""Feedback: o Dono conta o que viram e como cada um reagiu, e isso fecha a Sessão.

- A Nota do Dono e o número que ele repassa de alguém são Nota; o repassado leva
  "repassado pelo Dono" na Fonte.
- A impressão do Dono sobre alguém é Relato: gostou, neutro ou não gostou.
- Presente sem reação não gera Fato, mas ganha o Já visto do Filme escolhido.
- Nota e Relato vindos de Feedback sobem um nível de Força.
"""

from conftest import ler_markdown as _ler


def _sessao(banco, *presentes):
    return banco.ok("recomendar", "--presentes", *presentes)["sessao"]["id"]


def test_feedback_grava_o_filme_escolhido_e_as_reacoes_e_fecha_a_sessao(banco, dados):
    sessao = _sessao(banco, "dono", "iara", "teo")
    antes, corpo_antes = _ler(dados / "sessoes" / f"{sessao}.md")
    banco.env["FILMES_HOJE"] = "2026-11-21"

    banco.ok("feedback", "--sessao", sessao, "--filme", "noite de estreia",
             "--nota", "dono=4", "--nota", "iara=4,5", "--relato", "teo=gostou")

    frente, corpo = _ler(dados / "sessoes" / f"{sessao}.md")
    assert frente["escolhido"] == "tt9000203"
    assert frente["escolhido_na_recomendacao"] == 1
    assert str(frente["feedback"]["registrado_em"]) == "2026-11-21"
    assert frente["feedback"]["reacoes"] == [
        {"pessoa": "bruno", "tipo": "nota", "nota": 4.0},
        {"pessoa": "iara", "tipo": "nota", "nota": 4.5, "repassada": True},
        {"pessoa": "teo", "tipo": "relato", "reacao": "gostou"},
    ]
    assert corpo == corpo_antes
    assert {k: v for k, v in frente.items() if k not in ("escolhido", "escolhido_na_recomendacao", "feedback")} \
        == {k: v for k, v in antes.items() if k not in ("escolhido", "escolhido_na_recomendacao", "feedback")}
    assert banco.ok("sessoes-abertas") == {"sessoes": []}


def test_feedback_devolve_os_fatos_gravados_com_forca_um_nivel_acima(banco):
    sessao = _sessao(banco, "dono", "iara", "teo")

    saida = banco.ok("feedback", "--sessao", sessao, "--filme", "Noite de Estreia (2022)",
                     "--nota", "eu=4", "--nota", "Iara=2", "--relato", "teo=não gostou")

    assert saida["sessao"] == {"id": sessao, "arquivo": f"sessoes/{sessao}.md"}
    assert saida["escolhido"] == {"id": "tt9000203", "titulo": "Noite de Estreia", "ano": 2022, "posicao": 1}
    assert saida["sem_reacao"] == []
    reacoes = [{k: f[k] for k in ("pessoa", "texto", "fonte", "data", "forca", "tipo")}
               for f in saida["fatos"] if f["texto"] != "já viu"]
    assert reacoes == [
        # Nota 4 é moderada na régua; 2 é moderada contra. Do Feedback, as duas sobem para forte.
        {"pessoa": "bruno", "texto": "deu 4 a Noite de Estreia (2022)", "fonte": "Feedback da Sessão 2026-11-20",
         "data": "2026-11-20", "forca": "forte", "tipo": "nota"},
        {"pessoa": "iara", "texto": "deu 2 a Noite de Estreia (2022)",
         "fonte": "Feedback da Sessão 2026-11-20, repassado pelo Dono", "data": "2026-11-20", "forca": "forte",
         "tipo": "nota"},
        # Relato de um filme: um nível abaixo do Declarado específico (moderada), e sobe por vir do Feedback.
        {"pessoa": "teo", "texto": "não gostou de Noite de Estreia (2022)", "fonte": "Feedback da Sessão 2026-11-20",
         "data": "2026-11-20", "forca": "forte", "tipo": "relato"},
    ]
    assert all(f["fato_id"] for f in saida["fatos"])


def test_nota_fraca_do_feedback_sobe_para_moderada(banco):
    sessao = _sessao(banco, "dono")

    saida = banco.ok("feedback", "--sessao", sessao, "--filme", "tt9000203", "--nota", "dono=3")

    [nota] = [f for f in saida["fatos"] if f["tipo"] == "nota"]
    assert nota["forca"] == "moderada"


def test_presente_sem_reacao_nao_gera_fato_mas_ganha_o_ja_visto(banco):
    sessao = _sessao(banco, "dono", "iara", "teo")

    saida = banco.ok("feedback", "--sessao", sessao, "--filme", "Noite de Estreia", "--nota", "dono=4")

    assert saida["sem_reacao"] == ["iara", "teo"]
    assert {f["pessoa"] for f in saida["fatos"] if f["texto"] != "já viu"} == {"bruno"}
    ja_visto = [{k: f[k] for k in ("pessoa", "fonte", "forca", "tipo")} for f in saida["fatos"]
                if f["texto"] == "já viu"]
    assert ja_visto == [
        {"pessoa": "bruno", "fonte": "Feedback da Sessão 2026-11-20", "forca": "forte", "tipo": "declarado"},
        {"pessoa": "iara", "fonte": "Feedback da Sessão 2026-11-20", "forca": "forte", "tipo": "relato"},
        {"pessoa": "teo", "fonte": "Feedback da Sessão 2026-11-20", "forca": "forte", "tipo": "relato"},
    ]
    assert banco.consultar("SELECT pessoa FROM notas WHERE sessao IS NOT NULL") == [["bruno"]]


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def test_nota_do_feedback_entra_como_nota_semente_um_nivel_acima(banco):
    # Bruno deu 4 a Jardim Suspenso pelo Letterboxd (moderada). Dando 4 a Vento Norte
    # no Feedback, a Nota nova vale como semente forte para Rio Abaixo, do mesmo diretor.
    sessao = _sessao(banco, "dono")
    banco.ok("feedback", "--sessao", sessao, "--filme", "Vento Norte", "--nota", "dono=4")

    filme = _filme(banco.ok("recomendar", "--presentes", "dono", "--quantos", "50"), "Rio Abaixo")

    sementes = {e["texto"]: (e["fonte"], e["forca"]) for e in filme["evidencias"]["bruno"]
                if e["tipo"] == "nota" and e["texto"] != "já viu"}
    assert sementes == {
        "deu 4 a Jardim Suspenso (2017), também de Marta Quintal": ("Letterboxd do Bruno", "moderada"),
        "deu 4 a Vento Norte (2020), também de Marta Quintal": ("Feedback da Sessão 2026-11-20", "forte"),
    }


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_filme_que_alguem_ja_viu_pesa_contra_e_aparece_como_ja_visto_forte(banco):
    antes = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50")
    banco.ok("feedback", "--sessao", antes["sessao"]["id"], "--filme", "As Horas Lentas")

    depois = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50")

    # Nenhum dos dois deu Nota a As Horas Lentas: o Já visto vem só do Feedback.
    filme = _filme(depois, "As Horas Lentas")
    for pessoa, tipo in (("bruno", "declarado"), ("iara", "relato")):
        [visto] = [e for e in filme["evidencias"][pessoa] if e["texto"] == "já viu"]
        assert visto == {"pessoa": pessoa, "texto": "já viu", "fonte": "Feedback da Sessão 2026-11-20",
                         "data": "2026-11-20", "forca": "forte", "tipo": tipo, "fato_id": visto["fato_id"],
                         "contribuicao": -1.0}
        assert filme["utilidade"][pessoa] < _filme(antes, "As Horas Lentas")["utilidade"][pessoa]
    assert _titulos(depois).index("As Horas Lentas") > _titulos(antes).index("As Horas Lentas")


def test_nao_vimos_nada_fecha_a_sessao_sem_filme_escolhido_e_sem_fato(banco, dados):
    sessao = _sessao(banco, "dono", "iara")

    saida = banco.ok("feedback", "--sessao", sessao, "--nada")

    assert saida["escolhido"] is None
    assert saida["fatos"] == []
    frente, _ = _ler(dados / "sessoes" / f"{sessao}.md")
    assert frente["escolhido"] is None
    assert frente["feedback"]["reacoes"] == []
    assert banco.ok("sessoes-abertas") == {"sessoes": []}
    assert banco.consultar("SELECT count(*) FROM ja_visto") == [[0]]


def test_filme_de_fora_da_recomendacao_e_registrado_pelo_titulo(banco, dados):
    sessao = _sessao(banco, "dono")   # top 5 do Bruno, sem Deserto Branco

    saida = banco.ok("feedback", "--sessao", sessao, "--filme", "DESERTO BRANCO", "--nota", "dono=3,5")

    assert saida["escolhido"] == {"id": "tt9000701", "titulo": "Deserto Branco", "ano": 2015, "posicao": None}
    frente, _ = _ler(dados / "sessoes" / f"{sessao}.md")
    assert (frente["escolhido"], frente["escolhido_na_recomendacao"]) == ("tt9000701", None)


def _erro(banco, *args):
    codigo, saida = banco.rodar(*args)
    assert codigo != 0
    return codigo, saida["erro"]["codigo"]


def test_sessao_fechada_nao_aceita_outro_feedback(banco):
    sessao = _sessao(banco, "dono")
    banco.ok("feedback", "--sessao", sessao, "--nada")

    assert _erro(banco, "feedback", "--sessao", sessao, "--filme", "Vento Norte") == (1, "sessao_fechada")


def test_feedback_recusa_o_que_nao_cabe_na_sessao(banco):
    sessao = _sessao(banco, "dono", "iara")
    feedback = ("feedback", "--sessao", sessao)

    assert _erro(banco, "feedback", "--sessao", "2026-01-01-ninguem", "--nada") == (1, "sessao_desconhecida")
    assert _erro(banco, *feedback, "--filme", "Filme Que Não Existe") == (1, "filme_desconhecido")
    assert _erro(banco, *feedback, "--filme", "Vento Norte", "--nota", "teo=4") == (2, "uso_invalido")
    assert _erro(banco, *feedback, "--filme", "Vento Norte", "--nota", "iara=6") == (2, "uso_invalido")
    assert _erro(banco, *feedback, "--filme", "Vento Norte", "--relato", "dono=gostou") == (2, "uso_invalido")
    assert _erro(banco, *feedback, "--filme", "Vento Norte", "--relato", "iara=amou") == (2, "uso_invalido")
    assert _erro(banco, *feedback, "--filme", "Vento Norte", "--nota", "iara=4", "--relato", "iara=gostou") \
        == (2, "uso_invalido")
    assert _erro(banco, *feedback, "--nada", "--nota", "dono=4") == (2, "uso_invalido")
    assert _erro(banco, *feedback, "--nada", "--filme", "Vento Norte") == (2, "uso_invalido")
    assert banco.ok("sessoes-abertas")["sessoes"][0]["id"] == sessao


def test_falha_ao_carregar_fatos_preserva_o_arquivo_aberto(banco, dados):
    pasta = dados / "sessoes"
    pasta.mkdir()
    sessao = "2026-11-20-bruno"
    arquivo = pasta / f"{sessao}.md"
    aberto = "---\ndata: 2026-11-20\npresentes: [bruno, bruno]\nregra: {nome: padrao}\n---\n"
    arquivo.write_text(aberto, encoding="utf-8")

    codigo, _ = banco.rodar("feedback", "--sessao", sessao, "--filme", "tt9000302")

    assert codigo != 0
    assert arquivo.read_text(encoding="utf-8") == aberto
    assert banco.ok("sessoes-abertas")["sessoes"][0]["id"] == sessao


def test_sem_ja_visto_exclui_filme_da_sessao_para_presente_sem_reacao(banco):
    sessao = banco.ok("recomendar", "--presentes", "dono", "teo")["sessao"]["id"]
    banco.ok("feedback", "--sessao", sessao, "--filme", "Vento Norte", "--nota", "dono=4")

    saida = banco.ok("recomendar", "--presentes", "teo", "--sem-ja-visto", "--quantos", "50")
    assert all(filme["id"] != "tt9000302" for filme in saida["filmes"])
    assert saida["restricoes"]["sem_ja_visto"]["tirados"] == 1


def test_feedback_acha_pelo_titulo_filme_recomendado_que_saiu_do_catalogo(banco, dados):
    pasta = dados / "sessoes"
    pasta.mkdir()
    sessao = "2026-11-20-bruno"
    (pasta / f"{sessao}.md").write_text(
        "---\ndata: 2026-11-20\npresentes: [bruno]\nregra: {nome: padrao}\n"
        "recomendacao: [{posicao: 1, id: tt9999999, titulo: Filme Arquivado}]\n---\n",
        encoding="utf-8",
    )

    saida = banco.ok("feedback", "--sessao", sessao, "--filme", "filme arquivado")

    assert saida["escolhido"] == {"id": "tt9999999", "titulo": "Filme Arquivado", "ano": None, "posicao": 1}
