/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Fermentation'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Fermentation & Food Preservation\n\n## Overview\nFermentation is an ancient food preservation technique that uses beneficial microorganisms to transform food, creating unique flavors, improving digestibility, and extending shelf life. Understanding microbiology and fermentation types is essential for successful results.\n\n## Microbiology Basics\n\n### Beneficial Bacteria\n- **Lactobacillus**: Primary fermentation bacteria\n- **Pediococcus**: Secondary fermentation bacteria\n- **Leuconostoc**: Flavor and aroma development\n- **Acetobacter**: Acetic acid production\n- **Saccharomyces**: Yeast for alcohol fermentation\n\n### Fermentation Process\n- Anaerobic environment (no oxygen)\n- Bacteria consume sugars\n- Produce lactic acid as byproduct\n- Lower pH preserves food\n- Beneficial probiotics develop\n\n## Fermentation Types\n\n### Lacto-Fermentation\n- Salt-based fermentation\n- Lactic acid bacteria\n- Vegetables, fruits, dairy\n- Sauerkraut, kimchi, pickles\n- 3-30 days fermentation time\n- Tangy, complex flavors\n\n### Alcohol Fermentation\n- Yeast-based fermentation\n- Sugar to alcohol conversion\n- Beer, wine, cider, mead\n- Temperature-dependent\n- Weeks to months fermentation\n- Preservation through alcohol content\n\n### Acetic Acid Fermentation\n- Acetobacter bacteria\n- Alcohol to vinegar conversion\n- Kombucha, vinegar\n- Two-stage fermentation\n- Weeks to months\n- Sour, complex flavors\n\n## Real-World Applications\n\n### Food Preservation\n- Vegetables: Sauerkraut, kimchi, pickles\n- Fruits: Fermented jams, chutneys\n- Dairy: Yogurt, kefir, cheese\n- Grains: Sourdough, tempeh\n- Beverages: Kombucha, water kefir\n\n### Health Benefits\n- Probiotic content\n- Improved digestion\n- Enhanced nutrient absorption\n- Immune system support\n- Gut health improvement\n- Reduced inflammation\n\n## Essential Tools\n\n### Equipment\n- Glass jars (various sizes)\n- Weights to keep food submerged\n- Cheesecloth or coffee filters\n- pH strips or meter\n- Thermometer\n- Measuring spoons and cups\n- Wooden spoon\n- Labels for dating\n\n### Ingredients\n- Sea salt (non-iodized)\n- Filtered water\n- Fresh vegetables and fruits\n- Starter cultures (optional)\n- Spices and herbs\n\n## Fermentation Challenges\n\n### Contamination\n- Mold growth\n- Unwanted bacteria\n- Off-flavors\n- Spoilage\n\n### Prevention\n- Keep food submerged\n- Use proper salt ratios\n- Maintain cleanliness\n- Monitor temperature\n- Use quality ingredients\n- Proper jar sealing\n- Regular inspection\n\n## Salt Ratios\n\n### Standard Fermentation\n- 2-5% salt by weight of vegetables\n- Higher salt = slower fermentation\n- Lower salt = faster fermentation\n- Affects flavor and preservation\n\n### Calculation\n- 1 kg vegetables \u00d7 3% = 30g salt\n- Adjust based on taste preference\n- Consider vegetable water content\n\n## Temperature Control\n- Ideal range: 60-75\u00b0F (15-24\u00b0C)\n- Warmer = faster fermentation\n- Cooler = slower, more complex flavors\n- Consistency important\n- Avoid temperature fluctuations\n\n## Learning Resources\n- \"The Art of Fermentation\" by Sandor Katz\n- \"Wild Fermentation\" by Sandor Katz\n- \"Fermented Vegetables\" by Kirsten K. Shockey\n- Fermentation communities online\n- Local fermentation classes\n\n## Best Practices\n- Start with simple recipes\n- Use quality ingredients\n- Maintain proper salt ratios\n- Keep detailed notes\n- Monitor fermentation progress\n- Trust your senses\n- Be patient with timing\n- Store properly after fermentation\n- Experiment with flavors\n- Build a fermentation routine");
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
