import overview from '../../../build/workbenches/overview/manifest.json'
import progress from '../../../build/workbenches/progress/manifest.json'
import architecture from '../../../build/workbenches/architecture/manifest.json'
import agentTeam from '../../../build/workbenches/agent-team/manifest.json'
import businessFlow from '../../../build/workbenches/business-flow/manifest.json'

const PACKAGES = [
  { viewId: 'overview', icon: 'overview', manifest: overview },
  { viewId: 'progress', icon: 'progress', manifest: progress },
  { viewId: 'architecture', icon: 'architecture', manifest: architecture },
  { viewId: 'agent-team', icon: 'agent-team', manifest: agentTeam },
  { viewId: 'business-flow', icon: 'business-flow', manifest: businessFlow }
] as const

export const PRESET_WORKBENCHES = PACKAGES.map(({ viewId, icon, manifest }) => ({
  viewId, icon, title: manifest.title, pluginId: manifest.pluginId,
  origin: 'preset', kind: 'instance', editable: false
} as const))
export type PresetWorkbenchEntry = typeof PRESET_WORKBENCHES[number]
export type PresetWorkbenchId = PresetWorkbenchEntry['viewId']

export function isPresetWorkbenchId(value: unknown): value is PresetWorkbenchId {
  return PRESET_WORKBENCHES.some(entry => entry.viewId === value)
}
export function presetWorkbench(viewId: PresetWorkbenchId): PresetWorkbenchEntry {
  return PRESET_WORKBENCHES.find(entry => entry.viewId === viewId)!
}
