// The Escolha de grupo on the Link da Sessão (#415): the groups of films a
// new Presente picks before the Perguntas par a par.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { GroupPickQuestion } from './group-pick'
import { GROUP_PICK } from './group-pick.copy'
import { GROUPS } from './group-pick.fixture'

const meta = {
  component: GroupPickQuestion,
  args: {
    groups: GROUPS,
    link: {
      session: '2026-11-20-teo',
      token: 'k'.repeat(43),
      person: 'teo',
    },
    back: '/participar?sessao=2026-11-20-teo',
    owner: 'Bruno',
  },
} satisfies Meta<typeof GroupPickQuestion>

export default meta

type Story = StoryObj<typeof meta>

export const Groups: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: GROUP_PICK.title }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('checkbox', { name: /Faróis e marés/u }),
    ).toBeVisible()
  },
}

/** Three marked: the fourth waits. */
export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boxes = canvas.getAllByRole('checkbox')
    for (const box of boxes.slice(0, 3)) await userEvent.click(box)
    await expect(canvas.getByText(GROUP_PICK.picked(3, 3))).toBeVisible()
    await expect(boxes[3]).toBeDisabled()
  },
}

export const Failed: Story = { args: { failed: true } }
