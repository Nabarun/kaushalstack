/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Docker'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Docker is a containerization platform that packages applications with all their dependencies into lightweight, portable containers. Containers ensure consistency across development, testing, and production environments, eliminating the 'works on my machine' problem. Docker images are immutable, reproducible, and can be deployed instantly across any infrastructure. It revolutionized DevOps by enabling microservices architecture, simplifying deployment pipelines, and improving resource utilization. Docker integrates seamlessly with orchestration platforms like Kubernetes for managing containerized applications at scale. It's essential for modern cloud-native development, CI/CD pipelines, and DevOps practices. Docker is used by virtually every major tech company and has become the industry standard for application containerization.");
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
