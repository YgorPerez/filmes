import datetime as dt

from filmes.banco import abrir_leitura, pessoas as fatos
from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.evidencia import regua

AJUDA = "cria uma Pessoa, mostra o que se sabe dela e registra ou remove Declarados, Relatos, Vetos e Já vistos"


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

    p = _acao(acoes, "visto", "registra que a Pessoa já viu o filme e, com --nota, a Nota que ela deu")
    p.add_argument("pessoa", help='slug, nome ou apelido; "dono" é o Dono')
    p.add_argument("--filme", required=True, help="ID do filme no Catálogo (tt...)")
    p.add_argument("--nota", help='a Nota que a Pessoa deu: de 0,5 a 5, ou de 1 a 10 escrita "8/10"')
    p.add_argument("--fonte", default="conversa com o Dono", help='de onde veio (padrão: "conversa com o Dono")')
    p.add_argument("--data", help="AAAA-MM-DD (padrão: hoje)")
    p.set_defaults(_acao=_visto)

    p = _acao(acoes, "remover", "tira do arquivo da Pessoa e do banco um Declarado, Relato, Veto ou Já visto")
    p.add_argument("pessoa", help='slug, nome ou apelido; "dono" é o Dono')
    qual = p.add_mutually_exclusive_group(required=True)
    for opcao in _REMOVIVEIS:
        qual.add_argument(f"--{opcao}", metavar="ID_OU_ALVO",
                          help="o fato_id que `pessoa ver` mostra, ou o alvo (tt..., Q...) se só um item tem esse alvo")
    p.set_defaults(_acao=_remover)


_REMOVIVEIS = {"declarado": "declarados", "relato": "relatos", "veto": "vetos", "visto": "já vistos"}


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
        "vetos": [_veto_json(pessoa.slug, v) for v in pessoa.vetos],
        "declarados": [_dito_json("declarados", pessoa.slug, d, amb) for d in pessoa.declarados],
        "relatos": [_dito_json("relatos", pessoa.slug, d, amb) for d in pessoa.relatos],
        "vistos": [_visto_json(pessoa.slug, v) for v in pessoa.vistos],
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
           WHERE pessoa = ? AND (fato_id LIKE 'letterboxd:%' OR sessao IS NOT NULL) ORDER BY data DESC, fato_id""", (slug,)
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
    return {"pessoa": pessoa.slug, "veto": _veto_json(pessoa.slug, veto), "novo": novo}


def _veto_json(slug, veto):
    return veto.como_dict() | {"fato_id": fatos.id_do_veto(slug, veto)}


def _remover(args, amb):
    pessoa = pessoas.resolver(amb.dados, args.pessoa)
    [(opcao, valor)] = [(o, getattr(args, o)) for o in _REMOVIVEIS if getattr(args, o) is not None]
    secao = _REMOVIVEIS[opcao]
    itens = _itens_removiveis(pessoa, secao, amb)
    achados = [(item, saida) for item, saida in itens if saida["fato_id"] == valor]
    if not achados:
        achados = [(item, saida) for item, saida in itens if saida.get("alvo", saida.get("filme")) == valor]
    if not achados:
        raise ErroFilmes(f"{opcao}_desconhecido", _sem_item(pessoa, opcao, valor, amb))
    if len(achados) > 1:
        ids = ", ".join(saida["fato_id"] for _, saida in achados)
        raise ErroFilmes(f"{opcao}_ambiguo", f"mais de um {opcao} de {pessoa.slug} tem o alvo {valor}; "
                                              f"escolha pelo fato_id: {ids}")
    [(item, saida)] = achados
    if secao == "vetos":
        pessoa.vetos.remove(item)
    else:
        pessoa.tirar(secao, item)
    _salvar(amb, pessoa)
    return {"pessoa": pessoa.slug, "tipo": opcao, "removido": saida}


def _itens_removiveis(pessoa, secao, amb):
    if secao == "vetos":
        return [(v, _veto_json(pessoa.slug, v)) for v in pessoa.vetos]
    if secao == "já vistos":
        return [(v, _visto_json(pessoa.slug, v)) for v in pessoa.vistos]
    return [(d, _dito_json(secao, pessoa.slug, d, amb)) for d in getattr(pessoa, secao)]


def _sem_item(pessoa, opcao, valor, amb):
    mensagem = f"{pessoa.slug} não tem {opcao} com fato_id ou alvo {valor!r} no arquivo"
    if opcao == "declarado" and valor.startswith("letterboxd:"):
        return mensagem + "; ele veio de um import: tire o import com `importar --remover`"
    if opcao == "declarado" and valor.startswith("feedback:"):
        return mensagem + "; ele veio do Feedback de uma Sessão, não do arquivo da Pessoa"
    return mensagem


def _visto(args, amb):
    pessoa = pessoas.resolver(amb.dados, args.pessoa)
    if not args.filme.startswith("tt"):
        raise ErroFilmes("uso_invalido", f"--filme precisa ser um ID de filme (tt...), não {args.filme!r}")
    nota = _nota(args.nota) if args.nota is not None else None
    with abrir_leitura(amb.banco) as conn:
        rotulo = fatos.rotulo_do_alvo(conn, args.filme)
    visto = pessoas.Visto(data=_data(args.data, amb), fonte=_fonte(args.fonte), alvo=args.filme,
                          rotulo=rotulo, nota=nota)
    novo = pessoa.acrescentar("já vistos", visto)
    if novo:
        _salvar(amb, pessoa)
    return {"pessoa": pessoa.slug, "visto": _visto_json(pessoa.slug, visto), "novo": novo}


def _visto_json(slug, visto):
    return {"filme": visto.alvo, "titulo": visto.rotulo, "nota": visto.nota, "data": visto.data,
            "fonte": visto.fonte, "fato_id": fatos.id_do_visto(slug, visto)}


def _nota(texto):
    """"4", "4,5" e "4.5" são a escala de 0,5 a 5; "8/10" é dividido por 2."""
    bruto = texto.strip().replace(",", ".")
    de_dez = bruto.endswith("/10")
    try:
        valor = float(bruto.removesuffix("/10"))
    except ValueError:
        raise ErroFilmes("uso_invalido", f'nota inválida: {texto!r} (use de 0,5 a 5, ou "8/10")')
    if de_dez:
        if not 1 <= valor <= 10:
            raise ErroFilmes("uso_invalido", f"nota de 1 a 10 fora da escala: {texto!r}")
        return valor / 2
    if not 0.5 <= valor <= 5:
        dica = f' (se é de 0 a 10, escreva "{texto.strip()}/10")' if valor <= 10 else ""
        raise ErroFilmes("uso_invalido", f"nota fora da escala de 0,5 a 5: {texto!r}{dica}")
    return valor


def _fonte(fonte):
    fonte = " ".join(fonte.split())
    if not fonte or " · " in fonte:
        raise ErroFilmes("uso_invalido", "a fonte não pode ser vazia nem ter ' · '")
    return fonte


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
    fonte = _fonte(args.fonte)

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
