/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  // provider: 'openai' | 'anthropic' | 'google' | 'xai'
  if (!collection.fields.getByName("provider")) {
    collection.fields.add(new TextField({
      name: "provider",
      max: 20,
    }));
  }

  if (!collection.fields.getByName("byok_key_encrypted")) {
    collection.fields.add(new TextField({
      name: "byok_key_encrypted",
      max: 0,
    }));
  }

  if (!collection.fields.getByName("byok_key_last4")) {
    collection.fields.add(new TextField({
      name: "byok_key_last4",
      max: 4,
    }));
  }

  if (!collection.fields.getByName("preferred_model")) {
    collection.fields.add(new TextField({
      name: "preferred_model",
      max: 100,
    }));
  }

  app.save(collection);

  // Backfill from the openai_* columns so existing users don't lose their keys.
  // Anyone with an openai key becomes provider='openai'. Their model preference
  // copies over too. Guarded: some environments never had the legacy
  // openai_key_encrypted column, and filtering on a non-existent field aborts
  // the whole migration — so skip the backfill entirely when it's absent.
  if (!collection.fields.getByName("openai_key_encrypted")) {
    console.log("no legacy openai_key_encrypted field — skipping BYOK backfill");
    return;
  }
  const users = app.findRecordsByFilter("users", "openai_key_encrypted != ''");
  for (const u of users) {
    if (!u.get("provider")) {
      u.set("provider", "openai");
    }
    if (!u.get("byok_key_encrypted")) {
      u.set("byok_key_encrypted", u.get("openai_key_encrypted") || "");
    }
    if (!u.get("byok_key_last4")) {
      u.set("byok_key_last4", u.get("openai_key_last4") || "");
    }
    if (!u.get("preferred_model")) {
      u.set("preferred_model", u.get("preferred_openai_model") || "");
    }
    try { app.save(u); } catch (e) { console.log("backfill skipped:", e.message); }
  }
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.removeByName("provider");
    collection.fields.removeByName("byok_key_encrypted");
    collection.fields.removeByName("byok_key_last4");
    collection.fields.removeByName("preferred_model");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) return;
    throw e;
  }
})
