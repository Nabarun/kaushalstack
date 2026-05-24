/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Python'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Python is a high-level, interpreted programming language renowned for its simplicity, readability, and versatility. It's the go-to language for data science, machine learning, artificial intelligence, and scientific computing, with powerful libraries like NumPy, Pandas, TensorFlow, and PyTorch. Python's clean syntax makes it ideal for rapid development and prototyping. Beyond data science, Python excels in web development (Django, Flask), automation, scripting, and DevOps. Its extensive standard library and vibrant community provide solutions for virtually any problem. Python's accessibility makes it perfect for beginners while remaining powerful enough for complex enterprise applications. It's widely used in academia, research, fintech, and tech companies worldwide.");
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
