/// <reference path="../pb_data/types.d.ts" />
// Hostinger deploy credentials, stored per-user like the BYOK provider key.
// The token is the user's hPanel API token (encrypted at rest by the API);
// "Login to Hostinger" in the Round Table saves it, and Ananya's deploy button
// is gated on its presence.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  if (!collection.fields.getByName("hostinger_token_encrypted")) {
    collection.fields.add(new TextField({
      name: "hostinger_token_encrypted",
      max: 0,
    }));
  }

  if (!collection.fields.getByName("hostinger_token_last4")) {
    collection.fields.add(new TextField({
      name: "hostinger_token_last4",
      max: 4,
    }));
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.removeByName("hostinger_token_encrypted");
    collection.fields.removeByName("hostinger_token_last4");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) return;
    throw e;
  }
})
