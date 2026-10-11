/**
 * Textos del creador por pasos (`creator.*`, src/creator/StepCreator.js) y de la habitación del ot
 * (`room.*`, src/character3d/room.js). Los nombres de las piezas salen de `character.*` (partLabel).
 */

import { addCatalog } from '../index.js';

const es = {
  creator: {
    stepOf: 'Paso {n} de {total}',
    steps: { body: 'Cuerpo', face: 'Cara', paint: 'Pintar', acc: 'Accesorios' },
    tabs: { shape: 'Forma', color: 'Color', finish: 'Acabado', preset: 'Plantillas', eyes: 'Ojos', brows: 'Cejas', mouth: 'Boca', cheeks: 'Mejillas', pattern: 'Patrón', texture: 'Textura' },
    bodyColor: 'Color del cuerpo', eyeColor: 'Color de los ojos', adjust: 'Ajustes', size: 'Tamaño', spacing: 'Separación', height: 'Altura',
    color: 'Color', patternColor: 'Color del patrón', otherColor: 'Otro color',
    back: '← Atrás', next: 'Siguiente →', play: 'Jugar', playNext: '▶ Jugar', random: 'Sorpréndeme', undo: 'Deshacer',
    clearAll: 'Quitar todos ({n})', modBody: 'Lleva el cuerpo 3D «{name}» (un mod), que tapa el ot. Al editar cualquier cosa aquí se lo quitas (puedes deshacer).', modRemove: 'Quitar el cuerpo 3D', drag: 'Arrastra para girarlo', empty: 'Nada por aquí.',
  },
  room: {
    auto: 'Solo', control: 'Controlar', edit: 'Editar', message: 'Mensaje', messageHint: 'Simula un mensaje entrante',
    keys: 'WASD o flechas · clic en el suelo para ir · Espacio saltar · E usar',
    use: 'E · {label}', getOff: 'E · Bajarse',
    inRoom: 'está en su pieza', walk: 'camina', run: 'va corriendo', you: 'lo controlas tú',
    themes: { cozy: 'Acogedora', gothic: 'Gótica', roman: 'Romana', japanese: 'Japonesa', scandi: 'Nórdica', cyberpunk: 'Cyberpunk', beach: 'Playa', cabin: 'Cabaña', space: 'Nave espacial', castle: 'Castillo' }, theme: 'Tipo de casa',
    places: { window: 'Mirar por la ventana', sofa: 'Sentarse en el sofá', rug: 'Bailar en la alfombra', bed: 'Dormir una siesta', desk: 'Revisar la plaza', plant: 'Regar la planta', front: 'Saludar' },
    doing: { window: 'mira por la ventana', sofa: 'descansa en el sofá', rug: 'baila en la alfombra', bed: 'duerme una siesta', desk: 'revisa la plaza', plant: 'riega la planta', front: 'te saluda' },
    say: {
      hello: '¡Hola! Soy {name}', window: 'Qué lindo está afuera…', sofa: 'Ahh… qué rico', desk: 'A ver qué hay en la plaza…', plant: 'Hay que regarla 🌱',
      gotMsg: '📩 ¡Me llegó un mensaje!', replied: 'Respondido ✓', takeMe: '¡Llévame! 🎮',
    },
    pad: { up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', use: 'Usar' },
  },
};

const en = {
  creator: {
    stepOf: 'Step {n} of {total}',
    steps: { body: 'Body', face: 'Face', paint: 'Paint', acc: 'Accessories' },
    tabs: { shape: 'Shape', color: 'Color', finish: 'Finish', preset: 'Presets', eyes: 'Eyes', brows: 'Brows', mouth: 'Mouth', cheeks: 'Cheeks', pattern: 'Pattern', texture: 'Texture' },
    bodyColor: 'Body color', eyeColor: 'Eye color', adjust: 'Adjust', size: 'Size', spacing: 'Spacing', height: 'Height',
    color: 'Color', patternColor: 'Pattern color', otherColor: 'Other color',
    back: '← Back', next: 'Next →', play: 'Play', playNext: '▶ Play', random: 'Surprise me', undo: 'Undo',
    clearAll: 'Remove all ({n})', modBody: 'It wears the 3D body “{name}” (a mod), which covers the ot. Editing anything here takes it off (you can undo).', modRemove: 'Remove the 3D body', drag: 'Drag to turn it', empty: 'Nothing here.',
  },
  room: {
    auto: 'On its own', control: 'Control', edit: 'Edit', message: 'Message', messageHint: 'Simulate an incoming message',
    keys: 'WASD or arrows · click the floor to go · Space jump · E use',
    use: 'E · {label}', getOff: 'E · Get down',
    inRoom: 'is in its room', walk: 'walks', run: 'is running', you: "you're in control",
    themes: { cozy: 'Cozy', gothic: 'Gothic', roman: 'Roman', japanese: 'Japanese', scandi: 'Scandi', cyberpunk: 'Cyberpunk', beach: 'Beach', cabin: 'Cabin', space: 'Spaceship', castle: 'Castle' }, theme: 'House style',
    places: { window: 'Look out the window', sofa: 'Sit on the sofa', rug: 'Dance on the rug', bed: 'Take a nap', desk: 'Check the plaza', plant: 'Water the plant', front: 'Say hi' },
    doing: { window: 'looks out the window', sofa: 'rests on the sofa', rug: 'dances on the rug', bed: 'takes a nap', desk: 'checks the plaza', plant: 'waters the plant', front: 'says hi' },
    say: {
      hello: "Hi! I'm {name}", window: "It's lovely out there…", sofa: 'Ahh… so comfy', desk: "Let's see what's on the plaza…", plant: 'Needs water 🌱',
      gotMsg: '📩 I got a message!', replied: 'Replied ✓', takeMe: 'Take me around! 🎮',
    },
    pad: { up: 'Up', down: 'Down', left: 'Left', right: 'Right', use: 'Use' },
  },
};

const pt = {
  creator: {
    stepOf: 'Passo {n} de {total}',
    steps: { body: 'Corpo', face: 'Rosto', paint: 'Pintar', acc: 'Acessórios' },
    tabs: { shape: 'Forma', color: 'Cor', finish: 'Acabamento', preset: 'Modelos', eyes: 'Olhos', brows: 'Sobrancelhas', mouth: 'Boca', cheeks: 'Bochechas', pattern: 'Padrão', texture: 'Textura' },
    bodyColor: 'Cor do corpo', eyeColor: 'Cor dos olhos', adjust: 'Ajustes', size: 'Tamanho', spacing: 'Separação', height: 'Altura',
    color: 'Cor', patternColor: 'Cor do padrão', otherColor: 'Outra cor',
    back: '← Voltar', next: 'Próximo →', play: 'Jogar', playNext: '▶ Jogar', random: 'Surpreenda-me', undo: 'Desfazer',
    clearAll: 'Tirar todos ({n})', modBody: 'Está usando o corpo 3D “{name}” (um mod), que cobre o ot. Editar qualquer coisa aqui tira ele (dá para desfazer).', modRemove: 'Tirar o corpo 3D', drag: 'Arraste para girá-lo', empty: 'Nada por aqui.',
  },
  room: {
    auto: 'Sozinho', control: 'Controlar', edit: 'Editar', message: 'Mensagem', messageHint: 'Simula uma mensagem recebida',
    keys: 'WASD ou setas · clique no chão para ir · Espaço pular · E usar',
    use: 'E · {label}', getOff: 'E · Descer',
    inRoom: 'está no quarto', walk: 'anda', run: 'vai correndo', you: 'você controla',
    themes: { cozy: 'Aconchegante', gothic: 'Gótica', roman: 'Romana', japanese: 'Japonesa', scandi: 'Nórdica', cyberpunk: 'Cyberpunk', beach: 'Praia', cabin: 'Cabana', space: 'Nave espacial', castle: 'Castelo' }, theme: 'Tipo de casa',
    places: { window: 'Olhar pela janela', sofa: 'Sentar no sofá', rug: 'Dançar no tapete', bed: 'Tirar um cochilo', desk: 'Ver a praça', plant: 'Regar a planta', front: 'Dizer oi' },
    doing: { window: 'olha pela janela', sofa: 'descansa no sofá', rug: 'dança no tapete', bed: 'tira um cochilo', desk: 'vê a praça', plant: 'rega a planta', front: 'te dá oi' },
    say: {
      hello: 'Oi! Eu sou {name}', window: 'Que lindo lá fora…', sofa: 'Ahh… que gostoso', desk: 'Vamos ver o que tem na praça…', plant: 'Precisa de água 🌱',
      gotMsg: '📩 Chegou uma mensagem!', replied: 'Respondido ✓', takeMe: 'Me leva! 🎮',
    },
    pad: { up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', use: 'Usar' },
  },
};

addCatalog({ es, en, pt });
