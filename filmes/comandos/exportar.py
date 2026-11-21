from pathlib import Path

from filmes.dados import pessoas
from filmes.exportar import imdb

AJUDA = "grava as Notas de uma Pessoa num arquivo de outro serviço (imdb: o CSV que o MovieLens importa)"


def configurar(parser):
    parser.add_argument("--pessoa", required=True, help="slug, nome ou apelido da Pessoa")
    parser.add_argument("--formato", required=True, choices=["imdb"],
                        help="imdb: CSV de avaliações do IMDb, Nota de 1 a 10")
    parser.add_argument("--saida", required=True, help="caminho do arquivo .csv a gravar")


def executar(args, amb):
    pessoa = pessoas.resolver(amb.dados, args.pessoa)
    saida = Path(args.saida).expanduser().resolve()
    resumo = imdb.gravar(amb.banco, pessoa.slug, saida)
    return {"pessoa": pessoa.slug, "formato": args.formato, "arquivo": str(saida), **resumo}
