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
    record.set("description", "# React Frontend Development\n\n## Overview\nReact is a JavaScript library for building user interfaces with reusable components. It uses a declarative approach and virtual DOM for efficient rendering, making it ideal for building dynamic, interactive web applications.\n\n## Core Concepts\n\n### Component-Based Architecture\n- Reusable UI components\n- Functional and class components\n- Component composition\n- Props for data passing\n- State management within components\n\n### Virtual DOM\n- In-memory representation of actual DOM\n- Efficient diffing algorithm\n- Minimal DOM updates\n- Improved performance\n- Reconciliation process\n\n### State Management\n- Component state with useState hook\n- Props drilling for data passing\n- Context API for global state\n- Redux for complex state management\n- Zustand for lightweight state\n\n### Hooks\n- useState for state management\n- useEffect for side effects\n- useContext for context consumption\n- useReducer for complex state logic\n- Custom hooks for reusable logic\n\n### JSX Syntax\n- HTML-like syntax in JavaScript\n- Transpiled to JavaScript function calls\n- Type-safe with TypeScript\n- Readable and maintainable\n\n## Real-World Applications\n\n### Single Page Applications (SPAs)\n- Gmail-like interfaces\n- Collaborative tools\n- Real-time dashboards\n- Progressive web apps\n\n### Use Cases\n- E-commerce platforms\n- Social media applications\n- Project management tools\n- Data visualization dashboards\n\n## Ecosystem & Tools\n\n### Redux\n- Predictable state container\n- Centralized state management\n- Time-travel debugging\n- Middleware support\n\n### Next.js\n- React framework for production\n- Server-side rendering (SSR)\n- Static site generation (SSG)\n- API routes\n- Automatic code splitting\n\n### Other Tools\n- React Router for navigation\n- Axios for HTTP requests\n- Styled Components for CSS-in-JS\n- React Query for data fetching\n\n## Common Challenges\n\n### Prop Drilling\n- Passing props through multiple levels\n- Code verbosity\n- Maintenance difficulties\n\n### Solutions\n- Use Context API\n- Implement Redux or Zustand\n- Component composition patterns\n- Custom hooks for logic extraction\n\n## Learning Resources\n- React official documentation\n- \"Learning React\" by Alex Banks and Eve Porcello\n- Scrimba React course\n- Frontend Masters courses\n- React patterns and best practices guides\n\n## Best Practices\n- Keep components small and focused\n- Use functional components with hooks\n- Implement proper error boundaries\n- Optimize performance with React.memo\n- Use keys correctly in lists\n- Write comprehensive tests\n- Follow naming conventions\n- Document component props\n- Use TypeScript for type safety\n- Implement lazy loading for code splitting");
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
