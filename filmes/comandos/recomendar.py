from contextlib import closing

from filmes import sessao
from filmes.banco import abrir_leitura
from filmes.erros import ErroFilmes
from filmes.recomendacao import mantidos, presentes as pessoas_presentes, recomendar, restricoes
from filmes.recomendacao.restricoes import fora_da_sessao, parecido
from filmes.recomendacao.regra import Regra

AJUDA = "devolve a Recomendação (top 5) com as Evidências de cada filme, por Presente, e abre a Sessão"


def configurar(parser):
    parser.add_argument("--presentes", nargs="+", required=True,
                        help='Pessoas da Sessão por slug, nome ou apelido; "dono" é o Dono')
    parser.add_argument("--regra", choices=["padrao", "media", "de"],
                        help="Regra de escolha: padrao (menor utilidade, desempate pela média), "
                             "media (média simples) ou de (só o gosto de quem --de diz)")
    parser.add_argument("--de", metavar="PESSOA", help='na regra "de", a Pessoa cujo gosto ordena')
    parser.add_argument("--clima", nargs="+", action="extend", default=[], metavar="CLIMA",
                        help="Climas do vocabulário (config/climas.toml); um Clima fora dele volta como aviso")
    parser.add_argument("--quantos", type=int, help="tamanho da lista (padrão: [recomendacao] tamanho da config)")
    parser.add_argument("--pedido", help="o pedido do Dono como ele disse, guardado na Sessão")
    parser.add_argument("--sessao", metavar="ID",
                        help="refaz a Recomendação nesta Sessão aberta, em vez de abrir outra; "
                             "a versão anterior fica no histórico da Sessão")
    parser.add_argument("--manter", nargs="+", action="extend", metavar="ID",
                        help="com --sessao, os filmes da versão anterior que ficam, no mesmo número "
                             "(ex.: tt1,tt3); só as vagas ganham filme novo")
    restricoes.configurar(parser)


def executar(args, amb):
    quantos = args.quantos if args.quantos is not None else amb.pesos["recomendacao"]["tamanho"]
    if quantos < 1:
        raise ErroFilmes("uso_invalido", "--quantos precisa ser 1 ou mais")
    nomes = [n for item in args.presentes for n in item.split(",") if n.strip()]
    manter = fora_da_sessao.manter(args)
    if manter and not args.sessao:
        raise ErroFilmes("uso_invalido", "--manter só vale com --sessao: são os filmes da versão anterior que ficam")
    if args.sem_parecido and not args.sessao:
        raise ErroFilmes("uso_invalido", "--sem-parecido só vale com --sessao: tira o parecido que a Sessão trazia")
    if args.sem_parecido and args.parecido:
        raise ErroFilmes("uso_invalido", "--parecido e --sem-parecido juntos: escolha um")
    regerar, avisos, parecido_novo = None, [], False
    if args.sessao:
        frente = sessao.conferir_aberta(amb, args.sessao)
        parecido_novo = _parecido_na_sessao(args, frente)
        if parecido_novo and manter:
            avisos.append(f"--manter {','.join(manter)}: ignorado, o parecido novo troca a lista inteira")
            manter, args.manter = [], None
    pedidas = restricoes.ler(args)
    if args.sessao:
        # Refazer é sempre regerar: sem --manter, nenhum filme fica, mas o selo novo e as
        # saídas ainda dizem o que entrou e o que saiu.
        regerar, dos_mantidos = mantidos.preparar(frente, manter)
        avisos += dos_mantidos
    with closing(abrir_leitura(amb.banco)) as conn:
        presentes = pessoas_presentes.resolver(conn, nomes)
        saida = recomendar(conn, amb, presentes, quantos, _regra(conn, args, presentes), pedidas, args.clima,
                           regerar=regerar)
    saida["avisos"][:0] = avisos
    if parecido_novo:
        [pedido] = [r for r in pedidas if r.nome == "parecido"]
        saida["saidas"] = mantidos.pelo_parecido(
            saida["saidas"], restricoes.rotulo({"nome": pedido.nome, **pedido.como_json()}))
    contexto = _contexto(args, pedidas, saida["climas"])
    if args.sessao:
        saida["sessao"] = sessao.refazer(amb, args.sessao, saida, contexto)
    else:
        saida["sessao"] = sessao.abrir(amb, saida, contexto)
    return saida


def _parecido_na_sessao(args, frente) -> bool:
    """O parecido fica na Sessão até o Dono pedir outra coisa (#68): sem --parecido nem
    --sem-parecido, valem as referências da versão atual. Devolve se o pedido de parecido é
    novo (referências que a versão atual não tinha), que troca a lista inteira."""
    anteriores = parecido.da_sessao(frente)
    if args.sem_parecido:
        return False
    pedidas = parecido.pedido(args)
    if pedidas is None:
        args.parecido = anteriores or None
        return False
    return set(pedidas.filmes) != set(anteriores)


def _contexto(args, pedidas, climas):
    return {
        "pedido": args.pedido,
        "duracao_max": args.duracao_max,
        "clima": climas,
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
