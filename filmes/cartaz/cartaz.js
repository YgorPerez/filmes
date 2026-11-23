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
    if (jaVi.length === 1) {
      partes.push(`já vi: ${jaVi[0]}${f.nota ? `=${f.nota}` : ""}`);
      // " · " separa as marcações: dentro do que a Pessoa achou, vira " - ".
      const achou = umaLinha((f.achou || "").replace(/\s+·\s+|\s+·$|^·\s+/g, " - ")).replace(/^- | -$/g, "");
      if (achou) partes.push(`achou: ${achou}`);
    }
    else if (jaVi.length && jaVi.length === estado.presentes.length) partes.push("já vi: todos");
    else if (jaVi.length) partes.push(`já vi: ${jaVi.join(", ")}`);
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
    for (const campo of [card.querySelector("input.nota"), card.querySelector(".achou")]) {
      campo.disabled = marcados.length !== 1;
      campo.closest("label").hidden = marcados.length !== 1;
    }
    card.classList.toggle("trocar", card.querySelector("input.trocar").checked);
  }
  function estado() {
    return {
      sessao: R.dataset.sessao, versao: +R.dataset.versao, presentes,
      acrescentar: R.querySelector(".acrescentar").value,
      filmes: cards().map((c) => {
        const estrela = c.querySelector(".estrelas input:checked");
        const nota = c.querySelector("input.nota");
        const valor = Math.round(+nota.value);
        return {
          posicao: +c.dataset.posicao, id: c.dataset.id,
          jaVi: [...c.querySelectorAll("input.javi:checked")].map((i) => i.value),
          nota: !nota.disabled && valor >= 1 && valor <= 10 ? valor : null,
          achou: nota.disabled ? "" : c.querySelector(".achou").value,
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
