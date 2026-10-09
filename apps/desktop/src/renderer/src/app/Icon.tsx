export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    navigation: 'M3 3h14v14H3z M8 3v14', sidebar: 'M3 3h14v14H3z M12 3v14',
    plus: 'M10 4v12 M4 10h12', close: 'M5 5l10 10 M15 5L5 15',
    chat: 'M3 3h14v10H8l-5 4z M7 7h6', overview: 'M3 3h6v6H3z M12 3h5v6h-5z M3 12h6v5H3z M12 12h5v5h-5z',
    progress: 'M4 16V9 M10 16V4 M16 16v-6', architecture: 'M7 2h6v5H7z M2 13h6v5H2z M12 13h6v5h-6z M10 7v3 M5 13v-3h10v3',
    'agent-team': 'M7 7a3 3 0 1 0 0-6 M14 9a3 3 0 1 0 0-6 M2 18v-4c0-4 9-4 9 0v4 M12 12c5-2 6 1 6 3v3',
    'business-flow': 'M2 3h6v5H2z M12 12h6v5h-6z M8 5h7v7 M12 9l3 3 3-3',
    files: 'M2 5h6l2 2h8v10H2z M2 5V3h6l2 2', diff: 'M5 2h8l3 3v13H5z M8 7h5 M8 11h5 M10.5 8.5v5',
    browser: 'M2 3h16v14H2z M2 7h16 M5 5h.1 M8 5h.1', terminal: 'M2 3h16v14H2z M5 8l3 3-3 3 M10 14h4',
    preview: 'M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z M12 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0'
  }
  return <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.overview} /></svg>
}
