/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Baking'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Baking Mastery\n\n## Overview\nBaking is both an art and a science that combines chemistry, precision, and creativity. Understanding ingredient interactions, fermentation, and temperature control is essential for consistent, delicious results.\n\n## Chemistry of Baking\n\n### Key Chemical Reactions\n- **Maillard Reaction**: Browning of crust, flavor development\n- **Caramelization**: Sugar breakdown for sweetness and color\n- **Gluten Development**: Protein network formation for structure\n- **Fermentation**: Yeast activity producing CO2 and flavor\n- **Starch Gelatinization**: Moisture absorption and structure\n\n### Ingredient Interactions\n- Flour: Protein content affects gluten development\n- Water: Hydration levels impact texture\n- Salt: Flavor enhancement and gluten strengthening\n- Sugar: Sweetness, browning, and moisture retention\n- Fat: Tenderness, flavor, and richness\n- Leavening agents: Baking soda and powder for rise\n\n## Ingredient Ratios\n\n### Baker's Percentages\n- Flour as 100% baseline\n- All other ingredients as percentages of flour weight\n- Ensures consistency and scalability\n- Professional standard in bakeries\n\n### Common Ratios\n- Bread: 60-65% hydration\n- Cake: 100-120% hydration\n- Pastry: 40-50% hydration\n- Cookies: 50-60% hydration\n\n## Fermentation\n\n### Yeast Fermentation\n- Wild yeast and commercial yeast\n- Temperature effects on fermentation speed\n- Bulk fermentation and proofing\n- Flavor development through long fermentation\n\n### Sourdough\n- Starter maintenance and feeding\n- Microbial ecosystem\n- Sour flavor development\n- Extended fermentation benefits\n\n## Temperature Control\n\n### Oven Temperature\n- Accurate thermometer essential\n- Preheating importance\n- Hot spots and rotation\n- Steam injection for crust development\n\n### Dough Temperature\n- Desired dough temperature (DDT) calculations\n- Room temperature effects\n- Ingredient temperature management\n- Fermentation speed control\n\n## Common Mistakes\n- Inaccurate measurements\n- Overmixing or undermixing\n- Incorrect oven temperature\n- Improper proofing\n- Opening oven during baking\n- Using old leavening agents\n- Ignoring humidity effects\n\n## Essential Tools\n- Digital scale for accuracy\n- Instant-read thermometer\n- Bench scraper\n- Banneton proofing basket\n- Dutch oven for bread\n- Stand mixer or hand mixing\n- Parchment paper\n- Baking sheets and pans\n\n## Real-World Applications\n\n### Bread Baking\n- Artisan sourdough\n- Sandwich breads\n- Enriched doughs\n- Whole grain breads\n\n### Pastries\n- Croissants and laminated doughs\n- Danish pastries\n- Puff pastry\n- Choux pastry\n\n### Cakes & Desserts\n- Layer cakes\n- Cupcakes\n- Cookies\n- Tarts and pies\n\n## Learning Resources\n- \"The Bread Bible\" by Rose Levy Beranbaum\n- \"Flour Water Salt Yeast\" by Ken Forkish\n- King Arthur Baking Company guides\n- Serious Eats baking articles\n- Local baking classes\n\n## Best Practices\n- Weigh ingredients for consistency\n- Keep detailed notes on results\n- Understand your oven's characteristics\n- Invest in quality tools\n- Practice fundamental techniques\n- Be patient with fermentation\n- Maintain proper hydration\n- Use room temperature ingredients\n- Develop sensory skills\n- Continuously experiment and learn");
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
