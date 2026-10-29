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
  'arrow-left': <path d="M13 8H3M7 4L3 8l4 4" />,
  'arrow-right': <path d="M3 8h10M9 4l4 4-4 4" />,
  stop: <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  dots: <><circle cx="3.5" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.5" cy="8" r=".9" fill="currentColor" /></>,
  file: <><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></>,
  refresh: <path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v2.5h-2.5" />,
  // VS Code parity (DEC-25): explorer toolbar, viewer and Search
  'file-plus': <><path d="M4 2h5l3 3v4" /><path d="M9 2v3h3M4 2v12h4.5" /><path d="M12 10.5v4M10 12.5h4" /></>,
  'folder-plus': <><path d="M2 4.5h4.2l1.5 1.5H14v2.5M8.5 12.5H2V4.5" /><path d="M12 9.5v4.5M9.8 11.75h4.4" /></>,
  collapse: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8h5" /></>,
  wrap: <path d="M2.5 4h11M2.5 8h9a2 2 0 0 1 0 4H8M9.5 10.5L8 12l1.5 1.5M2.5 12h3" />,
  search: <><circle cx="7" cy="7" r="4.25" /><path d="M10.2 10.2L13.5 13.5" /></>,
  'case-sensitive': <path d="M2 12l2.6-7h.8L8 12M3 9.6h4M10 8.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM11.7 8v4" />,
  'whole-word': <><path d="M4 6.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM5.8 6.2v4.2M8 4v6.4M8 8.3a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0" /><path d="M2 12.5h12" /></>,
  regex: <><path d="M10.5 2.5v5M8.4 3.7l4.2 2.6M12.6 3.7L8.4 6.3" /><rect x="3" y="10" width="3" height="3" rx=".5" fill="currentColor" stroke="none" /></>,
  split: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M8 3v10" /></>,
  'chevron-up': <path d="M4 10l4-4 4 4" />,
  star: <path d="M8 2.2l1.75 3.6 3.95.55-2.86 2.77.68 3.93L8 11.2l-3.52 1.85.68-3.93L2.3 6.35l3.95-.55z" />,
  'star-filled': <path d="M8 2.2l1.75 3.6 3.95.55-2.86 2.77.68 3.93L8 11.2l-3.52 1.85.68-3.93L2.3 6.35l3.95-.55z" fill="currentColor" />,
  history: <><path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7M2.5 2.8v2.4h2.4" /><path d="M8 5v3.2l2 1.3" /></>,
  'view-list': <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5" />,
  'view-tree': <path d="M3 3.5h5M5 3.5v8.5h4.5M5 7.5h4.5M11.5 7.5h2M11.5 12h2" />,
  files: <path d="M2 4.5h4.2l1.5 1.5H14v6.5H2z" />,
  diff: <path d="M5 2.5v6M2 5.5h6M9 12.5h5" />,
  browser: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 6.2h12" /></>,
  terminal: <path d="M3 5l3 3-3 3M8.5 11H13" />,
  preview: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 6.5h11M6.5 6.5v7" /></>,
  overview: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  progress: <path d="M3 13V9M8 13V5M13 13V3" />,
  architecture: <><rect x="5" y="2" width="6" height="3.5" rx="1" /><rect x="2" y="10.5" width="5" height="3.5" rx="1" /><rect x="9" y="10.5" width="5" height="3.5" rx="1" /><path d="M8 5.5V8M4.5 10.5V8h7v2.5" /></>,
  'agent-team': <path d="M6 7.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5M10.5 3.6a2.2 2.2 0 0 1 0 4M12 9.8c1 .5 1.7 1.6 2 3.2" />,
  'business-flow': <><circle cx="3.5" cy="8" r="1.5" /><circle cx="12.5" cy="8" r="1.5" /><path d="M5 8h5.5M8.5 6l2 2-2 2" /></>,
  // Prototype v02 code block copy button
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></>,
  check: <path d="M3 8.5l3.2 3L13 4.5" />,
  // Settings (FR-SET-001): gear entry and the "外观" category
  settings: <><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.7M8 12.5v1.7M14.2 8h-1.7M3.5 8H1.8M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2M12.4 12.4l-1.2-1.2M4.8 4.8L3.6 3.6" /><circle cx="8" cy="8" r="4.5" /></>,
  appearance: <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" /></>
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.overview}</svg>
}
