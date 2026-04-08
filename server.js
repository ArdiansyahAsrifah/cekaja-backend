// Hanya load .env saat local, Render inject env otomatis
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express')
const cors = require('cors')
const { preprocessURL, preprocessText, preprocessScreenshot } = require('./lib/preprocessor.js')
const { checkContentSafety } = require('./lib/safety.js')
const { analyzeImage } = require('./lib/vision.js')
const { analyzeWithGPT } = require('./lib/gpt.js')

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '20mb' }))

app.post('/api/analyze', async (req, res) => {
  try {
    const { type, input, file, mimetype } = req.body
    let processed = null
    console.log(`[analyze] Request type: ${type}`)

    if (!type) {
      return res.status(400).json({ error: 'Tipe input tidak ditemukan. Gunakan: url, text, atau screenshot.' })
    }

    // --- Preprocess ---
    if (type === 'url') {
      if (!input) return res.status(400).json({ error: 'Input URL kosong.' })
      console.log(`[analyze] Preprocessing URL: ${input}`)
      processed = await preprocessURL(input)
      console.log(`[analyze] preprocessURL result: ${JSON.stringify(processed)}`)
    } else if (type === 'text') {
      if (!input) return res.status(400).json({ error: 'Input teks kosong.' })
      console.log(`[analyze] Preprocessing text`)
      processed = preprocessText(input)
    } else if (type === 'screenshot') {
      if (!file) return res.status(400).json({ error: 'File screenshot tidak ditemukan.' })
      console.log(`[analyze] Preprocessing screenshot`)
      const buffer = Buffer.from(file, 'base64')
      processed = preprocessScreenshot(buffer, mimetype || 'image/jpeg')
    } else {
      return res.status(400).json({ error: `Tipe tidak valid: "${type}". Gunakan: url, text, atau screenshot.` })
    }

    // --- Safety Check ---
    const textForSafety = processed.content || processed.extractedText || ''
    let safetyCheck
    try {
      safetyCheck = await checkContentSafety(textForSafety)
      console.log(`[analyze] safetyCheck result: ${JSON.stringify(safetyCheck)}`)
    } catch (safetyErr) {
      console.warn(`[analyze] Safety check failed, skipping: ${safetyErr.message}`)
      safetyCheck = { safe: true, severity: 0, categories: [] }
    }

    if (!safetyCheck.safe) {
      return res.json({
        riskScore: 95,
        category: 'Konten Berbahaya',
        findings: ['Konten mengandung materi berbahaya yang diblokir sistem keamanan.'],
        explanation: 'Input ini mengandung konten yang melanggar kebijakan keamanan.',
        education: 'Hindari menyebarkan konten yang mengandung unsur kekerasan atau kebencian.'
      })
    }

    // --- Vision (screenshot only) ---
    let contentToAnalyze = processed.content
    if (type === 'screenshot') {
      console.log(`[analyze] Running Vision OCR...`)
      try {
        const visionResult = await analyzeImage(processed.buffer, processed.mimetype)
        console.log(`[analyze] Vision result: ${JSON.stringify(visionResult)}`)
        contentToAnalyze = visionResult.content
      } catch (visionErr) {
        console.warn(`[analyze] Vision failed: ${visionErr.message}`)
        contentToAnalyze = 'Tidak dapat membaca gambar.'
      }
    }

    // --- GPT Analysis ---
    console.log(`[analyze] Sending to GPT. Content (100 chars): ${contentToAnalyze?.slice(0, 100)}`)
    const result = await analyzeWithGPT(contentToAnalyze)
    console.log(`[analyze] GPT result: ${JSON.stringify(result)}`)
    return res.json(result)

  } catch (err) {
    console.error(`[analyze] UNHANDLED ERROR: ${err.message}`)
    console.error(`[analyze] Stack: ${err.stack}`)
    return res.status(500).json({ error: 'Terjadi kesalahan server. Coba lagi.' })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 7071
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})