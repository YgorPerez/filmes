"""`FILMES_CONFIG`: a pasta do config (pesos, vocabulários, manifesto, local.toml).

O `db:publish` reconstrói o banco com uma cópia do config migrada para as
chaves em português (ADR 0002), apontada por `FILMES_CONFIG`; o `config/` do
repo é só o padrão.
"""

import shutil

from conftest import RAIZ


def _copia_do_config(tmp_path):
    destino = tmp_path / "config-copia"
    shutil.copytree(RAIZ / "config", destino, ignore=shutil.ignore_patterns("local.toml"))
    return destino


def _climas(saida):
    return [linha["texto"] for filme in saida["filmes"] for linha in filme["linhas_do_filme"]
            if linha["texto"].startswith("Clima ")]


def test_os_vocabularios_vem_da_pasta_de_FILMES_CONFIG(banco, tmp_path):
    config = _copia_do_config(tmp_path)
    with open(config / "climas.toml", "a", encoding="utf-8") as arquivo:
        arquivo.write('\n[feira]\ntags = ["feel-good"]\ngeneros = []\n')
    banco.env["FILMES_CONFIG"] = str(config)

    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "50", "--clima", "feira")

    assert 'Clima feira: 14 usuários do MovieLens marcaram o filme com a tag "feel-good"' in _climas(saida)
    assert not any("feira" in aviso for aviso in saida["avisos"])


def test_sem_FILMES_CONFIG_vale_o_config_do_repo(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "50", "--clima", "feira")

    assert _climas(saida) == []
    assert any("feira" in aviso for aviso in saida["avisos"])

