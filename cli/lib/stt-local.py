"""Local speech to text for the 7ots pet, a worker that keeps the Whisper model loaded (loading it took ~3 s of each
~12 s clip): python stt-local.py [model] reads JSON lines {"file": "/tmp/x.webm", "lang": "es"} and answers one JSON
line {"text": …} or {"error": …}. Runs in the venv ~/.7ots/stt (pip install faster-whisper); the model (base,
~140 MB) is cached on first use. Audio is decoded with ffmpeg (16 kHz mono) instead of PyAV, whose newer releases
break faster-whisper. A fixed language matters: detecting it on a short, noisy clip often lands on the wrong one."""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

model = WhisperModel(sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else 'base', device='cpu', compute_type='int8')
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    try:
        job = json.loads(line)
        pcm = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', job['file'], '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
        segments, _ = model.transcribe(np.frombuffer(pcm, dtype=np.float32), language=job.get('lang') or None, vad_filter=True, beam_size=1)
        print(json.dumps({'text': ' '.join(s.text.strip() for s in segments).strip()}), flush=True)
    except Exception as e:  # keep serving
        print(json.dumps({'error': str(e).split('\n')[0]}), flush=True)
