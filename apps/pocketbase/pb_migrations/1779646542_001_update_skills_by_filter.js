/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Social Media Analytics'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Social Media Analytics involves tracking, measuring, and analyzing social media performance to understand audience engagement, content effectiveness, and brand sentiment. It uses tools and metrics to monitor followers, likes, shares, comments, reach, and impressions across platforms like Facebook, Instagram, Twitter, LinkedIn, and TikTok. Analytics reveal which content resonates with audiences, optimal posting times, and emerging trends. Analysts use this data to optimize content strategy, improve engagement rates, and measure ROI of social media campaigns. Advanced analytics include sentiment analysis, influencer identification, and competitive benchmarking. This skill is essential for social media managers, content creators, digital marketers, and brand strategists looking to maximize social media impact.");
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
