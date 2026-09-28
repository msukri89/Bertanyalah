import { searchTurath } from "../backend/turath-service.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function openAI(input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY belum dikonfigurasi.");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);

  if (typeof data.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/i, "");
  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Pertanyaan kosong." });
    if (question.length > 2000) return res.status(413).json({ error: "Pertanyaan terlalu panjang." });

    const plannerPrompt = [
      "Anda adalah perencana pencarian untuk aplikasi BERTANYALAH.",
      "Pengguna bertanya dalam bahasa Indonesia tentang fiqih/Islam.",
      "Ubah pertanyaan menjadi 2-4 frasa pencarian TURATH dalam bahasa Arab.",
      "Gunakan istilah Arab klasik yang kemungkinan muncul dalam kitab.",
      "Jangan menjawab pertanyaan. Hanya keluarkan JSON valid: {"queries":["...","..."]}.",
      `Pertanyaan: ${question}`
    ].join("\n");

    const planned = parseJson(await openAI(plannerPrompt));
    const queries = Array.isArray(planned.queries)
      ? planned.queries.filter(x => typeof x === "string" && x.trim()).slice(0, 4)
      : [];

    if (!queries.length) {
      return res.status(422).json({ error: "AI tidak menghasilkan query Turath." });
    }

    const sources = await searchTurath(queries);

    if (!sources.length) {
      return res.status(200).json({
        answer: "Saya belum menemukan rujukan Turath yang cukup untuk menjawab pertanyaan ini dengan aman.",
        sources: [],
        searchUsed: true
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
      "Jawab pertanyaan pengguna hanya berdasarkan bukti Turath yang disediakan.",
      "Jangan mengarang kitab, penulis, halaman, kutipan, atau link.",
      "Jika bukti belum cukup untuk suatu kesimpulan, katakan bahwa bukti belum cukup.",
      "Bedakan antara kutipan/isi kitab dan penjelasan Anda.",
      "Jika terdapat perbedaan madzhab, tampilkan sebagai perbedaan pendapat dan sebutkan sumbernya.",
      "Jangan mengklaim sebagai mufti atau mengeluarkan fatwa pribadi.",
      "Keluarkan JSON valid dengan format:",
      "{"answer":"...","usedSourceIds":["S1"]}",
      "",
      `Pertanyaan pengguna: ${question}`,
      "",
      "BUKTI TURATH:",
      evidence
    ].join("\n");

    const generated = parseJson(await openAI(answerPrompt));
    const usedIds = Array.isArray(generated.usedSourceIds) ? generated.usedSourceIds : [];
    const usedSources = sources.filter(s => usedIds.includes(s.id));

    return res.status(200).json({
      answer: typeof generated.answer === "string" ? generated.answer : "Jawaban tidak berhasil disusun.",
      sources: usedSources.map(({ text, bookInfo, ...publicSource }) => publicSource),
      opinions: [],
      searchUsed: true,
      queries
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Terjadi kesalahan pada backend.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}
