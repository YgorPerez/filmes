// Cartaz que responde (#60). O formato do texto está no docstring de filmes/cartaz/__init__.py.
// textoDoCartaz é pura (os testes a rodam no node); o resto só liga os controles no navegador.
function textoDoCartaz(estado) {
  const umaLinha = (t) => (t || "").replace(/\s+/g, " ").trim();
  const linhas = [`#cartaz ${estado.sessao} v${estado.versao}`];
  const acrescentar = umaLinha(estado.acrescentar);
  if (acrescentar) linhas.push(`acrescentar: ${acrescentar}`);
  for (const f of estado.filmes) {
    const partes = [];
    const jaVi = estado.presentes.filter((p) => f.jaVi.includes(p));
    const notas = f.notas || {}, achados = f.achou || {};
    // " · " separa as marcações: dentro do que a Pessoa achou, vira " - ".
    const achou = (p) => umaLinha((achados[p] || "").replace(/\s*·\s*/g, " - ")).replace(/^- | -$/g, "").trim();
    const temDetalhe = jaVi.some((p) => notas[p] || achou(p));
    if (jaVi.length > 1 && jaVi.length === estado.presentes.length && !temDetalhe) partes.push("já vi: todos");
    else if (jaVi.length) partes.push(`já vi: ${jaVi.map((p) => (notas[p] ? `${p}=${notas[p]}` : p)).join(", ")}`);
    for (const p of jaVi) if (achou(p)) partes.push(`achou ${p}: ${achou(p)}`);
    if (f.trocar) partes.push("trocar");
    if (f.estrelas) partes.push(`estrelas: ${f.estrelas}`);
    const comentario = umaLinha(f.comentario);
    if (comentario) partes.push(`comentário: ${comentario}`);
    if (partes.length) linhas.push([`${f.posicao} ${f.id}`, ...partes].join(" · "));
  }
  return linhas.join("\n") + "\n";
}

