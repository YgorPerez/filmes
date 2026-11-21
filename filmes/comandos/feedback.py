from filmes.sessao import feedback

AJUDA = "registra o Feedback de uma Sessão (Filme escolhido e reações) e a fecha"


def configurar(parser):
    parser.add_argument("--sessao", required=True, help="ID da Sessão, como sessoes-abertas mostra")
    escolha = parser.add_mutually_exclusive_group(required=True)
    escolha.add_argument("--filme", help="Filme escolhido: ID do IMDb ou título, de dentro ou de fora da Recomendação")
    escolha.add_argument("--nada", action="store_true", help='"não vimos nada": fecha sem Filme escolhido')
    parser.add_argument("--nota", action="append", default=[], metavar="PESSOA=NOTA",
                        help="Nota de 0,5 a 5, ou de 1 a 10 com /10 (9/10): a do Dono, ou a que ele repassa de outra Pessoa")
    parser.add_argument("--relato", action="append", default=[], metavar="PESSOA=NIVEL",
                        help="impressão do Dono sobre outra Pessoa: gostou, neutro ou não gostou")
    parser.add_argument("--comentario", action="append", default=[], metavar="PESSOA=TEXTO",
                        help="o que a Pessoa achou do filme, junto da nota ou do Relato dela; vira Declarado")


def executar(args, amb):
    return feedback.registrar(amb, args.sessao, None if args.nada else args.filme, args.nota, args.relato, args.comentario)
