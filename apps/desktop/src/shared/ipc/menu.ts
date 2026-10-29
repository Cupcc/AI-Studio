import { defineContract, invoke } from './contract'
import type { PopupMenuRequest, PopupMenuResult } from '../menu/types'

export const menuContract = defineContract('menu', {
  invoke: {
    popup: invoke<PopupMenuRequest, PopupMenuResult>('menu:popup')
  }
})
