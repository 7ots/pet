/**
 * Materiales de los ots 3D.
 *
 * Peluche (plush): pelo por «shell texturing». El cuerpo se dibuja una vez sólido (raíces en
 * sombra) y N veces más como capas desplazadas a lo largo de la normal (un único InstancedMesh:
 * gl_InstanceID → altura de la capa). En cada capa un ruido celular 3D en espacio objeto decide
 * dónde hay hebra; las hebras se afinan y se acortan al azar, caen un poco con la gravedad y se
 * mecen. alphaToCoverage + MSAA suaviza los bordes sin ordenar transparencias. El número de
 * capas se ajusta por personaje según su tamaño en pantalla (LOD).
 *
 * Sobre MeshPhysicalMaterial (PBR, sheen para el brillo aterciopelado del peluche) vía
 * onBeforeCompile: el estampado (barriga, dos tonos, manchas, rayas, antifaz), la textura de la
 * piel (escamas, motas, anillos, gelatina, paneles: color + relieve + rugosidad) y las mejillas
 * (rubor, rayitas, pecas, pintura, corazones, estrellas) se pintan en el shader, así también
 * «tiñen» el pelo. Las metamorfosis de deformación (derretirse, gelatina, shape:<id>) también
 * van en el vertex shader, compartidas por cuerpo, capas, contorno y parches.
 *
 * Vinilo (glossy/soft3d/clay/flat/toon/neon/sketch): mismo shader sin pelo, con clearcoat/
 * rugosidad según el acabado; toon/sketch cuantizan la luz (y sketch añade sombreado a rayas).
 */

import * as THREE from 'three';

export const PATTERN_IDS = { none: 0, belly: 1, twotone: 2, spots: 3, stripes: 4, tiger: 5, mask: 6, hearts: 3, stars: 3, circuit: 4 };
export const TEX_IDS = { none: 0, scales: 1, speckles: 2, ridges: 3, gloss: 4, panels: 5, knit: 6, polka: 7, glitter: 8, stone: 9, wood: 10, bubbles: 11, stitches: 12, honeycomb: 13, quilt: 14 };
export const CHEEK_IDS = { none: 0, blush: 1, lines: 2, freckles: 3, paint: 4, hearts: 5, stars: 6 };

