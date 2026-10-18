// Example feature contract: application info, a validated request, and a
// main -> renderer event. Copy this file as the starting point for a feature.
import { defineContract, event, invoke } from './contract'

export interface AppInfo {
  name: string
  version: string
  isPackaged: boolean
  platform: string
  arch: string
  versions: { electron: string; chrome: string; node: string }
}

export interface PingRequest {
  message: string
}

export interface PingResponse {
  message: string
  receivedAt: string
}

export interface WindowFocusPayload {
  focused: boolean
}

export const PING_MESSAGE_MAX_LENGTH = 1000

export const appContract = defineContract('app', {
  invoke: {
    getWindowFocus: invoke<void, WindowFocusPayload>('app:get-window-focus'),
    getInfo: invoke<void, AppInfo>('app:get-info'),
    ping: invoke<PingRequest, PingResponse>('app:ping')
  },
  events: {
    windowFocusChanged: event<WindowFocusPayload>('app:window-focus-changed')
  }
})
