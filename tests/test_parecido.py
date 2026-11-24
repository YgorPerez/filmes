"""Algo igual X: `recomendar --parecido`, Restrição da Sessão (#67, spec #70).

Só passam os N mais parecidos com a referência ([parecido] candidatos), contados
antes das outras Restrições e da nota mínima; entre eles, a Regra de escolha
ordena. Os filmes são os `tt90067NN` da fixture (veja o LEIAME).
"""

from pathlib import Path

from conftest import sem_o_da_capa

ESCREVER_CARTAS = "tt9006701"   # referência no genoma, nas tags e nos vizinhos
ESTRADA_AFORA = "tt9006702"     # referência fora do genoma
MESA_DE_DOMINGO = "tt9006711"
RASCUNHO = "tt9006712"
PE_NA_ESTRADA = "tt9006713"
QUASE_IGUAL = "tt9006714"       # nota 6,5: abaixo da mínima
TINTA_E_PAPEL = "tt9006716"     # fora do genoma, mesmas tags da referência


def _ids(saida):
    return [f["id"] for f in saida["filmes"]]


def _com_pesos(cli, tmp_path, candidatos):
    pesos = tmp_path / "pesos-parecido.toml"
    texto = Path("config/pesos.toml").read_text(encoding="utf-8")
    assert "\ncandidatos = 50\n" in texto
    pesos.write_text(texto.replace("\ncandidatos = 50\n", f"\ncandidatos = {candidatos}\n"), encoding="utf-8")
    cli.env["FILMES_PESOS"] = str(pesos)


def test_parecido_so_traz_os_parecidos_e_a_regra_ordena(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10", "--parecido", ESCREVER_CARTAS)

    # Nenhum tem Fato para o Bruno: os votos ordenam, não a parecença (Tinta e Papel é
    # o mais parecido e vem por último). Quase Igual está abaixo da nota mínima.
    assert _ids(saida) == [MESA_DE_DOMINGO, PE_NA_ESTRADA, RASCUNHO, TINTA_E_PAPEL]
    assert saida["restricoes"]["parecido"]["filmes"] == [ESCREVER_CARTAS]


def test_corta_nos_mais_parecidos_contados_antes_da_nota_minima_e_avisa(banco, tmp_path):
    # Os 3 mais parecidos com Escrever Cartas: Tinta e Papel, Mesa de Domingo e Quase Igual,
    # que fica abaixo da nota mínima. A vaga dela não vai para Rascunho, o quarto.
    _com_pesos(banco, tmp_path, 3)

    saida = banco.ok("recomendar", "--presentes", "dono", "--parecido", ESCREVER_CARTAS)

    assert _ids(saida) == [MESA_DE_DOMINGO, TINTA_E_PAPEL]
    assert "só 2 parecidos com Escrever Cartas passaram nas Restrições" in sem_o_da_capa(saida["avisos"])


def test_fonte_que_falta_redistribui_o_peso(banco, tmp_path):
    # Tinta e Papel não está no genoma, mas tem as mesmas tags e os mesmos gêneros da
    # referência: sem o genoma no par, ela é a mais parecida de todas.
    _com_pesos(banco, tmp_path, 1)

    saida = banco.ok("recomendar", "--presentes", "dono", "--parecido", ESCREVER_CARTAS)

    assert _ids(saida) == [TINTA_E_PAPEL]


def test_referencia_sem_genoma_e_comparada_pelas_outras_fontes(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--parecido", ESTRADA_AFORA)

    assert _ids(saida) == [PE_NA_ESTRADA]
    [linha] = saida["filmes"][0]["linhas_do_filme"][:1]
    assert linha["texto"] == "parecido com Estrada Afora: road trip"


def test_linha_parecido_com_temas_em_comum_fora_das_evidencias(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10", "--parecido", ESCREVER_CARTAS)

    mesa = next(f for f in saida["filmes"] if f["id"] == MESA_DE_DOMINGO)
    [linha] = [l for l in mesa["linhas_do_filme"] if l["texto"].startswith("parecido com")]
    assert linha["texto"] == ("parecido com Escrever Cartas: family, writers, bittersweet; "
                              "de 500 pessoas que deram 4+ a ele, 40% deram 4+ a este")
    assert linha["pessoa"] is None
    assert linha["contribuicao"] == 0
    assert mesa["evidencias"] == {"bruno": [e for e in mesa["evidencias"]["bruno"] if e["texto"] == "sem fato"]}
    assert mesa["so_palpites"] is True


def test_duas_referencias_trazem_os_parecidos_de_cada_uma(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10",
                     "--parecido", ESCREVER_CARTAS, ESTRADA_AFORA)

    assert ESCREVER_CARTAS not in _ids(saida) and ESTRADA_AFORA not in _ids(saida)
    pe = next(f for f in saida["filmes"] if f["id"] == PE_NA_ESTRADA)
    textos = [l["texto"] for l in pe["linhas_do_filme"] if l["texto"].startswith("parecido com")]
    assert textos == ["parecido com Escrever Cartas: de 500 pessoas que deram 4+ a ele, 10% deram 4+ a este",
                      "parecido com Estrada Afora: road trip"]
    assert {MESA_DE_DOMINGO, TINTA_E_PAPEL} <= set(_ids(saida))


def test_a_referencia_nunca_entra(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10",
                     "--parecido", ESCREVER_CARTAS, MESA_DE_DOMINGO)

    assert MESA_DE_DOMINGO not in _ids(saida)
    assert TINTA_E_PAPEL in _ids(saida)


def test_parecido_fora_do_catalogo_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--parecido", "tt0000001")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"
    assert "tt0000001" in saida["erro"]["mensagem"]


def test_parecido_nao_grava_gosto(banco, dados):
    antes = {p.name: p.read_text(encoding="utf-8") for p in (dados / "pessoas").iterdir()}

    banco.ok("recomendar", "--presentes", "dono", "--parecido", ESCREVER_CARTAS)

    assert {p.name: p.read_text(encoding="utf-8") for p in (dados / "pessoas").iterdir()} == antes
