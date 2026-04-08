const axios = require('axios')

const ENDPOINT = process.env.AZURE_CONTENT_SAFETY_ENDPOINT
const KEY = process.env.AZURE_CONTENT_SAFETY_KEY

async function checkContentSafety(text) {
  // Skip if env vars not configured
  if (!ENDPOINT || !KEY) {
    console.warn('[safety] AZURE_CONTENT_SAFETY_ENDPOINT atau KEY tidak dikonfigurasi, skip safety check.')
    return { safe: true, severity: 0, categories: [], skipped: true }
  }

  // Skip if text is empty
  if (!text || text.trim().length === 0) {
    return { safe: true, severity: 0, categories: [], skipped: true }
  }

  try {
    const res = await axios.post(
      `${ENDPOINT}contentsafety/text:analyze?api-version=2023-10-01`,
      {
        text: text.slice(0, 1000),
        categories: ['Hate', 'Violence', 'SelfHarm', 'Sexual'],
        outputType: 'FourSeverityLevels'
      },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': KEY,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    )

    const categories = res.data.categoriesAnalysis || []
    const maxSeverity = Math.max(...categories.map(c => c.severity || 0))

    return {
      safe: maxSeverity < 4,
      severity: maxSeverity,
      categories
    }
  } catch (err) {
    console.warn(`[safety] Safety check error: ${err.message}. Defaulting to safe.`)
    return { safe: true, severity: 0, categories: [], error: err.message }
  }
}

module.exports = { checkContentSafety }