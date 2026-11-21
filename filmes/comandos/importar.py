from pathlib import Path

from filmes.erros import ErroFilmes
from filmes.importar import letterboxd, remover, trakt

AJUDA = "importa o ZIP do Letterboxd ou do Trakt, ou o RSS do Letterboxd, de uma Pessoa; ou remove um import"


def configurar(parser):
    parser.add_argument("--pessoa", help="slug, nome ou apelido da Pessoa (com --remover, opcional)")
    origem = parser.add_mutually_exclusive_group(required=True)
    origem.add_argument("--letterboxd", type=Path, help="ZIP exportado pelo Letterboxd")
    origem.add_argument("--letterboxd-rss", metavar="USUARIO",
                        help="usuário do Letterboxd: baixa o RSS público (só com o consentimento da Pessoa)")
    origem.add_argument("--trakt", type=Path, help="ZIP do Raw Export do Trakt")
    origem.add_argument("--remover", metavar="ARQUIVO",
                        help="tira o import: o caminho que `pessoa ver` mostra em imports, ou só o nome do arquivo")


def executar(args, amb):
    if args.remover:
        return remover.remover(amb, args.remover, args.pessoa)
    if not args.pessoa:
        raise ErroFilmes("uso_invalido", "importar precisa de --pessoa")
    if args.trakt:
        return trakt.importar(amb, args.pessoa, args.trakt)
    if args.letterboxd_rss:
        return letterboxd.importar_rss(amb, args.pessoa, args.letterboxd_rss)
    return letterboxd.importar(amb, args.pessoa, args.letterboxd)
