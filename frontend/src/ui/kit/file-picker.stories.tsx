// The file field of the imports: empty, and refused by the server.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { FilePicker } from './file-picker'

const meta = {
  component: FilePicker,
  args: {
    name: 'arquivo',
    label: 'ZIP do Letterboxd',
    accept: '.zip,application/zip',
    extensions: ['.zip'],
    wrongType:
      'Esse não é o ZIP do Letterboxd: ele termina em .zip. Envie como baixou, sem abrir.',
    copy: {
      pick: 'Escolher o arquivo',
      none: 'Nenhum arquivo escolhido',
      change: 'Tocar para trocar',
    },
  },
  decorators: [
    (Story) => (
      <form className="max-w-[480px]">
        <Story />
      </form>
    ),
  ],
} satisfies Meta<typeof FilePicker>

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Escolher o arquivo'),
    ).toBeVisible()
  },
}

/** The server refused the last post: the field says why, under it. */
export const Refused: Story = {
  args: {
    error:
      'Esse arquivo não parece ser do Letterboxd, do Trakt, do IMDb nem do Simkl.',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeVisible()
  },
}
