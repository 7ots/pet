/**
 * Scenes between ots on the same desktop: when two meet (or now and then) they square off and play a bit
 * from a famous fight — Rocky, Street Fighter, Dragon Ball vs Matrix, a western duel, Star Wars, a plain
 * argument that ends in hugs, or the Pulp Fiction twist. The director moves both windows (walkTo/face/fling,
 * see makeOt in main.cjs) and tells each page what to show: { line }, { gesture }, { effect }, { act, dir }.
 */

const LINES = {
  es: {
    rocky: ['¡Vamos, campeón!', '¡Esto no es nada!', '¡Adriaaanaaa!'],
    sf: ['¡HADOUKEN!', '¡Aaaay!'],
    dbz: ['Kaaa… meee… haaa… meee…', '¡HAAAAA!', 'Esquivé las balas… digo, el rayo.'],
    duel: ['Este escritorio es muy chico para los dos.', '¡Bang!', '…me diste. Era broma 😂'],
    sw: ['Yo soy tu padre.', '¡Noooooo!', 'Bueno, ¿abrazo?'],
    fight: ['¡Me quitaste mi pixel!', '¡Era MI rincón!', 'Ya, perdón 💕', 'Yo también…'],
    twist: ['¿Bailamos?', '¡Twist!'],
  },
  en: {
    rocky: ['Come on, champ!', "Ain't so bad!", 'Adriaaaan!'],
    sf: ['HADOUKEN!', 'Aaargh!'],
    dbz: ['Kaaa… meee… haaa… meee…', 'HAAAAA!', 'I dodged bullets… I mean, the beam.'],
    duel: ["This desktop ain't big enough for the two of us.", 'Bang!', '…you got me. Kidding 😂'],
    sw: ['I am your father.', 'Nooooo!', 'So… hug?'],
    fight: ['You took my pixel!', 'That was MY corner!', 'Fine, sorry 💕', 'Me too…'],
    twist: ['Shall we dance?', 'Twist!'],
  },
  pt: {
    rocky: ['Vamos, campeão!', 'Isso não é nada!', 'Adriaaanaaa!'],
    sf: ['HADOUKEN!', 'Aaai!'],
    dbz: ['Kaaa… meee… raaa… meee…', 'HAAAAA!', 'Desviei das balas… digo, do raio.'],
    duel: ['Esta área de trabalho é pequena demais pra nós dois.', 'Bang!', '…você me pegou. Brincadeira 😂'],
    sw: ['Eu sou seu pai.', 'Nãããão!', 'Então… abraço?'],
    fight: ['Você pegou meu pixel!', 'Era o MEU canto!', 'Tá, desculpa 💕', 'Eu também…'],
    twist: ['Vamos dançar?', 'Twist!'],
  },
};

