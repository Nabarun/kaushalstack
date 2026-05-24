/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Sous Vide'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Sous Vide Precision Cooking\n\n## Overview\nSous vide is a cooking technique that uses precise temperature control and vacuum sealing to cook food evenly and consistently. It produces restaurant-quality results with minimal skill required.\n\n## Core Concepts\n\n### Precision Cooking\n- Exact temperature control (\u00b10.1\u00b0C)\n- Consistent results every time\n- No guesswork or timing variations\n- Perfect doneness throughout\n- Reproducible outcomes\n\n### Vacuum Sealing\n- Removes air from bags\n- Prevents oxidation\n- Maintains moisture\n- Allows flavor infusion\n- Extends shelf life\n\n### Water Bath Temperature Control\n- Immersion circulators for heating\n- Precise temperature maintenance\n- Circulating water for even heat distribution\n- Thermal stability\n- Digital controls and timers\n\n## Equipment\n\n### Essential Tools\n- Immersion circulator (Anova, Joule)\n- Vacuum sealer or ziplock bags\n- Large pot or container\n- Thermometer for verification\n- Tongs for handling\n- Ice bath for cooling\n\n### Optional Equipment\n- Vacuum sealer machine\n- Specialized sous vide containers\n- Finishing torch for searing\n- Precision scale\n\n## Real-World Applications\n\n### Restaurant Use\n- Consistent plating\n- Batch cooking\n- Meal prep efficiency\n- Quality control\n- High-volume production\n\n### Home Cooking\n- Weeknight dinners\n- Meal preparation\n- Entertaining guests\n- Experimenting with flavors\n- Stress-free cooking\n\n## Cooking Techniques\n\n### Meat Preparation\n- Steaks: 129-135\u00b0F for perfect doneness\n- Chicken: 140-165\u00b0F depending on texture preference\n- Pork: 140-160\u00b0F for tenderness\n- Fish: 110-125\u00b0F for delicate texture\n- Lamb: 130-140\u00b0F for medium-rare\n\n### Vegetables & Sides\n- Root vegetables: 180-210\u00b0F\n- Leafy greens: 160-180\u00b0F\n- Eggs: 63-75\u00b0C for various textures\n- Grains and legumes: 180-210\u00b0F\n\n## Benefits Over Traditional Methods\n\n### Consistency\n- No overcooked edges\n- Perfect edge-to-center gradient\n- Reproducible results\n- No guessing required\n\n### Flavor\n- Moisture retention\n- Flavor concentration\n- Infusion of seasonings\n- Tender, juicy results\n\n### Convenience\n- Set and forget cooking\n- Flexible timing windows\n- Batch cooking capability\n- Meal prep friendly\n\n### Quality\n- Restaurant-quality results\n- Professional presentation\n- Minimal food waste\n- Nutritional preservation\n\n## Challenges\n\n### Texture Considerations\n- Lack of browning (requires finishing)\n- Soft exterior without searing\n- Texture differences from traditional cooking\n- Learning curve for timing\n\n### Solutions\n- Use finishing torch or pan searing\n- Proper seasoning before cooking\n- Understanding temperature-texture relationships\n- Practice and experimentation\n\n## Learning Resources\n- \"Sous Vide for Everybody\" by Douglas Baldwin\n- Serious Eats sous vide guides\n- Anova and Joule recipe apps\n- Online cooking communities\n- YouTube tutorials\n\n## Best Practices\n- Invest in quality equipment\n- Use proper vacuum sealing\n- Season before cooking\n- Finish with high heat for browning\n- Keep detailed temperature notes\n- Understand food safety guidelines\n- Experiment with timing\n- Develop finishing techniques\n- Maintain equipment properly\n- Keep ice bath ready for cooling");
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
