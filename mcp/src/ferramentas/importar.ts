import { z } from 'zod'
import { definirFerramenta } from '../ferramenta.ts'

export default definirFerramenta({
  nome: 'importar',
  descricao:
    'Importa o ZIP do Letterboxd ou do Trakt, ou o RSS público do Letterboxd, de uma Pessoa. Informe uma origem por vez. O RSS só com o consentimento da Pessoa. Devolve o relatório de resolução. Com remover, tira um import: o registro na Pessoa, o arquivo guardado e os Fatos que só ele trazia.',
  entrada: {
    pessoa: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('slug, nome ou apelido da Pessoa; opcional com remover'),
    letterboxd: z
      .string()
      .min(1)
      .optional()
      .describe('caminho do ZIP exportado pelo Letterboxd'),
    letterboxd_rss: z
      .string()
      .regex(/^[A-Za-z0-9_]+$/)
      .optional()
      .describe(
        'usuário do Letterboxd: baixa o RSS público com as ~50 entradas recentes do diário',
      ),
    trakt: z
      .string()
      .min(1)
      .optional()
      .describe('caminho do ZIP do Raw Export do Trakt'),
    remover: z
      .string()
      .min(1)
      .optional()
      .describe(
        'o arquivo do import, como pessoa ver mostra em imports (imports/<pessoa>/...), ou só o nome dele',
      ),
  },
  cli: (e) => ({
    comando: 'importar',
    args: [
      ...(e.pessoa ? [`--pessoa=${e.pessoa}`] : []),
      ...(e.letterboxd ? [`--letterboxd=${e.letterboxd}`] : []),
      ...(e.letterboxd_rss ? [`--letterboxd-rss=${e.letterboxd_rss}`] : []),
      ...(e.trakt ? [`--trakt=${e.trakt}`] : []),
      ...(e.remover ? [`--remover=${e.remover}`] : []),
    ],
  }),
})
