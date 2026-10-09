import type { ReactNode } from 'react'

// Icon set of the confirmed interactive prototype v01: 16px grid, 1.4px stroke.
const paths: Record<string, ReactNode> = {
  navigation: <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6.2 3v10" /></>,
  sidebar: <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M9.8 3v10" /></>,
  pencil: <path d="M3 13l.8-3.2L10.5 3l2.5 2.5-6.8 6.7z" />,
  chat: <path d="M2.5 3.5h11v7.5H7l-3.5 2.5V11h-1z" />,
  chevron: <path d="M4 6l4 4 4-4" />,
  plus: <path d="M8 3v10M3 8h10" />,
  'arrow-up': <path d="M8 13V3M4 7l4-4 4 4" />,
  stop: <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  dots: <><circle cx="3.5" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.5" cy="8" r=".9" fill="currentColor" /></>,
  file: <><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></>,
  refresh: <path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v2.5h-2.5" />,
  files: <path d="M2 4.5h4.2l1.5 1.5H14v6.5H2z" />,
  diff: <path d="M5 2.5v6M2 5.5h6M9 12.5h5" />,
  browser: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 6.2h12" /></>,
  terminal: <path d="M3 5l3 3-3 3M8.5 11H13" />,
  preview: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 6.5h11M6.5 6.5v7" /></>,
  overview: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  progress: <path d="M3 13V9M8 13V5M13 13V3" />,
  architecture: <><rect x="5" y="2" width="6" height="3.5" rx="1" /><rect x="2" y="10.5" width="5" height="3.5" rx="1" /><rect x="9" y="10.5" width="5" height="3.5" rx="1" /><path d="M8 5.5V8M4.5 10.5V8h7v2.5" /></>,
  'agent-team': <path d="M6 7.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5M10.5 3.6a2.2 2.2 0 0 1 0 4M12 9.8c1 .5 1.7 1.6 2 3.2" />,
  'business-flow': <><circle cx="3.5" cy="8" r="1.5" /><circle cx="12.5" cy="8" r="1.5" /><path d="M5 8h5.5M8.5 6l2 2-2 2" /></>
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.overview}</svg>
}
