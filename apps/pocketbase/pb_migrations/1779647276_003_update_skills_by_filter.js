/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Consumer Insights'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Consumer Insights & Behavioral Analysis\n\n## Overview\nConsumer insights involve understanding customer behavior, motivations, preferences, and decision-making processes. This knowledge drives product development, marketing strategies, and business growth.\n\n## Behavioral Psychology\n\n### Consumer Decision-Making\n- Problem recognition\n- Information search\n- Evaluation of alternatives\n- Purchase decision\n- Post-purchase behavior\n- Cognitive biases and heuristics\n\n### Psychological Factors\n- Motivation and needs (Maslow's hierarchy)\n- Perception and attention\n- Learning and memory\n- Attitudes and beliefs\n- Personality and lifestyle\n- Emotional triggers\n\n### Social Influences\n- Family and peer influence\n- Reference groups\n- Social norms\n- Cultural factors\n- Aspirational groups\n- Social proof\n\n## Data Collection Methods\n\n### Quantitative Research\n- Surveys and questionnaires\n- Statistical analysis\n- Large sample sizes\n- Numerical data\n- Generalizable findings\n- A/B testing\n\n### Qualitative Research\n- Focus groups\n- In-depth interviews\n- Ethnographic studies\n- Observation\n- Case studies\n- Rich, contextual insights\n\n### Mixed Methods\n- Combining quantitative and qualitative\n- Comprehensive understanding\n- Validation of findings\n- Triangulation\n- Deeper insights\n\n## Customer Segmentation\n\n### Demographic Segmentation\n- Age, gender, income\n- Education, occupation\n- Family status\n- Geographic location\n\n### Psychographic Segmentation\n- Lifestyle and values\n- Personality traits\n- Interests and hobbies\n- Attitudes and beliefs\n- Aspirations\n\n### Behavioral Segmentation\n- Purchase frequency\n- Brand loyalty\n- Usage rate\n- Price sensitivity\n- Channel preference\n- Response to marketing\n\n### Value-Based Segmentation\n- Customer lifetime value\n- Profitability\n- Growth potential\n- Retention likelihood\n\n## Real-World Applications\n\n### Product Development\n- Feature prioritization\n- Product positioning\n- Packaging design\n- Pricing strategy\n- Launch timing\n- Market fit validation\n\n### Marketing Strategy\n- Message development\n- Channel selection\n- Campaign targeting\n- Creative direction\n- Promotional tactics\n- Customer retention\n\n### Business Strategy\n- Market expansion\n- New product lines\n- Partnership opportunities\n- Competitive positioning\n- Resource allocation\n\n## Tools & Platforms\n\n### Research Tools\n- Survey platforms (Qualtrics, SurveyMonkey)\n- Analytics platforms (Google Analytics, Mixpanel)\n- Social listening tools (Brandwatch, Sprout Social)\n- Customer feedback tools (Zendesk, Delighted)\n- Heat mapping (Hotjar, Crazy Egg)\n\n### Analysis Tools\n- Statistical software (SPSS, R)\n- Data visualization (Tableau, Power BI)\n- Qualitative analysis (NVivo, Atlas.ti)\n- Customer journey mapping tools\n\n## Challenges\n\n### Bias in Research\n- Sampling bias\n- Response bias\n- Confirmation bias\n- Social desirability bias\n- Researcher bias\n\n### Solutions\n- Rigorous methodology\n- Large, representative samples\n- Multiple data sources\n- Blind analysis\n- Peer review\n- Continuous validation\n\n## Analysis Framework\n\n### Key Metrics\n- Customer satisfaction (CSAT)\n- Net Promoter Score (NPS)\n- Customer effort score (CES)\n- Churn rate\n- Lifetime value\n- Acquisition cost\n\n### Persona Development\n- Demographic profile\n- Goals and motivations\n- Pain points\n- Preferred channels\n- Decision criteria\n- Buying behavior\n\n## Learning Resources\n- \"Predictably Irrational\" by Dan Ariely\n- \"The Lean Product Playbook\" by Dan Olsen\n- \"Jobs to Be Done\" by Clayton Christensen\n- Market research courses\n- Industry reports and case studies\n\n## Best Practices\n- Start with clear research objectives\n- Use multiple data collection methods\n- Ensure representative sampling\n- Validate findings across sources\n- Document methodology thoroughly\n- Update insights regularly\n- Share findings across organization\n- Focus on actionable insights\n- Consider context and nuance\n- Maintain ethical research standards");
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
