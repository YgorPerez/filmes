"""Configuração e caminhos de uma execução da CLI.

Caminhos vêm de variável de ambiente ou de `config/local.toml` (fora do git),
nesta ordem:

    FILMES_DADOS      repo de dados (Pessoas, Sessões)        [caminhos] dados
    FILMES_CATALOGO   dumps fixados e tabelas prontas em CSV   [caminhos] catalogo
    FILMES_VERSOES    manifesto dos dumps                   [caminhos] versoes
    FILMES_BANCO      SQLite derivado                          [caminhos] banco
    FILMES_PESOS      config de pesos (padrão: config/pesos.toml)
    FILMES_HOJE       data de hoje (AAAA-MM-DD), para os testes
    FILMES_LOCAL      outro config/local.toml (os testes apontam para um que não existe)
    FILMES_CACHE      cache das fontes sob demanda (padrão: <banco>-cache.sqlite)
    FILMES_GRAVACOES  respostas gravadas das fontes, no lugar da rede (os testes usam)
    FILMES_AVALIACOES pasta dos relatórios de `avaliar` (padrão: docs/avaliacoes)
"""

import datetime as dt
import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

from filmes.erros import ErroFilmes

RAIZ = Path(__file__).resolve().parents[1]
PESOS_PADRAO = RAIZ / "config" / "pesos.toml"
LOCAL = RAIZ / "config" / "local.toml"


@dataclass(frozen=True)
class Ambiente:
    pesos: dict
    hoje: dt.date
    _caminhos: dict

    @classmethod
    def carregar(cls) -> "Ambiente":
        arquivo_local = Path(os.environ.get("FILMES_LOCAL") or LOCAL)
        local = ler_toml(arquivo_local).get("caminhos", {}) if arquivo_local.exists() else {}
        armazenamento = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "filmes"
        caminhos = {
            "dados": os.environ.get("FILMES_DADOS") or local.get("dados"),
            "catalogo": os.environ.get("FILMES_CATALOGO") or local.get("catalogo") or str(armazenamento / "catalogo"),
            "versoes": os.environ.get("FILMES_VERSOES") or local.get("versoes") or str(RAIZ / "config" / "versoes-catalogo.json"),
            "banco": os.environ.get("FILMES_BANCO") or local.get("banco") or str(armazenamento / "filmes.sqlite"),
            "cache": os.environ.get("FILMES_CACHE"),
            "gravacoes": os.environ.get("FILMES_GRAVACOES"),
            "avaliacoes": os.environ.get("FILMES_AVALIACOES") or str(RAIZ / "docs" / "avaliacoes"),
        }
        pesos = ler_toml(Path(os.environ.get("FILMES_PESOS") or PESOS_PADRAO))
        hoje = os.environ.get("FILMES_HOJE")
        try:
            data = dt.date.fromisoformat(hoje) if hoje else dt.date.today()
        except ValueError:
            raise ErroFilmes("config_invalida", f"FILMES_HOJE inválido: {hoje!r}")
        return cls(pesos=pesos, hoje=data, _caminhos=caminhos)

    def caminho(self, nome: str) -> Path:
        valor = self._caminhos.get(nome)
        if not valor:
            raise ErroFilmes(
                "config_ausente",
                f"caminho '{nome}' não configurado: defina FILMES_{nome.upper()} ou [caminhos] {nome} em config/local.toml",
            )
        return Path(valor)

    @property
    def dados(self) -> Path:
        return self.caminho("dados")

    @property
    def catalogo(self) -> Path:
        return self.caminho("catalogo")

    @property
    def versoes(self) -> Path:
        return self.caminho("versoes")

    @property
    def banco(self) -> Path:
        return self.caminho("banco")

    @property
    def cache(self) -> Path:
        """Cache das fontes sob demanda, ao lado do banco se nada disser outro lugar."""
        if self._caminhos.get("cache"):
            return Path(self._caminhos["cache"])
        return self.banco.with_name(f"{self.banco.stem}-cache.sqlite")

    @property
    def gravacoes(self) -> Path | None:
        """Pasta de respostas gravadas que substituem a rede, ou None."""
        valor = self._caminhos.get("gravacoes")
        return Path(valor) if valor else None

    @property
    def avaliacoes(self) -> Path:
        return self.caminho("avaliacoes")


def ler_toml(caminho: Path) -> dict:
    """Lê um TOML de config; arquivo ausente ou inválido vira ErroFilmes."""
    try:
        with open(caminho, "rb") as f:
            return tomllib.load(f)
    except FileNotFoundError:
        raise ErroFilmes("config_ausente", f"arquivo de config não encontrado: {caminho}")
    except tomllib.TOMLDecodeError as erro:
        raise ErroFilmes("config_invalida", f"{caminho}: {erro}")
