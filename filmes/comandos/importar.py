from pathlib import Path

from filmes.importar import letterboxd, trakt

AJUDA = "importa o ZIP do Letterboxd ou do Trakt, ou o RSS do Letterboxd, de uma Pessoa"


def configurar(parser):
    parser.add_argument("--pessoa", required=True, help="slug, nome ou apelido da Pessoa")
    origem = parser.add_mutually_exclusive_group(required=True)
    origem.add_argument("--letterboxd", type=Path, help="ZIP exportado pelo Letterboxd")
    origem.add_argument("--letterboxd-rss", metavar="USUARIO",
                        help="usuário do Letterboxd: baixa o RSS público (só com o consentimento da Pessoa)")
    origem.add_argument("--trakt", type=Path, help="ZIP do Raw Export do Trakt")


def executar(args, amb):
    if args.trakt:
        return trakt.importar(amb, args.pessoa, args.trakt)
    if args.letterboxd_rss:
        return letterboxd.importar_rss(amb, args.pessoa, args.letterboxd_rss)
    return letterboxd.importar(amb, args.pessoa, args.letterboxd)
