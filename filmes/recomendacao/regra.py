"""Regra de escolha: como a Sessão junta as utilidades dos Presentes para ordenar.

Utilidade desconhecida (None) fica fora do mínimo e da média.

- padrao: a menor utilidade conhecida, com desempate pela média.
- media: a média simples das conhecidas.
- de fulano: só a utilidade de fulano. Os Vetos e Restrições de todos continuam
  valendo, porque tiram filmes antes da ordenação.

O Crédito (#20) entra aqui, na padrão, como `u − fator × Crédito`.
"""

from dataclasses import dataclass

NOMES = ("padrao", "media", "de")


@dataclass(frozen=True)
class Regra:
    nome: str = "padrao"
    pessoa: str | None = None   # só na regra "de"

    def __post_init__(self):
        assert self.nome in NOMES, self.nome
        assert (self.nome == "de") == (self.pessoa is not None), self

    def chave(self, utilidades: dict) -> tuple | None:
        """Quanto maior, melhor. None quando a regra não conhece utilidade de ninguém."""
        if self.nome == "de":
            conhecidas = [u for p, u in utilidades.items() if p == self.pessoa and u is not None]
        else:
            conhecidas = [u for u in utilidades.values() if u is not None]
        if not conhecidas:
            return None
        media = sum(conhecidas) / len(conhecidas)
        if self.nome == "padrao":
            return (min(conhecidas), media)
        return (media,)

    def como_json(self) -> dict:
        return {"nome": self.nome, "pessoa": self.pessoa} if self.pessoa else {"nome": self.nome}
