/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='TypeScript'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# TypeScript Programming\n\n## Overview\nTypeScript is a superset of JavaScript that adds static typing and advanced object-oriented features. It compiles to clean, readable JavaScript and provides excellent tooling support for large-scale applications.\n\n## Core Concepts\n\n### Static Typing\n- Type annotations for variables, functions, and classes\n- Compile-time type checking\n- Catch errors before runtime\n- Self-documenting code\n- IntelliSense and autocomplete support\n\n### Type System\n- Primitive types: string, number, boolean, null, undefined\n- Complex types: arrays, tuples, enums\n- Union and intersection types\n- Generic types for reusable components\n- Type inference for cleaner code\n\n### Compilation to JavaScript\n- Transpiles to ES5, ES6, or modern JavaScript\n- Removes type annotations\n- Generates clean, readable output\n- Source maps for debugging\n- Configurable compilation targets\n\n## Benefits for Large Codebases\n\n### Type Safety\n- Prevents type-related bugs\n- Refactoring confidence\n- Better code maintainability\n- Reduced debugging time\n\n### Developer Experience\n- Excellent IDE support\n- Real-time error detection\n- Powerful refactoring tools\n- Better code navigation\n- Comprehensive documentation\n\n## Enterprise Applications\n- Large-scale web applications\n- Microservices architectures\n- Backend services with Node.js\n- Full-stack development\n- Team collaboration on complex projects\n\n## Tooling Support\n\n### Development Tools\n- Visual Studio Code integration\n- ESLint for code quality\n- Prettier for code formatting\n- Jest for testing\n- Webpack and Vite for bundling\n\n### Build Tools\n- TypeScript compiler (tsc)\n- ts-node for direct execution\n- ts-loader for webpack\n- Babel for transpilation\n\n## Use Cases\n\n### Enterprise Development\n- Large team projects\n- Long-term maintenance\n- Complex business logic\n- API development\n\n### Framework Integration\n- Angular (built with TypeScript)\n- React with TypeScript\n- Vue 3 with TypeScript\n- Node.js backends\n\n## Learning Curve\n- Moderate learning curve for JavaScript developers\n- Steep for beginners without JavaScript knowledge\n- Gradual adoption possible\n- Excellent documentation available\n\n## Learning Resources\n- TypeScript official handbook\n- \"Programming TypeScript\" by Boris Cherny\n- Egghead.io TypeScript courses\n- Total TypeScript by Matt Pocock\n- Official TypeScript playground\n\n## Best Practices\n- Use strict mode in tsconfig.json\n- Avoid 'any' type, use proper typing\n- Create reusable type definitions\n- Use interfaces for object shapes\n- Implement proper error handling\n- Write comprehensive tests\n- Document complex types\n- Keep types DRY (Don't Repeat Yourself)\n- Use discriminated unions for type safety\n- Leverage generics for flexibility");
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
