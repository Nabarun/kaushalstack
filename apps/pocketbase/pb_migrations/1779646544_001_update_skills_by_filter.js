/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Trend Forecasting'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Trend Forecasting is the practice of identifying and predicting emerging patterns, behaviors, and preferences in markets, culture, and technology before they become mainstream. Forecasters analyze historical data, consumer signals, cultural shifts, and technological developments to anticipate future demands. This involves studying social media conversations, fashion cycles, economic indicators, and innovation patterns. Accurate trend forecasting enables businesses to stay ahead of competition, develop products ahead of demand, and allocate resources strategically. It's used in fashion, technology, consumer goods, entertainment, and finance. Trend forecasters combine data analysis with intuition and cultural awareness. This skill is valuable for product strategists, marketers, investors, and business leaders making long-term strategic decisions.");
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
