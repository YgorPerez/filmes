"""Costura única dos testes: a CLI `python -m filmes ... --json` sobre a fixture.

Os testes não importam nada de `filmes`. Cada teste ganha um repo de dados
copiado da fixture num diretório temporário e um banco próprio.

Com `FILMES_ORACLE_TRACE=<arquivo.jsonl>` no ambiente do pytest, cada teste
acrescenta ao arquivo um cenário do oráculo de paridade
(`packages/engine/oracle/`): os passos que ele rodou na CLI, cada um com
argv, stdin, as variáveis `FILMES_*`, os arquivos que o próprio teste mudou
no diretório temporário desde o passo anterior e a saída. Caminhos do
diretório temporário viram `{work}` e os do repo, `{root}`. Desligado, nada
muda.
"""

import base64
import hashlib
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
TRACO = os.environ.get("FILMES_ORACLE_TRACE")


def ler_markdown(caminho):
    """Frontmatter (dict) e corpo de um arquivo do repo de dados."""
    texto = caminho.read_text(encoding="utf-8")
    assert texto.startswith("---\n"), caminho
    _, frente, corpo = texto.split("---\n", 2)
    return yaml.safe_load(frente), corpo


def sem_o_da_capa(avisos):
    """Os avisos de `recomendar` menos o do TMDB, que todo teste sem FILMES_TMDB_CHAVE recebe."""
    return [a for a in avisos if not a.startswith("TMDB ")]


def _fotografia(raiz):
    """sha256 de cada arquivo debaixo de `raiz`, pelo caminho relativo."""
    return {
        caminho.relative_to(raiz).as_posix(): hashlib.sha256(caminho.read_bytes()).hexdigest()
        for caminho in sorted(raiz.rglob("*"))
        if caminho.is_file()
    }


class _Traco:
    """Os passos de um teste, para o oráculo de paridade."""

    def __init__(self, raiz):
        self.raiz = raiz
        self.antes = _fotografia(raiz)
        self.passos = []

    def _sem_caminhos(self, texto):
        return texto.replace(str(self.raiz), "{work}").replace(str(RAIZ), "{root}")

    def mudancas(self):
        """O que o teste mudou desde o último passo: o conteúdo em base64, ou None se apagou."""
        agora = _fotografia(self.raiz)
        arquivos = {
            nome: base64.b64encode((self.raiz / nome).read_bytes()).decode("ascii")
            for nome, hash_ in agora.items()
            if self.antes.get(nome) != hash_
        }
        arquivos.update({nome: None for nome in self.antes if nome not in agora})
        return arquivos

    def passo(self, args, entrada, env, arquivos, codigo, dados):
        self.passos.append({
            "argv": [self._sem_caminhos(a) for a in args],
            "stdin": None if entrada is None else self._sem_caminhos(entrada),
            "env": {k: self._sem_caminhos(v) for k, v in sorted(env.items()) if k.startswith("FILMES_")},
            "files": arquivos,
            "exitCode": codigo,
            "output": json.loads(self._sem_caminhos(json.dumps(dados, ensure_ascii=False))),
        })
        self.antes = _fotografia(self.raiz)

    def gravar(self, cenario):
        if not self.passos:
            return
        with open(TRACO, "a", encoding="utf-8") as arquivo:
            arquivo.write(json.dumps({"id": cenario, "steps": self.passos}, ensure_ascii=False) + "\n")


class Cli:
    def __init__(self, env, traco=None):
        self.env = env
        self.traco = traco

    def rodar(self, *args, entrada=None):
        """Roda a CLI e devolve (código de saída, JSON da saída). `entrada` vai no stdin."""
        args = [str(a) for a in args]
        # O que o teste mudou desde o último passo, lido antes de a CLI rodar.
        arquivos = self.traco.mudancas() if self.traco else None
        proc = subprocess.run(
            [sys.executable, "-m", "filmes", *args, "--json"],
            cwd=RAIZ, env=self.env, capture_output=True, text=True, input=entrada,
        )
        saida = proc.stdout if proc.stdout.strip() else proc.stderr
        try:
            dados = json.loads(saida)
        except json.JSONDecodeError:
            raise AssertionError(f"saída não é JSON (código {proc.returncode}):\n{proc.stdout}\n{proc.stderr}")
        if self.traco:
            self.traco.passo(args, entrada, self.env, arquivos, proc.returncode, dados)
        return proc.returncode, dados

    def ok(self, *args, entrada=None):
        """Roda a CLI e exige sucesso."""
        codigo, dados = self.rodar(*args, entrada=entrada)
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
def cli(tmp_path, dados, request):
    env = {k: v for k, v in os.environ.items() if not k.startswith("FILMES_")}
    env.update(
        FILMES_DADOS=str(dados),
        FILMES_CATALOGO=str(FIXTURE / "catalogo"),
        FILMES_BANCO=str(tmp_path / "filmes.sqlite"),
        FILMES_HOJE=HOJE,
        FILMES_LOCAL=str(tmp_path / "sem-config-local.toml"),
    )
    traco = _Traco(tmp_path) if TRACO else None
    yield Cli(env, traco)
    if traco:
        traco.gravar(request.node.nodeid)


@pytest.fixture
def banco(cli):
    """CLI com o banco já reconstruído a partir da fixture."""
    cli.ok("reconstruir")
    return cli
