import type { Preview } from '@storybook/react-vite'
// The tokens and the base, as in the app, and the self-hosted fonts the app
// serves at `/fonts/fonts.css` (`src/platform/fonts.ts`).
import '../src/styles.css'
import './fonts.css'

const preview: Preview = {
  parameters: {
    viewport: {
      options: {
        mobile: {
          name: 'Mobile 412×915',
          styles: { width: '412px', height: '915px' },
          type: 'mobile',
        },
      },
    },
  },
  // The app is mobile first (DESIGN.md).
  initialGlobals: { viewport: { value: 'mobile' } },
}

export default preview
