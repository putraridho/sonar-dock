// What kind of work a tool call is, and every name each kind goes by.

export type ToolKind = 'bash' | 'edit' | 'read' | 'search' | 'agent' | 'web' | 'mcp' | 'other'

type ToolNames = {
  /** The radar blip's letter. */
  glyph: string
  /** The HUD's four-letter tag (status line, radar legend). */
  tag: string
  /** The chat pill's word. */
  pill: string
  /** The plain noun: "Running shell", the activity log's "Shell". */
  noun: string
}

export const TOOLS: Readonly<Record<ToolKind, ToolNames>> = {
  bash: { glyph: 'B', tag: 'BASH', pill: 'RUN', noun: 'shell' },
  edit: { glyph: 'E', tag: 'EDIT', pill: 'EDIT', noun: 'edit' },
  read: { glyph: 'R', tag: 'READ', pill: 'READ', noun: 'read' },
  search: { glyph: 'S', tag: 'SCAN', pill: 'FIND', noun: 'search' },
  agent: { glyph: 'A', tag: 'AGNT', pill: 'AGENT', noun: 'agent' },
  web: { glyph: 'W', tag: 'WEB', pill: 'WEB', noun: 'web' },
  mcp: { glyph: 'M', tag: 'LINK', pill: 'LINK', noun: 'connector' },
  other: { glyph: 'T', tag: 'TOOL', pill: 'TOOL', noun: 'tool' },
}

const KIND_OF: Readonly<Record<string, ToolKind>> = {
  Bash: 'bash',
  Edit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Read: 'read',
  Grep: 'search',
  Glob: 'search',
  Agent: 'agent',
  Task: 'agent',
  WebFetch: 'web',
  WebSearch: 'web',
}

export function toolKind(tool: string): ToolKind {
  return KIND_OF[tool] ?? (tool.startsWith('mcp__') ? 'mcp' : 'other')
}

// A kind read back from stored state; anything unknown is 'other'.
export function asToolKind(kind: string | undefined): ToolKind {
  return kind !== undefined && kind in TOOLS ? (kind as ToolKind) : 'other'
}
