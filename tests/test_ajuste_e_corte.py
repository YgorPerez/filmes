"""Ajuste de uma Pessoa a um elo e corte das N Evidências mais fortes (decisões do Dono, 2026-11-22).

Na fixture, Voo Noturno liga ao Bruno só pelo elenco (Rita Lobo, como em Ponte
Aérea, a que ele deu 4,5), e Risos de Domingo tem Davi Couto no elenco.
"""

import math
from pathlib import Path

from conftest import ler_markdown


def _do_bruno(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return [(e["texto"], e["forca"], e["tipo"], e["contribuicao"]) for e in filme["evidencias"]["bruno"]]


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _todos(banco):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "60")


def test_ajuste_nada_tira_as_evidencias_do_elo(banco):
    banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "nada")

    assert _do_bruno(_todos(banco), "Voo Noturno") == [("sem fato", "fraca", "palpite", 0)]


def test_ajuste_pouco_desce_a_forca_e_vale_metade(banco):
    banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "pouco")

    # Sem Ajuste: semente moderada (0,5 × 0,6) e metadado fraco (0,5 × 0,3).
    assert sorted(_do_bruno(_todos(banco), "Voo Noturno")) == [
        ("com Rita Lobo no elenco, como 1 filme a que deu 4 ou mais: Ponte Aérea (2016)", "fraca", "metadado", 0.075),
        ("deu 4,5 a Ponte Aérea (2016), também com Rita Lobo", "fraca", "nota", 0.075),
    ]


def test_ajuste_fica_no_arquivo_e_normal_desfaz(banco):
    saida = banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "nada")
    assert (saida["ajuste"]["elo"], saida["ajuste"]["nivel"], saida["novo"]) == ("elenco", "nada", True)
    arquivo = Path(banco.env["FILMES_DADOS"]) / "pessoas" / "bruno.md"
    frente, _ = ler_markdown(arquivo)
    assert frente["ajustes"] == [{"elo": "elenco", "nivel": "nada", "data": "2026-11-20"}]
    assert banco.ok("pessoa", "ver", "bruno")["ajustes"][0]["nivel"] == "nada"

    assert banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "normal")["novo"] is True

    frente, _ = ler_markdown(arquivo)
    assert "ajustes" not in frente
    assert banco.ok("pessoa", "ver", "bruno")["ajustes"] == []
    assert _do_bruno(_todos(banco), "Voo Noturno")[0][1] == "moderada"


def test_ajuste_vale_depois_de_reconstruir(banco):
    banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "nada")
    banco.ok("reconstruir")

    assert banco.consultar("SELECT pessoa, elo, nivel FROM ajustes") == [["bruno", "elenco", "nada"]]


def test_novo_ajuste_do_mesmo_elo_substitui_o_anterior(banco):
    banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "nada")
    banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "muito")

    assert [a["nivel"] for a in banco.ok("pessoa", "ver", "bruno")["ajustes"]] == ["muito"]
    # "muito" multiplica o peso por 1,5 sem subir a Força.
    assert _do_bruno(_todos(banco), "Voo Noturno")[0] == (
        "deu 4,5 a Ponte Aérea (2016), também com Rita Lobo", "moderada", "nota", 0.45)


def test_declarado_sobre_o_ator_vence_o_ajuste(banco):
    banco.ok("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "nada")
    banco.ok("pessoa", "declarar", "bruno", "adoro o Davi Couto", "--entidade", "Q9001803", "--reacao", "gosta")

    [linha] = _do_bruno(_todos(banco), "Risos de Domingo")
    assert linha[1:3] == ("forte", "declarado")


def test_elo_ou_nivel_fora_da_lista_e_uso_invalido(banco):
    assert banco.rodar("pessoa", "ajustar", "bruno", "--elo", "trilha", "--nivel", "nada")[0] == 2
    assert banco.rodar("pessoa", "ajustar", "bruno", "--elo", "elenco", "--nivel", "zero")[0] == 2


def _com_corte(banco, tmp_path, n):
    pesos = tmp_path / "pesos.toml"
    texto = Path("config/pesos.toml").read_text(encoding="utf-8")
    assert "\nevidencias_maximas = 5\n" in texto
    pesos.write_text(texto.replace("\nevidencias_maximas = 5\n", f"\nevidencias_maximas = {n}\n"), encoding="utf-8")
    banco.env["FILMES_PESOS"] = str(pesos)


def _sigmoide(soma):
    return round(1 / (1 + math.exp(-soma)), 4)


def test_so_as_n_evidencias_mais_fortes_somam_na_utilidade(banco, tmp_path):
    _com_corte(banco, tmp_path, 1)
    filme = _filme(_todos(banco), "As Horas Lentas")
    contribuicoes = [e["contribuicao"] for e in filme["evidencias"]["bruno"]]
    assert len(contribuicoes) > 1

    assert filme["utilidade"]["bruno"] == _sigmoide(max(contribuicoes, key=abs))


def test_ja_visto_fica_fora_do_corte_e_sempre_conta(banco, tmp_path):
    _com_corte(banco, tmp_path, 1)
    filme = _filme(_todos(banco), "O Farol de Areia")
    evidencias = filme["evidencias"]["bruno"]
    [ja_viu] = [e["contribuicao"] for e in evidencias if e["texto"] == "já viu"]
    outras = [e["contribuicao"] for e in evidencias if e["texto"] != "já viu"]
    assert outras

    assert filme["utilidade"]["bruno"] == _sigmoide(ja_viu + max(outras, key=abs))
