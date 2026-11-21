// Chamada da CLI do motor como subprocesso: python -m filmes <comando> --json ...
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type ErroCli = { erro: { codigo: string; mensagem: string } };
export type ProgressoCli = { progresso: number; total: number; mensagem: string };
export type ResultadoCli = { ok: true; dados: unknown } | { ok: false; dados: ErroCli };

/** O Python que roda o motor: FILMES_PYTHON, o .venv do repo ou python3. */
export function comandoPython(): string {
  if (process.env.FILMES_PYTHON) return process.env.FILMES_PYTHON;
  const venv = join(RAIZ, ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}

/** Roda um comando da CLI e devolve o JSON dela, de sucesso ou de erro. */
export function chamarCli(
  comando: string, args: string[] = [], progresso?: (etapa: ProgressoCli) => void,
): Promise<ResultadoCli> {
  return new Promise((resolver) => {
    const processo = execFile(
      comandoPython(),
      ["-m", "filmes", comando, "--json", ...args],
      { cwd: RAIZ, env: process.env, maxBuffer: 64 * 1024 * 1024 },
      (falha, stdout, stderr) => {
        let dados: unknown;
        try {
          dados = JSON.parse(stdout);
        } catch {
          const mensagem = (stderr || falha?.message || "a CLI não devolveu JSON").trim();
          resolver({ ok: false, dados: { erro: { codigo: "cli_sem_json", mensagem } } });
          return;
        }
        resolver(falha ? { ok: false, dados: dados as ErroCli } : { ok: true, dados });
      },
    );
    if (progresso && processo.stderr) {
      createInterface({ input: processo.stderr }).on("line", (linha) => {
        let etapa: Partial<ProgressoCli>;
        try {
          etapa = JSON.parse(linha);
        } catch {
          return;
        }
        if (etapa && typeof etapa.progresso === "number" && typeof etapa.total === "number"
          && typeof etapa.mensagem === "string") {
          progresso({ progresso: etapa.progresso, total: etapa.total, mensagem: etapa.mensagem });
        }
      });
    }
  });
}
