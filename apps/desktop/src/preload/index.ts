// Sandboxed preload: exposes only the typed API derived from the contract
// registry as `window.studio`. Do not expose ipcRenderer or Node APIs here.
import { contextBridge, ipcRenderer } from 'electron'
import { contracts } from '@shared/ipc/contracts'
import { buildStudioApi } from './bridge'

contextBridge.exposeInMainWorld('studio', buildStudioApi(contracts, ipcRenderer))
