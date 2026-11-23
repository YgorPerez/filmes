"""O cartaz guarda o que o Dono marcou e restaura ao recarregar.

O T3 Code recarrega o quadro do cartaz quando o Dono troca de aba. O script do
cartaz guarda as marcações no localStorage, numa chave por Sessão e versão, e as
põe de volta quando a página carrega de novo. O teste abre o HTML que a CLI
gravou no jsdom (em mcp/node_modules), marca, recarrega numa janela nova com o
mesmo armazenamento e confere.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from test_cartaz_responde import _cartaz

RAIZ = Path(__file__).resolve().parents[1]
MODULOS = RAIZ / "mcp" / "node_modules"

PROGRAMA = r"""
const { JSDOM } = require("jsdom");
const html = require("fs").readFileSync(process.argv[1], "utf8");
const passos = JSON.parse(process.argv[2]);
const abrir = (guardado, bloquear) => new JSDOM(html, {
  url: "https://cartaz.local/", runScripts: "dangerously", pretendToBeVisual: true,
  beforeParse(w) {
    if (bloquear) Object.defineProperty(w, "localStorage", { get() { throw new Error("bloqueado"); } });
    else for (const [k, v] of Object.entries(guardado)) w.localStorage.setItem(k, v);
  },
}).window;
const evento = (w, el, tipo) => el.dispatchEvent(new w.Event(tipo, { bubbles: true }));
const card = (w, id) => w.document.querySelector(`.card[data-id="${id}"]`);

const w1 = abrir({}, passos.bloquear);
for (const p of passos.marcar) {
  const c = card(w1, p.id);
  if (p.javi) { const i = c.querySelector(`input.javi[value="${p.javi}"]`); i.checked = true; evento(w1, i, "change"); }
  if (p.nota) { const d = c.querySelector(`.javi-detalhe[data-pessoa="${p.javi}"]`);
    const i = d.querySelector("input.nota"); i.value = p.nota; evento(w1, i, "input");
    const a = d.querySelector(".achou"); a.value = p.achou; evento(w1, a, "input"); }
  if (p.trocar) { const i = c.querySelector("input.trocar"); i.checked = true; evento(w1, i, "change"); }
  if (p.estrelas) { const i = c.querySelector(`.estrelas input[value="${p.estrelas}"]`); i.checked = true; evento(w1, i, "change"); }
  if (p.comentario) { const t = c.querySelector(".comentario"); t.value = p.comentario; evento(w1, t, "input"); }
}
if (passos.acrescentar) { const t = w1.document.querySelector(".acrescentar"); t.value = passos.acrescentar; evento(w1, t, "input"); }

const guardado = {};
if (!passos.bloquear) for (let i = 0; i < w1.localStorage.length; i++) {
  const k = w1.localStorage.key(i); guardado[k] = w1.localStorage.getItem(k);
}
const w2 = passos.bloquear ? w1 : abrir(guardado, false);
const lido = [...w2.document.querySelectorAll(".card")].map((c) => ({
  id: c.dataset.id,
  javi: [...c.querySelectorAll("input.javi:checked")].map((i) => i.value),
  detalhes: [...c.querySelectorAll(".javi-detalhe:not([hidden])")].map((d) => [
    d.dataset.pessoa, d.querySelector("input.nota").value, d.querySelector(".achou").value]),
  trocar: c.querySelector("input.trocar").checked,
  estrelas: (c.querySelector(".estrelas input:checked") || {}).value || "",
  comentario: c.querySelector(".comentario").value,
}));
process.stdout.write(JSON.stringify({
  chaves: Object.keys(guardado), filmes: lido,
  acrescentar: w2.document.querySelector(".acrescentar").value,
  guardado: w2.document.querySelector(".guardado").textContent,
}));
"""


def _rodar(html_path, passos):
    node = shutil.which("node")
    if node is None or not (MODULOS / "jsdom").exists():
        pytest.skip("node ou jsdom (npm ci em mcp/) ausente")
    feito = subprocess.run([node, "-e", PROGRAMA, str(html_path), json.dumps(passos)],
                           capture_output=True, text=True, check=True,
                           env={"NODE_PATH": str(MODULOS), "PATH": "/usr/bin:/bin"})
    return json.loads(feito.stdout)


def _sessao_e_cartaz(banco, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono", "iara")
    _cartaz(banco, tmp_path, sessao["sessao"]["id"])
    return sessao, tmp_path / "cartaz.html"


def test_o_que_foi_marcado_volta_quando_o_cartaz_recarrega(banco, tmp_path):
    sessao, html = _sessao_e_cartaz(banco, tmp_path)
    f = [x["id"] for x in sessao["filmes"]]

    lido = _rodar(html, {"bloquear": False, "acrescentar": "chegou a Ana", "marcar": [
        {"id": f[0], "javi": "iara", "nota": "8", "achou": "lindo"},
        {"id": f[1], "trocar": True, "estrelas": "4", "comentario": "longo"},
    ]})

    assert lido["chaves"] == [f"filmes-cartaz:{sessao['sessao']['id']}:v1"]
    assert lido["acrescentar"] == "chegou a Ana"
    por_id = {x["id"]: x for x in lido["filmes"]}
    assert (por_id[f[0]]["javi"], por_id[f[0]]["detalhes"]) == (["iara"], [["iara", "8", "lindo"]])
    assert (por_id[f[1]]["trocar"], por_id[f[1]]["estrelas"], por_id[f[1]]["comentario"]) == (True, "4", "longo")
    assert por_id[f[2]] == {"id": f[2], "javi": [], "detalhes": [], "trocar": False, "estrelas": "", "comentario": ""}
    assert "fica guardado" in lido["guardado"]


def test_sem_localstorage_o_cartaz_funciona_sem_aviso(banco, tmp_path):
    sessao, html = _sessao_e_cartaz(banco, tmp_path)
    f = sessao["filmes"][0]["id"]

    lido = _rodar(html, {"bloquear": True, "marcar": [{"id": f, "trocar": True}]})

    assert lido["filmes"][0]["trocar"] is True
    assert lido["guardado"] == ""
