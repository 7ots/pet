/**
 * Huella del aspecto de un ot: cada ot de 7ots.com es único, no puede haber dos con la misma cara.
 *
 * La huella sale del personaje ya normalizado (identity.look.character, el mismo que dibujan el 2D y
 * el 3D), con las claves ordenadas para que el orden no cuente. El estilo artístico (filtro) no la
 * cambia: el mismo ot en acuarela sigue siendo el mismo ot. Un ot con foto propia usa la URL.
 */
import { createHash } from 'node:crypto';

const stable = (v) =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(typeof v === 'string' ? v.toLowerCase() : v);

/** identity (normalizada por defineIdentity) → huella hex de 32, o null si no tiene aspecto propio. */
export function lookPrint(identity) {
  const look = identity?.look || {};
  if (look.kind === 'image' && look.image) return createHash('sha256').update(`image:${look.image}`).digest('hex').slice(0, 32);
  const { style, ...character } = look.character || {};
  if (!Object.keys(character).length) return null;
  return createHash('sha256').update(`character:${stable(character)}`).digest('hex').slice(0, 32);
}
