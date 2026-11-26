// A screen's title and, under it, what the screen is for: the title in
// Rubik 700, the lead in the system's 16px `ink-2`, up to 60ch.

export function PageHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="flex flex-col gap-xs">
      <h1 className="font-display text-page-title text-balance">{title}</h1>
      {lead && <p className="max-w-[60ch] text-pretty text-ink-2">{lead}</p>}
    </div>
  )
}
