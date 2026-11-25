import { z } from 'zod'
import { definirFerramenta, semHifen } from '../ferramenta.ts'

const pessoa = semHifen('nome de Pessoa')

export default definirFerramenta({
  nome: 'recomendar',
  descricao:
    'Recomendação para uma Sessão: devolve o top 5 na ordem da Regra de escolha. Cada filme traz ' +
    '`utilidade` (0 a 1, ou null quando não há Fato) e `evidencias` agrupadas por Presente ' +
    '(pessoa, texto, fonte, data, forca, tipo, fato_id, contribuicao); quem não tem Fato sobre o filme ' +
    'recebe a linha "sem fato". Fora das Evidências, cada filme traz `imdb` (link), `generos` (do IMDb, em português) ' +
    '`capa` (pôster do TMDB em w185), `titulo_pt` e `sinopse` (a primeira frase do overview), os três do TMDB em pt-BR ' +
    'e null sem chave do TMDB ou sem o dado, `nota_imdb` e `votos_imdb`, e `cobertura` ({com_fato, presentes, sem_fato: slugs}). ' +
    '`vetos` lista os Vetos dos Presentes que tiraram filmes, com `filmes_tirados` e `por_caminho` ' +
    '({direto, subgeneros, genero_imdb}): um Veto a gênero tira também os subgêneros do Wikidata e o gênero do IMDb; ' +
    'um Veto a grupo de tags, como comédia boba, conta em {tags}. ' +
    '`so_palpites` marca filme sem Fato nenhum, que só entra no fim quando ' +
    'faltam Candidatos com Fato. Presentes por slug, nome ou apelido; "dono" é o Dono. ' +
    'Restrições opcionais (duração, ano de lançamento, idioma, criança, gatilhos, sem Já visto, nada triste, nada lento, parecido) tiram filmes antes da ordenação. ' +
    'Com `parecido`, cada filme traz a linha "parecido com X: tags em comum", que não é Fato. ' +
    'Com `sessao`, o parecido fica: o refazer sem `parecido` continua com as referências da versão anterior; ' +
    '`parecido` com outras referências substitui, e `sem_parecido` tira o filtro. Parecido novo troca a lista inteira: ' +
    'ignora `manter`, com aviso, e quem sai sem ser Já vi nem trocado pelo Dono vem em `saidas` como `restricao` `parecido`. ' +
    'Cada filme que passa traz em `linhas_do_filme` as linhas das Restrições, do Clima, de grupo ou sozinho e da nota do IMDb acima de 7. ' +
    'Clima, grupo ou sozinho e a nota do IMDb puxam a ordem dos filmes. ' +
    'A linha de Crédito aparece em `linhas_do_filme` quando o Crédito fez o filme subir. ' +
    '`credito` traz o Crédito de cada Presente na Regra padrão em grupo. Cada chamada abre uma Sessão (`sessao.id`). ' +
    'Com `sessao`, refaz a Recomendação nessa Sessão aberta em vez de abrir outra, e `sessao.versao` conta as versões; ' +
    'o que a Sessão já mostrou pode voltar; só sai, sozinho, o que o Dono trocou em alguma versão dela e o que algum Presente ' +
    'marcou Já vi nela, em `restricoes.fora_da_sessao` ({trocados, ja_vistos, tirados}). ' +
    'Com `trocar`, os filmes dados viram Trocados da Sessão antes de refazer ("outras opções" no chat: passe os da tela). ' +
    'Com `manter`, os mantidos ficam no número da versão anterior e só as vagas ganham filme novo; cada filme traz ' +
    '`novo` (false no filme que já estava na tela anterior), e a resposta traz `mantidos` e `saidas` ({posicao, id, titulo, motivo}: `ja_visto` com ' +
    '`pessoas`, `trocado`, `restricao` com `restricao` e `rotulo`, `veto` com `pessoa` e `texto` ou `nota_minima` com `rotulo`). ' +
    'Uma Restrição ou um Veto do pedido tiram também o mantido que os viola, e o mantido abaixo da nota ou dos votos ' +
    'mínimos do IMDb também sai, com aviso; gosto novo não tira mantido. ' +
    'Antes, chame `sessoes_abertas` e, se houver uma, pergunte por ela. O Dono pode pular. ' +
    'A resposta inclui `climas` (os aceitos), `restricoes`, `avisos` e `atribuicoes`. ' +
    'Copie o texto do Does the Dog Die como veio.',
  entrada: {
    presentes: z
      .array(pessoa)
      .min(1)
      .describe('Pessoas da Sessão, ex.: ["dono", "ana"]'),
    regra: z
      .enum(['padrao', 'media', 'de'])
      .optional()
      .describe(
        'Regra de escolha: padrao (menor utilidade entre os Presentes, desempate pela média; é o padrão), ' +
          'media (média simples, "tanto faz") ou de (só o gosto de uma Pessoa, "hoje é a vez da Ana")',
      ),
    de: pessoa
      .optional()
      .describe(
        'na regra "de", a Pessoa cujo gosto ordena; precisa estar entre os Presentes',
      ),
    climas: z
      .array(z.string())
      .optional()
      .describe(
        'Climas do pedido, do vocabulário fixo: leve, pra rir, tenso, romântico, pra chorar, pra pensar, ' +
          'assustador, ação. "Algo leve" é leve; "pra dar risada" é pra rir. Fora da lista, o motor devolve um aviso',
      ),
    quantos: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('tamanho da lista; padrão 5'),
    pedido: z
      .string()
      .optional()
      .describe('o pedido do Dono como ele disse, guardado na Sessão'),
    sessao: z
      .string()
      .regex(/^[^-\s]/)
      .optional()
      .describe(
        'ID da Sessão aberta a refazer quando o pedido muda antes de verem algo (outro tempo, Restrição, ' +
          'Presente ou Já visto); a versão anterior fica no histórico. Sem ele, abre uma Sessão nova',
      ),
    manter: z
      .array(z.string().regex(/^tt\d+$/))
      .optional()
      .describe(
        'com sessao: os filmes da versão anterior que ficam (o que o Dono não mandou trocar nem já viu). ' +
          'Ficam no mesmo número; só as vagas ganham filme novo',
      ),
    trocar: z
      .array(z.string().regex(/^tt\d+$/))
      .optional()
      .describe(
        'com sessao: filmes que o Dono trocou, gravados como Trocados da Sessão antes de refazer; não voltam mais nela. ' +
          '"Nenhum desses, quero outros" no chat: passe todos os da tela',
      ),
    duracao_max: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('tempo disponível, em minutos'),
    desde: z
      .number()
      .int()
      .optional()
      .describe(
        'ano de lançamento mínimo, inclusive: "de 1990 em diante" é 1990',
      ),
    ate: z
      .number()
      .int()
      .optional()
      .describe(
        'ano de lançamento máximo, inclusive: "até 2005" é 2005; "anos 90" é desde 1990 e ate 1999',
      ),
    idioma: z
      .string()
      .min(1)
      .optional()
      .describe(
        'idioma original exigido, só quando pedido: "pt", "português" ou o QID',
      ),
    crianca: z
      .boolean()
      .optional()
      .describe('"tem criança" sem idade: vale livre (L)'),
    idade_crianca: z
      .number()
      .int()
      .min(0)
      .max(17)
      .optional()
      .describe('idade da criança mais nova'),
    gatilhos: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe(
        'temas do Does the Dog Die a evitar, em inglês como o site escreve, ex.: ["a dog dies"]',
      ),
    sem_ja_visto: z
      .boolean()
      .optional()
      .describe('tira os filmes que algum Presente já viu'),
    sem_tristeza: z
      .boolean()
      .optional()
      .describe(
        '"nada triste": tira filme com tag de tristeza ou de tema pesado no MovieLens e filme de tema pesado no Wikidata',
      ),
    sem_lento: z
      .boolean()
      .optional()
      .describe(
        '"nada lento": tira filme com tag de ritmo lento no MovieLens (slow, slow paced, meditative, contemplative, boring)',
      ),
    parecido: z
      .array(z.string().regex(/^tt\d+$/))
      .min(1)
      .optional()
      .describe(
        '"algo igual X" ou "entre X e Y": os filmes de referência (tt... do IMDb; ache com `consultar`). Só passam os 50 ' +
          'mais parecidos com eles (média entre as referências), e a Regra de escolha ordena entre esses. Faltando ' +
          'parecidos, a lista sai menor, com aviso. O pedido é da noite: não grava gosto. Com sessao, fica nos ' +
          'refazeres seguintes sem repetir; referências novas trocam a lista inteira',
      ),
    sem_parecido: z
      .boolean()
      .optional()
      .describe(
        'com sessao: tira o filtro de parecido que a Sessão trazia (o Dono pediu outra coisa)',
      ),
  },
  cli: (e) => {
    const args = ['--presentes', ...e.presentes]
    if (e.regra) args.push('--regra', e.regra)
    if (e.de) args.push('--de', e.de)
    if (e.quantos) args.push('--quantos', String(e.quantos))
    if (e.duracao_max) args.push('--duracao-max', String(e.duracao_max))
    if (e.desde !== undefined) args.push(`--desde=${e.desde}`)
    if (e.ate !== undefined) args.push(`--ate=${e.ate}`)
    if (e.idioma) args.push(`--idioma=${e.idioma}`)
    if (e.idade_crianca !== undefined)
      args.push('--crianca', String(e.idade_crianca))
    else if (e.crianca) args.push('--crianca')
    for (const gatilho of e.gatilhos ?? []) args.push(`--gatilho=${gatilho}`)
    if (e.sem_ja_visto) args.push('--sem-ja-visto')
    if (e.sem_tristeza) args.push('--sem-tristeza')
    if (e.sem_lento) args.push('--sem-lento')
    if (e.parecido?.length) args.push(`--parecido=${e.parecido.join(',')}`)
    if (e.sem_parecido) args.push('--sem-parecido')
    if (e.pedido !== undefined) args.push(`--pedido=${e.pedido}`)
    if (e.sessao) args.push('--sessao', e.sessao)
    if (e.manter?.length) args.push(`--manter=${e.manter.join(',')}`)
    if (e.trocar?.length) args.push(`--trocar=${e.trocar.join(',')}`)
    for (const clima of e.climas ?? []) args.push(`--clima=${clima}`)
    return { comando: 'recomendar', args }
  },
})
