/**
 * Catálogo 2 (2026-10): piezas nuevas, añadidas al final de su lista en parts.js.
 * Cada pieza: { id, label (es), en, pt, as3d (id existente más parecido para el visor 3D), … }.
 */

/** @param {object} h  ayudantes de dibujo de parts.js */
export default (h) => {
  const { n, shade, star, heartPath } = h;
  // p = { box {x,y,w,h}, color, eyeY, r } — se recortan con la silueta del cuerpo
  const X = (p, a) => p.box.x + a * p.box.w;
  const Y = (p, b) => p.box.y + b * p.box.h;
  /** Banda horizontal con borde ondulado (de y hacia abajo si down, hacia arriba si no). */
  const wavyBand = (p, y, down, amp, waves) => {
    const { x, w, h } = p.box;
    const step = (w + 20) / (waves * 2);
    let d = `M${n(x - 10)} ${n(y)}`;
    for (let i = 0; i < waves * 2; i++) d += `q${n(step / 2)} ${n(i % 2 ? amp : -amp)} ${n(step)} 0`;
    return `${d}V${n(down ? y + h : y - h)}H${n(x - 10)}Z`;
  };

  return [
    {
      id: 'polka', label: 'Lunares', en: 'Polka dots', pt: 'Bolinhas', as3d: 'spots',
      draw: (p) => {
        const s = p.box.w / 5;
        const out = [];
        for (let j = 0; j * s < p.box.h + s; j++) for (let i = -1; i * s < p.box.w + s; i++) out.push(`<circle cx="${n(p.box.x + i * s + (j % 2 ? s / 2 : 0))}" cy="${n(p.box.y + j * s + s * 0.3)}" r="${n(s * 0.2)}" fill="${p.color}"/>`);
        return out.join('');
      },
    },
    {
      id: 'zigzag', label: 'Zigzag', en: 'Zigzag', pt: 'Zigue-zague', as3d: 'stripes',
      draw: (p) => [0.3, 0.55, 0.8].map((b) => {
        const k = p.box.w / 8;
        let d = `M${n(p.box.x - k)} ${n(Y(p, b))}`;
        for (let i = 0; i < 10; i++) d += `l${n(k)} ${n(i % 2 ? k * 0.7 : -k * 0.7)}`;
        return `<path d="${d}" stroke="${p.color}" stroke-width="${n(p.box.h / 16)}" fill="none" stroke-linejoin="round"/>`;
      }).join(''),
    },
    {
      id: 'checker', label: 'Cuadros', en: 'Checkers', pt: 'Xadrez', as3d: 'stripes',
      draw: (p) => {
        const s = p.box.w / 6;
        const out = [];
        for (let j = 0; j * s < p.box.h; j++) for (let i = 0; i * s < p.box.w; i++) if ((i + j) % 2) out.push(`<rect x="${n(p.box.x + i * s)}" y="${n(p.box.y + j * s)}" width="${n(s)}" height="${n(s)}" fill="${p.color}"/>`);
        return out.join('');
      },
    },
    {
      id: 'argyle', label: 'Rombos', en: 'Argyle', pt: 'Losangos', as3d: 'spots',
      draw: (p) => {
        const s = p.box.w / 4;
        const hh = s * 1.3;
        const out = [];
        for (let j = 0; j * hh < p.box.h + hh; j++) for (let i = 0; i * s <= p.box.w + s; i++) if ((i + j) % 2 === 0) out.push(`<path d="M${n(p.box.x + i * s)} ${n(p.box.y + j * hh - hh / 2)}l${n(s / 2)} ${n(hh / 2)}l${n(-s / 2)} ${n(hh / 2)}l${n(-s / 2)} ${n(-hh / 2)}Z" fill="${p.color}"/>`);
        return `${out.join('')}<g stroke="${shade(p.color, -0.2)}" stroke-width="1.2" opacity=".55">${Array.from({ length: 8 }, (_, i) => `<path d="M${n(p.box.x + (i - 3) * s)} ${n(p.box.y)}l${n(p.box.h / 1.3)} ${n(p.box.h)}M${n(p.box.x + (i + 1) * s)} ${n(p.box.y)}l${n(-p.box.h / 1.3)} ${n(p.box.h)}"/>`).join('')}</g>`;
      },
    },
    {
      id: 'waves', label: 'Olas', en: 'Waves', pt: 'Ondas', as3d: 'stripes',
      draw: (p) => [0.28, 0.5, 0.72, 0.94].map((b) => {
        const k = p.box.w / 6;
        let d = `M${n(p.box.x - 10)} ${n(Y(p, b))}`;
        for (let i = 0; i < 8; i++) d += `q${n(k / 2)} ${n(i % 2 ? k * 0.35 : -k * 0.35)} ${n(k)} 0`;
        return `<path d="${d}" stroke="${p.color}" stroke-width="${n(p.box.h / 18)}" fill="none" stroke-linecap="round"/>`;
      }).join(''),
    },
    {
      id: 'cow', label: 'Vaca', en: 'Cow', pt: 'Vaquinha', as3d: 'spots',
      draw: (p) => [[0.12, 0.35, 0.16, 0.12, 20], [0.85, 0.22, 0.14, 0.1, -15], [0.72, 0.72, 0.18, 0.12, 30], [0.2, 0.85, 0.13, 0.1, -25], [0.5, 0.05, 0.12, 0.08, 10]].map(([a, b, rx, ry, rot]) => {
        const cx = X(p, a);
        const cy = Y(p, b);
        const RX = rx * p.box.w;
        const RY = ry * p.box.h;
        return `<path d="M${n(cx - RX)} ${n(cy)}C${n(cx - RX)} ${n(cy - RY * 1.2)} ${n(cx - RX * 0.1)} ${n(cy - RY * 0.8)} ${n(cx + RX * 0.2)} ${n(cy - RY)}C${n(cx + RX * 1.1)} ${n(cy - RY * 1.1)} ${n(cx + RX * 1.1)} ${n(cy + RY * 0.4)} ${n(cx + RX * 0.5)} ${n(cy + RY * 0.8)}C${n(cx)} ${n(cy + RY * 1.3)} ${n(cx - RX * 1.1)} ${n(cy + RY)} ${n(cx - RX)} ${n(cy)}Z" transform="rotate(${rot} ${n(cx)} ${n(cy)})" fill="${p.color}"/>`;
      }).join(''),
    },
    {
      id: 'leopard', label: 'Leopardo', en: 'Leopard', pt: 'Onça', as3d: 'spots',
      draw: (p) => [[0.15, 0.3], [0.45, 0.2], [0.8, 0.32], [0.28, 0.55], [0.62, 0.5], [0.9, 0.65], [0.12, 0.78], [0.45, 0.8], [0.75, 0.9]].map(([a, b], i) => {
        const r = p.box.w * 0.065;
        const cx = X(p, a);
        const cy = Y(p, b);
        const rot = i * 47;
        return `<g transform="rotate(${rot} ${n(cx)} ${n(cy)})"><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r * 0.9)}" ry="${n(r * 0.7)}" fill="${shade(p.color, 0.25)}"/><path d="M${n(cx - r)} ${n(cy + r * 0.3)}A${n(r)} ${n(r * 0.8)} 0 0 1 ${n(cx + r * 0.6)} ${n(cy - r * 0.75)}M${n(cx + r)} ${n(cy - r * 0.1)}A${n(r)} ${n(r * 0.8)} 0 0 1 ${n(cx - r * 0.2)} ${n(cy + r * 0.85)}" stroke="${shade(p.color, -0.45)}" stroke-width="${n(r * 0.4)}" fill="none" stroke-linecap="round"/></g>`;
      }).join(''),
    },
    {
      id: 'socks', label: 'Calcetines', en: 'Socks', pt: 'Meias', as3d: 'twotone',
      draw: (p) => `<path d="${wavyBand(p, Y(p, 0.8), true, p.box.h * 0.035, 5)}" fill="${p.color}"/>`,
    },
    {
      id: 'cap', label: 'Gorrito', en: 'Cap', pt: 'Touquinha', as3d: 'twotone',
      draw: (p) => `<path d="${wavyBand(p, Math.min(Y(p, 0.28), p.eyeY - p.r * 1.9), false, p.box.h * 0.035, 4)}" fill="${p.color}"/>`,
    },
    {
      id: 'heartbelly', label: 'Barriga corazón', en: 'Heart belly', pt: 'Barriga coração', as3d: 'belly',
      draw: (p) => `<path d="${heartPath(p.box.w * 0.24)}" transform="translate(${n(X(p, 0.5))} ${n(Y(p, 0.74))})" fill="${p.color}"/>`,
    },
    {
      id: 'starbelly', label: 'Barriga estrella', en: 'Star belly', pt: 'Barriga estrela', as3d: 'belly',
      draw: (p) => `<path d="${star(p.box.w * 0.24, 0.5)}" transform="translate(${n(X(p, 0.5))} ${n(Y(p, 0.76))})" fill="${p.color}" stroke="${p.color}" stroke-width="${n(p.box.w * 0.05)}" stroke-linejoin="round"/>`,
    },
    {
      id: 'galaxy', label: 'Galaxia', en: 'Galaxy', pt: 'Galáxia', as3d: 'stars',
      draw: (p) => {
        let out = '';
        let s = 7;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 26; i++) {
          const x = X(p, rnd());
          const y = Y(p, rnd());
          const k = rnd();
          out += k > 0.82 ? `<path d="${star(p.box.w * 0.055, 0.3, 4)}" transform="translate(${n(x)} ${n(y)})" fill="${p.color}"/>` : `<circle cx="${n(x)}" cy="${n(y)}" r="${n(p.box.w * (0.01 + k * 0.016))}" fill="${p.color}" opacity="${n(0.7 + k * 0.3)}"/>`;
        }
        return out;
      },
    },
  ];
};
