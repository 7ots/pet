/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default (h) => {
  const { n, shade, S, star, heartPath, ellD } = h;
  const K = (c, s, extra = '') => `<g transform="scale(${n(c.k)})${extra}">${s}</g>`;
  /** Trazo grueso con contorno oscuro (pelo, astas, tallos). */
  const rope = (d, color, w) => `<path d="${d}" stroke="#1f2937" stroke-width="${w + 5}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const shine = (d, w = 3, o = 0.25) => `<path d="${d}" stroke="#fff" stroke-width="${w}" fill="none" opacity="${o}" stroke-linecap="round"/>`;

  // orejas y cuernos que crecen del cuerpo: geometría compartida entre draw y shape
  const foxEarD = (s, grow) => `M${12 * s} ${grow ? 26 : 12}L${12 * s} 10Q${16 * s} -26 ${32 * s} -42Q${50 * s} -14 ${48 * s} 12L${48 * s} ${grow ? 26 : 14}Z`;
  const impHornD = (s, grow) => `M${12 * s} ${grow ? 24 : 10}L${12 * s} 8Q${12 * s} -12 ${30 * s} -22Q${22 * s} -8 ${28 * s} 8L${28 * s} ${grow ? 24 : 10}Z`;
  const uniD = (grow) => `M-12 ${grow ? 24 : 8}L-12 6L0 -62L12 6L12 ${grow ? 24 : 8}Z`;
  const SPIKES = [[-38, 10, -38], [-21, -2, -20], [0, -6, 0], [21, -2, 20], [38, 10, 38]];
  const spikeD = (grow, k = 1) => `M${-9 * k} ${grow ? 14 : 4}L${-9 * k} 4L0 ${-18 * k}L${9 * k} 4L${9 * k} ${grow ? 14 : 4}Z`;
  const ears = (c, x, y, r, inner) => [-1, 1].map((s) => `<circle cx="${s * x}" cy="${y}" r="${r}" fill="${c.color}" ${S(3)}/><circle cx="${s * x}" cy="${y + r * 0.12}" r="${n(r * inner)}" fill="${c.color2}"/>`).join('');

  return [
    // ── sombreros ──
    {
      id: 'minitophat', label: 'Chistera mini', en: 'Mini top hat', pt: 'Cartola mini', as3d: 'tophat', group: 'head', anchor: 'top', color: '#111827', color2: '#a855f7',
      draw: (c) => K(c, `<ellipse cy="4" rx="26" ry="6" fill="${c.color}" ${S(2.5)}/><path d="M-16 3V-30Q0 -34 16 -30V3Q0 7 -16 3Z" fill="${c.color}" ${S(2.5)}/><path d="M-16 -6Q0 -2 16 -6V0Q0 4 -16 0Z" fill="${c.color2}"/><path d="${heartPath(4)}" transform="translate(9 -3)" fill="#fff" opacity=".85"/>${shine('M-10 -26V-10')}`, ' translate(20 0) rotate(16)'),
    },
    {
      id: 'chullo', label: 'Gorro andino', en: 'Earflap hat', pt: 'Gorro andino', as3d: 'beanie', group: 'head', anchor: 'top', color: '#0ea5e9', color2: '#facc15',
      draw: (c) => K(c, `${[-1, 1].map((s) => `<path d="M${46 * s} 6Q${52 * s} 30 ${40 * s} 40Q${30 * s} 34 ${30 * s} 14Z" fill="${c.color}" ${S(3)}/><path d="M${40 * s} 40V58" stroke="${c.color2}" stroke-width="3" stroke-linecap="round"/><circle cx="${40 * s}" cy="60" r="5" fill="${c.color2}" ${S(2)}/>`).join('')}<path d="M-48 16Q-50 -36 0 -40Q50 -36 48 16Q0 8 -48 16Z" fill="${c.color}" ${S(3)}/><path d="M-44 0L-34 -8L-24 0L-14 -8L-4 0L6 -8L16 0L26 -8L36 0L44 -6" stroke="${c.color2}" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M-36 -18H36" stroke="#fff" stroke-width="3" stroke-dasharray="3 5" opacity=".8"/><circle cy="-44" r="9" fill="${c.color2}" ${S(2.5)}/>`),
    },
    {
      id: 'mushcap', label: 'Sombrero seta', en: 'Mushroom cap', pt: 'Chapéu cogumelo', as3d: 'beret', group: 'head', anchor: 'top', color: '#ef4444', color2: '#fafafa',
      draw: (c) => K(c, `<path d="M-60 12Q-62 -44 0 -46Q62 -44 60 12Q0 22 -60 12Z" fill="${c.color}" ${S(3)}/>${[[-34, -12, 8], [-8, -32, 7], [18, -14, 9], [40, -26, 5], [-46, 4, 4], [44, 4, 4]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${n(r * 0.85)}" fill="${c.color2}"/>`).join('')}${shine('M-40 -26Q-30 -38 -16 -40', 4)}`),
    },
    {
      id: 'softserve', label: 'Helado', en: 'Soft serve', pt: 'Sorvete', as3d: 'beanie', group: 'head', anchor: 'top', color: '#f9a8d4', color2: '#dc2626',
      draw: (c) => K(c, `<path d="M-46 14Q-52 -10 -30 -12Q30 -16 30 -12Q52 -10 46 14Q0 22 -46 14Z" fill="${c.color}" ${S(3)}/><path d="M-34 -8Q-40 -30 -18 -30Q18 -32 18 -30Q40 -30 34 -8Q0 -2 -34 -8Z" fill="${shade(c.color, 0.15)}" ${S(3)}/><path d="M-20 -26Q-24 -46 0 -50Q24 -46 20 -26Q0 -22 -20 -26Z" fill="${c.color}" ${S(3)}/><path d="M0 -50Q-2 -60 8 -64" stroke="#1f2937" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="4" cy="-56" r="7" fill="${c.color2}" ${S(2.5)}/><circle cx="2" cy="-58" r="2" fill="#fff" opacity=".7"/>${[[-24, 4, '#60a5fa'], [16, 6, '#facc15'], [-6, -16, '#22c55e'], [20, -20, '#60a5fa'], [-10, -38, '#facc15']].map(([x, y, f], i) => `<rect x="${x}" y="${y}" width="7" height="3" rx="1.5" fill="${f}" transform="rotate(${[30, -20, 60, 10, -40][i]} ${x} ${y})"/>`).join('')}`),
    },
    {
      id: 'froghat', label: 'Gorro rana', en: 'Frog hat', pt: 'Gorro de sapo', as3d: 'beanie', group: 'head', anchor: 'top', color: '#4ade80', color2: '#f472b6',
      draw: (c) => K(c, `${[-1, 1].map((s) => `<circle cx="${22 * s}" cy="-30" r="14" fill="${c.color}" ${S(3)}/><circle cx="${22 * s}" cy="-31" r="8.5" fill="#fff"/><circle cx="${22 * s + 2}" cy="-30" r="4.5" fill="#1f2937"/><circle cx="${22 * s + 3.5}" cy="-32" r="1.5" fill="#fff"/>`).join('')}<path d="M-48 16Q-50 -30 0 -30Q50 -30 48 16Q0 8 -48 16Z" fill="${c.color}" ${S(3)}/><path d="M-12 -6Q0 4 12 -6" stroke="#1f2937" stroke-width="3" fill="none" stroke-linecap="round"/>${[-1, 1].map((s) => `<ellipse cx="${30 * s}" cy="-4" rx="6" ry="3.5" fill="${c.color2}" opacity=".7"/>`).join('')}`),
    },
    {
      id: 'catbeanie', label: 'Gorro gatuno', en: 'Cat beanie', pt: 'Gorro de gato', as3d: 'beanie', group: 'head', anchor: 'top', color: '#a78bfa', color2: '#fbcfe8',
      draw: (c) => K(c, `${[-1, 1].map((s) => `<path d="M${40 * s} -8L${42 * s} -48L${14 * s} -32Z" fill="${c.color}" ${S(3)}/><path d="M${34 * s} -16L${36 * s} -38L${20 * s} -30Z" fill="${c.color2}"/>`).join('')}<path d="M-46 16Q-48 -34 0 -36Q48 -34 46 16Z" fill="${c.color}" ${S(3)}/>${[-28, -14, 0, 14, 28].map((x) => `<path d="M${x} -28V8" stroke="${shade(c.color, -0.15)}" stroke-width="3"/>`).join('')}<rect x="-50" y="4" width="100" height="18" rx="9" fill="${shade(c.color, -0.15)}" ${S(3)}/>`),
    },
    {
      id: 'nursecap', label: 'Cofia', en: 'Nurse cap', pt: 'Touca de enfermeira', as3d: 'chef', group: 'head', anchor: 'top', color: '#fafafa', color2: '#ef4444',
      draw: (c) => K(c, `<path d="M-34 12L-26 -20Q0 -30 26 -20L34 12Q0 4 -34 12Z" fill="${c.color}" ${S(3)}/><path d="M-30 -4Q0 -12 30 -4" stroke="#d4d4d8" stroke-width="2.5" fill="none"/><path d="M-3 -22h6v5h5v6h-5v5h-6v-5h-5v-6h5Z" fill="${c.color2}"/>`),
    },
    {
      id: 'sailor', label: 'Gorro marinero', en: 'Sailor hat', pt: 'Chapéu de marinheiro', as3d: 'bucket', group: 'head', anchor: 'top', color: '#fafafa', color2: '#1d4ed8',
      draw: (c) => K(c, `<path d="M-34 4Q-34 -36 0 -36Q34 -36 34 4Z" fill="${c.color}" ${S(3)}/><path d="M-46 14Q-50 -4 -38 -6Q0 2 38 -6Q50 -4 46 14Q0 24 -46 14Z" fill="${c.color}" ${S(3)}/><path d="M-40 4Q0 13 40 4" stroke="${c.color2}" stroke-width="4" fill="none"/>${shine('M-22 -26Q-26 -16 -26 -8', 3, 0.5)}<path d="M-14 -28Q0 -32 14 -28" stroke="#d4d4d8" stroke-width="2" fill="none"/>`, ' rotate(-6)'),
    },
    {
      id: 'strawhat', label: 'Sombrero de paja', en: 'Straw hat', pt: 'Chapéu de palha', as3d: 'cowboy', group: 'head', anchor: 'top', color: '#fcd34d', color2: '#dc2626',
      draw: (c) => K(c, `<ellipse cy="8" rx="68" ry="14" fill="${c.color}" ${S(3)}/><path d="M-60 8Q0 20 60 8M-50 2Q0 12 50 2" stroke="${shade(c.color, -0.2)}" stroke-width="1.6" fill="none" stroke-dasharray="5 3"/><path d="M-32 8Q-36 -36 0 -36Q36 -36 32 8Q0 14 -32 8Z" fill="${c.color}" ${S(3)}/><path d="M-34 -6Q0 2 34 -6L33 4Q0 12 -33 4Z" fill="${c.color2}"/><path d="M-24 -26Q0 -20 24 -26" stroke="${shade(c.color, -0.2)}" stroke-width="1.6" fill="none" stroke-dasharray="5 3"/>`),
    },
    {
      id: 'umbrellahat', label: 'Paraguas', en: 'Umbrella hat', pt: 'Chapéu-guarda-chuva', as3d: 'propeller', group: 'head', anchor: 'top', color: '#f43f5e', color2: '#fafafa',
      draw: (c) => {
        const seg = [-50, -25, 0, 25, 50];
        const scal = seg.slice(0, 4).map((x) => `Q${x + 12.5} -26 ${x + 25} -32`).join('');
        const panels = seg.slice(0, 4).map((x, i) => `<path d="M0 -76Q${n(x * 0.55)} -62 ${x} -32Q${x + 12.5} -26 ${x + 25} -32Q${n((x + 25) * 0.55)} -62 0 -76Z" fill="${i % 2 ? c.color2 : c.color}"/>`).join('');
        return K(c, `<path d="M-44 14Q-46 0 -40 -2Q0 6 40 -2Q46 0 44 14Q0 22 -44 14Z" fill="${shade(c.color, -0.2)}" ${S(3)}/><path d="M0 4V-76" stroke="#1f2937" stroke-width="3.5"/>${panels}<path d="M-50 -32Q-46 -72 0 -76Q46 -72 50 -32" fill="none" ${S(3)}/><path d="M-50 -32${scal}" fill="none" ${S(3)}/><circle cy="-79" r="4" fill="#1f2937"/>${shine('M-30 -56Q-20 -68 -6 -70', 3, 0.4)}`);
      },
    },
    {
      id: 'eggshell', label: 'Cascarón', en: 'Eggshell', pt: 'Casca de ovo', as3d: 'beanie', group: 'head', anchor: 'top', color: '#fef3c7', color2: '#fde68a',
      draw: (c) => K(c, `<path d="M-46 14L-38 2L-30 12L-20 0L-10 10L0 -2L10 10L20 0L30 12L38 2L46 14Q50 -42 0 -46Q-50 -42 -46 14Z" fill="${c.color}" ${S(3)}/><ellipse cx="18" cy="-24" rx="5" ry="3.5" fill="${c.color2}"/><ellipse cx="-22" cy="-14" rx="3.5" ry="2.5" fill="${c.color2}"/>${shine('M-32 -22Q-26 -36 -12 -40', 4, 0.6)}`, ' rotate(-8)'),
    },
    {
      id: 'cakehat', label: 'Tarta', en: 'Birthday cake', pt: 'Bolo de aniversário', as3d: 'tophat', group: 'head', anchor: 'top', color: '#fbcfe8', color2: '#f472b6',
      draw: (c) => K(c, `<path d="M-34 14V-12H34V14Q0 20 -34 14Z" fill="${c.color}" ${S(3)}/><path d="M-34 -12H34V-4Q30 4 26 -4Q20 6 14 -4Q8 4 2 -4Q-4 6 -10 -4Q-16 4 -22 -4Q-28 6 -34 -2Z" fill="${c.color2}" ${S(2)}/><path d="M-22 -12V-32H22V-12Z" fill="${c.color}" ${S(3)}/><path d="M-22 -32H22V-26Q18 -20 14 -26Q8 -18 2 -26Q-4 -20 -10 -26Q-16 -18 -22 -26Z" fill="#fafafa" ${S(2)}/><rect x="-3" y="-50" width="6" height="18" rx="2" fill="#60a5fa" ${S(2)}/><path d="M0 -52Q-6 -60 0 -68Q6 -60 0 -52Z" fill="#fb923c" ${S(1.5)}/>${[[-26, 8, '#facc15'], [-8, 6, '#60a5fa'], [12, 8, '#22c55e'], [26, 4, '#facc15']].map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${f}"/>`).join('')}`),
    },
    {
      id: 'plumehelm', label: 'Casco de caballero', en: 'Knight helmet', pt: 'Elmo de cavaleiro', as3d: 'viking', group: 'head', anchor: 'top', color: '#cbd5e1', color2: '#dc2626',
      draw: (c) => K(c, `<path d="M0 -36Q-6 -62 18 -74Q14 -60 30 -60Q20 -48 26 -40Q12 -46 6 -34Z" fill="${c.color2}" ${S(2.5)}/><path d="M-46 16Q-46 -36 0 -38Q46 -36 46 16Z" fill="${c.color}" ${S(3)}/><path d="M-46 8H46" stroke="${shade(c.color, -0.3)}" stroke-width="7"/><path d="M0 -38V10" stroke="${shade(c.color, -0.2)}" stroke-width="6"/>${[-36, -18, 18, 36].map((x) => `<circle cx="${x}" cy="8" r="2" fill="#f1f5f9"/>`).join('')}${shine('M-30 -22Q-24 -32 -12 -34', 4, 0.6)}`),
    },
    {
      id: 'octohat', label: 'Pulpito', en: 'Octopus', pt: 'Polvinho', as3d: 'beanie', group: 'head', anchor: 'top', color: '#f472b6', color2: '#fde047',
      draw: (c) => K(c, `${[-36, -14, 14, 36].map((x) => `${''}<path d="M${n(x * 0.6)} -6Q${x} 6 ${n(x * 1.1)} 14Q${n(x * 1.25)} 20 ${n(x * 1.3 + Math.sign(x) * 6)} 14" stroke="#1f2937" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M${n(x * 0.6)} -6Q${x} 6 ${n(x * 1.1)} 14Q${n(x * 1.25)} 20 ${n(x * 1.3 + Math.sign(x) * 6)} 14" stroke="${c.color}" stroke-width="8" fill="none" stroke-linecap="round"/>`).join('')}<path d="M-28 0Q-34 -50 0 -52Q34 -50 28 0Q0 8 -28 0Z" fill="${c.color}" ${S(3)}/><circle cx="-10" cy="-18" r="4" fill="#1f2937"/><circle cx="10" cy="-18" r="4" fill="#1f2937"/><circle cx="-11" cy="-19.5" r="1.4" fill="#fff"/><circle cx="9" cy="-19.5" r="1.4" fill="#fff"/><path d="M-4 -9Q0 -5 4 -9" stroke="#1f2937" stroke-width="2.5" fill="none" stroke-linecap="round"/>${[-1, 1].map((s) => `<ellipse cx="${18 * s}" cy="-10" rx="4" ry="2.5" fill="${c.color2}" opacity=".7"/>`).join('')}${shine('M-18 -38Q-12 -46 -2 -46', 3, 0.5)}`),
    },
    // ── coronas y diademas ──
    {
      id: 'minicrown', label: 'Coronita', en: 'Little crown', pt: 'Coroinha', as3d: 'crown', group: 'head', anchor: 'top', color: '#facc15', color2: '#ec4899',
      draw: (c) => K(c, `<path d="M-18 4L-21 -20L-9 -9L0 -26L9 -9L21 -20L18 4Z" fill="${c.color}" ${S(2.5)}/><rect x="-19" y="0" width="38" height="7" rx="2.5" fill="${shade(c.color, -0.12)}" ${S(2.5)}/><circle cy="-6" r="3.5" fill="${c.color2}" stroke="#1f2937" stroke-width="1.5"/>${[[-21, -20], [0, -26], [21, -20]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff" stroke="#1f2937" stroke-width="1.3"/>`).join('')}`, ' translate(-18 0) rotate(-14)'),
    },
    {
      id: 'flowercrown', label: 'Corona de flores', en: 'Flower crown', pt: 'Coroa de flores', as3d: 'tiara', group: 'head', anchor: 'top', color: '#f9a8d4', color2: '#fde047',
      draw: (c) => {
        const pts = [[-42, 8], [-28, -4], [-12, -10], [4, -11], [20, -7], [34, 1], [45, 12]];
        const cols = [c.color, '#c4b5fd', c.color, '#fdba74', c.color, '#c4b5fd', c.color];
        const leaves = [[-35, 4, -40], [-20, -10, 10], [12, -12, -10], [28, -6, 30], [40, 4, 60]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.5" transform="rotate(${a} ${x} ${y})" fill="#4ade80" ${S(1.5)}/>`).join('');
        const flowers = pts.map(([x, y], i) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle cy="-5" r="4.6" transform="rotate(${a})" fill="${cols[i]}" stroke="#1f2937" stroke-width="1.5"/>`).join('')}<circle r="3" fill="${c.color2}"/></g>`).join('');
        return K(c, `<path d="M-44 12Q0 -24 46 14" stroke="#16a34a" stroke-width="3" fill="none"/>${leaves}${flowers}`);
      },
    },
    {
      id: 'laurel', label: 'Laurel', en: 'Laurel wreath', pt: 'Coroa de louros', as3d: 'tiara', group: 'head', anchor: 'top', color: '#65a30d', color2: '#facc15',
      draw: (c) => {
        const side = (s) => [[44, 12, 20], [38, 0, 40], [30, -9, 55], [20, -15, 70], [9, -18, 82]].map(([x, y, a]) => `<ellipse cx="${s * x}" cy="${y}" rx="8" ry="4" transform="rotate(${s * a} ${s * x} ${y})" fill="${c.color}" ${S(1.8)}/><ellipse cx="${s * (x - 4)}" cy="${y - 7}" rx="6.5" ry="3.2" transform="rotate(${s * (a + 30)} ${s * (x - 4)} ${y - 7})" fill="${shade(c.color, 0.2)}" ${S(1.5)}/>`).join('');
        return K(c, `<path d="M-46 16Q-40 -16 -4 -20M46 16Q40 -16 4 -20" stroke="${shade(c.color, -0.3)}" stroke-width="3" fill="none" stroke-linecap="round"/>${side(-1)}${side(1)}<circle cy="-20" r="3.5" fill="${c.color2}" ${S(1.5)}/>`);
      },
    },
    {
      id: 'aliceband', label: 'Diadema con lazo', en: 'Bow headband', pt: 'Tiara com laço', as3d: 'bow', group: 'head', anchor: 'top', color: '#ef4444', color2: '#fafafa',
      draw: (c) => K(c, `${rope('M-48 18Q-48 -18 0 -20Q48 -18 48 18', c.color, 6)}<g transform="translate(-24 -14) rotate(-20)"><path d="M0 0Q-20 -18 -22 -2Q-20 12 0 0Z" fill="${c.color}" ${S(2.5)}/><path d="M0 0Q20 -18 22 -2Q20 12 0 0Z" fill="${c.color}" ${S(2.5)}/>${[[-12, -4], [-15, 3], [12, -4], [15, 3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${c.color2}"/>`).join('')}<circle r="5" fill="${shade(c.color, -0.2)}" ${S(2.5)}/></g>`),
    },
    {
      id: 'hairbow', label: 'Lazo grande', en: 'Big hair bow', pt: 'Laço grande', as3d: 'bow', group: 'head', anchor: 'top', color: '#38bdf8', color2: '#fafafa',
      draw: (c) => K(c, `<path d="M-4 2L-14 26L-6 22L-2 30Z" fill="${shade(c.color, -0.15)}" ${S(2.5)}/><path d="M4 2L14 26L6 22L2 30Z" fill="${shade(c.color, -0.15)}" ${S(2.5)}/><path d="M0 -4Q-34 -36 -40 -10Q-38 16 0 -4Z" fill="${c.color}" ${S(3)}/><path d="M0 -4Q34 -36 40 -10Q38 16 0 -4Z" fill="${c.color}" ${S(3)}/>${[[-26, -14], [-30, -2], [-18, -20], [26, -14], [30, -2], [18, -20], [-16, -6], [16, -6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${c.color2}"/>`).join('')}<rect x="-8" y="-12" width="16" height="15" rx="5" fill="${shade(c.color, -0.2)}" ${S(2.5)}/>`, ' translate(0 -6)'),
    },
    {
      id: 'starclips', label: 'Horquillas estrella', en: 'Star hair clips', pt: 'Presilhas de estrela', as3d: 'bow', group: 'head', anchor: 'top', color: '#facc15', color2: '#f472b6',
      draw: (c) => K(c, `<path d="${star(14, 0.48)}" transform="translate(-30 6) rotate(-14)" fill="${c.color}" ${S(2.2)}/><path d="${star(10, 0.48)}" transform="translate(-14 -6) rotate(10)" fill="${c.color2}" ${S(2)}/><path d="${star(12, 0.48)}" transform="translate(30 4) rotate(12)" fill="${c.color}" ${S(2.2)}/><circle cx="-33" cy="3" r="1.6" fill="#fff" opacity=".8"/><circle cx="27" cy="1" r="1.4" fill="#fff" opacity=".8"/>`),
    },
    // ── orejas y cuernos ──
    {
      id: 'bearears', label: 'Orejas de oso', en: 'Bear ears', pt: 'Orelhas de urso', as3d: 'catears', group: 'head', anchor: 'top', color: '#92400e', color2: '#fcd9b6', grow: 'skin',
      shape: (c) => [-1, 1].map((s) => ({ d: ellD(17, 17, 0), tf: `scale(${n(c.k)}) translate(${s * 38} 0)` })),
      draw: (c) => K(c, ears(c, 38, 0, 17, 0.55)),
    },
    {
      id: 'mouseears', label: 'Orejas de ratón', en: 'Mouse ears', pt: 'Orelhas de rato', as3d: 'catears', group: 'head', anchor: 'top', color: '#9ca3af', color2: '#f9a8d4', grow: 'skin',
      shape: (c) => [-1, 1].map((s) => ({ d: ellD(24, 24, 0), tf: `scale(${n(c.k)}) translate(${s * 42} -10)` })),
      draw: (c) => K(c, ears(c, 42, -10, 24, 0.62)),
    },
    {
      id: 'foxears', label: 'Orejas de zorro', en: 'Fox ears', pt: 'Orelhas de raposa', as3d: 'catears', group: 'head', anchor: 'top', color: '#f97316', color2: '#fff7ed', grow: 'skin',
      shape: (c) => [-1, 1].map((s) => ({ d: foxEarD(s, c.grow), tf: `scale(${n(c.k)})` })),
      draw: (c) => K(c, [-1, 1].map((s) => `<path d="${foxEarD(s, c.grow)}" fill="${c.color}" ${S(3)}/><path d="M${20 * s} 8Q${22 * s} -16 ${32 * s} -30Q${42 * s} -10 ${40 * s} 8Z" fill="${c.color2}"/><path d="M${26 * s} -32Q${32 * s} -42 ${32 * s} -42Q${36 * s} -38 ${39 * s} -30Q${32 * s} -36 ${26 * s} -32Z" fill="#1f2937"/>`).join('')),
    },
    {
      id: 'dogears', label: 'Orejas de perro', en: 'Floppy dog ears', pt: 'Orelhas de cachorro', as3d: 'bunny', group: 'head', anchor: 'top', color: '#92400e', color2: '#78350f',
      draw: (c) => K(c, [-1, 1].map((s) => `<path d="M${22 * s} 4Q${50 * s} -18 ${64 * s} 10Q${74 * s} 40 ${60 * s} 54Q${48 * s} 60 ${46 * s} 44Q${40 * s} 20 ${26 * s} 14Z" fill="${c.color}" ${S(3)}/><path d="M${48 * s} 8Q${60 * s} 26 ${56 * s} 46" stroke="${c.color2}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`).join('')),
    },
    {
      id: 'floppybunny', label: 'Orejas caídas', en: 'Lop bunny ears', pt: 'Orelhas caídas', as3d: 'bunny', group: 'head', anchor: 'top', color: '#fafaf9', color2: '#fbcfe8', grow: 'skin',
      shape: (c) => [{ d: ellD(12, 34, -32), tf: `scale(${n(c.k)}) translate(-18 8) rotate(-10)` }, { d: ellD(12, 22, -20), tf: `scale(${n(c.k)}) translate(18 8) rotate(16)` }],
      draw: (c) => K(c, `<g transform="translate(-18 8) rotate(-10)"><ellipse cy="-32" rx="12" ry="34" fill="${c.color}" ${S(3)}/><ellipse cy="-30" rx="6" ry="24" fill="${c.color2}"/></g><g transform="translate(18 8) rotate(16)"><g transform="translate(0 -38) rotate(110)"><ellipse cy="-14" rx="11" ry="17" fill="${c.color}" ${S(3)}/><ellipse cy="-13" rx="5" ry="10" fill="${c.color2}"/></g><ellipse cy="-20" rx="12" ry="22" fill="${c.color}" ${S(3)}/><ellipse cy="-18" rx="6" ry="14" fill="${c.color2}"/></g>`),
    },
    {
      id: 'unicorn', label: 'Cuerno de unicornio', en: 'Unicorn horn', pt: 'Chifre de unicórnio', as3d: 'horns', group: 'head', anchor: 'top', color: '#fde68a', color2: '#f0abfc', grow: 'part',
      shape: (c) => [{ d: uniD(c.grow), tf: `scale(${n(c.k)})` }],
      draw: (c) => K(c, `<path d="${uniD(c.grow)}" fill="${c.color}" ${S(3)}/><path d="M-8 -2L7 -10M-6 -16L5 -24M-4 -30L3 -36" stroke="${c.color2}" stroke-width="3.5" stroke-linecap="round"/>${shine('M-4 -36L-7 -6', 2.5, 0.6)}`),
    },
    {
      id: 'imphorns', label: 'Cuernitos', en: 'Little horns', pt: 'Chifrinhos', as3d: 'horns', group: 'head', anchor: 'top', color: '#f87171', grow: 'part',
      shape: (c) => [-1, 1].map((s) => ({ d: impHornD(s, c.grow), tf: `scale(${n(c.k)})` })),
      draw: (c) => K(c, [-1, 1].map((s) => `<path d="${impHornD(s, c.grow)}" fill="${c.color}" ${S(3)}/><path d="M${16 * s} 0Q${17 * s} -8 ${22 * s} -12" stroke="${shade(c.color, -0.2)}" stroke-width="2" fill="none" stroke-linecap="round"/>`).join('')),
    },
    {
      id: 'antlers', label: 'Astas de reno', en: 'Antlers', pt: 'Galhada de rena', as3d: 'horns', group: 'head', anchor: 'top', color: '#a16207',
      draw: (c) => K(c, [-1, 1].map((s) => rope(`M${16 * s} 8Q${22 * s} -18 ${42 * s} -42M${28 * s} -20Q${44 * s} -20 ${54 * s} -30M${36 * s} -34Q${32 * s} -44 ${28 * s} -54M${20 * s} -6Q${10 * s} -14 ${6 * s} -26`, c.color, 6)).join('')),
    },
    {
      id: 'dinospikes', label: 'Púas de dino', en: 'Dino spikes', pt: 'Espinhos de dino', as3d: 'horns', group: 'head', anchor: 'top', color: '#22c55e', grow: 'part',
      shape: (c) => SPIKES.map(([x, y, a], i) => ({ d: spikeD(c.grow, i === 2 ? 1.25 : 1), tf: `scale(${n(c.k)}) translate(${x} ${y}) rotate(${a})` })),
      draw: (c) => K(c, SPIKES.map(([x, y, a], i) => `<path d="${spikeD(c.grow, i === 2 ? 1.25 : 1)}" transform="translate(${x} ${y}) rotate(${a})" fill="${c.color}" ${S(2.5)}/>`).join('')),
    },
    // ── pelo ──
    {
      id: 'pigtails', label: 'Coletas', en: 'Pigtails', pt: 'Maria-chiquinha', as3d: 'hair', group: 'head', anchor: 'top', color: '#78350f', color2: '#f472b6',
      draw: (c) => K(c, `${[-1, 1].map((s) => `<path d="M${42 * s} 2Q${72 * s} -8 ${78 * s} 20Q${80 * s} 44 ${66 * s} 52Q${70 * s} 30 ${50 * s} 14Z" fill="${c.color}" ${S(3)}/><circle cx="${46 * s}" cy="6" r="6" fill="${c.color2}" ${S(2.5)}/>`).join('')}<path d="M-40 12Q-46 -26 0 -28Q46 -26 40 12Q30 -6 14 -2Q8 -10 0 -4Q-8 -10 -14 -2Q-30 -6 -40 12Z" fill="${c.color}" ${S(3)}/>${shine('M-26 -16Q-18 -24 -6 -24', 3, 0.3)}`),
    },
    {
      id: 'hairbun', label: 'Moño', en: 'Hair bun', pt: 'Coque', as3d: 'hair', group: 'head', anchor: 'top', color: '#1f2937', color2: '#f43f5e',
      draw: (c) => K(c, `<circle cy="-32" r="17" fill="${c.color}" ${S(3)}/><path d="M-10 -40Q0 -46 10 -40" stroke="#fff" stroke-width="2" fill="none" opacity=".25"/><path d="M-40 14Q-46 -24 0 -26Q46 -24 40 14Q26 -4 0 -2Q-26 -4 -40 14Z" fill="${c.color}" ${S(3)}/><rect x="-12" y="-21" width="24" height="7" rx="3.5" fill="${c.color2}" ${S(2)}/>${shine('M-28 -12Q-20 -20 -8 -21', 3, 0.25)}`),
    },
    {
      id: 'mohawk', label: 'Cresta', en: 'Mohawk', pt: 'Moicano', as3d: 'hair', group: 'head', anchor: 'top', color: '#d946ef',
      draw: (c) => K(c, `<path d="M-14 12L-28 -16L-12 -12L-14 -40L0 -20L8 -48L14 -18L30 -34L22 -8L34 -6L16 12Z" fill="${c.color}" ${S(3)}/><path d="M-4 -12L4 -36M10 -10L22 -26" stroke="#fff" stroke-width="2.5" opacity=".3" stroke-linecap="round"/>`),
    },
    {
      id: 'curls', label: 'Rizos', en: 'Curly hair', pt: 'Cachos', as3d: 'hair', group: 'head', anchor: 'top', color: '#3f2a1d',
      draw: (c) => {
        const cs = [[-40, 10, 12], [-34, -6, 13], [-20, -18, 14], [0, -22, 15], [20, -18, 14], [34, -6, 13], [40, 10, 12], [-12, -4, 12], [12, -4, 12]];
        return K(c, `${cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#1f2937" stroke="#1f2937" stroke-width="6"/>`).join('')}${cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.color}"/>`).join('')}${cs.slice(1, 6).map(([x, y, r]) => `<path d="M${x - r * 0.5} ${y - r * 0.2}a${n(r * 0.45)} ${n(r * 0.45)} 0 0 1 ${n(r * 0.7)} ${n(-r * 0.3)}" stroke="#fff" stroke-width="2" fill="none" opacity=".25" stroke-linecap="round"/>`).join('')}`);
      },
    },
    {
      id: 'ahoge', label: 'Mechón rebelde', en: 'Cowlick', pt: 'Topete rebelde', as3d: 'hair', group: 'head', anchor: 'top', color: '#1f2937',
      draw: (c) => K(c, rope('M0 10Q-6 -16 8 -28Q22 -38 12 -48Q4 -52 6 -42', c.color, 5)),
    },
    // ── otros ──
    {
      id: 'cherries', label: 'Cerezas', en: 'Cherries', pt: 'Cerejas', as3d: 'sprout', group: 'head', anchor: 'top', color: '#dc2626', color2: '#22c55e',
      draw: (c) => K(c, `<path d="M2 -40Q-8 -26 -12 -8M2 -40Q8 -24 14 -6" stroke="#1f2937" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M2 -40Q16 -54 28 -42Q14 -34 2 -40Z" fill="${c.color2}" ${S(2)}/>${[[-12, -2], [14, 0]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${c.color}" ${S(2.5)}/><circle cx="${x - 3.5}" cy="${y - 3.5}" r="2.8" fill="#fff" opacity=".7"/>`).join('')}`, ' translate(22 0)'),
    },
    {
      id: 'chickhat', label: 'Pollito', en: 'Baby chick', pt: 'Pintinho', as3d: 'beret', group: 'head', anchor: 'top', color: '#fde047', color2: '#fb923c',
      draw: (c) => K(c, `<path d="M-2 -38Q-6 -48 2 -50M2 -38Q4 -48 12 -46" stroke="#1f2937" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cy="-16" rx="22" ry="22" fill="${c.color}" ${S(3)}/><path d="M-20 -10Q-30 -14 -26 -2Q-20 2 -14 -4" fill="${shade(c.color, -0.12)}" ${S(2)}/><circle cx="-6" cy="-22" r="3" fill="#1f2937"/><circle cx="8" cy="-22" r="3" fill="#1f2937"/><circle cx="-6.8" cy="-23" r="1" fill="#fff"/><circle cx="7.2" cy="-23" r="1" fill="#fff"/><path d="M-4 -15L1 -10L6 -15Z" fill="${c.color2}" ${S(1.5)}/><ellipse cx="-12" cy="-12" rx="3.5" ry="2" fill="#fb7185" opacity=".6"/><ellipse cx="14" cy="-12" rx="3.5" ry="2" fill="#fb7185" opacity=".6"/>`),
    },
    {
      id: 'springs', label: 'Antenas de muelle', en: 'Spring antennae', pt: 'Antenas de mola', as3d: 'antenna', group: 'head', anchor: 'top', color: '#94a3b8', color2: '#facc15',
      draw: (c) => K(c, [-1, 1].map((s) => {
        let d = `M${12 * s} 8`;
        for (let i = 1; i <= 7; i++) d += `L${n(12 * s + s * i * 3 + (i % 2 ? -7 : 7))} ${8 - i * 6}`;
        return `${rope(d, c.color, 3)}<path d="${star(10, 0.5)}" transform="translate(${n(12 * s + s * 21)} -40) rotate(${s * 12})" fill="${c.color2}" ${S(2.2)}/>`;
      }).join('')),
    },
    {
      id: 'earmuffs', label: 'Orejeras', en: 'Earmuffs', pt: 'Protetor de orelha', as3d: 'headphones', group: 'head', anchor: 'eyes', color: '#f472b6', color2: '#fafafa',
      draw: (c) => {
        const top = -c.eyeDy - 8;
        const fluff = (x) => [0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${n(x + Math.cos((a * Math.PI) / 180) * 10)}" cy="${n(-4 + Math.sin((a * Math.PI) / 180) * 12)}" r="8"/>`).join('');
        return `${rope(`M${n(-c.w * 0.5)} -4Q${n(-c.w * 0.56)} ${n(top)} 0 ${n(top)}Q${n(c.w * 0.56)} ${n(top)} ${n(c.w * 0.5)} -4`, c.color2, 5)}${[-1, 1].map((s) => `<g fill="#1f2937" stroke="#1f2937" stroke-width="5">${fluff(s * c.w * 0.52)}</g><g fill="${c.color}">${fluff(s * c.w * 0.52)}</g><circle cx="${n(s * c.w * 0.52 - 4)}" cy="-10" r="4" fill="#fff" opacity=".45"/>`).join('')}`;
      },
    },
  ];
};
