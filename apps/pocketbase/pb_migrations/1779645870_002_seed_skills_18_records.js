/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("skills");

  const record0 = new Record(collection);
    record0.set("name", "Java Programming");
    record0.set("description", "Master Java fundamentals including OOP, collections, and multithreading. Learn to build scalable enterprise applications with Java.");
    record0.set("category", "Tech");
    record0.set("agent_name", "Arjun");
    record0.set("associated_tech_skills", "Spring, Maven, JUnit");
    record0.set("video_url", "https://example.com/java-basics");
    record0.set("proof_of_concept_video", "https://example.com/java-poc");
    record0.set("created_by", "system");
    record0.set("difficulty_level", "Beginner");
  try {
    app.save(record0);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record1 = new Record(collection);
    record1.set("name", "Node.js Backend Development");
    record1.set("description", "Build fast and scalable server-side applications using Node.js. Learn Express.js, async/await, and RESTful API design.");
    record1.set("category", "Tech");
    record1.set("agent_name", "Priya");
    record1.set("associated_tech_skills", "Express, MongoDB, REST APIs");
    record1.set("video_url", "https://example.com/nodejs-basics");
    record1.set("proof_of_concept_video", "https://example.com/nodejs-poc");
    record1.set("created_by", "system");
    record1.set("difficulty_level", "Intermediate");
  try {
    app.save(record1);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record2 = new Record(collection);
    record2.set("name", "Python Data Science");
    record2.set("description", "Explore data analysis and visualization with Python. Learn pandas, NumPy, matplotlib, and scikit-learn for machine learning.");
    record2.set("category", "Tech");
    record2.set("agent_name", "Rohan");
    record2.set("associated_tech_skills", "Pandas, NumPy, Scikit-learn, Matplotlib");
    record2.set("video_url", "https://example.com/python-ds");
    record2.set("proof_of_concept_video", "https://example.com/python-ds-poc");
    record2.set("created_by", "system");
    record2.set("difficulty_level", "Intermediate");
  try {
    app.save(record2);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record3 = new Record(collection);
    record3.set("name", "React Frontend Development");
    record3.set("description", "Build modern, interactive user interfaces with React. Master components, hooks, state management, and performance optimization.");
    record3.set("category", "Tech");
    record3.set("agent_name", "Ananya");
    record3.set("associated_tech_skills", "Redux, React Router, Webpack");
    record3.set("video_url", "https://example.com/react-basics");
    record3.set("proof_of_concept_video", "https://example.com/react-poc");
    record3.set("created_by", "system");
    record3.set("difficulty_level", "Intermediate");
  try {
    app.save(record3);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record4 = new Record(collection);
    record4.set("name", "TypeScript Advanced Patterns");
    record4.set("description", "Deep dive into TypeScript with advanced type systems, generics, decorators, and design patterns for robust applications.");
    record4.set("category", "Tech");
    record4.set("agent_name", "Vikram");
    record4.set("associated_tech_skills", "Generics, Decorators, Type Guards");
    record4.set("video_url", "https://example.com/typescript-advanced");
    record4.set("proof_of_concept_video", "https://example.com/typescript-poc");
    record4.set("created_by", "system");
    record4.set("difficulty_level", "Advanced");
  try {
    app.save(record4);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record5 = new Record(collection);
    record5.set("name", "Go Programming Language");
    record5.set("description", "Learn Go for building concurrent, efficient systems. Master goroutines, channels, and package management.");
    record5.set("category", "Tech");
    record5.set("agent_name", "Neha");
    record5.set("associated_tech_skills", "Goroutines, Channels, Gin Framework");
    record5.set("video_url", "https://example.com/go-basics");
    record5.set("proof_of_concept_video", "https://example.com/go-poc");
    record5.set("created_by", "system");
    record5.set("difficulty_level", "Intermediate");
  try {
    app.save(record5);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record6 = new Record(collection);
    record6.set("name", "Rust Systems Programming");
    record6.set("description", "Build safe and fast systems with Rust. Learn ownership, borrowing, and memory safety without garbage collection.");
    record6.set("category", "Tech");
    record6.set("agent_name", "Aditya");
    record6.set("associated_tech_skills", "Cargo, Ownership, Pattern Matching");
    record6.set("video_url", "https://example.com/rust-basics");
    record6.set("proof_of_concept_video", "https://example.com/rust-poc");
    record6.set("created_by", "system");
    record6.set("difficulty_level", "Advanced");
  try {
    app.save(record6);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record7 = new Record(collection);
    record7.set("name", "Docker Containerization");
    record7.set("description", "Master containerization with Docker. Learn to build, deploy, and manage containerized applications efficiently.");
    record7.set("category", "Tech");
    record7.set("agent_name", "Zara");
    record7.set("associated_tech_skills", "Docker Compose, Container Registry, Networking");
    record7.set("video_url", "https://example.com/docker-basics");
    record7.set("proof_of_concept_video", "https://example.com/docker-poc");
    record7.set("created_by", "system");
    record7.set("difficulty_level", "Intermediate");
  try {
    app.save(record7);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record8 = new Record(collection);
    record8.set("name", "Kubernetes Orchestration");
    record8.set("description", "Deploy and manage containerized applications at scale with Kubernetes. Learn pods, services, deployments, and ingress.");
    record8.set("category", "Tech");
    record8.set("agent_name", "Karan");
    record8.set("associated_tech_skills", "Pods, Services, Helm, StatefulSets");
    record8.set("video_url", "https://example.com/k8s-basics");
    record8.set("proof_of_concept_video", "https://example.com/k8s-poc");
    record8.set("created_by", "system");
    record8.set("difficulty_level", "Advanced");
  try {
    app.save(record8);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record9 = new Record(collection);
    record9.set("name", "Indian Cuisine Basics");
    record9.set("description", "Learn the fundamentals of Indian cooking. Master spice blending, traditional cooking techniques, and classic recipes.");
    record9.set("category", "Cooking");
    record9.set("agent_name", "Divya");
    record9.set("associated_tech_skills", "Spice blending, Tandoor cooking, Curry preparation");
    record9.set("video_url", "https://example.com/indian-cuisine");
    record9.set("proof_of_concept_video", "https://example.com/indian-cuisine-poc");
    record9.set("created_by", "system");
    record9.set("difficulty_level", "Beginner");
  try {
    app.save(record9);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record10 = new Record(collection);
    record10.set("name", "Market Trend Analysis");
    record10.set("description", "Develop skills in analyzing market trends and consumer behavior. Learn data interpretation and forecasting techniques.");
    record10.set("category", "Market Research");
    record10.set("agent_name", "Arjun");
    record10.set("associated_tech_skills", "Data Analysis, Forecasting, Market Intelligence");
    record10.set("video_url", "https://example.com/market-trends");
    record10.set("proof_of_concept_video", "https://example.com/market-trends-poc");
    record10.set("created_by", "system");
    record10.set("difficulty_level", "Intermediate");
  try {
    app.save(record10);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record11 = new Record(collection);
    record11.set("name", "Social Media Sentiment Analysis");
    record11.set("description", "Analyze sentiment from social media data. Learn NLP techniques to understand public opinion and brand perception.");
    record11.set("category", "Social Feed Analysis");
    record11.set("agent_name", "Priya");
    record11.set("associated_tech_skills", "NLP, TextBlob, VADER, Machine Learning");
    record11.set("video_url", "https://example.com/sentiment-analysis");
    record11.set("proof_of_concept_video", "https://example.com/sentiment-poc");
    record11.set("created_by", "system");
    record11.set("difficulty_level", "Intermediate");
  try {
    app.save(record11);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record12 = new Record(collection);
    record12.set("name", "Indian Classical Music Basics");
    record12.set("description", "Introduction to Indian classical music traditions. Learn raag, taal, and basic instrument techniques.");
    record12.set("category", "Music");
    record12.set("agent_name", "Rohan");
    record12.set("associated_tech_skills", "Raag theory, Taal patterns, Vocal techniques");
    record12.set("video_url", "https://example.com/indian-music");
    record12.set("proof_of_concept_video", "https://example.com/indian-music-poc");
    record12.set("created_by", "system");
    record12.set("difficulty_level", "Beginner");
  try {
    app.save(record12);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record13 = new Record(collection);
    record13.set("name", "Full Stack Web Development");
    record13.set("description", "Complete guide to building full-stack web applications. Combine frontend, backend, and database technologies.");
    record13.set("category", "Tech");
    record13.set("agent_name", "Ananya");
    record13.set("associated_tech_skills", "MERN Stack, PostgreSQL, Deployment");
    record13.set("video_url", "https://example.com/fullstack");
    record13.set("proof_of_concept_video", "https://example.com/fullstack-poc");
    record13.set("created_by", "system");
    record13.set("difficulty_level", "Advanced");
  try {
    app.save(record13);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record14 = new Record(collection);
    record14.set("name", "Cloud Architecture with AWS");
    record14.set("description", "Design and deploy scalable cloud solutions on AWS. Learn EC2, S3, Lambda, and RDS services.");
    record14.set("category", "Tech");
    record14.set("agent_name", "Vikram");
    record14.set("associated_tech_skills", "EC2, S3, Lambda, CloudFormation");
    record14.set("video_url", "https://example.com/aws-architecture");
    record14.set("proof_of_concept_video", "https://example.com/aws-poc");
    record14.set("created_by", "system");
    record14.set("difficulty_level", "Advanced");
  try {
    app.save(record14);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record15 = new Record(collection);
    record15.set("name", "GraphQL API Development");
    record15.set("description", "Build efficient APIs with GraphQL. Learn schema design, resolvers, subscriptions, and best practices.");
    record15.set("category", "Tech");
    record15.set("agent_name", "Neha");
    record15.set("associated_tech_skills", "Apollo Server, Schema Design, Subscriptions");
    record15.set("video_url", "https://example.com/graphql");
    record15.set("proof_of_concept_video", "https://example.com/graphql-poc");
    record15.set("created_by", "system");
    record15.set("difficulty_level", "Intermediate");
  try {
    app.save(record15);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record16 = new Record(collection);
    record16.set("name", "Consumer Behavior Research");
    record16.set("description", "Understand consumer psychology and behavior patterns. Learn research methodologies and data collection techniques.");
    record16.set("category", "Market Research");
    record16.set("agent_name", "Aditya");
    record16.set("associated_tech_skills", "Survey Design, Data Collection, Analysis");
    record16.set("video_url", "https://example.com/consumer-behavior");
    record16.set("proof_of_concept_video", "https://example.com/consumer-poc");
    record16.set("created_by", "system");
    record16.set("difficulty_level", "Beginner");
  try {
    app.save(record16);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record17 = new Record(collection);
    record17.set("name", "Advanced Social Media Analytics");
    record17.set("description", "Deep dive into social media metrics and analytics. Learn engagement tracking, audience insights, and campaign analysis.");
    record17.set("category", "Social Feed Analysis");
    record17.set("agent_name", "Zara");
    record17.set("associated_tech_skills", "Analytics Tools, Data Visualization, Reporting");
    record17.set("video_url", "https://example.com/social-analytics");
    record17.set("proof_of_concept_video", "https://example.com/social-analytics-poc");
    record17.set("created_by", "system");
    record17.set("difficulty_level", "Advanced");
  try {
    app.save(record17);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }
}, (app) => {
  // Rollback: record IDs not known, manual cleanup needed
})
