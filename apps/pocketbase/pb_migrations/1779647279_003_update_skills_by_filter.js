/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Data Analysis'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Data Analysis & Statistical Methods\n\n## Overview\nData analysis involves extracting meaningful insights from data through statistical methods, visualization, and interpretation. It's fundamental to informed decision-making across all industries.\n\n## Statistical Methods\n\n### Descriptive Statistics\n- Mean, median, mode\n- Standard deviation and variance\n- Distribution analysis\n- Correlation analysis\n- Frequency distributions\n- Summary statistics\n\n### Inferential Statistics\n- Hypothesis testing\n- Confidence intervals\n- Regression analysis\n- ANOVA and t-tests\n- Chi-square tests\n- Bayesian analysis\n\n### Advanced Methods\n- Time series analysis\n- Multivariate analysis\n- Factor analysis\n- Cluster analysis\n- Survival analysis\n- Causal inference\n\n## Data Visualization\n\n### Chart Types\n- Bar charts for comparisons\n- Line charts for trends\n- Scatter plots for relationships\n- Histograms for distributions\n- Box plots for outliers\n- Heat maps for patterns\n- Network diagrams\n\n### Visualization Principles\n- Clarity and simplicity\n- Appropriate chart selection\n- Color usage\n- Labeling and legends\n- Data-ink ratio\n- Avoiding misleading representations\n\n### Interactive Dashboards\n- Real-time monitoring\n- Drill-down capabilities\n- Filtering and sorting\n- KPI tracking\n- Automated alerts\n- Mobile accessibility\n\n## Tools & Technologies\n\n### Excel\n- Pivot tables\n- VLOOKUP and formulas\n- Data validation\n- Conditional formatting\n- Basic charting\n- Statistical functions\n\n### Python\n- Pandas for data manipulation\n- NumPy for numerical computing\n- Scikit-learn for machine learning\n- Matplotlib and Seaborn for visualization\n- Jupyter notebooks for analysis\n- Statsmodels for statistics\n\n### Tableau\n- Interactive dashboards\n- Real-time data connection\n- Advanced visualizations\n- Storytelling with data\n- Collaboration features\n- Mobile dashboards\n\n### Other Tools\n- Power BI for business intelligence\n- R for statistical analysis\n- SQL for data querying\n- Google Analytics for web data\n- Looker for data exploration\n\n## Real-World Applications\n\n### Business Intelligence\n- Sales analysis\n- Customer behavior\n- Operational efficiency\n- Financial performance\n- Market trends\n- Competitive analysis\n\n### Healthcare\n- Patient outcomes\n- Disease epidemiology\n- Treatment effectiveness\n- Resource allocation\n- Quality improvement\n- Predictive diagnostics\n\n### Finance\n- Risk analysis\n- Portfolio optimization\n- Fraud detection\n- Credit scoring\n- Market analysis\n- Investment decisions\n\n### Marketing\n- Campaign effectiveness\n- Customer segmentation\n- Attribution modeling\n- Churn prediction\n- Lifetime value analysis\n- A/B testing\n\n## Data Quality\n\n### Common Issues\n- Missing values\n- Outliers\n- Duplicates\n- Inconsistent formatting\n- Data entry errors\n- Measurement errors\n\n### Solutions\n- Data validation\n- Cleaning procedures\n- Imputation methods\n- Outlier detection\n- Standardization\n- Documentation\n\n## Analysis Workflow\n\n### Key Steps\n1. Define business question\n2. Gather relevant data\n3. Clean and prepare data\n4. Exploratory data analysis\n5. Statistical analysis\n6. Visualization\n7. Interpretation\n8. Communication\n9. Action and monitoring\n\n### Best Practices\n- Start with clear objectives\n- Understand data sources\n- Document assumptions\n- Validate findings\n- Consider context\n- Communicate clearly\n- Avoid overcomplication\n- Iterate and refine\n\n## Challenges\n\n### Technical Challenges\n- Large dataset handling\n- Data integration\n- Real-time processing\n- Scalability\n- Tool selection\n\n### Analytical Challenges\n- Correlation vs. causation\n- Confounding variables\n- Selection bias\n- Overfitting\n- Interpretation errors\n\n## Learning Resources\n- \"Naked Statistics\" by Charles Wheelan\n- \"Storytelling with Data\" by Cole Nussbaumer Knaflic\n- \"The Art of Statistics\" by David Spiegelhalter\n- Coursera and edX data analysis courses\n- Kaggle competitions\n- Online tutorials and documentation\n\n## Best Practices\n- Ask clear questions first\n- Understand your data\n- Use appropriate methods\n- Validate assumptions\n- Check for bias\n- Visualize effectively\n- Document thoroughly\n- Communicate findings clearly\n- Consider limitations\n- Continuously learn and improve");
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
