"""Pessoas no repo de dados: um arquivo `pessoas/<slug>.md` por Pessoa.

Frontmatter com nome, apelidos, `dono: true` no Dono, Vetos, Ajustes e imports. Nenhuma
idade é guardada. O corpo tem as seções `## Declarados` (o que a Pessoa disse do
próprio gosto) e `## Relatos` (o que o Dono contou dela), um item por linha:

    - 2026-11-20 · questionário · específico · gosta de Sofia Rangel (Q9000018) · "adoro os filmes dela"
    - 2026-11-20 · questionário · específico · ama O Farol de Areia (tt9000101) · "é o meu favorito"
    - 2026-11-20 · descrição do Dono · genérico · "odeia filme lento"

Os campos são data, Fonte, específico ou genérico, a reação ao alvo (ama, gosta de,
não gosta de, odeia, ou só "sobre") com o ID entre parênteses, e o que foi dito.
O alvo é opcional.

A seção `## Já vistos` guarda o que a Pessoa disse que já viu, com a Nota quando
ela deu uma (na escala de 0,5 a 5):

    - 2026-11-21 · conversa com o Dono · Pequenos Milagres (tt9000601)
    - 2026-11-21 · conversa com o Dono · Casa Cheia (tt9000602) · nota 4

O resto do corpo é texto livre e fica como está.

Um Ajuste diz quanto um elo do caminho de conteúdo pesa para a Pessoa:

    ajustes:
    - {elo: elenco, nivel: nada, data: '2026-11-22'}

`SECOES` diz onde mora cada tipo de item: os Vetos e os Ajustes no frontmatter, o resto numa
seção do corpo. `Pessoa.itens`, `acrescentar` e `tirar` passam por ela.
"""

import datetime as dt
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Callable
from pathlib import Path

from filmes.dados import markdown
from filmes.erros import ErroFilmes


@dataclass(frozen=True)
class Veto:
    texto: str
    alvo: str       # filme (tt...) ou entidade (Q...)
    rotulo: str
    data: str

    def como_dict(self) -> dict:
        return {"texto": self.texto, "alvo": self.alvo, "rotulo": self.rotulo, "data": self.data}


@dataclass(frozen=True)
class Ajuste:
    elo: str        # diretor, roteiro, elenco, serie, genero
    nivel: str      # nada, pouco, muito ("normal" não fica no arquivo)
    data: str

    def como_dict(self) -> dict:
        return {"elo": self.elo, "nivel": self.nivel, "data": self.data}


ELOS = ("diretor", "roteiro", "elenco", "serie", "genero")
NIVEIS = ("nada", "pouco", "normal", "muito")

REACOES = {"ama": "ama", "gosta": "gosta de", "nao_gosta": "não gosta de", "odeia": "odeia"}
_REACAO_POR_TEXTO = {v: k for k, v in REACOES.items()} | {"sobre": None}

_LINHA = re.compile(
    r"- (?P<data>\d{4}-\d{2}-\d{2}) · (?P<fonte>.+?) · (?P<especificidade>específico|genérico)"
    r"(?: · (?P<reacao>ama|gosta de|não gosta de|odeia|sobre) (?P<rotulo>.+?) \((?P<alvo>[^()\s]+)\))?"
    r' · "(?P<texto>.*)"'
)


@dataclass(frozen=True)
class Dito:
    """Um Declarado ou um Relato: uma linha do corpo do arquivo da Pessoa."""
    data: str
    fonte: str
    especifico: bool
    texto: str
    reacao: str | None = None   # ama, gosta, nao_gosta, odeia
    alvo: str | None = None     # filme (tt...) ou entidade (Q...)
    rotulo: str | None = None

    def linha(self) -> str:
        campos = [self.data, self.fonte, "específico" if self.especifico else "genérico"]
        if self.alvo:
            campos.append(f"{REACOES.get(self.reacao, 'sobre')} {self.rotulo} ({self.alvo})")
        campos.append(f'"{self.texto}"')
        return "- " + " · ".join(campos)


