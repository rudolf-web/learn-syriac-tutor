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

// ---- SIAGA MIMI: AI journal generator ----
// POST /api/siaga — generates a Teaching Journal entry (Kurikulum Merdeka,
// Deep Learning) in English and returns it as structured JSON, so the
// SIAGA MIMI web app can fill its journal form without manual typing.
// Uses the same free Gemini key as the tutor endpoints.
const SIAGA_INSTRUCTION =
  "You are an expert Indonesian elementary school (SD) teacher writing a Teaching Journal (Jurnal Mengajar) in English, following Kurikulum Merdeka and Deep Learning (Pembelajaran Mendalam).\n" +
  "Given a subject, grade/class, topic, date and time period, write a complete journal entry for one lesson.\n" +
  "Return ONLY a JSON object, no markdown fences and no extra text, with exactly these keys:\n" +
  "{\n" +
  "  \"objectives\": \"2-3 learning objectives, each starting with 'Students are able to', separated by new lines\",\n" +
  "  \"modelMethod\": \"Model: ... Method: ... (one or two short lines)\",\n" +
  "  \"learningProcess\": \"Opening Activities (10 min): ... Main Activities (50 min): ... Closing Activities (10 min): ...\",\n" +
  "  \"assignment\": \"Homework or assignment for the students\",\n" +
  "  \"remark\": \"One short practical teaching note or reminder\"\n" +
  "}\n" +
  "Write everything in clear, simple English suitable for a Grade 6 teacher's journal. Keep each field focused and practical; do not invent student names, scores, or attendance numbers.";

function parseSiagaJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
}

app.post("/api/siaga", async (req, res) => {
  if (!ai) {
    return res.status(500).json({ ok: false, error: "Fitur AI belum aktif. Silakan konfigurasikan GEMINI_API_KEY di pengaturan server." });
  }
  const b = req.body || {};
  if (b.task !== "journal" || !b.subject) {
    return res.status(400).json({ ok: false, error: "Permintaan tidak lengkap: task harus 'journal' dan subject wajib diisi." });
  }
  const prompt =
    "Subject: " + b.subject + "\n" +
    "Class/Grade: " + (b.kelas || "-") + "\n" +
    "Topic: " + (b.topic || b.subject) + "\n" +
    "Date: " + (b.tanggal || "-") + "\n" +
    "Time period: " + (b.waktu || "-") + "\n" +
    "Write the journal entry as JSON.";
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let replyText = "";
  let lastError = null;
  for (const modelName of modelsToTry) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { systemInstruction: SIAGA_INSTRUCTION, temperature: 0.7 },
        });
        if (response && response.text) { replyText = response.text; break; }
      } catch (err) {
        attempts++;
        lastError = err;
        const errMsg = err.message || "";
        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("500") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("limit") ||
          (err.status && (err.status === 503 || err.status === 429));
        if (isTransient && attempts < 2) { await delay(1000); continue; }
        break;
      }
    }
    if (replyText) break;
  }
  if (!replyText) {
    return res.status(500).json({ ok: false, error: "Asisten AI tidak dapat merespons saat ini: " + (lastError && lastError.message ? lastError.message : "coba lagi sebentar lagi.") });
  }
  const data = parseSiagaJSON(replyText);
  if (!data) return res.json({ ok: false, error: "AI menjawab di luar format JSON.", raw: replyText });
  res.json({ ok: true, data });
});

