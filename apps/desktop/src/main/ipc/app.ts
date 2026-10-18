// Handlers for the example `app` feature.
import { appContract, PING_MESSAGE_MAX_LENGTH } from '@shared/ipc/app'
import type { CoreServices } from '../services/core'
import { defineHandlers } from './registry'
import { expectOnlyKeys, expectRecord, expectString, noInput } from './validate'

export function createAppFeature(core: Pick<CoreServices, 'appInfo'>, getWindowFocus: (senderId: number) => boolean = () => false) {
  return defineHandlers(appContract, {
    getWindowFocus: { parse: noInput, handle: (_, context) => ({ focused: getWindowFocus(context.senderId) }) },
    getInfo: {
      parse: noInput,
      handle: () => core.appInfo()
    },
    ping: {
      parse: (raw) => {
        const input = expectRecord(raw)
        expectOnlyKeys(input, ['message'])
        return {
          message: expectString(input.message, 'message', { maxLength: PING_MESSAGE_MAX_LENGTH })
        }
      },
      handle: ({ message }) => ({ message, receivedAt: new Date().toISOString() })
    }
  })
}
