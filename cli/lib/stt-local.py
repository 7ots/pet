"""Local speech to text for the 7ots pet: python stt-local.py <audio file> [lang] [model] → prints the text.
Runs in the venv ~/.7ots/stt (pip install faster-whisper); the model (base, ~140 MB) is cached on first use.
Audio is decoded with ffmpeg (16 kHz mono) instead of PyAV, whose newer releases break faster-whisper."""
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

pcm = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', sys.argv[1], '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, dtype=np.float32)
model = WhisperModel(sys.argv[3] if len(sys.argv) > 3 else 'base', device='cpu', compute_type='int8')
segments, _ = model.transcribe(audio, language=(sys.argv[2] or None) if len(sys.argv) > 2 else None, vad_filter=True, beam_size=1)
print(' '.join(s.text.strip() for s in segments).strip())
