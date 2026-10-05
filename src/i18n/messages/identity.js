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

addCatalog({ es, en, pt });
