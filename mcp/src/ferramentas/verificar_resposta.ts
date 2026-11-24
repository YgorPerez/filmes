import { z } from 'zod'
import { definirFerramenta } from '../ferramenta.ts'

export default definirFerramenta({
  nome: 'verificar_resposta',
  descricao:
    'Confere a resposta em Markdown antes de mostrá-la. Compara as linhas de Evidência com as da Recomendação ' +
    'gravada na Sessão, por filme e por Presente. Devolve valida e linhas_invalidas. Use o formato da skill filmes.',
  entrada: {
    sessao: z
      .string()
      .min(1)
      .describe('ID da Sessão devolvido em sessao.id por recomendar'),
    texto: z
      .string()
      .min(1)
      .describe('Resposta completa em Markdown, como será enviada ao Dono'),
  },
  cli: ({ sessao, texto }) => ({
    comando: 'verificar',
    args: [`--sessao=${sessao}`, `--texto=${texto}`],
  }),
})
