# Every piece in `src/ui/` has a story

pesquisa-relacionamentos opens every `src/ui/` piece in Storybook and fails `pnpm check` when one has no story (its ADR 0036). filmes had no Storybook: a piece could break and nobody saw it until it showed up on a screen, and the jsdom tests do not render CSS, the phone width or the Tailwind tokens (#234).

## Decision

- **Storybook lives in `frontend/`**, on the workspace's single Vite+ and Vitest from the catalog. It reads its own Vite config (`.storybook/vite.config.ts`): Tailwind, React and the React Compiler, as in the browser bundle, without TanStack Start and nitro, which build a server no story has.
- **`frontend/lint/stories.ts`, in `pnpm check`, fails each `.tsx` in `src/ui/` (`ui/kit/` and `ui/shadcn/` included) that no `*.stories.tsx` imports.** It reads the imports with Vite's parser, without importing the app; relative and `#/` imports count, `import type` does not. A test or another piece that imports the piece does not count: the story is where the piece is seen. The story may live in another file, but each piece has its own `<name>.stories.tsx` next to it today.
- **`pnpm test:stories` opens each story in a real Chrome** (Vitest browser with Playwright, `vitest.stories.config.ts`), at 412×915 and at 1280×800. A story fails when it throws, when its `play` fails or when it writes an error or a warning to the console. It runs in CI's `stories` job, not in `pnpm check`: the browser is heavy.
- **Stories take their data as props, never from the server.** A story imports only types from `@filmes/engine` and `#/platform/*`: their values pull Node into the browser. A piece's module may still define a server function next to what the piece uses (`content/catalog-search.ts`); Storybook aliases `@tanstack/react-start` to a stand-in (`src/platform/storybook/start-stand-in.ts`) whose server functions refuse the call.

## Consequences

- A new piece needs a story in the same PR.
- The story imports count in fallow's fan-in. Where a type is all a story needs, it derives it from the piece's props (`ComponentProps<typeof X>`) instead of importing it from `#/platform/*`, which keeps the server modules under the coupling threshold.
- The Cartaz's MCP Apps view scans only its own files for classes (`src/mcp-view/view.css`), and leaves the stories out, so the generated view stays byte for byte the same.
