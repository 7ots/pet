/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default (h) => {
  const { n, shade, mouthShape, openMouth, line, closedOr, heartPath } = h;
  // p = { w (media anchura), open 0..1, curve -1..1, ink, lip, tongue, teeth, lipColor }

  /** Forma rellena de boca con su interior recortado y el borde encima. */
  const clipped = (p, shape, inner, sw = Math.max(1.4, p.w * 0.1)) => {
    const id = `m${Math.round(Math.random() * 1e9)}`;
    return `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" fill="${p.ink}"/><g clip-path="url(#${id})">${inner}</g><path d="${shape}" fill="none" stroke="${p.lip}" stroke-width="${n(sw)}" stroke-linejoin="round"/>`;
  };
  /** y de la línea de la sonrisa básica ('smile') en x. */
  const smileY = (p, x) => {
    const y0 = -p.w * 0.1 - p.curve * 3;
    const yc = p.w * 0.75 + p.curve * p.w * 0.4;
    const t = (x / p.w + 1) / 2;
    return y0 * (1 - 2 * t * (1 - t)) + 2 * t * (1 - t) * yc;
  };
  const smileD = (p, k = 1) => `M${n(-p.w * k)} ${n(smileY(p, -p.w * k))}Q0 ${n(p.w * 0.75 + p.curve * p.w * 0.4)} ${n(p.w * k)} ${n(smileY(p, p.w * k))}`;
  const smile = (p) => line(p, `M${n(-p.w)} ${n(-p.w * 0.1 - p.curve * 3)}Q0 ${n(p.w * 0.75 + p.curve * p.w * 0.4)} ${n(p.w)} ${n(-p.w * 0.1 - p.curve * 3)}`);
  const fangAt = (p, x, y, s = 1) => `<path d="M${n(x - p.w * 0.11 * s)} ${n(y - 0.5)}L${n(x)} ${n(y + p.w * 0.3 * s)}L${n(x + p.w * 0.11 * s)} ${n(y - 0.5)}Z" fill="${p.teeth}" stroke="${p.lip}" stroke-width="1" stroke-linejoin="round"/>`;
  const tongueTip = (p, x, y, s = 1) => `<path d="M${n(x - p.w * 0.17 * s)} ${n(y)}v${n(p.w * 0.14 * s)}a${n(p.w * 0.17 * s)} ${n(p.w * 0.17 * s)} 0 0 0 ${n(p.w * 0.34 * s)} 0v${n(-p.w * 0.14 * s)}Z" fill="${p.tongue}" stroke="${shade(p.tongue, -0.3)}" stroke-width="1.2"/><path d="M${n(x)} ${n(y + p.w * 0.04)}v${n(p.w * 0.14 * s)}" stroke="${shade(p.tongue, -0.3)}" stroke-width="1"/>`;

  return [
    {
      id: 'dgrin', label: 'Sonrisa D', en: 'Big D grin', pt: 'Sorrisão D', as3d: 'laugh',
      draw: (p) => {
        const w = p.w;
        const hh = w * (0.7 + p.open * 0.45);
        const shape = `M${n(-w)} ${n(-w * 0.05)}Q0 ${n(-w * 0.18)} ${n(w)} ${n(-w * 0.05)}C${n(w)} ${n(hh * 0.8)} ${n(w * 0.5)} ${n(hh)} 0 ${n(hh)}C${n(-w * 0.5)} ${n(hh)} ${n(-w)} ${n(hh * 0.8)} ${n(-w)} ${n(-w * 0.05)}Z`;
        return clipped(p, shape, `<rect x="${n(-w)}" y="${n(-w * 0.3)}" width="${n(w * 2)}" height="${n(w * 0.5)}" fill="${p.teeth}"/><ellipse cy="${n(hh)}" rx="${n(w * 0.55)}" ry="${n(hh * 0.42)}" fill="${p.tongue}"/>`);
      },
    },
    {
      id: 'shark', label: 'Tiburón', en: 'Shark', pt: 'Tubarão', as3d: 'monster',
      draw: (p) => {
        const w = p.w * 1.1;
        const hh = p.w * (0.5 + p.open * 0.55);
        const cv = Math.max(0.2, p.curve + 0.4);
        const c = cv * w * 0.35;
        const shape = mouthShape(w, hh, cv);
        const vT = -0.2 * c - 0.075 * hh + p.w * 0.08;
        const vB = hh + c * 0.4 - p.w * 0.1;
        let top = `M${n(-w - 2)} ${n(-w)}H${n(w + 2)}V${n(vT)}`;
        for (let i = 6; i >= 0; i--) top += `L${n(-w + (i * 2 * w) / 6)} ${n(vT)}${i ? `L${n(-w + ((i - 0.5) * 2 * w) / 6)} ${n(vT + p.w * 0.32)}` : ''}`;
        let bot = `M${n(-w - 2)} ${n(hh + w)}H${n(w + 2)}V${n(vB)}`;
        for (let i = 5; i >= 0; i--) bot += `L${n(-w * 0.85 + (i * 1.7 * w) / 5)} ${n(vB)}${i ? `L${n(-w * 0.85 + ((i - 0.5) * 1.7 * w) / 5)} ${n(vB - p.w * 0.24)}` : ''}`;
        return clipped(p, shape, `<path d="${top}Z" fill="${p.teeth}"/><path d="${bot}Z" fill="${p.teeth}"/>`);
      },
    },
    {
      id: 'fang', label: 'Un colmillo', en: 'Single fang', pt: 'Um caninho', as3d: 'vampire',
      draw: (p) => {
        if (p.open > 0.12) {
          const w = p.w * 0.85;
          return `${openMouth(p, { w, max: 0.85 })}${fangAt(p, w * 0.45, -p.curve * w * 0.3, 0.9)}`;
        }
        return `${fangAt(p, p.w * 0.4, smileY(p, p.w * 0.4), 1.35)}${smile(p)}`;
      },
    },
    {
      id: 'fangs', label: 'Colmillitos', en: 'Tiny fangs', pt: 'Caninhos', as3d: 'vampire',
      draw: (p) => {
        if (p.open > 0.12) return openMouth({ ...p, w: p.w * 0.9 }, { w: p.w * 0.9, max: 0.85, fangs: true });
        return `${fangAt(p, -p.w * 0.38, smileY(p, -p.w * 0.38), 1.1)}${fangAt(p, p.w * 0.38, smileY(p, p.w * 0.38), 1.1)}${smile(p)}`;
      },
    },
    {
      id: 'bunny', label: 'Conejito', en: 'Bunny', pt: 'Coelhinho', as3d: 'buck',
      draw: (p) => {
        const w = p.w;
        const teeth = (y) => `<path d="M${n(-w * 0.24)} ${n(y)}h${n(w * 0.48)}v${n(w * 0.3)}q0 ${n(w * 0.1)} ${n(-w * 0.1)} ${n(w * 0.1)}h${n(-w * 0.28)}q${n(-w * 0.1)} 0 ${n(-w * 0.1)} ${n(-w * 0.1)}Z" fill="${p.teeth}" stroke="${p.lip}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 ${n(y)}v${n(w * 0.34)}" stroke="${p.lip}" stroke-width="1"/>`;
        if (p.open > 0.12) return `${openMouth({ ...p, curve: Math.max(0.3, p.curve + 0.5) }, { w: w * 0.75, min: 0.1, max: 0.75, tongue: false })}${teeth(-w * 0.08)}`;
        return `${teeth(w * 0.02)}${line(p, `M${n(-w * 0.6)} ${n(-w * 0.08)}Q${n(-w * 0.3)} ${n(w * 0.32)} 0 ${n(w * 0.02)}Q${n(w * 0.3)} ${n(w * 0.32)} ${n(w * 0.6)} ${n(-w * 0.08)}`, 0.14)}`;
      },
    },
    {
      id: 'zigzag', label: 'Zigzag', en: 'Zigzag', pt: 'Zigue-zague', as3d: 'wavy',
      draw: closedOr((p) => line(p, `M${n(-p.w * 0.85)} ${n(-p.w * 0.08)}${Array.from({ length: 6 }, (_, i) => `L${n(-p.w * 0.85 + ((i + 1) * p.w * 1.7) / 6)} ${n(i % 2 ? -p.w * 0.08 : p.w * 0.16)}`).join('')}`, 0.14)),
    },
    {
      id: 'uwu', label: 'UwU', en: 'UwU', pt: 'UwU', as3d: 'cat',
      draw: closedOr((p) => line(p, `M${n(-p.w * 0.5)} ${n(-p.w * 0.08)}Q${n(-p.w * 0.25)} ${n(p.w * 0.36)} 0 ${n(p.w * 0.02)}Q${n(p.w * 0.25)} ${n(p.w * 0.36)} ${n(p.w * 0.5)} ${n(-p.w * 0.08)}`, 0.13)),
    },
    {
      id: 'yawn', label: 'Bostezo', en: 'Yawn', pt: 'Bocejo', as3d: 'open',
      draw: (p) => {
        const rx = p.w * 0.5;
        const ry = p.w * (0.5 + p.open * 0.35);
        const cy = p.w * 0.25;
        const shape = `M${n(-rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
        return clipped(p, shape, `<ellipse cy="${n(cy + ry * 0.95)}" rx="${n(rx * 0.75)}" ry="${n(ry * 0.45)}" fill="${p.tongue}"/><ellipse cy="${n(cy - ry * 0.7)}" rx="${n(rx * 0.12)}" ry="${n(ry * 0.22)}" fill="${shade(p.tongue, -0.15)}"/>`, 2);
      },
    },
    {
      id: 'vee', label: 'Uve', en: 'Little v', pt: 'Vezinho', as3d: 'tiny',
      draw: closedOr((p) => line(p, `M${n(-p.w * 0.36)} ${n(-p.w * 0.1)}L0 ${n(p.w * 0.22)}L${n(p.w * 0.36)} ${n(-p.w * 0.1)}`, 0.15)),
    },
    {
      id: 'dimples', label: 'Hoyuelos', en: 'Dimples', pt: 'Covinhas', as3d: 'smile',
      draw: closedOr((p) => {
        const k = 0.8;
        const y = smileY(p, -p.w * k);
        return `${line(p, smileD(p, k))}${[-1, 1].map((s) => `<path d="M${n(s * p.w * 0.9)} ${n(y - p.w * 0.12)}q${n(s * p.w * 0.12)} ${n(p.w * 0.1)} ${n(s * p.w * 0.02)} ${n(p.w * 0.26)}" stroke="${p.lip}" stroke-width="${n(Math.max(1.3, p.w * 0.11))}" fill="none" stroke-linecap="round"/>`).join('')}`;
      }),
    },
    {
      id: 'bubblegum', label: 'Chicle', en: 'Bubblegum', pt: 'Chiclete', as3d: 'kiss',
      draw: (p) => {
        if (p.open > 0.12) return openMouth(p, { w: p.w * 0.6, max: 0.8 });
        const r = p.w * 0.72;
        return `<ellipse rx="${n(p.w * 0.22)}" ry="${n(p.w * 0.16)}" fill="#f472b6"/><circle cy="${n(r * 0.55)}" r="${n(r)}" fill="#f9a8d4" stroke="${shade('#f9a8d4', -0.3)}" stroke-width="1.5" opacity=".95"/><ellipse cx="${n(-r * 0.38)}" cy="${n(r * 0.2)}" rx="${n(r * 0.22)}" ry="${n(r * 0.14)}" transform="rotate(-35 ${n(-r * 0.38)} ${n(r * 0.2)})" fill="#fff" opacity=".75"/><circle cx="${n(r * 0.35)}" cy="${n(r * 0.95)}" r="${n(r * 0.07)}" fill="#fff" opacity=".6"/>`;
      },
    },
    {
      id: 'tongueside', label: 'Lengua de lado', en: 'Side tongue', pt: 'Língua de lado', as3d: 'tongue',
      draw: closedOr((p) => {
        const x = p.w * 0.42;
        const y = smileY(p, x);
        return `<g transform="rotate(-14 ${n(x)} ${n(y)})">${tongueTip(p, x, y - p.w * 0.04, 1.3)}</g>${smile(p)}`;
      }),
    },
    {
      id: 'lipbite', label: 'Mordiéndose el labio', en: 'Lip bite', pt: 'Mordendo o lábio', as3d: 'buck',
      draw: closedOr((p) => {
        const w = p.w;
        return `<path d="M${n(-w * 0.32)} ${n(w * 0.32)}Q0 ${n(w * 0.48)} ${n(w * 0.32)} ${n(w * 0.32)}" stroke="${p.lip}" stroke-width="${n(Math.max(1.3, w * 0.1))}" fill="none" stroke-linecap="round" opacity=".45"/>${line(p, `M${n(-w * 0.75)} ${n(-w * 0.05)}Q0 ${n(w * 0.3)} ${n(w * 0.75)} ${n(-w * 0.05)}`, 0.15)}<path d="M${n(-w * 0.22)} ${n(w * 0.06)}h${n(w * 0.44)}v${n(w * 0.16)}q0 ${n(w * 0.08)} ${n(-w * 0.08)} ${n(w * 0.08)}h${n(-w * 0.28)}q${n(-w * 0.08)} 0 ${n(-w * 0.08)} ${n(-w * 0.08)}Z" fill="${p.teeth}" stroke="${p.lip}" stroke-width="1.1" stroke-linejoin="round"/><path d="M0 ${n(w * 0.06)}v${n(w * 0.24)}" stroke="${p.lip}" stroke-width="0.9"/>`;
      }),
    },
    {
      id: 'heart', label: 'Corazón', en: 'Heart', pt: 'Coração', as3d: 'oh',
      draw: (p) => {
        const r = p.w * (0.45 + p.open * 0.3);
        const id = `mh${Math.round(Math.random() * 1e9)}`;
        const tf = `translate(0 ${n(r * 0.35)})`;
        return `<clipPath id="${id}"><path d="${heartPath(r)}" transform="${tf}"/></clipPath><path d="${heartPath(r)}" transform="${tf}" fill="${p.ink}"/><g clip-path="url(#${id})"><ellipse cy="${n(r * 1.05)}" rx="${n(r * 0.55)}" ry="${n(r * 0.4)}" fill="${p.tongue}"/></g><path d="${heartPath(r)}" transform="${tf}" fill="none" stroke="${p.lip}" stroke-width="${n(Math.max(1.4, p.w * 0.1))}" stroke-linejoin="round"/>`;
      },
    },
    {
      id: 'stitch', label: 'Cosida', en: 'Stitched', pt: 'Costurada', as3d: 'flat',
      draw: closedOr((p) => {
        const w = p.w;
        const y = (x) => w * 0.1 * (1 - (x / (w * 0.8)) ** 2);
        return `${line(p, `M${n(-w * 0.8)} 0Q0 ${n(w * 0.2)} ${n(w * 0.8)} 0`, 0.13)}${[-0.55, -0.2, 0.2, 0.55].map((k) => `<path d="M${n(k * w - w * 0.05)} ${n(y(k * w) - w * 0.2)}L${n(k * w + w * 0.05)} ${n(y(k * w) + w * 0.2)}" stroke="${p.lip}" stroke-width="${n(Math.max(1.4, w * 0.1))}" stroke-linecap="round"/>`).join('')}`;
      }),
    },
    {
      id: 'zipper', label: 'Cremallera', en: 'Zipper', pt: 'Zíper', as3d: 'flat',
      draw: (p) => {
        const w = p.w;
        const tab = (x, y) => `<rect x="${n(x)}" y="${n(y - w * 0.06)}" width="${n(w * 0.2)}" height="${n(w * 0.4)}" rx="${n(w * 0.07)}" fill="#e2e8f0" stroke="${p.lip}" stroke-width="1.2"/><circle cx="${n(x + w * 0.1)}" cy="${n(y + w * 0.22)}" r="${n(w * 0.045)}" fill="${p.lip}"/>`;
        if (p.open > 0.12) return `${openMouth(p, { w: w * 0.8, max: 0.8 })}${tab(w * 0.8, -w * 0.05)}`;
        const ticks = Array.from({ length: 9 }, (_, i) => `<rect x="${n(-w * 0.78 + i * w * 0.19)}" y="${n(i % 2 ? 0 : -w * 0.13)}" width="${n(w * 0.1)}" height="${n(w * 0.13)}" rx="1" fill="#cbd5e1" stroke="${p.lip}" stroke-width=".8"/>`).join('');
        return `<path d="M${n(-w * 0.82)} 0H${n(w * 0.82)}" stroke="${p.lip}" stroke-width="${n(Math.max(1.4, w * 0.08))}" stroke-linecap="round"/>${ticks}${tab(w * 0.82, -w * 0.04)}`;
      },
    },
    {
      id: 'equalizer', label: 'Ecualizador', en: 'Equalizer', pt: 'Equalizador', as3d: 'robot',
      draw: (p) => {
        const w = p.w;
        const hh = w * 0.62;
        const k = [0.35, 0.6, 0.85, 1, 0.85, 0.6, 0.35];
        const bw = (w * 1.6) / 7;
        return `<rect x="${n(-w)}" y="${n(-hh / 2)}" width="${n(w * 2)}" height="${n(hh)}" rx="${n(hh * 0.3)}" fill="#0b1220" stroke="#94a3b8" stroke-width="2"/>${k.map((v, i) => {
          const bh = Math.max(1.5, (hh - 5) * (0.15 + v * (0.12 + p.open * 0.73)));
          return `<rect x="${n(-w * 0.8 + i * bw + bw * 0.18)}" y="${n(-bh / 2)}" width="${n(bw * 0.64)}" height="${n(bh)}" rx="1" fill="${v > 0.9 && p.open > 0.5 ? '#facc15' : '#4ade80'}"/>`;
        }).join('')}`;
      },
    },
    {
      id: 'frog', label: 'Rana', en: 'Froggy', pt: 'Sapinho', as3d: 'smile',
      draw: (p) => {
        const w = p.w * 1.35;
        if (p.open > 0.12) return openMouth(p, { w, max: 0.6 });
        return `${line(p, `M${n(-w)} ${n(-p.w * 0.15)}Q0 ${n(p.w * 0.5 + p.curve * p.w * 0.3)} ${n(w)} ${n(-p.w * 0.15)}`, 0.14)}${[-1, 1].map((s) => `<path d="M${n(s * (w - p.w * 0.1))} ${n(-p.w * 0.32)}l${n(s * p.w * 0.12)} ${n(p.w * 0.24)}" stroke="${p.lip}" stroke-width="${n(Math.max(1.4, p.w * 0.1))}" stroke-linecap="round"/>`).join('')}`;
      },
    },
    {
      id: 'meh', label: 'Desganada', en: 'Meh', pt: 'Desanimada', as3d: 'frown',
      draw: closedOr((p) => line(p, `M${n(-p.w * 0.7)} ${n(p.w * 0.02)}Q${n(p.w * 0.1)} ${n(-p.w * 0.14)} ${n(p.w * 0.7)} ${n(p.w * 0.3)}`, 0.16)),
    },
    {
      id: 'wail', label: 'Llorando', en: 'Wail', pt: 'Berreiro', as3d: 'frown',
      draw: (p) => openMouth({ ...p, curve: Math.min(-0.5, p.curve - 0.8) }, { min: 0.5, max: 1 }),
    },
    {
      id: 'gasp', label: 'Sorpresa', en: 'Gasp', pt: 'Susto', as3d: 'oh',
      draw: (p) => {
        const w = p.w * 0.55;
        const t = p.w * (0.32 + p.open * 0.4);
        const b = p.w * 0.3;
        const shape = `M${n(-w)} ${n(b - p.w * 0.06)}Q${n(-w)} ${n(-t)} 0 ${n(-t)}Q${n(w)} ${n(-t)} ${n(w)} ${n(b - p.w * 0.06)}Q${n(w)} ${n(b)} ${n(w - p.w * 0.08)} ${n(b)}H${n(-w + p.w * 0.08)}Q${n(-w)} ${n(b)} ${n(-w)} ${n(b - p.w * 0.06)}Z`;
        return clipped(p, shape, `<ellipse cy="${n(b)}" rx="${n(w * 0.75)}" ry="${n(p.w * 0.2)}" fill="${p.tongue}"/>`, 2);
      },
    },
    {
      id: 'yum', label: 'Relamiéndose', en: 'Yum', pt: 'Lambendo', as3d: 'tongue',
      draw: closedOr((p) => {
        const x = -p.w * 0.62;
        const y = smileY(p, x);
        return `${smile(p)}<g transform="rotate(-40 ${n(x)} ${n(y)})">${tongueTip(p, x, y - p.w * 0.18, 1.1)}</g>`;
      }),
    },
    {
      id: 'triangle', label: 'Triangular', en: 'Triangle', pt: 'Triangular', as3d: 'open',
      draw: (p) => {
        const w = p.w * 0.6;
        const hh = p.w * (0.5 + p.open * 0.55);
        const top = -p.w * 0.15;
        const shape = `M${n(-w)} ${n(top)}H${n(w)}L0 ${n(top + hh)}Z`;
        return clipped(p, shape, `<ellipse cy="${n(top + hh * 0.85)}" rx="${n(w * 0.5)}" ry="${n(hh * 0.3)}" fill="${p.tongue}"/>`, Math.max(2, p.w * 0.14));
      },
    },
    {
      id: 'smallgrin', label: 'Sonrisita', en: 'Little grin', pt: 'Sorrisinho', as3d: 'grin',
      draw: (p) => openMouth({ ...p, curve: Math.max(0.45, p.curve + 0.6) }, { w: p.w * 0.6, min: 0.45, teeth: true }),
    },
    {
      id: 'squiggle', label: 'Ondulada', en: 'Squiggle', pt: 'Ondulada', as3d: 'wavy',
      draw: closedOr((p) => {
        let d = '';
        for (let i = 0; i <= 24; i++) {
          const u = -1 + i / 12;
          const x = u * p.w * 0.9;
          const y = p.w * (0.28 + p.curve * 0.1) * (1 - u * u) - p.w * 0.08 + Math.sin(u * Math.PI * 3) * p.w * 0.07;
          d += `${i ? 'L' : 'M'}${n(x)} ${n(y)}`;
        }
        return line(p, d, 0.14);
      }),
    },
    {
      id: 'duckbill', label: 'Pico de pato', en: 'Duck bill', pt: 'Bico de pato', as3d: 'beak',
      draw: (p) => {
        const w = p.w;
        const o = p.open * w * 0.5;
        const st = `stroke="${shade('#f97316', -0.35)}" stroke-width="1.2"`;
        return `${o > 1 ? `<ellipse cy="${n(w * 0.08)}" rx="${n(w * 0.7)}" ry="${n(o * 0.6 + 1)}" fill="${p.ink}"/>` : ''}<path d="M${n(-w * 0.78)} ${n(w * 0.12 + o / 2)}Q${n(-w * 0.85)} ${n(w * 0.4 + o / 2)} 0 ${n(w * 0.42 + o / 2)}Q${n(w * 0.85)} ${n(w * 0.4 + o / 2)} ${n(w * 0.78)} ${n(w * 0.12 + o / 2)}Z" fill="#ea580c" ${st}/><path d="M${n(-w * 0.9)} ${n(w * 0.1 - o / 2)}Q${n(-w * 0.95)} ${n(-w * 0.32 - o / 2)} 0 ${n(-w * 0.34 - o / 2)}Q${n(w * 0.95)} ${n(-w * 0.32 - o / 2)} ${n(w * 0.9)} ${n(w * 0.1 - o / 2)}Q0 ${n(w * 0.26 - o / 2)} ${n(-w * 0.9)} ${n(w * 0.1 - o / 2)}Z" fill="#fb923c" ${st}/><ellipse cx="${n(-w * 0.2)}" cy="${n(-w * 0.16 - o / 2)}" rx="${n(w * 0.06)}" ry="${n(w * 0.035)}" fill="${shade('#f97316', -0.45)}"/><ellipse cx="${n(w * 0.2)}" cy="${n(-w * 0.16 - o / 2)}" rx="${n(w * 0.06)}" ry="${n(w * 0.035)}" fill="${shade('#f97316', -0.45)}"/><ellipse cx="${n(-w * 0.45)}" cy="${n(-w * 0.2 - o / 2)}" rx="${n(w * 0.16)}" ry="${n(w * 0.05)}" fill="#fff" opacity=".45"/>`;
      },
    },
    {
      id: 'blep', label: 'Blep', en: 'Blep', pt: 'Blep', as3d: 'tongue',
      draw: closedOr((p) => `${tongueTip(p, 0, p.w * 0.02, 0.95)}${line(p, `M${n(-p.w * 0.38)} ${n(-p.w * 0.02)}Q0 ${n(p.w * 0.12)} ${n(p.w * 0.38)} ${n(-p.w * 0.02)}`, 0.14)}`),
    },
    {
      id: 'scream', label: 'Grito', en: 'Scream', pt: 'Grito', as3d: 'open',
      draw: (p) => {
        const rx = p.w * 0.32;
        const ry = p.w * (0.62 + p.open * 0.3);
        const cy = p.w * 0.3;
        const shape = `M0 ${n(cy - ry)}C${n(rx * 1.4)} ${n(cy - ry)} ${n(rx * 0.9)} ${n(cy + ry)} 0 ${n(cy + ry)}C${n(-rx * 0.9)} ${n(cy + ry)} ${n(-rx * 1.4)} ${n(cy - ry)} 0 ${n(cy - ry)}Z`;
        return clipped(p, shape, `<ellipse cy="${n(cy + ry * 0.9)}" rx="${n(rx * 0.7)}" ry="${n(ry * 0.3)}" fill="${p.tongue}"/>`, 2);
      },
    },
  ];
};
