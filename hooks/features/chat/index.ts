// The chat skin: on while /sonar is, off with /sonar off.

import type { On } from 'claude-code'

import type { Context } from '../../runtime/context'
import { installBand } from './band'
import { installMessages } from './messages'
import { installNoticeRows } from './notices'
import { installStatusRows } from './status'
import { installToolRows } from './tools'

export function installChat(on: On, ctx: Context): void {
  installBand(on, ctx)
  installMessages(on, ctx)
  installToolRows(on, ctx)
  installStatusRows(on, ctx)
  installNoticeRows(on, ctx)
}
