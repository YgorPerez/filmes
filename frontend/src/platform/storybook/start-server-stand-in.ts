// The stories' `@tanstack/react-start/server`, next to `start-stand-in.ts`:
// only a server function reads the request, and no story calls one.

const noRequest = (): never => {
  throw new Error('No request in Storybook.')
}

export const getRequest = noRequest
export const setResponseHeader = noRequest
