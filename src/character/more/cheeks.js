/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default (h) => {
  const { n, shade, star, heartPath } = h;
  // p = { sp (media distancia entre ojos), r (radio ojo), color } — relativo al centro de los ojos
  const both = (fn) => (p) => [-1, 1].map((s) => fn(p, s, s * (p.sp + p.r * 0.4), p.r * 1.8)).join('');

  return [
    {
      id: 'swirl', label: 'Espirales', en: 'Swirls', pt: 'Espirais', as3d: 'blush',
      draw: both((p, s, x, y) => {
        let d = '';
        for (let t = 0; t <= 11; t += 0.4) {
          const rr = (t / 11) * p.r * 0.62;
          d += `${t ? 'L' : 'M'}${n(x + Math.cos(t * s) * rr * 1.25)} ${n(y + Math.sin(t * s) * rr * 0.8)}`;
        }
        return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(p.r * 0.8)}" ry="${n(p.r * 0.5)}" fill="${p.color}" opacity=".3"/><path d="${d}" stroke="${shade(p.color, -0.15)}" stroke-width="${n(p.r * 0.11)}" fill="none" stroke-linecap="round" opacity=".85"/>`;
      }),
    },
    {
      id: 'sparkle', label: 'Destellos', en: 'Sparkles', pt: 'Brilhos', as3d: 'stars',
      draw: both((p, s, x, y) => `<path d="${star(p.r * 0.5, 0.22, 4)}" transform="translate(${n(x + s * p.r * 0.25)} ${n(y - p.r * 0.1)})" fill="#fff" stroke="#fde68a" stroke-width="${n(p.r * 0.05)}"/><path d="${star(p.r * 0.24, 0.25, 4)}" transform="translate(${n(x - s * p.r * 0.45)} ${n(y + p.r * 0.4)})" fill="#fff"/><circle cx="${n(x + s * p.r * 0.75)}" cy="${n(y + p.r * 0.45)}" r="${n(p.r * 0.08)}" fill="#fff"/>`),
    },
    {
      id: 'flowers', label: 'Florecitas', en: 'Flowers', pt: 'Florzinhas', as3d: 'hearts',
      draw: both((p, s, x, y) => {
        const pr = p.r * 0.2;
        const cx = x + s * p.r * 0.15;
        return `<g transform="translate(${n(cx)} ${n(y)})">${[0, 1, 2, 3, 4].map((i) => {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
          return `<circle cx="${n(Math.cos(a) * pr * 1.3)}" cy="${n(Math.sin(a) * pr * 1.3)}" r="${n(pr)}" fill="${p.color}"/>`;
        }).join('')}<circle r="${n(pr * 0.85)}" fill="#facc15"/></g>`;
      }),
    },
    {
      id: 'glow', label: 'Rubor suave', en: 'Soft glow', pt: 'Rubor suave', as3d: 'blush',
      draw: (p) => {
        const id = `ck${Math.round(Math.random() * 1e9)}`;
        return `<radialGradient id="${id}"><stop offset="0" stop-color="${p.color}" stop-opacity=".75"/><stop offset=".55" stop-color="${p.color}" stop-opacity=".35"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></radialGradient>${[-1, 1].map((s) => `<ellipse cx="${n(s * (p.sp + p.r * 0.45))}" cy="${n(p.r * 1.8)}" rx="${n(p.r * 1.25)}" ry="${n(p.r * 0.85)}" fill="url(#${id})"/>`).join('')}`;
      },
    },
    {
      id: 'tribal', label: 'Triángulos', en: 'Tribal marks', pt: 'Triângulos', as3d: 'paint',
      draw: both((p, s, x, y) => [0, 1, 2].map((i) => {
        const cx = x - s * p.r * 0.25 + s * i * p.r * 0.48;
        return `<path d="M${n(cx - p.r * 0.2)} ${n(y - p.r * 0.3)}L${n(cx + p.r * 0.2)} ${n(y - p.r * 0.3)}L${n(cx)} ${n(y + p.r * 0.3)}Z" fill="${shade(p.color, -0.15)}" stroke="${shade(p.color, -0.15)}" stroke-width="${n(p.r * 0.08)}" stroke-linejoin="round"/>`;
      }).join('')),
    },
    {
      id: 'pixel', label: 'Rubor píxel', en: 'Pixel blush', pt: 'Rubor pixel', as3d: 'blush',
      draw: both((p, s, x, y) => {
        const q = p.r * 0.32;
        const cells = [[-1.5, -0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [1.5, 0.5], [-1.5, 0.5], [1.5, -0.5]];
        return cells.map(([a, b], i) => `<rect x="${n(x + a * q - q / 2)}" y="${n(y + b * q - q / 2)}" width="${n(q)}" height="${n(q)}" fill="${p.color}" opacity="${i < 6 ? 0.6 : 0.35}"/>`).join('');
      }),
    },
    {
      id: 'mole', label: 'Lunar', en: 'Beauty mark', pt: 'Pinta', as3d: 'freckles',
      draw: (p) => `<circle cx="${n(p.sp + p.r * 0.9)}" cy="${n(p.r * 2.4)}" r="${n(p.r * 0.15)}" fill="${shade(p.color, -0.7)}"/>`,
    },
    {
      id: 'shy', label: 'Vergüenza', en: 'Shy', pt: 'Vergonha', as3d: 'lines',
      draw: both((p, s, x, y) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(p.r * 0.85)}" ry="${n(p.r * 0.48)}" fill="${p.color}" opacity=".45"/>${[0, 1, 2, 3].map((i) => `<path d="M${n(x + (i - 1.5) * p.r * 0.36 - p.r * 0.1)} ${n(y + p.r * 0.2)}l${n(p.r * 0.2)} ${n(-p.r * 0.4)}" stroke="${shade(p.color, -0.3)}" stroke-width="${n(p.r * 0.09)}" stroke-linecap="round" opacity=".8"/>`).join('')}`),
    },
    {
      id: 'doll', label: 'Muñeca', en: 'Doll cheeks', pt: 'Boneca', as3d: 'blush',
      draw: both((p, s, x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(p.r * 0.55)}" fill="${p.color}" opacity=".85"/><circle cx="${n(x - p.r * 0.18)}" cy="${n(y - p.r * 0.18)}" r="${n(p.r * 0.13)}" fill="#fff" opacity=".7"/>`),
    },
    {
      id: 'heartblush', label: 'Rubor de amor', en: 'Love blush', pt: 'Rubor apaixonado', as3d: 'hearts',
      draw: both((p, s, x, y) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(p.r * 0.85)}" ry="${n(p.r * 0.48)}" fill="${p.color}" opacity=".5"/><path d="${heartPath(p.r * 0.22)}" transform="translate(${n(x + s * p.r * 0.75)} ${n(y - p.r * 0.55)}) rotate(${s * 15})" fill="#f43f5e"/>`),
    },
  ];
};