if (typeof document !== "undefined") (function () {
  const R = document.querySelector(".cartaz");
  const presentes = R.dataset.presentes.split(" ");
  const aviso = R.querySelector(".aviso"), saida = R.querySelector(".saida");
  let tAviso;
  const avisar = (msg) => { aviso.textContent = msg; clearTimeout(tAviso); tAviso = setTimeout(() => { aviso.textContent = ""; }, 6000); };
  const cards = () => [...R.querySelectorAll(".card")];
  function ajustar(card) {
    const marcados = [...card.querySelectorAll("input.javi:checked")];
    const todos = card.querySelector("input.javi-todos");
    if (todos) todos.checked = marcados.length === presentes.length;
    card.querySelectorAll(".javi-detalhe").forEach((d) => {
      const viu = card.querySelector(`input.javi[value="${d.dataset.pessoa}"]`).checked;
      d.hidden = !viu;
      d.querySelectorAll("input, textarea").forEach((campo) => { campo.disabled = !viu; });
    });
    card.classList.toggle("trocar", card.querySelector("input.trocar").checked);
  }
  function estado() {
    return {
      sessao: R.dataset.sessao, versao: +R.dataset.versao, presentes,
      acrescentar: R.querySelector(".acrescentar").value,
      filmes: cards().map((c) => {
        const estrela = c.querySelector(".estrelas input:checked");
        const notas = {}, achou = {};
        c.querySelectorAll(".javi-detalhe:not([hidden])").forEach((d) => {
          const valor = Math.round(+d.querySelector("input.nota").value);
          if (valor >= 1 && valor <= 10) notas[d.dataset.pessoa] = valor;
          achou[d.dataset.pessoa] = d.querySelector(".achou").value;
        });
        return {
          posicao: +c.dataset.posicao, id: c.dataset.id,
          jaVi: [...c.querySelectorAll("input.javi:checked")].map((i) => i.value),
          notas, achou,
          trocar: c.querySelector("input.trocar").checked,
          estrelas: estrela ? +estrela.value : 0,
          comentario: c.querySelector(".comentario").value,
        };
      }),
    };
  }
  cards().forEach((c) => {
    c.querySelectorAll("input.javi, input.trocar").forEach((i) => i.addEventListener("change", () => ajustar(c)));
    const todos = c.querySelector("input.javi-todos");
    if (todos) todos.addEventListener("change", () => {
      c.querySelectorAll("input.javi").forEach((i) => { i.checked = todos.checked; });
      ajustar(c);
    });
    c.querySelectorAll(".estrelas input").forEach((i) => {
      i.addEventListener("click", () => {
        if (i.dataset.era === "1") { i.checked = false; i.dataset.era = "0"; }
        else { c.querySelectorAll(".estrelas input").forEach((x) => { x.dataset.era = "0"; }); i.dataset.era = "1"; }
      });
    });
    ajustar(c);
  });
  // Guarda o que foi marcado a cada mudança e restaura ao recarregar: o T3 recarrega o
  // quadro quando o Dono troca de aba. Uma chave por Sessão e versão.
  const chave = `filmes-cartaz:${R.dataset.sessao}:v${R.dataset.versao}`;
  const guardado = R.querySelector(".guardado");
  let loja = null;
  try { loja = window.localStorage; loja.setItem(chave + ":teste", "1"); loja.removeItem(chave + ":teste"); }
  catch (e) { loja = null; }
  function bruto() {
    return {
      acrescentar: R.querySelector(".acrescentar").value,
      filmes: Object.fromEntries(cards().map((c) => [c.dataset.id, {
        jaVi: [...c.querySelectorAll("input.javi:checked")].map((i) => i.value),
        detalhes: Object.fromEntries([...c.querySelectorAll(".javi-detalhe")].map((d) => [d.dataset.pessoa, {
          nota: d.querySelector("input.nota").value, achou: d.querySelector(".achou").value }])),
        trocar: c.querySelector("input.trocar").checked,
        estrelas: (c.querySelector(".estrelas input:checked") || {}).value || "",
        comentario: c.querySelector(".comentario").value,
      }])),
    };
  }
  function guardar() {
    if (!loja) return;
    try { loja.setItem(chave, JSON.stringify(bruto())); } catch (e) { /* cheio ou bloqueado: segue sem guardar */ }
  }
  function restaurar() {
    let salvo = null;
    try { salvo = loja && JSON.parse(loja.getItem(chave) || "null"); } catch (e) { salvo = null; }
    if (!salvo) return;
    R.querySelector(".acrescentar").value = salvo.acrescentar || "";
    for (const c of cards()) {
      const f = (salvo.filmes || {})[c.dataset.id];
      if (!f) continue;
      c.querySelectorAll("input.javi").forEach((i) => { i.checked = (f.jaVi || []).includes(i.value); });
      c.querySelectorAll(".javi-detalhe").forEach((d) => {
        const x = (f.detalhes || {})[d.dataset.pessoa] || {};
        d.querySelector("input.nota").value = x.nota || "";
        d.querySelector(".achou").value = x.achou || "";
      });
      c.querySelector("input.trocar").checked = !!f.trocar;
      c.querySelectorAll(".estrelas input").forEach((i) => {
        i.checked = i.value === f.estrelas; i.dataset.era = i.checked ? "1" : "0";
      });
      c.querySelector(".comentario").value = f.comentario || "";
      ajustar(c);
    }
  }
  restaurar();
  R.addEventListener("input", guardar);
  R.addEventListener("change", guardar);
  if (guardado) guardado.textContent = loja
    ? "O que você marcar fica guardado neste navegador, mesmo trocando de aba."
    : "Este navegador não deixa o cartaz guardar: se trocar de aba, o que foi marcado se perde.";
  function mostrar(txt) {
    saida.hidden = false; saida.value = txt; saida.focus(); saida.select();
    avisar("Não deu pra copiar sozinho: o texto está selecionado na caixa, copie e cole no chat.");
  }
  R.querySelector(".copiar").addEventListener("click", () => {
    const txt = textoDoCartaz(estado());
    if (txt.split("\n").length <= 2) { avisar("Nada marcado ainda."); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => avisar("Copiado. Cole no chat."), () => mostrar(txt));
    } else mostrar(txt);
  });
  R.classList.add("com-js");
})();
