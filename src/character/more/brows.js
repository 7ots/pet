/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 *
 * Cejas: p = { r, side (-1 izq, 1 der), color, sp }, centradas sobre cada ojo. El lado interior está en x = -side.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default ({ n, brow }) => [
  { id: 'wavy', label: 'Onduladas', en: 'Wavy', pt: 'Onduladas', as3d: 'thin', draw: (p) => brow(p, `M${n(-p.r * 0.9)} ${n(p.r * 0.05)}q${n(p.r * 0.225)} ${n(-p.r * 0.32)} ${n(p.r * 0.45)} 0t${n(p.r * 0.45)} 0t${n(p.r * 0.45)} 0t${n(p.r * 0.45)} 0`, 0.17) },
  { id: 'worried', label: 'Preocupadas', en: 'Worried', pt: 'Preocupadas', as3d: 'soft', draw: (p) => brow(p, `M${n(p.side * p.r * 0.85)} ${n(p.r * 0.2)}Q${n(p.side * p.r * 0.05)} ${n(-p.r * 0.05)} ${n(-p.side * p.r * 0.75)} ${n(-p.r * 0.45)}`, 0.22) },
  {
    id: 'fluffy', label: 'Esponjosas', en: 'Fluffy', pt: 'Fofinhas', as3d: 'bushy',
    draw: (p) => [[-0.55, 0.05, 0.3], [-0.12, -0.12, 0.36], [0.35, -0.05, 0.33], [0.72, 0.1, 0.24]].map(([x, y, k]) => `<circle cx="${n(x * p.r * -p.side)}" cy="${n(y * p.r)}" r="${n(k * p.r)}" fill="${p.color}"/>`).join(''),
  },
  { id: 'stub', label: 'Cortitas', en: 'Stubby', pt: 'Curtinhas', as3d: 'thick', draw: (p) => brow(p, `M${n(-p.r * 0.38)} 0H${n(p.r * 0.38)}`, 0.32) },
  { id: 'bolt', label: 'Rayo', en: 'Lightning', pt: 'Raio', as3d: 'angled', draw: (p) => `<path d="M${n(-p.r * 0.95)} ${n(p.r * 0.18)}L${n(-p.r * 0.35)} ${n(-p.r * 0.35)}L${n(-p.r * 0.05)} ${n(p.r * 0.1)}L${n(p.r * 0.45)} ${n(-p.r * 0.4)}L${n(p.r * 0.95)} ${n(-p.r * 0.02)}" stroke="${p.color}" stroke-width="${n(p.r * 0.21)}" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="scale(${-p.side} 1)"/>` },
  {
    id: 'wedge', label: 'Dramáticas', en: 'Dramatic', pt: 'Dramáticas', as3d: 'angled',
    draw: (p) => `<path d="M${n(p.side * p.r * 0.95)} ${n(-p.r * 0.32)}L${n(-p.side * p.r * 0.7)} ${n(p.r * 0.32)}L${n(-p.side * p.r * 0.8)} ${n(-p.r * 0.12)}Z" fill="${p.color}" stroke="${p.color}" stroke-width="${n(p.r * 0.14)}" stroke-linejoin="round"/>`,
  },
  {
    id: 'flame', label: 'Llamas', en: 'Flames', pt: 'Chamas', as3d: 'bushy',
    draw: (p) => {
      const r = p.r;
      return `<path d="M${n(-r * 0.95)} ${n(r * 0.2)}Q${n(-r * 0.75)} ${n(-r * 0.2)} ${n(-r * 0.75)} ${n(-r * 0.5)}Q${n(-r * 0.45)} ${n(-r * 0.25)} ${n(-r * 0.3)} ${n(-r * 0.1)}Q${n(-r * 0.15)} ${n(-r * 0.5)} ${n(r * 0.05)} ${n(-r * 0.75)}Q${n(r * 0.25)} ${n(-r * 0.35)} ${n(r * 0.35)} ${n(-r * 0.12)}Q${n(r * 0.6)} ${n(-r * 0.3)} ${n(r * 0.7)} ${n(-r * 0.52)}Q${n(r * 1.0)} ${n(-r * 0.1)} ${n(r * 0.92)} ${n(r * 0.2)}Q0 ${n(r * 0.02)} ${n(-r * 0.95)} ${n(r * 0.2)}Z" fill="${p.color}" stroke="${p.color}" stroke-width="${n(r * 0.06)}" stroke-linejoin="round" transform="scale(${-p.side} 1)"/>`;
    },
  },
  {
    id: 'raised', label: 'Una levantada', en: 'One raised', pt: 'Uma levantada', as3d: 'arched',
    draw: (p) => (p.side > 0
      ? brow(p, `M${n(-p.r * 0.85)} ${n(-p.r * 0.1)}Q${n(-p.r * 0.05)} ${n(-p.r * 1.05)} ${n(p.r * 0.9)} ${n(-p.r * 0.35)}`, 0.2)
      : brow(p, `M${n(-p.r * 0.8)} ${n(p.r * 0.15)}L${n(p.r * 0.8)} ${n(p.r * 0.15)}`, 0.2)),
  },
  {
    id: 'feathery', label: 'Plumosas', en: 'Feathery', pt: 'Plumosas', as3d: 'bushy',
    draw: (p) => [[-0.75, 0.15, 0.45], [-0.25, 0.05, 0.55], [0.25, 0.0, 0.55], [0.72, 0.08, 0.42]].map(([x, y, l], i) => `<path d="M${n(x * p.r)} ${n(y * p.r + p.r * 0.2)}q${n(p.r * 0.12)} ${n(-l * p.r)} ${n(p.r * (0.3 + i * 0.05))} ${n(-l * p.r * 0.9)}" stroke="${p.color}" stroke-width="${n(p.r * 0.18)}" fill="none" stroke-linecap="round" transform="scale(${-p.side} 1)"/>`).join(''),
  },
];
