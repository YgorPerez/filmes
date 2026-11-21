"""Os gêneros do IMDb em português e no Wikidata, por tabela fixa.

As chaves são os 28 gêneros que o title.basics usa. Um gênero que a tabela
não conhece sai como o IMDb escreveu, para não sumir do cabeçalho.
"""

PORTUGUES = {
    "Action": "Ação",
    "Adult": "Adulto",
    "Adventure": "Aventura",
    "Animation": "Animação",
    "Biography": "Biografia",
    "Comedy": "Comédia",
    "Crime": "Crime",
    "Documentary": "Documentário",
    "Drama": "Drama",
    "Family": "Família",
    "Fantasy": "Fantasia",
    "Film-Noir": "Noir",
    "Game-Show": "Game show",
    "History": "História",
    "Horror": "Terror",
    "Music": "Música",
    "Musical": "Musical",
    "Mystery": "Mistério",
    "News": "Jornalismo",
    "Reality-TV": "Reality show",
    "Romance": "Romance",
    "Sci-Fi": "Ficção científica",
    "Short": "Curta-metragem",
    "Sport": "Esporte",
    "Talk-Show": "Talk show",
    "Thriller": "Suspense",
    "War": "Guerra",
    "Western": "Faroeste",
}

# O gênero de filme do Wikidata que corresponde a cada gênero do IMDb, para o
# Veto a gênero valer também pelo title.basics. Ficam de fora os que não têm
# gênero de filme claro no Wikidata (Adult, Music, Short e os de TV).
WIKIDATA = {
    "Action": "Q188473",        # action film
    "Adventure": "Q319221",     # adventure film
    "Animation": "Q202866",     # animated film
    "Biography": "Q645928",     # biographical film
    "Comedy": "Q157443",        # comedy film
    "Crime": "Q959790",         # crime film
    "Documentary": "Q93204",    # documentary film
    "Drama": "Q130232",         # drama film
    "Family": "Q1361932",       # family film
    "Fantasy": "Q157394",       # fantasy film
    "Film-Noir": "Q185867",     # film noir
    "History": "Q17013749",     # historical film
    "Horror": "Q200092",        # horror film
    "Musical": "Q842256",       # musical film
    "Mystery": "Q1200678",      # mystery film
    "Romance": "Q1054574",      # romance film
    "Sci-Fi": "Q471839",        # science fiction film
    "Sport": "Q1339864",        # sport film
    "Thriller": "Q2484376",     # thriller film
    "War": "Q369747",           # war film
    "Western": "Q172980",       # Western film
}


def em_portugues(genero: str) -> str:
    return PORTUGUES.get(genero, genero)
