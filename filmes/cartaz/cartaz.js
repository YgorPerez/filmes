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
