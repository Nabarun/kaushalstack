/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("skills");

  const record = new Record(collection, {
    id: "mobiledevagent1",
    name: "Mobile App Development",
    description: "Build cross-platform mobile apps with Expo and React Native in TypeScript. Scaffold production-ready iOS and Android apps from a single codebase — screens, navigation with React Navigation, state management with hooks and context, and cloud builds via EAS. Learn component architecture, TypeScript-first patterns, SafeAreaView layouts, and FlatList data rendering. Deploy to the App Store and Google Play using EAS Submit, or preview instantly on any device via Expo Go.",
    category: "Tech",
    agent_name: "Meera",
    associated_tech_skills: "Expo, React Native, TypeScript, React Navigation, EAS Build",
    created_by: "system",
    difficulty_level: "Advanced",
    phase: "execution",
  });

  try {
    app.save(record);
  } catch (e) {
    if (e.message && (e.message.includes("Value must be unique") || e.message.includes("already exists"))) {
      console.log("Mobile dev skill already exists, skipping");
    } else {
      throw e;
    }
  }
}, (app) => {
  try {
    const record = app.findRecordById("skills", "mobiledevagent1");
    app.delete(record);
  } catch (e) {
    if (e.message && e.message.includes("no rows in result set")) {
      console.log("Mobile dev skill not found, skipping rollback");
    } else {
      throw e;
    }
  }
});