// Each scene: a list of [delay ms since the previous step, (a, b, L) => …]. a is on the left, facing right (+1).
const SCENES = {
  rocky: [
    [0, (a, b) => (a.say({ act: 'guard', dir: 1, ms: 2400 }), b.say({ act: 'guard', dir: -1, ms: 2400 }))],
    [300, (a, b, L) => a.say({ line: L.rocky[0] })],
    [1700, (a, b) => (a.say({ act: 'jab', dir: 1, room: 90 }), setTimeout(() => b.say({ act: 'hit', dir: -1 }), 140))],
    [600, (a, b) => (b.say({ act: 'jab', dir: -1, room: 90 }), setTimeout(() => a.say({ act: 'hit', dir: 1 }), 140))],
    [600, (a, b) => (a.say({ act: 'jab', dir: 1, room: 90 }), setTimeout(() => b.say({ act: 'hit', dir: -1 }), 140))],
    [700, (a, b) => (b.say({ act: 'uppercut', dir: -1, room: 90 }), setTimeout(() => (a.say({ act: 'pow', text: 'POW!', ms: 1200 }), a.fling(-260, 60)), 330))],
    [900, (a) => (a.say({ gesture: 'dizzy' }), a.say({ effect: 'dizzy' }))],
    [1600, (a, b, L) => (b.say({ gesture: 'celebrate' }), b.say({ line: L.rocky[2] }))],
    [2600, (a, b, L) => a.say({ line: L.rocky[1] })],
  ],
  sf: [
    [0, (a) => a.say({ act: 'charge', dir: 1, ms: 1800 })],
    [1500, (a, b, L) => (a.say({ line: L.sf[0] }), a.say({ act: 'hadouken', dir: 1, room: 170 }))],
    [650, (a, b, L) => (b.say({ act: 'hit', dir: -1 }), b.say({ effect: 'dizzy' }), b.fling(220, 50), b.say({ line: L.sf[1] }))],
    [1800, (a) => a.say({ gesture: 'thumbsup' })],
  ],
  dbz: [
    [0, (a, b, L) => (a.say({ line: L.dbz[0], ms: 2600 }), a.say({ act: 'charge', dir: 1, ms: 2600 }))],
    [2400, (a, b, L) => (a.say({ line: L.dbz[1] }), a.say({ act: 'beam', dir: 1, room: 170, ms: 3400 }), b.say({ act: 'lean', dir: -1, room: 170, ms: 3400 }))],
    [3400, (a, b, L) => (b.say({ line: L.dbz[2] }), b.say({ effect: 'sparkles' }))],
    [2200, (a) => (a.say({ gesture: 'shrug' }), a.say({ effect: 'sweat' }))],
  ],
  matrix: [
    [0, (a) => a.say({ act: 'bang', dir: 1, room: 170 })],
    [120, (a, b) => b.say({ act: 'lean', dir: -1, room: 170, ms: 3400 })],
    [3300, (a, b) => (b.say({ effect: 'sparkles' }), a.say({ effect: 'exclaim' }), a.say({ gesture: 'surprise' }))],
  ],
  duel: [
    [0, (a, b, L) => (a.say({ line: L.duel[0] }), a.walkTo(a.pos().x - 80, undefined, 60), b.walkTo(b.pos().x + 80, undefined, 60), a.face(-1), b.face(1))],
    [2400, (a, b) => (a.face(1), b.face(-1))],
    [900, (a, b) => (a.say({ effect: 'sweat' }), b.say({ effect: 'sweat' }))],
    [1200, (a, b, L) => (a.say({ act: 'bang', dir: 1, room: 170 }), a.say({ line: L.duel[1] }))],
    [200, (a, b) => b.say({ act: 'fall', dir: -1, ms: 2800 })],
    [2700, (a, b, L) => (b.say({ line: L.duel[2] }), b.say({ gesture: 'laugh' }))],
    [800, (a) => a.say({ gesture: 'laugh' })],
  ],
  sw: [
    [0, (a, b) => (a.say({ act: 'saber', dir: 1, room: 70, color: '#ff3b3b', ms: 2600 }), b.say({ act: 'saber', dir: -1, room: 70, color: '#44a8ff', ms: 2600 }))],
    [2500, (a, b, L) => a.say({ line: L.sw[0] })],
    [1800, (a, b, L) => (b.say({ line: L.sw[1] }), b.say({ gesture: 'shake' }), b.say({ effect: 'tears' }))],
    [2400, (a, b, L) => (a.say({ line: L.sw[2] }), a.say({ effect: 'hearts' }))],
  ],
  fight: [
    [0, (a, b, L) => (a.say({ line: L.fight[0] }), a.say({ gesture: 'stomp' }), a.say({ effect: 'anger' }))],
    [1800, (a, b, L) => (b.say({ line: L.fight[1] }), b.say({ effect: 'steam' }), b.say({ act: 'shove', dir: -1, room: 60 }))],
    [380, (a) => (a.say({ act: 'hit', dir: 1 }), a.fling(-120, 18, 420))],
    [1200, (a, b) => (a.say({ act: 'shove', dir: 1, room: 60 }), setTimeout(() => b.fling(120, 18, 420), 150))],
    [1400, (a, b) => (a.say({ effect: 'question' }), b.say({ effect: 'question' }))],
    [1300, (a, b, L) => (b.say({ line: L.fight[2] }), b.say({ effect: 'hearts' }))],
    [1600, (a, b, L) => (a.say({ line: L.fight[3] }), a.say({ effect: 'hearts' }), a.walkTo(a.pos().x + 50), b.walkTo(b.pos().x - 50))],
  ],
  twist: [
    [0, (a, b, L) => (a.say({ line: L.twist[0] }), a.say({ gesture: 'bow' }))],
    [1600, (a, b, L) => (b.say({ line: L.twist[1] }), a.say({ act: 'twist', ms: 3600 }), b.say({ act: 'twist', ms: 3600 }), a.say({ effect: 'notes' }), b.say({ effect: 'notes' }))],
    [3500, (a, b) => (a.say({ gesture: 'celebrate' }), b.say({ gesture: 'celebrate' }), a.say({ effect: 'confetti' }))],
  ],
};

const GAP = 170; // how far apart they stand (their windows grow for what flies between them)

// minutes between scenes, per the "how often" setting
const EVERY = { rare: [5, 10], normal: [1.5, 3.5], often: [0.5, 1] };

