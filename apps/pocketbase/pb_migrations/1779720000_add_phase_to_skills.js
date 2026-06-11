/// <reference path="../pb_data/types.d.ts" />
// Adds a `phase` text field to the skills collection.
// Values: 'ideation' | 'execution' | 'marketing' (empty = treated as 'ideation' at read time).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("skills");

  const existing = collection.fields.getByName("phase");
  if (existing) {
    if (existing.type === "text") return;
    collection.fields.removeByName("phase");
  }

  collection.fields.add(new TextField({
    name: "phase",
    max: 20,
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("skills");
    collection.fields.removeByName("phase");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) return;
    throw e;
  }
})
