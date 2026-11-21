"""Uma fonte sob demanda: cache primeiro, depois a API, e degradação com aviso.

Cada cliente (omdb.py, ddd.py) herda de `Fonte` e diz como buscar na rede.
Regras comuns:

- A chave da API vem de uma variável de ambiente. Sem ela, a fonte avisa uma
  vez e responde None para tudo; a Recomendação segue sem ela.
- Uma falha passageira (conexão recusada ou derrubada, tempo esgotado, HTTP 429
  ou 5xx) é tentada de novo até `TENTATIVAS` vezes, com uma pausa crescente.
  Se persistir, ou se for outra falha, a fonte avisa uma vez e fica desligada até o
  fim da execução, para não esperar o tempo limite em cada filme.
- O que a API respondeu, inclusive "não achei", vai para o cache com a validade
  da fonte. Falha não vai.
- Com `FILMES_GRAVACOES=<pasta>`, a "rede" é `<pasta>/<fonte>/<chave>.json`, e
  arquivo ausente é "não achei". É assim que os testes rodam sem rede. Uma falha
  de rede se grava em `<chave>.falha.json`: `{"motivo": "...", "vezes": N}` falha
  nas N primeiras vezes da execução e depois lê `<chave>.json`; sem `vezes`, falha sempre.
"""

import json
import os
import time
import urllib.error
import urllib.request

from filmes.sob_demanda.cache import Cache, Registro, caminho

TEMPO_LIMITE = 10  # segundos por requisição
TENTATIVAS = 3     # para falha passageira
PAUSA = 2          # segundos antes da segunda tentativa; dobra a cada uma


class FalhaDaFonte(Exception):
    """A fonte não respondeu como devia: rede, chave recusada, limite de uso."""

    def __init__(self, motivo, passageira=False):
        super().__init__(motivo)
        self.passageira = passageira


class Fonte:
    nome: str            # como aparece na Evidência e nos avisos: "OMDb"
    pasta: str           # nome curto: chave no cache e pasta das gravações
    variavel_chave: str  # FILMES_OMDB_CHAVE
    validade_dias: int

    def __init__(self, contexto):
        self.contexto = contexto
        self.desligada = False
        self._falhas_gravadas = {}   # chave -> quantas vezes a falha gravada já aconteceu

    @classmethod
    def de(cls, contexto):
        """A instância desta fonte para a execução, criada no primeiro uso."""
        if cls not in contexto.fontes:
            contexto.fontes[cls] = cls(contexto)
        return contexto.fontes[cls]

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
        gravacoes = self.contexto.amb.gravacoes
        for tentativa in range(TENTATIVAS):
            try:
                corpo = self._da_gravacao(gravacoes, chave) if gravacoes else self.buscar(chave, api)
                break
            except FalhaDaFonte as falha:
                if not falha.passageira or tentativa == TENTATIVAS - 1:
                    self._desligar(f"{self.nome} não respondeu ({falha}); {self.sem_a_fonte}")
                    return None
                if not gravacoes:
                    time.sleep(PAUSA * 2 ** tentativa)
        return cache.gravar(self.pasta, chave, corpo, hoje, self.validade_dias)

    # O que cada cliente define:
    sem_a_fonte: str = ""  # o que acontece com a Recomendação sem esta fonte, para o aviso

    def buscar(self, chave: str, api: str) -> dict:
        raise NotImplementedError

    def nao_encontrado(self) -> dict:
        raise NotImplementedError

    def _da_gravacao(self, gravacoes, chave):
        falha = gravacoes / self.pasta / f"{chave}.falha.json"
        if falha.exists():
            gravada = json.loads(falha.read_text(encoding="utf-8"))
            vezes = self._falhas_gravadas.get(chave, 0)
            if "vezes" not in gravada or vezes < gravada["vezes"]:
                self._falhas_gravadas[chave] = vezes + 1
                raise FalhaDaFonte(gravada["motivo"], passageira=True)
        arquivo = gravacoes / self.pasta / f"{chave}.json"
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
        raise FalhaDaFonte(f"HTTP {erro.code}", passageira=erro.code == 429 or erro.code >= 500) from erro
    except (urllib.error.URLError, TimeoutError, OSError) as erro:
        raise FalhaDaFonte(str(getattr(erro, "reason", erro)), passageira=True) from erro
    except json.JSONDecodeError as erro:
        raise FalhaDaFonte("resposta não é JSON") from erro


def _cache(contexto) -> Cache:
    if "_cache" not in contexto.fontes:
        contexto.fontes["_cache"] = Cache(caminho(contexto.amb))
    return contexto.fontes["_cache"]
