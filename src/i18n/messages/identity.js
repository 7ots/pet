/**
 * Textos del módulo de identidad (`identity.*`): tarjeta <ots-identity>, cara (createFace) y las
 * líneas de personalidad del system prompt (identityPrompt). Funciona también en Node (lo carga
 * src/identity/schema.js, que importa el proxy).
 */

import { addCatalog } from '../index.js';

const es = {
  identity: {
    card: {
      label: 'Tarjeta de {name}',
      loadError: 'No se pudo cargar la tarjeta del agente.',
      loading: 'Cargando…',
      chat: 'Chatear aquí',
      chatSub: 'En esta página',
      mail: 'Escribir un correo',
      mailInstant: '{email} · contesta al momento',
      mailSubject: 'Hola, {name}',
      apuchatSub: 'En la app de apuchat',
      apuchatInstant: 'En la app de apuchat · contesta y te llama',
      apuchatCopied: 'Copiado @{handle}: búscalo en la app de apuchat y escríbele.',
      apuchatSearch: 'Busca @{handle} en la app de apuchat y escríbele.',
      call: 'Videollamada ahora',
      callSub: 'Cara a cara en meet.apuchat.com',
      callPreparing: 'Preparando la llamada con {name}…',
      callReady: '{name} ya te espera en la llamada.',
      callError: 'No se pudo abrir la llamada: {error}',
      listen: 'Escuchar su voz',
      save: 'Guardar contacto',
      saveSub: 'vCard',
      footer: 'Identidad de agente',
    },
    greeting: {
      intro: 'Hola, soy {name}.',
      introRole: 'Hola, soy {name}, {role}.',
      offer: '¿En qué te ayudo?',
    },
    face: {
      subtitles: 'Subtítulos',
      loadError: 'No se pudo cargar la identidad ({status})',
    },
    prompt: {
      youAre: 'Eres {name}.',
      youAreRole: 'Eres {name}, {role}.',
      about: 'Sobre ti: {bio}',
      tone: 'Tu tono: {tone}.',
      traits: 'Rasgos: {traits}.',
    },
  },
};

const en = {
  identity: {
    card: {
      label: '{name}’s card',
      loadError: 'Couldn’t load the agent’s card.',
      loading: 'Loading…',
      chat: 'Chat here',
      chatSub: 'On this page',
      mail: 'Send an email',
      mailInstant: '{email} · replies instantly',
      mailSubject: 'Hi, {name}',
      apuchatSub: 'In the apuchat app',
      apuchatInstant: 'In the apuchat app · replies and calls you',
      apuchatCopied: 'Copied @{handle}: look it up in the apuchat app and send a message.',
      apuchatSearch: 'Look up @{handle} in the apuchat app and send a message.',
      call: 'Video call now',
      callSub: 'Face to face on meet.apuchat.com',
      callPreparing: 'Setting up the call with {name}…',
      callReady: '{name} is waiting for you on the call.',
      callError: 'Couldn’t open the call: {error}',
      listen: 'Hear their voice',
      save: 'Save contact',
      saveSub: 'vCard',
      footer: 'Agent identity',
    },
    greeting: {
      intro: 'Hi, I’m {name}.',
      introRole: 'Hi, I’m {name}, {role}.',
      offer: 'How can I help you?',
    },
    face: {
      subtitles: 'Subtitles',
      loadError: 'Couldn’t load the identity ({status})',
    },
    prompt: {
      youAre: 'You are {name}.',
      youAreRole: 'You are {name}, {role}.',
      about: 'About you: {bio}',
      tone: 'Your tone: {tone}.',
      traits: 'Traits: {traits}.',
    },
  },
};

const pt = {
  identity: {
    card: {
      label: 'Cartão de {name}',
      loadError: 'Não foi possível carregar o cartão do agente.',
      loading: 'Carregando…',
      chat: 'Conversar aqui',
      chatSub: 'Nesta página',
      mail: 'Enviar um e-mail',
      mailInstant: '{email} · responde na hora',
      mailSubject: 'Olá, {name}',
      apuchatSub: 'No app do apuchat',
      apuchatInstant: 'No app do apuchat · responde e liga para você',
      apuchatCopied: 'Copiado @{handle}: procure no app do apuchat e mande uma mensagem.',
      apuchatSearch: 'Procure @{handle} no app do apuchat e mande uma mensagem.',
      call: 'Videochamada agora',
      callSub: 'Cara a cara no meet.apuchat.com',
      callPreparing: 'Preparando a chamada com {name}…',
      callReady: '{name} já está esperando você na chamada.',
      callError: 'Não foi possível abrir a chamada: {error}',
      listen: 'Ouvir a voz',
      save: 'Salvar contato',
      saveSub: 'vCard',
      footer: 'Identidade de agente',
    },
    greeting: {
      intro: 'Olá, eu sou {name}.',
      introRole: 'Olá, eu sou {name}, {role}.',
      offer: 'Como posso ajudar?',
    },
    face: {
      subtitles: 'Legendas',
      loadError: 'Não foi possível carregar a identidade ({status})',
    },
    prompt: {
      youAre: 'Você é {name}.',
      youAreRole: 'Você é {name}, {role}.',
      about: 'Sobre você: {bio}',
      tone: 'Seu tom: {tone}.',
      traits: 'Traços: {traits}.',
    },
  },
};