_LINHA_VISTO = re.compile(
    r"- (?P<data>\d{4}-\d{2}-\d{2}) · (?P<fonte>.+?) · (?P<rotulo>.+?) \((?P<alvo>tt[^()\s]+)\)"
    r"(?: · nota (?P<nota>\d+(?:,\d+)?))?"
)


@dataclass(frozen=True)
class JaVisto:
    """Um Já visto dito na hora, com a Nota quando a Pessoa deu uma: uma linha de `## Já vistos`."""
    data: str
    fonte: str
    alvo: str       # filme (tt...)
    rotulo: str
    nota: float | None = None

    def linha(self) -> str:
        campos = [self.data, self.fonte, f"{self.rotulo} ({self.alvo})"]
        if self.nota is not None:
            campos.append("nota " + f"{self.nota:g}".replace(".", ","))
        return "- " + " · ".join(campos)


@dataclass
class Pessoa:
    slug: str
    nome: str
    apelidos: list[str] = field(default_factory=list)
    dono: bool = False
    vetos: list[Veto] = field(default_factory=list)
    ajustes: list[Ajuste] = field(default_factory=list)
    imports: list = field(default_factory=list)
    corpo: str = ""

    @property
    def declarados(self) -> list[Dito]:
        return self.itens("declarados")

    @property
    def relatos(self) -> list[Dito]:
        return self.itens("relatos")

    @property
    def ja_vistos(self) -> list[JaVisto]:
        return self.itens("já vistos")

    def itens(self, secao: str) -> list:
        return SECOES[secao].ler(self)

    def acrescentar(self, secao: str, item) -> bool:
        """Põe o item na seção (criando a seção do corpo se faltar). Devolve False se ele já estava lá."""
        return SECOES[secao].acrescentar(self, item)

    def tirar(self, secao: str, item) -> None:
        """Tira o item da seção. A seção do corpo fica, mesmo vazia."""
        SECOES[secao].tirar(self, item)


class _Vetos:
    """Os Vetos, no frontmatter. Um por alvo."""

    def ler(self, pessoa: Pessoa) -> list[Veto]:
        return list(pessoa.vetos)

    def acrescentar(self, pessoa: Pessoa, veto: Veto) -> bool:
        if any(v.alvo == veto.alvo for v in pessoa.vetos):
            return False
        pessoa.vetos.append(veto)
        return True

    def tirar(self, pessoa: Pessoa, veto: Veto) -> None:
        pessoa.vetos.remove(veto)


class _Ajustes:
    """Os Ajustes, no frontmatter. Um por elo: o novo substitui o anterior."""

    def ler(self, pessoa: Pessoa) -> list[Ajuste]:
        return list(pessoa.ajustes)

    def acrescentar(self, pessoa: Pessoa, ajuste: Ajuste) -> bool:
        if ajuste in pessoa.ajustes:
            return False
        pessoa.ajustes = [a for a in pessoa.ajustes if a.elo != ajuste.elo] + [ajuste]
        return True

    def tirar(self, pessoa: Pessoa, ajuste: Ajuste) -> None:
        pessoa.ajustes.remove(ajuste)


