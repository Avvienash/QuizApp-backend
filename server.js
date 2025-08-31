import express from "express";
import cors from "cors";
import generateQuizJSON from "./utils.js";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// API endpoint
app.get("/quiz", async (req, res) => {
  try {
    const n = parseInt(req.query.n) || 10;
    const rssUrl = req.query.url || "https://www.thestar.com.my/rss/News/";
    const debug = req.query.debug === "true";

    const quiz = await generateQuizJSON(n, rssUrl, debug);
    res.json(quiz);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
