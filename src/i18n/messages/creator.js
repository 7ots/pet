/**
 * Textos del creador por pasos (`creator.*`, src/creator/StepCreator.js) y de la habitación del ot
 * (`room.*`, src/character3d/room.js). Los nombres de las piezas salen de `character.*` (partLabel).
 */

import { addCatalog } from '../index.js';

const es = {
  creator: {
    stepOf: 'Paso {n} de {total}',
    steps: { body: 'Cuerpo', face: 'Cara', paint: 'Pintar', acc: 'Accesorios' },
    tabs: { shape: 'Forma', style: 'Estilo', color: 'Color', finish: 'Acabado', preset: 'Plantillas', eyes: 'Ojos', brows: 'Cejas', mouth: 'Boca', cheeks: 'Mejillas', pattern: 'Patrón', texture: 'Textura' },
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
    tabs: { shape: 'Shape', style: 'Style', color: 'Color', finish: 'Finish', preset: 'Presets', eyes: 'Eyes', brows: 'Brows', mouth: 'Mouth', cheeks: 'Cheeks', pattern: 'Pattern', texture: 'Texture' },
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
    tabs: { shape: 'Forma', style: 'Estilo', color: 'Cor', finish: 'Acabamento', preset: 'Modelos', eyes: 'Olhos', brows: 'Sobrancelhas', mouth: 'Boca', cheeks: 'Bochechas', pattern: 'Padrão', texture: 'Textura' },
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

const zh = {
  creator: {
    stepOf: '第 {n} 步，共 {total} 步',
    steps: { body: '身体', face: '脸', paint: '上色', acc: '配饰' },
    tabs: { shape: '形状', style: '风格', color: '颜色', finish: '质感', preset: '模板', eyes: '眼睛', brows: '眉毛', mouth: '嘴巴', cheeks: '脸颊', pattern: '图案', texture: '纹理' },
    bodyColor: '身体颜色', eyeColor: '眼睛颜色', adjust: '调整', size: '大小', spacing: '间距', height: '高度',
    color: '颜色', patternColor: '图案颜色', otherColor: '其他颜色',
    back: '← 返回', next: '下一步 →', play: '开玩', playNext: '▶ 开玩', random: '给我惊喜', undo: '撤销',
    clearAll: '全部移除（{n}）', modBody: '它穿着 3D 身体“{name}”（一个 mod），会盖住 ot。在这里编辑任何内容都会把它取下（可以撤销）。', modRemove: '移除 3D 身体', drag: '拖动来旋转', empty: '这里什么都没有。',
  },
  room: {
    auto: '自己玩', control: '操控', edit: '编辑', message: '消息', messageHint: '模拟一条收到的消息',
    keys: 'WASD 或方向键 · 点击地面前往 · 空格跳跃 · E 使用',
    use: 'E · {label}', getOff: 'E · 下来',
    inRoom: '在自己的房间里', walk: '在走路', run: '在奔跑', you: '由你操控',
    themes: { cozy: '温馨', gothic: '哥特', roman: '罗马', japanese: '日式', scandi: '北欧', cyberpunk: '赛博朋克', beach: '海滩', cabin: '小木屋', space: '宇宙飞船', castle: '城堡' }, theme: '房屋风格',
    places: { window: '看看窗外', sofa: '坐在沙发上', rug: '在地毯上跳舞', bed: '睡个午觉', desk: '看看广场', plant: '给植物浇水', front: '打个招呼' },
    doing: { window: '正看着窗外', sofa: '在沙发上休息', rug: '在地毯上跳舞', bed: '在睡午觉', desk: '在看广场', plant: '在给植物浇水', front: '在跟你打招呼' },
    say: {
      hello: '你好！我是 {name}', window: '外面真美…', sofa: '啊…好舒服', desk: '看看广场上有什么…', plant: '该浇水了 🌱',
      gotMsg: '📩 我收到一条消息！', replied: '已回复 ✓', takeMe: '带我去逛逛！🎮',
    },
    pad: { up: '上', down: '下', left: '左', right: '右', use: '使用' },
  },
};

const hi = {
  creator: {
    stepOf: 'चरण {n} / {total}',
    steps: { body: 'शरीर', face: 'चेहरा', paint: 'रंग', acc: 'एक्सेसरीज़' },
    tabs: { shape: 'आकार', style: 'स्टाइल', color: 'रंग', finish: 'फ़िनिश', preset: 'टेम्पलेट', eyes: 'आँखें', brows: 'भौंहें', mouth: 'मुँह', cheeks: 'गाल', pattern: 'पैटर्न', texture: 'टेक्सचर' },
    bodyColor: 'शरीर का रंग', eyeColor: 'आँखों का रंग', adjust: 'समायोजन', size: 'आकार', spacing: 'दूरी', height: 'ऊँचाई',
    color: 'रंग', patternColor: 'पैटर्न का रंग', otherColor: 'दूसरा रंग',
    back: '← पीछे', next: 'आगे →', play: 'खेलें', playNext: '▶ खेलें', random: 'सरप्राइज़ दो', undo: 'पूर्ववत करें',
    clearAll: 'सब हटाएँ ({n})', modBody: 'इसने 3D शरीर “{name}” (एक mod) पहना है, जो ot को ढक देता है। यहाँ कुछ भी बदलने पर वह हट जाएगा (आप पूर्ववत कर सकते हैं)।', modRemove: '3D शरीर हटाएँ', drag: 'घुमाने के लिए खींचें', empty: 'यहाँ कुछ नहीं है।',
  },
  room: {
    auto: 'अपने आप', control: 'नियंत्रण', edit: 'संपादित करें', message: 'संदेश', messageHint: 'आने वाले संदेश का अनुकरण करें',
    keys: 'WASD या तीर कुंजियाँ · जाने के लिए फ़र्श पर क्लिक करें · Space कूदें · E इस्तेमाल करें',
    use: 'E · {label}', getOff: 'E · नीचे उतरें',
    inRoom: 'अपने कमरे में है', walk: 'चल रहा है', run: 'दौड़ रहा है', you: 'नियंत्रण आपके हाथ में',
    themes: { cozy: 'आरामदायक', gothic: 'गॉथिक', roman: 'रोमन', japanese: 'जापानी', scandi: 'नॉर्डिक', cyberpunk: 'साइबरपंक', beach: 'समुद्र तट', cabin: 'केबिन', space: 'अंतरिक्ष यान', castle: 'महल' }, theme: 'घर की शैली',
    places: { window: 'खिड़की से बाहर देखें', sofa: 'सोफ़े पर बैठें', rug: 'कालीन पर नाचें', bed: 'झपकी लें', desk: 'प्लाज़ा देखें', plant: 'पौधे को पानी दें', front: 'हाय कहें' },
    doing: { window: 'खिड़की से बाहर देख रहा है', sofa: 'सोफ़े पर आराम कर रहा है', rug: 'कालीन पर नाच रहा है', bed: 'झपकी ले रहा है', desk: 'प्लाज़ा देख रहा है', plant: 'पौधे को पानी दे रहा है', front: 'आपको हाय कह रहा है' },
    say: {
      hello: 'नमस्ते! मैं {name} हूँ', window: 'बाहर कितना सुंदर है…', sofa: 'आह… कितना आराम', desk: 'देखें प्लाज़ा में क्या है…', plant: 'पानी चाहिए 🌱',
      gotMsg: '📩 मुझे एक संदेश मिला!', replied: 'जवाब दिया ✓', takeMe: 'मुझे घुमाओ! 🎮',
    },
    pad: { up: 'ऊपर', down: 'नीचे', left: 'बाएँ', right: 'दाएँ', use: 'इस्तेमाल' },
  },
};

addCatalog({ es, en, pt, zh, hi });