@dataclass(frozen=True)
class _SecaoDoCorpo:
    """Uma seção `## <titulo>` do corpo, um item por linha no formato dado."""
    titulo: str
    formato: re.Pattern
    item: Callable[[re.Match], object]

    def ler(self, pessoa: Pessoa) -> list:
        return [item for _, item in self._com_indice(pessoa)]

    def acrescentar(self, pessoa: Pessoa, item) -> bool:
        if item in self.ler(pessoa):
            return False
        linhas = pessoa.corpo.splitlines()
        titulo = f"## {self.titulo}"
        if titulo not in linhas:
            while linhas and not linhas[-1].strip():
                linhas.pop()
            linhas += ([""] if linhas else []) + [titulo, "", item.linha()]
        else:
            inicio = linhas.index(titulo) + 1
            fim = next((i for i in range(inicio, len(linhas)) if linhas[i].startswith("#")), len(linhas))
            ultima = max((i for i in range(inicio, fim) if linhas[i].strip()), default=inicio)
            linhas.insert(ultima + 1, item.linha())
        pessoa.corpo = "\n".join(linhas) + "\n"
        return True

    def tirar(self, pessoa: Pessoa, item) -> None:
        indice = next(i for i, achado in self._com_indice(pessoa) if achado == item)
        linhas = pessoa.corpo.splitlines()
        del linhas[indice]
        pessoa.corpo = "\n".join(linhas) + "\n"

    def _com_indice(self, pessoa: Pessoa):
        """(índice da linha, item) de cada linha da seção; linha fora do formato é erro com arquivo e linha."""
        secao = self.titulo.casefold()
        atual = None
        for numero, linha in enumerate(pessoa.corpo.splitlines(), start=1):
            if linha.startswith("#"):
                atual = linha.lstrip("#").strip().casefold()
                continue
            if atual != secao or not linha.startswith("- "):
                continue
            achado = self.formato.fullmatch(linha.rstrip())
            if not achado or not _data_valida(achado["data"]):
                raise ErroFilmes("dados_invalidos", f"pessoas/{pessoa.slug}.md, linha {numero} do corpo: "
                                                    f"{self.titulo[:-1]} fora do formato: {linha}")
            yield numero - 1, self.item(achado)


def _dito(achado: re.Match) -> Dito:
    return Dito(
        data=achado["data"], fonte=achado["fonte"], especifico=achado["especificidade"] == "específico",
        texto=achado["texto"], reacao=_REACAO_POR_TEXTO.get(achado["reacao"]),
        alvo=achado["alvo"], rotulo=achado["rotulo"],
    )


def _ja_visto(achado: re.Match) -> JaVisto:
    return JaVisto(data=achado["data"], fonte=achado["fonte"], alvo=achado["alvo"], rotulo=achado["rotulo"],
                   nota=float(achado["nota"].replace(",", ".")) if achado["nota"] else None)


SECOES = {
    "vetos": _Vetos(),
    "ajustes": _Ajustes(),
    "declarados": _SecaoDoCorpo("Declarados", _LINHA, _dito),
    "relatos": _SecaoDoCorpo("Relatos", _LINHA, _dito),
    "já vistos": _SecaoDoCorpo("Já vistos", _LINHA_VISTO, _ja_visto),
}


def pasta(repo: Path) -> Path:
    if not repo.is_dir():
        raise ErroFilmes("dados_ausentes", f"repo de dados não encontrado em {repo}")
    return repo / "pessoas"


def ler_todas(repo: Path) -> list[Pessoa]:
    pessoas = [_ler(arquivo) for arquivo in sorted(pasta(repo).glob("*.md"))]
    donos = [p.slug for p in pessoas if p.dono]
    if len(donos) > 1:
        raise ErroFilmes("dados_invalidos", f"mais de uma Pessoa com dono: true ({', '.join(donos)})")
    return pessoas


def resolver(repo: Path, nome: str) -> Pessoa:
    """Acha a Pessoa por slug, nome ou apelido, sem diferença de maiúscula; "dono" é o Dono."""
    alvo = nome.strip().casefold()
    pessoas = ler_todas(repo)
    if alvo == "dono":
        achadas = [p for p in pessoas if p.dono]
        if not achadas:
            raise ErroFilmes("pessoa_desconhecida", "nenhuma Pessoa tem dono: true no repo de dados")
    else:
        achadas = [p for p in pessoas
                   if alvo in {p.slug.casefold(), p.nome.casefold(), *(a.casefold() for a in p.apelidos)}]
    if not achadas:
        raise ErroFilmes("pessoa_desconhecida", f"nenhuma Pessoa se chama '{nome}'")
    if len(achadas) > 1:
        opcoes = ", ".join(p.slug for p in achadas)
        raise ErroFilmes("pessoa_ambigua", f"'{nome}' pode ser mais de uma Pessoa: {opcoes}")
    return achadas[0]


