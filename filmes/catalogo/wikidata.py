"""Consultas do Catálogo e leitura incremental do JSON SPARQL."""

import gzip

import ijson

QLEVER = "https://qlever.dev/api/wikidata"
WDQS = "https://query.wikidata.org/sparql"
PREFIXOS = """PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>"""

ARESTAS = {
    "P57": "diretor", "P161": "elenco", "P136": "genero", "P495": "pais",
    "P364": "idioma", "P921": "tema", "P144": "baseado_em", "P179": "serie",
    "P58": "roteiro", "P86": "musica", "P344": "fotografia", "P162": "produtor",
    "P272": "estudio", "P840": "local_da_narrativa", "P166": "premio",
    "P1411": "indicacao", "P750": "distribuidora", "P915": "montagem",
}
CLASSIFICACOES = (
    "P2758", "P1981", "P2684", "P5970", "P2756", "P1657", "P2747", "P3306",
    "P2363", "P3216", "P2637", "P2629", "P3156", "P3402", "P3834", "P7573",
    "P5150", "P3650", "P6658", "P5201", "P3818", "P3428", "P4437", "P8889",
    "P9086", "P7327", "P8874", "P5152", "P6452", "P10994", "P11611",
)
GRUPOS = {
    "ids": ("P345", "P4947", "P6127", "P4983", "P577"),
    "elenco": ("P161",),
    "conteudo": (*(p for p in ARESTAS if p != "P161"), *CLASSIFICACOES),
    "atores": ("P345",),
    "subgeneros": ("P279",),
}
# Grupos que um manifesto anterior ao #35 (atores) ou ao #48 (subgeneros) não tem.
# Sem eles, o elenco fica sem créditos e o Veto a gênero não desce aos subgêneros.
OPCIONAIS = ("atores", "subgeneros")

IRI = ("http://www.wikidata.org/entity/", "https://www.wikidata.org/entity/")


def qid(termo):
    if termo is None or termo.get("type") != "uri":
        return None
    valor = termo["value"]
    if valor.startswith(IRI):
        item = valor.rsplit("/", 1)[-1]
        if item.startswith("Q") and item[1:].isascii() and item[1:].isdecimal():
            return item
    return None


def consulta(grupo, propriedades):
    predicados = " ".join(f"wdt:{p}" for p in propriedades)
    escopos = {
        "ids": "{ ?item wdt:P31 wd:Q11424 } UNION { ?item wdt:P6127 ?slug }",
        "atores": "?filme wdt:P31 wd:Q11424 ; wdt:P161 ?item .",
        # Os gêneros dos filmes e todas as classes acima deles, para a hierarquia
        # ficar inteira mesmo onde um gênero intermediário não é usado por filme nenhum.
        "subgeneros": "{ SELECT DISTINCT ?item WHERE { ?filme wdt:P31 wd:Q11424 ; wdt:P136/wdt:P279* ?item . } }",
    }
    escopo = escopos.get(grupo, "?item wdt:P31 wd:Q11424 .")
    return f"""{PREFIXOS}
SELECT DISTINCT ?item ?p ?valor WHERE {{
    {escopo}
    VALUES ?p {{ {predicados} }}
    ?item ?p ?valor .
}}"""


def consulta_rotulos(itens):
    valores = " ".join(f"wd:{item}" for item in itens)
    return f"""{PREFIXOS}
SELECT ?valor ?pt ?en ?mul ?codigo WHERE {{
    VALUES ?valor {{ {valores} }}
    OPTIONAL {{ ?valor rdfs:label ?pt FILTER(LANG(?pt) = "pt") }}
    OPTIONAL {{ ?valor rdfs:label ?en FILTER(LANG(?en) = "en") }}
    OPTIONAL {{ ?valor rdfs:label ?mul FILTER(LANG(?mul) = "mul") }}
    OPTIONAL {{ ?valor wdt:P218 ?codigo }}
}}"""


def linhas(arquivo):
    with gzip.open(arquivo, "rb") as fluxo:
        yield from resposta(fluxo)


def resposta(fluxo):
    """Confere o envelope e o tamanho informado pelo QLever durante a leitura."""
    totais = {}
    eventos = _eventos(ijson.parse(fluxo), totais)
    linhas = ijson.items(eventos, "results.bindings.item")
    total = 0
    for linha in linhas:
        total += 1
        yield linha
    if not totais.get("bindings") or totais.get("esperado", total) != total:
        raise ValueError("resultado SPARQL ausente ou incompleto")


def _eventos(eventos, totais):
    for prefixo, evento, valor in eventos:
        if prefixo == "results.bindings" and evento == "start_array":
            totais["bindings"] = True
        elif prefixo == "meta.result-size-total" and evento == "number":
            totais["esperado"] = valor
        yield prefixo, evento, valor
