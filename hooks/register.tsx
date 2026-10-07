// Sonar Dock: a radar HUD for Claude Code. This module only composes: each feature installs its
// hooks over one shared context, made fresh on every load.

import type { Register } from 'claude-code'

import { installChat } from './features/chat/index'
import { installLifecycle } from './features/lifecycle'
import { installPane } from './features/pane/index'
import { installStream } from './features/stream'
import { installTelemetry } from './features/telemetry'
import { createContext } from './runtime/context'

export const register: Register = on => {
  const ctx = createContext()
  installLifecycle(on, ctx)
  installTelemetry(on, ctx)
  installStream(on, ctx)
  installChat(on, ctx)
  installPane(on, ctx)
}
