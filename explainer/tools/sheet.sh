#!/bin/bash
# Contact sheet of a rendered scene: one frame every N seconds. Usage: sheet.sh Scene00Hook 2
f=$(dirname "$0")/../scenes/videos/$1.mp4
ffmpeg -loglevel error -y -i "$f" -vf "fps=1/${2:-2},scale=480:-1,tile=4x4:padding=4" -frames:v 1 /tmp/sheet_$1.png && echo /tmp/sheet_$1.png
