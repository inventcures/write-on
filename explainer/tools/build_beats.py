"""Flatten script/narration.yaml into narration/beats.json, adding TTS-only respellings.

`display_text` is what captions show; `spoken_text` has script/lexicon.yaml applied.
"""

import json
import re
from pathlib import Path

import yaml

VIDEO_DIR = Path(__file__).resolve().parents[1]


def load_lexicon() -> list[tuple[str, str]]:
    return [tuple(pair) for pair in yaml.safe_load((VIDEO_DIR / "script" / "lexicon.yaml").read_text())]


def spoken(text: str, lexicon: list[tuple[str, str]]) -> str:
    for pattern, repl in lexicon:
        text = re.sub(pattern, repl, text)
    return text


def main() -> None:
    lexicon = load_lexicon()
    chapters = yaml.safe_load((VIDEO_DIR / "script" / "narration.yaml").read_text())
    scenes = []
    for chapter in chapters:
        for scene in chapter["scenes"]:
            scenes.append({
                "scene": scene["scene"],
                "chapter": chapter["chapter"],
                "title": scene["name"],
                "beats": [{
                    "id": beat["id"],
                    "kind": beat["kind"],
                    "voice": beat.get("voice", "narrator"),
                    "display_text": beat.get("caption", beat["text"]),
                    "spoken_text": beat["text"] if "voice" in beat else spoken(beat["text"], lexicon),
                } for beat in scene["beats"]],
            })
    out = VIDEO_DIR / "narration" / "beats.json"
    out.write_text(json.dumps(scenes, indent=2, ensure_ascii=False) + "\n")
    words = [len(b["display_text"].split()) for s in scenes for b in s["beats"]]
    print(f"{len(scenes)} scenes, {len(words)} beats, {sum(words)} words "
          f"(~{sum(words) / 140:.1f} min at 140 wpm) -> {out.relative_to(VIDEO_DIR)}")
    for s in scenes:
        print(f"  scene {s['scene']:2d} {s['title']:<18} {sum(len(b['display_text'].split()) for b in s['beats']):4d} words")


if __name__ == "__main__":
    main()
