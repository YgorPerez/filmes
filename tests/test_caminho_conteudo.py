"""Caminho de conteúdo por roteiro, elenco, série e gênero, além do diretor.

Na fixture (veja o LEIAME), cada filme novo de 1901 a 1904 liga a Notas do
Bruno por um predicado só:
- Maré Cheia: roteiro de Ana Ruiz, que escreveu O Farol de Areia (5);
- Voo Noturno: Rita Lobo no elenco, como em Ponte Aérea (4,5);
- Fronteira II: da Trilogia da Fronteira, com Fronteira (5 em 2019);
- Poeira: faroeste, como O Farol de Areia, Maré Baixa, Cidade de Vidro e Jardim Suspenso;
- Escala em Lisboa: também com Rita Lobo, mas fora dos 3 primeiros créditos do IMDb;
- Mar Aberto: na mesma lista que Fronteira, "Os 100 melhores filmes segundo a
  Revista Tela", que o Wikidata põe em P179 mas não é série nem franquia.

Os pesos de config/pesos.toml são roteiro 0,8, elenco 0,5, série 1,0 e gênero 0,3.
"""

from pathlib import Path


def _do_bruno(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return [(e["texto"], e["forca"], e["tipo"], e["contribuicao"]) for e in filme["evidencias"]["bruno"]]


def _todos(banco):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "100")


def test_roteirista_em_comum_liga_a_nota_ao_candidato_no_maximo_moderado(banco):
    # A semente de 5 seria forte; roteiro tem teto moderado (decisão do Dono, 2026-11-22).
    assert _do_bruno(_todos(banco), "Maré Cheia") == [
        ("deu 5 a O Farol de Areia (2012), também escrito por Ana Ruiz", "moderada", "nota", 0.48),
        ("escrito por Ana Ruiz, como 1 filme a que deu 4 ou mais: O Farol de Areia (2012)", "fraca", "metadado", 0.24),
    ]


def test_ator_em_comum_liga_a_nota_ao_candidato_no_maximo_moderado(banco):
    # Ter amado um filme com o mesmo ator não prova que o ator foi o motivo: teto moderado.
    assert _do_bruno(_todos(banco), "Voo Noturno") == [
        ("deu 4,5 a Ponte Aérea (2016), também com Rita Lobo", "moderada", "nota", 0.3),
        ("com Rita Lobo no elenco, como 1 filme a que deu 4 ou mais: Ponte Aérea (2016)", "fraca", "metadado", 0.15),
    ]


def test_ator_fora_dos_tres_primeiros_creditos_do_imdb_fica_no_maximo_fraco(banco):
    # Em Voo Noturno, Rita Lobo é o segundo crédito do IMDb e só o teto do elo vale (teste acima).
    # Em Escala em Lisboa, ela é coadjuvante: a semente de 4,5 seria forte.
    assert sorted(_do_bruno(_todos(banco), "Escala em Lisboa")) == [
        ("com Rita Lobo no elenco, como 1 filme a que deu 4 ou mais: Ponte Aérea (2016)", "fraca", "metadado", 0.15),
        ("deu 4,5 a Ponte Aérea (2016), também com Rita Lobo", "fraca", "nota", 0.15),
    ]


def test_serie_em_comum_liga_a_nota_ao_candidato(banco):
    # A Nota em Fronteira tem mais de 5 anos: semente moderada.
    assert _do_bruno(_todos(banco), "Fronteira II") == [
        ("deu 5 a Fronteira (2008), também da série Trilogia da Fronteira", "moderada", "nota", 0.6),
        ("da série Trilogia da Fronteira, como 1 filme a que deu 4 ou mais: Fronteira (2008)", "fraca", "metadado", 0.3),
    ]


def test_lista_no_p179_nao_conta_como_serie(banco):
    textos = [e[0] for e in _do_bruno(_todos(banco), "Mar Aberto")]
    assert not [t for t in textos if "série" in t]


def test_genero_em_comum_fica_no_maximo_fraco_e_nao_vira_semente(banco):
    # Quatro Notas altas no gênero dariam metadado forte em outro predicado.
    assert _do_bruno(_todos(banco), "Poeira") == [
        ("do gênero faroeste, como 4 filmes a que deu 4 ou mais, entre eles O Farol de Areia (2012), "
         "Maré Baixa (2015) e Cidade de Vidro (2018)", "fraca", "metadado", 0.09),
    ]


def test_predicado_fora_da_config_nao_entra_no_caminho(banco, tmp_path):
    pesos = tmp_path / "pesos.toml"
    texto = Path("config/pesos.toml").read_text(encoding="utf-8")
    assert "\nroteiro = 0.8\n" in texto
    pesos.write_text(texto.replace("\nroteiro = 0.8\n", "\n"), encoding="utf-8")
    banco.env["FILMES_PESOS"] = str(pesos)

    assert _do_bruno(_todos(banco), "Maré Cheia") == [("sem fato", "fraca", "palpite", 0)]
