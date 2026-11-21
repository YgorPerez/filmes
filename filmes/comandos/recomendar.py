from contextlib import closing

from filmes import sessao
from filmes.banco import abrir_leitura
from filmes.erros import ErroFilmes
from filmes.recomendacao import presentes as pessoas_presentes, recomendar, restricoes
from filmes.recomendacao.regra import Regra

AJUDA = "devolve a Recomendação (top 5) com as Evidências de cada filme, por Presente, e abre a Sessão"


def configurar(parser):
    parser.add_argument("--presentes", nargs="+", required=True,
                        help='Pessoas da Sessão por slug, nome ou apelido; "dono" é o Dono')
    parser.add_argument("--regra", choices=["padrao", "media", "de"],
                        help="Regra de escolha: padrao (menor utilidade, desempate pela média), "
                             "media (média simples) ou de (só o gosto de quem --de diz)")
    parser.add_argument("--de", metavar="PESSOA", help='na regra "de", a Pessoa cujo gosto ordena')
    parser.add_argument("--quantos", type=int, help="tamanho da lista (padrão: [recomendacao] tamanho da config)")
    parser.add_argument("--pedido", help="o pedido do Dono como ele disse, guardado na Sessão")
    restricoes.configurar(parser)


def executar(args, amb):
    quantos = args.quantos if args.quantos is not None else amb.pesos["recomendacao"]["tamanho"]
    if quantos < 1:
        raise ErroFilmes("uso_invalido", "--quantos precisa ser 1 ou mais")
    nomes = [n for item in args.presentes for n in item.split(",") if n.strip()]
    pedidas = restricoes.ler(args)
    with closing(abrir_leitura(amb.banco)) as conn:
        presentes = pessoas_presentes.resolver(conn, nomes)
        saida = recomendar(conn, amb, presentes, quantos, _regra(conn, args, presentes), pedidas)
    saida["sessao"] = sessao.abrir(amb, saida, _contexto(args, pedidas))
    return saida


def _contexto(args, pedidas):
    return {
        "pedido": args.pedido,
        "duracao_max": args.duracao_max,
        "clima": [],
        "restricoes": [{"nome": r.nome, **r.como_json()} for r in pedidas if r.nome != "duracao"],
    }


def _regra(conn, args, presentes):
    nome = args.regra or ("de" if args.de else "padrao")
    if nome != "de":
        if args.de:
            raise ErroFilmes("uso_invalido", f"--de só vale com --regra de, não com --regra {nome}")
        return Regra(nome)
    if not args.de:
        raise ErroFilmes("uso_invalido", "--regra de precisa de --de com a Pessoa cujo gosto ordena")
    [pessoa] = pessoas_presentes.resolver(conn, [args.de])
    if pessoa not in presentes:
        raise ErroFilmes("uso_invalido", f"--de {args.de}: {pessoa} não está entre os Presentes")
    return Regra("de", pessoa)
