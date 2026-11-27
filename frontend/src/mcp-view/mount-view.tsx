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
  | 'updateModelContext'
  | 'getHostCapabilities'
  | 'requestDisplayMode'
>

type HostContext = McpUiHostContext

/** The host's safe area as CSS variables (`--host-inset-bottom`...): the
 * bar of the fullscreen sits above the box Claude lays over its foot
 * (#277). `env(safe-area-inset-*)` is 0 inside a frame. */
const SIDES = ['top', 'right', 'bottom', 'left'] as const

function setInsets(insets: HostContext['safeAreaInsets']) {
  for (const side of SIDES)
    document.documentElement.style.setProperty(
      `--host-inset-${side}`,
      `${insets?.[side] ?? 0}px`,
    )
}

/** The frame's `color-scheme`: the theme's, as ext-apps'
 * `applyDocumentTheme` sets it, which is what a host built on it expects.
 * Where the page around the frame declares another scheme, Chrome paints
 * an opaque canvas behind it, and that canvas is the theme's own: the dark
 * tokens on a dark canvas, the light ones on a light one, never the dark
 * ones on white (#277). Inline the frame lays no floor of its own and,
 * where the schemes agree, sits on the host's. */
const schemeOf = (c: HostContext) => c.theme ?? ''

/** Renders the view in `root` and connects it to the host (`connect`):
 * the tool result, the host's theme (`data-theme`, which `ui/tokens.css`
 * follows), its safe area and its display modes. */
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
      document.documentElement.style.colorScheme = schemeOf(context)
    }
    setInsets(context.safeAreaInsets)
    changed()
  }

  const callTool = (name: string, args: Record<string, unknown>) =>
    app.callServerTool({ name, arguments: args })
  const sendMessage = (text: string) =>
    app.sendMessage({ role: 'user', content: [{ type: 'text', text }] })
  const updateContext = (text: string) =>
    app.updateModelContext({ content: [{ type: 'text', text }] })
  const fullscreen = () => {
    void app.requestDisplayMode({ mode: 'fullscreen' }).catch(() => {})
  }
  // Back to the chat, where the new list comes (#277): whether the host
  // took it.
  const leaveFullscreen = () =>
    app.requestDisplayMode({ mode: 'inline' }).then(
      (answer) => answer.mode === 'inline',
      () => false,
    )
  // A host that takes no model context may never answer the request.
  const talk = () =>
    app.getHostCapabilities()?.updateModelContext
      ? { callTool, sendMessage, updateContext }
      : { callTool, sendMessage }
  const hostOf = (c: HostContext): Host =>
    c.displayMode === 'fullscreen'
      ? { ...talk(), inFullscreen: true, leaveFullscreen }
      : c.availableDisplayModes?.includes('fullscreen')
        ? { ...talk(), fullscreen }
        : talk()

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
