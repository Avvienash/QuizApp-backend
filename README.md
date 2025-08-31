# 📰 QuizApp Backend

This is the backend service for **QuizApp**.  
It fetches news articles from RSS feeds and generates **safe, multiple-choice quiz questions** using the OpenAI API.  
The service exposes a simple JSON API that the frontend can call.

---

## 🚀 Features
- Fetches latest news from any RSS feed.
- Generates multiple-choice questions (MCQs) with 1 correct and 3 plausible wrong answers.
- Automatically filters out **inappropriate or unsafe topics** (violence, abuse, etc.).
- Supports a **debug mode** with preloaded sample quiz JSON.
- Deployable as a web service (currently set up for [Render](https://render.com)).

---

## 📦 Tech Stack
- **Node.js (ESM)**
- **Express** – Web server
- **OpenAI** – Quiz generation
- **fast-xml-parser** – RSS parsing
- **CORS** – Allow frontend access

---
