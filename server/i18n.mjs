/**
 * i18n del proxy: qué idioma usar en cada respuesta.
 *
 *   - Visitante y backoffice → la cabecera Accept-Language de la petición (el widget manda su
 *     idioma y el backoffice el que tenga elegido). Sin cabecera: español.
 *   - Equipo (correo a APUMAIL_TO, DM al operador, avisos del relé) y consola → idioma del
 *     servidor: LOCALE (backoffice o entorno); si no hay, el idioma de la identidad; si no, español.
 *
 * Los errores que salen de módulos sin acceso a la petición se crean con `i18nError()`: llevan
 * la clave y se traducen al responder (server.mjs), así el log sigue en español.
 */

import { resolveLocale, translator } from '../src/i18n/index.js';
import '../src/i18n/messages/server.js';
import { getIdentity } from './identity.mjs';

/** Traductor fijo en español (mensajes de Error y registros). */
export const tEs = translator('es');

/** Idioma pedido por el cliente (Accept-Language). */
export function requestLocale(req) {
  return resolveLocale(req?.headers?.['accept-language']);
}

/** Traductor para responder a esta petición. */
export function reqT(req) {
  return translator(requestLocale(req));
}

/** Idioma del servidor: LOCALE → idioma de la identidad → español. Se lee en cada uso (sin reinicio). */
export function serverLocale() {
  let lang;
  try {
    lang = getIdentity().language;
  } catch {
    /* sin identidad legible: se queda el de LOCALE o español */
  }
  return resolveLocale(process.env.LOCALE, lang);
}

/** Traductor para lo que lee el equipo (correos, avisos) y la consola. */
export function teamT() {
  return translator(serverLocale());
}

/** Error HTTP con texto traducible: `message` en español y la clave en `i18n`. */
export function i18nError(status, key, vars) {
  return Object.assign(new Error(tEs(key, vars)), { status, i18n: { key, vars } });
}

/** Texto de un error en el idioma de `t` (si trae clave) o su mensaje tal cual. */
export function errorText(err, t) {
  return err?.i18n ? t(err.i18n.key, err.i18n.vars) : String(err?.message || err);
}
