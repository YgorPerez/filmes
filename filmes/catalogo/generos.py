"""Os gêneros do IMDb em português, por tabela fixa.

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


def em_portugues(genero: str) -> str:
    return PORTUGUES.get(genero, genero)
