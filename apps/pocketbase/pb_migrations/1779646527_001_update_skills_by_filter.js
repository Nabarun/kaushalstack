/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Vue.js'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Vue.js is a progressive JavaScript framework for building user interfaces with a gentle learning curve and excellent developer experience. It combines the best aspects of React and Angular while maintaining simplicity and flexibility. Vue's reactive data binding automatically synchronizes the UI with application state, reducing boilerplate code. Its single-file components encapsulate template, script, and styles together for better organization. Vue excels at building everything from simple interactive widgets to complex single-page applications. The ecosystem includes Vue Router for navigation, Pinia for state management, and Nuxt for server-side rendering. Vue is particularly popular among startups and individual developers for its approachability, while being powerful enough for enterprise applications.");
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
