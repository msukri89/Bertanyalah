import { searchTurath } from "../backend/turath-service.mjs";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function geminiJson(input, schema) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY belum dikonfigurasi.");

  const response = await fetch(
    `${GEMINI_URL}/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  }

  const outputText = data?.candidates?.[0]?.content?.parts
    ?.map(part => part?.text || "")
    .join("")
    .trim();

  if (!outputText) {
    throw new Error("Gemini tidak mengembalikan output terstruktur.");
  }

  return JSON.parse(outputText);
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let stage = "validasi";

  try {
    const question = String(req.body?.question || "").trim();

    if (!question) {
      return res.status(400).json({ error: "Pertanyaan kosong." });
    }

    if (question.length > 2000) {
      return res.status(413).json({ error: "Pertanyaan terlalu panjang." });
    }

    const plannerPrompt = [
      "Anda adalah perencana pencarian untuk aplikasi BERTANYALAH.",
      "Pengguna bertanya dalam bahasa Indonesia tentang fiqih atau Islam.",
      "Ubah pertanyaan menjadi 1-4 frasa pencarian TURATH dalam bahasa Arab.",
      "Gunakan istilah Arab klasik yang mungkin muncul dalam kitab.",
      "Jangan menjawab pertanyaan pengguna.",
      `Pertanyaan: ${question}`
    ].join("\n");

    stage = "Gemini membuat query Turath";
    const planned = await geminiJson(plannerPrompt, {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 4
        }
      },
      required: ["queries"],
      additionalProperties: false
    });

    const queries = planned.queries
      .filter(x => typeof x === "string" && x.trim())
      .map(x => x.trim().slice(0, 300))
      .slice(0, 4);

    if (!queries.length) {
      return res.status(422).json({
        error: "AI tidak menghasilkan query Turath."
      });
    }

    stage = "Turath mencari dan mengambil sumber";
    const sources = await searchTurath(queries);

    if (!sources.length) {
      return res.status(200).json({
        answer: "Saya belum menemukan rujukan Turath yang cukup untuk menjawab pertanyaan ini dengan aman.",
        sources: [],
        opinions: [],
        searchUsed: true,
        queries
      });
    }

    const evidence = sources.map(source => [
      `[${source.id}]`,
      `Kitab: ${source.book || "-"}`,
      `Penulis: ${source.author || "-"}`,
      `Jilid: ${source.volume || "-"}, halaman: ${source.page || "-"}`,
      `Link: ${source.link}`,
      `Teks Arab:\n${source.text.slice(0, 7000)}`
    ].join("\n")).join("\n\n---\n\n");

    const answerPrompt = [
      "Anda adalah asisten penelitian fiqih BERTANYALAH.",
      "Jawab hanya berdasarkan bukti Turath yang diberikan.",
      "Jangan mengarang kitab, penulis, halaman, kutipan, atau link.",
      "Jika bukti tidak cukup, nyatakan bahwa bukti belum cukup.",
      "Bedakan isi kitab dari penjelasan Anda.",
      "Jika ada perbedaan madzhab, tampilkan sebagai perbedaan pendapat dan kaitkan dengan sumber.",
      "Jangan mengklaim sebagai mufti dan jangan membuat fatwa pribadi.",
      `Pertanyaan pengguna: ${question}`,
      "",
      "BUKTI TURATH:",
      evidence
    ].join("\n");

    stage = "Gemini menyusun jawaban dari bukti Turath";
    const generated = await geminiJson(answerPrompt, {
      type: "object",
      properties: {
        answer: { type: "string" },
        usedSourceIds: {
          type: "array",
          items: { type: "string" },
          maxItems: 8
        }
      },
      required: ["answer", "usedSourceIds"],
      additionalProperties: false
    });

    const usedIds = generated.usedSourceIds
      .filter(id => typeof id === "string")
      .slice(0, 8);

    const usedSources = sources.filter(source => usedIds.includes(source.id));

    return res.status(200).json({
      answer: generated.answer,
      sources: usedSources.map(({ text, bookInfo, ...publicSource }) => publicSource),
      opinions: [],
      searchUsed: true,
      queries
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: `Backend gagal pada tahap: ${stage}.`,
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
