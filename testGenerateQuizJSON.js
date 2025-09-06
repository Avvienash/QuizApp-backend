// testGenerateQuizJSON.js
// Simple test file for generateQuizJSON function

const fs = require('fs');
const path = require('path');
const { generateQuizJSON } = require('./server'); // Adjust if function is exported differently

function testGenerateQuizJSON() {
    // Example input for quiz generation
    const quizData = {
        title: 'Sample Quiz',
        questions: [
            {
                question: 'What is 2 + 2?',
                options: ['3', '4', '5', '6'],
                answer: '4'
            },
            {
                question: 'What is the capital of France?',
                options: ['London', 'Berlin', 'Paris', 'Rome'],
                answer: 'Paris'
            }
        ]
    };

    // Generate quiz JSON
    const quizJSON = generateQuizJSON(quizData);
    console.log('Generated Quiz JSON:', quizJSON);

    // Optionally, write to file
    fs.writeFileSync(path.join(__dirname, 'testQuiz.json'), JSON.stringify(quizJSON, null, 2));
    console.log('Quiz JSON written to testQuiz.json');
}

testGenerateQuizJSON();
