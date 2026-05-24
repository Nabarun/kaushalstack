/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Market Research'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Market Research is the systematic process of gathering, analyzing, and interpreting data about markets, competitors, and consumers to inform business decisions. It involves qualitative methods (interviews, focus groups, surveys) and quantitative analysis (statistical data, market size estimation) to understand customer needs, preferences, and behaviors. Market research identifies market opportunities, assesses competitive landscapes, validates business ideas, and guides product development. It's essential for strategic planning, pricing decisions, and marketing strategies. Market researchers use tools like surveys, analytics platforms, and data visualization to extract actionable insights. This skill is critical for product managers, entrepreneurs, consultants, and business strategists making informed decisions in competitive markets.");
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
