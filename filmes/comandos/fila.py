from filmes.banco import abrir_leitura
from filmes.importar import fila, letterboxd

AJUDA = "mostra os filmes do Letterboxd na fila e registra as decisões do Dono"


def configurar(parser):
    acoes = parser.add_subparsers(dest="acao", required=True, parser_class=type(parser))
    for acao in ("ver", "confirmar", "descartar"):
        sub = acoes.add_parser(acao)
        sub.add_argument("--json", action="store_true")
        if acao != "ver":
            sub.add_argument("id", help="ID devolvido por fila ver")
        if acao == "confirmar":
            sub.add_argument("--filme", required=True, help="tconst ou link de filme do IMDb ou TMDB")
        if acao == "descartar":
            sub.add_argument("--motivo", default="ignorar", help='ex.: "não é filme" ou "ignorar"')


def executar(args, amb):
    if args.acao == "ver":
        with abrir_leitura(amb.banco) as conn:
            return fila.ver(conn, amb)
    with letterboxd.escrita(amb) as conn:
        return fila.decidir(conn, amb, args.id, filme=getattr(args, "filme", None),
                            motivo=getattr(args, "motivo", None))