const COMMON = /* glsl */ `
uniform vec3 uPat; uniform int uPatType; uniform vec4 uDims; // W, H, eyeY, eyeR
uniform vec4 uCheek; uniform vec3 uCheekColor; uniform float uCheekOn; uniform int uCheekType;
uniform float uDensity; uniform float uShells; uniform float uFurLen; uniform float uTime;
uniform vec4 uBald[3];
uniform int uTex; uniform float uSp; uniform float uBlush;
uniform vec4 uMorph; // derretir, gelatina, shape, -
varying vec3 vFurP; varying float vH; varying vec3 vON;
float furJ = 0.5;
float texH = 0.0; float texR = 0.0;
vec3 h33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float patMask(vec3 P) {
  float W = uDims.x, H = uDims.y;
  if (uPatType == 1) { // barriga
    vec2 q = vec2(P.x / (W * 0.33), (P.y - H * 0.33) / (H * 0.29));
    return (1.0 - smoothstep(0.9, 1.05, length(q))) * smoothstep(-0.05, 0.12, P.z);
  }
  if (uPatType == 2) return 1.0 - smoothstep(H * 0.4, H * 0.43, P.y);
  if (uPatType == 3) {
    vec3 q = P * (4.2 / W); vec3 c = floor(q); vec3 r = h33(c);
    return r.x > 0.45 ? 1.0 - smoothstep(0.2, 0.25, length(fract(q) - (0.3 + 0.4 * r))) : 0.0;
  }
  if (uPatType == 4) return step(0.55, sin(P.y / H * 38.0));
  if (uPatType == 5) return step(0.45, sin(P.y / H * 30.0 + sin(P.x * 9.0) * 1.6)) * smoothstep(0.15 * W, 0.4 * W, abs(P.x) + 0.25 * W * step(P.z, 0.0));
  if (uPatType == 6) return (1.0 - smoothstep(uDims.w * 1.6, uDims.w * 1.8, abs(P.y - uDims.z))) * smoothstep(-0.05, 0.1, P.z);
  return 0.0;
}
float furA(vec3 p, float h, out float sh) {
  float a = -1.0; sh = 1.0;
  for (int i = 0; i < 3; i++) {
    vec3 q = p + vec3(float(i) * 0.37, float(i) * 0.61, float(i) * 0.13);
    vec3 c = floor(q);
    vec3 r = h33(c + float(i) * 17.0);
    float len = 0.5 + 0.5 * r.z;
    float rad = 0.52 * (1.0 - 0.85 * h / len);
    float d = length(fract(q) - (0.3 + 0.4 * r));
    float v = h > len ? -1.0 : (rad - d) / max(rad, 1e-3);
    if (v > a) { a = v; sh = 0.86 + 0.28 * r.x; furJ = r.y; }
  }
  return a;
}
float skinTex2(vec3 P, vec3 N, float W, float H);
// textura de la piel: devuelve un factor de color; deja relieve (texH) y rugosidad (texR)
float skinTex(vec3 P, vec3 N) {
  float W = uDims.x, H = uDims.y;
  if (uTex == 1) { // escamas solapadas (mapeo cilíndrico)
    float s = W * 0.085;
    vec2 q = vec2(atan(P.x, P.z) * W * 0.42, P.y) / s;
    float best = 0.0;
    for (int k = 0; k < 2; k++) {
      float row = floor(q.y) + float(k);
      vec2 f = vec2(q.x + 0.5 * mod(row, 2.0), q.y - row);
      vec2 d = vec2(fract(f.x) - 0.5, f.y + 0.15);
      float v = 1.0 - length(d * vec2(1.0, 1.25));
      best = max(best, v);
    }
    texH = smoothstep(0.0, 0.45, best) * 0.9; texR = -0.18;
    return mix(0.72, 1.08, smoothstep(0.0, 0.5, best));
  }
  if (uTex == 2) { // motas
    vec3 q = P * (13.0 / W); vec3 c = floor(q); vec3 r = h33(c + 3.1);
    float sp = r.x > 0.35 ? 1.0 - smoothstep(0.1, 0.16, length(fract(q) - (0.25 + 0.5 * r)) / (0.6 + r.z)) : 0.0;
    texH = -sp * 0.4;
    return mix(1.0, r.y > 0.5 ? 0.62 : 1.22, sp);
  }
  if (uTex == 3) { // anillos
    float b = 0.5 + 0.5 * sin(P.y / H * 6.2832 * 9.0);
    texH = smoothstep(0.15, 0.85, b) * 0.8; texR = 0.05;
    return mix(0.8, 1.04, texH);
  }
  if (uTex == 4) { texR = -0.45; return 1.0; } // gelatina: el resto en el material y la luz
  if (uTex == 5) { // paneles atornillados (triplanar)
    float s = W * 0.3;
    vec3 a = abs(N);
    vec2 q = a.z > a.x && a.z > a.y ? P.xy : a.x > a.y ? P.zy : P.xz;
    vec2 f = fract(q / s + 0.5) - 0.5;
    float e = min(0.5 - abs(f.x), 0.5 - abs(f.y)) * s;
    float groove = 1.0 - smoothstep(0.0, W * 0.012, e);
    float rivet = 1.0 - smoothstep(W * 0.01, W * 0.016, length(abs(f) * s - vec2(0.5 * s - W * 0.035)));
    texH = -groove * 0.7 + rivet * 0.8; texR = -0.15 + groove * 0.3;
    return mix(1.0, 0.7, groove) * mix(1.0, 1.15, rivet);
  }
  if (uTex >= 6) return skinTex2(P, N, W, H);
  return 1.0;
}
// ruido de valor 3D (para piedra y madera)
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h33(i).x, b = h33(i + vec3(1, 0, 0)).x, c = h33(i + vec3(0, 1, 0)).x, d = h33(i + vec3(1, 1, 0)).x;
  float e = h33(i + vec3(0, 0, 1)).x, g = h33(i + vec3(1, 0, 1)).x, h = h33(i + vec3(0, 1, 1)).x, k = h33(i + vec3(1, 1, 1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
// catálogo 2: punto, lunares, purpurina, piedra, madera, burbujas, costuras, panal, acolchado
float skinTex2(vec3 P, vec3 N, float W, float H) {
  vec2 cyl = vec2(atan(P.x, P.z) * W * 0.42, P.y); // mapeo cilíndrico (como las escamas)
  if (uTex == 6) { // punto: columnas de «V»
    vec2 q = cyl / (W * 0.12);
    float fx = fract(q.x) - 0.5;
    float v = 1.0 - abs(fract(q.y * 1.4 + abs(fx) * 1.1) - 0.5) * 2.0;
    float st = smoothstep(0.0, 0.5, v) * smoothstep(0.0, 0.14, 0.5 - abs(fx));
    texH = st * 0.9; texR = 0.2;
    return mix(0.66, 1.06, st);
  }
  if (uTex == 7) { // lunares en tresbolillo
    vec2 q = cyl / (W * 0.17);
    q.x += 0.5 * mod(floor(q.y), 2.0);
    float d = 1.0 - smoothstep(0.2, 0.235, length(fract(q) - 0.5));
    texH = d * 0.25;
    return mix(1.0, 1.55, d);
  }
  if (uTex == 8) { // purpurina: escamitas con su propia inclinación que destellan
    vec3 q = P * (42.0 / W); vec3 r = h33(floor(q) + 7.0);
    float fl = step(0.5, r.x);
    float tw = pow(r.z, 5.0) * (0.55 + 0.45 * sin(uTime * 4.0 + r.y * 60.0));
    texH = fl * (r.y - 0.5) * 0.9; texR = -0.4;
    return mix(0.92, 1.0 + 1.6 * tw, fl);
  }
  if (uTex == 9) { // piedra: ruido + grietas (voronoi)
    float n = vnoise(P * (5.0 / W)) * 0.55 + vnoise(P * (13.0 / W)) * 0.3 + vnoise(P * (36.0 / W)) * 0.15;
    vec3 q = P * (4.5 / W); vec3 c = floor(q); float d1 = 9.0, d2 = 9.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 o = vec3(float(x), float(y), float(z));
      float d = length(q - c - o - h33(c + o + 5.0));
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    float crack = 1.0 - smoothstep(0.0, 0.07, d2 - d1);
    texH = n * 0.9 - crack * 0.9; texR = 0.25;
    return mix(0.74, 1.1, n) * mix(1.0, 0.5, crack);
  }
  if (uTex == 10) { // madera: anillos de un tronco a un costado, deformados por el ruido
    float n = vnoise(P * vec3(3.0, 0.45, 3.0) / W);
    float w = fract((length(vec2(P.x + W * 1.4, P.z * 0.7)) + n * W * 0.22) * (11.0 / W));
    float ring = smoothstep(0.0, 0.18, w) * (1.0 - smoothstep(0.55, 1.0, w));
    float grain = vnoise(P * vec3(60.0, 4.0, 60.0) / W);
    texH = ring * 0.35 + grain * 0.15; texR = 0.08 - ring * 0.1;
    return mix(0.68, 1.06, ring) * mix(0.93, 1.03, grain);
  }
  if (uTex == 11) { // burbujas: esferas con borde brillante
    vec3 q = P * (5.5 / W); vec3 r = h33(floor(q) + 11.0);
    float rad = 0.16 + 0.2 * r.x;
    float d = length(fract(q) - (0.3 + 0.4 * r)) / rad;
    float b = 1.0 - step(1.0, d);
    texH = b * sqrt(max(0.0, 1.0 - d * d)) * 0.9; texR = -0.4;
    return mix(1.0, mix(1.1, 1.8, smoothstep(0.6, 1.0, d)), b);
  }
  if (uTex == 12) { // costuras: una vertical al centro y una horizontal a la cintura, en puntadas
    float lw = W * 0.011;
    float gV = abs(P.x), gH = abs(P.y - H * 0.42);
    float dY = step(0.5, fract(P.y / (W * 0.055))), dX = step(0.5, fract(cyl.x / (W * 0.055)));
    float st = max((1.0 - smoothstep(lw, lw * 1.7, gV)) * dY, (1.0 - smoothstep(lw, lw * 1.7, gH)) * dX);
    float fold = max(1.0 - smoothstep(0.0, W * 0.04, gV), 1.0 - smoothstep(0.0, W * 0.04, gH));
    texH = -fold * 0.6 + st * 0.5; texR = 0.2;
    return mix(1.0, 0.82, fold) * mix(1.0, 1.6, st);
  }
  if (uTex == 13) { // panal: celdas hexagonales abombadas
    vec2 q = cyl / (W * 0.13);
    vec2 rr = vec2(1.0, 1.732), hh = rr * 0.5;
    vec2 a = mod(q, rr) - hh, b = mod(q - hh, rr) - hh;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float e = 0.5 - max(dot(abs(g), vec2(0.5, 0.866)), abs(g.x));
    float wall = 1.0 - smoothstep(0.0, 0.07, e);
    texH = -wall * 0.7 + smoothstep(0.0, 0.35, e) * 0.4; texR = -0.1 + wall * 0.2;
    return mix(1.04, 0.66, wall);
  }
  if (uTex == 14) { // acolchado: rombos inflados con pespunte
    vec2 q = cyl / (W * 0.2); q = vec2(q.x + q.y, q.x - q.y) * 0.7071;
    vec2 f = fract(q) - 0.5;
    float e = 0.5 - max(abs(f.x), abs(f.y));
    float puff = sqrt(smoothstep(0.0, 0.5, e));
    float seam = (1.0 - smoothstep(0.0, 0.03, e)) * step(0.5, fract((q.x + q.y) * 5.0));
    texH = puff * 0.9; texR = 0.15;
    return mix(0.66, 1.05, puff) * mix(1.0, 1.35, seam);
  }
  return 1.0;
}
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float sdHeart(vec2 p) { // iq; p en unidades del corazón (arriba = +y)
  p.x = abs(p.x); p.y += 0.6;
  if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - 0.3536;
  return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdStar(vec2 p, float r) { // estrella de 5 puntas (iq)
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = 0.45 * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// mejillas y rubor: devuelve color y peso
vec4 cheekPaint(vec3 P) {
  float r = uDims.w;
  vec2 q = (vec2(abs(P.x), P.y) - uCheek.xy) / r; // unidades de radio del ojo, arriba = +y
  float front = smoothstep(-0.02, 0.06, P.z);
  vec4 o = vec4(0.0);
  if (uCheekOn > 0.5) {
    float a = 0.0;
    if (uCheekType == 1) { float cd = length(vec3(abs(P.x), P.y, P.z) - uCheek.xyz) / uCheek.w; a = 0.7 * exp(-cd * cd * 2.2); }
    else if (uCheekType == 2) { float d = 9.0; for (int i = 0; i < 3; i++) { vec2 b = vec2(float(i - 1) * 0.4 - 0.12, -0.25); d = min(d, sdSeg(q, b, b + vec2(0.25, 0.5))); } a = 1.0 - smoothstep(0.06, 0.1, d); }
    else if (uCheekType == 3) {
      float d = 9.0;
      vec2 F[5]; F[0] = vec2(0.0); F[1] = vec2(0.5, -0.3); F[2] = vec2(-0.4, -0.4); F[3] = vec2(0.2, -0.75); F[4] = vec2(-0.2, 0.1);
      for (int i = 0; i < 5; i++) d = min(d, length(q - F[i] - vec2(-0.25, 0.1)));
      a = 1.0 - smoothstep(0.08, 0.12, d);
    }
    else if (uCheekType == 4) { float d = min(sdSeg(q, vec2(-0.65, 0.4), vec2(0.95, 0.4)), sdSeg(q, vec2(-0.65, -0.1), vec2(0.95, -0.1))); a = (1.0 - smoothstep(0.1, 0.14, d)) * 0.95; }
    else if (uCheekType == 5) a = 1.0 - smoothstep(-0.02, 0.03, sdHeart((q - vec2(0.05, -0.1)) / 0.5) * 0.5);
    else if (uCheekType == 6) a = 1.0 - smoothstep(-0.01, 0.03, sdStar(q - vec2(0.15, -0.1), 0.42));
    o = vec4(uCheekColor, a * front);
  }
  if (uBlush > 0.001) {
    vec2 b = (vec2(abs(P.x), P.y) - vec2(uSp + 0.35 * r, uDims.z - 1.8 * r)) / r;
    float e = 1.0 - smoothstep(0.7, 1.0, length(b / vec2(0.95, 0.5)));
    float d = 9.0;
    for (int i = 0; i < 3; i++) { vec2 s = vec2(float(i - 1) * 0.4, -0.25); d = min(d, sdSeg(b, s, s + vec2(0.22, 0.45))); }
    float l = 1.0 - smoothstep(0.05, 0.09, d);
    vec3 c = mix(vec3(1.0, 0.365, 0.56), vec3(1.0, 0.23, 0.43), l);
    float a = max(e * 0.55, l) * uBlush * front;
    o = vec4(mix(o.rgb, c, a), max(o.a, a));
  }
  return o;
}
`;

