const axios = require('axios')
const { URL } = require('url')

async function preprocessURL(rawUrl) {
  // Validate URL format first
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return {
      type: 'url',
      domain: rawUrl,
      isSSL: false,
      finalUrl: rawUrl,
      redirectChain: [],
      content: `URL: ${rawUrl}\nCatatan: Format URL tidak valid.`
    }
  }

  const domain = parsed.hostname
  const isSSL = parsed.protocol === 'https:'
  let finalUrl = rawUrl
  let redirectChain = []
  let httpStatus = null
  let fetchError = null

  try {
    const res = await axios.get(rawUrl, {
      maxRedirects: 5,
      timeout: 8000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CekAja/1.0)'
      }
    })

    httpStatus = res.status
    const responseUrl = res.request?.res?.responseUrl || res.request?.responseURL || rawUrl
    if (responseUrl && responseUrl !== rawUrl) {
      finalUrl = responseUrl
      redirectChain.push(finalUrl)
    }
  } catch (err) {
    // Tetap lanjut analisis meski URL tidak bisa diakses
    fetchError = err.message
  }

  const content = [
    `URL: ${rawUrl}`,
    `Domain: ${domain}`,
    `SSL: ${isSSL}`,
    `Final URL setelah redirect: ${finalUrl}`,
    redirectChain.length > 0 ? `Redirect chain: ${redirectChain.join(' -> ')}` : null,
    httpStatus ? `HTTP Status: ${httpStatus}` : null,
    fetchError ? `Catatan: URL tidak dapat diakses (${fetchError})` : null
  ].filter(Boolean).join('\n')

  return {
    type: 'url',
    domain,
    isSSL,
    finalUrl,
    redirectChain,
    httpStatus,
    fetchError,
    content
  }
}

function preprocessText(text) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\.\,\!\?\:\;\-\/\@\#\(\)\"\']/g, '')
    .trim()

  return {
    type: 'text',
    content: cleaned,
    wordCount: cleaned.split(' ').length
  }
}

function preprocessScreenshot(buffer, mimetype) {
  return {
    type: 'screenshot',
    buffer,
    mimetype
  }
}

module.exports = { preprocessURL, preprocessText, preprocessScreenshot }