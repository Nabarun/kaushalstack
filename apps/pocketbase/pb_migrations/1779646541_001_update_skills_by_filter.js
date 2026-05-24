/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Consumer Behavior Analysis'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Consumer Behavior Analysis examines how individuals make purchasing decisions, what influences their choices, and how they interact with brands and products. It combines psychology, sociology, and economics to understand motivations, preferences, and decision-making patterns. Analysts study factors like demographics, psychographics, cultural influences, and emotional triggers that drive consumer actions. This analysis informs product positioning, marketing messaging, pricing strategies, and customer experience design. Tools include surveys, focus groups, behavioral tracking, and data analytics. Understanding consumer behavior helps businesses create targeted marketing campaigns, improve customer satisfaction, and increase loyalty. This skill is valuable for marketers, product managers, UX designers, and business strategists.");
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
