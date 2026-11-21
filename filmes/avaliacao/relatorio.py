"""Versões dos dados e relatório datado da avaliação."""

import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml

from filmes.ambiente import RAIZ
from filmes.erros import ErroFilmes


def versoes(amb):
    catalogo = amb.catalogo
    movielens = catalogo / "ml-32m"
    arquivos = list(catalogo.glob("*.csv")) + [movielens / nome for nome in ("links.csv", "ratings.csv", "tags.csv")]
    resultado = {
        str(arquivo.relative_to(catalogo)): _sha256(arquivo)
        for arquivo in sorted(arquivos) if arquivo.is_file()
    }
    if not (catalogo / "filmes.csv").is_file():
        manifesto = _manifesto(amb)
        if manifesto.is_file():
            resultado["manifesto"] = json.loads(manifesto.read_text(encoding="utf-8"))
    return resultado


def _manifesto(amb):
    try:
        return amb.caminho("versoes")
    except ErroFilmes as erro:
        if erro.codigo != "config_ausente":
            raise
        return Path(os.environ.get("FILMES_VERSOES") or RAIZ / "config" / "versoes-catalogo.json")


def _sha256(arquivo):
    with arquivo.open("rb") as fluxo:
        return hashlib.file_digest(fluxo, "sha256").hexdigest()


def gravar(data, resultado):
    pasta = Path(os.environ.get("FILMES_AVALIACOES") or RAIZ / "docs" / "avaliacoes")
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"{data}.md"
    secoes = [
        f"# Avaliação de {data}",
        "",
        "## Offline",
        "",
        "| Amostra | Perfis | Recall@50 | Cobertura no top 5 |",
        "| --- | ---: | ---: | ---: |",
    ]
    for nome, chave in (("Pessoas", "pessoas"), ("MovieLens", "movielens")):
        m = resultado["offline"][chave]
        secoes.append(
            f"| {nome} | {m['perfis']} | {_taxa(m['recall_50'])} "
            f"({m['recuperados']}/{m['retidos_4_mais']}) | {_taxa(m['cobertura_top_5'])} "
            f"({m['com_evidencia']}/{m['filmes_top_5']}) |"
        )
    amostra = resultado["amostra_movielens"]
    secoes.extend([
        "",
        "O corte retém os 20% mais recentes do histórico de cada Pessoa e de cada usuário sorteado.",
        f"A amostra do MovieLens usou a semente {amostra['semente']} e sorteou {amostra['usuarios']} usuários.",
    ])
    online = resultado["online"]
    secoes.extend([
        "",
        "## Online",
        "",
        f"- Sessões com Feedback na janela: {online['sessoes']}",
        f"- Filme escolhido no top 5: {_taxa(online['taxa_top_5'])}",
        f"- Reação média: {online['reacao_media'] if online['reacao_media'] is not None else '—'}",
        f"- Medida que decide: {resultado['prioridade']}",
        "",
        "## Pesos",
        "",
        _yaml(resultado["pesos"]),
        "",
        "## Versões dos dados",
        "",
        _yaml(resultado["versoes"]),
    ])
    if "grade" in resultado:
        grade = resultado["grade"]
        secoes.extend([
            "", "## Grade de pesos", "",
            f"Foram testados {grade['combinacoes']} conjuntos. A ordem usa a média do Recall@50 "
            "entre as amostras. No empate, vale a cobertura no top 5 e depois o menor número "
            "de mudanças nos pesos.",
            "", _yaml(grade["melhores"]),
        ])
    if resultado["avisos"]:
        secoes.extend(["", "## Avisos", "", *(f"- {aviso}" for aviso in resultado["avisos"])])
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=pasta, delete=False) as arquivo:
        temporario = Path(arquivo.name)
        try:
            arquivo.write("\n".join(secoes) + "\n")
            arquivo.close()
            temporario.replace(destino)
        finally:
            temporario.unlink(missing_ok=True)
    return destino


def _taxa(valor):
    return f"{valor:.1%}" if valor is not None else "—"


def _yaml(objeto):
    return "```yaml\n" + yaml.safe_dump(objeto, allow_unicode=True, sort_keys=True) + "```"
