// "Mostrar QR" (#396): the Link da Sessão full screen, for the phones in
// the TV room.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SessionQr } from './session-qr'

/** The Cartaz keeps `open`; here, a state of the story's own. */
function Owned({ url, open }: { url: string; open: boolean }) {
  const [shown, setShown] = useState(open)
  return (
    <SessionQr
      url={url}
      open={shown}
      onOpen={() => setShown(true)}
      onClose={() => setShown(false)}
    />
  )
}

const meta = {
  title: 'Sessões/Mostrar QR',
  component: SessionQr,
  args: {
    url: 'https://cinema.temestudo.cloud/participar?sessao=2026-11-20-iara&chave=Xq3v9b0WmT1yRk7cJp2LsZ8nHd4eGa6uVf5oBi_Nw-Y',
    open: false,
    onOpen: fn(),
    onClose: fn(),
  },
  render: ({ url, open }) => <Owned url={url} open={open} />,
} satisfies Meta<typeof SessionQr>

export default meta

type Story = StoryObj<typeof meta>

export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mostrar QR' }))
    const dialog = canvas.getByRole('dialog', { name: 'Entrem pelo celular' })
    await expect(dialog).toBeVisible()
    const code = within(dialog).getByRole('img', {
      name: 'QR code do link para os Presentes',
    })
    // Big enough for a phone across the room, and square.
    const box = code.getBoundingClientRect()
    await expect(box.width).toBeGreaterThanOrEqual(160)
    await expect(box.height).toBe(box.width)
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fechar' }),
    )
    await expect(canvas.queryByRole('dialog')).toBeNull()
  },
}

export const Open: Story = {
  args: { open: true },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement).getByRole('dialog', {
      name: 'Entrem pelo celular',
    })
    await expect(dialog).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fechar' }),
    )
    await expect(within(canvasElement).queryByRole('dialog')).toBeNull()
  },
}