/** Deformaciones (derretir, gelatina, shape:<id>) — mismas en cuerpo, capas, contorno y parches. */
const DEFORM = /* glsl */ `
attribute vec3 aShape; attribute vec3 aShapeN;
vec3 otDeform(vec3 p, inout vec3 n) {
  if (uMorph.z > 0.0) { p = mix(p, aShape, uMorph.z); n = normalize(mix(n, aShapeN, uMorph.z)); }
  float H = uDims.y, W = uDims.x;
  if (uMorph.x > 0.0) { // derretir: la base se ensancha y gotea
    float ny = clamp(1.0 - p.y / max(H, 1e-3), 0.0, 1.0);
    float k = uMorph.x * smoothstep(0.45, 1.0, ny);
    p.xz *= 1.0 + 0.55 * k;
    p.y -= k * W * 0.05 * max(0.0, sin(atan(p.x, p.z) * 5.0 + uTime * 0.7));
  }
  if (uMorph.y > 0.0) p += n * W * 0.05 * uMorph.y * sin(uTime * 6.2832 * 2.6 + atan(p.y - H * 0.5, p.x) * 3.3 + p.z * 4.0);
  return p;
}
`;

const VERT_HEAD = `#include <common>\n${COMMON}\n${DEFORM}\nuniform vec3 uGravity;`;
const VERT_BEGIN = /* glsl */ `vec3 dN = normal;
          vec3 transformed = otDeform(vec3(position), dN);
          vFurP = position; vH = 0.0; vON = normal;`;

