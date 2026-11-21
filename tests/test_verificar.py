from pathlib import Path


# Na Regra padrão, o Teo, sem Fato nenhum, vale 0,5 em todo filme e o topo vira o
# dos filmes com bônus de grupo. Na vez do Bruno, As Horas Lentas fica em 1º.

def test_verifica_resposta_por_pessoa_usando_a_sessao(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "teo", "--de", "dono", "--duracao-max", "120", "--quantos", "1")
    resposta = """Você e Teo · até 2h · vez do Bruno.

**1. As Horas Lentas** (2021, 1h44)
- **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*
- **Teo:** sem fato *(fraca, palpite)*
- **Filme:** duração 1h44, dentro do limite de 2h (IMDb) *(forte, metadado)*

Depois, me conte o que viram e como foi."""

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}") == {
        "valida": True, "linhas_invalidas": [],
    }


def test_capa_generos_e_link_do_imdb_no_cabecalho_nao_contam_como_evidencia(banco):
    banco.env.update(FILMES_TMDB_CHAVE="x", FILMES_GRAVACOES=str(Path(__file__).parent / "fixture" / "gravacoes"))
    saida = banco.ok("recomendar", "--presentes", "dono", "teo", "--de", "dono", "--duracao-max", "120", "--quantos", "2")
    resposta = """Você e Teo · até 2h · vez do Bruno.

![capa](https://image.tmdb.org/t/p/w92/hOrAsLeNtAs9104.jpg) **1. As Horas Lentas** (2021, 1h44)\\
Drama, Mistério · [IMDb](https://www.imdb.com/title/tt9000104/)
- **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*
- **Teo:** sem fato *(fraca, palpite)*

**2. Sal e Ferrugem** (2023, 1h57)\\
Aventura, Ficção científica, Suspense · [IMDb](https://www.imdb.com/title/tt9000105/)
- **Teo:** sem fato *(fraca, palpite)*

Depois, me conte o que viram e como foi."""

    assert [f["titulo"] for f in saida["filmes"]] == ["As Horas Lentas", "Sal e Ferrugem"]
    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}") == {
        "valida": True, "linhas_invalidas": [],
    }


def _com_tmdb(banco):
    banco.env.update(FILMES_TMDB_CHAVE="x", FILMES_GRAVACOES=str(Path(__file__).parent / "fixture" / "gravacoes"))
    return banco


# Formato do #32: leitura do pedido em citação, um bloco por filme com título em
# português, capa, ficha, sinopse e cobertura, Evidências com o marcador de Força.
RESPOSTA_EM_BLOCOS = """> Você e Teo · até 2h · vez do Bruno. Saíram 2 filmes.

### 1. As Horas Lentas

![capa](https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg)

2021 · 1h44 · Drama, Mistério · ★ 7,4 · 28.000 votos · [IMDb](https://www.imdb.com/title/tt9000104/)

*Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.*

Fato sobre 1 de 2; sem fato: Teo

- ●●● **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*
- ●○○ **Teo:** sem fato *(palpite)*
- ●●● **Filme:** duração 1h44, dentro do limite de 2h (IMDb) *(metadado)*

---

### 2. Sal & Ferrugem *(Sal e Ferrugem)*

2023 · 1h57 · Aventura, Ficção científica, Suspense · 15.000 votos · [IMDb](https://www.imdb.com/title/tt9000105/)

*O Dr. Lemos embarca num cargueiro velho atrás de um sinal que vem do fundo do mar!*

Fato sobre 1 de 2; sem fato: Teo

- ●●● **Você:** deu 4,5 a Maré Baixa (2015), também de Helena Prado (Letterboxd do Bruno, 2024-02-10) *(nota)*
- ●○○ **Teo:** sem fato *(palpite)*

---

Depois, me conte o que viram e como foi."""


def test_aceita_a_resposta_em_blocos_por_filme_com_marcador_de_forca(banco):
    saida = _com_tmdb(banco).ok("recomendar", "--presentes", "dono", "teo", "--de", "dono", "--duracao-max", "120", "--quantos", "2")

    assert [f["titulo_pt"] for f in saida["filmes"]] == ["As Horas Lentas", "Sal & Ferrugem"]
    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={RESPOSTA_EM_BLOCOS}") == {
        "valida": True, "linhas_invalidas": [],
    }


def test_no_formato_em_blocos_marcador_de_forca_errado_ou_texto_alterado_sao_invalidos(banco):
    saida = _com_tmdb(banco).ok("recomendar", "--presentes", "dono", "teo", "--de", "dono", "--duracao-max", "120", "--quantos", "2")
    invalidas = [
        "- ●●○ **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*",
        "- ●●● **Teo:** sem fato *(palpite)*",
        "- ●○○ **Você e Ana:** sem fato *(palpite)*",
        "Vai ser a noite perfeita para os dois.",
    ]
    resposta = (RESPOSTA_EM_BLOCOS
                .replace("- ●●● **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*", invalidas[0])
                .replace("- ●○○ **Teo:** sem fato *(palpite)*\n- ●●● **Filme:**", f"{invalidas[1]}\n- ●●● **Filme:**")
                .replace("- ●○○ **Teo:** sem fato *(palpite)*\n\n---\n\nDepois",
                         f"{invalidas[2]}\n{invalidas[3]}\n\n---\n\nDepois"))

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}") == {
        "valida": False, "linhas_invalidas": invalidas,
    }


def test_no_formato_em_blocos_o_titulo_original_entre_parenteses_precisa_ser_o_da_sessao(banco):
    saida = _com_tmdb(banco).ok("recomendar", "--presentes", "dono", "teo", "--de", "dono", "--duracao-max", "120", "--quantos", "2")
    trocado = "### 2. Sal & Ferrugem *(As Horas Lentas)*"
    resposta = RESPOSTA_EM_BLOCOS.replace("### 2. Sal & Ferrugem *(Sal e Ferrugem)*", trocado)

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}")["linhas_invalidas"] == [
        trocado,
        "- ●●● **Você:** deu 4,5 a Maré Baixa (2015), também de Helena Prado (Letterboxd do Bruno, 2024-02-10) *(nota)*",
        "- ●○○ **Teo:** sem fato *(palpite)*",
    ]


def test_presentes_sem_fato_podem_dividir_uma_linha_so(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "teo", "iara", "--quantos", "50")
    filme = next(f for f in saida["filmes"] if f["cobertura"]["sem_fato"] == ["teo", "iara"])
    assert filme["cobertura"] == {"com_fato": 1, "presentes": 3, "sem_fato": ["teo", "iara"]}
    resposta = f"""> Você, Teo e Iara · regra padrão.

### {filme["posicao"]}. {filme["titulo"]}

Fato sobre 1 de 3; sem fato: Teo e Iara

- ●○○ **Teo e Iara:** sem fato *(palpite)*

---"""

    assert banco.ok("verificar", "--sessao", saida["sessao"]["id"], f"--texto={resposta}")["valida"] is True


def test_lista_evidencias_alteradas_ou_atribuidas_a_outra_pessoa(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "teo", "--de", "dono", "--quantos", "1")
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
