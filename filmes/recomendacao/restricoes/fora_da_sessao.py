"""Fora da Sessão: ao refazer a Recomendação numa Sessão aberta (`--sessao`), sai
o filme que o Dono trocou em alguma versão dela e o que algum Presente marcou Já vi
nela (#66, decisão do Dono de 2026-11-24, que tira o sem repetido do #57).

Liga sozinha com `--sessao`, com ou sem `--manter`. O resto do que a Sessão já
mostrou pode voltar. O mantido (`--manter`, #59) que estava na tela atual não sai
por aqui: o Dono pediu que ficasse. Outras Sessões não contam, e o Já visto de fora da Sessão
continua só pesando contra.

- Trocado: os `trocados` que `cartaz responder` gravou em cada versão, e as
  `saidas` "trocado" das versões feitas com `--manter` (o Dono escolheu o que
  ficava; o resto ele trocou). No refazer com `--manter`, o que não fica da tela
  atual já é trocado. Refazer sem `--manter` também grava `saidas`, mas lá
  ninguém escolheu nada, e elas não contam.
- Já vi: o filme que uma versão mostrou e que um Presente da Sessão viu desde a
  data dessa versão (o Já vi do cartaz, ou o Já visto registrado durante a Sessão).
"""

from dataclasses import dataclass

from filmes.recomendacao.restricoes import Passa, Sai
from filmes.sessao import arquivo


def configurar(parser):
    pass   # sem argumento próprio: vem do --sessao de `recomendar`


def pedido(args):
    sessao_id = getattr(args, "sessao", None)
    return ForaDaSessao(sessao_id, frozenset(manter(args))) if sessao_id else None


def manter(args) -> list[str]:
    """Os IDs de `--manter`, na ordem, aceitando vírgulas."""
    return [f.strip() for item in getattr(args, "manter", None) or [] for f in item.split(",") if f.strip()]


def rotulo(gravada):
    return "nada trocado nem já visto nesta Sessão"


@dataclass(frozen=True)
class ForaDaSessao:
    sessao: str
    manter: frozenset = frozenset()
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
        trocados = _trocados(versoes)
        if self.manter:
            # Refazer com --manter: o que não fica da tela atual é trocado agora.
            trocados |= na_tela - self.manter
        vistos = _vistos(contexto.conn, versoes)
        return {filme_id: Passa() if filme_id in mantidos else Sai("ja_visto") if filme_id in vistos
                else Sai("trocado") if filme_id in trocados else Passa()
                for filme_id in filmes}


def _trocados(versoes) -> set:
    trocados = set()
    for versao in versoes:
        trocados |= set(versao.get("trocados") or [])
        if versao.get("mantidos"):
            trocados |= {s["id"] for s in versao.get("saidas") or [] if s["motivo"] == "trocado"}
    return trocados


def _vistos(conn, versoes) -> set:
    """O filme que a Sessão mostrou e que algum Presente dela viu desde a versão que o mostrou."""
    vistos = set()
    presentes = sorted({p for v in versoes for p in v["presentes"]})
    for versao in versoes:
        na_tela = [f["id"] for f in arquivo.na_tela(versao)]
        if not na_tela:
            continue
        vistos |= {filme_id for (filme_id,) in conn.execute(
            f"SELECT DISTINCT filme_id FROM ja_vistos WHERE data >= ? "
            f"AND filme_id IN ({', '.join('?' * len(na_tela))}) AND pessoa IN ({', '.join('?' * len(presentes))})",
            [str(versao["data"]), *na_tela, *presentes])}
    return vistos
