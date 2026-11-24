"""Fora da Sessão: ao refazer a Recomendação numa Sessão aberta (`--sessao`), sai
o filme que o Dono trocou em alguma versão dela e o que algum Presente marcou Já vi
nela (#66, decisão do Dono de 2026-11-24, que tira o sem repetido do #57).

Liga sozinha com `--sessao`, com ou sem `--manter` ou `--trocar`. O resto do que a Sessão já
mostrou pode voltar. O mantido (`--manter`, #59) que estava na tela atual não sai
por aqui: o Dono pediu que ficasse. Outras Sessões não contam, e o Já visto de fora da Sessão
continua só pesando contra.

- Trocado: os `trocados` de cada versão. `cartaz responder` grava ali o Trocar
  do cartaz; o refazer grava, na versão que sai, os filmes de `--trocar` (o
  "outras opções" do chat) e, com `--manter`, o que não ficou da tela dela (o
  Dono escolheu o que ficava; o resto ele trocou), mesmo que nenhum mantido
  sobreviva. Refazer sem `--manter` nem `--trocar` não troca nada. Versão antiga,
  de antes de o refazer gravar `trocados`, conta pelas `saidas` "trocado" quando
  teve mantidos.
- Já vi: o filme que uma versão mostrou e que um Presente da Sessão, dos de
  agora ou de alguma versão, viu desde a data dessa versão (o Já vi do cartaz, ou
  o Já visto registrado durante a Sessão).
"""

from dataclasses import dataclass

from filmes.erros import ErroFilmes
from filmes.recomendacao.restricoes import Passa, Sai
from filmes.sessao import arquivo


def configurar(parser):
    # Liga com o --sessao de `recomendar`; --trocar é o "outras opções" do chat.
    parser.add_argument("--trocar", nargs="+", action="extend", metavar="ID",
                        help="com --sessao, grava estes filmes como Trocados na Sessão antes de refazer "
                             "(ex.: os 5 da tela, quando o Dono pede outras opções); não voltam mais nela")


def pedido(args):
    sessao_id = getattr(args, "sessao", None)
    if trocar(args) and not sessao_id:
        raise ErroFilmes("uso_invalido", "--trocar só vale com --sessao: são filmes que a Sessão mostrou")
    return ForaDaSessao(sessao_id, frozenset(manter(args)), frozenset(trocar(args))) if sessao_id else None


def manter(args) -> list[str]:
    """Os IDs de `--manter`, na ordem, aceitando vírgulas."""
    return _ids(getattr(args, "manter", None))


def trocar(args) -> list[str]:
    """Os IDs de `--trocar`, na ordem, aceitando vírgulas."""
    return _ids(getattr(args, "trocar", None))


def _ids(itens) -> list[str]:
    return list(dict.fromkeys(f.strip() for item in itens or [] for f in item.split(",") if f.strip()))


def trocados_agora(versao: dict, manter, trocar) -> set:
    """O que o Dono trocou na versão atual: o Trocar do cartaz, `--trocar` e, com
    `--manter`, o que não fica da tela dela. O refazer grava isso na versão que sai."""
    agora = set(versao.get("trocados") or []) | set(trocar)
    if manter:
        agora |= {f["id"] for f in arquivo.na_tela(versao)} - set(manter)
    return agora


def rotulo(gravada):
    return "nada trocado nem já visto nesta Sessão"


@dataclass(frozen=True)
class ForaDaSessao:
    sessao: str
    manter: frozenset = frozenset()
    trocar: frozenset = frozenset()
    nome = "fora_da_sessao"

    def como_json(self):
        return {}

    def resultado(self, saidas):
        return {"trocados": saidas["trocado"], "ja_vistos": saidas["ja_visto"]}

    def avaliar(self, contexto, filmes):
        frente, _ = arquivo.ler(contexto.amb.dados, self.sessao)
        versoes = [*(frente.get("versoes") or []), arquivo.versao_atual(frente)]
        na_tela = {f["id"] for f in arquivo.na_tela(versoes[-1])}
        mantidos = self.manter & na_tela
        trocados = _trocados(versoes) | trocados_agora(versoes[-1], self.manter, self.trocar)
        vistos = _vistos(contexto.conn, versoes, contexto.presentes)
        return {filme_id: Passa() if filme_id in mantidos else Sai("ja_visto") if filme_id in vistos
                else Sai("trocado") if filme_id in trocados else Passa()
                for filme_id in filmes}


def _trocados(versoes) -> set:
    trocados = set()
    for versao in versoes:
        trocados |= set(versao.get("trocados") or [])
        if versao.get("mantidos"):   # versão de antes de o refazer gravar `trocados`
            trocados |= {s["id"] for s in versao.get("saidas") or [] if s["motivo"] == "trocado"}
    return trocados


def _vistos(conn, versoes, agora) -> set:
    """O filme que a Sessão mostrou e que algum Presente dela, de agora ou de alguma
    versão, viu desde a versão que o mostrou."""
    vistos = set()
    presentes = sorted({*agora, *(p for v in versoes for p in v["presentes"])})
    for versao in versoes:
        na_tela = [f["id"] for f in arquivo.na_tela(versao)]
        if not na_tela:
            continue
        vistos |= {filme_id for (filme_id,) in conn.execute(
            f"SELECT DISTINCT filme_id FROM ja_vistos WHERE data >= ? "
            f"AND filme_id IN ({', '.join('?' * len(na_tela))}) AND pessoa IN ({', '.join('?' * len(presentes))})",
            [str(versao["data"]), *na_tela, *presentes])}
    return vistos
