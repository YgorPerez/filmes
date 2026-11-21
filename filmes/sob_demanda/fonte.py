"""Uma fonte sob demanda: cache primeiro, depois a API, e degradação com aviso.

Cada cliente (omdb.py, ddd.py) herda de `Fonte` e diz como buscar na rede.
Regras comuns:

- A chave da API vem de uma variável de ambiente. Sem ela, a fonte avisa uma
  vez e responde None para tudo; a Recomendação segue sem ela.
- Uma falha de rede também avisa uma vez e desliga a fonte até o fim da execução,
  para não esperar o tempo limite em cada filme.
- O que a API respondeu, inclusive "não achei", vai para o cache com a validade
  da fonte. Falha não vai.
- Com `FILMES_GRAVACOES=<pasta>`, a "rede" é `<pasta>/<fonte>/<chave>.json`, e
  arquivo ausente é "não achei". É assim que os testes rodam sem rede.
"""

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from filmes.sob_demanda.cache import Cache, Registro, caminho

TEMPO_LIMITE = 10  # segundos por requisição


class FalhaDaFonte(Exception):
    """A fonte não respondeu como devia: rede, chave recusada, limite de uso."""


class Fonte:
    nome: str            # como aparece na Evidência e nos avisos: "OMDb"
    pasta: str           # nome curto: chave no cache e pasta das gravações
    variavel_chave: str  # FILMES_OMDB_CHAVE
    validade_dias: int

    def __init__(self, contexto):
        self.contexto = contexto
        self.desligada = False

    @classmethod
    def de(cls, contexto):
        """A instância desta fonte para a execução, criada no primeiro uso."""
        if cls.pasta not in contexto.fontes:
            contexto.fontes[cls.pasta] = cls(contexto)
        return contexto.fontes[cls.pasta]

    def obter(self, chave: str) -> Registro | None:
        cache = _cache(self.contexto)
        hoje = self.contexto.amb.hoje
        registro = cache.ler(self.pasta, chave, hoje)
        if registro is not None or self.desligada:
            return registro
        api = os.environ.get(self.variavel_chave)
        if not api:
            self._desligar(f"{self.nome} sem chave de API (defina {self.variavel_chave}); {self.sem_a_fonte}")
            return None
        try:
            corpo = self._da_gravacao(chave) if os.environ.get("FILMES_GRAVACOES") else self.buscar(chave, api)
        except FalhaDaFonte as falha:
            self._desligar(f"{self.nome} não respondeu ({falha}); {self.sem_a_fonte}")
            return None
        return cache.gravar(self.pasta, chave, corpo, hoje, self.validade_dias)

    # O que cada cliente define:
    sem_a_fonte: str = ""  # o que acontece com a Recomendação sem esta fonte, para o aviso

    def buscar(self, chave: str, api: str) -> dict:
        raise NotImplementedError

    def nao_encontrado(self) -> dict:
        raise NotImplementedError

    def _da_gravacao(self, chave):
        arquivo = Path(os.environ["FILMES_GRAVACOES"]) / self.pasta / f"{chave}.json"
        if not arquivo.exists():
            return self.nao_encontrado()
        return json.loads(arquivo.read_text(encoding="utf-8"))

    def _desligar(self, aviso):
        self.desligada = True
        self.contexto.avisos.append(aviso)


def pegar_json(url: str, cabecalhos: dict | None = None) -> dict | list | None:
    """GET que devolve o JSON, None para 404, e FalhaDaFonte para o resto."""
    pedido = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "filmes", **(cabecalhos or {})})
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resposta:
            return json.load(resposta)
    except urllib.error.HTTPError as erro:
        if erro.code == 404:
            return None
        raise FalhaDaFonte(f"HTTP {erro.code}") from erro
    except (urllib.error.URLError, TimeoutError, OSError) as erro:
        raise FalhaDaFonte(str(getattr(erro, "reason", erro))) from erro
    except json.JSONDecodeError as erro:
        raise FalhaDaFonte("resposta não é JSON") from erro


def _cache(contexto) -> Cache:
    if "_cache" not in contexto.fontes:
        contexto.fontes["_cache"] = Cache(caminho(contexto.amb))
    return contexto.fontes["_cache"]
