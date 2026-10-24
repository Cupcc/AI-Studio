const LEVELS: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5, ultra: 5 }

/** Unknown native values remain selectable without suggesting a made-up strength. */
export function EffortSignal({ effort }: { effort: string | null }) {
  const normalized = effort?.toLowerCase() ?? '', level = LEVELS[normalized]
  const special = normalized === 'max' || normalized === 'ultra' ? ` effort-signal--${normalized}` : ''
  return <span aria-hidden="true" className={`effort-signal${effort === null ? ' effort-signal--auto' : level === undefined ? ' effort-signal--unknown' : ''}${special}`}>
    {[1, 2, 3, 4, 5].map(bar => <i key={bar} className={level !== undefined && bar <= level ? 'is-on' : undefined} />)}
  </span>
}
