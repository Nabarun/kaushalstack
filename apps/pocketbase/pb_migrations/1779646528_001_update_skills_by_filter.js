/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='TypeScript'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "TypeScript is a superset of JavaScript that adds static type checking, enabling developers to catch errors at compile-time rather than runtime. It provides interfaces, generics, and advanced type features that make large codebases more maintainable and self-documenting. TypeScript compiles to clean, readable JavaScript and works seamlessly with existing JavaScript libraries. It significantly improves developer productivity through better IDE support, intelligent code completion, and refactoring tools. TypeScript is essential for large-scale applications where type safety prevents bugs and improves code quality. It's widely adopted in enterprise environments and is the default choice for frameworks like Angular and NestJS. Major companies like Microsoft, Google, Airbnb, and Slack use TypeScript extensively in their projects.");
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
