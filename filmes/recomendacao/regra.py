"""Regra de escolha: como a Sessão junta as utilidades dos Presentes para ordenar.

Quem não tem Fato sobre o filme (utilidade None) conta como neutro, 0,5. Um filme
sem utilidade conhecida para ninguém não tem chave e vai para o fim.

- padrao: a menor utilidade, com desempate pela média.
- media: a média simples.
- de fulano: só a utilidade de fulano. Os Vetos e Restrições de todos continuam
  valendo, porque tiram filmes antes da ordenação.

O Crédito (#20) entra só na padrão, como `u' = u − fator × Crédito`: `ajuste`
traz o `fator × Crédito` de cada Pessoa. Ele não mexe no 0,5 de quem não tem Fato.
"""

from dataclasses import dataclass

NOMES = ("padrao", "media", "de")
NEUTRA = 0.5   # utilidade de quem não tem Fato sobre o filme (#37)


@dataclass(frozen=True)
class Regra:
    nome: str = "padrao"
    pessoa: str | None = None   # só na regra "de"

    def __post_init__(self):
        assert self.nome in NOMES, self.nome
        assert (self.nome == "de") == (self.pessoa is not None), self

    @property
    def usa_credito(self) -> bool:
        return self.nome == "padrao"

    def chave(self, utilidades: dict, ajuste: dict | None = None) -> tuple | None:
        """Quanto maior, melhor. None quando ninguém tem utilidade conhecida."""
        if all(u is None for u in utilidades.values()):
            return None
        if self.nome == "de":
            utilidades = {self.pessoa: utilidades[self.pessoa]}
        ajuste = ajuste if self.usa_credito and ajuste else {}
        valores = [NEUTRA if u is None else u - ajuste.get(p, 0.0) for p, u in utilidades.items()]
        media = sum(valores) / len(valores)
        if self.nome == "padrao":
            return (min(valores), media)
        return (media,)

    def como_json(self) -> dict:
        return {"nome": self.nome, "pessoa": self.pessoa} if self.pessoa else {"nome": self.nome}
