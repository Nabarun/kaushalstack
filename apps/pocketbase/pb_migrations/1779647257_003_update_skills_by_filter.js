/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Java'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Java Programming\n\n## Overview\nJava is a versatile, object-oriented programming language designed for building robust, scalable enterprise applications. It runs on the Java Virtual Machine (JVM), enabling write-once-run-anywhere (WORA) capability across different platforms.\n\n## Core Concepts\n\n### Object-Oriented Programming (OOP)\n- **Classes & Objects**: Fundamental building blocks for organizing code\n- **Inheritance**: Reuse code through class hierarchies\n- **Polymorphism**: Write flexible, extensible code\n- **Encapsulation**: Hide implementation details, expose clean interfaces\n\n### Java Virtual Machine (JVM)\n- Platform-independent bytecode execution\n- Automatic memory management with garbage collection\n- Just-In-Time (JIT) compilation for performance optimization\n- Built-in security features and sandboxing\n\n## Enterprise Applications\n- **Banking Systems**: Secure transaction processing, ACID compliance\n- **E-commerce Platforms**: High-traffic, scalable systems\n- **Content Management Systems**: Complex data relationships\n- **Microservices**: Containerized, distributed architectures\n\n## Spring Framework\n- Dependency Injection for loose coupling\n- Spring Boot for rapid application development\n- Spring Data for database abstraction\n- Spring Security for authentication/authorization\n- Spring Cloud for distributed systems\n\n## Advanced Topics\n\n### Multithreading\n- Thread creation and lifecycle management\n- Synchronization and thread safety\n- Concurrent collections and utilities\n- Executor framework for thread pools\n\n### Memory Management\n- Heap vs Stack memory\n- Garbage collection algorithms\n- Memory leaks prevention\n- Performance tuning and profiling\n\n## Real-World Use Cases\n- Financial institutions for transaction processing\n- E-commerce platforms for scalability\n- Android app development\n- Big data processing with Hadoop/Spark\n\n## Learning Resources\n- Oracle Java Documentation\n- \"Effective Java\" by Joshua Bloch\n- Spring Framework official guides\n- LeetCode and HackerRank for practice\n\n## Best Practices\n- Follow SOLID principles for maintainable code\n- Use design patterns appropriately\n- Write comprehensive unit tests\n- Implement proper exception handling\n- Optimize for performance and security\n- Keep dependencies updated\n- Use static analysis tools (SonarQube, Checkstyle)");
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
