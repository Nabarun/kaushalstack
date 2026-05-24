/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Kubernetes'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Kubernetes (K8s) is an open-source container orchestration platform that automates deployment, scaling, and management of containerized applications. It abstracts underlying infrastructure and provides a unified platform for running containers across clusters of machines. Kubernetes handles load balancing, service discovery, rolling updates, and self-healing of failed containers automatically. It enables organizations to run microservices at scale with high availability and fault tolerance. Kubernetes supports complex deployment strategies, resource management, and networking. It's the de facto standard for container orchestration in enterprise environments and cloud platforms like AWS, Google Cloud, and Azure. Mastering Kubernetes is crucial for DevOps engineers and cloud architects managing modern distributed systems.");
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
