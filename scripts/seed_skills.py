#!/usr/bin/env python3
"""Populate PocketBase skills collection with real content."""

import json
import urllib.request
import urllib.error

BASE = "http://localhost:8080/hcgi/platform/api"

def api(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# --- Auth ---
auth = api("POST", "/collections/_superusers/auth-with-password",
           {"identity": "admin@kaushalstack.local", "password": "Admin1234!"})
TOKEN = auth["token"]
print("Authenticated as superuser")

# ---------------------------------------------------------------------------
# Skills to UPDATE (existing 18) — mapped by current name → new data
# ---------------------------------------------------------------------------
UPDATES = {
    "Java Programming": {
        "name": "Java Programming",
        "description": "Master Java from the ground up: object-oriented programming, generics, collections framework, and multithreading. Build real-world console and web applications while learning industry best practices like SOLID principles and design patterns.",
        "category": "Tech",
        "agent_name": "Arjun Sharma",
        "associated_tech_skills": "Spring Boot, Maven, JUnit, IntelliJ IDEA",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=eIrMbAQSU34",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=GoXwIVyNvX0",
    },
    "Node.js Backend Development": {
        "name": "Node.js Backend Development",
        "description": "Build high-performance server-side applications with Node.js and Express. Learn asynchronous programming, REST API design, middleware, authentication with JWT, and database integration with MongoDB. Deploy your API to production.",
        "category": "Tech",
        "agent_name": "Priya Nair",
        "associated_tech_skills": "Express.js, MongoDB, JWT, REST APIs, npm",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=Oe421EPjeBE",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=f2EqECiTBL8",
    },
    "Python Data Science": {
        "name": "Python Data Science",
        "description": "Explore data analysis, visualization, and machine learning with Python's ecosystem. Learn pandas for data wrangling, matplotlib and seaborn for visualization, and scikit-learn for building predictive models. Work through real datasets from Kaggle.",
        "category": "Tech",
        "agent_name": "Rohan Mehta",
        "associated_tech_skills": "Pandas, NumPy, Scikit-learn, Matplotlib, Jupyter",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=ua-CiDNNj30",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=vmEHCJofslg",
    },
    "React Frontend Development": {
        "name": "React Frontend Development",
        "description": "Build dynamic, component-driven UIs with React 18. Master hooks (useState, useEffect, useContext), state management with Redux Toolkit, React Router for navigation, and data fetching with React Query. Build a full CRUD application by the end.",
        "category": "Tech",
        "agent_name": "Sneha Kapoor",
        "associated_tech_skills": "React 18, Redux Toolkit, React Router, Tailwind CSS",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=bMknfKXIFA8",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=I6ypD7qv3Z8",
    },
    "TypeScript Advanced Patterns": {
        "name": "TypeScript Advanced Patterns",
        "description": "Go beyond the basics of TypeScript. Learn advanced types (conditional, mapped, template literal), generics with constraints, decorators, module augmentation, and how to type complex real-world scenarios. Covers strict mode best practices and performance considerations.",
        "category": "Tech",
        "agent_name": "Vikram Iyer",
        "associated_tech_skills": "TypeScript 5, Zod, tRPC, ts-node",
        "difficulty_level": "Advanced",
        "video_url": "https://www.youtube.com/watch?v=30LWjhZzg50",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=WlxcujsvcIY",
    },
    "Go Programming Language": {
        "name": "Go Programming Language",
        "description": "Learn Go (Golang) from scratch: syntax, goroutines, channels, interfaces, and the standard library. Build concurrent CLI tools, REST APIs with the net/http package, and explore Go's unique approach to error handling and composition.",
        "category": "Tech",
        "agent_name": "Ananya Gupta",
        "associated_tech_skills": "Go stdlib, Goroutines, Channels, Gin, GORM",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=un6ZyFkqFKo",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=YS4e4q9oBaU",
    },
    "Rust Systems Programming": {
        "name": "Rust Systems Programming",
        "description": "Understand Rust's ownership model, borrowing, and lifetimes — the foundation of memory safety without a garbage collector. Learn enums, pattern matching, traits, error handling with Result, and build a command-line application and a basic web server.",
        "category": "Tech",
        "agent_name": "Karthik Rao",
        "associated_tech_skills": "Rust, Cargo, Actix-web, Tokio, Clippy",
        "difficulty_level": "Advanced",
        "video_url": "https://www.youtube.com/watch?v=BpPEoZW5IiY",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=zF34dRivLOw",
    },
    "Docker Containerization": {
        "name": "Docker Containerization",
        "description": "Learn Docker from the ground up: images, containers, Dockerfiles, volumes, and networking. Understand multi-stage builds, Docker Compose for local development, and best practices for production-ready container images. Containerize a full-stack application end-to-end.",
        "category": "Tech",
        "agent_name": "Divya Pillai",
        "associated_tech_skills": "Docker, Docker Compose, Dockerfile, Container Registry",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=3c-iBn73dDE",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=pg19Z8LL06w",
    },
    "Kubernetes Orchestration": {
        "name": "Kubernetes Orchestration",
        "description": "Master Kubernetes for deploying, scaling, and managing containerized workloads. Learn Pods, Deployments, Services, ConfigMaps, Secrets, Ingress, and Helm charts. Set up a local cluster with minikube and deploy a microservices application.",
        "category": "Tech",
        "agent_name": "Rahul Verma",
        "associated_tech_skills": "Kubernetes, kubectl, Helm, minikube, YAML",
        "difficulty_level": "Advanced",
        "video_url": "https://www.youtube.com/watch?v=X48VuDVv0do",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=s_o8dwzRlu4",
    },
    "Indian Cuisine Basics": {
        "name": "Indian Cuisine Basics",
        "description": "Unlock the flavors of Indian cooking. Learn the essential spice blend techniques (tadka, tempering), how to make staples like dal, sabzi, and rice dishes, and the building blocks of North and South Indian cooking. Perfect for complete beginners in the kitchen.",
        "category": "Cooking",
        "agent_name": "Meera Krishnamurthy",
        "associated_tech_skills": "Spice blending, Pressure cooking, Tempering",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=1crr-29QkXY",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=PfMfCDGa0ow",
    },
    "Market Trend Analysis": {
        "name": "Market Trend Analysis",
        "description": "Learn to identify, validate, and act on market trends using data-driven techniques. Covers PESTLE analysis, Google Trends, SEMrush, industry report interpretation, and building a trend-watching dashboard. Apply frameworks used by product managers and strategy consultants.",
        "category": "Market Research",
        "agent_name": "Nisha Agarwal",
        "associated_tech_skills": "Google Trends, SEMrush, Excel, Tableau, PESTLE",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=cF3yVEG1EcQ",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=Gvr3UAa-M7Q",
    },
    "Social Media Sentiment Analysis": {
        "name": "Social Media Sentiment Analysis",
        "description": "Use Python and NLP to analyse the sentiment of social media posts at scale. Build a pipeline that ingests tweets, runs VADER and BERT-based sentiment classifiers, and visualises results on a live dashboard. Covers data collection, cleaning, and model evaluation.",
        "category": "Social Feed Analysis",
        "agent_name": "Akash Joshi",
        "associated_tech_skills": "Python, NLTK, Transformers, Tweepy, Streamlit",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=QpzMWQvxXWk",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=ujId4ipkBio",
    },
    "Indian Classical Music Basics": {
        "name": "Indian Classical Music Basics",
        "description": "An introduction to Hindustani classical music: understand ragas, taalas, and the guru-shishya tradition. Learn to recognise the seven swaras (Sa Re Ga Ma Pa Dha Ni), common ragas like Yaman and Bhairav, and the basic structure of a bandish. Suitable for absolute beginners.",
        "category": "Music",
        "agent_name": "Lalitha Subramaniam",
        "associated_tech_skills": "Raga recognition, Tala, Harmonium basics",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=Mc4RBCGTaVE",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=2p6rIV1g4CM",
    },
    "Full Stack Web Development": {
        "name": "Full Stack Web Development (MERN)",
        "description": "Build complete web applications end-to-end using MongoDB, Express, React, and Node.js. Covers REST API design, authentication with JWT, file uploads, real-time features with Socket.io, and deploying to cloud platforms. Finish with a portfolio-ready project.",
        "category": "Tech",
        "agent_name": "Siddharth Bose",
        "associated_tech_skills": "MongoDB, Express, React, Node.js, Socket.io",
        "difficulty_level": "Advanced",
        "video_url": "https://www.youtube.com/watch?v=7CqJlxBYj-M",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=P7t13SGytRk",
    },
    "Cloud Architecture with AWS": {
        "name": "Cloud Architecture with AWS",
        "description": "Design and deploy scalable, fault-tolerant systems on AWS. Learn core services (EC2, S3, RDS, Lambda, VPC), IAM security best practices, infrastructure as code with Terraform, and serverless architecture patterns. Prepare for the AWS Solutions Architect Associate exam.",
        "category": "Tech",
        "agent_name": "Pooja Reddy",
        "associated_tech_skills": "AWS EC2, S3, Lambda, RDS, VPC, Terraform, IAM",
        "difficulty_level": "Advanced",
        "video_url": "https://www.youtube.com/watch?v=ulprqHHWlng",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=ZbFkJ1hVCHM",
    },
    "GraphQL API Development": {
        "name": "GraphQL API Development",
        "description": "Replace REST with flexible, client-driven data fetching using GraphQL. Learn schema design, queries, mutations, subscriptions, and resolver patterns. Build a GraphQL server with Apollo Server (Node.js), integrate with a database, and add authentication.",
        "category": "Tech",
        "agent_name": "Harish Kumar",
        "associated_tech_skills": "GraphQL, Apollo Server, Apollo Client, Prisma",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=ed8SzALpx1Q",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=BcLNfwF04Kw",
    },
    "Consumer Behavior Research": {
        "name": "Consumer Behavior Research",
        "description": "Learn the psychological and sociological factors that drive purchasing decisions. Covers Maslow's hierarchy of needs, the buyer decision process, qualitative research methods (focus groups, interviews), conjoint analysis, and how to present actionable insights to stakeholders.",
        "category": "Market Research",
        "agent_name": "Deepa Menon",
        "associated_tech_skills": "Survey design, SPSS, Conjoint analysis, Qualtrics",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=9SpFIqKOPGw",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=TbGMqOUkNsQ",
    },
    "Advanced Social Media Analytics": {
        "name": "Advanced Social Media Analytics",
        "description": "Go beyond vanity metrics. Learn attribution modelling, cohort analysis, funnel tracking across Instagram, YouTube, and LinkedIn using native analytics tools and Python. Build executive-level dashboards with Looker Studio and automate weekly reporting.",
        "category": "Social Feed Analysis",
        "agent_name": "Riya Shah",
        "associated_tech_skills": "Looker Studio, Python, Meta Insights API, LinkedIn API",
        "difficulty_level": "Advanced",
        "video_url": "https://www.youtube.com/watch?v=o_IkEyFEHU4",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=MxPUm7PDugs",
    },
}

# ---------------------------------------------------------------------------
# Brand NEW skills to INSERT
# ---------------------------------------------------------------------------
NEW_SKILLS = [
    # --- Tech ---
    {
        "name": "Git & GitHub for Developers",
        "description": "Master version control with Git: branching strategies (Gitflow, trunk-based), rebasing, cherry-picking, resolving merge conflicts, and collaborating on GitHub with pull requests, code reviews, and GitHub Actions CI/CD. Essential knowledge for any professional developer.",
        "category": "Tech",
        "agent_name": "Arjun Sharma",
        "associated_tech_skills": "Git, GitHub, GitHub Actions, CI/CD",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=RGOj5yH7evk",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=8JJ101D3knE",
    },
    {
        "name": "PostgreSQL & Database Design",
        "description": "Design normalised relational databases and write efficient SQL. Learn table relationships, indexes, query planning, transactions, window functions, and JSON columns. Practice performance tuning with EXPLAIN ANALYSE on real-world schemas.",
        "category": "Tech",
        "agent_name": "Priya Nair",
        "associated_tech_skills": "PostgreSQL, SQL, pgAdmin, indexing, query optimisation",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=qw--VYLpxG4",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=zsjvFFKOm3c",
    },
    {
        "name": "Next.js Full Stack Development",
        "description": "Build production-ready web applications with Next.js 14 App Router. Learn server components, server actions, file-based routing, ISR and SSG, image optimisation, and integrating with databases using Prisma. Deploy to Vercel with zero configuration.",
        "category": "Tech",
        "agent_name": "Sneha Kapoor",
        "associated_tech_skills": "Next.js 14, React, Prisma, Vercel, Tailwind CSS",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=wm5gMKuwSYk",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=O5cmLDVTgAs",
    },
    {
        "name": "Machine Learning with Python",
        "description": "Build your first machine learning models using scikit-learn and TensorFlow. Covers supervised (regression, classification) and unsupervised learning (clustering, PCA), model evaluation, hyperparameter tuning, and deploying a model as a REST API with FastAPI.",
        "category": "Tech",
        "agent_name": "Rohan Mehta",
        "associated_tech_skills": "Scikit-learn, TensorFlow, Keras, FastAPI, Jupyter",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=i_LwzRVP7bg",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=tPYj3fFJGjk",
    },
    {
        "name": "Linux Command Line Mastery",
        "description": "Become productive on the Linux command line. Learn file system navigation, permissions, process management, shell scripting with Bash, cron jobs, SSH, and essential tools (grep, awk, sed, curl, tmux). Build automation scripts used in real DevOps workflows.",
        "category": "Tech",
        "agent_name": "Rahul Verma",
        "associated_tech_skills": "Bash, Linux, Shell scripting, SSH, cron, systemd",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=ZtqBQ68cfJc",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=oxuRxtrO2Ag",
    },
    {
        "name": "FastAPI & Modern Python APIs",
        "description": "Build blazing-fast REST APIs with FastAPI. Learn automatic OpenAPI documentation, Pydantic validation, async endpoints, dependency injection, OAuth2 authentication, background tasks, and WebSockets. Test with pytest and deploy with Docker.",
        "category": "Tech",
        "agent_name": "Ananya Gupta",
        "associated_tech_skills": "FastAPI, Pydantic, SQLAlchemy, Alembic, pytest",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=7t2alSnE2-I",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=0sOvCWFmrtA",
    },
    {
        "name": "Cybersecurity Fundamentals",
        "description": "Understand the attacker mindset and learn to defend against it. Covers OWASP Top 10 vulnerabilities, SQL injection, XSS, CSRF, secure password storage, HTTPS and TLS, network scanning with nmap, and an introduction to penetration testing with Kali Linux.",
        "category": "Tech",
        "agent_name": "Karthik Rao",
        "associated_tech_skills": "OWASP, Kali Linux, nmap, Burp Suite, Wireshark",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=U_P23SqJaDc",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=fNzpcB7ODxQ",
    },
    # --- Cooking ---
    {
        "name": "Italian Pasta from Scratch",
        "description": "Make authentic Italian pasta entirely by hand: fresh egg dough, rolling and cutting tagliatelle, shaping ravioli, and preparing classic sauces (carbonara, cacio e pepe, amatriciana, bolognese). Learn the Italian philosophy of letting ingredients shine.",
        "category": "Cooking",
        "agent_name": "Meera Krishnamurthy",
        "associated_tech_skills": "Pasta rolling, Sauce making, Knife skills",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=QLlAaOoZOYk",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=VE4oHaGqVoA",
    },
    {
        "name": "Sourdough Bread Baking",
        "description": "Learn to bake professional-quality sourdough bread at home. Start by cultivating your own starter, then master autolyse, stretch-and-fold technique, bulk fermentation, shaping, scoring, and baking in a Dutch oven. Troubleshoot common issues like dense crumb or over-proofing.",
        "category": "Cooking",
        "agent_name": "Divya Pillai",
        "associated_tech_skills": "Fermentation, Dough shaping, Dutch oven baking",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=jJpIzr2sCDE",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=BJEHsvW2J6M",
    },
    {
        "name": "South Indian Cuisine",
        "description": "Dive deep into the rich culinary traditions of South India. Learn to make dosas, idlis, sambhar, rasam, coconut chutney, avial, and Kerala fish curry. Understand the role of curry leaves, mustard seeds, and coconut in building authentic South Indian flavours.",
        "category": "Cooking",
        "agent_name": "Lalitha Subramaniam",
        "associated_tech_skills": "Wet grinding, Fermentation, Tempering spices",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=74hBmKlxUx4",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=0_NGwU9STAA",
    },
    {
        "name": "Japanese Sushi & Sashimi",
        "description": "Learn the art of Japanese sushi from a home perspective. Master sushi rice seasoning, maki and nigiri shaping, hosomaki, uramaki (California rolls), and sashimi knife techniques. Understand fish freshness, sourcing sashimi-grade ingredients, and food safety.",
        "category": "Cooking",
        "agent_name": "Harish Kumar",
        "associated_tech_skills": "Sushi rice, Fish butchery, Rolling technique",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=I2VrgBxIg8c",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=r_TvXkBWRaI",
    },
    # --- Market Research ---
    {
        "name": "Product Market Fit Research",
        "description": "Learn to systematically find and validate product-market fit. Covers the Sean Ellis PMF survey, cohort retention analysis, NPS measurement, customer development interviews, and interpreting churn data. Build a research cadence that keeps your team aligned with real user needs.",
        "category": "Market Research",
        "agent_name": "Nisha Agarwal",
        "associated_tech_skills": "NPS surveys, Mixpanel, Amplitude, Typeform, SQL",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=0LNQxT9LvM0",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=kS-iLsAb_R8",
    },
    {
        "name": "Competitive Intelligence",
        "description": "Build a systematic process for tracking competitors. Learn to use Crunchbase, SimilarWeb, SEMrush, G2, and LinkedIn Sales Navigator for intelligence gathering. Create a competitive battlecard, SWOT analysis, and a win/loss analysis framework.",
        "category": "Market Research",
        "agent_name": "Deepa Menon",
        "associated_tech_skills": "SimilarWeb, SEMrush, Crunchbase, Excel, PowerPoint",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=67_XQKC1-Dw",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=tQ4kSBjdAqE",
    },
    # --- Social Feed Analysis ---
    {
        "name": "YouTube Channel Analytics",
        "description": "Decode the YouTube algorithm and grow a channel with data. Learn to use YouTube Studio analytics — watch time, CTR, audience retention curves, and traffic source analysis. Identify content gaps, benchmark against competitors using vidIQ, and build a data-driven content calendar.",
        "category": "Social Feed Analysis",
        "agent_name": "Akash Joshi",
        "associated_tech_skills": "YouTube Studio, vidIQ, TubeBuddy, Google Sheets",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=MFTNTFSn6F8",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=YAMvQAFBFpw",
    },
    {
        "name": "Reddit Community Research",
        "description": "Extract unfiltered consumer insights from Reddit using the PRAW API and Pushshift. Learn to scrape subreddits, identify pain points using keyword frequency analysis, track sentiment shifts over time, and build a community pulse dashboard with Streamlit.",
        "category": "Social Feed Analysis",
        "agent_name": "Riya Shah",
        "associated_tech_skills": "Python, PRAW (Reddit API), Streamlit, pandas, NLP",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=3aTCn4pxOM8",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=FdjVoOf9HN4",
    },
    # --- Music ---
    {
        "name": "Guitar for Complete Beginners",
        "description": "Pick up the guitar and play your first songs in weeks. Learn to hold the guitar correctly, tune by ear and with a tuner, master open chords (G, C, D, Em, Am), strumming patterns, and chord transitions. Finish by playing 5 popular songs you already love.",
        "category": "Music",
        "agent_name": "Vikram Iyer",
        "associated_tech_skills": "Chord shapes, Strumming, Fingerpicking, Music reading",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=BBz-Jyr23M4",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=Dh-RL_70oEg",
    },
    {
        "name": "Music Production with a DAW",
        "description": "Produce your first original track using a Digital Audio Workstation (FL Studio or Ableton). Learn beat creation, MIDI programming, audio recording, EQ and compression basics, reverb and delay, mixing layers, and exporting a mastered track ready for streaming.",
        "category": "Music",
        "agent_name": "Siddharth Bose",
        "associated_tech_skills": "FL Studio / Ableton Live, MIDI, Mixing, Mastering",
        "difficulty_level": "Intermediate",
        "video_url": "https://www.youtube.com/watch?v=FunCVMkMrSs",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=RXl9sVf1vV4",
    },
    {
        "name": "Music Theory Fundamentals",
        "description": "Understand how music works regardless of the instrument you play. Learn scales, intervals, chord construction (major, minor, diminished, augmented), the circle of fifths, chord progressions (I-IV-V, ii-V-I), and basic rhythm theory. Unlock the ability to learn any song by ear.",
        "category": "Music",
        "agent_name": "Pooja Reddy",
        "associated_tech_skills": "Scales, Chord progressions, Ear training, Notation",
        "difficulty_level": "Beginner",
        "video_url": "https://www.youtube.com/watch?v=rgaTLrZGlk0",
        "proof_of_concept_video": "https://www.youtube.com/watch?v=_eKTOMhpy28",
    },
]

# --- Fetch existing skills ---
resp = api("GET", "/collections/skills/records?perPage=50", token=TOKEN)
existing = {s["name"]: s["id"] for s in resp["items"]}
print(f"Found {len(existing)} existing skills")

# --- Update existing skills ---
updated = 0
for name, payload in UPDATES.items():
    if name in existing:
        skill_id = existing[name]
        api("PATCH", f"/collections/skills/records/{skill_id}", payload, TOKEN)
        updated += 1
        print(f"  Updated: {payload['name']}")
    else:
        print(f"  WARN: '{name}' not found, skipping update")

print(f"\nUpdated {updated} existing skills")

# --- Insert new skills ---
inserted = 0
for skill in NEW_SKILLS:
    skill["created_by"] = "system"
    api("POST", "/collections/skills/records", skill, TOKEN)
    inserted += 1
    print(f"  Inserted: {skill['name']}")

print(f"\nInserted {inserted} new skills")
print(f"\nTotal skills: {updated + inserted} updated/added")

# --- Final count ---
final = api("GET", "/collections/skills/records?perPage=1", token=TOKEN)
print(f"Total in DB: {final['totalItems']}")
