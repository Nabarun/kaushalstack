/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Competitor Analysis'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Competitor Analysis\n\n## Overview\nCompetitor analysis is a strategic process of identifying and evaluating competitors' strengths, weaknesses, strategies, and market positioning. It provides insights for developing competitive advantages and informed business strategies.\n\n## Market Positioning\n\n### Understanding Competitors\n- Direct competitors (same market)\n- Indirect competitors (alternative solutions)\n- Emerging competitors (new entrants)\n- Substitute products\n- Competitive landscape mapping\n\n### Positioning Analysis\n- Price positioning\n- Quality positioning\n- Feature differentiation\n- Target market segments\n- Brand positioning\n- Value proposition\n\n## SWOT Analysis\n\n### Strengths\n- Competitive advantages\n- Unique capabilities\n- Brand recognition\n- Market share\n- Technology advantages\n- Customer loyalty\n\n### Weaknesses\n- Limitations and gaps\n- Resource constraints\n- Technology gaps\n- Market presence\n- Customer satisfaction issues\n- Operational inefficiencies\n\n### Opportunities\n- Market growth potential\n- Emerging trends\n- Technology adoption\n- Geographic expansion\n- New customer segments\n- Partnership possibilities\n\n### Threats\n- Market disruption\n- New competitors\n- Regulatory changes\n- Economic factors\n- Technological obsolescence\n- Changing customer preferences\n\n## Competitive Intelligence Gathering\n\n### Primary Research\n- Customer interviews\n- Focus groups\n- Surveys\n- Direct observation\n- Mystery shopping\n- Trade shows and events\n\n### Secondary Research\n- Company websites and reports\n- Financial statements\n- Press releases\n- Industry publications\n- Social media monitoring\n- Patent databases\n- News articles\n\n### Data Sources\n- Industry reports\n- Market research firms\n- Government databases\n- Trade associations\n- Academic research\n- Competitor websites\n\n## Real-World Applications\n\n### Strategic Planning\n- Market entry strategies\n- Product development\n- Pricing strategies\n- Marketing positioning\n- Partnership decisions\n- Investment priorities\n\n### Business Development\n- Identifying market gaps\n- Finding acquisition targets\n- Benchmarking performance\n- Setting realistic goals\n- Resource allocation\n\n## Tools & Platforms\n\n### Analysis Tools\n- Competitive intelligence software\n- Market research platforms\n- Financial analysis tools\n- Social media monitoring tools\n- SEO and web analytics\n- Customer review aggregators\n\n### Popular Platforms\n- Semrush for digital competition\n- SimilarWeb for web traffic\n- Crunchbase for company data\n- G2 for software reviews\n- Glassdoor for employee insights\n\n## Challenges\n\n### Data Accuracy\n- Incomplete information\n- Outdated data\n- Biased sources\n- Misinformation\n- Confidential information gaps\n\n### Solutions\n- Use multiple sources\n- Verify information\n- Regular updates\n- Combine quantitative and qualitative data\n- Consult industry experts\n- Monitor continuously\n\n## Analysis Framework\n\n### Key Metrics\n- Market share\n- Revenue and growth\n- Customer acquisition cost\n- Customer lifetime value\n- Product features\n- Pricing strategy\n- Marketing spend\n- Employee count\n\n### Competitive Positioning Matrix\n- Price vs. Quality\n- Innovation vs. Reliability\n- Market share vs. Growth\n- Feature richness vs. Simplicity\n\n## Learning Resources\n- \"Competitive Strategy\" by Michael Porter\n- \"Blue Ocean Strategy\" by W. Chan Kim\n- Industry-specific reports\n- Business case studies\n- Online courses on strategy\n\n## Best Practices\n- Conduct regular analysis\n- Monitor continuously\n- Document findings systematically\n- Share insights across organization\n- Update strategies based on findings\n- Focus on actionable insights\n- Combine multiple analysis methods\n- Consider long-term trends\n- Benchmark against best-in-class\n- Maintain ethical standards");
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
