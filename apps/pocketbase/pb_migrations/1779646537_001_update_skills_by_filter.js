/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Recipe Development'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Recipe Development is the creative and technical process of creating, testing, and refining recipes for consistency, taste, and appeal. It involves understanding ingredient interactions, flavor profiles, cooking times, and proportions to develop dishes that are both delicious and reproducible. Recipe developers work with nutritionists, food scientists, and chefs to create recipes for restaurants, food brands, cookbooks, and media. The process includes multiple iterations of testing, adjusting seasonings, and optimizing techniques. Strong recipe development skills require culinary knowledge, creativity, attention to detail, and understanding of food science. This skill is valuable for chefs, food bloggers, cookbook authors, and food product companies developing new offerings.");
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
