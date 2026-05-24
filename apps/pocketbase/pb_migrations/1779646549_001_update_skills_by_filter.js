/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Music Theory'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Music Theory is the study of the principles and practices that govern music composition, harmony, melody, and rhythm. It provides the foundational knowledge for understanding how music works, including scales, chords, intervals, progressions, and voice leading. Music theory enables musicians to analyze existing compositions, compose original music, and communicate musical ideas effectively. Understanding theory helps musicians improvise, arrange, and adapt music across different styles and genres. It's applicable to all musical instruments and genres, from classical to jazz to electronic music. Music theory is essential for composers, arrangers, music educators, and serious musicians. Strong theoretical knowledge enhances musicianship, improves ear training, and opens creative possibilities for musical expression.");
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
