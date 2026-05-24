/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Node.js'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Node.js is a JavaScript runtime built on Chrome's V8 engine that enables server-side JavaScript execution. It revolutionized backend development by allowing developers to use JavaScript across the full stack, from frontend to backend. Node.js excels at building fast, scalable network applications with its event-driven, non-blocking I/O model, making it perfect for real-time applications, APIs, and streaming services. Popular frameworks like Express.js, NestJS, and Fastify simplify development. Node.js is ideal for startups and rapid prototyping due to its quick development cycles, extensive npm package ecosystem, and excellent performance for I/O-heavy operations. It powers applications at Netflix, LinkedIn, Uber, and PayPal.");
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
