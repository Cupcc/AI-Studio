import { lazy } from 'react'

/** Panels import the viewers only from here and render them inside <Suspense>. Monaco stays out of the first chunk. */
export const LazyCodeViewer = lazy(() => import('./CodeViewer'))
export const LazyCodeDiffViewer = lazy(() => import('./CodeDiffViewer'))
