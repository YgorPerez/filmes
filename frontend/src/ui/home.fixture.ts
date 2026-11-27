// The home's data for its stories (`home.stories.tsx`,
// `home-parts.stories.tsx`, `my-start.stories.tsx`): the fixture's Dono
// Bruno, a Sessão with Teo whose Feedback is open, and the setup guide in
// each state.
import type { ComponentProps } from 'react'
import type { Home } from './home'

// The screen's own props: the fixture leaves the server module alone.
type HomeData = ComponentProps<typeof Home>['home']
type SetupView = NonNullable<HomeData['setup']>
type SetupStepView = SetupView['steps'][number]
type LatestSession = NonNullable<HomeData['latest']>

type StepState = 'done' | 'skipped'

/** The three steps, each pending unless `state` says otherwise. */
export const setupOf = (
  state: Partial<Record<SetupStepView['step'], StepState>> = {},
  ratings = 4,
): SetupView => ({
  steps: (['taste', 'import', 'connector'] as const).map((step) => ({
    step,
    done: state[step] === 'done',
    skipped: state[step] === 'skipped',
  })),
  ratings,
})

export const MCP_URL = 'https://cinema.example/mcp'

export const LATEST: LatestSession = {
  id: '2026-11-21-1',
  date: '2026-11-21',
  request: 'algo leve',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'teo', name: 'Teo', owner: false },
  ],
  recommendation: [
    { position: 1, id: 'tt1', title: 'O Farol de Areia' },
    { position: 2, id: 'tt2', title: 'Maré Baixa' },
  ],
  open: true,
  chosen: null,
  moods: [],
  constraints: ['até 2h'],
  version: 1,
  additions: [],
}

/** A cover for the first film, drawn here so the stories need no network. */
export const COVERS: Record<string, string | null> = {
  tt1: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23476'/%3E%3C/svg%3E",
  tt2: null,
}

export const HOME_DATA: HomeData = {
  person: 'bruno',
  setup: setupOf({ taste: 'done', import: 'skipped', connector: 'done' }, 12),
  latest: LATEST,
  mcpUrl: MCP_URL,
  today: '2026-11-22',
  covers: {},
}
