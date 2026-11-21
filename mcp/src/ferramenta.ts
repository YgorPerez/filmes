// O formato de uma ferramenta MCP: cada uma é um arquivo em src/ferramentas/
// com `export default definirFerramenta({...})`. O servidor acha todas pelo diretório.
import type { z } from "zod";

export type Ferramenta<Forma extends z.ZodRawShape = z.ZodRawShape> = {
  nome: string;
  descricao: string;
  entrada: Forma;
  /** Comando da CLI e argumentos depois de `--json`, a partir da entrada já validada. */
  cli: (entrada: z.infer<z.ZodObject<Forma>>) => { comando: string; args?: string[] };
};

export function definirFerramenta<Forma extends z.ZodRawShape>(f: Ferramenta<Forma>): Ferramenta<Forma> {
  return f;
}
