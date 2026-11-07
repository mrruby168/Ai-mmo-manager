export const LETTER_PALETTE = [
  { background: '#1E3A5F', color: '#DCEBFF' },
  { background: '#14453F', color: '#D7FFF6' },
  { background: '#3B2A5C', color: '#EEE4FF' },
  { background: '#1F3B57', color: '#E1F1FF' },
  { background: '#25402F', color: '#E4FFEA' },
  { background: '#4A2C2A', color: '#FFE9E6' },
  { background: '#22324F', color: '#E6EDF7' },
  { background: '#2E3A24', color: '#F0FFD9' }
] as const

export function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

export function firstLetter(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?'
}

export function letterColor(name: string): (typeof LETTER_PALETTE)[number] {
  return LETTER_PALETTE[hashString(name) % LETTER_PALETTE.length]
}
