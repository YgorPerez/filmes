from pathlib import Path

from filmes.importar import letterboxd

AJUDA = "importa o ZIP do Letterboxd de uma Pessoa"


def configurar(parser):
    parser.add_argument("--pessoa", required=True, help="slug, nome ou apelido da Pessoa")
    parser.add_argument("--letterboxd", required=True, type=Path, help="ZIP exportado pelo Letterboxd")


def executar(args, amb):
    return letterboxd.importar(amb, args.pessoa, args.letterboxd)
