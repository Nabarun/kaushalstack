/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Node.js'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Node.js Development\n\n## Overview\nNode.js is a JavaScript runtime built on Chrome's V8 engine, enabling server-side JavaScript execution. It's designed for building fast, scalable network applications with an event-driven, non-blocking I/O model.\n\n## Core Concepts\n\n### JavaScript Runtime\n- Executes JavaScript outside the browser\n- Single-threaded event loop architecture\n- V8 engine for high-performance execution\n- CommonJS and ES6 module systems\n\n### Event-Driven Architecture\n- Non-blocking I/O operations\n- Event emitters and listeners\n- Callback-based asynchronous programming\n- Efficient handling of concurrent connections\n\n### NPM Ecosystem\n- Largest package registry in the world\n- Dependency management with package.json\n- Semantic versioning for package updates\n- Scripts for automation and build processes\n\n## Asynchronous Programming\n\n### Async/Await\n- Modern syntax for handling promises\n- Cleaner, more readable code than callbacks\n- Error handling with try-catch blocks\n- Sequential and parallel execution patterns\n\n### Promises\n- Better than callback hell\n- Chainable operations\n- Error propagation\n- Promise.all() for concurrent operations\n\n## Real-World Applications\n\n### APIs & Web Services\n- RESTful API development\n- GraphQL servers\n- Real-time data endpoints\n- Microservices architecture\n\n### Real-Time Applications\n- WebSocket-based chat systems\n- Live notifications\n- Collaborative tools\n- Streaming data applications\n\n## Popular Tools & Frameworks\n\n### Express.js\n- Lightweight web framework\n- Middleware system\n- Routing and request handling\n- Template engine integration\n\n### Other Tools\n- Fastify for high-performance APIs\n- Nest.js for enterprise applications\n- Socket.io for real-time communication\n- Mongoose for MongoDB integration\n\n## Challenges\n\n### Callback Management\n- Callback hell (pyramid of doom)\n- Error handling complexity\n- Code readability issues\n- Debugging difficulties\n\n### Solutions\n- Use async/await patterns\n- Implement proper error handling\n- Use linting tools\n- Modularize code effectively\n\n## Learning Resources\n- Node.js official documentation\n- \"Node.js Design Patterns\" by Mario Casciaro\n- Express.js guide and tutorials\n- Online courses on Udemy and Coursera\n\n## Best Practices\n- Use environment variables for configuration\n- Implement proper error handling\n- Write unit and integration tests\n- Use clustering for multi-core systems\n- Monitor performance and memory usage\n- Keep dependencies updated\n- Use linting (ESLint) and formatting (Prettier)");
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