def criar(repo: Path, nome: str, apelidos: list[str], slug: str | None = None, dono: bool = False) -> Pessoa:
    slug = slug or slug_de(nome)
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        raise ErroFilmes("uso_invalido", f"slug inválido: '{slug}' (só letras minúsculas sem acento, números e '-')")
    if slug == "dono" or nome.strip().casefold() == "dono":
        raise ErroFilmes("uso_invalido", "'dono' é reservado para achar o Dono")
    arquivo = pasta(repo) / f"{slug}.md"
    if arquivo.exists():
        raise ErroFilmes("pessoa_existente", f"já existe uma Pessoa com o slug '{slug}'")
    if dono:
        atual = [p.slug for p in ler_todas(repo) if p.dono]
        if atual:
            raise ErroFilmes("dono_existente", f"o Dono já é '{atual[0]}'")
    pessoa = Pessoa(slug=slug, nome=nome.strip(), apelidos=list(dict.fromkeys(apelidos)), dono=dono)
    salvar(repo, pessoa)
    return pessoa


def salvar(repo: Path, pessoa: Pessoa) -> None:
    frente = {"nome": pessoa.nome, "apelidos": pessoa.apelidos}
    if pessoa.dono:
        frente["dono"] = True
    frente["vetos"] = [v.como_dict() for v in pessoa.vetos]
    if pessoa.ajustes:
        frente["ajustes"] = [a.como_dict() for a in pessoa.ajustes]
    frente["imports"] = pessoa.imports
    markdown.escrever(pasta(repo) / f"{pessoa.slug}.md", frente, pessoa.corpo)


def slug_de(nome: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")


def _ler(arquivo: Path) -> Pessoa:
    frente, corpo = markdown.ler(arquivo)
    if "nome" not in frente:
        raise ErroFilmes("dados_invalidos", f"{arquivo}: falta o campo nome")
    return Pessoa(
        slug=arquivo.stem,
        nome=str(frente["nome"]),
        apelidos=[str(a) for a in frente.get("apelidos") or []],
        dono=bool(frente.get("dono", False)),
        vetos=[_veto(arquivo, v) for v in frente.get("vetos") or []],
        ajustes=_ajustes(arquivo, frente.get("ajustes") or []),
        imports=list(frente.get("imports") or []),
        corpo=corpo,
    )


def _veto(arquivo: Path, item) -> Veto:
    if not isinstance(item, dict) or not all(item.get(c) for c in ("texto", "alvo", "data")):
        raise ErroFilmes("dados_invalidos", f"{arquivo}: Veto precisa de texto, alvo e data: {item!r}")
    if not _data_valida(str(item["data"])):
        raise ErroFilmes("dados_invalidos", f"{arquivo}: data do Veto inválida: {item['data']!r}")
    return Veto(texto=str(item["texto"]), alvo=str(item["alvo"]), rotulo=str(item.get("rotulo") or item["alvo"]),
                data=str(item["data"]))


def _ajustes(arquivo: Path, itens) -> list[Ajuste]:
    ajustes = []
    for item in itens:
        if not isinstance(item, dict) or not all(item.get(c) for c in ("elo", "nivel", "data")):
            raise ErroFilmes("dados_invalidos", f"{arquivo}: Ajuste precisa de elo, nivel e data: {item!r}")
        if item["elo"] not in ELOS:
            raise ErroFilmes("dados_invalidos", f"{arquivo}: elo do Ajuste inválido: {item['elo']!r} (use {', '.join(ELOS)})")
        if item["nivel"] not in NIVEIS or item["nivel"] == "normal":
            raise ErroFilmes("dados_invalidos", f"{arquivo}: nível do Ajuste inválido: {item['nivel']!r} (use nada, pouco ou muito)")
        if not _data_valida(str(item["data"])):
            raise ErroFilmes("dados_invalidos", f"{arquivo}: data do Ajuste inválida: {item['data']!r}")
        if any(a.elo == item["elo"] for a in ajustes):
            raise ErroFilmes("dados_invalidos", f"{arquivo}: mais de um Ajuste para o elo {item['elo']}")
        ajustes.append(Ajuste(elo=str(item["elo"]), nivel=str(item["nivel"]), data=str(item["data"])))
    return ajustes


def _data_valida(data: str) -> bool:
    try:
        dt.date.fromisoformat(data)
    except ValueError:
        return False
    return True
