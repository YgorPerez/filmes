"""Nada triste: só quando o Dono pede, sai o filme triste ou de tema pesado.

Dois sinais, com as listas em `config/tristeza.toml` e os mínimos em
[sem_tristeza] de `config/pesos.toml`:

- triste: tag de tristeza ("sad", "bleak"...) no tags.csv do MovieLens ou no
  Tag Genome;
- tema pesado: tag de tema pesado ("massacre", "suicide"...) nas mesmas duas
  tabelas, ou item do Wikidata (Holocausto, suicídio...) em `tema` ou `baseado_em`.

Filme sem sinal nenhum passa. A falta de tag não prova que ele é leve, por
isso a linha do filme que passou é palpite.
"""

from dataclasses import dataclass

from filmes.ambiente import RAIZ, ler_toml
from filmes.evidencia import Evidencia, regua
from filmes.recomendacao.restricoes import Passa, Sai

VOCABULARIO = RAIZ / "config" / "tristeza.toml"
SINAIS = ("triste", "tema_pesado")


def configurar(parser):
    parser.add_argument("--sem-tristeza", action="store_true",
                        help="tira os filmes tristes ou de tema pesado (config/tristeza.toml)")


def pedido(args):
    return SemTristeza() if args.sem_tristeza else None


def rotulo(gravada):
    return "nada triste"


@dataclass(frozen=True)
class SemTristeza:
    nome = "sem_tristeza"

    def como_json(self):
        return {}

    def resultado(self, saidas):
        """Os filmes tirados por sinal; o filme com os dois sinais conta no primeiro de SINAIS."""
        return {"por_sinal": {sinal: saidas[sinal] for sinal in SINAIS}}

    def avaliar(self, contexto, filmes):
        vocabulario = ler_toml(VOCABULARIO)
        minimos = contexto.amb.pesos["sem_tristeza"]
        achados = {}
        for sinal in SINAIS:
            for filme_id in _marcados(contexto.conn, vocabulario[sinal], minimos, sinal):
                if filme_id in filmes:
                    achados.setdefault(filme_id, sinal)
        com_tags = _com_tags(contexto.conn)
        return {filme_id: Sai(achados[filme_id]) if filme_id in achados else _passa(filme_id, filme_id in com_tags)
                for filme_id in filmes}


def _marcados(conn, lista, minimos, sinal):
    tags = [t.lower() for t in lista.get("tags", [])]
    itens = list(lista.get("wikidata", []))
    usuarios = minimos[f"usuarios_{sinal}"]
    tag_marcas = ",".join("?" * len(tags))
    consultas = [
        (f"SELECT filme_id FROM tags_movielens WHERE tag IN ({tag_marcas}) AND usuarios >= ?", [*tags, usuarios]),
        (f"SELECT filme_id FROM genoma WHERE tag IN ({tag_marcas}) AND relevancia >= ?",
         [*tags, minimos["relevancia_minima"]]),
    ]
    if itens:
        consultas.append((
            f"""SELECT filme_id FROM arestas WHERE predicado IN ('tema', 'baseado_em')
                AND entidade_id IN ({",".join("?" * len(itens))})""", itens))
    for sql, parametros in consultas:
        for (filme_id,) in conn.execute(sql, parametros):
            yield filme_id


def _com_tags(conn):
    return {filme_id for (filme_id,) in conn.execute(
        "SELECT filme_id FROM tags_movielens UNION SELECT filme_id FROM genoma")}


def _passa(filme_id, tem_tags):
    if tem_tags:
        texto = "nada triste: nenhuma tag de tristeza ou de tema pesado no MovieLens, nenhum tema pesado no Wikidata"
    else:
        texto = "nada triste: o filme não tem tags no MovieLens, e o Wikidata não dá tema pesado"
    return Passa((Evidencia(
        pessoa=None, filme_id=filme_id, texto=texto, fonte=None, data=None,
        forca=regua.forca_palpite(), tipo="palpite", fato_id=None, base=0.0,
    ),))
