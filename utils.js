import OpenAI from "openai";
import { XMLParser } from "fast-xml-parser";
import sampleQuiz from './sampleQuiz.json';

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- Helper: Fetch RSS articles ---
async function fetchRSS(rssUrl) {
  const res = await fetch(rssUrl);
  const xml = await res.text();
  const parser = new XMLParser();
  const jsonObj = parser.parse(xml);

  return jsonObj.rss.channel.item.map((item) => ({
    title: item.title,
    link: item.link,
    description: item.description,
  }));
}


// --- Helper: Filter inappropriate questions ---
function containsInappropriateContent(quizItem) {
  const inappropriateKeywords = [
    "sexual assault", "rape",
    "murder", "murdered", "kill", "killed", "death", "dead",
    "child abuse", "abuse", "assault", "shooting", "stabbing",
    "kidnap", "torture", "drugs", "human trafficking", "suicide",
    "harassment"
  ];

  const textToCheck = [
    quizItem.Question,
    quizItem["Option A"],
    quizItem["Option B"],
    quizItem["Option C"],
    quizItem["Option D"]
  ].join(" ").toLowerCase().replace(/[^\w\s]/g, "");

  return inappropriateKeywords.some(keyword => textToCheck.includes(keyword));
}

// --- Helper: Generate question for an article ---
async function generateQuestionForArticle(article) {
  const prompt = `
You are a quiz generator. 
Create **one multiple-choice question** (4 options) based on the following news article:

Title: ${article.title}
Description: ${article.description}

GUIDELINES:
- Keep it safe and appropriate for general audiences.
- No questions about violence, crime, sexual content, or disturbing topics.
- Provide 1 correct answer + 3 wrong but plausible answers.

Format as JSON:
{
  "Question": "string",
  "CorrectAnswer": "string",
  "WrongAnswer1": "string",
  "WrongAnswer2": "string",
  "WrongAnswer3": "string"
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    });

    let content = response.choices[0].message.content.trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;

    let aiResponse;
    try {
      aiResponse = JSON.parse(match[0]);
    } catch (e) {
      console.error("❌ Failed to parse AI JSON:", content);
      return null;
    }

    const answers = [
      { text: aiResponse.CorrectAnswer, isCorrect: true },
      { text: aiResponse.WrongAnswer1, isCorrect: false },
      { text: aiResponse.WrongAnswer2, isCorrect: false },
      { text: aiResponse.WrongAnswer3, isCorrect: false }
    ];

    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    const correctAnswerIndex = answers.findIndex(a => a.isCorrect);
    const correctAnswerLetter = ["A", "B", "C", "D"][correctAnswerIndex];

    const quizItem = {
      Question: aiResponse.Question,
      "Option A": answers[0].text,
      "Option B": answers[1].text,
      "Option C": answers[2].text,
      "Option D": answers[3].text,
      Answer: correctAnswerLetter,
      Source: article.link
    };

    if (containsInappropriateContent(quizItem)) return null;

    return quizItem;
  } catch (err) {
    console.error("❌ Error generating question:", err);
    return null;
  }
}

// --- Retry helper ---
async function tryGenerateQuestion(article, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    const question = await generateQuestionForArticle(article);
    if (question) return question;
  }
  return null;
}

// --- Sleep helper ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// --- Main Function: Generate quiz JSON in parallel ---
export default async function generateQuizJSON(n = 10, rssUrl = "https://www.thestar.com.my/rss/News/", debug = false) {

  if (debug) {
    console.log("⚠️ Running in DEBUG mode: Using sample data.");
    await sleep(100*n); // Simulate delay to view loading screen
    return sampleQuiz;
  }
  
  const articles = await fetchRSS(rssUrl);

  // Limit to first n*2 articles to improve success rate
  const candidates = articles.slice(0, n * 2);

  const quizPromises = candidates.map(article => tryGenerateQuestion(article));
  const results = await Promise.allSettled(quizPromises);

  const quiz = results
    .filter(r => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value)
    .slice(0, n);

  return {
    date: new Date().toISOString(),
    questions: quiz
  };
}
