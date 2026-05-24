/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Music Production'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Music Production\n\n## Overview\nMusic production encompasses the entire process of creating, recording, mixing, and mastering music. It combines technical knowledge, creative vision, and artistic skill to produce professional-quality recordings.\n\n## Recording Process\n\n### Pre-Production\n- Song arrangement\n- Instrumentation planning\n- Vocal arrangement\n- Reference tracks\n- Studio preparation\n- Equipment setup\n\n### Recording\n- Microphone selection and placement\n- Gain staging\n- Multiple takes\n- Layering instruments\n- Vocal recording techniques\n- Overdubbing\n- Click track usage\n\n### Post-Recording\n- Editing and timing correction\n- Comping (selecting best takes)\n- Tuning correction\n- Noise reduction\n- Preparation for mixing\n\n## Mixing Workflow\n\n### Mixing Fundamentals\n- Level balancing\n- Panning and stereo imaging\n- EQ (equalization)\n- Compression\n- Reverb and delay\n- Automation\n\n### Advanced Mixing\n- Multiband compression\n- Parallel compression\n- Saturation and distortion\n- Sidechain compression\n- Frequency analysis\n- Metering and monitoring\n\n### Mixing Techniques\n- Subtractive EQ\n- Additive EQ\n- Dynamic EQ\n- Compression ratios\n- Attack and release times\n- Wet/dry balance\n\n## Mastering Process\n\n### Mastering Fundamentals\n- Linear phase EQ\n- Multiband compression\n- Limiting\n- Metering and analysis\n- Loudness standards\n- Format delivery\n\n### Mastering Considerations\n- Headroom management\n- Frequency balance\n- Loudness optimization\n- Stereo width\n- Translation across systems\n- Quality control\n\n## Digital Audio Workstations (DAWs)\n\n### Popular DAWs\n- Pro Tools (industry standard)\n- Logic Pro (Mac-focused)\n- Ableton Live (electronic music)\n- FL Studio (hip-hop, electronic)\n- Cubase (comprehensive)\n- Studio One (modern workflow)\n\n### DAW Features\n- Audio recording and editing\n- MIDI sequencing\n- Virtual instruments\n- Plugin support\n- Automation\n- Collaboration tools\n\n## Real-World Applications\n\n### Music Industry\n- Album production\n- Single releases\n- Soundtrack composition\n- Podcast production\n- Streaming optimization\n- Commercial music\n\n### Content Creation\n- YouTube videos\n- Podcasts\n- Film and TV\n- Video games\n- Advertising\n- Social media content\n\n## Essential Tools\n\n### Hardware\n- Audio interface\n- Studio monitors\n- Headphones\n- Microphone\n- Microphone preamp\n- Compressor\n- EQ\n- Cables and stands\n\n### Software\n- DAW\n- Plugins (EQ, compression, reverb)\n- Virtual instruments\n- Metering tools\n- Analysis tools\n\n## Challenges\n\n### Acoustic Issues\n- Room reflections\n- Standing waves\n- Frequency buildup\n- Acoustic treatment\n- Monitoring accuracy\n- Noise floor\n\n### Solutions\n- Acoustic treatment\n- Room analysis\n- Proper speaker placement\n- Headphone monitoring\n- Reference tracks\n- Professional studios\n\n## Learning Resources\n- \"Mixing Secrets for the Small Studio\" by Mike Senior\n- \"The Mastering Engineer's Handbook\" by Bob Katz\n- \"Modern Recording Techniques\" by David Miles Huber\n- Pensado's Place (YouTube)\n- Pro Mix Academy\n- Online production courses\n\n## Best Practices\n- Invest in quality monitoring\n- Treat your room acoustically\n- Use reference tracks\n- Take breaks to rest ears\n- Learn your tools deeply\n- Develop critical listening skills\n- Keep detailed notes\n- Backup your work\n- Collaborate with others\n- Continuously learn and experiment");
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
