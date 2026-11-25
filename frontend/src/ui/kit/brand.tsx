// "filmes" on the case's black (DESIGN.md, Barra do topo): the brand in
// Rubik 800 18px `case-ink`. The app shell's top bar is the bar this sits
// in; until then each screen opens with it.

export function Brand() {
  return (
    <p className="self-start rounded-rail bg-case px-2xl py-lg font-display text-brand text-case-ink">
      filmes
    </p>
  )
}
