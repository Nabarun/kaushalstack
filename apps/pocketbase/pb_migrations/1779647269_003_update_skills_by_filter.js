/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Grilling'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Grilling Expertise\n\n## Overview\nGrilling is a cooking method that combines heat management, technique, and ingredient knowledge to create flavorful, perfectly cooked food. Mastering heat control and grilling techniques is essential for consistent results.\n\n## Heat Management\n\n### Temperature Zones\n- **High Heat Zone**: 400-500\u00b0F for searing\n- **Medium Heat Zone**: 300-400\u00b0F for cooking through\n- **Low Heat Zone**: 200-300\u00b0F for slow cooking\n- **Indirect Heat**: For larger items requiring longer cooking\n\n### Temperature Control\n- Venting adjustments on charcoal grills\n- Burner control on gas grills\n- Thermometer placement\n- Preheating importance\n- Monitoring during cooking\n\n## Grilling Techniques\n\n### Direct Grilling\n- Food directly over heat source\n- Quick cooking for thin cuts\n- High heat searing\n- Vegetables and smaller items\n\n### Indirect Grilling\n- Food away from direct heat\n- Slow, even cooking\n- Large roasts and whole birds\n- Smoking and low-and-slow cooking\n\n### Reverse Sear\n- Low temperature cooking first\n- High heat searing at end\n- Perfect doneness throughout\n- Minimal overcooking\n\n### Smoking\n- Low temperature (225-275\u00b0F)\n- Smoke flavor infusion\n- Extended cooking times\n- Tender, flavorful results\n\n## Fuel Selection\n\n### Charcoal\n- **Lump Charcoal**: Pure wood, hotter, less ash\n- **Briquettes**: Consistent, longer burn time\n- **Hardwoods**: Oak, hickory, mesquite for flavor\n- **Softwoods**: Pine, cedar (avoid for food)\n\n### Wood Selection\n- **Hickory**: Strong, smoky flavor\n- **Oak**: Medium, versatile flavor\n- **Mesquite**: Intense, bold flavor\n- **Fruitwoods**: Apple, cherry for mild sweetness\n- **Alder**: Delicate, fish-friendly\n\n### Gas\n- Propane or natural gas\n- Consistent temperature\n- Quick startup\n- Less flavor than charcoal\n\n## Food Safety\n\n### Temperature Guidelines\n- Beef steaks: 125-135\u00b0F (rare to medium)\n- Chicken: 165\u00b0F internal temperature\n- Pork: 145\u00b0F with 3-minute rest\n- Fish: 145\u00b0F or opaque flesh\n- Ground meat: 160\u00b0F\n\n### Safe Practices\n- Use separate cutting boards\n- Avoid cross-contamination\n- Keep raw and cooked foods separate\n- Use meat thermometer\n- Proper food storage\n- Clean grill grates\n\n## Real-World Applications\n\n### Meat Grilling\n- Steaks and burgers\n- Chicken breasts and thighs\n- Ribs and brisket\n- Kebabs and skewers\n\n### Vegetable & Seafood\n- Grilled vegetables\n- Fish and shellfish\n- Grilled fruit\n- Vegetarian options\n\n## Essential Tools\n- Grill thermometer\n- Long-handled tongs and spatula\n- Grill brush for cleaning\n- Meat thermometer\n- Chimney starter (charcoal)\n- Grill gloves\n- Drip pan\n- Grill basket for vegetables\n\n## Challenges\n\n### Temperature Control\n- Inconsistent heat distribution\n- Weather effects (wind, cold)\n- Fuel management\n- Flare-ups\n\n### Solutions\n- Use quality thermometers\n- Create heat zones\n- Adjust vents carefully\n- Keep lid closed\n- Use drip pans\n- Practice and experience\n\n## Learning Resources\n- \"The Art of Smoking\" by Chris Schlesinger\n- \"Mastering the Grill\" by Bobby Flay\n- BBQ competition guides\n- Online grilling communities\n- Local grilling classes\n\n## Best Practices\n- Preheat grill thoroughly\n- Use room temperature meat\n- Don't flip too frequently\n- Let meat rest after cooking\n- Keep grill clean\n- Invest in quality equipment\n- Develop sensory skills\n- Keep detailed notes\n- Experiment with different fuels\n- Practice temperature management");
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
