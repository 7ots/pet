/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 *
 * Ojos: p = { r, lx, ly (-1..1 mirada), side (-1 izq, 1 der), iris, ink, white, lid, mood }, centrados en (0,0).
 * El lado interior (hacia la nariz) está en x = -side.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default ({ n, shade, shine, star, heartPath, look, pupil }) => {
  const stroke = (c, w) => `stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"`;
  /** Forma blanca recortada: lo de dentro (pupila…) no se sale de `shape`. */
  const clipped = (shape, fill, inner) => {
    const id = `ec${Math.round(Math.random() * 1e9)}`;
    return `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" fill="${fill}"/><g clip-path="url(#${id})">${inner}</g>`;
  };
  const circ = (r, cx = 0, cy = 0) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
  const poly = (pts) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;

  return [
    {
      id: 'puppy', label: 'Perrito', en: 'Puppy', pt: 'Cachorrinho', as3d: 'kawaii',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.12);
        return `<circle cx="${x}" cy="${y}" r="${n(r * 1.05)}" fill="${p.ink}"/><circle cx="${x}" cy="${n(+y + r * 0.38)}" r="${n(r * 0.55)}" fill="${p.iris}" opacity=".55"/>${shine(x - r * 0.34, y - r * 0.36, r * 0.36)}${shine(x + r * 0.4, y - r * 0.02, r * 0.15)}${shine(x - r * 0.02, y + r * 0.5, r * 0.1, 0.85)}`;
      },
    },
    {
      id: 'droopy', label: 'Caídos', en: 'Droopy', pt: 'Caídos', as3d: 'sad',
      draw: (p) => {
        const r = p.r;
        const s = p.side;
        return `${clipped(circ(r), p.white, `${pupil(p, r * 0.52, 0.3)}<path d="M${n(-s * (r + 1))} ${n(-r - 1)}H${n(s * (r + 1))}V${n(r * 0.1)}Q${n(-s * r * 0.1)} ${n(-r * 0.25)} ${n(-s * (r + 1))} ${n(-r * 0.55)}Z" fill="${p.lid}"/>`)}<path d="M${n(s * r)} ${n(r * 0.08)}Q${n(-s * r * 0.1)} ${n(-r * 0.25)} ${n(-s * r)} ${n(-r * 0.52)}" fill="none" ${stroke(p.ink, r * 0.16)}/>`;
      },
    },
    { id: 'moon', label: 'Lunitas', en: 'Crescents', pt: 'Luazinhas', as3d: 'happy', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.95)} ${n(p.r * 0.4)}Q0 ${n(-p.r * 1.3)} ${n(p.r * 0.95)} ${n(p.r * 0.4)}Q0 ${n(-p.r * 0.35)} ${n(-p.r * 0.95)} ${n(p.r * 0.4)}Z" fill="${p.ink}" ${stroke(p.ink, p.r * 0.1)}/>` },
    { id: 'squint', label: 'Apretados', en: 'Squeezed', pt: 'Apertados', as3d: 'closed', noBlink: true, draw: (p) => { const d = -p.side; return `<path d="M${n(-d * p.r * 0.55)} ${n(-p.r * 0.7)}L${n(d * p.r * 0.6)} 0L${n(-d * p.r * 0.55)} ${n(p.r * 0.7)}" fill="none" ${stroke(p.ink, p.r * 0.3)}/>`; } },
    { id: 'uu', label: 'U u', en: 'U u', pt: 'U u', as3d: 'closed', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.75)} ${n(-p.r * 0.45)}C${n(-p.r * 0.75)} ${n(p.r * 0.85)} ${n(p.r * 0.75)} ${n(p.r * 0.85)} ${n(p.r * 0.75)} ${n(-p.r * 0.45)}" fill="none" ${stroke(p.ink, p.r * 0.26)}/>` },
    {
      id: 'flower', label: 'Florecitas', en: 'Flowers', pt: 'Florzinhas', as3d: 'star',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.12);
        const petals = [0, 72, 144, 216, 288].map((a) => `<ellipse cy="${n(-r * 0.58)}" rx="${n(r * 0.4)}" ry="${n(r * 0.52)}" transform="rotate(${a})" fill="${p.iris}" stroke="${shade(p.iris, -0.35)}" stroke-width="${n(r * 0.08)}"/>`).join('');
        return `<g transform="translate(${x} ${y})">${petals}<circle r="${n(r * 0.42)}" fill="#facc15" stroke="${shade('#facc15', -0.35)}" stroke-width="${n(r * 0.08)}"/><circle r="${n(r * 0.24)}" fill="${p.ink}"/>${shine(-r * 0.1, -r * 0.12, r * 0.09)}</g>`;
      },
    },
    {
      id: 'diamond', label: 'Rombos', en: 'Diamonds', pt: 'Losangos', as3d: 'star',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.1);
        return `<g transform="translate(${x} ${y})"><path d="M0 ${n(-r * 1.15)}L${n(r * 0.85)} 0L0 ${n(r * 1.15)}L${n(-r * 0.85)} 0Z" fill="${p.iris}" ${stroke(shade(p.iris, -0.4), r * 0.12)}/><path d="M0 ${n(-r * 1.05)}L0 0L${n(-r * 0.76)} 0Z" fill="#fff" opacity=".3"/><path d="M0 ${n(r * 1.05)}L0 0L${n(r * 0.76)} 0Z" fill="#000" opacity=".15"/><path d="M0 ${n(-r * 0.45)}L${n(r * 0.32)} 0L0 ${n(r * 0.45)}L${n(-r * 0.32)} 0Z" fill="${p.ink}"/>${shine(-r * 0.22, -r * 0.35, r * 0.14)}</g>`;
      },
    },
    {
      id: 'galaxy', label: 'Galaxia', en: 'Galaxy', pt: 'Galáxia', as3d: 'kawaii',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.1);
        const tw = [[0.35, -0.2, 0.2], [-0.25, 0.4, 0.14], [0.45, 0.45, 0.1], [-0.5, -0.05, 0.08]].map(([a, b, k]) => `<path d="${star(r * k, 0.35, 4)}" transform="translate(${n(+x + a * r)} ${n(+y + b * r)})" fill="#fff"/>`).join('');
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="#1e1b4b"/><circle cx="${n(+x + r * 0.15)}" cy="${n(+y + r * 0.2)}" r="${n(r * 0.62)}" fill="${p.iris}" opacity=".55"/><circle cx="${n(+x - r * 0.2)}" cy="${n(+y + r * 0.35)}" r="${n(r * 0.36)}" fill="#f472b6" opacity=".45"/>${tw}${shine(x - r * 0.38, y - r * 0.4, r * 0.24)}`;
      },
    },
    {
      id: 'fierce', label: 'Feroces', en: 'Fierce', pt: 'Ferozes', as3d: 'angry',
      draw: (p) => {
        const r = p.r;
        const s = p.side;
        const shape = `M${n(s * r * 1.2)} ${n(-r * 0.75)}L${n(-s * r * 1.1)} ${n(-r * 0.15)}Q${n(-s * r * 0.6)} ${n(r * 1.05)} ${n(s * r * 0.5)} ${n(r * 0.75)}Q${n(s * r * 1.3)} ${n(r * 0.4)} ${n(s * r * 1.2)} ${n(-r * 0.75)}Z`;
        const [x, y] = look(p, 0.2);
        return `${clipped(shape, p.white, `<circle cx="${n(+x + s * r * 0.05)}" cy="${n(+y + r * 0.2)}" r="${n(r * 0.55)}" fill="${p.iris}"/><circle cx="${n(+x + s * r * 0.05)}" cy="${n(+y + r * 0.2)}" r="${n(r * 0.3)}" fill="${p.ink}"/>${shine(+x + s * r * 0.05 - r * 0.15, +y + r * 0.04, r * 0.11)}`)}<path d="M${n(s * r * 1.3)} ${n(-r * 0.82)}L${n(-s * r * 1.15)} ${n(-r * 0.15)}" fill="none" ${stroke(p.ink, r * 0.26)}/>`;
      },
    },
    { id: 'stitched', label: 'Cosidos', en: 'Stitched', pt: 'Costurados', as3d: 'closed', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.85)} 0H${n(p.r * 0.85)}" fill="none" ${stroke(p.ink, p.r * 0.18)}/><path d="${[-0.5, 0, 0.5].map((k) => `M${n(k * p.r - p.r * 0.08)} ${n(-p.r * 0.38)}L${n(k * p.r + p.r * 0.08)} ${n(p.r * 0.38)}`).join('')}" fill="none" ${stroke(p.ink, p.r * 0.14)}/>` },
    {
      id: 'shocked', label: 'En shock', en: 'Shocked', pt: 'Em choque', as3d: 'wide',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.45);
        return `<ellipse rx="${n(r * 0.95)}" ry="${n(r * 1.3)}" fill="${p.white}" ${stroke(p.ink, r * 0.1)}/><circle cx="${x}" cy="${y}" r="${n(r * 0.17)}" fill="${p.ink}"/>`;
      },
    },
    {
      id: 'lovestruck', label: 'Enamorados', en: 'Lovestruck', pt: 'Apaixonados', as3d: 'heart',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.1);
        return `<circle cx="${x}" cy="${y}" r="${n(r * 0.98)}" fill="${p.ink}"/><path d="${heartPath(r * 0.42)}" transform="translate(${n(x - r * 0.3)} ${n(y - r * 0.28)})" fill="#fb7185"/><path d="${heartPath(r * 0.2)}" transform="translate(${n(+x + r * 0.4)} ${n(+y + r * 0.38)})" fill="#fda4af"/>${shine(x - r * 0.42, y - r * 0.44, r * 0.1)}`;
      },
    },
    {
      id: 'ringed', label: 'Iris grande', en: 'Big iris', pt: 'Íris grande', as3d: 'round',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.3);
        return `<circle r="${r}" fill="${p.white}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.66)}" fill="${p.iris}" ${stroke(shade(p.iris, -0.45), r * 0.1)}/><circle cx="${x}" cy="${y}" r="${n(r * 0.42)}" fill="${shade(p.iris, 0.3)}" opacity=".5"/><circle cx="${x}" cy="${y}" r="${n(r * 0.3)}" fill="${p.ink}"/>${shine(x - r * 0.24, y - r * 0.28, r * 0.17)}`;
      },
    },
    {
      id: 'smug', label: 'Satisfechos', en: 'Smug', pt: 'Convencidos', as3d: 'tired',
      draw: (p) => {
        const r = p.r;
        return `${clipped(circ(r), p.white, `${pupil(p, r * 0.5, 0.25)}<path d="M${-r - 1} ${n(-r - 1)}H${r + 1}V${n(-r * 0.3)}H${-r - 1}Z" fill="${p.lid}"/><path d="M${-r - 1} ${r + 1}H${r + 1}V${n(r * 0.35)}Q0 ${n(-r * 0.05)} ${-r - 1} ${n(r * 0.35)}Z" fill="${p.lid}"/>`)}<path d="M${n(-r)} ${n(-r * 0.3)}H${n(r)}" fill="none" ${stroke(p.ink, r * 0.18)}/><path d="M${n(-r * 0.9)} ${n(r * 0.33)}Q0 ${n(-r * 0.02)} ${n(r * 0.9)} ${n(r * 0.33)}" fill="none" ${stroke(shade(p.lid, -0.3), r * 0.1)}/>`;
      },
    },
    {
      id: 'snake', label: 'Serpiente', en: 'Snake', pt: 'Cobra', as3d: 'cat',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.3);
        return `<ellipse rx="${n(r)}" ry="${n(r * 0.92)}" fill="${p.iris}" ${stroke(shade(p.iris, -0.45), r * 0.08)}/><ellipse cy="${n(r * 0.2)}" rx="${n(r * 0.66)}" ry="${n(r * 0.55)}" fill="${shade(p.iris, 0.35)}" opacity=".55"/><path d="M${x} ${n(+y - r * 0.85)}Q${n(+x + r * 0.26)} ${y} ${x} ${n(+y + r * 0.85)}Q${n(x - r * 0.26)} ${y} ${x} ${n(+y - r * 0.85)}Z" fill="${p.ink}"/>${shine(x - r * 0.42, y - r * 0.38, r * 0.14)}`;
      },
    },
    {
      id: 'frog', label: 'Rana', en: 'Frog', pt: 'Sapo', as3d: 'round',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.28);
        return `<circle cy="${n(-r * 0.1)}" r="${n(r * 1.18)}" fill="${p.lid}" ${stroke(shade(p.lid, -0.25), r * 0.08)}/><circle r="${n(r * 0.86)}" fill="${p.white}"/><ellipse cx="${x}" cy="${y}" rx="${n(r * 0.55)}" ry="${n(r * 0.28)}" fill="${p.ink}"/>${shine(x - r * 0.3, y - r * 0.32, r * 0.14)}`;
      },
    },
    {
      id: 'coin', label: 'Monedas', en: 'Coins', pt: 'Moedas', as3d: 'button',
      draw: (p) => {
        const r = p.r;
        return `<circle r="${r}" fill="#facc15" ${stroke('#b45309', r * 0.12)}/><circle r="${n(r * 0.68)}" fill="none" stroke="#d97706" stroke-width="${n(r * 0.09)}"/><path d="${star(r * 0.42)}" fill="#f59e0b"/><path d="M${n(-r * 0.62)} ${n(-r * 0.3)}A${n(r * 0.7)} ${n(r * 0.7)} 0 0 1 ${n(-r * 0.1)} ${n(-r * 0.72)}" fill="none" ${stroke('#fff', r * 0.14)} opacity=".7"/>`;
      },
    },
    {
      id: 'pie', label: 'Dibujo animado', en: 'Cartoon', pt: 'Desenho animado', as3d: 'bean',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.22);
        const shape = `M0 ${n(-r * 1.1)}C${n(r * 0.95)} ${n(-r * 1.1)} ${n(r * 0.95)} ${n(r * 1.1)} 0 ${n(r * 1.1)}C${n(-r * 0.95)} ${n(r * 1.1)} ${n(-r * 0.95)} ${n(-r * 1.1)} 0 ${n(-r * 1.1)}Z`;
        return `${clipped(shape, p.white, `<ellipse cx="${x}" cy="${n(+y + r * 0.2)}" rx="${n(r * 0.4)}" ry="${n(r * 0.62)}" fill="${p.ink}"/><path d="M${x} ${n(+y + r * 0.05)}L${n(+x + r * 0.5)} ${n(+y - r * 0.3)}L${n(+x + r * 0.25)} ${n(+y - r * 0.65)}Z" fill="${p.white}"/>`)}<path d="${shape}" fill="none" ${stroke(p.ink, r * 0.1)}/>`;
      },
    },
    {
      id: 'sideeye', label: 'De reojo', en: 'Side-eye', pt: 'De rabo de olho', as3d: 'tired',
      draw: (p) => {
        const r = p.r;
        const x = n(r * 0.42 + p.lx * r * 0.1);
        return `${clipped(circ(r), p.white, `<circle cx="${x}" cy="${n(r * 0.1)}" r="${n(r * 0.5)}" fill="${p.ink}"/>${shine(x - r * 0.18, r * -0.08, r * 0.15)}<path d="M${-r - 1} ${n(-r - 1)}H${r + 1}V${n(-r * 0.25)}H${-r - 1}Z" fill="${p.lid}"/>`)}<path d="M${n(-r)} ${n(-r * 0.25)}H${n(r)}" fill="none" ${stroke(p.ink, r * 0.16)}/>`;
      },
    },
    {
      id: 'mischief', label: 'Traviesos', en: 'Mischievous', pt: 'Travessos', as3d: 'happy',
      draw: (p) => {
        const r = p.r;
        const shape = `M${n(-r * 1.05)} ${n(r * 0.35)}Q0 ${n(-r * 1.55)} ${n(r * 1.05)} ${n(r * 0.35)}Q0 ${n(r * 0.05)} ${n(-r * 1.05)} ${n(r * 0.35)}Z`;
        const [x, y] = look(p, 0.25);
        return `${clipped(shape, p.white, `<circle cx="${x}" cy="${n(+y - r * 0.12)}" r="${n(r * 0.48)}" fill="${p.ink}"/>${shine(x - r * 0.16, y - r * 0.3, r * 0.14)}`)}<path d="M${n(-r * 1.05)} ${n(r * 0.35)}Q0 ${n(-r * 1.55)} ${n(r * 1.05)} ${n(r * 0.35)}" fill="none" ${stroke(p.ink, r * 0.2)}/><path d="M${n(-r * 0.9)} ${n(r * 0.3)}Q0 ${n(r * 0.05)} ${n(r * 0.9)} ${n(r * 0.3)}" fill="none" ${stroke(p.ink, r * 0.1)}/>`;
      },
    },
    {
      id: 'gem', label: 'Joyas', en: 'Gems', pt: 'Joias', as3d: 'star',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.1);
        const hex = (k) => Array.from({ length: 6 }, (_, i) => [Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * r * k, Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * r * k]);
        const o = hex(1.05);
        const m = hex(0.5);
        const facets = o.map((a, i) => { const b = o[(i + 1) % 6]; return `<path d="${poly([a, b, m[(i + 1) % 6], m[i]])}" fill="${i >= 3 ? shade(p.iris, 0.35 - (i - 3) * 0.12) : shade(p.iris, -0.1 - i * 0.08)}"/>`; }).join('');
        return `<g transform="translate(${x} ${y})">${facets}<path d="${poly(m)}" fill="${shade(p.iris, 0.15)}"/><path d="${poly(o)}" fill="none" ${stroke(shade(p.iris, -0.5), r * 0.1)}/>${shine(-r * 0.15, -r * 0.2, r * 0.13)}</g>`;
      },
    },
    {
      id: 'rainbow', label: 'Arcoíris', en: 'Rainbow', pt: 'Arco-íris', as3d: 'hypno',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.25);
        const rings = [['#ef4444', 0.72], ['#f59e0b', 0.6], ['#22c55e', 0.48], ['#3b82f6', 0.36]].map(([c, k]) => `<circle cx="${x}" cy="${y}" r="${n(r * k)}" fill="${c}"/>`).join('');
        return `<circle r="${r}" fill="${p.white}"/>${rings}<circle cx="${x}" cy="${y}" r="${n(r * 0.22)}" fill="${p.ink}"/>${shine(x - r * 0.3, y - r * 0.32, r * 0.14)}`;
      },
    },
    {
      id: 'owl', label: 'Búho', en: 'Owl', pt: 'Coruja', as3d: 'wide',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.25);
        const ray = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `M${n(Math.cos(a) * r * 0.98)} ${n(Math.sin(a) * r * 0.98)}L${n(Math.cos(a) * r * 1.18)} ${n(Math.sin(a) * r * 1.18)}`; }).join('');
        return `<circle r="${n(r * 1.2)}" fill="${shade(p.lid, 0.35)}" ${stroke(shade(p.lid, -0.25), r * 0.07)}/><path d="${ray}" fill="none" ${stroke(shade(p.lid, -0.25), r * 0.08)}/><circle r="${n(r * 0.92)}" fill="${p.white}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.68)}" fill="${p.iris}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.4)}" fill="${p.ink}"/>${shine(x - r * 0.26, y - r * 0.28, r * 0.16)}`;
      },
    },
    {
      id: 'wobbly', label: 'Gelatina', en: 'Wobbly', pt: 'Gelatina', as3d: 'googly',
      draw: (p) => {
        const r = p.r;
        const pts = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; const k = 1 + 0.08 * Math.sin(a * 3 + p.side) + 0.05 * Math.cos(a * 5); return [Math.cos(a) * r * k, Math.sin(a) * r * k]; });
        return `<path d="${poly(pts)}" fill="${p.white}" ${stroke(p.ink, r * 0.1)}/>${pupil(p, r * 0.48, 0.38)}`;
      },
    },
    {
      id: 'bubble', label: 'Burbuja', en: 'Bubble', pt: 'Bolha', as3d: 'glow',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.25);
        return `<circle r="${n(r * 1.02)}" fill="${p.iris}" fill-opacity=".3" ${stroke(p.iris, r * 0.1)}/><circle cx="${x}" cy="${y}" r="${n(r * 0.42)}" fill="${shade(p.iris, -0.35)}"/><path d="M${n(-r * 0.72)} ${n(r * 0.05)}Q${n(-r * 0.72)} ${n(-r * 0.68)} ${n(-r * 0.02)} ${n(-r * 0.76)}" fill="none" ${stroke('#fff', r * 0.17)} opacity=".9"/>${shine(r * 0.45, r * 0.45, r * 0.1, 0.8)}`;
      },
    },
    { id: 'dash', label: 'Rayitas', en: 'Dashes', pt: 'Risquinhos', as3d: 'closed', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.72)} 0H${n(p.r * 0.72)}" fill="none" ${stroke(p.ink, p.r * 0.32)}/>` },
    { id: 'plus', label: 'Cruces', en: 'Plus', pt: 'Cruzes', as3d: 'cross', noBlink: true, draw: (p) => `<path d="M${n(-p.r * 0.62)} 0H${n(p.r * 0.62)}M0 ${n(-p.r * 0.62)}V${n(p.r * 0.62)}" fill="none" ${stroke(p.ink, p.r * 0.3)}/>` },
    {
      id: 'confused', label: 'Confundidos', en: 'Confused', pt: 'Confusos', as3d: 'round',
      draw: (p) => {
        const k = p.side < 0 ? 1.15 : 0.72;
        const r = p.r * k;
        const [x, y] = look({ ...p, r }, 0.35);
        return `<circle cy="${n(p.side < 0 ? 0 : p.r * 0.15)}" r="${n(r)}" fill="${p.white}" ${stroke(p.ink, p.r * 0.08)}/><g transform="translate(0 ${n(p.side < 0 ? 0 : p.r * 0.15)})"><circle cx="${x}" cy="${y}" r="${n(r * 0.42)}" fill="${p.ink}"/>${shine(x - r * 0.15, y - r * 0.17, r * 0.13)}</g>`;
      },
    },
    {
      id: 'starry', label: 'Pupila estrella', en: 'Star pupils', pt: 'Pupila estrela', as3d: 'star',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.3);
        return `<circle r="${r}" fill="${p.white}"/><path d="${star(r * 0.62, 0.48)}" transform="translate(${x} ${y})" fill="${p.iris}" ${stroke(shade(p.iris, -0.45), r * 0.08)}/>${shine(x - r * 0.12, y - r * 0.16, r * 0.1)}`;
      },
    },
    {
      id: 'heartpupil', label: 'Pupila corazón', en: 'Heart pupils', pt: 'Pupila coração', as3d: 'heart',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.3);
        return `<circle r="${r}" fill="${p.white}"/><path d="${heartPath(r * 0.55)}" transform="translate(${x} ${n(+y + r * 0.05)})" fill="#ef3b5d"/>${shine(x - r * 0.2, y - r * 0.12, r * 0.1)}`;
      },
    },
    {
      id: 'welling', label: 'A punto de llorar', en: 'Welling up', pt: 'Quase chorando', as3d: 'teary',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.1);
        const shape = circ(r * 0.98, +x, +y);
        return `${clipped(shape, p.ink, `<path d="M${n(x - r)} ${n(+y + r * 0.3)}Q${n(x - r * 0.5)} ${n(+y + r * 0.15)} ${x} ${n(+y + r * 0.3)}T${n(+x + r)} ${n(+y + r * 0.3)}V${n(+y + r)}H${n(x - r)}Z" fill="#7dd3fc" opacity=".6"/>`)}${shine(x - r * 0.32, y - r * 0.36, r * 0.33)}${shine(+x + r * 0.32, y - r * 0.05, r * 0.14)}${shine(x - r * 0.3, +y + r * 0.55, r * 0.09, 0.9)}${shine(+x + r * 0.2, +y + r * 0.6, r * 0.07, 0.9)}`;
      },
    },
    {
      id: 'visor', label: 'Visor', en: 'Visor', pt: 'Viseira', as3d: 'led', single: true,
      draw: (p) => {
        const r = p.r;
        const x = n(p.lx * r * 1.3);
        return `<rect x="${n(-r * 2.7)}" y="${n(-r * 0.62)}" width="${n(r * 5.4)}" height="${n(r * 1.24)}" rx="${n(r * 0.62)}" fill="#0b1220" ${stroke('#475569', r * 0.1)}/><rect x="${n(x - r * 1.1)}" y="${n(-r * 0.36)}" width="${n(r * 2.2)}" height="${n(r * 0.72)}" rx="${n(r * 0.36)}" fill="${p.iris}" opacity=".35"/><rect x="${n(x - r * 0.8)}" y="${n(-r * 0.24)}" width="${n(r * 1.6)}" height="${n(r * 0.48)}" rx="${n(r * 0.24)}" fill="${p.iris}"/><rect x="${n(x - r * 0.6)}" y="${n(-r * 0.16)}" width="${n(r * 0.6)}" height="${n(r * 0.1)}" rx="1" fill="#fff" opacity=".7"/>`;
      },
    },
    {
      id: 'scanner', label: 'Escáner', en: 'Scanner', pt: 'Scanner', as3d: 'robot',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.2);
        return `<circle r="${r}" fill="#0b1220" ${stroke('#64748b', r * 0.1)}/><circle r="${n(r * 0.62)}" fill="none" stroke="${p.iris}" stroke-width="${n(r * 0.2)}" opacity=".9"/><circle r="${n(r * 0.62)}" fill="none" stroke="${p.iris}" stroke-width="${n(r * 0.45)}" opacity=".2"/><circle cx="${x}" cy="${y}" r="${n(r * 0.22)}" fill="${p.iris}"/><circle cx="${n(x - r * 0.06)}" cy="${n(y - r * 0.06)}" r="${n(r * 0.08)}" fill="#fff"/>`;
      },
    },
    {
      id: 'triclops', label: 'Tres ojos', en: 'Three eyes', pt: 'Três olhos', as3d: 'cyclops', single: true,
      draw: (p) => {
        const r = p.r;
        const one = (cx, cy, k) => { const rr = r * k; const [x, y] = look({ ...p, r: rr }, 0.3); return `<g transform="translate(${n(cx)} ${n(cy)})"><circle r="${n(rr)}" fill="${p.white}" ${stroke(shade(p.lid, -0.2), r * 0.08)}/><circle cx="${x}" cy="${y}" r="${n(rr * 0.58)}" fill="${p.iris}"/><circle cx="${x}" cy="${y}" r="${n(rr * 0.3)}" fill="${p.ink}"/>${shine(x - rr * 0.22, y - rr * 0.26, rr * 0.16)}</g>`; };
        return one(-r * 1.75, r * 0.4, 0.88) + one(r * 1.75, r * 0.4, 0.88) + one(0, -r * 0.45, 1.15);
      },
    },
    {
      id: 'sewn', label: 'Botones cosidos', en: 'Sewn buttons', pt: 'Botões costurados', as3d: 'button', noBlink: true,
      draw: (p) => {
        const r = p.r;
        const c = p.iris;
        return `<circle r="${r}" fill="${c}" ${stroke(shade(c, -0.4), r * 0.1)}/><circle r="${n(r * 0.72)}" fill="none" stroke="${shade(c, -0.2)}" stroke-width="${n(r * 0.08)}"/>${[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => `<circle cx="${n(a * r * 0.3)}" cy="${n(b * r * 0.3)}" r="${n(r * 0.12)}" fill="${shade(c, -0.5)}"/>`).join('')}<path d="M${n(-r * 0.3)} ${n(-r * 0.3)}L${n(r * 0.3)} ${n(r * 0.3)}M${n(r * 0.3)} ${n(-r * 0.3)}L${n(-r * 0.3)} ${n(r * 0.3)}" fill="none" ${stroke('#f5f5f4', r * 0.12)}/>${shine(-r * 0.5, -r * 0.5, r * 0.12, 0.7)}`;
      },
    },
    {
      id: 'bored', label: 'Aburridos', en: 'Bored', pt: 'Entediados', as3d: 'tired',
      draw: (p) => {
        const r = p.r;
        const x = n(p.lx * r * 0.35);
        return `<path d="M${n(-r)} ${n(-r * 0.1)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r * 0.1)}Z" fill="${p.white}"/><circle cx="${x}" cy="${n(r * 0.38)}" r="${n(r * 0.4)}" fill="${p.ink}"/>${shine(x - r * 0.14, r * 0.24, r * 0.12)}<path d="M${n(-r * 1.08)} ${n(-r * 0.1)}H${n(r * 1.08)}" fill="none" ${stroke(p.ink, r * 0.2)}/>`;
      },
    },
    {
      id: 'shoujo', label: 'Shoujo', en: 'Shoujo', pt: 'Shoujo', as3d: 'anime',
      draw: (p) => {
        const r = p.r;
        const [x, y] = look(p, 0.12);
        return `<ellipse cx="${x}" cy="${y}" rx="${n(r * 0.85)}" ry="${n(r * 1.15)}" fill="${p.ink}"/><ellipse cx="${x}" cy="${n(+y + r * 0.38)}" rx="${n(r * 0.62)}" ry="${n(r * 0.6)}" fill="${p.iris}" opacity=".85"/><ellipse cx="${n(x - r * 0.28)}" cy="${n(y - r * 0.45)}" rx="${n(r * 0.3)}" ry="${n(r * 0.38)}" fill="#fff"/><path d="${star(r * 0.24, 0.3, 4)}" transform="translate(${n(+x + r * 0.32)} ${n(+y + r * 0.12)})" fill="#fff"/>${shine(x - r * 0.25, +y + r * 0.62, r * 0.08, 0.9)}`;
      },
    },
  ];
};
