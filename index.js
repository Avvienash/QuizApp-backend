import express from "express";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import fs from "fs";
import cron from "node-cron";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 4000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const RSS_URL = "https://www.thestar.com.my/rss/News/";
const QUIZ_FILE = "today.json";

// Function: Fetch RSS articles
async function fetchRSS() {
  const res = await fetch(RSS_URL);
  const xml = await res.text();
  const json = await parseStringPromise(xml);
  const items = json.rss.channel[0].item.map((item) => ({
    title: item.title[0],
    link: item.link[0],
    description: item.description[0]
  }));
  return items.slice(0, 10); // take top 10 articles
}

// Function: Generate quiz questions
async function generateQuiz() {
  const articles = await fetchRSS();

  const prompt = `
You are a quiz generator. 
Create 10 multiple choice questions (4 options each) from today's news.
Use this strict JSON format for each question:

{
  "Question": "string",
  "Option A": "string",
  "Option B": "string",
  "Option C": "string",
  "Option D": "string",
  "Answer": "A|B|C|D",
  "Source": "article URL"
}

News Articles:
${articles.map(a => `- ${a.title}: ${a.link}`).join("\n")}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  let quiz;
  try {
    quiz = JSON.parse(response.choices[0].message.content);
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    quiz = [];
  }

  fs.writeFileSync(QUIZ_FILE, JSON.stringify({ date: new Date().toISOString().split("T")[0], questions: quiz }, null, 2));
  console.log("✅ Quiz generated for today");
}

// Daily cron at 6AM UTC
cron.schedule("0 6 * * *", generateQuiz);

// API endpoint
app.get("/api/today-quiz", (req, res) => {
  if (!fs.existsSync(QUIZ_FILE)) {
    return res.json({ message: "Quiz not ready yet" });
  }
  const quiz = JSON.parse(fs.readFileSync(QUIZ_FILE, "utf-8"));
  res.json(quiz);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // Generate quiz on first startup
  generateQuiz();
});
