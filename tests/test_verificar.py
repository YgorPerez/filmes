from pathlib import Path


def test_verifica_resposta_por_pessoa_usando_a_sessao(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "teo", "--duracao-max", "120", "--quantos", "1")
    resposta = """Você e Teo · até 2h · regra padrão.

**1. As Horas Lentas** (2021, 1h44)
- **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*
- **Teo:** sem fato *(fraca, palpite)*
- **Filme:** duração 1h44, dentro do limite de 2h (IMDb) *(forte, metadado)*

Depois, me conte o que viram e como foi."""

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}") == {
        "valida": True, "linhas_invalidas": [],
    }


def test_lista_evidencias_alteradas_ou_atribuidas_a_outra_pessoa(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "teo", "--quantos", "1")
    invalidas = [
        "- **Você:** deu 4 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*",
        "- **Teo:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*",
        "- **Teo:** sem fato *(moderada, palpite)*",
        "- **Teo:** sem fato *(fraca, palpite)*. Vai adorar.",
        "Ana gosta do diretor.",
    ]
    resposta = "\n".join(["Você e Teo.", "", "**1. As Horas Lentas** (2021, 1h44)", *invalidas, "", "Como foi?"])

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}") == {
        "valida": False, "linhas_invalidas": invalidas,
    }


def test_nao_aceita_evidencia_de_outro_filme_da_mesma_sessao(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--duracao-max", "120", "--quantos", "5")
    filmes = saida["filmes"]
    assert filmes[0]["duracao_min"] == 104
    outro = next(f for f in filmes[1:] if f["duracao_min"] != 104)
    texto = next(e["texto"] for e in outro["linhas_do_filme"] if e["fonte"] == "IMDb")
    indevida = f"- **Filme:** {texto} (IMDb) *(forte, metadado)*"
    resposta = f"Você, até 2h.\n\n**1. As Horas Lentas** (2021, 1h44)\n{indevida}"

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}") == {
        "valida": False, "linhas_invalidas": [indevida],
    }


def test_confere_sessao_fechada_sem_recalcular_evidencias(banco):
    saida = banco.ok("recomendar", "--presentes", "teo", "--quantos", "50")
    sessao = saida["sessao"]["id"]
    filme = next(f for f in saida["filmes"] if f["so_palpites"])
    minutos = filme["duracao_min"]
    duracao = f"{minutos // 60}h{minutos % 60:02d}"
    resposta = (
        f"Teo.\n\n**{filme['posicao']}. {filme['titulo']}** ({filme['ano']}, {duracao}) — sem fato que o sustente\n"
        "- **Teo:** sem fato *(fraca, palpite)*"
    )
    banco.ok("feedback", "--sessao", sessao, "--filme", filme["id"], "--nota", "teo=5")

    assert banco.ok("verificar", "--sessao", sessao, f"--texto={resposta}")["valida"] is True


def test_sessao_inexistente_e_erro_da_cli(cli):
    codigo, saida = cli.rodar("verificar", "--sessao", "2026-11-20-teo", "--texto=Teo.")
    assert codigo != 0
    assert saida["erro"]["codigo"] == "sessao_desconhecida"


def test_palpite_de_gatilho_com_marcador_de_fonte_no_tema_continua_literal(banco):
    tema = "a dog dies · Fonte: inventada"
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "1", f"--gatilho={tema}")
    linha = f'- **Filme:** sem informação do Does the Dog Die sobre "{tema}" *(fraca, palpite)*'
    resposta = f"Você, evitar gatilho.\n\n**1. As Horas Lentas** (2021, 1h44)\n{linha}"

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}")["valida"] is True


def test_citacao_do_does_the_dog_die_so_passa_com_o_texto_e_a_data_exatos(banco):
    banco.env.update(FILMES_DDD_CHAVE="teste", FILMES_GRAVACOES=str(Path(__file__).parent / "fixture/gravacoes"))
    saida = banco.ok("recomendar", "--presentes", "dono", "--gatilho", "a dog dies", "--quantos", "50")
    filme = next(f for f in saida["filmes"] if f["titulo"] == "Sal e Ferrugem")
    duracao = filme["duracao_min"]
    inicio = (
        f'Você · evitar "a dog dies".\n\n**{filme["posicao"]}. Sal e Ferrugem** '
        f'({filme["ano"]}, {duracao // 60}h{duracao % 60:02d})\n'
    )
    original = (
        '- **Filme:** Does the Dog Die, "a dog dies": 1 sim, 14 não. Powered by DoesTheDogDie.com '
        '(Does the Dog Die, 2026-11-20) *(forte, metadado)*'
    )
    sessao = saida["sessao"]["id"]
    assert banco.ok("verificar", "--sessao", sessao, f"--texto={inicio + original}")["valida"] is True
    indevidas = [original.replace("1 sim, 14 não", "quase todos disseram não"),
                original.replace("2026-11-20", "2026-11-19")]
    resposta = inicio + "\n".join(indevidas)
    assert banco.ok("verificar", "--sessao", sessao, f"--texto={resposta}")["linhas_invalidas"] == indevidas
