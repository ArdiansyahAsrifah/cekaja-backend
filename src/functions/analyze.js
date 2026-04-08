const { app } = require('@azure/functions')
const { preprocessURL, preprocessText, preprocessScreenshot } = require('../../lib/preprocessor.js')
const { checkContentSafety } = require('../../lib/safety.js')
const { analyzeImage } = require('../../lib/vision.js')
const { analyzeWithGPT } = require('../../lib/gpt.js')

app.http('analyze', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    }

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders }
    }

    try {
      const body = await request.json()
      const type = body?.type
      let processed = null

      context.log(`[analyze] Request type: ${type}`)

      if (!type) {
        return {
          status: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Tipe input tidak ditemukan. Gunakan: url, text, atau screenshot.' })
        }
      }

      // --- Preprocess ---
      if (type === 'url') {
        if (!body.input) {
          return {
            status: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Input URL kosong.' })
          }
        }
        context.log(`[analyze] Preprocessing URL: ${body.input}`)
        processed = await preprocessURL(body.input)
        context.log(`[analyze] preprocessURL result: ${JSON.stringify(processed)}`)

      } else if (type === 'text') {
        if (!body.input) {
          return {
            status: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Input teks kosong.' })
          }
        }
        context.log(`[analyze] Preprocessing text`)
        processed = preprocessText(body.input)
        context.log(`[analyze] preprocessText result: ${JSON.stringify(processed)}`)

      } else if (type === 'screenshot') {
        if (!body.file) {
          return {
            status: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'File screenshot tidak ditemukan.' })
          }
        }
        context.log(`[analyze] Preprocessing screenshot`)
        const buffer = Buffer.from(body.file, 'base64')
        processed = preprocessScreenshot(buffer, body.mimetype || 'image/jpeg')

      } else {
        return {
          status: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Tipe tidak valid: "${type}". Gunakan: url, text, atau screenshot.` })
        }
      }

      // --- Safety Check ---
      const textForSafety = processed.content || processed.extractedText || ''
      context.log(`[analyze] textForSafety (100 chars): ${textForSafety.slice(0, 100)}`)

      let safetyCheck
      try {
        safetyCheck = await checkContentSafety(textForSafety)
        context.log(`[analyze] safetyCheck result: ${JSON.stringify(safetyCheck)}`)
      } catch (safetyErr) {
        context.log(`[analyze] Safety check failed, skipping: ${safetyErr.message}`)
        safetyCheck = { safe: true, severity: 0, categories: [] }
      }

      if (!safetyCheck.safe) {
        context.log(`[analyze] Content blocked by safety check`)
        return {
          status: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            riskScore: 95,
            category: 'Konten Berbahaya',
            findings: ['Konten mengandung materi berbahaya yang diblokir sistem keamanan.'],
            explanation: 'Input ini mengandung konten yang melanggar kebijakan keamanan.',
            education: 'Hindari menyebarkan konten yang mengandung unsur kekerasan atau kebencian.'
          })
        }
      }

      // --- Vision (screenshot only) ---
      let contentToAnalyze = processed.content
      if (type === 'screenshot') {
        context.log(`[analyze] Running Vision OCR...`)
        try {
          const visionResult = await analyzeImage(processed.buffer, processed.mimetype)
          context.log(`[analyze] Vision result: ${JSON.stringify(visionResult)}`)
          contentToAnalyze = visionResult.content
        } catch (visionErr) {
          context.log(`[analyze] Vision failed: ${visionErr.message}`)
          contentToAnalyze = 'Tidak dapat membaca gambar.'
        }
      }

      // --- GPT Analysis ---
      context.log(`[analyze] Sending to GPT. Content (100 chars): ${contentToAnalyze?.slice(0, 100)}`)
      const result = await analyzeWithGPT(contentToAnalyze)
      context.log(`[analyze] GPT result: ${JSON.stringify(result)}`)

      return {
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      }

    } catch (err) {
      context.log(`[analyze] UNHANDLED ERROR: ${err.message}`)
      context.log(`[analyze] Stack: ${err.stack}`)

      if (err.message?.includes('JSON')) {
        return {
          status: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Format request tidak valid. Pastikan body adalah JSON yang benar.' })
        }
      }

      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Terjadi kesalahan server. Coba lagi.' })
      }
    }
  }
})