/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Sound Design'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Sound Design\n\n## Overview\nSound design is the art and science of creating, manipulating, and processing audio to achieve specific sonic effects and emotional responses. It's essential in games, film, music, and interactive media.\n\n## Synthesis Fundamentals\n\n### Subtractive Synthesis\n- Oscillators (sine, square, sawtooth, triangle)\n- Filters (low-pass, high-pass, band-pass)\n- Envelopes (ADSR)\n- LFO (Low Frequency Oscillator)\n- Modulation\n- Resonance and cutoff\n\n### Additive Synthesis\n- Harmonic series\n- Partial manipulation\n- Spectral analysis\n- Harmonic content\n- Timbre creation\n- Complex tones\n\n### Wavetable Synthesis\n- Wavetable morphing\n- Spectral interpolation\n- Harmonic control\n- Unison and detuning\n- Modulation depth\n- Wavetable design\n\n### FM Synthesis\n- Carrier and modulator\n- Modulation index\n- Operator stacking\n- Complex timbres\n- Metallic sounds\n- Bell tones\n\n## Audio Effects\n\n### Time-Based Effects\n- Reverb (room, hall, plate, spring)\n- Delay (echo, slapback, ping-pong)\n- Chorus and flanger\n- Phaser\n- Tremolo\n- Vibrato\n\n### Frequency-Based Effects\n- EQ (parametric, graphic, dynamic)\n- Filters (resonant, morphing)\n- Distortion and overdrive\n- Saturation\n- Compression\n- Expansion\n\n### Modulation Effects\n- Chorus\n- Flanger\n- Phaser\n- Tremolo\n- Ring modulation\n- Vocoder\n\n### Spatial Effects\n- Panning\n- Stereo widening\n- Haas effect\n- Binaural processing\n- Ambisonics\n- 3D audio\n\n## Real-World Applications\n\n### Video Games\n- Ambient soundscapes\n- Interactive music\n- UI sounds\n- Weapon effects\n- Environmental audio\n- Character voices\n- Adaptive audio\n\n### Film & Television\n- Foley effects\n- Ambient soundscapes\n- Dialogue processing\n- Music integration\n- Sound effects design\n- Emotional impact\n- Immersive audio\n\n### Music Production\n- Instrument design\n- Texture creation\n- Atmospheric effects\n- Unique timbres\n- Experimental sounds\n- Genre-specific effects\n\n## Tools & Software\n\n### Synthesizers\n- Serum (wavetable)\n- Massive X (wavetable)\n- Sylenth1 (subtractive)\n- Operator (FM, in Ableton)\n- Pigments (hybrid)\n- Diva (analog modeling)\n\n### Effects Plugins\n- Fabfilter Pro-Q (EQ)\n- Soundtoys plugins\n- Waves plugins\n- Native Instruments Komplete\n- Valhalla reverbs\n- Dexed (FM)\n\n### DAWs\n- Ableton Live\n- Max/MSP\n- Pure Data\n- SuperCollider\n- FMOD Studio\n- Wwise\n\n## Sound Design Techniques\n\n### Granular Synthesis\n- Grain manipulation\n- Time stretching\n- Pitch shifting\n- Texture creation\n- Spectral processing\n- Microsound\n\n### Spectral Processing\n- Spectral analysis\n- Harmonic manipulation\n- Morphing\n- Resynthesis\n- Vocoding\n- Cross-synthesis\n\n### Sampling & Manipulation\n- Sample selection\n- Time stretching\n- Pitch shifting\n- Granulation\n- Layering\n- Resampling\n\n## Challenges\n\n### Creativity & Originality\n- Finding unique sounds\n- Avoiding clich\u00e9s\n- Developing personal style\n- Overcoming creative blocks\n- Balancing complexity and clarity\n\n### Solutions\n- Experiment constantly\n- Study reference sounds\n- Combine unexpected elements\n- Limit your tools\n- Collaborate with others\n- Take breaks\n- Document discoveries\n\n## Sound Design Process\n\n### Steps\n1. Define the sonic goal\n2. Gather inspiration\n3. Experiment with synthesis\n4. Apply effects\n5. Refine and iterate\n6. Test in context\n7. Finalize and document\n\n### Workflow Tips\n- Start with simple elements\n- Layer sounds gradually\n- Use automation\n- Reference other sounds\n- Take breaks\n- Document settings\n- Organize presets\n\n## Learning Resources\n- \"The Sound Design Handbook\" by Paul Thorne\n- \"Designing Sound\" by Aaron Marks\n- \"The Synthesizer\" by Mark Vail\n- Syntorial (interactive learning)\n- YouTube synthesis tutorials\n- Online sound design courses\n\n## Best Practices\n- Understand your tools deeply\n- Develop critical listening\n- Experiment fearlessly\n- Document your work\n- Build a sound library\n- Collaborate with others\n- Stay inspired\n- Keep learning\n- Develop your unique voice\n- Practice regularly");
    try {
      app.save(record);
    } catch (e) {
      if (e.message.includes("Value must be unique")) {
        console.log("Record with unique value already exists, skipping");
      } else {
        throw e;
      }
    }
  }
}, (app) => {
  // Rollback: original values not stored, manual restore needed
})
