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
    record.set("description", "Java is a versatile, object-oriented programming language widely used for building enterprise-grade applications, Android mobile apps, and large-scale distributed systems. Known for its 'write once, run anywhere' philosophy through the Java Virtual Machine (JVM), Java excels in creating robust, scalable backend services. It features strong type safety, automatic memory management through garbage collection, and a comprehensive standard library. Java is essential for developing microservices, REST APIs, and cloud-native applications. Its mature ecosystem includes frameworks like Spring Boot, Hibernate, and Apache Kafka, making it ideal for mission-critical systems in finance, healthcare, and e-commerce sectors.");
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
