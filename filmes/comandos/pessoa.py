import datetime as dt

from filmes.banco import abrir_leitura, pessoas as fatos
from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.evidencia import regua

AJUDA = "cria uma Pessoa, mostra o que se sabe dela e registra Declarados, Relatos e Vetos"


def configurar(parser):
    acoes = parser.add_subparsers(dest="acao", required=True, parser_class=type(parser))

    p = _acao(acoes, "criar", "cria o arquivo da Pessoa no repo de dados")
    p.add_argument("nome")
    p.add_argument("--apelido", action="append", default=[], help="pode repetir")
    p.add_argument("--slug", help="nome do arquivo (padrão: o nome sem acento, com '-')")
    p.add_argument("--dono", action="store_true", help="esta Pessoa é o Dono")
    p.set_defaults(_acao=_criar)

    p = _acao(acoes, "ver", "tudo o que o sistema sabe da Pessoa")
    p.add_argument("pessoa", help='slug, nome ou apelido; "dono" é o Dono')
    p.set_defaults(_acao=_ver)

    p = _acao(acoes, "declarar", "registra um Declarado: o que a Pessoa disse do próprio gosto")
    _argumentos_de_dito(p, fonte_padrao="conversa com o Dono")
    p.add_argument("--review", action="store_true",
                   help="é uma review ou tag que a própria Pessoa escreveu (conta como específico)")
    p.set_defaults(_acao=_declarar)

    p = _acao(acoes, "relatar", "registra um Relato: o que o Dono sabe do gosto de outra Pessoa")
    _argumentos_de_dito(p, fonte_padrao="descrição do Dono")
    p.set_defaults(_acao=_relatar, review=False)

    p = _acao(acoes, "vetar", "registra um Veto: a Pessoa nunca vê filmes do alvo")
    p.add_argument("pessoa", help='slug, nome ou apelido; "dono" é o Dono')
    p.add_argument("texto", help='o Veto como foi dito, ex.: "nunca vê terror"')
    _argumentos_de_alvo(p, obrigatorio=True)
    p.add_argument("--data", help="AAAA-MM-DD (padrão: hoje)")
    p.set_defaults(_acao=_vetar)


def _acao(acoes, nome, ajuda):
    p = acoes.add_parser(nome, help=ajuda, description=ajuda)
    p.add_argument("--json", action="store_true", help="saída JSON compacta numa linha")
    return p


def _argumentos_de_alvo(p, obrigatorio):
    grupo = p.add_mutually_exclusive_group(required=obrigatorio)
    grupo.add_argument("--filme", help="ID do filme no Catálogo (tt...)")
    grupo.add_argument("--entidade", help="ID da entidade no Catálogo (Q...): diretor, ator, gênero...")


def _argumentos_de_dito(p, fonte_padrao):
    p.add_argument("pessoa", help='slug, nome ou apelido; "dono" é o Dono')
    p.add_argument("texto", help="o que foi dito, como foi dito")
    _argumentos_de_alvo(p, obrigatorio=False)
    p.add_argument("--reacao", choices=["ama", "gosta", "nao-gosta", "odeia"],
                   help="o que a Pessoa sente pelo alvo; sobre filme, ama e odeia viram Nota 5 e 1")
    especificidade = p.add_mutually_exclusive_group()
    especificidade.add_argument("--especifico", dest="especifico", action="store_const", const=True,
                                help="nomeia filme, diretor, ator ou subgênero (padrão quando o alvo não é gênero)")
    especificidade.add_argument("--generico", dest="especifico", action="store_const", const=False,
                                help='genérico, como "gosto de comédia" (padrão sem alvo ou com alvo gênero)')
    p.add_argument("--fonte", default=fonte_padrao, help=f'de onde veio (padrão: "{fonte_padrao}")')
    p.add_argument("--data", help="AAAA-MM-DD (padrão: hoje)")


def executar(args, amb):
    return args._acao(args, amb)


def _criar(args, amb):
    pessoa = pessoas.criar(amb.dados, args.nome, args.apelido, slug=args.slug, dono=args.dono)
    fatos.sincronizar(amb.banco, pessoa)
    return _resumo(pessoa)


def _ver(args, amb):
    pessoa = pessoas.resolver(amb.dados, args.pessoa)
    saida = _resumo(pessoa) | {
        "vetos": [v.como_dict() for v in pessoa.vetos],
        "declarados": [_dito_json("declarados", pessoa.slug, d, amb) for d in pessoa.declarados],
        "relatos": [_dito_json("relatos", pessoa.slug, d, amb) for d in pessoa.relatos],
        "imports": pessoa.imports,
    }
    if amb.banco.exists():
        with abrir_leitura(amb.banco) as conn:
            saida["declarados"].extend(_declarados_importados(conn, pessoa.slug, amb.hoje))
            saida["notas"] = [dict(linha) for linha in conn.execute(
                """SELECT n.filme_id, f.titulo, n.nota, n.data, n.fonte, n.tipo, n.fato_id
                   FROM notas_vigentes n LEFT JOIN filmes f ON f.id = n.filme_id
                   WHERE n.pessoa = ? ORDER BY n.data DESC, n.filme_id""", (pessoa.slug,))]
    else:
        saida["notas"] = None
        saida["aviso"] = "banco não encontrado: as Notas aparecem depois de `reconstruir`"
    return saida


