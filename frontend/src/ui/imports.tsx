import type { ReactNode } from 'react'
import { buttonVariants } from './kit/button-variants'

/** The frame of the Imports screens: the letreiro and the way back. */
export function ImportsFrame({
  back,
  backTo,
  children,
}: {
  back: string
  backTo: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
      <header className="flex flex-wrap items-center justify-between gap-xl">
        <a href={backTo} className={buttonVariants({ variant: 'option' })}>
          {back}
        </a>
      </header>
      {children}
    </main>
  )
}
