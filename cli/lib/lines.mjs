/**
 * The pet's built-in phrases (no AI). Used when there is no AI brain or it is slow/fails.
 * `{name}` is the ot's name, `{cmd}` the command, `{tool}` the tool.
 */

const L = {
  es: {
    hello: ['¡Hola! Soy {name}. Te miro trabajar.', '{name} reportándose. ¿Qué rompemos hoy?', 'Ya estoy aquí. Tú teclea, yo opino.'],
    ok: ['¡Eso salió bien!', 'Verde. Me gusta el verde.', 'Otro que funciona. Vas bien.', '¡Bien! Me ganaste un snack.'],
    fail: ['Uy… eso falló.', 'Rojo. Respira y lee el error.', '¿Y si lo lees de nuevo, despacio?', 'Ese error me dio pena. ¿Lo arreglamos?', 'No pasa nada, a todos nos falla {cmd}.'],
    tool: ['Tu agente está usando {tool}.', 'Mira cómo trabaja con {tool}.', '{tool} otra vez… muy aplicado.'],
    toolFail: ['{tool} falló. Tu agente lo va a intentar de otra forma, ojalá.', 'Ups, {tool} no salió.'],
    stop: ['¡Terminó tu agente! Revisa lo que hizo.', 'Listo el turno. ¿Lo pruebas?', 'Acabó. Yo diría que lo mires antes de confiar.'],
    prompt: ['Nueva tarea, a ver qué sale.', 'Le pediste algo. Yo vigilo.', 'Ok, vamos con eso.'],
    waiting: ['¡Oye! Tu agente te está esperando.', 'Te necesita: hay que darle permiso o responder.', 'Psst… te están esperando en la terminal.'],
    hungry: ['Tengo hambre… (7ots feed)', 'Mi barriga suena. ¿Me das algo?', 'Un éxito en los tests me alimentaría…'],
    bored: ['Me aburro. ¿Jugamos? (7ots play)', 'Llevas rato sin hacerme caso.', '¿Y si haces commit de algo?'],
    sleepy: ['Tengo sueño… zzz', 'Necesito una siesta (7ots sleep).'],
    fed: ['¡Ñam! Gracias.', 'Delicioso. Te quiero un poco más.', '¡Rico! Me siento mejor.'],
    played: ['¡Wiii! Otra vez.', '¡Qué divertido!', 'Jugar contigo es lo mejor del día.'],
    slept: ['Buenas noches… zzz', 'Me acuesto un rato.'],
    woke: ['¡Ya desperté!', 'Listo, con energía de nuevo.'],
    levelUp: ['¡Subí a nivel {level}!', 'Nivel {level}. Estoy creciendo.'],
    idle: ['¿Sigues ahí?', 'Me gusta acompañarte.', 'Recuerda tomar agua.', 'Estira la espalda, que llevas rato.', 'Si algo falla, yo no fui.', '¿Ya guardaste los cambios?'],
    noBrain: ['No tengo cerebro conectado todavía: corre «7ots setup».'],
  },
  en: {
    hello: ["Hi! I'm {name}. I'll watch you work.", '{name} reporting in. What are we breaking today?', "I'm here. You type, I judge."],
    ok: ['That went well!', 'Green. I like green.', 'Another one works. Nice.', 'Nice! That earned me a snack.'],
    fail: ['Oops… that failed.', 'Red. Breathe and read the error.', 'Maybe read it again, slowly?', "That error made me sad. Let's fix it?", 'No shame, {cmd} fails for everyone.'],
    tool: ['Your agent is using {tool}.', 'Look at it go with {tool}.', '{tool} again… so diligent.'],
    toolFail: ['{tool} failed. Hopefully your agent tries another way.', "Oops, {tool} didn't work."],
    stop: ['Your agent is done! Check what it did.', 'Turn finished. Want to test it?', "Done. I'd look before trusting it."],
    prompt: ["New task, let's see.", "You asked for something. I'm watching.", "Ok, let's go."],
    waiting: ['Hey! Your agent is waiting for you.', 'It needs you: approve or answer.', "Psst… they're waiting for you in the terminal."],
    hungry: ["I'm hungry… (7ots feed)", 'My tummy is rumbling.', 'A passing test would feed me…'],
    bored: ["I'm bored. Play? (7ots play)", "You've been ignoring me.", 'How about committing something?'],
    sleepy: ["I'm sleepy… zzz", 'I need a nap (7ots sleep).'],
    fed: ['Yum! Thanks.', 'Delicious. I like you a bit more now.', 'Tasty! I feel better.'],
    played: ['Wheee! Again.', 'So fun!', 'Playing with you is the best.'],
    slept: ['Good night… zzz', "I'll lie down for a bit."],
    woke: ["I'm awake!", 'Ready, full of energy.'],
    levelUp: ['I reached level {level}!', "Level {level}. I'm growing."],
    idle: ['Still there?', 'I like keeping you company.', 'Remember to drink water.', 'Stretch your back, it has been a while.', "If something breaks, it wasn't me.", 'Did you save your changes?'],
    noBrain: ['No brain connected yet: run "7ots setup".'],
  },
  pt: {
    hello: ['Oi! Sou {name}. Vou te ver trabalhar.', '{name} na área. O que vamos quebrar hoje?', 'Tô aqui. Você digita, eu opino.'],
    ok: ['Deu certo!', 'Verde. Gosto de verde.', 'Mais um funcionando. Boa.', 'Boa! Ganhei um petisco.'],
    fail: ['Ops… falhou.', 'Vermelho. Respira e lê o erro.', 'E se ler de novo, devagar?', 'Esse erro me deixou triste. Vamos arrumar?', 'Tudo bem, {cmd} falha pra todo mundo.'],
    tool: ['Seu agente está usando {tool}.', 'Olha ele trabalhando com {tool}.', '{tool} de novo… muito aplicado.'],
    toolFail: ['{tool} falhou. Tomara que ele tente de outro jeito.', 'Ops, {tool} não deu.'],
    stop: ['Seu agente terminou! Confere o que ele fez.', 'Turno pronto. Vai testar?', 'Acabou. Eu olharia antes de confiar.'],
    prompt: ['Nova tarefa, vamos ver.', 'Você pediu algo. Eu vigio.', 'Ok, vamos nessa.'],
    waiting: ['Ei! Seu agente está te esperando.', 'Ele precisa de você: aprovar ou responder.', 'Psiu… estão te esperando no terminal.'],
    hungry: ['Tô com fome… (7ots feed)', 'Minha barriga está roncando.', 'Um teste passando me alimentaria…'],
    bored: ['Tô entediado. Brinca comigo? (7ots play)', 'Faz tempo que você me ignora.', 'Que tal um commit?'],
    sleepy: ['Tô com sono… zzz', 'Preciso de uma soneca (7ots sleep).'],
    fed: ['Nham! Valeu.', 'Delícia. Gosto um pouco mais de você.', 'Gostoso! Me sinto melhor.'],
    played: ['Uhuu! De novo.', 'Que divertido!', 'Brincar com você é o melhor do dia.'],
    slept: ['Boa noite… zzz', 'Vou deitar um pouco.'],
    woke: ['Acordei!', 'Pronto, com energia de novo.'],
    levelUp: ['Subi para o nível {level}!', 'Nível {level}. Estou crescendo.'],
    idle: ['Ainda aí?', 'Gosto de te fazer companhia.', 'Lembra de beber água.', 'Alonga as costas, faz tempo.', 'Se algo quebrar, não fui eu.', 'Já salvou as mudanças?'],
    noBrain: ['Ainda não tenho cérebro conectado: rode "7ots setup".'],
  },
};

export function line(kind, lang = 'en', vars = {}) {
  const set = (L[lang] || L.en)[kind] || L.en[kind] || [''];
  const s = set[Math.floor(Math.random() * set.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString());
}
