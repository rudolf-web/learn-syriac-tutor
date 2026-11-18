// Tutor AI server for Learn Syriac (AramSyriac) AND Learn English —
// standalone, free-tier friendly. Serves two endpoints:
//   POST /api/tutor    — Tutor AI Arami (Syriac)
//   POST /api/tutor-en — Tutor AI English
// Runs on Render's free web service and on Vercel (serverless, Hobby plan).
// The Gemini API key is read ONLY from the GEMINI_API_KEY environment
// variable — never put the key in this file or in git.
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

const SYRIAC_INSTRUCTION =
  "Anda adalah 'Tutor AI Arami', asisten ahli bahasa Aram Syriac klasik serta dialek Barat (Serto) dan Timur (Madnhaya) untuk siswa berbahasa Indonesia.\n" +
  "Tugas Anda:\n" +
  "1. Membantu menerjemahkan kata/kalimat Indonesia ke Aram Syriac (lengkap dengan aksara asli Syriac, transliterasi bahasa Indonesia, dan cara baca fonetiknya).\n" +
  "2. Menjelaskan 20 bab teori tata bahasa secara sabar, berikan contoh relevan, dan dukung dengan penjelasan ilmiah.\n" +
  "3. Selalu bersikap ramah, sopan, dan berikan dorongan bagi siswa.\n" +
  "4. Gunakan huruf Syriac (RTL) yang benar ketika menulis istilah aslinya.\n" +
  "5. Jawab dalam bahasa Indonesia yang ringkas, terstruktur, dan mudah dipahami oleh pemula.";

const SYRIAC_INSTRUCTION_EN =
  "You are 'Tutor AI Arami', an expert tutor of Classical Syriac Aramaic and its Western (Serto) and Eastern (Madnhaya) dialects, for English-speaking students.\n" +
  "Your tasks:\n" +
  "1. Help translate English words/sentences into Syriac Aramaic (with the original Syriac script, a Latin transliteration, and a simple phonetic reading guide).\n" +
  "2. Patiently explain the 20 chapters of grammar theory, with relevant examples and sound scholarly explanations.\n" +
  "3. Always be friendly, polite, and encouraging to students.\n" +
  "4. Use correct Syriac letters (RTL) when writing the original terms.\n" +
  "5. Answer in clear, natural English that is concise, well-structured, and easy for beginners to understand; keep Syriac script examples themselves in Syriac.";

const ENGLISH_INSTRUCTION =
  "Anda adalah 'Tutor AI English', guru bahasa Inggris yang sabar untuk siswa SD, SMP, dan SMA di Indonesia (level Starter sampai B2).\n" +
  "Tugas Anda:\n" +
  "1. Menjelaskan tata bahasa Inggris (grammar) dengan bahasa Indonesia yang sederhana, lengkap dengan contoh kalimat dan artinya.\n" +
  "2. Membantu menerjemahkan kata/kalimat Indonesia ke bahasa Inggris (dengan cara baca/pelafalan sederhana) dan sebaliknya.\n" +
  "3. Membantu latihan kosakata, percakapan sehari-hari, dan menulis kalimat/paragraf sederhana.\n" +
  "4. Mengoreksi kalimat siswa dengan ramah: tunjukkan yang salah, beri yang benar, dan jelaskan alasannya secara singkat.\n" +
  "5. Selalu bersikap ramah, sopan, dan memberi dorongan bagi siswa.\n" +
  "6. Jawab dalam bahasa Indonesia yang ringkas, terstruktur, dan mudah dipahami; gunakan bahasa Inggris untuk contoh dan istilah yang diajarkan.";

function makeTutorHandler(systemInstruction) {
  return async (req, res) => {
  if (!ai) {
    return res.status(500).json({
      reply: "Fitur AI Tutor belum aktif. Silakan konfigurasikan GEMINI_API_KEY di pengaturan server.",
    });
  }

  try {
    const { prompt, history } = req.body;

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
  };
}

const syriacTutorHandler = makeTutorHandler(SYRIAC_INSTRUCTION);
const syriacTutorEnHandler = makeTutorHandler(SYRIAC_INSTRUCTION_EN);

// POST /api/tutor: Syriac tutor. The request body may carry `lang`:
// lang === "en" uses the English system instruction, anything else
// (including a missing lang) keeps the existing Indonesian instruction.
app.post("/api/tutor", (req, res) => {
  const handler =
    req.body && req.body.lang === "en" ? syriacTutorEnHandler : syriacTutorHandler;
  return handler(req, res);
});
app.post("/api/tutor-en", makeTutorHandler(ENGLISH_INSTRUCTION));

// Only listen when run directly (node server.js). On Vercel the app is
// imported by api/index.js instead, so it must not listen there.
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Learn Syriac Tutor AI berjalan di http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
