const ENCRYPTION_SECRET = 'linai'
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function encryptApiKey(apiKey: string): string {
  if (!apiKey.startsWith('sk-')) {
    return apiKey
  }
  const text = apiKey.slice(3)
  let encrypted = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) {
      encrypted += char
    } else {
      const shift = ENCRYPTION_SECRET.charCodeAt(i % ENCRYPTION_SECRET.length)
      encrypted += ALPHABET[(idx + shift) % ALPHABET.length]
    }
  }
  return `la-${encrypted}`
}

export function decryptApiKey(encryptedApiKey: string): string {
  if (!encryptedApiKey.startsWith('la-')) {
    return encryptedApiKey
  }
  const text = encryptedApiKey.slice(3)
  let decrypted = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) {
      decrypted += char
    } else {
      const shift = ENCRYPTION_SECRET.charCodeAt(i % ENCRYPTION_SECRET.length)
      decrypted +=
        ALPHABET[(idx - shift + ALPHABET.length * 2) % ALPHABET.length]
    }
  }
  return `sk-${decrypted}`
}
