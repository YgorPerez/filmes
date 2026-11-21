"""O erro do contrato da CLI: sai como {"erro": {"codigo", "mensagem"}}."""


class ErroFilmes(Exception):
    def __init__(self, codigo: str, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem

    def como_json(self) -> dict:
        return {"erro": {"codigo": self.codigo, "mensagem": self.mensagem}}
