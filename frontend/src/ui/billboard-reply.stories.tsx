// The reply: the acrescentar box with the Clima chips and Copiar pro chat,
// the bar with Enviar in each place, Enviar alone and the status line.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MODEL } from './billboard.fixture'
import { replyText, type Marks } from './billboard-marks'
import { ReplyBar, ReplyBox, SendButton, Status } from './billboard-reply'

const NO_MARKS: Marks = { addition: '', moods: null, films: {} }

/** The box with its marks held here, as the Cartaz holds them. */
function Box({ kept }: { kept: boolean }) {
  const [marks, setMarks] = useState(NO_MARKS)
  const [message, setMessage] = useState('')
  return (
    <form>
      <ReplyBox
        billboard={MODEL}
        marks={marks}
        kept={kept}
        text={replyText(MODEL, marks)}
        onMessage={setMessage}
        onAddition={(addition) => setMarks({ ...marks, addition })}
        onMoods={(moods) => setMarks({ ...marks, moods })}
      />
      <Status message={message} />
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
