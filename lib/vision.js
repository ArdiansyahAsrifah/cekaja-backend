const axios = require('axios')

const ENDPOINT = process.env.AZURE_VISION_ENDPOINT
const KEY = process.env.AZURE_VISION_KEY

async function analyzeImage(imageBuffer, mimetype) {
  if (!ENDPOINT || !KEY) {
    console.warn('[vision] AZURE_VISION_ENDPOINT atau KEY tidak dikonfigurasi.')
    return {
      extractedText: '',
      description: '',
      content: 'Konfigurasi Vision API tidak ditemukan.'
    }
  }

  let extractedText = ''
  let description = ''

  // --- OCR ---
  try {
    const ocrRes = await axios.post(
      `${ENDPOINT}vision/v3.2/ocr?language=id&detectOrientation=true`,
      imageBuffer,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': KEY,
          'Content-Type': mimetype
        },
        timeout: 10000
      }
    )

    extractedText = ocrRes.data.regions
      ?.flatMap(r => r.lines)
      ?.flatMap(l => l.words)
      ?.map(w => w.text)
      ?.join(' ') || ''
  } catch (err) {
    console.warn(`[vision] OCR failed: ${err.message}`)
  }

  // --- Description ---
  try {
    const descRes = await axios.post(
      `${ENDPOINT}vision/v3.2/describe?maxCandidates=1&language=en`,
      imageBuffer,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': KEY,
          'Content-Type': mimetype
        },
        timeout: 10000
      }
    )

    description = descRes.data.description?.captions?.[0]?.text || ''
  } catch (err) {
    console.warn(`[vision] Description failed: ${err.message}`)
  }

  const content = [
    extractedText ? `Teks dari gambar: ${extractedText}` : 'Tidak ada teks terdeteksi.',
    description ? `Deskripsi visual: ${description}` : null
  ].filter(Boolean).join('\n')

  return { extractedText, description, content }
}

module.exports = { analyzeImage }