/** Relieve por derivadas (sin mapas): perturba `normal` con el gradiente en pantalla de h. */
const BUMP = /* glsl */ `
          if (uTex != 0) {
            vec3 sp = -vViewPosition;
            vec3 sx = dFdx(sp), sy = dFdy(sp);
            float hh = texH * uDims.x * 0.012;
            vec2 dh = vec2(dFdx(hh), dFdy(hh));
            vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
            float det = dot(sx, r1);
            vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
            normal = normalize(abs(det) * normal - grad);
          }`;

/**
 * Crea el par de materiales del cuerpo (sólido + capas de pelo) con uniforms compartidos.
 * @param {object} o { color, patternColor, pattern, finish, plush, furLen, density, cheekColor, texture }
 */
export function bodyMaterials(o) {
  const tex = TEX_IDS[o.texture] ?? 0;
  const uniforms = {
    uPat: { value: new THREE.Color(o.patternColor) },
    uPatType: { value: PATTERN_IDS[o.pattern] ?? 0 },
    uDims: { value: new THREE.Vector4(1, 1, 0.6, 0.1) },
    uCheek: { value: new THREE.Vector4(0.3, 0.4, 0.4, 0.1) },
    uCheekColor: { value: new THREE.Color(o.cheekColor || '#ff6b8a') },
    uCheekOn: { value: 0 },
    uCheekType: { value: 1 },
    uDensity: { value: o.density || 70 },
    uShells: { value: 16 },
    uFurLen: { value: o.furLen || 0.06 },
    uTime: { value: 0 },
    uGravity: { value: new THREE.Vector3(0, -0.9, 0.15) },
    uBald: { value: [new THREE.Vector4(0, -9, 0, 0), new THREE.Vector4(0, -9, 0, 0), new THREE.Vector4(0, -9, 0, 0)] },
    uTex: { value: tex },
    uSp: { value: 0.2 },
    uBlush: { value: 0 },
    uMorph: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const toon = (o.finish === 'toon' || o.finish === 'sketch') && !o.plush;
  const make = (shell) => {
    const f = o.plush ? 'plush' : o.finish;
    const col = new THREE.Color(o.color);
    if (o.plush) col.multiplyScalar(1.12); // compensa la sombra entre hebras
    if (f === 'pearl' || f === 'glass') col.lerp(new THREE.Color('#ffffff'), f === 'pearl' ? 0.45 : 0.2);
    const gel = (tex === 4 || tex === 11 || f === 'glass') && !o.plush;
    const irid = { pearl: 1, holo: 1 }[f] || 0;
    const m = new THREE.MeshPhysicalMaterial({
      color: col,
      roughness: gel ? 0.08 : { plush: 0.92, glossy: 0.28, soft3d: 0.55, clay: 0.85, flat: 0.75, toon: 0.6, neon: 0.4, sketch: 0.9, metal: 0.3, pearl: 0.3, holo: 0.22, velvet: 0.95, pastel: 0.6 }[f] ?? 0.5,
      metalness: { metal: 0.9, holo: 0.45 }[f] || 0,
      clearcoat: gel ? 1 : { glossy: 1, soft3d: 0.35, toon: 0.6, neon: 0.8, metal: 0.4, pearl: 1, holo: 1 }[f] ?? 0,
      iridescence: irid, iridescenceIOR: f === 'holo' ? 2 : 1.5, iridescenceThicknessRange: [120, 520],
      clearcoatRoughness: f === 'soft3d' ? 0.35 : 0.08,
      sheen: o.plush || f === 'velvet' ? 1 : f === 'clay' ? 0.4 : 0,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(o.color).lerp(new THREE.Color('#ffffff'), 0.45),
      emissive: f === 'neon' ? new THREE.Color(o.color).multiplyScalar(0.55) : new THREE.Color(0),
      envMapIntensity: o.plush ? 0.7 : gel ? 1.5 : f === 'metal' ? 1.6 : 1,
    });
    if (shell) {
      m.alphaTest = 0.5;
      m.alphaToCoverage = true;
    }
    m.defines = {
      ...(o.plush ? { FUR: '' } : {}),
      ...(shell ? { FUR_SHELL: '' } : {}),
      ...(toon && !shell ? { TOON: '' } : {}),
      ...(o.finish === 'sketch' && !shell ? { SKETCH: '' } : {}),
      ...(gel ? { GEL: '', GLASS_RIM: f === 'glass' ? '0.55' : '0.0' } : {}),
    };
    m.customProgramCacheKey = () => `ots3d-${o.plush ? 'fur' : 'solid'}-${shell ? 'shell' : 'base'}-${toon ? o.finish : ''}-${gel ? (f === 'glass' ? 'glass' : 'gel') : ''}`;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', VERT_HEAD)
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `${VERT_BEGIN}
          #ifdef FUR_SHELL
            float fh = (float(gl_InstanceID) + 1.0) / uShells;
            vH = fh;
            float wob = sin(uTime * 1.6 + position.y * 4.0 + position.x * 3.0) * 0.18;
            vec3 fg = (uGravity + vec3(wob, 0.0, wob * 0.5)) * fh;
            transformed += normalize(dN + fg) * (uFurLen * fh);
          #endif`,
        )
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (uMorph.z > 0.0) objectNormal = normalize(mix(objectNormal, aShapeN, uMorph.z));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec3 oP = vFurP;
          diffuseColor.rgb = mix(diffuseColor.rgb, uPat, patMask(oP));
          diffuseColor.rgb *= skinTex(oP, normalize(vON));
          vec4 chk = cheekPaint(oP);
          diffuseColor.rgb = mix(diffuseColor.rgb, chk.rgb, chk.a);
          float oAO = uDims.y < 0.01 ? 1.0 : mix(0.5, 1.0, smoothstep(0.0, 0.3 * uDims.y, oP.y));
          #ifdef FUR
            float bald = 1.0;
            for (int i = 0; i < 3; i++) bald = min(bald, smoothstep(uBald[i].w * 0.75, uBald[i].w * 1.35, length(oP - uBald[i].xyz)));
            #ifdef FUR_SHELL
              float fsh;
              float fa = furA(oP * uDensity, vH / max(bald, 0.04), fsh);
              diffuseColor.a = clamp(0.5 + fa * 2.0, 0.0, 1.0);
              diffuseColor.rgb *= mix(0.42, 1.06, vH) * fsh;
            #else
              diffuseColor.rgb *= mix(0.9, 0.42, bald);
            #endif
          #endif
          diffuseColor.rgb *= oAO;`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + texR, 0.04, 1.0);')
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `#include <normal_fragment_maps>
          #ifdef FUR_SHELL
            normal = normalize(normal + (vec3(furJ, fract(furJ * 7.13), fract(furJ * 3.7)) - 0.5) * 0.8);
          #else
            ${BUMP}
          #endif`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef GEL
            float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
            totalEmissiveRadiance += diffuseColor.rgb * (0.22 + 0.6 * fres) + vec3(GLASS_RIM) * fres;
          #endif`,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `#ifdef TOON
            float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
            float ql = lum < 0.1 ? 0.55 : lum < 0.35 ? 0.8 : 1.0;
            outgoingLight = diffuseColor.rgb * ql * 0.95 + totalEmissiveRadiance;
            #ifdef SKETCH
              float hs = sin((gl_FragCoord.x + gl_FragCoord.y) * 0.9);
              float hs2 = sin((gl_FragCoord.x - gl_FragCoord.y) * 0.9);
              float ink = (lum < 0.32 ? step(0.55, hs) : 0.0) + (lum < 0.14 ? step(0.55, hs2) : 0.0);
              outgoingLight = mix(outgoingLight, vec3(0.12, 0.16, 0.22), clamp(ink, 0.0, 1.0) * 0.55);
            #endif
          #endif
          #include <opaque_fragment>`,
        );
    };
    return m;
  };
  return { base: make(false), shell: o.plush ? make(true) : null, uniforms };
}