def _declarados_importados(conn, slug, hoje):
    for linha in conn.execute(
        """SELECT fato_id, texto, fonte, data, especifico, reacao, alvo, rotulo FROM declarados
           WHERE pessoa = ? AND fato_id LIKE 'letterboxd:%' ORDER BY data DESC, fato_id""", (slug,)
    ):
        especifico = bool(linha["especifico"])
        yield dict(linha) | {
            "tipo": "declarado", "especifico": especifico, "nota": None,
            "forca": regua.forca_dito("declarado", especifico, linha["data"], hoje),
        }


def _resumo(pessoa):
    return {"pessoa": pessoa.slug, "nome": pessoa.nome, "apelidos": pessoa.apelidos, "dono": pessoa.dono}


def _vetar(args, amb):
    pessoa = pessoas.resolver(amb.dados, args.pessoa)
    alvo = args.filme or args.entidade
    with abrir_leitura(amb.banco) as conn:
        rotulo = fatos.rotulo_do_alvo(conn, alvo)
    veto = pessoas.Veto(texto=_texto(args.texto), alvo=alvo, rotulo=rotulo, data=_data(args.data, amb))
    novo = all(v.alvo != alvo for v in pessoa.vetos)
    if novo:
        pessoa.vetos.append(veto)
        _salvar(amb, pessoa)
    else:
        veto = next(v for v in pessoa.vetos if v.alvo == alvo)
    return {"pessoa": pessoa.slug, "veto": veto.como_dict(), "novo": novo}


def _salvar(amb, pessoa):
    pessoas.salvar(amb.dados, pessoa)
    fatos.sincronizar(amb.banco, pessoa)


def _texto(texto):
    texto = " ".join(texto.split())
    if not texto:
        raise ErroFilmes("uso_invalido", "o texto não pode ser vazio")
    return texto


def _data(data, amb):
    if data is None:
        return amb.hoje.isoformat()
    try:
        return dt.date.fromisoformat(data).isoformat()
    except ValueError:
        raise ErroFilmes("uso_invalido", f"data inválida: {data!r} (use AAAA-MM-DD)")


def _declarar(args, amb):
    return _registrar_dito(args, amb, "declarados")


def _relatar(args, amb):
    return _registrar_dito(args, amb, "relatos")


def _registrar_dito(args, amb, secao):
    pessoa = pessoas.resolver(amb.dados, args.pessoa)
    if secao == "relatos" and pessoa.dono:
        raise ErroFilmes("uso_invalido", "o Dono falando do próprio gosto é Declarado, não Relato")
    alvo = args.filme or args.entidade
    reacao = args.reacao.replace("-", "_") if args.reacao else None
    if reacao and not alvo:
        raise ErroFilmes("uso_invalido", "--reacao precisa de --filme ou --entidade")
    if args.review and args.especifico is False:
        raise ErroFilmes("uso_invalido", "review ou tag da própria Pessoa é sempre específico")
    fonte = " ".join(args.fonte.split())
    if not fonte or " · " in fonte:
        raise ErroFilmes("uso_invalido", "a fonte não pode ser vazia nem ter ' · '")

    rotulo, especifico = None, args.especifico
    if alvo:
        with abrir_leitura(amb.banco) as conn:
            rotulo = fatos.rotulo_do_alvo(conn, alvo)
            if especifico is None:
                especifico = not fatos.so_genero(conn, alvo)
    if args.review:
        especifico = True
    dito = pessoas.Dito(data=_data(args.data, amb), fonte=fonte, especifico=bool(especifico),
                        texto=_texto(args.texto), reacao=reacao, alvo=alvo, rotulo=rotulo)
    novo = pessoa.acrescentar(secao, dito)
    if novo:
        _salvar(amb, pessoa)
    return {"pessoa": pessoa.slug, secao[:-1]: _dito_json(secao, pessoa.slug, dito, amb), "novo": novo}


def _dito_json(secao, slug, dito, amb):
    tipo = "declarado" if secao == "declarados" else "relato"
    return {
        "texto": dito.texto, "fonte": dito.fonte, "data": dito.data,
        "especifico": dito.especifico, "reacao": dito.reacao, "alvo": dito.alvo, "rotulo": dito.rotulo,
        "tipo": tipo, "forca": regua.forca_dito(tipo, dito.especifico, dito.data, amb.hoje),
        "nota": fatos.nota_declarada(dito),
        "fato_id": fatos.id_do_dito(secao, slug, dito),
    }
