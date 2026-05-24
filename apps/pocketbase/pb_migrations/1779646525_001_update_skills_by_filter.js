/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='React'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "React is a JavaScript library developed by Facebook for building dynamic, interactive user interfaces with reusable components. It uses a virtual DOM to efficiently update the UI, resulting in excellent performance and smooth user experiences. React's component-based architecture promotes code reusability, maintainability, and scalability. With JSX syntax, developers write UI logic and markup together intuitively. React powers single-page applications (SPAs) and is the foundation for frameworks like Next.js for server-side rendering. The ecosystem includes state management solutions (Redux, Zustand), routing libraries (React Router), and countless UI component libraries. React is essential for modern web development and is used by companies like Netflix, Airbnb, Instagram, and Uber.");
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