/**
 * Material que reutiliza la superficie del cuerpo desplazada a lo largo de la normal: contorno
 * (casco invertido, BackSide) o parche recortado por una caja girada en XY (máscaras, tirita).
 * Comparte los uniforms del cuerpo, así sigue sus deformaciones.
 * @param {object} u uniforms del cuerpo
 * @param {object} o { color, off, outline, box: {c:[x,y,z], h:[hx,hy,hz], rot}, kind, round }
 */
export function surfaceMaterial(u, o) {
  const outline = !!o.outline;
  const m = outline
    ? new THREE.MeshBasicMaterial({ color: o.color, side: THREE.BackSide })
    : o.kind === 'plastic'
      ? new THREE.MeshPhysicalMaterial({ color: o.color, roughness: 0.4, clearcoat: 0.4 })
      : new THREE.MeshPhysicalMaterial({ color: o.color, roughness: 0.9, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(o.color).lerp(new THREE.Color('#fff'), 0.4) });
  const box = o.box || { c: [0, 0, 0], h: [99, 99, 99], rot: 0 };
  const own = {
    uOff: { value: o.off || 0.01 },
    uBoxC: { value: new THREE.Vector3(...box.c) },
    uBoxH: { value: new THREE.Vector3(...box.h) },
    uBoxR: { value: box.rot || 0 },
    uRound: { value: o.round || 0 },
    uWobble: { value: o.wobble || 0 },
  };
  m.customProgramCacheKey = () => `ots3d-surf-${outline ? 'line' : o.kind || 'felt'}`;
  m.userData.surface = { outline, off: own.uOff.value, box, round: own.uRound.value }; // para export.js (glb)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, own);
    const head = `uniform float uOff; uniform vec3 uBoxC; uniform vec3 uBoxH; uniform float uBoxR; uniform float uRound; uniform float uWobble;`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `${VERT_HEAD}\n${head}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `${VERT_BEGIN}
        float wo = uWobble > 0.0 ? 1.0 + uWobble * (sin(position.x * 60.0 + position.y * 37.0) * 0.5 + 0.5) : 1.0;
        transformed += dN * uOff * wo;`,
      );
    if (outline) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`);
      return;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${head}`)
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
        {
          vec3 d = vFurP - uBoxC;
          float cr = cos(uBoxR), sr = sin(uBoxR);
          d.xy = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
          vec3 e = abs(d) - uBoxH + uRound;
          if (length(max(e.xy, 0.0)) - uRound > 0.0 || e.z > uRound) discard;
        }`,
      );
  };
  return m;
}

// ── materiales pequeños compartidos (por color) ──
const small = new Map();
/** Material PBR compartido: kind = 'gloss'|'matte'|'metal'|'emissive'|'plastic'|'felt'|'glass'. */
export function mat(kind, color) {
  const key = `${kind}|${color}`;
  let m = small.get(key);
  if (m) return m;
  const c = new THREE.Color(color);
  if (kind === 'gloss') m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
  else if (kind === 'metal') m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 1, envMapIntensity: 1.4 });
  else if (kind === 'emissive') m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.4 });
  else if (kind === 'felt') m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: c.clone().lerp(new THREE.Color('#fff'), 0.4) });
  else if (kind === 'plastic') m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  else if (kind === 'glass') m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.6 });
  else if (kind === 'toon') m = new THREE.MeshToonMaterial({ color: c });
  else m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  small.set(key, m);
  return m;
}

let blobTex = null;
/** Textura de sombra de contacto (degradado radial), compartida. */
export function shadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.45, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}
