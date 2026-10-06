export type Mood = 'ok' | 'watch' | 'worry' | 'mad'

const MOUTH: Record<Mood, string> = {
  ok: 'M32 44 Q40 49 48 44',
  watch: 'M33 45 H47',
  worry: 'M33 47 Q40 44 47 47',
  mad: 'M33 48 Q40 43 47 48',
}

interface Palette {
  hair: string
  shirt: string
  extra?: 'bun' | 'tails' | 'glasses' | 'scan' | 'cap' | 'band'
}

const LOOK: Record<string, Palette> = {
  mom: { hair: '#3a2a28', shirt: '#e36b8a', extra: 'bun' },
  dad: { hair: '#2c261f', shirt: '#3d6ea8', extra: 'glasses' },
  sister: { hair: '#4a2d24', shirt: '#f0b429', extra: 'tails' },
  self: { hair: '#5a3a2a', shirt: '#6aaa5a', extra: 'scan' },
  clerk: { hair: '#2a2420', shirt: '#ef6f4e', extra: 'cap' },
  jogger: { hair: '#243044', shirt: '#5eb0a0', extra: 'band' },
}

/** 開羅式大頭小身體。表情只跟懷疑走，路人永遠是平板的。 */
export function Chibi({ id, mood = 'ok' }: { id: string; mood?: Mood }) {
  const look = LOOK[id] ?? LOOK.self!
  return (
    <svg className="chibi" viewBox="0 0 80 96" aria-hidden="true">
      <ellipse cx="40" cy="90" rx="16" ry="4" fill="rgba(58,36,21,.22)" />
      <rect x="30" y="70" width="8" height="14" rx="3" fill="#3a2a22" />
      <rect x="42" y="70" width="8" height="14" rx="3" fill="#3a2a22" />
      <rect x="22" y="50" width="36" height="26" rx="10" fill={look.shirt} />
      {look.extra === 'bun' && <circle cx="40" cy="14" r="7" fill={look.hair} />}
      <circle cx="40" cy="34" r="20" fill="#ffd3b6" />
      <path d="M20 36c0-16 8-24 20-24s20 8 20 24v4H20z" fill={look.hair} />
      <ellipse cx="40" cy="38" rx="16" ry="13" fill="#ffd3b6" />
      {look.extra === 'tails' && (
        <>
          <circle cx="16" cy="40" r="7" fill={look.hair} />
          <circle cx="64" cy="40" r="7" fill={look.hair} />
        </>
      )}
      {look.extra === 'cap' && <rect x="22" y="12" width="36" height="10" rx="3" fill="#4a2c1a" />}
      {look.extra === 'band' && <rect x="22" y="20" width="36" height="5" fill="#f25c54" />}
      {look.extra === 'glasses' && (
        <rect x="24" y="32" width="32" height="10" rx="3" fill="none" stroke="#2a1c14" strokeWidth="2" />
      )}
      <ellipse cx="33" cy="36" rx="2.1" ry="2.5" fill="#2a1c14" />
      {look.extra === 'scan' ? (
        <rect className="scan-eye" x="45" y="34" width="4" height="4" fill="#63f0dc" />
      ) : (
        <ellipse cx="47" cy="36" rx="2.1" ry="2.5" fill="#2a1c14" />
      )}
      <path d={MOUTH[mood]} fill="none" stroke="#2a1c14" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
