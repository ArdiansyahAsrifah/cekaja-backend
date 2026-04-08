const axios = require('axios')

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT
const KEY = process.env.AZURE_OPENAI_KEY
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT

const SYSTEM_PROMPT = `Kamu adalah sistem deteksi penipuan digital untuk masyarakat Indonesia.
Tugasmu adalah menganalisis input (URL, teks chat, atau konten dari screenshot) dan menentukan apakah input tersebut mengandung indikasi penipuan.
Selalu jawab dalam format JSON berikut — tanpa teks tambahan apapun di luar JSON:
{
  "riskScore": <angka 0-100>,
  "category": "<kategori modus: Phishing | Pinjol Ilegal | Investasi Bodong | Romance Scam | Hadiah Palsu | Malware Link | Aman | lainnya>",
  "findings": ["<temuan 1>", "<temuan 2>", ...],
  "explanation": "<penjelasan 2-3 kalimat dalam Bahasa Indonesia yang mudah dipahami orang awam>",
  "education": "<penjelasan singkat cara kerja modus ini dalam 1-2 kalimat>"
}
Panduan penilaian riskScore:
- 0–39: Aman, tidak ada indikasi penipuan
- 40–69: Mencurigakan, perlu hati-hati
- 70–100: Sangat berbahaya, kemungkinan besar penipuan`

async function analyzeWithGPT(content) {
  if (!ENDPOINT || !KEY || !DEPLOYMENT) {
    throw new Error('Azure OpenAI environment variables tidak lengkap. Cek AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT.')
  }

  const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-02-01`

  let res
  try {
    res = await axios.post(
      url,
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content }
        ],
        max_completion_tokens: 800,
        temperature: 0.1
      },
      {
        headers: {
          'api-key': KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )
  } catch (err) {
    const status = err.response?.status
    const detail = err.response?.data?.error?.message || err.message
    throw new Error(`GPT API error (${status || 'network'}): ${detail}`)
  }

  const raw = res.data.choices?.[0]?.message?.content?.trim()
  if (!raw) {
    throw new Error('GPT mengembalikan respons kosong.')
  }

  const cleaned = raw.replace(/```json|```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`GPT respons bukan JSON valid: ${cleaned.slice(0, 200)}`)
  }

  return parsed
}

module.exports = { analyzeWithGPT }