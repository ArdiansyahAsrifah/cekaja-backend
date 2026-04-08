cat > backend/analyze/index.js << 'EOF'
const { preprocessURL, preprocessText, preprocessScreenshot } = require('../lib/preprocessor.js')
const { checkContentSafety } = require('../lib/safety.js')
const { analyzeImage } = require('../lib/vision.js')
const { analyzeWithGPT } = require('../lib/gpt.js')

module.exports = async function (context, req) {
  context.res = {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  }

  if (req.method === 'OPTIONS') {
    context.res.status = 204
    return
  }

  try {
    const type = req.body?.type || req.query?.type
    let processed = null

    if (type === 'url') {
      const { input } = req.body
      if (!input) return respond(context, 400, { error: 'Input URL kosong.' })
      processed = await preprocessURL(input)

    } else if (type === 'text') {
      const { input } = req.body
      if (!input) return respond(context, 400, { error: 'Input teks kosong.' })
      processed = preprocessText(input)

    } else if (type === 'screenshot') {
      const file = req.files?.file || req.body?.file
      if (!file) return respond(context, 400, { error: 'File screenshot tidak ditemukan.' })
      const buffer = Buffer.from(file.data || file, 'base64')
      processed = preprocessScreenshot(buffer, file.mimetype || 'image/jpeg')

    } else {
      return respond(context, 400, { error: 'Tipe tidak valid. Gunakan: url | text | screenshot' })
    }

    const safetyCheck = await checkContentSafety(
      processed.content || processed.extractedText || ''
    )

    if (!safetyCheck.safe) {
      return respond(context, 200, {
        riskScore: 95,
        category: 'Konten Berbahaya',
        findings: ['Konten mengandung materi berbahaya yang diblokir sistem keamanan.'],
        explanation: 'Input ini mengandung konten yang melanggar kebijakan keamanan dan tidak dapat diproses lebih lanjut.',
        education: 'Hindari menyebarkan atau mengklik konten yang mengandung unsur kekerasan, kebencian, atau pornografi.'
      })
    }

    let contentToAnalyze = processed.content

    if (type === 'screenshot') {
      const visionResult = await analyzeImage(processed.buffer, processed.mimetype)
      contentToAnalyze = visionResult.content
    }

    const result = await analyzeWithGPT(contentToAnalyze)
    return respond(context, 200, result)

  } catch (err) {
    context.log.error('CekAja error:', err.message)
    return respond(context, 500, { error: 'Terjadi kesalahan server. Coba lagi.' })
  }
}

function respond(context, status, body) {
  context.res = {
    ...context.res,
    status,
    body: JSON.stringify(body),
    headers: {
      ...context.res.headers,
      'Content-Type': 'application/json'
    }
  }
}
EOF