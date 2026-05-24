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
    record.set("description", "# Docker Containerization\n\n## Overview\nDocker is a containerization platform that packages applications and their dependencies into lightweight, portable containers. It enables consistent deployment across different environments and simplifies DevOps workflows.\n\n## Core Concepts\n\n### Containerization\n- Lightweight virtualization technology\n- Isolated application environments\n- Consistent behavior across systems\n- Efficient resource utilization\n- Fast startup times\n\n### Images vs Containers\n\n#### Docker Images\n- Read-only templates for containers\n- Built from Dockerfiles\n- Layered architecture\n- Versioning and tagging\n- Stored in registries (Docker Hub, ECR)\n\n#### Containers\n- Running instances of images\n- Isolated processes\n- Ephemeral by default\n- Can be started, stopped, and removed\n- Share host OS kernel\n\n### Docker Compose\n- Multi-container orchestration\n- YAML configuration files\n- Service definitions and networking\n- Volume management\n- Environment variable handling\n- Perfect for development and testing\n\n## DevOps Benefits\n\n### Consistency\n- Same environment from development to production\n- Eliminates \"works on my machine\" problems\n- Reproducible deployments\n- Version control for infrastructure\n\n### Scalability\n- Easy horizontal scaling\n- Load balancing\n- Container orchestration\n- Resource optimization\n\n### Efficiency\n- Reduced overhead vs virtual machines\n- Faster deployment cycles\n- Better resource utilization\n- Cost savings\n\n## Real-World Applications\n\n### CI/CD Pipelines\n- Automated testing in containers\n- Consistent build environments\n- Artifact management\n- Deployment automation\n- Integration with Jenkins, GitLab CI, GitHub Actions\n\n### Microservices Architecture\n- Independent service deployment\n- Service isolation\n- Technology diversity\n- Easy scaling of individual services\n\n### Development Workflows\n- Local development environments\n- Database and service dependencies\n- Team collaboration\n- Onboarding new developers\n\n## Challenges\n\n### Networking\n- Container-to-container communication\n- Port mapping complexity\n- DNS resolution\n- Network isolation\n\n### Solutions\n- Docker networks (bridge, host, overlay)\n- Docker Compose networking\n- Service discovery\n- Proper port configuration\n\n## Learning Resources\n- Docker official documentation\n- \"Docker Deep Dive\" by Nigel Poulton\n- Play with Docker interactive tutorials\n- Udemy Docker courses\n- Docker certification programs\n\n## Best Practices\n- Use official base images\n- Minimize layer count\n- Use .dockerignore files\n- Run containers as non-root users\n- Implement health checks\n- Use environment variables for configuration\n- Tag images with versions\n- Keep images small and focused\n- Use multi-stage builds\n- Implement proper logging\n- Regular security scanning\n- Document Dockerfile decisions");
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
