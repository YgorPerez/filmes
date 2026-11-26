// The options to mark: pills and rows, checkbox and radio, marked or not.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { Option } from './option'

const meta = {
  component: Option,
  args: { name: 'mood', children: 'pra rir' },
} satisfies Meta<typeof Option>

export default meta

type Story = StoryObj<typeof meta>

export const Pill: Story = {
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox', { name: 'pra rir' })
    await userEvent.click(box)
    await expect(box).toBeChecked()
  },
}

export const Marked: Story = { args: { defaultChecked: true } }

export const Rows: Story = {
  render: () => (
    <div className="flex flex-col gap-sm">
      <Option
        type="radio"
        name="rule"
        value="default"
        shape="row"
        defaultChecked
      >
        Padrão: o filme que agrada a todos os Presentes
      </Option>
      <Option type="radio" name="rule" value="mean" shape="row">
        Média: a maior média, mesmo que alguém goste menos
      </Option>
    </div>
  ),
}

function Held() {
  const [checked, setChecked] = useState(false)
  return (
    <Option name="mood" checked={checked} onChange={setChecked}>
      {checked ? 'leve (marcado)' : 'leve'}
    </Option>
  )
}

export const HeldByThePage: Story = {
  render: () => <Held />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('checkbox'))
    await expect(
      within(canvasElement).getByText('leve (marcado)'),
    ).toBeVisible()
  },
}
