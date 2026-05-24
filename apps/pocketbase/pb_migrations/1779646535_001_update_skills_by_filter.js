/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Culinary Techniques'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Culinary Techniques encompass the fundamental and advanced methods used in professional cooking to prepare, cook, and present food. These include knife skills for precise cutting, various cooking methods (saut\u00e9ing, braising, roasting, steaming), sauce preparation, and plating techniques. Mastering culinary techniques ensures consistent quality, improves efficiency in the kitchen, and enables chefs to execute complex recipes with precision. Proper technique prevents food waste, enhances flavors, and creates visually appealing dishes. From classical French techniques to modern molecular gastronomy, culinary skills are essential for professional chefs, home cooks, and food entrepreneurs. Understanding heat control, timing, and ingredient interactions transforms raw ingredients into exceptional dishes.");
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