exports.createDirector = ({ ots, lang = 'en', url, token }) => {
  const L = LINES[lang] || LINES.en;
  let running = false;
  const SOON = process.env.SEVENOTS_PET_SCENES_SOON === '1'; // testing: one scene after another
  let nextAt = Date.now() + (SOON ? 4000 : 25000);
  let last = '';
  // settings (daemon GET /scenes): on/off, how often, which scenes; plus a "play one now" from settings
  let conf = { on: true, every: 'normal', list: Object.keys(SCENES) };
  let want = null; // scene asked for ('' = any), played as soon as two ots are free
  const gap = () => {
    const [lo, hi] = EVERY[conf.every] || EVERY.normal;
    return (lo + Math.random() * (hi - lo)) * 60000;
  };
  // the host's daemon holds the settings; a "play now" may come from any ot's settings
  const get = (u, tk) => fetch(new URL('/scenes', u), { headers: { 'X-7ots-Token': tk } }).then((x) => (x.ok ? x.json() : null), () => null);
  if (url && token)
    setInterval(async () => {
      const others = [...ots.values()].map((o) => o.daemon).filter((d) => d?.token && d.url !== url);
      const [r, ...rest] = await Promise.all([get(url, token), ...others.map((d) => get(d.url, d.token))]);
      if (r) {
        const changed = r.every !== conf.every;
        conf = { on: r.on !== false, every: r.every, list: (r.list || []).filter((n) => SCENES[n]) };
        if (changed) nextAt = Math.min(nextAt, Date.now() + gap()); // more often: don't wait out the old, longer gap
      }
      const asked = [r, ...rest].find((x) => x?.play)?.play;
      if (asked) want = asked.scene || '';
    }, 2000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // waits, but gives up as soon as the mouse is on either of them (to click or drag it): true = interrupted
  const pause = async (ms, ...pair) => {
    for (const end = Date.now() + ms; Date.now() < end; await wait(Math.min(80, end - Date.now()))) if (pair.some((o) => o.interrupted())) return true;
    return pair.some((o) => o.interrupted());
  };

  async function play(x, y, asked = null) {
    running = true;
    // they take turns: a line from one ends the other's (one speech bubble at a time)
    const turns = (o, other) => ({ ...o, say: (m) => (m?.line && other.say({ hush: true }), o.say(m)) });
    [x, y] = [turns(x, y), turns(y, x)];
    let [a, b] = x.pos().x <= y.pos().x ? [x, y] : [y, x];
    for (const o of [x, y]) o.hold({ w: GAP * 2 + 120, h: 400 }); // room for beams, flings and lines, no resizing mid-scene
    try {
      // meet in the middle, GAP apart, then face each other
      const { minX, maxX } = a.bounds();
      const mid = Math.max(minX + GAP / 2, Math.min(maxX - GAP / 2, (a.pos().x + b.pos().x) / 2));
      const fy = (b.host ? b : a).pos().y; // at the host's height (it may live up the screen)
      a.walkTo(mid - GAP / 2, fy, 150);
      b.walkTo(mid + GAP / 2, fy, 150);
      for (let t = 0; t < 120 && !(a.arrivedAt() && b.arrivedAt()); t++) {
        if (a.interrupted() || b.interrupted()) return;
        await wait(100);
      }
      a.face(1);
      b.face(-1);
      if (await pause(500, a, b)) return;
      const pool = conf.list.length ? conf.list : Object.keys(SCENES);
      const names = pool.length > 1 ? pool.filter((n) => n !== last) : pool;
      if (asked !== null) want = null; // the request is served only once the scene really starts
      const name = process.env.SEVENOTS_PET_SCENE || asked || names[Math.floor(Math.random() * names.length)];
      last = name;
      console.log(`[7ots director] ${name}`);
      // half the time the right one starts (scenes are written for the left one)
      if (Math.random() < 0.5 && !['duel', 'fight'].includes(name)) [a, b] = [mirror(b), mirror(a)];
      for (const [ms, step] of SCENES[name]) {
        if (await pause(ms, a, b)) return;
        step(a, b, L);
      }
      await pause(2500, a, b);
    } finally {
      for (const o of [x, y]) (o.hold(null), o.inScene() && o.release());
      running = false;
      nextAt = Date.now() + (SOON ? 3000 : gap());
    }
  }

  // the same ot with directions flipped, so a scene can be played from the other side
  function mirror(o) {
    const flip = (m) => (m && typeof m.dir === 'number' ? { ...m, dir: -m.dir } : m);
    return { ...o, say: (m) => o.say(flip(m)), face: (d) => o.face(-d), fling: (vx, ...r) => o.fling(-vx, ...r), walkTo: (px, ...r) => o.walkTo(o.pos().x - (px - o.pos().x), ...r) };
  }

  setInterval(() => {
    if (running) return;
    if (want !== null) {
      const s = [...ots.values()].filter((o) => o.ready()).sort(() => Math.random() - 0.5);
      if (s.length >= 2) play(s[0], s[1], want).catch((e) => console.log('[7ots director]', e.message));
      return;
    }
    const free = [...ots.values()].filter((o) => o.free());
    if (free.length < 2) return;
    if (!conf.on || !conf.list.length) return;
    // two that wandered close start right away; otherwise now and then
    let pair = null;
    for (let i = 0; i < free.length && !pair; i++)
      for (let j = i + 1; j < free.length && !pair; j++) if (Math.abs(free[i].pos().x - free[j].pos().x) < 220 && Date.now() > nextAt - 30000) pair = [free[i], free[j]];
    if (!pair && Date.now() > nextAt) {
      const s = free.sort(() => Math.random() - 0.5);
      pair = [s[0], s[1]];
    }
    if (pair) play(...pair).catch((e) => console.log('[7ots director]', e.message));
  }, 1000);

  return { play: (i, j) => play(ots.get(i), ots.get(j)) };
};
