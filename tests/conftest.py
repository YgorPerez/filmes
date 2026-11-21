"""Costura única dos testes: a CLI `python -m filmes ... --json` sobre a fixture.

Os testes não importam nada de `filmes`. Cada teste ganha um repo de dados
copiado da fixture num diretório temporário e um banco próprio.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

RAIZ = Path(__file__).resolve().parents[1]
FIXTURE = Path(__file__).resolve().parent / "fixture"
HOJE = "2026-11-20"


def ler_markdown(caminho):
    """Frontmatter (dict) e corpo de um arquivo do repo de dados."""
    texto = caminho.read_text(encoding="utf-8")
    assert texto.startswith("---\n"), caminho
    _, frente, corpo = texto.split("---\n", 2)
    return yaml.safe_load(frente), corpo


class Cli:
    def __init__(self, env):
        self.env = env

    def rodar(self, *args):
        """Roda a CLI e devolve (código de saída, JSON da saída)."""
        proc = subprocess.run(
            [sys.executable, "-m", "filmes", *args, "--json"],
            cwd=RAIZ, env=self.env, capture_output=True, text=True,
        )
        saida = proc.stdout if proc.stdout.strip() else proc.stderr
        try:
            dados = json.loads(saida)
        except json.JSONDecodeError:
            raise AssertionError(f"saída não é JSON (código {proc.returncode}):\n{proc.stdout}\n{proc.stderr}")
        return proc.returncode, dados

    def ok(self, *args):
        """Roda a CLI e exige sucesso."""
        codigo, dados = self.rodar(*args)
        assert codigo == 0, dados
        return dados

    def consultar(self, sql):
        return self.ok("consultar", sql)["linhas"]


@pytest.fixture
def dados(tmp_path):
    """Repo de dados fictício, copiado para poder ser escrito pelos comandos."""
    destino = tmp_path / "dados"
    shutil.copytree(FIXTURE / "dados", destino)
    return destino


@pytest.fixture
def cli(tmp_path, dados):
    env = {k: v for k, v in os.environ.items() if not k.startswith("FILMES_")}
    env.update(
        FILMES_DADOS=str(dados),
        FILMES_CATALOGO=str(FIXTURE / "catalogo"),
        FILMES_BANCO=str(tmp_path / "filmes.sqlite"),
        FILMES_HOJE=HOJE,
        FILMES_LOCAL=str(tmp_path / "sem-config-local.toml"),
    )
    return Cli(env)


@pytest.fixture
def banco(cli):
    """CLI com o banco já reconstruído a partir da fixture."""
    cli.ok("reconstruir")
    return cli
