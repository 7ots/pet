/**
 * Speech tags: the brain marks tone ("expressions" in settings → Voice) and the voice performs it.
 * xAI reads them as is; ElevenLabs v3 gets its own audio tags; every other voice (and the bubble) gets clean text.
 */
const INLINE = /\s*\[(pause|long-pause|laugh|cry|mouth-click|breath|sigh)\]\s*/gi;
const WRAP = /<\/?(loud|soft|whisper|fast|slow|singing)>/gi;

export function stripSpeechTags(text) {
  return String(text ?? '').replace(WRAP, '').replace(INLINE, ' ').replace(/\s{2,}/g, ' ').trim();
}

const EL_INLINE = { laugh: '[laughs]', cry: '[crying]', sigh: '[sighs]', breath: '[exhales]', pause: '…', 'long-pause': '… …', 'mouth-click': '' };
const EL_WRAP = { whisper: '[whispers]', soft: '[softly]', loud: '[shouting]', slow: '[slowly]', fast: '[quickly]', singing: '[sings]' };

/** The text a provider should get: tags kept (xAI), translated (ElevenLabs v3) or removed. */
export function speechTagsFor(text, provider, model = '') {
  if (provider === 'grok') return String(text ?? '');
  if (provider === 'elevenlabs' && /v3/.test(model)) {
    return String(text ?? '')
      .replace(/<(loud|soft|whisper|fast|slow|singing)>/gi, (_, t) => `${EL_WRAP[t.toLowerCase()]} `)
      .replace(/<\/(loud|soft|whisper|fast|slow|singing)>/gi, '')
      .replace(/\[(pause|long-pause|laugh|cry|mouth-click|breath|sigh)\]/gi, (_, t) => EL_INLINE[t.toLowerCase()])
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return stripSpeechTags(text);
}

export const SPEECH_TAGS_PROMPT =
  'Your words are spoken aloud by an expressive voice, and you choose the tone. When it fits (not in every line) add: [laugh], [sigh], [cry], [breath] or [pause] where the sound goes, or wrap words in <whisper>…</whisper>, <soft>…</soft>, <loud>…</loud>, <slow>…</slow> or <fast>…</fast>. Sad news sounds soft and slow, a joke gets a laugh. No other brackets or angle brackets.';
