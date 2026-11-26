import { resolve } from 'node:path'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

// The stories' Vite: the app's Tailwind and React, without TanStack Start and
// nitro, which build the server no story has.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // A piece's module may define a server function next to what the piece
    // uses (`content/catalog-search.ts`). Without the Start plugin, Start's
    // own modules do not run in the browser: the stories get stand-ins whose
    // server functions refuse the call. No story calls one.
    alias: [
      {
        find: /^@tanstack\/react-start$/,
        replacement: resolve(
          import.meta.dirname,
          '../src/platform/storybook/start-stand-in.ts',
        ),
      },
      {
        find: /^@tanstack\/react-start\/server$/,
        replacement: resolve(
          import.meta.dirname,
          '../src/platform/storybook/start-server-stand-in.ts',
        ),
      },
    ],
  },
  plugins: [
    tailwindcss(),
    viteReact(),
    // The React Compiler too, so the story renders as the app's browser
    // bundle renders.
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
