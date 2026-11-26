// The React Doctor exceptions, each one tied to the listed files and with the
// reason, as in pesquisa-relacionamentos. A new exception waits for a person
// to read it, like a suppression (`.github/scripts/suppressions.ts`).

import { defineConfig } from 'react-doctor/api'

export default defineConfig({
  ignore: {
    // The builds (the app's and Storybook's) are not source code.
    files: ['.output/**', 'storybook-static/**'],
  },
})
