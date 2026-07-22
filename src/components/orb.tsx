export type OrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'processing'
  | 'speaking'

/**
 * Wizualna kotwica ekranu sesji — gradientowy orb z animacją idle.
 * Stan rozmowy (FR-008: łączenie / słuchanie / użytkownik mówi /
 * przetwarzanie / agent mówi) mapowany wyłącznie na warianty klas CSS —
 * element pozostaje trwały, bez remountu (remount restartuje animacje).
 */
export function Orb({ state = 'idle' }: { state?: OrbState }) {
  return (
    <div aria-hidden="true" className={`orb orb--${state}`}>
      <div className="orb-halo" />
      <div className="orb-glow" />
      <div className="orb-ring" />
      <div className="orb-hot" />
    </div>
  )
}
