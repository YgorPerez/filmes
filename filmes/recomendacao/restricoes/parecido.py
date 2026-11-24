"""Algo igual X: só passam os filmes mais parecidos com uma ou mais referências (#67).

A parecença de cada par sai de `filmes/recomendacao/parecenca.py`; com várias
referências, é a média entre elas (a referência com quem o filme não tem nada em
comum conta 0). Passam só os `[parecido] candidatos` mais parecidos, contados no
Catálogo inteiro, antes das outras Restrições e da nota mínima; a referência
nunca entra. Entre os que passam, a Regra de escolha ordena como sempre.

Cada filme que passa leva, por referência com algo em comum, a linha "parecido
com X: tags em comum; vizinho do MovieLens". A linha não é Fato: não entra na
utilidade de ninguém, e filme só com ela continua "só palpites". Se passam menos
que o pedido, a lista sai menor, com aviso: não completa com filme que não parece.
O pedido é da noite e não grava nada em Pessoa nenhuma.

Na Sessão (#68), as referências ficam gravadas em `contexto.restricoes` da
versão, e `recomendar --sessao` sem `--parecido` continua com elas
(`da_sessao`); `--parecido` com outras referências substitui, e `--sem-parecido`
tira o filtro. Parecido novo numa Sessão aberta troca a lista inteira: quem
decide isso é `filmes/comandos/recomendar.py`.
"""

from dataclasses import dataclass, field

from filmes.banco import fato_id
from filmes.erros import ErroFilmes
from filmes.evidencia import Evidencia, regua, texto
from filmes.recomendacao import parecenca
from filmes.recomendacao.restricoes import Passa


def configurar(parser):
    parser.add_argument("--parecido", nargs="+", action="extend", metavar="ID",
                        help="só os filmes mais parecidos com estes (tt..., ex.: tt2205697); "
                             "com vários, a parecença é a média; com --sessao, fica nos refazeres seguintes")
    parser.add_argument("--sem-parecido", action="store_true",
                        help="com --sessao, tira o filtro de parecido que a Sessão trazia")


def pedido(args):
    ids = [f.strip() for item in getattr(args, "parecido", None) or [] for f in item.split(",") if f.strip()]
    return Parecido(tuple(dict.fromkeys(ids))) if ids else None


def rotulo(gravada):
    titulos = gravada.get("titulos") or gravada.get("filmes") or []
    return f"parecidos com {_e(titulos)}"


def da_sessao(frente: dict) -> list[str]:
    """As referências do parecido que valem na versão atual da Sessão, ou []."""
    gravadas = (frente.get("contexto") or {}).get("restricoes") or []
    return next((list(r.get("filmes") or []) for r in gravadas if r.get("nome") == "parecido"), [])


def _e(nomes) -> str:
    nomes = list(nomes)
    return nomes[0] if len(nomes) == 1 else f"{', '.join(nomes[:-1])} e {nomes[-1]}"


@dataclass
class Parecido:
    filmes: tuple
    titulos: list = field(default_factory=list)
    nome = "parecido"

    def como_json(self):
        return {"filmes": list(self.filmes), "titulos": self.titulos}

    def resultado(self, saidas):
        return {}

    def avaliar(self, contexto, filmes):
        conn, config = contexto.conn, contexto.amb.pesos["parecido"]
        referencias = {}
        for filme_id in self.filmes:
            linha = conn.execute("SELECT * FROM filmes WHERE id = ?", (filme_id,)).fetchone()
            if linha is None:
                raise ErroFilmes("uso_invalido", f"--parecido {filme_id}: filme fora do Catálogo")
            referencias[filme_id] = linha
        self.titulos = [r["titulo"] for r in referencias.values()]
        pares = {ref: parecenca.medir(conn, ref, config) for ref in referencias}
        pesos = config["peso"]
        valores = {}
        for ref, deste in pares.items():
            for filme_id, par in deste.items():
                if filme_id not in referencias:
                    valores[filme_id] = valores.get(filme_id, 0.0) + par.valor(pesos) / len(referencias)
        votos = dict(conn.execute(
            "SELECT id, votos FROM filmes WHERE id IN (SELECT value FROM json_each(?))",
            (parecenca.lista_json(valores),)).fetchall())
        # Filme do MovieLens fora do Catálogo não conta entre os mais parecidos.
        ordem = sorted(votos, key=lambda f: (-valores[f], -votos[f], f))
        mais_parecidos = ordem[:config["candidatos"]]
        return {
            filme_id: Passa(tuple(self._linhas(referencias, pares, filme_id)))
            for filme_id in mais_parecidos if filme_id in filmes
        }

    def aviso_da_lista(self, achados, quantos):
        if achados >= quantos:
            return None
        if achados == 1:
            return f"só 1 parecido com {_e(self.titulos)} passou nas Restrições"
        return f"só {achados} parecidos com {_e(self.titulos)} passaram nas Restrições"

    @staticmethod
    def _linhas(referencias, pares, filme_id):
        for ref, linha in referencias.items():
            par = pares[ref].get(filme_id)
            if par is None:
                continue
            temas = par.temas_principais()
            partes = []
            if temas:
                partes.append(", ".join(tag for tag, _, _ in temas))
            if par.vizinho:
                base, ambos, _, _ = par.vizinho
                partes.append(f"de {texto.inteiro(base)} pessoas que deram 4+ a ele, "
                              f"{100 * ambos // base}% deram 4+ a este")
            fonte, data = (temas[0][1:] if temas else par.vizinho[2:] if par.vizinho else ("IMDb", linha["data_imdb"]))
            yield Evidencia(
                pessoa=None, filme_id=filme_id,
                texto=f"parecido com {linha['titulo']}" + (f": {'; '.join(partes)}" if partes else ""),
                fonte=fonte, data=data, forca=regua.forca_parecido(), tipo="review",
                fato_id=fato_id("parecido", ref, filme_id), base=0.0, conta_como_fato=False,
            )