// ---- CERIWIS: voice chat AI proxy (NVIDIA) ----
// POST /api/ceriwis — lets the Ceriwis voice-chat app talk to NVIDIA
// without every visitor needing their own API key. The key lives ONLY
// in the NVIDIA_API_KEY environment variable on the server — never in
// this file, never in the client. Body: { messages: [{role, content}...],
// model? } — model defaults to nvidia/nemotron-3.5-bolt-e4b
// (the old meta/llama-3.1-8b-instruct was retired by NVIDIA's hosted API — 410).
// Returns { ok: true, reply: "..." } or { ok: false, error: "..." }.
const CERIWIS_INSTRUCTION =
  "Kamu Ceriwis, teman ngobrol AI yang ceria, ramah, dan banyak omong (ceriwis). " +
  "Bicara dengan santai dan hangat, seperti ngobrol dengan teman. " +
  "Jawablah dalam bahasa yang dipakai pengguna — kalau pengguna berbahasa Inggris, jawablah dalam bahasa Inggris; begitu pula bahasa Arab, Mandarin, Spanyol, Prancis, dan bahasa lainnya. Jangan memaksa bahasa Indonesia. " +
  "Jawabanmu singkat saja: 1-3 kalimat, karena biasanya jawabanmu akan dibacakan. " +
  "Kalau pengguna minta jawaban tertulis (misalnya 'jawab dengan teks' atau 'tuliskan'), jawablah dengan lengkap dan rapi — boleh memakai daftar atau beberapa paragraf. " +
  "Boleh bercanda ringan. Kalau tidak tahu, katakan terus terang.";

const CERIWIS_DEFAULT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";

app.post("/api/ceriwis", async (req, res) => {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    return res.status(500).json({
      ok: false,
      error: "Key NVIDIA belum diatur di server. Tambahkan NVIDIA_API_KEY di Environment Variables pada pengaturan project Vercel, lalu redeploy.",
    });
  }
  const b = req.body || {};
  const messages = Array.isArray(b.messages) ? b.messages : [];
  const userMessages = messages
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!userMessages.length || userMessages[userMessages.length - 1].role !== "user") {
    return res.status(400).json({ ok: false, error: "Permintaan tidak lengkap: kirim messages dengan pesan user terakhir." });
  }
  const model = typeof b.model === "string" && b.model.trim() ? b.model.trim() : CERIWIS_DEFAULT_MODEL;
  // Bahasa pilihan pengguna (mis. "en-US", "ar-SA") — diteruskan dari aplikasi.
  // Kalau ada, tambahkan penegasan bahasa ke instruksi sistem.
  const LANG_NAMES = { id: "Bahasa Indonesia", en: "English", ar: "Arabic", zh: "Chinese (Mandarin)", hi: "Hindi", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", ja: "Japanese", ko: "Korean", ru: "Russian", nl: "Dutch", it: "Italian", tr: "Turkish", ms: "Bahasa Melayu" };
  const langCode = typeof b.lang === "string" ? b.lang.trim().toLowerCase() : "";
  const langName = LANG_NAMES[langCode.split("-")[0]] || langCode;
  const instruction = langName
    ? CERIWIS_INSTRUCTION + " Pengguna memilih bahasa " + langName + " — jawablah dalam bahasa itu, kecuali pengguna menulis dalam bahasa lain, ikuti bahasa pengguna."
    : CERIWIS_INSTRUCTION;
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + nvidiaKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: instruction }, ...userMessages],
        temperature: 0.8,
        max_tokens: 300,
      }),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const errJson = await response.json();
        detail = (errJson && errJson.message) || (errJson && errJson.error && errJson.error.message) || "";
      } catch (e) { /* bukan JSON, abaikan */ }
      return res.status(502).json({
        ok: false,
        error: "NVIDIA menjawab dengan error (HTTP " + response.status + ")" + (detail ? ": " + detail : ". Coba lagi sebentar lagi."),
      });
    }
    const data = await response.json();
    const reply =
      data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
        ? String(data.choices[0].message.content).trim()
        : "";
    if (!reply) {
      return res.status(502).json({ ok: false, error: "NVIDIA tidak mengembalikan jawaban. Coba lagi sebentar lagi." });
    }
    res.json({ ok: true, reply });
  } catch (error) {
    console.error("Kesalahan API Ceriwis:", error);
    res.status(502).json({ ok: false, error: "Tidak dapat menghubungi NVIDIA: " + (error.message || error) });
  }
});

// Only listen when run directly (node server.js). On Vercel the app is
// imported by api/index.js instead, so it must not listen there.
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Learn Syriac Tutor AI berjalan di http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
