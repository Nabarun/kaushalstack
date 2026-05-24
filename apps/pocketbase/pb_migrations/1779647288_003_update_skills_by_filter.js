/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Composition'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Music Composition\n\n## Overview\nMusic composition is the art of creating original music by combining melody, harmony, rhythm, and orchestration. It requires understanding music theory, creative expression, and technical skill.\n\n## Music Theory Fundamentals\n\n### Scales and Keys\n- Major and minor scales\n- Modes (Dorian, Phrygian, Lydian, etc.)\n- Pentatonic scales\n- Blues scales\n- Chromatic scales\n- Key signatures\n\n### Intervals and Harmony\n- Interval identification\n- Chord construction\n- Chord progressions\n- Voice leading\n- Harmonic function\n- Modulation\n\n### Rhythm and Meter\n- Time signatures\n- Note values\n- Syncopation\n- Polyrhythms\n- Tempo and pacing\n- Rhythmic patterns\n\n## Melody Development\n\n### Melodic Elements\n- Pitch contour\n- Intervallic relationships\n- Phrasing\n- Motif development\n- Repetition and variation\n- Climax and resolution\n\n### Melodic Techniques\n- Inversion\n- Retrograde\n- Augmentation and diminution\n- Sequencing\n- Fragmentation\n- Ornamentation\n\n## Harmony & Chord Progressions\n\n### Common Progressions\n- I-IV-V-I (classic)\n- ii-V-I (jazz)\n- I-V-vi-IV (pop)\n- vi-IV-I-V (emotional)\n- Chromatic progressions\n- Modal progressions\n\n### Harmonic Techniques\n- Substitution chords\n- Secondary dominants\n- Borrowed chords\n- Suspended chords\n- Extended chords\n- Parallel harmony\n\n## Orchestration\n\n### Instrument Families\n- Strings (violin, viola, cello, bass)\n- Woodwinds (flute, oboe, clarinet, bassoon)\n- Brass (trumpet, horn, trombone, tuba)\n- Percussion (timpani, snare, cymbals, mallets)\n- Keyboards and electronics\n\n### Orchestration Principles\n- Doubling and unison\n- Spacing and voicing\n- Texture and density\n- Color and timbre\n- Balance and blend\n- Counterpoint\n\n## Real-World Applications\n\n### Film & Television\n- Dramatic scores\n- Emotional themes\n- Action sequences\n- Ambient underscore\n- Leitmotifs\n- Synchronization\n\n### Video Games\n- Interactive music\n- Adaptive scoring\n- Looping structures\n- Emotional cues\n- Environmental music\n- Boss themes\n\n### Other Applications\n- Concert music\n- Ballet and dance\n- Theater and musicals\n- Advertising\n- Podcasts\n- Educational content\n\n## Composition Tools\n\n### Notation Software\n- Finale\n- Sibelius\n- MuseScore (free)\n- Dorico\n- Notion\n\n### DAWs for Composition\n- Logic Pro\n- Ableton Live\n- Cubase\n- Studio One\n- Pro Tools\n\n### Virtual Instruments\n- Orchestral libraries\n- Synthesizers\n- Sampled instruments\n- Physical modeling\n- Wavetable synthesis\n\n## Challenges\n\n### Originality\n- Avoiding clich\u00e9s\n- Finding unique voice\n- Balancing familiarity and novelty\n- Overcoming writer's block\n- Developing personal style\n\n### Solutions\n- Study diverse music\n- Experiment with constraints\n- Collaborate with others\n- Take breaks\n- Listen to reference music\n- Practice regularly\n\n## Composition Process\n\n### Steps\n1. Conceptualization and inspiration\n2. Melodic sketching\n3. Harmonic framework\n4. Structural planning\n5. Orchestration\n6. Refinement and revision\n7. Notation or recording\n8. Feedback and iteration\n\n### Structural Forms\n- Sonata form\n- Rondo form\n- Theme and variations\n- Binary form\n- Ternary form\n- Free form\n\n## Learning Resources\n- \"Harmony\" by Walter Piston\n- \"Orchestration\" by Samuel Adler\n- \"The Craft of Musical Composition\" by Paul Hindemith\n- \"Techniques of the Contemporary Composer\" by David Cope\n- Online music theory courses\n- Composition masterclasses\n\n## Best Practices\n- Study music theory thoroughly\n- Listen to diverse composers\n- Compose regularly\n- Seek feedback\n- Develop your unique voice\n- Understand your tools\n- Keep a sketchbook\n- Collaborate with performers\n- Revise and refine\n- Never stop learning");
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
