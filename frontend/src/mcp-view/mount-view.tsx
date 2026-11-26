// Mounts the Cartaz's MCP Apps view (`billboard-view.tsx`) and connects it
// to the host. It lives apart from the view's components so that each file
// exports only components or only code, as Fast Refresh needs.
//
// `mountView` takes the `App` of `@modelcontextprotocol/ext-apps` (or a
// fake in the tests) so that this file never reaches the network or the
// parent window by itself.

import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { BillboardView, type Host } from './billboard-view'
import type { ToolResult } from './view-model'

/** The part of ext-apps' `App` the view uses. */
export type ViewApp = Pick<
  App,
  | 'ontoolresult'
  | 'onhostcontextchanged'
  | 'getHostContext'
  | 'callServerTool'
  | 'sendMessage'
  | 'requestDisplayMode'
>

type HostContext = McpUiHostContext

/** Renders the view in `root` and connects it to the host (`connect`):
 * the tool result, the host's theme (`data-theme`, which `ui/tokens.css`
 * follows) and its display modes. */
export async function mountView(
  app: ViewApp,
  root: HTMLElement,
  connect: () => Promise<void>,
): Promise<void> {
  let result: ToolResult | null = null
  let context: HostContext = {}
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const setContext = (next: HostContext | undefined) => {
    context = { ...context, ...next }
    if (context.theme) {
      document.documentElement.dataset.theme = context.theme
      document.documentElement.style.colorScheme = context.theme
    }
    changed()
  }

  const callTool = (name: string, args: Record<string, unknown>) =>
    app.callServerTool({ name, arguments: args })
  const sendMessage = (text: string) =>
    app.sendMessage({ role: 'user', content: [{ type: 'text', text }] })
  const fullscreen = () => {
    void app.requestDisplayMode({ mode: 'fullscreen' }).catch(() => {})
  }
  const hostOf = (c: HostContext): Host =>
    c.displayMode === 'fullscreen'
      ? { callTool, sendMessage, inFullscreen: true }
      : c.availableDisplayModes?.includes('fullscreen')
        ? { callTool, sendMessage, fullscreen }
        : { callTool, sendMessage }

  // One Host per context, so the snapshot stays the same between changes.
  let cached: { context: HostContext; host: Host } | null = null
  const currentHost = () => {
    if (cached?.context !== context) cached = { context, host: hostOf(context) }
    return cached.host
  }
  function Root() {
    const shown = useSyncExternalStore(subscribe, () => result)
    const host = useSyncExternalStore(subscribe, currentHost)
    return <BillboardView result={shown} host={host} />
  }

  app.ontoolresult = (next) => {
    result = next
    changed()
  }
  app.onhostcontextchanged = setContext
  createRoot(root).render(<Root />)
  await connect()
  setContext(app.getHostContext())
}
