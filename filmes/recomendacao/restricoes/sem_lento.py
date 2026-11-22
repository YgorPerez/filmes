"""Nada lento: só quando o Dono pede, sai o filme de ritmo lento (#57).

A lista é o grupo `lento` de `config/vetos_por_tag.toml`, com os mínimos de
[vetos_por_tag] em `config/pesos.toml`: relevância no Tag Genome ou usuários
no tags.csv do MovieLens. O mesmo grupo serve de alvo para o Veto de uma Pessoa.
"""

from dataclasses import dataclass

from filmes.recomendacao import vetos
from filmes.recomendacao.restricoes import Passa

GRUPO = "lento"


def configurar(parser):
    parser.add_argument("--sem-lento", action="store_true",
                        help="tira os filmes de ritmo lento (grupo lento de config/vetos_por_tag.toml)")


def pedido(args):
    return SemLento() if args.sem_lento else None


def rotulo(gravada):
    return "nada lento"


@dataclass(frozen=True)
class SemLento:
    nome = "sem_lento"

    def como_json(self):
        return {}

    def resultado(self, saidas):
        return {}

    def avaliar(self, contexto, filmes):
        lentos = vetos.marcados_pelo_grupo(contexto.conn, GRUPO, contexto.amb.pesos["vetos_por_tag"])
        return {filme_id: Passa() for filme_id in filmes if filme_id not in lentos}
