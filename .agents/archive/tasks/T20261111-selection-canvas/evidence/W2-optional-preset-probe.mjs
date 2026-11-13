import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { createServer } = await import(pathToFileURL(resolve('apps/desktop/node_modules/vite/dist/node/index.js')));
const server = await createServer({ configFile: false, root: resolve('apps/desktop'), resolve: { alias: { '@shared': resolve('apps/desktop/src/shared') } }, server: { middlewareMode: true } });
try {
 const schema = await server.ssrLoadModule('/src/shared/workbench/schema.ts');
 const { isCustomWorkbenchId, workbenchTarget } = await server.ssrLoadModule('/src/shared/workbench/types.ts');
 const ref = { projectId: 'test-project', viewId: 'product-selection' };
 const result = { ref, navigable: schema.parseWorkbenchRef(ref), rendererAllowsStateWrite: isCustomWorkbenchId(ref.viewId), pageTarget: workbenchTarget(ref.projectId, ref.viewId) };
 for (const parser of ['parseCustomWorkbenchRef', 'parseInstanceWorkbenchRef']) { try { result[parser] = schema[parser](ref); } catch(error) { result[parser] = { error: error.message }; } }
 writeFileSync(resolve('tasks/T20261111-selection-canvas/evidence/W2-optional-preset-initial.json'), JSON.stringify(result, null, 2)+'\n');
 console.log(JSON.stringify(result, null, 2));
} finally { await server.close(); }
