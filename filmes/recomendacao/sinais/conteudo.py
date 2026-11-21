"""Caminho de conteúdo de 1 salto: Nota da Pessoa -> entidade -> Candidato.

Para cada Candidato ligado a uma entidade (diretor, roteirista, ator, série,
gênero) de um filme a que a Pessoa deu Nota, saem duas espécies de Evidência:

- uma por Nota-semente, com Força pela régua de Nota (valor e idade). Uma Nota
  declarada ("amo" vira 5, "odeio" vira 1) é semente de Tipo declarado, ou relato
  se veio do Dono, com Força pela régua de Declarado e Relato;
- uma de Tipo metadado para a entidade, se houver Nota alta, com Força pelo
  número de Notas altas da Pessoa no mesmo nó.

Gênero só dá a segunda, e no máximo fraca (régua). Um gênero junta milhares de
filmes: uma Evidência por Nota nele somaria dezenas de Motivos que pouco dizem
sobre o Candidato.

Os predicados usados e os pesos estão em [caminho.peso] da config.
"""

from collections import defaultdict

from filmes.erros import ErroFilmes
from filmes.evidencia import Evidencia, regua, texto

# Como cada predicado aparece no texto. Um predicado novo na config precisa de linha aqui.
# "semente" None: o predicado não faz Nota-semente.
_REDACAO = {
    "diretor": {"semente": "também de {entidade}", "no": "dirigido por {entidade}"},
    "roteiro": {"semente": "também escrito por {entidade}", "no": "escrito por {entidade}"},
    "elenco": {"semente": "também com {entidade}", "no": "com {entidade} no elenco"},
    "serie": {"semente": "também da série {entidade}", "no": "da série {entidade}"},
    "genero": {"semente": None, "no": "do gênero {entidade}"},
}

# Quantos filmes a linha do nó nomeia; acima disso, diz "entre eles".
_LISTA_MAXIMA = 3

# As Notas da Pessoa em filmes ligados a cada entidade do predicado.
_SQL_SEMENTES = """
SELECT s.entidade_id, s.filme_id, e.rotulo AS entidade,
       n.fato_id AS nota_fato, n.nota, n.data AS nota_data, n.fonte AS nota_fonte,
       n.tipo AS nota_tipo, n.sessao AS nota_sessao,
       f.titulo, f.ano
FROM notas_vigentes n
JOIN arestas s   ON s.filme_id = n.filme_id AND s.predicado = :predicado
JOIN entidades e ON e.id = s.entidade_id
JOIN filmes f    ON f.id = n.filme_id
WHERE n.pessoa = :pessoa
ORDER BY s.entidade_id, n.nota DESC, f.titulo
"""

# Os filmes ligados a essas entidades: os Candidatos do caminho.
_SQL_ARESTAS = """
SELECT c.filme_id AS candidato, c.entidade_id, c.fato_id, c.fonte, c.data
FROM arestas c
WHERE c.predicado = :predicado AND c.entidade_id IN (
    SELECT s.entidade_id FROM notas_vigentes n
    JOIN arestas s ON s.filme_id = n.filme_id AND s.predicado = :predicado
    WHERE n.pessoa = :pessoa
)
ORDER BY c.filme_id, c.entidade_id
"""


def sinais(rodada, pessoa):
    sementes_vistas = {}
    for predicado, peso in rodada.pesos["caminho"]["peso"].items():
        if predicado not in _REDACAO:
            raise ErroFilmes("config_invalida", f"[caminho.peso] {predicado}: o caminho de conteúdo não sabe redigir esse predicado")
        redacao = _REDACAO[predicado]
        parametros = {"predicado": predicado, "pessoa": pessoa}
        por_entidade = defaultdict(list)
        for linha in rodada.conn.execute(_SQL_SEMENTES, parametros):
            por_entidade[linha["entidade_id"]].append(linha)

        for aresta in rodada.conn.execute(_SQL_ARESTAS, parametros):
            candidato = aresta["candidato"]
            if candidato not in rodada.candidatos:
                continue
            sementes = [s for s in por_entidade[aresta["entidade_id"]] if s["filme_id"] != candidato]
            if not sementes:
                continue
            entidade = sementes[0]["entidade"]
            for s in sementes if redacao["semente"] else ():
                tipo = s["nota_tipo"]
                forca, direcao = regua.forca_semente(tipo, s["nota"], s["nota_data"], rodada.hoje,
                                                     de_feedback=s["nota_sessao"] is not None)
                inicio = texto.semente(tipo, s["nota"], texto.filme(s["titulo"], s["ano"]))
                evidencia = Evidencia(
                    pessoa=pessoa, filme_id=candidato,
                    texto=f"{inicio}, {redacao['semente'].format(entidade=entidade)}",
                    fonte=s["nota_fonte"], data=s["nota_data"], forca=forca, tipo=tipo,
                    fato_id=s["nota_fato"], base=peso * direcao,
                )
                # A mesma Nota pode ligar ao Candidato por mais de um nó: vale a ligação mais forte.
                chave = (candidato, s["nota_fato"])
                anterior = sementes_vistas.get(chave)
                if anterior is None or abs(evidencia.contribuicao(rodada.pesos)) > abs(anterior.contribuicao(rodada.pesos)):
                    sementes_vistas[chave] = evidencia

            altas = [s for s in sementes if s["nota"] >= regua.NOTA_ALTA]
            forca = regua.forca_caminho(len(altas), predicado)
            if forca:
                yield Evidencia(
                    pessoa=pessoa, filme_id=candidato,
                    texto=f"{redacao['no'].format(entidade=entidade)}, {_notas_altas(altas)}",
                    fonte=aresta["fonte"], data=aresta["data"], forca=forca, tipo="metadado",
                    fato_id=aresta["fato_id"], base=peso,
                )
    yield from sementes_vistas.values()


def _notas_altas(altas) -> str:
    n = len(altas)
    filmes = [texto.filme(s["titulo"], s["ano"]) for s in altas[:_LISTA_MAXIMA]]
    nota = texto.nota(regua.NOTA_ALTA)
    inicio = f"como {n} {'filme' if n == 1 else 'filmes'} a que deu {nota} ou mais"
    if n > _LISTA_MAXIMA:
        return f"{inicio}, entre eles {texto.lista(filmes)}"
    return f"{inicio}: {texto.lista(filmes)}"
