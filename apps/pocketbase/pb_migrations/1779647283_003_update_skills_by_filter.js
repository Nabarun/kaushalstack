/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Trend Identification'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Trend Identification & Social Listening\n\n## Overview\nTrend identification involves monitoring social media, online conversations, and market signals to detect emerging patterns, topics, and shifts in consumer interest. It enables proactive marketing and product strategy.\n\n## Pattern Recognition\n\n### Trend Signals\n- Increasing mention volume\n- Growing engagement rates\n- Expanding audience reach\n- Emerging hashtags\n- New influencer adoption\n- Cross-platform momentum\n\n### Trend Lifecycle\n- Emerging phase (early signals)\n- Growth phase (rapid adoption)\n- Peak phase (maximum visibility)\n- Decline phase (waning interest)\n- Maturity phase (stable baseline)\n\n### Trend Types\n- Seasonal trends\n- Cyclical trends\n- Fad trends (short-lived)\n- Structural trends (long-term)\n- Micro-trends (niche)\n- Macro-trends (broad)\n\n## Social Listening\n\n### Monitoring Channels\n- Twitter/X for real-time discussion\n- Instagram for visual trends\n- TikTok for emerging culture\n- Reddit for community insights\n- LinkedIn for professional trends\n- YouTube for content trends\n- Blogs and forums\n- News outlets\n\n### Data Collection\n- Keyword monitoring\n- Hashtag tracking\n- Influencer monitoring\n- Competitor tracking\n- Sentiment tracking\n- Volume analysis\n\n### Listening Scope\n- Brand mentions\n- Category discussions\n- Competitor mentions\n- Industry conversations\n- Cultural conversations\n- Emerging topics\n\n## Real-World Applications\n\n### Marketing Strategy\n- Campaign timing\n- Content creation\n- Influencer partnerships\n- Product launches\n- Messaging development\n- Channel selection\n\n### Product Development\n- Feature prioritization\n- Product innovation\n- Market fit validation\n- Customer needs identification\n- Competitive positioning\n- Launch strategy\n\n### Brand Management\n- Reputation monitoring\n- Crisis detection\n- Opportunity identification\n- Competitive intelligence\n- Customer sentiment\n- Brand perception\n\n## Tools & Platforms\n\n### Social Listening Tools\n- Sprout Social for comprehensive monitoring\n- Hootsuite Insights for multi-channel\n- Mention for real-time alerts\n- Talkwalker for advanced analytics\n- Brandwatch for competitive intelligence\n- Meltwater for media monitoring\n\n### Analytics Tools\n- Google Trends for search trends\n- Twitter Analytics for platform data\n- Instagram Insights for visual trends\n- YouTube Analytics for video trends\n- Semrush for SEO trends\n- Ahrefs for content trends\n\n### Data Visualization\n- Tableau for dashboards\n- Power BI for reporting\n- Google Data Studio\n- Custom dashboards\n- Real-time monitoring\n\n## Challenges\n\n### Noise & Volume\n- Information overload\n- Irrelevant mentions\n- Bot activity\n- Spam content\n- Duplicate discussions\n- Signal-to-noise ratio\n\n### Solutions\n- Sophisticated filtering\n- Keyword refinement\n- Sentiment analysis\n- Bot detection\n- Manual validation\n- Expert review\n\n## Analysis Framework\n\n### Key Metrics\n- Mention volume\n- Engagement rate\n- Sentiment distribution\n- Reach and impressions\n- Share of voice\n- Trend velocity\n- Influencer impact\n\n### Trend Scoring\n- Volume growth rate\n- Engagement growth\n- Sentiment strength\n- Influencer amplification\n- Cross-platform presence\n- Sustainability indicators\n\n## Trend Identification Process\n\n### Steps\n1. Define monitoring scope\n2. Set up listening tools\n3. Establish baseline metrics\n4. Monitor continuously\n5. Analyze patterns\n6. Validate findings\n7. Assess opportunity\n8. Take action\n9. Monitor impact\n\n### Validation\n- Cross-platform confirmation\n- Expert assessment\n- Historical comparison\n- Competitive validation\n- Customer feedback\n- Sales data correlation\n\n## Learning Resources\n- \"Contagious: Why Things Catch On\" by Jonah Berger\n- \"Trendwatching\" by Jeremy Bullmore\n- Social media platform guides\n- Industry trend reports\n- Online courses on social listening\n- Webinars and conferences\n\n## Best Practices\n- Monitor continuously\n- Use multiple sources\n- Validate findings\n- Consider context\n- Act quickly on opportunities\n- Document trends\n- Share insights widely\n- Combine data and intuition\n- Stay curious\n- Build trend culture");
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
