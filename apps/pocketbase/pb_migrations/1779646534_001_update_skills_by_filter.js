/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='AWS'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "Amazon Web Services (AWS) is the leading cloud computing platform offering over 200 services for computing, storage, databases, networking, analytics, and machine learning. AWS enables organizations to build scalable, reliable, and cost-effective applications without managing physical infrastructure. Key services include EC2 for virtual computing, S3 for object storage, RDS for managed databases, and Lambda for serverless computing. AWS's global infrastructure with multiple regions and availability zones ensures high availability and low latency. It provides tools for monitoring, logging, security, and compliance. AWS dominates the cloud market and is used by startups and enterprises alike. Proficiency in AWS is highly valuable for cloud architects, DevOps engineers, and full-stack developers.");
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
