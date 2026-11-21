"""Caminho de conteúdo de 1 salto: Nota da Pessoa -> entidade -> Candidato.

Para cada Candidato ligado a uma entidade (por ora só o diretor) de um filme a
que a Pessoa deu Nota, saem duas espécies de Evidência:

- uma de Tipo nota por Nota-semente, com Força pela régua de Nota (valor e idade);
- uma de Tipo metadado para a entidade, se houver Nota alta, com Força pelo
  número de Notas altas da Pessoa no mesmo nó.

Os predicados usados e os pesos estão em [caminho.peso] da config.
"""

from collections import defaultdict

from filmes.erros import ErroFilmes
from filmes.evidencia import Evidencia, regua, texto

# Como cada predicado aparece no texto. Um predicado novo na config precisa de linha aqui.
_REDACAO = {
    "diretor": {
        "semente": "deu {nota} a {filme}, também de {entidade}",
        "no": "dirigido por {entidade}, como {n} {filmes} a que deu 4 ou mais: {lista}",
    },
}

_SQL = """
SELECT c.filme_id  AS candidato,
       c.fato_id   AS aresta_fato, c.fonte AS aresta_fonte, c.data AS aresta_data,
       e.rotulo    AS entidade,
       n.fato_id   AS nota_fato, n.nota, n.data AS nota_data, n.fonte AS nota_fonte,
       f.titulo, f.ano
FROM notas_vigentes n
JOIN arestas s   ON s.filme_id = n.filme_id AND s.predicado = :predicado
JOIN arestas c   ON c.entidade_id = s.entidade_id AND c.predicado = :predicado AND c.filme_id <> n.filme_id
JOIN entidades e ON e.id = s.entidade_id
JOIN filmes f    ON f.id = n.filme_id
WHERE n.pessoa = :pessoa
ORDER BY c.filme_id, e.id, n.nota DESC, f.titulo
"""


def sinais(rodada, pessoa):
    sementes_vistas = {}
    for predicado, peso in rodada.pesos["caminho"]["peso"].items():
        if predicado not in _REDACAO:
            raise ErroFilmes("config_invalida", f"[caminho.peso] {predicado}: o caminho de conteúdo não sabe redigir esse predicado")
        redacao = _REDACAO[predicado]
        nos = defaultdict(list)
        for linha in rodada.conn.execute(_SQL, {"predicado": predicado, "pessoa": pessoa}):
            if linha["candidato"] in rodada.candidatos:
                nos[(linha["candidato"], linha["aresta_fato"])].append(linha)

        for (candidato, _), sementes in nos.items():
            primeira = sementes[0]
            for s in sementes:
                forca, direcao = regua.forca_nota(s["nota"], s["nota_data"], rodada.hoje)
                evidencia = Evidencia(
                    pessoa=pessoa, filme_id=candidato,
                    texto=redacao["semente"].format(
                        nota=texto.nota(s["nota"]), filme=texto.filme(s["titulo"], s["ano"]), entidade=s["entidade"]),
                    fonte=s["nota_fonte"], data=s["nota_data"], forca=forca, tipo="nota",
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
                    texto=redacao["no"].format(
                        entidade=primeira["entidade"], n=len(altas),
                        filmes="filme" if len(altas) == 1 else "filmes",
                        lista=texto.lista([texto.filme(s["titulo"], s["ano"]) for s in altas])),
                    fonte=primeira["aresta_fonte"], data=primeira["aresta_data"], forca=forca, tipo="metadado",
                    fato_id=primeira["aresta_fato"], base=peso,
                )
    yield from sementes_vistas.values()
