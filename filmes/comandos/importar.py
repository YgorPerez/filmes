from pathlib import Path

from filmes.importar import letterboxd, trakt

AJUDA = "importa o ZIP do Letterboxd ou do Trakt de uma Pessoa"


def configurar(parser):
    parser.add_argument("--pessoa", required=True, help="slug, nome ou apelido da Pessoa")
    origem = parser.add_mutually_exclusive_group(required=True)
    origem.add_argument("--letterboxd", type=Path, help="ZIP exportado pelo Letterboxd")
    origem.add_argument("--trakt", type=Path, help="ZIP do Raw Export do Trakt")


def executar(args, amb):
    if args.trakt:
        return trakt.importar(amb, args.pessoa, args.trakt)
    return letterboxd.importar(amb, args.pessoa, args.letterboxd)
