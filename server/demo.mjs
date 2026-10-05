/**
 * Backend de DEMOSTRACIÓN del sitio anfitrión ("Nimbus", un SaaS ficticio).
 * No es parte del framework: simula lo que ya tendría tu sitio para probar
 * la integración de extremo a extremo:
 *
 *   POST /api/demo/login     {email}        → { token }  JWT HS256 de 1 h (sin contraseña: es demo)
 *   GET  /api/demo/balance   Bearer JWT     → saldo del usuario (acción personalizada del ejemplo)
 *   POST /mcp                Bearer JWT     → servidor MCP (Streamable HTTP, JSON) con tools de la cuenta
 *
 * En producción, tu backend verifica el JWT con su propia clave/JWKS; aquí el secreto
 * es DEMO_JWT_SECRET o uno aleatorio por arranque.
 * Los textos (errores, títulos de las tools MCP) salen en el idioma de Accept-Language.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { reqT } from './i18n.mjs';

const SECRET = process.env.DEMO_JWT_SECRET || randomBytes(32).toString('hex');
const sessions = new Set();
const accounts = new Map(); // email → { plan, balance, orders }

const b64u = (b) => Buffer.from(b).toString('base64url');

export function signJwt(payload, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iat: now, exp: now + ttlSec, ...payload }));
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token) {
  const [head, body, sig] = String(token || '').split('.');
  if (!sig) return null;
  const expected = createHmac('sha256', SECRET).update(`${head}.${body}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

function account(email) {
  if (!accounts.has(email)) {
    accounts.set(email, {
      plan: 'Starter',
      balance: 42.5,
      orders: [
        { id: 'NB-1042', fecha: '2026-09-02', total: 19, estado: 'pagado' },
        { id: 'NB-1077', fecha: '2026-09-21', total: 49, estado: 'pendiente' },
      ],
    });
  }
  return accounts.get(email);
}

const bearer = (req) => verifyJwt((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

/** @returns {boolean} true si la ruta era de la demo */
export async function handleDemo(req, res, url, { readJson, send }) {
  const t = reqT(req);
  if (url.pathname === '/api/demo/login' && req.method === 'POST') {
    const { email } = await readJson(req, 4096);
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return send(res, 400, { error: t('server.demo.badEmail') }), true;
    const name = clean.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return send(res, 200, { token: signJwt({ sub: clean, email: clean, name, plan: account(clean).plan }) }), true;
  }

  if (url.pathname === '/api/demo/balance' && req.method === 'GET') {
    const user = bearer(req);
    if (!user) return send(res, 401, { error: t('server.demo.unauthorized') }), true;
    const a = account(user.email);
    return send(res, 200, { email: user.email, plan: a.plan, saldo: a.balance, moneda: 'EUR', proximaFactura: '2026-10-01' }), true;
  }

  if (url.pathname === '/mcp') {
    await handleMcp(req, res, { readJson, send, t });
    return true;
  }
  return false;
}

// ───────────────────────────── MCP de demo ─────────────────────────────

const mcpTools = (t) => [
  {
    name: 'listar_pedidos',
    title: t('server.demo.tools.listTitle'),
    description: t('server.demo.tools.listDescription'),
    inputSchema: { type: 'object', properties: { estado: { type: 'string', enum: ['pagado', 'pendiente', 'todos'] } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'cambiar_plan',
    title: t('server.demo.tools.planTitle'),
    description: t('server.demo.tools.planDescription'),
    inputSchema: { type: 'object', properties: { plan: { type: 'string', enum: ['Starter', 'Pro', 'Business'] } }, required: ['plan'] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

async function handleMcp(req, res, { readJson, send, t }) {
  if (req.method === 'DELETE') {
    sessions.delete(req.headers['mcp-session-id']);
    return send(res, 204);
  }
  if (req.method !== 'POST') return send(res, 405, { error: t('server.demo.postOnly') });
  const user = bearer(req);
  if (!user) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return send(res, 401, { error: t('server.demo.unauthorized') });
  }
  const msg = await readJson(req, 64 * 1024);
  const sid = req.headers['mcp-session-id'];
  // Como un servidor real: una sesión desconocida (p. ej. tras reiniciar) → 404 y el cliente re-inicializa.
  if (msg.method !== 'initialize' && sid && !sessions.has(sid)) return send(res, 404, { error: t('server.demo.unknownSession') });
  const reply = (result) => send(res, 200, { jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => send(res, 200, { jsonrpc: '2.0', id: msg.id, error: { code, message } });

  switch (msg.method) {
    case 'initialize': {
      const sid = randomUUID();
      sessions.add(sid);
      res.setHeader('Mcp-Session-Id', sid);
      return reply({
        protocolVersion: msg.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'nimbus-demo-mcp', version: '1.0.0' },
      });
    }
    case 'notifications/initialized':
      return send(res, 202);
    case 'tools/list':
      return reply({ tools: mcpTools(t) });
    case 'tools/call': {
      const a = account(user.email);
      const { name, arguments: args = {} } = msg.params || {};
      if (name === 'listar_pedidos') {
        const list = !args.estado || args.estado === 'todos' ? a.orders : a.orders.filter((o) => o.estado === args.estado);
        return reply({ content: [{ type: 'text', text: JSON.stringify(list) }], structuredContent: { pedidos: list } });
      }
      if (name === 'cambiar_plan') {
        a.plan = args.plan;
        return reply({ content: [{ type: 'text', text: t('server.demo.planChanged', { plan: args.plan }) }], structuredContent: { plan: a.plan } });
      }
      return reply({ content: [{ type: 'text', text: t('server.demo.unknownTool', { name }) }], isError: true });
    }
    case 'ping':
      return reply({});
    default:
      return fail(-32601, t('server.demo.unsupported', { method: msg.method }));
  }
}
