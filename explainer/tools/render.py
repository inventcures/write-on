"""Scene list and rendered paths for assemble.py (rendering itself: render.sh, ManimGL)."""
from pathlib import Path

VIDEO_DIR = Path(__file__).resolve().parents[1]
SCENES = {0: "Scene00Hook", 1: "Scene01Title", 2: "Scene02Alternatives", 3: "Scene03GhostOverflow",
          4: "Scene04Timeline", 5: "Scene05MentalModel", 6: "Scene06AdaptsToYou", 7: "Scene07Close"}


def video_path(number: int, final: bool = True) -> Path:
    return VIDEO_DIR / "scenes" / "videos" / f"{SCENES[number]}.mp4"
