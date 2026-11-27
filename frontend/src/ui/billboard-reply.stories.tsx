// The reply: the acrescentar box with the Clima chips,
// the bar with Enviar in each place, Enviar alone and the status line.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SEND_STATUS } from './billboard-send.copy'
import { MODEL } from './billboard.fixture'
import type { Marks } from './billboard-marks'
import { ReplyBar, ReplyBox, SendButton, Status } from './billboard-reply'

const NO_MARKS: Marks = { addition: '', moods: null, films: {} }

/** The box with its marks held here, as the Cartaz holds them. */
function Box({ kept }: { kept: boolean }) {
  const [marks, setMarks] = useState(NO_MARKS)
  return (
    <form>
      <ReplyBox
        billboard={MODEL}
        marks={marks}
        kept={kept}
        onAddition={(addition) => setMarks({ ...marks, addition })}
        onMoods={(moods) => setMarks({ ...marks, moods })}
      />
    </form>
  )
}

const meta = {
  component: ReplyBar,
  args: {
    summary: '1 Trocar e 1 Já vi',
    message: '',
    onSend: fn(),
    place: 'end',
  },
} satisfies Meta<typeof ReplyBar>

export default meta

type Story = StoryObj<typeof meta>

export const AdditionBox: Story = {
  render: () => <Box kept />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole('textbox')
    await userEvent.type(field, 'chegou a Ana')
    await expect(field).toHaveValue('chegou a Ana')
    // "Responder" reads at a heading's step, and the Clima fold opens.
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Responder' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByText('Mudar o clima (refaz a lista)'))
    await expect(canvas.getByRole('group', { name: /^Clima/u })).toBeVisible()
  },
}

export const AdditionBoxNotKept: Story = { render: () => <Box kept={false} /> }

export const BarAtTheEnd: Story = {}

export const BarOnTheTabs: Story = { args: { place: 'tabs' } }

export const BarAtTheFoot: Story = {
  args: { place: 'foot', message: 'Nada marcado ainda.' },
}

export const SendAlone: Story = {
  render: () => <SendButton onSend={fn()} />,
}

export const SentToChat: Story = {
  render: () => (
    <div className="p-md">
      <div className="flex flex-col gap-md">
        <Status message={SEND_STATUS.regenerating} />
        <Status message={SEND_STATUS.toChat} />
        <Status message={SEND_STATUS.notNotified} />
      </div>
    </div>
  ),
}

/** This very reply went: Enviar waits for a new mark (#277). */
export const BarSent: Story = {
  args: { place: 'foot', sent: true, message: SEND_STATUS.regenerating },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Enviado ✓' }),
    ).toBeDisabled()
  },
}

/** Another Clima, in bold, since it redoes the whole list. */
export const BarWithClima: Story = {
  args: { summary: '1 Trocar', moods: ['leve', 'pra rir'] },
}

/** The host could not send: Copiar beside the status. */
export const BarCouldNotSend: Story = {
  args: {
    place: 'foot',
    message: 'Não dá pra enviar por aqui. Toque em Copiar e cole no chat.',
    copy: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
    onMessage: fn(),
  },
}

/** The engine refused it: Enviar tries again. */
export const BarRetry: Story = {
  args: {
    place: 'foot',
    retry: true,
    message: 'Não consegui enviar. Tente de novo ou copie pro chat.',
  },
}
