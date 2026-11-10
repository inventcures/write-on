# write-on orientation video

A 4:54, 3Blue1Brown-style orientation for new users: what write-on is for, the four ideas behind it (after a short origin: the day Fable 5.2 came out; then alternative control, Ghost and Overflow, the colours and the timeline, the mental model), what to do in your first minute, and what exists today versus what is planned. Animated with Grant Sanderson's [ManimGL](https://github.com/3b1b/manim), narrated with Gemini TTS (voice Sulafat).

The rendered files (`write-on-orientation.mp4`, `.vtt`, `.srt`, poster `.jpg`) are served by the app as `/explainer.*`; they are built here, not stored here. Why each choice was made: [docs/decisions/orientation-video-…](../docs/decisions/orientation-video-claude-researched-2026-11-10-1910UTC.md). Every claim in the narration is checked in [script/fact_check.md](script/fact_check.md).

## Rebuild

```sh
# once: ManimGL from 3b1b/manim, plus the packages in requirements.txt
# headless Linux also needs xvfb, mesa-vulkan-drivers and fonts-ibm-plex
export WO_ENV_FILE=/path/to/.env        # GEMINI_API_KEY (never committed)
python tools/build_beats.py              # script/narration.yaml + lexicon -> narration/beats.json
python tts/build_audio.py                # synthesizes only changed beats (cached), costs API calls
python tools/process_audio.py            # per-scene tracks at -16 LUFS + timings/*.json
tools/render.sh --hd Scene00Hook Scene01Title Scene02Alternatives Scene03GhostOverflow \
  Scene04Timeline Scene05MentalModel Scene06AdaptsToYou Scene07Close
python tools/assemble.py --final         # mux, concat, captions -> output/
```

Preview a scene at 480p with `tools/render.sh -l Scene03GhostOverflow`, and look at it with `tools/sheet.sh Scene03GhostOverflow 3`. Scenes wait on the narration with `self.at(beat, fraction)`, so editing a line and re-running the audio steps re-times the animation.

The audio and timing tools are adapted from the author's earlier explainer pipeline. No footage or frames from Jason Fried's Write_On demo are used; every visual is drawn in code.
