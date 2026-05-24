/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Mixing'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Audio Mixing\n\n## Overview\nMixing is the process of blending multiple audio tracks into a cohesive, balanced final mix. It combines technical knowledge, creative decision-making, and critical listening skills to achieve professional results.\n\n## Mixing Fundamentals\n\n### Level Balancing\n- Gain staging\n- Fader automation\n- Peak metering\n- Loudness perception\n- Dynamic range\n- Headroom management\n\n### Panning & Stereo Imaging\n- Mono compatibility\n- Stereo width\n- Panning techniques\n- Phantom center\n- Stereo enhancement\n- Spatial placement\n\n### Equalization (EQ)\n\n#### EQ Types\n- Parametric EQ\n- Graphic EQ\n- Shelving EQ\n- Notch filters\n- Dynamic EQ\n- Linear phase EQ\n\n#### EQ Techniques\n- Subtractive EQ (removing problem frequencies)\n- Additive EQ (enhancing desired frequencies)\n- Surgical EQ (precise frequency targeting)\n- Broad strokes (wide Q)\n- Surgical cuts (narrow Q)\n- Frequency masking solutions\n\n### Compression\n\n#### Compression Parameters\n- Ratio (1:1 to \u221e:1)\n- Threshold\n- Attack time\n- Release time\n- Makeup gain\n- Knee\n\n#### Compression Types\n- VCA compression\n- FET compression\n- Optical compression\n- Variable-Mu compression\n- PWM compression\n\n#### Compression Techniques\n- Transparent compression\n- Parallel compression\n- Multiband compression\n- Sidechain compression\n- Serial compression\n- Lookahead\n\n## Reverb & Delay\n\n### Reverb Types\n- Room reverb (small spaces)\n- Hall reverb (large spaces)\n- Plate reverb (smooth, bright)\n- Spring reverb (vintage, colored)\n- Convolver reverb (impulse response)\n- Algorithmic reverb\n\n### Reverb Parameters\n- Pre-delay\n- Decay time\n- Diffusion\n- Damping\n- Wet/dry balance\n- Early reflections\n\n### Delay Techniques\n- Slapback delay\n- Ping-pong delay\n- Dotted note delays\n- Feedback loops\n- Tempo-synced delays\n- Analog vs. digital\n\n## Automation\n\n### Automation Types\n- Volume automation\n- Pan automation\n- Effect automation\n- Mute automation\n- Plugin parameter automation\n\n### Automation Techniques\n- Ride the fader\n- Vocal automation\n- Drum automation\n- Effect automation\n- Breakpoint editing\n- Smooth curves\n\n## Real-World Applications\n\n### Music Production\n- Pop and rock mixing\n- Hip-hop and electronic\n- Jazz and acoustic\n- Classical and orchestral\n- Country and folk\n- Genre-specific techniques\n\n### Audio Post-Production\n- Film and TV mixing\n- Podcast production\n- Audiobook narration\n- Video game audio\n- Streaming content\n- Broadcast standards\n\n## Mixing Tools\n\n### Hardware\n- Studio monitors\n- Headphones\n- Mixing console\n- Outboard gear\n- Cables and connectors\n- Acoustic treatment\n\n### Software\n- DAW mixing tools\n- EQ plugins\n- Compressor plugins\n- Reverb plugins\n- Metering tools\n- Analysis tools\n\n## Challenges\n\n### Ear Fatigue\n- Listening fatigue\n- Frequency masking\n- Loudness adaptation\n- Decision fatigue\n- Ear damage risk\n\n### Solutions\n- Take regular breaks\n- Use reference tracks\n- Monitor at moderate levels\n- Use headphones for detail\n- Develop critical listening\n- Use metering tools\n- Protect hearing\n\n## Mixing Workflow\n\n### Steps\n1. Organization and preparation\n2. Gain staging\n3. Rough balance\n4. EQ and compression\n5. Effects and automation\n6. Final balance and polish\n7. Metering and analysis\n8. Reference and comparison\n9. Final adjustments\n10. Delivery and archiving\n\n### Best Practices\n- Start with clean recordings\n- Use reference tracks\n- Mix at moderate levels\n- Take breaks\n- Use metering tools\n- Trust your ears\n- Document decisions\n- Backup your work\n- Get feedback\n- Iterate and refine\n\n## Monitoring & Metering\n\n### Metering Tools\n- Peak meters\n- VU meters\n- Loudness meters (LUFS)\n- Spectrum analyzer\n- Phase correlation\n- Waveform display\n\n### Monitoring Setup\n- Accurate speakers\n- Treated room\n- Headphone monitoring\n- Reference headphones\n- Multiple monitoring systems\n- Calibration\n\n## Learning Resources\n- \"Mixing Secrets for the Small Studio\" by Mike Senior\n- \"The Mixing Engineer's Handbook\" by Bobby Owsinski\n- \"Pro Tools for Music Production\" by various authors\n- Pensado's Place (YouTube)\n- Pro Mix Academy\n- Online mixing courses\n\n## Best Practices\n- Invest in quality monitoring\n- Treat your room acoustically\n- Use reference tracks\n- Take breaks to rest ears\n- Learn your tools deeply\n- Develop critical listening skills\n- Keep detailed notes\n- Backup your work\n- Collaborate with others\n- Continuously learn and experiment");
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
