from filmes.banco import abrir_leitura
from filmes.erros import ErroFilmes
from filmes.recomendacao import presentes as pessoas_presentes, recomendar

AJUDA = "devolve a Recomendação (top 5) com as Evidências de cada filme"


def configurar(parser):
    parser.add_argument("--presentes", nargs="+", required=True,
                        help='Pessoas da Sessão por slug, nome ou apelido; "dono" é o Dono')
    parser.add_argument("--quantos", type=int, help="tamanho da lista (padrão: [recomendacao] tamanho da config)")


def executar(args, amb):
    quantos = args.quantos if args.quantos is not None else amb.pesos["recomendacao"]["tamanho"]
    if quantos < 1:
        raise ErroFilmes("uso_invalido", "--quantos precisa ser 1 ou mais")
    nomes = [n for item in args.presentes for n in item.split(",") if n.strip()]
    with abrir_leitura(amb.banco) as conn:
        return recomendar(conn, amb, pessoas_presentes.resolver(conn, nomes), quantos)
