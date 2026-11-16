// Tutor AI server for Learn Syriac (AramSyriac) — standalone, free-tier friendly.
// Runs on Render's free web service. The Gemini API key is read ONLY from the
// GEMINI_API_KEY environment variable — never put the key in this file or in git.
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

// Only the Learn Syriac site (and localhost for testing) may call this server.
const ALLOWED_ORIGINS = [
  "https://rudolf-web.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Origin tidak diizinkan: " + origin));
  },
}));
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
} else {
  console.warn("Peringatan: GEMINI_API_KEY tidak dikonfigurasi. Fitur Asisten AI akan luring.");
}

// Health check (also used to wake the free Render service).
app.get("/", (req, res) => {
  res.json({ ok: true, service: "Learn Syriac Tutor AI", aiReady: !!ai });
});

app.post("/api/tutor", async (req, res) => {
  if (!ai) {
    return res.status(500).json({
      reply: "Fitur AI Tutor belum aktif. Silakan konfigurasikan GEMINI_API_KEY di pengaturan server.",
    });
  }

  try {
    const { prompt, history } = req.body;

    const systemInstruction =
      "Anda adalah 'Tutor AI Arami', asisten ahli bahasa Aram Syriac klasik serta dialek Barat (Serto) dan Timur (Madnhaya) untuk siswa berbahasa Indonesia.\n" +
      "Tugas Anda:\n" +
      "1. Membantu menerjemahkan kata/kalimat Indonesia ke Aram Syriac (lengkap dengan aksara asli Syriac, transliterasi bahasa Indonesia, dan cara baca fonetiknya).\n" +
      "2. Menjelaskan 20 bab teori tata bahasa secara sabar, berikan contoh relevan, dan dukung dengan penjelasan ilmiah.\n" +
      "3. Selalu bersikap ramah, sopan, dan berikan dorongan bagi siswa.\n" +
      "4. Gunakan huruf Syriac (RTL) yang benar ketika menulis istilah aslinya.\n" +
      "5. Jawab dalam bahasa Indonesia yang ringkas, terstruktur, dan mudah dipahami oleh pemula.";

    const formattedContents = [];
    if (history && Array.isArray(history)) {
      history.forEach((msg) => {
        formattedContents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        });
      });
    }
    formattedContents.push({ role: "user", parts: [{ text: prompt }] });

    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let replyText = "";
    let lastError = null;

    for (const modelName of modelsToTry) {
      let attempts = 0;
      const maxAttempts = 2;
      while (attempts < maxAttempts) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: formattedContents,
            config: { systemInstruction, temperature: 0.7 },
          });
          if (response && response.text) {
            replyText = response.text;
            break;
          }
        } catch (err) {
          attempts++;
          lastError = err;
          const errMsg = err.message || "";
          const isTransient =
            errMsg.includes("503") ||
            errMsg.includes("500") ||
            errMsg.includes("high demand") ||
            errMsg.includes("RESOURCE_EXHAUSTED") ||
            errMsg.includes("limit") ||
            (err.status && (err.status === 503 || err.status === 429));
          if (isTransient && attempts < maxAttempts) {
            console.warn(`Model ${modelName} sibuk/kuota habis (percobaan ${attempts}/${maxAttempts}). Menunggu 1 detik...`);
            await delay(1000);
            continue;
          }
          console.warn(`Model ${modelName} gagal (error: ${errMsg}), beralih ke cadangan...`);
          break;
        }
      }
      if (replyText) break;
    }

    if (!replyText) {
      throw lastError || new Error("Semua opsi model asisten AI tidak dapat merespons saat ini.");
    }

    res.json({ reply: replyText });
  } catch (error) {
    console.error("Kesalahan API Tutor:", error);
    res.status(500).json({
      reply: `Maaf, terjadi kendala saat menghubungi asisten AI: ${error.message || error}`,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Learn Syriac Tutor AI berjalan di http://0.0.0.0:${PORT}`);
});
