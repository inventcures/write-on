#!/bin/bash
# Render scenes with ManimGL (3b1b/manim) headless. Usage: render.sh [-l|--hd] Scene00Hook ...
cd "$(dirname "$0")/../scenes"
Q=$1; shift
export PYTHONPATH=$PWD
for s in "$@"; do
  ( timeout 1800 xvfb-run -a manimgl wo_scenes.py $s -w $Q > /tmp/r_$s.log 2>&1; rc=$?
    echo "$s exit $rc"; grep -E "Error|DRIFT" /tmp/r_$s.log | tail -4 ) &
done
wait
