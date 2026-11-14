// Build metadata injected by electron.vite.config.ts; absent under Vitest.
declare const __STUDIO_BUILD__: { commit: string | null; date: string | null } | undefined

export const BUILD_INFO: { commit: string | null; date: string | null } =
  typeof __STUDIO_BUILD__ === 'undefined' ? { commit: null, date: null } : __STUDIO_BUILD__
