// A fold with no box, inside a slip: "Ou envie o ZIP do Trakt" on the
// import page (#274).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { FoldRow } from './fold-row'

const meta = {
  component: FoldRow,
  args: {
    summary: 'Ou envie o ZIP do Trakt',
    children: <p className="text-evidence">Envie o ZIP aqui, sem abrir.</p>,
  },
  decorators: [
    (Story) => (
      <div className="flex max-w-[480px] flex-col gap-xl rounded-card border border-rule bg-surface p-xl">
        <p className="text-meta text-ink-2">
          O melhor caminho: conecte a conta.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FoldRow>

export default meta

type Story = StoryObj<typeof meta>

/** Closed, the row says what it holds and draws a +; a tap opens it and
 * the + turns into a ×. It is no box: no border of its own but the rule
 * above. */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const summary = canvas.getByText('Ou envie o ZIP do Trakt')
    const fold = summary.closest('details')!
    await expect(
      canvas.getByText('Envie o ZIP aqui, sem abrir.'),
    ).not.toBeVisible()
    await expect(getComputedStyle(fold).borderLeftWidth).toBe('0px')
    await expect(summary.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44,
    )
    await userEvent.click(summary)
    await expect(canvas.getByText('Envie o ZIP aqui, sem abrir.')).toBeVisible()
    await expect(fold.open).toBe(true)
  },
}

/** Open from the start: what it holds came back refused. A fold inside it
 * stays closed. */
export const OpenWithANestedFold: Story = {
  args: {
    open: true,
    children: (
      <FoldRow summary="Ler outro perfil">
        <p>O campo do perfil.</p>
      </FoldRow>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const inner = canvas.getByText('Ler outro perfil')
    await expect(inner).toBeVisible()
    await expect(inner.closest('details')!.open).toBe(false)
    await expect(canvas.getByText('O campo do perfil.')).not.toBeVisible()
  },
}
