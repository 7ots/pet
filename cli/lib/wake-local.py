"""Wake word for the 7ots pet: python wake-local.py <model dir> <lang> <name> → listens to the default mic and prints
"wake" each time it hears "oye <name>" ("hey"/"ei" in en/pt). Runs in the venv ~/.7ots/stt (pip install vosk sounddevice).
Vosk runs on this computer and nothing is recorded or sent: it only reads the words to look for the trigger.
Free recognition of a whole room takes a full core, so it runs on a grammar: the trigger plus a few hundred common
words, which soak up everything else ("oye, dónde…" stays "oye donde", not "oye dobi") at ~10% of a core. A name the
model doesn't know (most invented ones) can't go in a grammar: then it's free recognition and a sounds-like match.
python wake-local.py --setup <model dir> <url> downloads and unzips the small model (~40-50 MB) once."""
import json
import os
import queue
import sys
import time
import unicodedata

if sys.argv[1] == '--setup':
    import io
    import shutil
    import urllib.request
    import zipfile
    dest, url = sys.argv[2], sys.argv[3]
    tmp = dest + '.part'
    shutil.rmtree(tmp, ignore_errors=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    z.extractall(tmp)
    inner = [d for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d))]
    shutil.rmtree(dest, ignore_errors=True)
    os.rename(os.path.join(tmp, inner[0]) if len(inner) == 1 else tmp, dest)
    shutil.rmtree(tmp, ignore_errors=True)
    print('ok')
    sys.exit(0)

import sounddevice as sd
import vosk

vosk.SetLogLevel(-1)
model_dir, lang, name = sys.argv[1], sys.argv[2], sys.argv[3]
CALL = {'es': ['oye', 'hey', 'ey'], 'en': ['hey', 'hi', 'okay'], 'pt': ['ei', 'oi', 'hey']}.get(lang, ['hey', 'oye'])


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')


def sound(s):
    # spelled as it sounds, roughly: "toby" ≈ "dobi", "dovi" ≈ "dobi", "kai" ≈ "cai"
    s = norm(s).replace('ll', 'y').replace('qu', 'k').replace('h', '')
    s = ''.join({'v': 'b', 'c': 'k', 'z': 's', 'w': 'u', 't': 'd', 'p': 'b', 'g': 'k'}.get(c, c) for c in s)
    s = s[:-1] + 'i' if s.endswith('y') else s
    return ''.join(c for i, c in enumerate(s) if i == 0 or c != s[i - 1])


def dist(a, b):
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


target = norm(name).split()
key = sound(''.join(target))
slack = max(1, len(key) // 4)
calls = {sound(c) for c in CALL} | {sound('oi'), sound('ei')}


def hit(text):
    w = norm(text).split()
    n = len(target)
    for i in range(1, len(w) - n + 1):
        # "oye dobi", and the name split or glued the way the small model hears it ("do vi", "toby")
        if sound(w[i - 1]) in calls and any(dist(sound(''.join(w[i:i + k])), key) <= slack for k in range(n, n + 2) if i + k <= len(w)):
            return True
    return False


COMMON = {
    'es': """a al algo ahi ahora alla aca asi aqui ayuda ayudas bien bueno buenos buenas cada casa como con cosa cual cuando cuanto de del dame decir dia dias dime donde dos el ella ellos en entonces era eres es esa ese eso esta este esto estas estoy favor frio fue gente gracias hace hacer hasta hay hola hora hoy ir la las le libro lo los luego mas me mi mio mira mucho muy nada no noche nos o otra otro para pero poco por porque pues puedes que quien quiero se si sin sobre son su tal tambien tan tarde te tengo tiempo tienes todo tu un una uno va vamos ve ven ver vez y ya yo""",
    'en': """a about all and are at be but by can come could do does done for from get go good have he hello her here hi his how i if in is it just know like look me my no not now of oh ok on one or out please right see she so some that the then there they this time to today up us want was we well what when where who why will with would yes you your""",
    'pt': """a ai agora aqui as assim bem boa bom casa com como de do da dia diz e ela ele em entao era esse essa esta este estou eu faz fazer hoje isso ja la mais me meu minha muito na nao no nos o obrigado olha onde os ou para pode por porque quando que quem se sei sim so sua tem tempo tudo um uma vai vamos ver voce""",
}.get(lang, '').split()
model = vosk.Model(model_dir)
has = lambda x: vosk._c.vosk_model_find_word(model._handle, x.encode()) >= 0
nm = ' '.join(target)
known = all(has(x) for x in target)
calls_k = [c for c in CALL if has(c)]
if known:
    words = sorted({w for w in map(norm, COMMON) if has(w)} - set(target) - set(calls_k))
    rec = vosk.KaldiRecognizer(model, 16000, json.dumps([f'{c} {nm}' for c in calls_k] + [nm] + calls_k + words + ['[unk]']))
else:
    rec = vosk.KaldiRecognizer(model, 16000)
q = queue.Queue()
stream = sd.RawInputStream(samplerate=16000, blocksize=4000, dtype='int16', channels=1, callback=lambda d, *_: q.put(bytes(d)))
stream.start()
print('ready', flush=True)
quiet = 0
seen = 0
while True:
    data = q.get()
    final = rec.AcceptWaveform(data)
    text = json.loads(rec.Result() if final else rec.PartialResult()).get('text' if final else 'partial', '')
    # a partial can flicker to the name for a moment ("oye do…" → "oye dobi" → "oye donde"): twice in a row, or final
    seen = seen + 1 if text and hit(text) else 0
    if time.time() > quiet and (seen >= 2 or (final and seen)):
        print('wake', flush=True)
        quiet = time.time() + 3
        seen = 0
        rec.Reset()
