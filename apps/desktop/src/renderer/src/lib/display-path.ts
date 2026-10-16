/**
 * Names may contain control and bidirectional formatting characters. Render a visible marker for each one so a
 * filename cannot change the visual order of the tree or forge a second line in a row. The raw name remains in
 * the model and is still used for all filesystem requests.
 */
export function displayName(name: string): string {
  return Array.from(name, (character) => {
    const code = character.codePointAt(0)!
    if (code <= 0x1f) return String.fromCodePoint(0x2400 + code)
    if (code === 0x7f) return '␡'
    if (code === 0x85) return '␤'
    if (code === 0x2028) return '␤'
    if (code === 0x2029) return '␥'
    const bidi = BIDI_MARKERS[code]
    return bidi ?? character
  }).join('')
}

const BIDI_MARKERS: Record<number, string> = {
  0x061c: '⟦ALM⟧',
  0x200e: '⟦L⟧',
  0x200f: '⟦R⟧',
  0x202a: '⟦LRE⟧',
  0x202b: '⟦RLE⟧',
  0x202c: '⟦PDF⟧',
  0x202d: '⟦LRO⟧',
  0x202e: '⟦RLO⟧',
  0x2066: '⟦LRI⟧',
  0x2067: '⟦RLI⟧',
  0x2068: '⟦FSI⟧',
  0x2069: '⟦PDI⟧'
}

