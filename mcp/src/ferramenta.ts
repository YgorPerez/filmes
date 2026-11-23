// O formato de uma ferramenta MCP: cada uma é um arquivo em src/ferramentas/
// com `export default definirFerramenta({...})`. O servidor acha todas pelo diretório.
import { z } from "zod";

export type Ferramenta<Forma extends z.ZodRawShape = z.ZodRawShape> = {
  nome: string;
  descricao: string;
  entrada: Forma;
  /** Comando da CLI, argumentos depois de `--json` e, se o comando lê o stdin, o texto que vai nele,
   * a partir da entrada já validada. */
  cli: (entrada: z.infer<z.ZodObject<Forma>>) => { comando: string; args?: string[]; stdin?: string };
};

export function definirFerramenta<Forma extends z.ZodRawShape>(f: Ferramenta<Forma>): Ferramenta<Forma> {
  return f;
}

/** Texto que vira argumento posicional da CLI: não pode começar com "-" nem espaço,
 * para não ser lido como opção. */
export function semHifen(o_que: string) {
  return z.string().regex(/^[^-\s]/, `${o_que} não pode começar com '-' nem espaço`);
}
