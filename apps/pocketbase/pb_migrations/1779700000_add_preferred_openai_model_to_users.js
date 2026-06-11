/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  const existing = collection.fields.getByName("preferred_openai_model");
  if (existing) {
    if (existing.type === "text") {
      return;
    }
    collection.fields.removeByName("preferred_openai_model");
  }

  collection.fields.add(new TextField({
    name: "preferred_openai_model",
    max: 100
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.removeByName("preferred_openai_model");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      return;
    }
    throw e;
  }
})
