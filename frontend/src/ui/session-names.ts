// The Presentes' names in one line, beside their avatars (`session-parts.tsx`).
// Code, not a component: it stays out of the component files, as Fast
// Refresh needs.

/** "Bruno, Vera, Teo". */
export const names = (people: readonly { readonly name: string }[]) =>
  people.map((p) => p.name).join(', ')
