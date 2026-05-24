/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Audio Engineering'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Audio Engineering is the technical discipline of recording, mixing, and mastering audio to achieve professional sound quality. Audio engineers operate recording equipment, microphones, mixing consoles, and digital audio workstations to capture and process sound. They understand acoustics, signal flow, microphone techniques, and audio processing to optimize recordings. Mixing involves balancing multiple tracks, applying EQ and compression, adding effects, and creating spatial depth. Mastering is the final step that prepares audio for distribution across different platforms. Audio engineers work in studios, live venues, broadcast facilities, and post-production environments. They collaborate with musicians, producers, and directors. This skill is essential for music professionals, podcasters, video creators, and anyone producing audio content professionally.");
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
