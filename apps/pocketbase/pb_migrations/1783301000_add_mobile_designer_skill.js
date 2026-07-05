/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("skills");

  const record = new Record(collection, {
    id: "mobiledesign001",
    name: "Mobile App Design",
    description: "Priya is KaushalStack's Mobile App Designer. She produces polished HTML screen mockups for iOS/Android apps — multiple screens wrapped in phone chrome at 390px mobile viewport, using Tailwind CSS and real imagery. The output is a gallery the team reviews before Meera builds the actual Expo project.",
    category: "Tech",
    agent_name: "Priya",
    associated_tech_skills: "Mobile UI, React Native, Expo, Figma patterns, Tailwind CSS",
    created_by: "system",
    difficulty_level: "Intermediate",
    phase: "execution",
  });

  try {
    app.save(record);
    console.log("Added Mobile App Designer skill (Priya)");
  } catch (e) {
    if (e.message && (e.message.includes("Value must be unique") || e.message.includes("already exists"))) {
      console.log("Mobile design skill already exists, skipping");
    } else {
      throw e;
    }
  }
}, (app) => {
  try {
    const record = app.findRecordById("skills", "mobiledesign001");
    app.delete(record);
  } catch (e) {
    if (e.message && e.message.includes("no rows in result set")) {
      console.log("Mobile design skill not found, skipping rollback");
    } else {
      throw e;
    }
  }
});
