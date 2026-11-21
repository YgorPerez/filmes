"""Tira um import da Pessoa: o registro no frontmatter, o arquivo guardado e os Fatos dele.

O arquivo é o caminho que `pessoa ver` mostra em `imports` (`imports/<slug>/...`),
ou só o nome dele. Os Fatos do import saem refazendo a carga da Pessoa com os
imports que ficaram, então um Fato que outro import também traz fica, com a
Fonte desse outro. As decisões da fila (`imports/letterboxd.md`) ficam: valem
para todas as Pessoas.
"""

from pathlib import PurePosixPath

from filmes.dados import pessoas
from filmes.erros import ErroFilmes
from filmes.importar import letterboxd, trakt
from filmes.importar.letterboxd import escrita

def remover(amb, arquivo: str, nome: str | None = None) -> dict:
    candidatas = [pessoas.resolver(amb.dados, nome)] if nome else pessoas.ler_todas(amb.dados)
    achados = [(pessoa, importado) for pessoa in candidatas for importado in pessoa.imports
               if isinstance(importado, dict) and arquivo in _nomes(importado)]
    if not achados:
        de_quem = f" de {candidatas[0].slug}" if nome else ""
        raise ErroFilmes("import_desconhecido",
                         f"nenhum import{de_quem} tem o arquivo {arquivo!r}; veja `imports` em `pessoa ver`")
    if len(achados) > 1:
        opcoes = ", ".join(importado["arquivo"] for _, importado in achados)
        raise ErroFilmes("import_ambiguo", f"{arquivo!r} pode ser mais de um import: {opcoes}")
    [(pessoa, importado)] = achados

    with escrita(amb) as conn:
        antes = _contar(conn, pessoa.slug)
        pessoa.imports.remove(importado)
        pessoas.salvar(amb.dados, pessoa)
        letterboxd.carregar(conn, amb)
        trakt.recarregar(conn, amb, pessoa)
        depois = _contar(conn, pessoa.slug)
    (amb.dados / importado["arquivo"]).unlink(missing_ok=True)
    return {
        "pessoa": pessoa.slug,
        "removido": importado,
        "fatos": depois,
        "fatos_removidos": {t: antes[t] - depois[t] for t in letterboxd.TABELAS_DE_FATO},
    }


def _nomes(importado) -> set[str]:
    caminho = str(importado.get("arquivo") or "")
    return {caminho, PurePosixPath(caminho).name} - {""}


def _contar(conn, slug) -> dict:
    return {t: conn.execute(
        f"SELECT count(*) FROM {t} WHERE pessoa = ? AND (fato_id LIKE 'letterboxd:%' OR fato_id LIKE 'trakt:%')",
        (slug,)).fetchone()[0] for t in letterboxd.TABELAS_DE_FATO}
