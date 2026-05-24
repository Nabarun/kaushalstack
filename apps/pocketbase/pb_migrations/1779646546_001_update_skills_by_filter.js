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
    record.set("description", "Music Production is the comprehensive process of creating, recording, mixing, and mastering music from initial concept to final release. Producers work with artists, engineers, and musicians to shape the sound, arrange compositions, and ensure high-quality audio output. The process involves recording vocals and instruments, layering tracks, applying effects, balancing levels, and optimizing frequency response. Music producers use digital audio workstations (DAWs) like Ableton Live, Logic Pro, and Pro Tools, along with synthesizers, samplers, and audio plugins. They understand music theory, sound design, and production techniques across genres. Music production skills are essential for musicians, sound engineers, composers, and content creators. The ability to produce professional-quality music is increasingly valuable in film, gaming, podcasting, and streaming content creation.");
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
