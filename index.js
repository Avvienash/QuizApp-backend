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
  return items; // return all articles, we'll filter later
}

// Function: Shuffle options randomly and update the answer
function shuffleOptions(quizItem) {
  const options = [
    { letter: 'A', text: quizItem['Option A'] },
    { letter: 'B', text: quizItem['Option B'] },
    { letter: 'C', text: quizItem['Option C'] },
    { letter: 'D', text: quizItem['Option D'] }
  ];

  // Find the current correct answer text
  const correctAnswerLetter = quizItem.Answer;
  const correctAnswerText = quizItem[`Option ${correctAnswerLetter}`];

  // Shuffle the options array
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // Update the quiz item with shuffled options
  quizItem['Option A'] = options[0].text;
  quizItem['Option B'] = options[1].text;
  quizItem['Option C'] = options[2].text;
  quizItem['Option D'] = options[3].text;

  // Find the new letter for the correct answer
  const newCorrectAnswerIndex = options.findIndex(option => option.text === correctAnswerText);
  const newCorrectAnswerLetter = ['A', 'B', 'C', 'D'][newCorrectAnswerIndex];
  quizItem.Answer = newCorrectAnswerLetter;

  return quizItem;
}

// Function: Check if content contains inappropriate material
function containsInappropriateContent(quizItem) {
  const inappropriateKeywords = [
    'violence', 'violent', 'crime', 'criminal', 'sexual', 'sex', 'rape', 'raped', 
    'murder', 'murdered', 'kill', 'killed', 'death', 'dead', 'terrorism', 'terrorist',
    'child abuse', 'abuse', 'assault', 'attack', 'shooting', 'stabbing', 'robbery',
    'kidnap', 'torture', 'bomb', 'explosion', 'drugs', 'trafficking', 'suicide',
    'harassment', 'blackmail', 'fraud', 'scam', 'embezzlement', 'corruption'
  ];

  const textToCheck = [
    quizItem.Question,
    quizItem['Option A'],
    quizItem['Option B'], 
    quizItem['Option C'],
    quizItem['Option D']
  ].join(' ').toLowerCase();

  return inappropriateKeywords.some(keyword => textToCheck.includes(keyword));
}

// Function: Generate a single question for one article
async function generateQuestionForArticle(article) {
  const prompt = `
You are a quiz generator. 
Create **one multiple-choice question** (4 options) based on the following news article:

Title: ${article.title}
Description: ${article.description}

IMPORTANT CONTENT GUIDELINES:
- Only create questions about topics that are safe and appropriate for general audiences
- Avoid questions about violence, crime, sexual content, child abuse, murder, rape, terrorism, or other disturbing content
Use this JSON format:

{
  "Question": "string",
  "Option A": "string",
  "Option B": "string",
  "Option C": "string",
  "Option D": "string",
  "Answer": "A|B|C|D"
}

Ensure the the Answwer is randomly selected from the options A, B, C, or D.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    });

    let quizItem = JSON.parse(response.choices[0].message.content);
    
    // Randomly shuffle the options and update the answer
    quizItem = shuffleOptions(quizItem);
    
    // Attach the source URL from RSS feed
    quizItem.Source = article.link;
    return quizItem;
  } catch (e) {
    console.error("❌ Failed to generate question for article:", article.title, e);
    return null;
  }
}

// Function: Generate quiz for all articles
async function generateQuiz() {
  const articles = await fetchRSS();
  const quiz = [];
  let articleIndex = 0;
  const maxAttempts = Math.min(articles.length, 50); // Prevent infinite loop

  console.log(`📰 Found ${articles.length} articles. Generating 10 safe questions...`);

  while (quiz.length < 10 && articleIndex < maxAttempts) {
    const article = articles[articleIndex];
    console.log(`📰 Processing article ${articleIndex + 1}: ${article.title}`);
    
    const question = await generateQuestionForArticle(article);
    
    if (question) {
      // Check if the generated question contains inappropriate content
      if (containsInappropriateContent(question)) {
        console.log(`⚠️  Skipping article ${articleIndex + 1}: Contains inappropriate content`);
      } else {
        quiz.push(question);
        console.log(`✅ Added question ${quiz.length}/10 from article: ${article.title}`);
      }
    } else {
      console.log(`❌ Failed to generate question for article ${articleIndex + 1}`);
    }
    
    articleIndex++;
  }

  if (quiz.length < 10) {
    console.log(`⚠️  Only generated ${quiz.length} safe questions out of ${maxAttempts} articles processed`);
  }

  fs.writeFileSync(
    QUIZ_FILE,
    JSON.stringify({ date: new Date().toISOString().split("T")[0], questions: quiz }, null, 2)
  );
  console.log(`✅ Quiz generated with ${quiz.length} questions`);
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
