/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("skill_likes");
  collection.indexes.push("CREATE UNIQUE INDEX idx_skill_likes_skill_user ON skill_likes (skill_id, user_id)");
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("skill_likes");
  collection.indexes = collection.indexes.filter(idx => !idx.includes("idx_skill_likes_skill_user"));
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
