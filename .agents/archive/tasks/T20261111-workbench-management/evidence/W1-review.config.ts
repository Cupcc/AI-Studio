import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import desktop from '../../../apps/desktop/vitest.config'
const projects = desktop.test!.projects!
export default defineConfig({ ...desktop, test: { ...desktop.test, projects: projects.map(project => {
  if (typeof project !== 'object' || project === null) throw new Error('Unexpected test project')
  const renderer = project.test?.name === 'renderer'
  return { ...project, resolve: { ...project.resolve, alias: { ...project.resolve?.alias, react: fileURLToPath(new URL('../../../apps/desktop/node_modules/react', import.meta.url)), '@testing-library/react': fileURLToPath(new URL('../../../apps/desktop/node_modules/@testing-library/react', import.meta.url)) } }, test: { ...project.test, include: [fileURLToPath(new URL(renderer ? './W1-extra.renderer.test.tsx' : './W1-extra.node.test.ts', import.meta.url))] } }
}) } })
