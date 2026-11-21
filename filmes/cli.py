"""Ponto de entrada da CLI e contrato de saída.

Cada comando é um módulo em `filmes/comandos/`, achado pelo nome do arquivo
(`sessoes_abertas.py` vira `sessoes-abertas`). Um módulo de comando define:

    AJUDA = "uma linha"
    def configurar(parser): ...        # argumentos do comando
    def executar(args, amb) -> dict    # devolve o JSON de saída

Nada aqui precisa mudar para acrescentar um comando.
"""

import argparse
import importlib
import json
import pkgutil
import sys

from filmes import comandos
from filmes.ambiente import Ambiente
from filmes.erros import ErroFilmes


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ErroFilmes("uso_invalido", message)


def _modulos_de_comando():
    for info in sorted(pkgutil.iter_modules(comandos.__path__), key=lambda m: m.name):
        if info.name.startswith("_"):
            continue
        yield info.name.replace("_", "-"), importlib.import_module(f"filmes.comandos.{info.name}")


def _parser():
    parser = _Parser(prog="python -m filmes", description="Motor do recomendador de filmes.")
    sub = parser.add_subparsers(dest="comando", required=True, parser_class=_Parser)
    for nome, modulo in _modulos_de_comando():
        p = sub.add_parser(nome, help=modulo.AJUDA, description=modulo.AJUDA)
        p.add_argument("--json", action="store_true", help="saída JSON compacta numa linha")
        modulo.configurar(p)
        p.set_defaults(_executar=modulo.executar)
    return parser


def _escrever(dados, compacto, fluxo):
    if compacto:
        fluxo.write(json.dumps(dados, ensure_ascii=False) + "\n")
    else:
        fluxo.write(json.dumps(dados, ensure_ascii=False, indent=2) + "\n")


def main(argv):
    compacto = "--json" in argv
    try:
        args = _parser().parse_args(argv)
        saida = args._executar(args, Ambiente.carregar())
    except ErroFilmes as erro:
        _escrever(erro.como_json(), compacto, sys.stdout)
        return 2 if erro.codigo == "uso_invalido" else 1
    except Exception as erro:  # o contrato vale até para o que ninguém previu
        _escrever(ErroFilmes("interno", f"{type(erro).__name__}: {erro}").como_json(), compacto, sys.stdout)
        return 1
    _escrever(saida, compacto, sys.stdout)
    return 0
