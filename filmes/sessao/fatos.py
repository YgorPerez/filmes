"""Os Fatos que o Feedback de uma Sessão gera, lidos do frontmatter do arquivo.

- Cada reação é um Fato, com a Sessão como Fonte e a data do Feedback. A Nota
  (do Dono, ou repassada por ele) vai também para `notas`, com o mesmo fato_id.
- Cada Presente ganha o Já visto do Filme escolhido, tenha reação ou não.
- "Não vimos nada" (Feedback sem Filme escolhido) não gera Fato.
"""

from dataclasses import dataclass

from filmes.banco import fato_id
from filmes.erros import ErroFilmes

# A reação de 0 a 1 que o Crédito usa. Nota de 0,5 a 5 vai linear para 0 a 1.
NIVEIS = {"gostou": 1.0, "neutro": 0.5, "não gostou": 0.0}


@dataclass(frozen=True)
class Reacao:
    fato_id: str
    sessao: str
    pessoa: str
    filme_id: str
    tipo: str            # nota ou relato
    nota: float | None
    reacao: str | None
    repassada: bool
    valor: float
    data: str
    fonte: str


@dataclass(frozen=True)
class JaVisto:
    fato_id: str
    sessao: str
    pessoa: str
    filme_id: str
    tipo: str            # declarado (o Dono por si) ou relato (o Dono por outra Pessoa)
    data: str
    fonte: str


def valor_da_nota(nota: float) -> float:
    return (nota - 0.5) / 4.5


def fonte(frente: dict, repassada: bool = False) -> str:
    texto = f"Feedback da Sessão {frente['data']}"
    return texto + ", repassado pelo Dono" if repassada else texto


def reacoes(sessao_id: str, frente: dict) -> list[Reacao]:
    feedback = frente.get("feedback") or {}
    filme_id = frente.get("escolhido")
    if not feedback or not filme_id:
        return []
    data = str(feedback["registrado_em"])
    lista = []
    for r in feedback.get("reacoes") or []:
        pessoa, tipo = r["pessoa"], r["tipo"]
        if tipo == "nota":
            nota = float(r["nota"])
            repassada = bool(r.get("repassada", False))
            fonte_da_nota = fonte(frente, repassada)
            lista.append(Reacao(
                fato_id=fato_id("notas", pessoa, filme_id, nota, data, fonte_da_nota, sessao_id),
                sessao=sessao_id, pessoa=pessoa, filme_id=filme_id, tipo="nota", nota=nota, reacao=None,
                repassada=repassada, valor=valor_da_nota(nota), data=data, fonte=fonte_da_nota))
        elif tipo == "relato" and r.get("reacao") in NIVEIS:
            fonte_do_relato = fonte(frente)
            lista.append(Reacao(
                fato_id=fato_id("reacoes", sessao_id, pessoa, filme_id, r["reacao"], data),
                sessao=sessao_id, pessoa=pessoa, filme_id=filme_id, tipo="relato", nota=None, reacao=r["reacao"],
                repassada=False, valor=NIVEIS[r["reacao"]], data=data, fonte=fonte_do_relato))
        else:
            raise ErroFilmes("dados_invalidos", f"Sessão {sessao_id}: reação inválida {r!r}")
    return lista


def ja_vistos(sessao_id: str, frente: dict, dono: set[str]) -> list[JaVisto]:
    feedback = frente.get("feedback") or {}
    filme_id = frente.get("escolhido")
    if not feedback or not filme_id:
        return []
    data = str(feedback["registrado_em"])
    return [
        JaVisto(fato_id=fato_id("ja_visto", sessao_id, pessoa, filme_id, data), sessao=sessao_id, pessoa=pessoa,
                filme_id=filme_id, tipo="declarado" if pessoa in dono else "relato", data=data, fonte=fonte(frente))
        for pessoa in frente["presentes"]
    ]
