"""One `synthesize(text, out_path, kind)` interface over Gemini TTS and Cartesia.

Keys come only from the environment (GEMINI_API_KEY / CARTESIA_API_KEY), loaded from
the .env next to this project when present. Keys are never printed, logged or written.
"""

import base64
import hashlib
import io
import os
import sys
import time
import wave
from pathlib import Path

import httpx
import yaml
from dotenv import load_dotenv

VIDEO_DIR = Path(__file__).resolve().parents[1]
load_dotenv(os.environ.get("WO_ENV_FILE", VIDEO_DIR.parent / ".env"))
CONFIG = yaml.safe_load((VIDEO_DIR / "config.yaml").read_text())
MAX_ATTEMPTS = 5
RETRYABLE = {429, 500, 502, 503, 504}


def require_key(name: str) -> str:
    key = os.environ.get(name)
    if not key:
        sys.exit(f"Set {name} in your shell, e.g. export {name}=...")
    return key


def style_for(kind: str, role: str = "narrator") -> str:
    if role != "narrator":
        return CONFIG["voices"][role]["style"]
    return CONFIG["style"] + CONFIG["style_by_kind"].get(kind, "")


def voice_for(provider: str, role: str = "narrator") -> str:
    if role != "narrator":
        return CONFIG["voices"][role][provider]
    return CONFIG[provider]["voice"] if provider == "gemini" else CONFIG[provider]["voice_id"]


def cache_key(provider: str, voice: str, style: str, text: str) -> str:
    model = CONFIG[provider]["model"]
    return hashlib.sha256(f"{provider}|{model}|{voice}|{style}|{text}".encode()).hexdigest()[:16]


def pcm_to_wav(pcm: bytes, rate: int = 24_000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def _gemini(text: str, voice: str, style: str) -> bytes:
    from google import genai

    require_key("GEMINI_API_KEY")
    client = genai.Client()
    interaction = client.interactions.create(
        model=CONFIG["gemini"]["model"],
        input=[{
            "type": "user_input",
            "content": [{
                "type": "text",
                "text": text,
                "annotations": [{"type": "speech_metadata", "style": style}],
            }],
        }],
        response_format={"type": "audio"},
        generation_config={"speech_config": [{"voice": voice}]},
    )
    audio = base64.b64decode(interaction.output_audio.data)
    return audio if audio[:4] == b"RIFF" else pcm_to_wav(audio)


def _cartesia(text: str, voice: str, style: str) -> bytes:
    key = require_key("CARTESIA_API_KEY")
    response = httpx.post(
        "https://api.cartesia.ai/tts/bytes",
        headers={"X-API-Key": key, "Cartesia-Version": CONFIG["cartesia"]["version"]},
        json={
            "model_id": CONFIG["cartesia"]["model"],
            "transcript": text,
            "voice": {"mode": "id", "id": voice},
            "language": "en",
            "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 44_100},
            "generation_config": {"speed": 0.95, "emotion": "calm"},
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.content


PROVIDERS = {"gemini": _gemini, "cartesia": _cartesia}


def _status(exc: Exception) -> int | None:
    for attr in ("code", "status_code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    return getattr(response, "status_code", None)


def synthesize(text: str, out_path: Path, kind: str = "narration", provider: str | None = None,
               voice: str | None = None, role: str = "narrator") -> Path:
    provider = provider or CONFIG["provider"]
    voice = voice or voice_for(provider, role)
    style = style_for(kind, role)
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            audio = PROVIDERS[provider](text, voice, style)
            break
        except Exception as exc:
            if _status(exc) not in RETRYABLE or attempt == MAX_ATTEMPTS:
                raise
            time.sleep(2 ** attempt * 2)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(audio)
    return out_path