const zh = {
  identity: {
    card: {
      label: '{name} 的名片',
      loadError: '无法加载该智能体的名片。',
      loading: '加载中…',
      chat: '在这里聊天',
      chatSub: '就在本页',
      mail: '发送邮件',
      mailInstant: '{email} · 即时回复',
      mailSubject: '你好，{name}',
      apuchatSub: '在 apuchat 应用中',
      apuchatInstant: '在 apuchat 应用中 · 会回复也会给你打电话',
      apuchatCopied: '已复制 @{handle}：在 apuchat 应用中搜索并给它发消息。',
      apuchatSearch: '在 apuchat 应用中搜索 @{handle} 并给它发消息。',
      call: '立即视频通话',
      callSub: '在 meet.apuchat.com 面对面',
      callPreparing: '正在准备与 {name} 的通话…',
      callReady: '{name} 已在通话中等你。',
      callError: '无法打开通话：{error}',
      listen: '听听它的声音',
      save: '保存联系人',
      saveSub: 'vCard',
      footer: '智能体身份',
    },
    greeting: {
      intro: '你好，我是 {name}。',
      introRole: '你好，我是 {name}，{role}。',
      offer: '有什么可以帮你？',
    },
    face: {
      subtitles: '字幕',
      loadError: '无法加载身份（{status}）',
    },
    prompt: {
      youAre: '你是 {name}。',
      youAreRole: '你是 {name}，{role}。',
      about: '关于你：{bio}',
      tone: '你的语气：{tone}。',
      traits: '特点：{traits}。',
    },
  },
};

const hi = {
  identity: {
    card: {
      label: '{name} का कार्ड',
      loadError: 'एजेंट का कार्ड लोड नहीं हो सका।',
      loading: 'लोड हो रहा है…',
      chat: 'यहाँ चैट करें',
      chatSub: 'इसी पेज पर',
      mail: 'ईमेल भेजें',
      mailInstant: '{email} · तुरंत जवाब देता है',
      mailSubject: 'नमस्ते, {name}',
      apuchatSub: 'apuchat ऐप में',
      apuchatInstant: 'apuchat ऐप में · जवाब देता है और आपको कॉल करता है',
      apuchatCopied: '@{handle} कॉपी हो गया: apuchat ऐप में इसे खोजें और संदेश भेजें।',
      apuchatSearch: 'apuchat ऐप में @{handle} खोजें और संदेश भेजें।',
      call: 'अभी वीडियो कॉल करें',
      callSub: 'meet.apuchat.com पर आमने-सामने',
      callPreparing: '{name} के साथ कॉल तैयार हो रही है…',
      callReady: '{name} कॉल पर आपका इंतज़ार कर रहा है।',
      callError: 'कॉल नहीं खुल सकी: {error}',
      listen: 'इसकी आवाज़ सुनें',
      save: 'संपर्क सहेजें',
      saveSub: 'vCard',
      footer: 'एजेंट पहचान',
    },
    greeting: {
      intro: 'नमस्ते, मैं {name} हूँ।',
      introRole: 'नमस्ते, मैं {name} हूँ, {role}।',
      offer: 'मैं आपकी क्या मदद करूँ?',
    },
    face: {
      subtitles: 'सबटाइटल',
      loadError: 'पहचान लोड नहीं हो सकी ({status})',
    },
    prompt: {
      youAre: 'तुम {name} हो।',
      youAreRole: 'तुम {name} हो, {role}।',
      about: 'तुम्हारे बारे में: {bio}',
      tone: 'तुम्हारा लहजा: {tone}।',
      traits: 'खूबियाँ: {traits}।',
    },
  },
};

addCatalog({ es, en, pt, zh, hi });
