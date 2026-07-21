/**
 * Wizualna kotwica ekranu sesji — gradientowy orb z animacją idle.
 * S-03 rozszerzy go o stany rozmowy (mówi / słucha); ten slice
 * celowo nie przyjmuje propsów.
 */
export function Orb() {
  return (
    <div aria-hidden="true" className="orb">
      <div className="orb-halo" />
      <div className="orb-glow" />
      <div className="orb-ring" />
      <div className="orb-hot" />
    </div>
  )
}
