"""Local voice worker for the 7ots pet: keeps Piper voices loaded (loading one takes seconds; speaking a line, a
fraction). Reads JSON lines {"voice": "/path/x.onnx", "text": "...", "out": "/tmp/x.wav"}, answers "ok" or "error: …"."""
import json
import sys
import wave

from piper import PiperVoice

voices = {}
for line in sys.stdin:
    try:
        job = json.loads(line)
        v = voices.get(job['voice']) or voices.setdefault(job['voice'], PiperVoice.load(job['voice']))
        with wave.open(job['out'], 'wb') as w:
            v.synthesize_wav(job['text'], w)
        print('ok', flush=True)
    except Exception as e:  # keep serving
        print(f'error: {e}', flush=True)
