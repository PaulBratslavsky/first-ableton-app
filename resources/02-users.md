# Users & Usage

## Personas

All three are real and served by the same core experience. The **self-taught Push player** is treated as the *primary* persona for MVP decisions — when needs conflict, optimize for them — because their loop is the purest "live glance" and the same instrument views serve the other two well.

### Mateo — self-taught Push producer *(primary)*
- Background: Makes music in Ableton, plays everything on Push. Comfortable with the Push grid and with chords by ear/shape, but never formally learned piano, guitar, bass, or how to read notation.
- Current workaround: Guesses, or looks up chord shapes online one at a time; mostly just doesn't see how their parts map to other instruments.
- Tech comfort: Confident in music software; not a "set up a dev environment" person — wants it to just work.

### Priya — multi-instrumentalist who also uses Push
- Background: Plays guitar and/or bass already, also produces on Push. Wants fast translation between what she plays on Push and how it sits on a fretboard, so she can transcribe parts or hand them to a bandmate.
- Current workaround: Works it out by hand on the instrument, or transcribes manually.
- Tech comfort: High.

### Dev — learner / student
- Background: Using Push to produce while actively learning theory, notation, and the guitar/bass fretboard. Treats the tool as a study aid.
- Current workaround: Flashcards, theory apps, a teacher — none connected to what he actually plays.
- Tech comfort: Medium–high.

## Jobs-to-be-done
- When Mateo plays a chord on Push, he wants to instantly see its shape on piano/guitar/bass and how it's written, so he understands his own music more completely without doing theory homework.
- When Priya plays a part on Push, she wants to see a sensible fretboard fingering for it, so she can transcribe it or communicate it to a guitarist/bassist.
- When Dev plays on Push, he wants the notes mapped to notation and the fretboard, so he reinforces what he's learning against real playing.

## Primary user journey
1. **Discovery**: A Push producer hears about a tool that shows their playing as piano/guitar/bass/notation in real time.
2. **First use**: They get it running alongside Live, play a chord on Push, and see all four views light up at once. The "aha" is immediate and requires no configuration.
3. **Aha moment**: "That chord I always play on Push — *that's* what it looks like on a guitar / on the staff."
4. **Ongoing use**: The tool lives open as a second screen during every session. They don't operate it; they glance at it while producing, and occasionally pause on a voicing to study how it translates.

## Core loop
**The repeated action:** Play on Push → glance at the four synchronized views (piano, guitar, bass, notation) → keep playing or adjust → glance again. It runs continuously as a passive, always-on mirror rather than something the user actively drives.

**What pulls users back:** It's always there during production, costs nothing to consult (just a glance), and steadily builds cross-instrument intuition over many sessions. The more they play, the more the translations sink in.

## Modes (scope note)
- **Live mirror (v1):** Real-time visualization of what's being played on Push *right now*. This is the whole MVP.
- **Playback visualization (v2, parked):** Visualizing a recorded clip/song as it plays back in Live — synced to the transport. Acknowledged as valuable but deferred; it introduces clip-reading and transport-sync complexity that the live mirror doesn't need.
