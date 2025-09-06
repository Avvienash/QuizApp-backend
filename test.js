import 'dotenv/config'; // Ensure OPENAI_API_KEY is loaded
import { generateQuizJSON } from './server.js';

async function testQuiz() {
  try {
    console.log("⚡ Generating 3 quiz questions for testing...\n");
    
    const quiz = await generateQuizJSON(3, undefined, true); // debug = true to use sampleQuiz
    console.log("✅ Quiz generated successfully:\n");

    console.log(`Date: ${quiz.date}\n`);
    quiz.questions.forEach((q, i) => {
      console.log(`${i + 1}. ${q.Question}`);
      console.log(`A: ${q["Option A"]}`);
      console.log(`B: ${q["Option B"]}`);
      console.log(`C: ${q["Option C"]}`);
      console.log(`D: ${q["Option D"]}`);
      console.log(`Answer: ${q.Answer}`);
      console.log(`Source: ${q.Source}\n`);
    });
  } catch (err) {
    console.error("❌ Error testing quiz generation:", err);
  }
}

testQuiz();
