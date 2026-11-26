// The rental slip: with its title and aside, and with a head of its own.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Slip } from './slip'

const meta = {
  component: Slip,
  args: {
    id: 'latest',
    title: 'Última Sessão',
    aside: '21/11',
    lead: 'O que vocês viram e o que acharam.',
    children: <p>Bruno e Vera, algo leve.</p>,
  },
} satisfies Meta<typeof Slip>

export default meta

type Story = StoryObj<typeof meta>

export const WithTitle: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Última Sessão' }),
    ).toBeVisible()
  },
}

export const WithHead: Story = {
  render: () => (
    <Slip as="article" head={<strong>Sessão de 21/11</strong>}>
      <p>Bruno e Vera, algo leve.</p>
    </Slip>
  ),
}
