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

// Function: Check if content contains inappropriate material
function containsInappropriateContent(quizItem) {
  const inappropriateKeywords = [
    'sexual assault', 'rape', 
    'murder', 'murdered', 'kill', 'killed', 'death', 'dead',
    'child abuse', 'abuse', 'assault', 'shooting', 'stabbing',
    'kidnap', 'torture', 'drugs', 'human trafficking', 'suicide',
    'harassment',
  ];

  const textToCheck = [
    quizItem.Question,
    quizItem['Option A'],
    quizItem['Option B'], 
    quizItem['Option C'],
    quizItem['Option D']
  ].join(' ').toLowerCase();

  const detectedWords = inappropriateKeywords.filter(keyword => textToCheck.includes(keyword));
  
  return {
    hasInappropriateContent: detectedWords.length > 0,
    detectedWords: detectedWords
  };
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

Create a question with exactly:
- 1 CORRECT answer based on the article content
- 3 WRONG answers that are plausible but incorrect

Use this JSON format:

{
  "Question": "string",
  "CorrectAnswer": "string",
  "WrongAnswer1": "string", 
  "WrongAnswer2": "string",
  "WrongAnswer3": "string"
}

Make sure the correct answer is factually accurate based on the article, and the wrong answers are believable but incorrect.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    });

    const aiResponse = JSON.parse(response.choices[0].message.content);
    
    // Create array of all answers with the correct one marked
    const answers = [
      { text: aiResponse.CorrectAnswer, isCorrect: true },
      { text: aiResponse.WrongAnswer1, isCorrect: false },
      { text: aiResponse.WrongAnswer2, isCorrect: false },
      { text: aiResponse.WrongAnswer3, isCorrect: false }
    ];
    
    // Shuffle the answers randomly
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }
    
    // Find which position the correct answer ended up in
    const correctAnswerIndex = answers.findIndex(answer => answer.isCorrect);
    const correctAnswerLetter = ['A', 'B', 'C', 'D'][correctAnswerIndex];
    
    // Create the final quiz item in the required format
    const quizItem = {
      "Question": aiResponse.Question,
      "Option A": answers[0].text,
      "Option B": answers[1].text,
      "Option C": answers[2].text,
      "Option D": answers[3].text,
      "Answer": correctAnswerLetter,
      "Source": article.link
    };
    
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
      const questionCheck = containsInappropriateContent(question);
      if (questionCheck.hasInappropriateContent) {
        console.log(`⚠️  Skipping article ${articleIndex + 1}: Generated question contains inappropriate content`);
        console.log(`📄 Article title: ${article.title}`);
        console.log(`❓ Generated question: ${question.Question}`);
        console.log(`🔍 Detected words: ${questionCheck.detectedWords.join(', ')}`);
      } else {
        quiz.push(question);
        console.log(`✅ Added question ${quiz.length}/10 from article: ${article.title}`);
      }
    } else {
      console.log(`❌ Failed to generate question for article ${articleIndex + 1}`);
    }
    
    articleIndex++;
  }  if (quiz.length < 10) {
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
