/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 *
 * Accesorios de ojos, cara, cuello, espalda y extras.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default (h) => {
  const { n, shade, S, star, heartPath } = h;
  const both = (f) => [-1, 1].map(f).join('');
  const glint = (x, y, l, w = 2.5) => `<path d="M${n(x)} ${n(y)}l${n(l * 0.6)} ${n(l)}" stroke="#fff" stroke-width="${w}" opacity=".6" stroke-linecap="round"/>`;
  // Correa que rodea la cabeza (se recorta con la silueta: clipExtra).
  const strap = (c, y, w, col) => `<path d="M${n(-c.w * 0.6)} ${n(y)}H${n(c.w * 0.6)}" stroke="${col}" stroke-width="${n(w)}"/>`;
  const ell = (x, y, rx, ry) => `M${n(x - rx)} ${n(y)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
  // Collar en arco a la altura del cuello (como el de perlas).
  const arc = (c, k, i, N, dy = 0) => {
    const t = (i / (N - 1)) * Math.PI;
    return [n(-Math.cos(t) * c.w * k), n(Math.sin(t) * 12 - 6 + dy)];
  };
  const flower5 = (x, y, r, col) => `<g transform="translate(${n(x)} ${n(y)})">${[0, 1, 2, 3, 4].map((i) => { const a = (i * Math.PI * 2) / 5 - Math.PI / 2; return `<circle cx="${n(Math.cos(a) * r)}" cy="${n(Math.sin(a) * r)}" r="${n(r * 0.75)}" fill="${col}" stroke="${shade(col, -0.3)}" stroke-width="1"/>`; }).join('')}<circle r="${n(r * 0.5)}" fill="#fde047"/></g>`;
  const note = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="6" ry="4.5" transform="rotate(-25)" fill="${col}" stroke="#1f2937" stroke-width="1.5"/><path d="M5 -2V-24Q14 -20 14 -10" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M5 -2V-24" stroke="#1f2937" stroke-width="1" opacity=".4"/></g>`;
  const BFLY_UP = 'M0 0C6 -34 54 -50 60 -22C64 -4 36 6 0 2Z';
  const BFLY_LO = 'M0 4C24 6 46 16 38 34C28 46 6 30 0 8Z';
  const FAIRY_UP = 'M0 0C4 -30 30 -64 50 -58C62 -50 40 -14 0 2Z';
  const FAIRY_LO = 'M0 4C20 8 40 22 34 34C26 42 8 26 0 8Z';
  const DRAGON = 'M0 0L16 -40L28 -28L44 -50L50 -32L68 -42Q60 -20 70 -4Q54 -8 50 6Q40 -4 32 12Q22 2 0 10Z';
  const foxD = (c) => `M${n(c.w * 0.26)} -4Q${n(c.w * 0.62)} 4 ${n(c.w * 0.72)} -26Q${n(c.w * 0.8)} -54 ${n(c.w * 0.62)} -70Q${n(c.w * 0.68)} -46 ${n(c.w * 0.52)} -32Q${n(c.w * 0.42)} -20 ${n(c.w * 0.24)} -24Z`;

  return [
    // ── ojos ──
    {
      id: 'catglasses', label: 'Gafas de gato', en: 'Cat-eye glasses', pt: 'Óculos gatinho', group: 'eyes', anchor: 'eyes', color: '#db2777', color2: '#fde047', as3d: 'glasses',
      draw: (c) => {
        const R = c.r;
        return both((s) => {
          const x = s * c.sp;
          return `<path d="M${n(x - s * R * 1.5)} ${n(-R * 0.9)}Q${n(x)} ${n(-R * 1.5)} ${n(x + s * R * 2.3)} ${n(-R * 1.8)}Q${n(x + s * R * 1.9)} ${n(R * 1.4)} ${n(x)} ${n(R * 1.35)}Q${n(x - s * R * 1.65)} ${n(R * 1.3)} ${n(x - s * R * 1.5)} ${n(-R * 0.9)}Z" fill="#fff" fill-opacity=".14" stroke="${c.color}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="${n(x + s * R * 1.95)}" cy="${n(-R * 1.25)}" r="2.2" fill="${c.color2}" stroke="#1f2937" stroke-width="1"/>`;
        }) + `<path d="M${n(-c.sp + R * 1.5)} ${n(-R * 0.6)}Q0 ${n(-R * 1.2)} ${n(c.sp - R * 1.5)} ${n(-R * 0.6)}" stroke="${c.color}" stroke-width="3" fill="none"/>`;
      },
    },
    {
      id: 'shutters', label: 'Gafas persiana', en: 'Shutter shades', pt: 'Óculos persiana', group: 'eyes', anchor: 'eyes', color: '#facc15', as3d: 'sunglasses',
      draw: (c) => {
        const R = c.r;
        return both((s) => {
          const x = s * c.sp;
          const bars = [-0.55, 0, 0.55].map((k) => `<path d="M${n(x - R * 1.7)} ${n(k * R)}H${n(x + R * 1.7)}" stroke="${c.color}" stroke-width="${n(Math.max(2.5, R * 0.3))}"/>`).join('');
          return `<rect x="${n(x - R * 1.8)}" y="${n(-R * 1.3)}" width="${n(R * 3.6)}" height="${n(R * 2.6)}" rx="${n(R * 0.6)}" fill="none" stroke="#1f2937" stroke-width="6"/>${bars}<rect x="${n(x - R * 1.8)}" y="${n(-R * 1.3)}" width="${n(R * 3.6)}" height="${n(R * 2.6)}" rx="${n(R * 0.6)}" fill="none" stroke="${c.color}" stroke-width="3"/>`;
        }) + `<path d="M${n(-c.sp + R * 1.8)} ${n(-R * 0.6)}H${n(c.sp - R * 1.8)}" stroke="${c.color}" stroke-width="3.5"/>`;
      },
    },
    {
      id: 'skigoggles', label: 'Gafas de esquí', en: 'Ski goggles', pt: 'Óculos de esqui', group: 'eyes', anchor: 'eyes', color: '#f97316', color2: '#1e293b', clipExtra: true, as3d: 'goggles',
      draw: (c) => {
        const R = c.r;
        const x0 = -c.sp - R * 2.2;
        const lens = `M${n(x0)} ${n(-R * 0.2)}Q${n(x0)} ${n(-R * 1.6)} ${n(x0 + R * 1.4)} ${n(-R * 1.6)}H${n(-x0 - R * 1.4)}Q${n(-x0)} ${n(-R * 1.6)} ${n(-x0)} ${n(-R * 0.2)}Q${n(-x0)} ${n(R * 1.5)} ${n(-x0 - R * 1.4)} ${n(R * 1.5)}H${n(R * 0.9)}Q0 ${n(R * 0.6)} ${n(-R * 0.9)} ${n(R * 1.5)}H${n(x0 + R * 1.4)}Q${n(x0)} ${n(R * 1.5)} ${n(x0)} ${n(-R * 0.2)}Z`;
        return `<path d="${lens}" fill="${c.color}" stroke="#1f2937" stroke-width="5" stroke-linejoin="round"/><path d="${lens}" fill="none" stroke="${c.color2}" stroke-width="2.5" stroke-linejoin="round"/><path d="M${n(x0 + R * 0.6)} ${n(-R * 0.5)}Q0 ${n(-R * 1.5)} ${n(-x0 - R * 0.6)} ${n(-R * 0.5)}" stroke="#fde68a" stroke-width="${n(R * 0.5)}" fill="none" opacity=".55" stroke-linecap="round"/><path d="M${n(x0 + R * 0.9)} ${n(R * 0.5)}l${n(R * 0.9)} ${n(-R * 1.3)}" stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`;
      },
      extra: (c) => strap(c, -c.r * 0.2, c.r * 1.3, c.color2),
    },
    {
      id: 'swimgoggles', label: 'Gafas de natación', en: 'Swim goggles', pt: 'Óculos de natação', group: 'eyes', anchor: 'eyes', color: '#06b6d4', color2: '#a5f3fc', clipExtra: true, as3d: 'goggles',
      draw: (c) => {
        const R = c.r;
        return both((s) => `<ellipse cx="${n(s * c.sp)}" rx="${n(R * 1.55)}" ry="${n(R * 1.25)}" fill="${c.color2}" fill-opacity=".55" stroke="${c.color}" stroke-width="4.5"/><ellipse cx="${n(s * c.sp)}" rx="${n(R * 1.55)}" ry="${n(R * 1.25)}" fill="none" stroke="#1f2937" stroke-width="1.2" opacity=".6"/>${glint(s * c.sp - R * 0.8, -R * 0.6, R * 0.7, 2)}`) + `<path d="M${n(-c.sp + R * 1.5)} 0Q0 ${n(-R * 0.5)} ${n(c.sp - R * 1.5)} 0" stroke="${c.color}" stroke-width="3" fill="none"/>`;
      },
      extra: (c) => strap(c, 0, 3, c.color),
    },
    {
      id: 'sleepmask', label: 'Antifaz de dormir', en: 'Sleep mask', pt: 'Máscara de dormir', group: 'eyes', anchor: 'eyes', color: '#a78bfa', color2: '#ffffff', clipExtra: true, as3d: 'sunglasses',
      draw: (c) => {
        const R = c.r;
        const X = c.sp + R * 2.1;
        const d = `M${n(-X)} 0C${n(-X)} ${n(-R * 1.9)} ${n(-c.sp * 0.25)} ${n(-R * 1.9)} 0 ${n(-R * 1.3)}C${n(c.sp * 0.25)} ${n(-R * 1.9)} ${n(X)} ${n(-R * 1.9)} ${n(X)} 0C${n(X)} ${n(R * 1.8)} ${n(c.sp * 0.3)} ${n(R * 1.8)} 0 ${n(R * 1.1)}C${n(-c.sp * 0.3)} ${n(R * 1.8)} ${n(-X)} ${n(R * 1.8)} ${n(-X)} 0Z`;
        const lid = both((s) => {
          const x = s * c.sp;
          return `<path d="M${n(x - R * 0.9)} ${n(R * 0.05)}Q${n(x)} ${n(R * 0.85)} ${n(x + R * 0.9)} ${n(R * 0.05)}" stroke="${c.color2}" stroke-width="${n(Math.max(2, R * 0.22))}" fill="none" stroke-linecap="round"/>${[-0.5, 0, 0.5].map((k) => `<path d="M${n(x + k * R)} ${n(R * 0.5)}l${n(k * R * 0.3)} ${n(R * 0.4)}" stroke="${c.color2}" stroke-width="2" stroke-linecap="round"/>`).join('')}`;
        });
        return `<path d="${d}" fill="${c.color}" ${S(2.5)}/><path d="M${n(-X + R * 0.8)} ${n(-R * 0.9)}Q${n(-c.sp)} ${n(-R * 1.5)} ${n(-c.sp * 0.4)} ${n(-R * 1.25)}" stroke="#fff" stroke-width="2.5" fill="none" opacity=".4" stroke-linecap="round"/>${lid}`;
      },
      extra: (c) => strap(c, -c.r * 0.2, 3.5, shade(c.color, -0.2)),
    },
    {
      id: 'vrheadset', label: 'Gafas VR', en: 'VR headset', pt: 'Óculos VR', group: 'eyes', anchor: 'eyes', color: '#e5e7eb', color2: '#111827', clipExtra: true, as3d: 'visor',
      draw: (c) => {
        const R = c.r;
        const X = c.sp + R * 2.3;
        return `<rect x="${n(-X)}" y="${n(-R * 1.8)}" width="${n(X * 2)}" height="${n(R * 3.6)}" rx="${n(R * 1.1)}" fill="${c.color}" ${S(3)}/><rect x="${n(-X + R * 0.6)}" y="${n(-R * 1.2)}" width="${n(X * 2 - R * 1.2)}" height="${n(R * 2.4)}" rx="${n(R * 0.7)}" fill="${c.color2}"/><path d="M${n(-X + R * 1.1)} ${n(-R * 0.6)}H${n(-X + R * 3)}" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" opacity=".9"/><circle cx="${n(X - R * 1.3)}" cy="${n(R * 0.5)}" r="${n(Math.max(1.5, R * 0.18))}" fill="#22c55e"/><path d="M${n(-X + R * 0.4)} ${n(-R * 1.55)}H${n(X - R * 0.4)}" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>`;
      },
      extra: (c) => strap(c, 0, c.r * 1.2, '#374151'),
    },
    {
      id: 'halfmoon', label: 'Gafas de lectura', en: 'Reading glasses', pt: 'Óculos de leitura', group: 'eyes', anchor: 'eyes', color: '#a16207', as3d: 'glasses',
      draw: (c) => {
        const R = c.r;
        const y = R * 0.45;
        return both((s) => {
          const x = s * c.sp;
          return `<path d="M${n(x - R * 1.6)} ${n(y)}H${n(x + R * 1.6)}Q${n(x + R * 1.6)} ${n(y + R * 1.6)} ${n(x)} ${n(y + R * 1.6)}Q${n(x - R * 1.6)} ${n(y + R * 1.6)} ${n(x - R * 1.6)} ${n(y)}Z" fill="#fff" fill-opacity=".18" stroke="${c.color}" stroke-width="3.2" stroke-linejoin="round"/>`;
        }) + `<path d="M${n(-c.sp + R * 1.6)} ${n(y + 1)}Q0 ${n(y - R * 0.6)} ${n(c.sp - R * 1.6)} ${n(y + 1)}" stroke="${c.color}" stroke-width="2.8" fill="none"/><path d="M${n(-c.sp - R * 1.6)} ${n(y + 1)}Q${n(-c.sp - R * 2.6)} ${n(y + R * 4)} 0 ${n(y + R * 5)}Q${n(c.sp + R * 2.6)} ${n(y + R * 4)} ${n(c.sp + R * 1.6)} ${n(y + 1)}" stroke="${c.color}" stroke-width="1.4" fill="none" stroke-dasharray="2.5 2" opacity=".8"/>`;
      },
    },
    {
      id: 'flowerglasses', label: 'Gafas de flor', en: 'Flower glasses', pt: 'Óculos de flor', group: 'eyes', anchor: 'eyes', color: '#f472b6', as3d: 'heartglasses',
      draw: (c) => {
        const R = c.r;
        return both((s) => {
          const x = s * c.sp;
          const petals = Array.from({ length: 7 }, (_, i) => { const a = (i * Math.PI * 2) / 7 - Math.PI / 2; return `<circle cx="${n(x + Math.cos(a) * R * 1.55)}" cy="${n(Math.sin(a) * R * 1.55)}" r="${n(R * 0.72)}"/>`; }).join('');
          return `<g fill="${c.color}" stroke="${shade(c.color, -0.4)}" stroke-width="2">${petals}</g><circle cx="${n(x)}" r="${n(R * 1.3)}" fill="#fff" fill-opacity=".85" stroke="${shade(c.color, -0.4)}" stroke-width="2"/><circle cx="${n(x)}" r="${n(R * 1.3)}" fill="${c.color}" fill-opacity=".15"/>`;
        }) + `<path d="M${n(-c.sp + R * 1.9)} ${n(-R * 0.4)}Q0 ${n(-R * 1.1)} ${n(c.sp - R * 1.9)} ${n(-R * 0.4)}" stroke="${shade(c.color, -0.4)}" stroke-width="3" fill="none"/>`;
      },
    },
    {
      id: 'pixelshades', label: 'Gafas píxel', en: 'Pixel shades', pt: 'Óculos pixel', group: 'eyes', anchor: 'eyes', color: '#0f172a', as3d: 'sunglasses',
      draw: (c) => {
        const u = Math.max(2.4, c.r * 0.55);
        const X = c.sp + u * 3.5;
        let d = `<rect x="${n(-X)}" y="${n(-u * 1.6)}" width="${n(X * 2)}" height="${n(u)}" fill="${c.color}"/>`;
        for (const s of [-1, 1]) {
          const x0 = s * c.sp - u * 2.5;
          for (let r = 0; r < 3; r++) d += `<rect x="${n(x0 + (r === 2 ? u : 0))}" y="${n(-u * 0.6 + r * u)}" width="${n(u * (r === 2 ? 3 : 5))}" height="${n(u + 0.3)}" fill="${c.color}"/>`;
          d += `<rect x="${n(x0 + u)}" y="${n(-u * 0.6)}" width="${n(u)}" height="${n(u)}" fill="#fff"/><rect x="${n(x0 + u * 2)}" y="${n(u * 0.4)}" width="${n(u)}" height="${n(u)}" fill="#fff"/>`;
        }
        return d;
      },
    },
    {
      id: 'masquerade', label: 'Máscara de baile', en: 'Masquerade mask', pt: 'Máscara de baile', group: 'eyes', anchor: 'eyes', color: '#7c3aed', color2: '#facc15', as3d: 'sunglasses',
      draw: (c) => {
        const R = c.r;
        const sp = c.sp;
        const X = sp + R * 2.6;
        const d = `M${n(-X)} ${n(-R * 1.7)}Q${n(-sp)} ${n(-R * 2.1)} 0 ${n(-R * 1)}Q${n(sp)} ${n(-R * 2.1)} ${n(X)} ${n(-R * 1.7)}Q${n(sp + R * 2.3)} ${n(R * 1.6)} ${n(sp)} ${n(R * 1.5)}Q${n(sp * 0.3)} ${n(R * 1.5)} 0 ${n(R * 0.7)}Q${n(-sp * 0.3)} ${n(R * 1.5)} ${n(-sp)} ${n(R * 1.5)}Q${n(-sp - R * 2.3)} ${n(R * 1.6)} ${n(-X)} ${n(-R * 1.7)}Z${ell(-sp, 0, R * 1.25, R * 1.05)}${ell(sp, 0, R * 1.25, R * 1.05)}`;
        return `<path d="M${n(X - R * 0.4)} ${n(-R * 1.6)}Q${n(X + R * 1.6)} ${n(-R * 4)} ${n(X + R * 0.4)} ${n(-R * 5.4)}Q${n(X + R * 0.2)} ${n(-R * 3.4)} ${n(X - R * 1.2)} ${n(-R * 1.6)}Z" fill="${c.color2}" ${S(2)}/><path d="${d}" fill="${c.color}" fill-rule="evenodd" ${S(2.5)}/>${both((s) => `<circle cx="${n(s * (sp + R * 1.9))}" cy="${n(-R * 0.6)}" r="2" fill="${c.color2}"/><circle cx="${n(s * sp)}" cy="${n(-R * 1.55)}" r="2" fill="${c.color2}"/>`)}`;
      },
    },
    {
      id: 'heromask', label: 'Antifaz de héroe', en: 'Hero mask', pt: 'Máscara de herói', group: 'eyes', anchor: 'eyes', color: '#dc2626', clipExtra: true, as3d: 'sunglasses',
      draw: (c) => {
        const R = c.r;
        const sp = c.sp;
        const X = sp + R * 2.2;
        const d = `M${n(-X)} ${n(-R * 0.4)}Q${n(-X)} ${n(-R * 1.7)} ${n(-sp)} ${n(-R * 1.7)}Q${n(-sp * 0.3)} ${n(-R * 1.7)} 0 ${n(-R * 1.2)}Q${n(sp * 0.3)} ${n(-R * 1.7)} ${n(sp)} ${n(-R * 1.7)}Q${n(X)} ${n(-R * 1.7)} ${n(X)} ${n(-R * 0.4)}Q${n(X)} ${n(R * 1.6)} ${n(sp)} ${n(R * 1.5)}Q${n(sp * 0.3)} ${n(R * 1.4)} 0 ${n(R * 0.8)}Q${n(-sp * 0.3)} ${n(R * 1.4)} ${n(-sp)} ${n(R * 1.5)}Q${n(-X)} ${n(R * 1.6)} ${n(-X)} ${n(-R * 0.4)}Z${ell(-sp, 0, R * 1.15, R * 0.95)}${ell(sp, 0, R * 1.15, R * 0.95)}`;
        return `<path d="${d}" fill="${c.color}" fill-rule="evenodd" ${S(2.5)}/><path d="M${n(-X + R * 0.6)} ${n(-R * 0.9)}Q${n(-sp - R)} ${n(-R * 1.45)} ${n(-sp)} ${n(-R * 1.45)}" stroke="#fff" stroke-width="2.5" fill="none" opacity=".4" stroke-linecap="round"/>`;
      },
      extra: (c) => strap(c, -c.r * 0.3, 4, shade(c.color, -0.15)),
    },
    {
      id: 'loupe', label: 'Lupa de joyero', en: 'Jeweler loupe', pt: 'Lupa de joalheiro', group: 'eyes', anchor: 'eyes', color: '#111827', color2: '#facc15', clipExtra: true, as3d: 'monocle',
      draw: (c) => {
        const R = c.r;
        const x = c.sp;
        return `<circle cx="${n(x)}" r="${n(R * 1.9)}" fill="${c.color}" ${S(2)}/><circle cx="${n(x)}" r="${n(R * 1.35)}" fill="#bae6fd" fill-opacity=".55" stroke="${c.color2}" stroke-width="2.5"/><circle cx="${n(x)}" r="${n(R * 1.35)}" fill="none" stroke="#1f2937" stroke-width="1"/>${glint(x - R * 0.8, -R * 0.7, R * 0.8)}`;
      },
      extra: (c) => `<path d="M${n(-c.w * 0.6)} ${n(-c.r * 3.2)}Q0 ${n(-c.r * 3.6)} ${n(c.sp)} ${n(-c.r * 1.8)}" stroke="#374151" stroke-width="3" fill="none"/>`,
    },

    // ── cara ──
    {
      id: 'dognose', label: 'Nariz de perrito', en: 'Puppy nose', pt: 'Nariz de cachorro', group: 'face', anchor: 'nose', color: '#1f2937', as3d: 'clownnose',
      draw: (c) => `<g transform="scale(${n(c.m)})"><path d="M-10 -5Q0 -10 10 -5Q11 2 0 7Q-11 2 -10 -5Z" fill="${c.color}" stroke="${shade(c.color, -0.3)}" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="-3.5" cy="-4.5" rx="3.2" ry="1.6" fill="#fff" opacity=".55"/><path d="M0 7V11" stroke="${c.color}" stroke-width="2" stroke-linecap="round"/></g>`,
    },
    {
      id: 'bunnynose', label: 'Nariz de conejito', en: 'Bunny nose', pt: 'Nariz de coelhinho', group: 'face', anchor: 'nose', color: '#f9a8d4', as3d: 'nose',
      draw: (c) => `<g transform="scale(${n(c.m)})"><path d="M-6 -3Q0 -6 6 -3Q4 3 0 4Q-4 3 -6 -3Z" fill="${c.color}" stroke="${shade(c.color, -0.35)}" stroke-width="1.5" stroke-linejoin="round"/><path d="M0 4V8M0 8Q-3 11 -7 10M0 8Q3 11 7 10" stroke="#1f2937" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".75"/>${both((s) => [0, 1, 2].map((i) => `<circle cx="${s * (14 + i * 4)}" cy="${2 + (i % 2) * 4}" r="1.3" fill="#1f2937" opacity=".55"/>`).join(''))}</g>`,
    },
    {
      id: 'nosering', label: 'Aro en la nariz', en: 'Nose ring', pt: 'Argola no nariz', group: 'face', anchor: 'nose', color: '#facc15', as3d: 'nose',
      draw: (c) => `<g transform="scale(${n(c.m)})"><ellipse rx="6" ry="4" fill="${c.body}" style="filter:brightness(.82)"/><ellipse cx="-2" cy="-1.5" rx="2" ry="1" fill="#fff" opacity=".5"/><circle cx="2.5" cy="6" r="4.2" fill="none" stroke="#1f2937" stroke-width="3.6"/><circle cx="2.5" cy="6" r="4.2" fill="none" stroke="${c.color}" stroke-width="2"/></g>`,
    },
    {
      id: 'pacifier', label: 'Chupete', en: 'Pacifier', pt: 'Chupeta', group: 'face', anchor: 'mouth', color: '#7dd3fc', color2: '#f9a8d4', as3d: 'lollipop',
      draw: (c) => `<g transform="translate(0 2) scale(${n(c.m)})"><circle cy="9" r="7" fill="none" stroke="#1f2937" stroke-width="5.5"/><circle cy="9" r="7" fill="none" stroke="${c.color2}" stroke-width="3"/><path d="M-15 -2Q-16 -9 -8 -8Q0 -12 8 -8Q16 -9 15 -2Q14 5 0 5Q-14 5 -15 -2Z" fill="${c.color}" ${S(2.5)}/><circle cy="-2" r="4" fill="${shade(c.color, -0.2)}" stroke="#1f2937" stroke-width="2"/><path d="M-10 -5Q-6 -8 -2 -7" stroke="#fff" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/></g>`,
    },
    {
      id: 'bubblegum', label: 'Chicle', en: 'Bubble gum', pt: 'Chiclete', group: 'face', anchor: 'mouth', color: '#f9a8d4', as3d: 'lollipop',
      draw: (c) => `<g transform="scale(${n(c.m)})"><circle cy="5" r="15" fill="${c.color}" fill-opacity=".92" stroke="${shade(c.color, -0.3)}" stroke-width="2"/><path d="M-9 -2Q-8 -7 -3 -8" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="7" cy="11" r="2" fill="#fff" opacity=".6"/></g>`,
    },
    {
      id: 'mouthrose', label: 'Rosa en la boca', en: 'Rose in mouth', pt: 'Rosa na boca', group: 'face', anchor: 'mouth', color: '#e11d48', color2: '#16a34a', as3d: 'pipe',
      draw: (c) => `<g transform="scale(${n(c.m)})"><path d="M-24 2L20 6" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/><path d="M-24 2L20 6" stroke="${c.color2}" stroke-width="3" stroke-linecap="round"/><path d="M4 4q6 8 13 4q-5 -7 -13 -4Z" fill="${c.color2}" stroke="#1f2937" stroke-width="1.5"/><g transform="translate(27 6)"><circle r="8.5" fill="${c.color}" ${S(2)}/><path d="M-4 -1a4 4 0 1 1 6 3M-6 3q4 4 9 1M-1 -5q5 -1 6 4" stroke="${shade(c.color, -0.4)}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g></g>`,
    },
    {
      id: 'candycane', label: 'Bastón de caramelo', en: 'Candy cane', pt: 'Bengala doce', group: 'face', anchor: 'mouth', color: '#ef4444', as3d: 'lollipop',
      draw: (c) => {
        const d = 'M0 0L20 4Q30 6 31 -3Q31 -11 24 -10';
        return `<g transform="translate(${n(c.mw * 0.4)} 0) scale(${n(c.m)})"><path d="${d}" stroke="#1f2937" stroke-width="8.5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#fff" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${c.color}" stroke-width="5.5" fill="none" stroke-dasharray="4 4"/></g>`;
      },
    },
    {
      id: 'wheat', label: 'Espiga', en: 'Straw stalk', pt: 'Espiga', group: 'face', anchor: 'mouth', color: '#eab308', as3d: 'pipe',
      draw: (c) => `<g transform="translate(${n(c.mw * 0.4)} 0) scale(${n(c.m)})"><path d="M0 0L30 -14" stroke="${shade(c.color, -0.25)}" stroke-width="2.5" stroke-linecap="round"/>${[0, 1, 2, 3].map((i) => `<ellipse cx="${26 + i * 4}" cy="${-12 - i * 2}" rx="3.5" ry="1.8" transform="rotate(-50 ${26 + i * 4} ${-12 - i * 2})" fill="${c.color}" stroke="#1f2937" stroke-width="1"/><ellipse cx="${28 + i * 4}" cy="${-9 - i * 2}" rx="3.5" ry="1.8" transform="rotate(10 ${28 + i * 4} ${-9 - i * 2})" fill="${c.color}" stroke="#1f2937" stroke-width="1"/>`).join('')}</g>`,
    },
    {
      id: 'tusks', label: 'Colmillos de ogro', en: 'Ogre tusks', pt: 'Presas de ogro', group: 'face', anchor: 'mouth', color: '#fefce8', as3d: 'goatee',
      draw: (c) => both((s) => `<g transform="translate(${n(s * (c.mw * 0.8 + 2 * c.m))} ${n(3 * c.m)}) scale(${n(s * c.m)} ${n(c.m)})"><path d="M-3.5 2Q-4 -6 1.5 -11Q0.5 -4 3.5 2Z" fill="${c.color}" stroke="#1f2937" stroke-width="1.8" stroke-linejoin="round"/></g>`),
    },
    {
      id: 'pencilstache', label: 'Bigote fino', en: 'Pencil mustache', pt: 'Bigode fino', group: 'face', anchor: 'mouth', color: '#1f2937', as3d: 'mustache',
      draw: (c) => `<path d="M0 -8Q-12 -13 -24 -9Q-26 -8 -24 -7Q-12 -8 0 -5Q12 -8 24 -7Q26 -8 24 -9Q12 -13 0 -8Z" fill="${c.color}" stroke="${c.color}" stroke-width="1.2" stroke-linejoin="round" transform="scale(${n(c.m)})"/>`,
    },
    {
      id: 'stubble', label: 'Barba de tres días', en: 'Stubble', pt: 'Barba por fazer', group: 'face', anchor: 'mouth', color: '#44403c', clip: true, as3d: 'beard',
      draw: (c) => {
        let d = '';
        const W = c.w * 0.36;
        for (let i = 0; i < 70; i++) {
          const x = (((i * 37) % 70) / 70 - 0.5) * 2 * W + Math.sin(i * 7.3) * 3;
          const y = -8 + ((i * 53) % 70) / 70 * 34 + Math.cos(i * 3.1) * 2;
          if (Math.abs(x) < c.mw + 3 && y < 7) continue;
          if ((x / W) ** 2 + ((y - 4) / 30) ** 2 > 1) continue;
          d += `<circle cx="${n(x)}" cy="${n(y)}" r="1.2"/>`;
        }
        return `<g fill="${c.color}" opacity=".55">${d}</g>`;
      },
    },
    {
      id: 'cheeksticker', label: 'Pegatina', en: 'Heart sticker', pt: 'Adesivo', group: 'face', anchor: 'eyes', color: '#f472b6', as3d: 'bandaid',
      draw: (c) => `<g transform="translate(${n(-(c.sp + c.r * 0.5))} ${n(c.r * 2.3)}) rotate(-12)"><path d="${heartPath(7)}" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="${heartPath(7)}" fill="${c.color}"/><path d="M-4 -3l1.5 -1.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="${star(2.6, 0.35, 4)}" transform="translate(9 -6)" fill="#facc15"/></g>`,
    },
    {
      id: 'duckbill', label: 'Pico de pato', en: 'Duck bill', pt: 'Bico de pato', group: 'face', anchor: 'mouth', color: '#f59e0b', as3d: 'pignose',
      draw: (c) => `<g transform="scale(${n(c.m)})"><path d="M-20 4Q-14 12 0 11Q14 12 20 4Q10 8 0 7Q-10 8 -20 4Z" fill="${shade(c.color, -0.15)}" ${S(2)}/><path d="M-22 0Q-24 -12 0 -12Q24 -12 22 0Q20 6 0 6Q-20 6 -22 0Z" fill="${c.color}" ${S(2.5)}/><ellipse cx="-4" cy="-7" rx="1.6" ry="1" fill="#1f2937" opacity=".6"/><ellipse cx="4" cy="-7" rx="1.6" ry="1" fill="#1f2937" opacity=".6"/><path d="M-14 -7Q-8 -10 -4 -10" stroke="#fff" stroke-width="2" fill="none" opacity=".5" stroke-linecap="round"/></g>`,
    },
    {
      id: 'gasmask', label: 'Respirador', en: 'Respirator', pt: 'Respirador', group: 'face', anchor: 'mouth', color: '#64748b', color2: '#334155', clipExtra: true, as3d: 'facemask',
      draw: (c) => `<g transform="scale(${n(c.m)})">${both((s) => `<circle cx="${s * 19}" cy="7" r="8" fill="${c.color2}" ${S(2)}/><circle cx="${s * 19}" cy="7" r="4" fill="none" stroke="${shade(c.color2, 0.3)}" stroke-width="1.5"/>`)}<path d="M-16 -8Q-16 -14 0 -14Q16 -14 16 -8L13 10Q0 18 -13 10Z" fill="${c.color}" ${S(2.5)}/>${[-1, 2, 5, 8].map((y) => `<path d="M-7 ${y}H7" stroke="${c.color2}" stroke-width="1.8" stroke-linecap="round"/>`).join('')}<path d="M-11 -10Q-6 -12 -2 -12" stroke="#fff" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/></g>`,
      extra: (c) => strap(c, -4 * c.m, 3, '#374151'),
    },

    // ── cuello ──
    {
      id: 'heartlocket', label: 'Colgante de corazón', en: 'Heart locket', pt: 'Pingente de coração', group: 'neck', anchor: 'neck', color: '#f43f5e', color2: '#facc15', as3d: 'medal',
      draw: (c) => {
        const N = 13;
        const pts = Array.from({ length: N }, (_, i) => arc(c, 0.3, i, N).join(' ')).join('L');
        return `<path d="M${pts}" stroke="${c.color2}" stroke-width="2" fill="none" stroke-dasharray="2 1.5"/><path d="${heartPath(8)}" transform="translate(0 14)" fill="${c.color}" ${S(2)}/><path d="M-4 10l2 -2" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/><circle cy="6" r="2" fill="${c.color2}" stroke="#1f2937" stroke-width="1"/>`;
      },
    },
    {
      id: 'goldchain', label: 'Cadena de oro', en: 'Gold chain', pt: 'Corrente de ouro', group: 'neck', anchor: 'neck', color: '#facc15', as3d: 'pearls',
      draw: (c) => {
        const N = 11;
        let d = '';
        for (let i = 0; i < N; i++) {
          const [x, y] = arc(c, 0.32, i, N, 2);
          const t = (i / (N - 1)) * Math.PI;
          const rot = (Math.atan2(Math.cos(t) * 12, Math.sin(t) * c.w * 0.32) * 180) / Math.PI;
          d += `<ellipse cx="${x}" cy="${y}" rx="${i % 2 ? 4.5 : 5.5}" ry="${i % 2 ? 2.4 : 3.4}" transform="rotate(${n(i % 2 ? rot + 0 : rot)} ${x} ${y})" fill="none" stroke="#1f2937" stroke-width="4"/><ellipse cx="${x}" cy="${y}" rx="${i % 2 ? 4.5 : 5.5}" ry="${i % 2 ? 2.4 : 3.4}" transform="rotate(${n(rot)} ${x} ${y})" fill="none" stroke="${c.color}" stroke-width="2.2"/>`;
        }
        return d;
      },
    },
    {
      id: 'neckerchief', label: 'Pañuelo al cuello', en: 'Neckerchief', pt: 'Lenço no pescoço', group: 'neck', anchor: 'neck', clip: true, color: '#dc2626', as3d: 'scarf',
      draw: (c) => `<rect x="${n(-c.w)}" y="-7" width="${n(c.w * 2)}" height="11" fill="${c.color}"/><path d="M${n(-c.w)} -7H${n(c.w)}" stroke="#1f2937" stroke-width="1.5" opacity=".4"/>`,
      extra: (c) => `<path d="M-18 -2L18 -2L0 24Z" fill="${c.color}" ${S(2)}/>${[[-6, 3], [6, 3], [0, 12], [-10, -1], [10, -1]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff"/>`).join('')}<circle cy="-2" r="4.5" fill="${shade(c.color, -0.2)}" ${S(2)}/>`,
    },
    {
      id: 'lei', label: 'Collar de flores', en: 'Flower lei', pt: 'Colar de flores', group: 'neck', anchor: 'neck', color: '#f472b6', color2: '#fb923c', as3d: 'pearls',
      draw: (c) => {
        const N = 9;
        return Array.from({ length: N }, (_, i) => { const [x, y] = arc(c, 0.34, i, N); return flower5(x, y, 4.2, i % 2 ? c.color2 : c.color); }).join('');
      },
    },
    {
      id: 'dogcollar', label: 'Collar con chapa', en: 'Pet collar', pt: 'Coleira', group: 'neck', anchor: 'neck', color: '#2563eb', color2: '#facc15', clip: true, as3d: 'bell',
      draw: (c) => `<rect x="${n(-c.w)}" y="-6" width="${n(c.w * 2)}" height="10" fill="${c.color}"/><path d="M${n(-c.w)} -6H${n(c.w)}M${n(-c.w)} 4H${n(c.w)}" stroke="#1f2937" stroke-width="1.5" opacity=".45"/>${Array.from({ length: 9 }, (_, i) => `<circle cx="${n((i - 4) * c.w * 0.1)}" cy="-1" r="1.8" fill="#e5e7eb" stroke="#64748b" stroke-width=".8"/>`).join('')}`,
      extra: (c) => `<circle cy="5" r="3" fill="none" stroke="#94a3b8" stroke-width="2"/><circle cy="14" r="7" fill="${c.color2}" ${S(2)}/><path d="M-3 12h6M-2 15h4" stroke="${shade(c.color2, -0.4)}" stroke-width="1.4" stroke-linecap="round"/>`,
    },
    {
      id: 'ribbonbow', label: 'Lazo de cinta', en: 'Ribbon bow', pt: 'Laço de fita', group: 'neck', anchor: 'neck', color: '#f472b6', as3d: 'bowtie',
      draw: (c) => `<path d="M-3 2L-12 26L-6 22L-2 28ZM3 2L12 26L6 22L2 28Z" fill="${shade(c.color, -0.1)}" ${S(2)}/>${both((s) => `<path d="M0 0Q${s * 10} -18 ${s * 24} -10Q${s * 30} 0 ${s * 24} 8Q${s * 10} 14 0 0Z" fill="${c.color}" ${S(2.5)}/><path d="M${s * 6} -3Q${s * 14} -10 ${s * 20} -6" stroke="${shade(c.color, -0.25)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`)}<ellipse rx="6" ry="7" fill="${shade(c.color, -0.12)}" ${S(2.5)}/><path d="M-2 -3q2 -1 3 0" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/>`,
    },
    {
      id: 'sailorcollar', label: 'Cuello marinero', en: 'Sailor collar', pt: 'Gola de marinheiro', group: 'neck', anchor: 'neck', color: '#1e3a8a', color2: '#dc2626', clip: true, as3d: 'ruff',
      draw: (c) => `<path d="M${n(-c.w * 0.7)} -8H${n(c.w * 0.7)}V16L0 40L${n(-c.w * 0.7)} 16Z" fill="${c.color}"/><path d="M${n(-c.w * 0.26)} -8H${n(c.w * 0.26)}L0 24Z" fill="#fafafa"/><path d="M${n(-c.w * 0.32)} -8L0 30L${n(c.w * 0.32)} -8" stroke="#fafafa" stroke-width="2.5" fill="none"/><path d="M${n(-c.w * 0.7)} -8H${n(c.w * 0.7)}" stroke="#1f2937" stroke-width="2" opacity=".4"/>`,
      extra: (c) => `<path d="M-3 24L-9 38M3 24L9 38" stroke="${c.color2}" stroke-width="4" stroke-linecap="round"/><path d="M-9 20L9 20L0 28Z" fill="${c.color2}" ${S(2)}/>`,
    },

    // ── espalda ──
    {
      id: 'butterflywings', label: 'Alas de mariposa', en: 'Butterfly wings', pt: 'Asas de borboleta', group: 'back', anchor: 'center', layer: 'back', color: '#f97316', color2: '#fde047', as3d: 'wings',
      draw: (c) => both((s) => `<g transform="translate(${n(s * c.w * 0.36)} -8) scale(${s * 0.88} 0.88)"><path d="${BFLY_LO}" fill="${c.color2}" ${S(2.5)}/><path d="${BFLY_UP}" fill="${c.color}" ${S(2.5)}/><circle cx="40" cy="-24" r="7" fill="${c.color2}" stroke="#1f2937" stroke-width="2"/><circle cx="40" cy="-24" r="3" fill="#1f2937"/><circle cx="22" cy="-30" r="3" fill="#fff" opacity=".8"/><circle cx="26" cy="22" r="4" fill="#fff" opacity=".7"/></g>`),
    },
    {
      id: 'fairywings', label: 'Alas de hada', en: 'Fairy wings', pt: 'Asas de fada', group: 'back', anchor: 'center', layer: 'back', color: '#a5f3fc', as3d: 'wings',
      draw: (c) => both((s) => `<g transform="translate(${n(s * c.w * 0.34)} -10) scale(${s} 1)"><path d="${FAIRY_LO}" fill="${c.color}" fill-opacity=".7" stroke="${shade(c.color, -0.45)}" stroke-width="2.2" stroke-linejoin="round"/><path d="${FAIRY_UP}" fill="${c.color}" fill-opacity=".7" stroke="${shade(c.color, -0.45)}" stroke-width="2.2" stroke-linejoin="round"/><path d="M2 0Q22 -24 44 -52M2 6Q18 14 30 30" stroke="${shade(c.color, -0.3)}" stroke-width="1.4" fill="none" opacity=".8"/><path d="${star(3, 0.35, 4)}" transform="translate(30 -40)" fill="#fff"/><path d="${star(2.2, 0.35, 4)}" transform="translate(20 18)" fill="#fff"/></g>`),
    },
    {
      id: 'dragonwings', label: 'Alas de dragón', en: 'Dragon wings', pt: 'Asas de dragão', group: 'back', anchor: 'center', layer: 'back', color: '#15803d', color2: '#86efac', as3d: 'batwings',
      draw: (c) => both((s) => `<g transform="translate(${n(s * c.w * 0.38)} -10) scale(${s * 0.8} 0.8)"><path d="${DRAGON}" fill="${c.color2}" ${S(2.5)}/><path d="M0 2L16 -40M8 4L44 -50M16 6L68 -42" stroke="${c.color}" stroke-width="3.5" stroke-linecap="round"/><path d="M0 2L16 -40L28 -28L44 -50" stroke="#1f2937" stroke-width="2" fill="none" stroke-linejoin="round"/></g>`),
    },
    {
      id: 'backpack', label: 'Mochila', en: 'Backpack', pt: 'Mochila', group: 'back', anchor: 'center', layer: 'back', color: '#f97316', color2: '#fde68a', as3d: 'jetpack',
      draw: (c) => {
        const W = c.w * 0.58;
        const H = c.h * 0.32;
        return `<path d="M-14 ${n(-H - 4)}Q0 ${n(-H - 22)} 14 ${n(-H - 4)}" stroke="#1f2937" stroke-width="7" fill="none"/><path d="M-14 ${n(-H - 4)}Q0 ${n(-H - 22)} 14 ${n(-H - 4)}" stroke="${shade(c.color, -0.2)}" stroke-width="4" fill="none"/><rect x="${n(-W)}" y="${n(-H)}" width="${n(W * 2)}" height="${n(H * 2)}" rx="${n(Math.min(W, H) * 0.45)}" fill="${c.color}" ${S(3)}/>${both((s) => `<rect x="${n(s > 0 ? W - 4 : -W - 10)}" y="${n(-H * 0.1)}" width="14" height="${n(H * 0.8)}" rx="5" fill="${c.color2}" ${S(2.5)}/><path d="M${n(s * (W + 3))} ${n(H * 0.05)}v${n(H * 0.25)}" stroke="#1f2937" stroke-width="1.5" opacity=".5"/>`)}`;
      },
    },
    {
      id: 'turtleshell', label: 'Caparazón', en: 'Turtle shell', pt: 'Casco de tartaruga', group: 'back', anchor: 'center', layer: 'back', color: '#65a30d', color2: '#d9f99d', as3d: 'jetpack',
      draw: (c) => {
        const rx = c.w * 0.6;
        const ry = c.h * 0.54;
        const hex = [[0, -0.55], [-0.62, -0.25], [0.62, -0.25], [-0.62, 0.35], [0.62, 0.35], [0, 0.6], [-0.9, 0.05], [0.9, 0.05]].map(([a, b]) => `<path d="${star(Math.min(rx, ry) * 0.24, 0.87, 3).replace(/./, 'M')}" transform="translate(${n(a * rx * 0.8)} ${n(b * ry * 0.8)})" fill="${shade(c.color, 0.15)}" stroke="${shade(c.color, -0.35)}" stroke-width="2"/>`).join('');
        return `<g transform="translate(0 -6)"><ellipse rx="${n(rx + 6)}" ry="${n(ry + 6)}" fill="${c.color2}" ${S(3)}/><ellipse rx="${n(rx)}" ry="${n(ry)}" fill="${c.color}" stroke="${shade(c.color, -0.35)}" stroke-width="2.5"/>${hex}</g>`;
      },
    },
    {
      id: 'foxtail', label: 'Cola de zorro', en: 'Fox tail', pt: 'Cauda de raposa', group: 'back', anchor: 'bottom', layer: 'back', color: '#ea580c', color2: '#fafafa', grow: 'part', as3d: 'tail',
      shape: (c) => [{ d: foxD(c) }],
      draw: (c) => `<path d="${foxD(c)}" fill="${c.color}" ${S(2.5)}/><path d="M${n(c.w * 0.62)} -70Q${n(c.w * 0.82)} -56 ${n(c.w * 0.74)} -40Q${n(c.w * 0.64)} -48 ${n(c.w * 0.62)} -70Z" fill="${c.color2}" ${S(2)}/>`,
    },

    // ── extras ──
    {
      id: 'musicnotes', label: 'Notas musicales', en: 'Music notes', pt: 'Notas musicais', group: 'extra', anchor: 'top', color: '#8b5cf6', as3d: 'sparkles',
      draw: (c) => note(-44, -6, 1, c.color) + note(34, -14, 0.85, shade(c.color, 0.2)) + note(52, -36, 0.65, c.color),
    },
    {
      id: 'bubbles', label: 'Burbujas', en: 'Bubbles', pt: 'Bolhas', group: 'extra', anchor: 'center', color: '#7dd3fc', as3d: 'sparkles',
      draw: (c) => [[-0.72, -0.5, 7], [-0.85, -0.2, 4], [0.78, -0.4, 9], [0.88, 0.05, 5], [0.7, 0.45, 4]].map(([a, b, r]) => `<g transform="translate(${n(a * Math.min(c.w, 112))} ${n(b * Math.min(c.h, 120))})"><circle r="${r}" fill="${c.color}" fill-opacity=".25" stroke="${shade(c.color, -0.25)}" stroke-width="1.6"/><path d="M${n(-r * 0.55)} ${n(-r * 0.1)}a${n(r * 0.6)} ${n(r * 0.6)} 0 0 1 ${n(r * 0.45)} ${n(-r * 0.45)}" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`).join(''),
    },
    {
      id: 'butterfly', label: 'Mariposa', en: 'Butterfly', pt: 'Borboleta', group: 'extra', anchor: 'shoulder', color: '#f472b6', color2: '#facc15', as3d: 'parrot',
      draw: (c) => `<g transform="translate(8 -26) rotate(12) scale(.32)">${both((s) => `<g transform="scale(${s} 1)"><path d="${BFLY_LO}" fill="${c.color2}" stroke="#1f2937" stroke-width="5" stroke-linejoin="round"/><path d="${BFLY_UP}" fill="${c.color}" stroke="#1f2937" stroke-width="5" stroke-linejoin="round"/><circle cx="36" cy="-22" r="8" fill="#fff" opacity=".8"/></g>`)}<ellipse rx="5" ry="22" cy="6" fill="#1f2937"/><path d="M-2 -14Q-8 -30 -16 -34M2 -14Q8 -30 16 -34" stroke="#1f2937" stroke-width="4" fill="none" stroke-linecap="round"/></g>`,
    },
    {
      id: 'raincloud', label: 'Nubecita de lluvia', en: 'Rain cloud', pt: 'Nuvem de chuva', group: 'extra', anchor: 'top', color: '#94a3b8', color2: '#60a5fa', as3d: 'zzz',
      draw: (c) => `<g transform="translate(26 -46)">${[[-6, 12], [0, 18], [6, 12], [12, 18]].map(([x, y]) => `<path d="M${x} ${y}q-3 5 0 7q3 -2 0 -7Z" fill="${c.color2}" stroke="#1e40af" stroke-width="1"/>`).join('')}<path d="M-16 8Q-24 8 -24 0Q-24 -8 -15 -8Q-14 -18 -3 -18Q6 -24 13 -15Q24 -16 24 -4Q30 0 26 6Q24 9 18 8Z" fill="${c.color}" ${S(2.5)}/><path d="M-14 -2Q-12 -9 -5 -10" stroke="#fff" stroke-width="2.5" fill="none" opacity=".6" stroke-linecap="round"/></g>`,
    },
    {
      id: 'balloon', label: 'Globo', en: 'Balloon', pt: 'Balão', group: 'extra', anchor: 'shoulder', color: '#ef4444', as3d: 'parrot',
      draw: (c) => `<path d="M0 0Q10 -20 2 -36Q-4 -48 10 -58" stroke="#1f2937" stroke-width="1.5" fill="none"/><g transform="translate(14 -78)"><ellipse rx="15" ry="18" fill="${c.color}" ${S(2.5)}/><path d="M-3 18l3 5l3 -5Z" fill="${shade(c.color, -0.2)}" ${S(1.5)}/><path d="M-8 -8Q-6 -14 0 -15" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/></g>`,
    },
  ];
};
