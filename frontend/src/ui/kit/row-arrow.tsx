import { Icon } from './icon'

// The 16px arrow at the end of a row that leads to another page (DESIGN.md,
// Prateleira de navegação), drawn, in `ink-2`.

export function RowArrow({ className = '' }: { className?: string }) {
  return <Icon name="arrow" className={`size-4 text-ink-2 ${className}`} />
}
