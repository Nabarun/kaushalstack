/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Engagement Metrics'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Engagement Metrics & Social Analytics\n\n## Overview\nEngagement metrics measure how audiences interact with content and brands on social platforms. Understanding these KPIs is essential for evaluating social strategy effectiveness and optimizing content performance.\n\n## Key Performance Indicators (KPIs)\n\n### Reach Metrics\n- Impressions: Total content views\n- Reach: Unique users seeing content\n- Organic reach: Non-paid visibility\n- Paid reach: Advertising-driven visibility\n- Frequency: Average views per user\n- Viral coefficient: Organic amplification\n\n### Engagement Metrics\n- Likes and reactions\n- Comments and replies\n- Shares and retweets\n- Saves and bookmarks\n- Click-through rate (CTR)\n- Engagement rate: (Engagement/Reach) \u00d7 100\n\n### Audience Metrics\n- Follower growth\n- Follower quality\n- Audience demographics\n- Audience interests\n- Audience location\n- Audience growth rate\n\n### Conversion Metrics\n- Click-through rate\n- Conversion rate\n- Cost per acquisition\n- Return on ad spend (ROAS)\n- Customer lifetime value\n- Attribution\n\n## Analytics Interpretation\n\n### Engagement Rate Analysis\n- Benchmark against industry\n- Compare across content types\n- Identify top performers\n- Analyze audience segments\n- Track trends over time\n- Seasonal patterns\n\n### Content Performance\n- Best performing content types\n- Optimal posting times\n- Hashtag effectiveness\n- Caption length impact\n- Visual vs. text performance\n- Video engagement\n\n### Audience Insights\n- Demographics analysis\n- Psychographics\n- Behavior patterns\n- Preferences\n- Growth sources\n- Churn analysis\n\n## Real-World Applications\n\n### Social Strategy\n- Content calendar optimization\n- Posting schedule refinement\n- Content type prioritization\n- Hashtag strategy\n- Influencer partnerships\n- Campaign planning\n\n### Brand Management\n- Reputation monitoring\n- Sentiment tracking\n- Crisis detection\n- Competitive benchmarking\n- Brand health assessment\n- Audience satisfaction\n\n### Marketing Optimization\n- Campaign effectiveness\n- Budget allocation\n- Channel selection\n- Message testing\n- Audience targeting\n- Performance improvement\n\n## Tools & Platforms\n\n### Native Analytics\n- Facebook Insights\n- Instagram Insights\n- Twitter Analytics\n- LinkedIn Analytics\n- YouTube Analytics\n- TikTok Analytics\n\n### Third-Party Tools\n- Sprout Social for comprehensive analytics\n- Hootsuite Analytics\n- Buffer Analytics\n- Later for visual content\n- Brandwatch for competitive analysis\n- Socialbakers for benchmarking\n\n### Data Visualization\n- Tableau for dashboards\n- Power BI for reporting\n- Google Data Studio\n- Custom dashboards\n- Real-time monitoring\n\n## Challenges\n\n### Attribution Complexity\n- Multi-touch attribution\n- Cross-platform tracking\n- Offline conversion tracking\n- Privacy regulations\n- Data fragmentation\n- Time lag effects\n\n### Solutions\n- Multi-touch attribution models\n- UTM parameters\n- Pixel tracking\n- CRM integration\n- Customer journey mapping\n- Incrementality testing\n\n## Metric Framework\n\n### Awareness Stage\n- Impressions\n- Reach\n- Share of voice\n- Brand mentions\n- Follower growth\n\n### Consideration Stage\n- Engagement rate\n- Click-through rate\n- Time on page\n- Bounce rate\n- Video completion rate\n\n### Conversion Stage\n- Conversion rate\n- Cost per acquisition\n- Return on ad spend\n- Customer lifetime value\n- Repeat purchase rate\n\n### Retention Stage\n- Repeat engagement\n- Follower retention\n- Customer retention\n- Lifetime value\n- Advocacy metrics\n\n## Benchmarking\n\n### Industry Benchmarks\n- Average engagement rates by platform\n- Average reach metrics\n- Typical conversion rates\n- Cost per acquisition ranges\n- Follower growth rates\n\n### Competitive Analysis\n- Competitor engagement rates\n- Competitor reach\n- Competitor content strategy\n- Competitor audience size\n- Competitor growth\n\n## Reporting & Communication\n\n### Key Reports\n- Monthly performance reports\n- Campaign reports\n- Competitive analysis\n- Audience insights\n- Trend reports\n- Executive summaries\n\n### Visualization Best Practices\n- Clear, simple charts\n- Appropriate metric selection\n- Trend visualization\n- Comparative analysis\n- Actionable insights\n- Executive-friendly format\n\n## Learning Resources\n- Platform-specific analytics guides\n- \"Measuring the Networked Nonprofit\" by Beth Kanter\n- \"Contagious: Why Things Catch On\" by Jonah Berger\n- Analytics certification programs\n- Online courses and webinars\n- Industry reports\n\n## Best Practices\n- Define clear KPIs aligned with goals\n- Track consistently\n- Benchmark against industry\n- Analyze trends, not just snapshots\n- Consider context\n- Test and iterate\n- Document methodology\n- Share insights widely\n- Focus on actionable metrics\n- Continuously optimize");
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
