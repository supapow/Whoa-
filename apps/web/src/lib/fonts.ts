/**
 * Font management system for typography and vectorization.
 * Only supports and exposes real, verifiable weights with actual OpenType vector tables.
 * Eliminates fake synthetic weights, supports Google Fonts dynamic loading, and device TTF/OTF uploads.
 */
import * as opentype from 'opentype.js'

export interface FontVariant {
  weight: number
  label: string
  localPath?: string
  googleFont?: boolean
  fileBuffer?: ArrayBuffer
}

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'monospace' | 'handwriting' | 'custom'

export interface FontDefinition {
  family: string
  category: FontCategory
  source: 'bundled' | 'google' | 'custom'
  variants: FontVariant[]
  isCustom?: boolean
}

/**
 * Standard bundled & verified fonts where every listed weight has an actual underlying font file.
 */
export const SYSTEM_FONTS: FontDefinition[] = [
  {
    family: 'Manrope',
    category: 'sans-serif',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/manrope-400.ttf' },
      { weight: 600, label: 'SemiBold', localPath: '/fonts/manrope-600.ttf' },
      { weight: 700, label: 'Bold', localPath: '/fonts/manrope-700.ttf' },
      { weight: 800, label: 'ExtraBold', localPath: '/fonts/manrope-800.ttf' },
    ],
  },
  {
    family: 'IBM Plex Sans',
    category: 'sans-serif',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/ibm-plex-sans-400.ttf' },
      { weight: 700, label: 'Bold', localPath: '/fonts/ibm-plex-sans-700.ttf' },
    ],
  },
  {
    family: 'Playfair Display',
    category: 'serif',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/playfair-display-400.ttf' },
      { weight: 700, label: 'Bold', localPath: '/fonts/playfair-display-700.ttf' },
    ],
  },
  {
    family: 'Anton',
    category: 'display',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/anton.ttf' },
    ],
  },
  {
    family: 'Archivo Black',
    category: 'display',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/archivo-black.ttf' },
    ],
  },
  {
    family: 'Georgia',
    category: 'serif',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/georgia-regular.ttf' },
      { weight: 700, label: 'Bold', localPath: '/fonts/georgia-bold.ttf' },
    ],
  },
  {
    family: 'Courier New',
    category: 'monospace',
    source: 'bundled',
    variants: [
      { weight: 400, label: 'Regular', localPath: '/fonts/courier-regular.ttf' },
      { weight: 700, label: 'Bold', localPath: '/fonts/courier-bold.ttf' },
    ],
  },
]

/**
 * Curated popular Google Fonts with verifiable TTF weights for vectorization.
 */
export const POPULAR_GOOGLE_FONTS: FontDefinition[] = [
  {
    family: 'Inter',
    category: 'sans-serif',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 600, label: 'SemiBold', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
      { weight: 800, label: 'ExtraBold', googleFont: true },
    ],
  },
  {
    family: 'Roboto',
    category: 'sans-serif',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 500, label: 'Medium', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
      { weight: 900, label: 'Black', googleFont: true },
    ],
  },
  {
    family: 'Montserrat',
    category: 'sans-serif',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 600, label: 'SemiBold', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
      { weight: 900, label: 'Black', googleFont: true },
    ],
  },
  {
    family: 'Oswald',
    category: 'sans-serif',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 600, label: 'SemiBold', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
    ],
  },
  {
    family: 'Poppins',
    category: 'sans-serif',
    source: 'google',
    variants: [
      { weight: 300, label: 'Light', googleFont: true },
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 500, label: 'Medium', googleFont: true },
      { weight: 600, label: 'SemiBold', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
      { weight: 800, label: 'ExtraBold', googleFont: true },
      { weight: 900, label: 'Black', googleFont: true },
    ],
  },
  {
    family: 'Merriweather',
    category: 'serif',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
      { weight: 900, label: 'Black', googleFont: true },
    ],
  },
  {
    family: 'Cinzel',
    category: 'serif',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
    ],
  },
  {
    family: 'Bebas Neue',
    category: 'display',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
    ],
  },
  {
    family: 'Fira Code',
    category: 'monospace',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 600, label: 'SemiBold', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
    ],
  },
  {
    family: 'Space Mono',
    category: 'monospace',
    source: 'google',
    variants: [
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
    ],
  },
]

// In-memory registry of custom user-uploaded fonts and Google fonts
const customFontRegistry = new Map<string, FontDefinition>()
const fontBufferCache = new Map<string, ArrayBuffer>()
const parsedOpenTypeCache = new Map<string, opentype.Font>()
const pendingFontLoads = new Map<string, Promise<opentype.Font>>()

// Cached snapshot to satisfy React useSyncExternalStore reference stability requirement
let cachedAllFontsSnapshot: FontDefinition[] = [...SYSTEM_FONTS, ...POPULAR_GOOGLE_FONTS]

// Listeners for font registry updates
type FontListener = () => void
const fontListeners = new Set<FontListener>()

export function subscribeFonts(listener: FontListener) {
  fontListeners.add(listener)
  return () => {
    fontListeners.delete(listener)
  }
}

function updateCachedSnapshot() {
  const map = new Map<string, FontDefinition>()
  for (const f of SYSTEM_FONTS) {
    map.set(f.family.toLowerCase(), f)
  }
  for (const f of POPULAR_GOOGLE_FONTS) {
    map.set(f.family.toLowerCase(), f)
  }
  for (const f of customFontRegistry.values()) {
    const key = f.family.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      // Merge variants to eliminate duplicates
      const weightMap = new Map<number, FontVariant>()
      for (const v of existing.variants) weightMap.set(v.weight, v)
      for (const v of f.variants) weightMap.set(v.weight, v)
      const mergedVariants = Array.from(weightMap.values()).sort((a, b) => a.weight - b.weight)
      map.set(key, {
        ...existing,
        ...f,
        variants: mergedVariants,
      })
    } else {
      map.set(key, f)
    }
  }
  cachedAllFontsSnapshot = Array.from(map.values())
}

function notifyFontsChanged() {
  updateCachedSnapshot()
  fontListeners.forEach((fn) => fn())
}

/**
 * Return all registered fonts (system + Google library + uploaded custom fonts).
 * Returns a stable reference to prevent infinite re-render loops in useSyncExternalStore.
 */
export function getAllFonts(): FontDefinition[] {
  return cachedAllFontsSnapshot
}

/**
 * Look up a font definition by family name.
 */
export function findFontDefinition(family: string): FontDefinition | undefined {
  const norm = family.trim().toLowerCase()
  const found = getAllFonts().find((f) => f.family.toLowerCase() === norm)
  if (found) return found

  const cat = GOOGLE_FONTS_CATALOG.find((f) => f.family.toLowerCase() === norm)
  if (cat) {
    return {
      family: cat.family,
      category: cat.category,
      source: 'google',
      variants: cat.weights.map((w) => ({
        weight: w,
        label:
          w === 100 ? 'Thin' : w === 200 ? 'ExtraLight' : w === 300 ? 'Light' : w === 400 ? 'Regular' : w === 500 ? 'Medium' : w === 600 ? 'SemiBold' : w === 700 ? 'Bold' : w === 800 ? 'ExtraBold' : w === 900 ? 'Black' : `${w}`,
        googleFont: true,
      })),
    }
  }

  return undefined
}

/**
 * Get all real available weights for a font family.
 * Always returns at least one real weight (defaults to 400 or 700 if unknown).
 */
export function getAvailableWeightsForFont(family: string): FontVariant[] {
  const def = findFontDefinition(family)
  if (def && def.variants.length > 0) {
    const seen = new Set<number>()
    return def.variants.filter((v) => {
      if (seen.has(v.weight)) return false
      seen.add(v.weight)
      return true
    })
  }
  // Default fallback to Manrope variants
  return SYSTEM_FONTS[0].variants
}

/**
 * Given a requested weight, find the nearest actual available weight for the font.
 * Prevents phantom/faux synthetic weights.
 */
export function getClosestAvailableWeight(family: string, requestedWeight: number = 700): number {
  const variants = getAvailableWeightsForFont(family)
  if (!variants || variants.length === 0) return 400

  let closest = variants[0].weight
  let minDiff = Math.abs(closest - requestedWeight)

  for (let i = 1; i < variants.length; i++) {
    const diff = Math.abs(variants[i].weight - requestedWeight)
    if (diff < minDiff) {
      minDiff = diff
      closest = variants[i].weight
    }
  }
  return closest
}

/**
 * Inject a CSS @font-face rule into the document DOM so the browser previews it identically.
 */
export function injectFontFace(family: string, weight: number, urlOrBlob: string) {
  if (typeof document === 'undefined') return
  const id = `font-face-${family.toLowerCase().replace(/\s+/g, '-')}-${weight}`
  if (document.getElementById(id)) return

  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    @font-face {
      font-family: '${family}';
      font-weight: ${weight};
      font-style: normal;
      src: url('${urlOrBlob}') format('truetype');
      font-display: swap;
    }
  `
  document.head.appendChild(style)
}

/**
 * Dynamically fetch a real TTF/WOFF binary directly for OpenType parsing and vectorization.
 * 1. Checks internal Vite dev-server proxy endpoint (/api/font-file) which retrieves genuine full TTF from Google.
 * 2. Falls back to Fontsource CDN WOFF (opentype.js supports WOFF v1 natively).
 * 3. Falls back to Google Fonts GitHub raw repository.
 */
export async function fetchGoogleFontTTF(family: string, weight: number): Promise<ArrayBuffer | null> {
  const normFam = family.trim()
  if (!normFam) return null

  // 1. Try local dev-server proxy route (passes Android UA so Google responds with un-subsetted TTF)
  try {
    const proxyUrl = `/api/font-file?family=${encodeURIComponent(normFam)}&weight=${weight}`
    const res = await fetch(proxyUrl)
    if (res.ok) {
      const buf = await res.arrayBuffer()
      if (buf && buf.byteLength > 1000) {
        return buf
      }
    }
  } catch {
    // Continue to client-side fallbacks
  }

  // 2. Try Fontsource CDN WOFF (opentype.js natively supports WOFF v1)
  try {
    const slug = normFam.toLowerCase().replace(/[\s_]+/g, '-')
    const cdnUrl = `https://cdn.jsdelivr.net/npm/@fontsource/${slug}@5.1.1/files/${slug}-latin-${weight}-normal.woff`
    const cdnRes = await fetch(cdnUrl)
    if (cdnRes.ok) {
      const buf = await cdnRes.arrayBuffer()
      if (buf && buf.byteLength > 1000) {
        return buf
      }
    }
  } catch {
    // Continue
  }

  // 3. Try GitHub raw google/fonts repository
  try {
    const slug = normFam.toLowerCase().replace(/[\s_]+/g, '')
    const weightName =
      weight === 100 ? 'Thin' : weight === 200 ? 'ExtraLight' : weight === 300 ? 'Light' : weight === 400 ? 'Regular' : weight === 500 ? 'Medium' : weight === 600 ? 'SemiBold' : weight === 700 ? 'Bold' : weight === 800 ? 'ExtraBold' : 'Black'
    const famCamel = normFam.replace(/\s+/g, '')
    const urls = [
      `https://raw.githubusercontent.com/google/fonts/main/ofl/${slug}/${famCamel}-${weightName}.ttf`,
      `https://raw.githubusercontent.com/google/fonts/main/apache/${slug}/${famCamel}-${weightName}.ttf`,
      `https://raw.githubusercontent.com/google/fonts/main/ofl/${slug}/${famCamel}[wght].ttf`,
    ]
    for (const u of urls) {
      const ghRes = await fetch(u)
      if (ghRes.ok) {
        const buf = await ghRes.arrayBuffer()
        if (buf && buf.byteLength > 1000) return buf
      }
    }
  } catch {
    // Continue
  }

  // 4. Try Google Fonts direct CSS URL
  try {
    const famParam = normFam.replace(/\s+/g, '+')
    const query = `family=${famParam}:wght@${weight}`
    const cssUrl = `https://fonts.googleapis.com/css2?${query}`
    const res = await fetch(cssUrl)
    if (res.ok) {
      const css = await res.text()
      const match =
        css.match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/i) ||
        css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"]?truetype['"]?\)/i)
      if (match && match[1]) {
        const fontRes = await fetch(match[1])
        if (fontRes.ok) {
          const buffer = await fontRes.arrayBuffer()
          if (buffer && buffer.byteLength > 1000) return buffer
        }
      }
    }
  } catch (err) {
    console.warn(`[fonts] Failed to fetch Google Font TTF for ${family} (${weight}):`, err)
  }

  return null
}

/**
 * Parse an uploaded font file (TTF / OTF / WOFF) from user device and register it.
 */
export async function registerUploadedFontFile(file: File): Promise<{ family: string; weight: number } | null> {
  try {
    const buffer = await file.arrayBuffer()
    const parsed = opentype.parse(buffer)

    // Extract metadata from OpenType 'name' table
    const familyName =
      parsed.names.fontFamily?.en ||
      parsed.names.fullName?.en ||
      file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')

    let weight = 400
    const subFamily = (parsed.names.fontSubfamily?.en || '').toLowerCase()
    if (subFamily.includes('thin') || subFamily.includes('hairline')) weight = 100
    else if (subFamily.includes('extralight') || subFamily.includes('ultra light')) weight = 200
    else if (subFamily.includes('light')) weight = 300
    else if (subFamily.includes('medium')) weight = 500
    else if (subFamily.includes('semibold') || subFamily.includes('demi')) weight = 600
    else if (subFamily.includes('extrabold') || subFamily.includes('ultra')) weight = 800
    else if (subFamily.includes('black') || subFamily.includes('heavy')) weight = 900
    else if (subFamily.includes('bold')) weight = 700

    const cacheKey = `${familyName.toLowerCase()}__${weight}`
    fontBufferCache.set(cacheKey, buffer)
    parsedOpenTypeCache.set(cacheKey, parsed)

    // Create a Blob URL and inject into DOM for immediate live preview
    const blob = new Blob([buffer], { type: 'font/ttf' })
    const blobUrl = URL.createObjectURL(blob)
    injectFontFace(familyName, weight, blobUrl)

    // Update custom font registry
    const existing = customFontRegistry.get(familyName.toLowerCase())
    if (existing) {
      if (!existing.variants.some((v) => v.weight === weight)) {
        existing.variants.push({
          weight,
          label: parsed.names.fontSubfamily?.en || `${weight}`,
          fileBuffer: buffer,
        })
        existing.variants.sort((a, b) => a.weight - b.weight)
      }
    } else {
      customFontRegistry.set(familyName.toLowerCase(), {
        family: familyName,
        category: 'custom',
        source: 'custom',
        isCustom: true,
        variants: [
          {
            weight,
            label: parsed.names.fontSubfamily?.en || `${weight}`,
            fileBuffer: buffer,
          },
        ],
      })
    }

    notifyFontsChanged()
    return { family: familyName, weight }
  } catch (err) {
    console.error('[fonts] Failed to parse uploaded font:', err)
    return null
  }
}

/**
 * Inject Google Fonts CSS link into document head so browser loads real font faces.
 */
export function injectGoogleFontLink(family: string, weights: number[] = [400, 600, 700, 800]) {
  if (typeof document === 'undefined') return
  const safeId = `gfont-${family.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
  if (document.getElementById(safeId)) return

  const link = document.createElement('link')
  link.id = safeId
  link.rel = 'stylesheet'
  const fam = family.trim().replace(/\s+/g, '+')
  const validWeights = weights.length > 0 ? Array.from(new Set(weights)).sort((a, b) => a - b) : [400, 700]
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${validWeights.join(';')}&display=swap`
  document.head.appendChild(link)
}

/**
 * Verify whether a font family exists in the Google Fonts directory.
 */
export async function verifyGoogleFontExists(family: string): Promise<boolean> {
  const norm = family.trim()
  if (!norm) return false
  try {
    const fam = encodeURIComponent(norm).replace(/%20/g, '+')
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`, {
      method: 'GET',
    })
    return res.ok
  } catch {
    return true
  }
}

export interface ParsedGoogleFont {
  family: string
  weights: number[]
}

/**
 * Parse any user paste from Google Fonts into font family and weights.
 * Handles:
 *  - HTML <link rel="..." href="https://fonts.googleapis.com/css2?family=...">
 *  - CSS @import url('https://fonts.googleapis.com/css2?family=...')
 *  - CSS rule: font-family: 'Space Grotesk', sans-serif;
 *  - Specimen URL: https://fonts.google.com/specimen/Plus+Jakarta+Sans
 *  - Direct CSS2 URL: https://fonts.googleapis.com/css2?family=Outfit:wght@400;700
 *  - Plain text font family name: "Syne" or "Cabinet Grotesk"
 */
export function parseGoogleFontsInput(rawInput: string): ParsedGoogleFont[] {
  const text = rawInput.trim()
  if (!text) return []

  const results: ParsedGoogleFont[] = []
  const seen = new Set<string>()

  const addResult = (fam: string, weights: number[]) => {
    let cleanFam = fam.replace(/[+_-]/g, ' ').replace(/\s+/g, ' ').trim()
    // Remove unwanted surrounding quotes or punct
    cleanFam = cleanFam.replace(/^['"]+|['"]+$/g, '')
    if (!cleanFam || cleanFam.length < 2 || seen.has(cleanFam.toLowerCase())) return
    seen.add(cleanFam.toLowerCase())
    const cleanWeights = weights.length > 0 ? Array.from(new Set(weights)).sort((a, b) => a - b) : [400, 700]
    results.push({ family: cleanFam, weights: cleanWeights })
  }

  // 1. Check for Google Fonts CSS2 URL parameters: family=FamilyName:wght@400;700 or family=FamilyName
  const familyParamRegex = /family=([^&"'>\s,]+)/g
  let match: RegExpExecArray | null
  let matchedUrl = false
  while ((match = familyParamRegex.exec(text)) !== null) {
    matchedUrl = true
    const param = decodeURIComponent(match[1])
    const [rawFam, rawWght] = param.split(':')
    const extractedWeights: number[] = []
    if (rawWght) {
      const nums = rawWght.match(/\b\d{3}\b/g)
      if (nums) {
        nums.forEach((n) => {
          const w = parseInt(n, 10)
          if (w >= 100 && w <= 900) extractedWeights.push(w)
        })
      }
    }
    addResult(rawFam, extractedWeights)
  }

  if (matchedUrl && results.length > 0) {
    return results
  }

  // 2. Check for Google Fonts specimen URL: https://fonts.google.com/specimen/Plus+Jakarta+Sans
  const specimenMatch = text.match(/fonts\.google\.com\/specimen\/([^/?#\s"'>]+)/i)
  if (specimenMatch) {
    const fam = decodeURIComponent(specimenMatch[1])
    addResult(fam, [400, 600, 700, 800])
    return results
  }

  // 3. Check for CSS rule: font-family: 'Space Grotesk', sans-serif;
  const cssMatch = text.match(/font-family:\s*['"]?([^'";,\n\r]+)['"]?/i)
  if (cssMatch) {
    addResult(cssMatch[1], [400, 700])
    return results
  }

  // 4. Plain text font name (e.g. "Cabinet Grotesk" or "Syne" or "Outfit")
  const cleaned = text
    .replace(/<[^>]+>/g, '')
    .replace(/['"@;{}]/g, '')
    .replace(/^family=/i, '')
    .trim()

  if (cleaned && cleaned.length >= 2 && cleaned.length <= 60 && !cleaned.includes('\n')) {
    addResult(cleaned, [400, 700])
  }

  return results
}

export interface CatalogGoogleFont {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'monospace' | 'handwriting'
  weights: number[]
}

export const GOOGLE_FONTS_CATALOG: CatalogGoogleFont[] = [
  // --- Sans-Serif ---
  { family: 'Inter', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto', category: 'sans-serif', weights: [300, 400, 500, 700, 900] },
  { family: 'Montserrat', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Poppins', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Outfit', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Open Sans', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Lato', category: 'sans-serif', weights: [300, 400, 700, 900] },
  { family: 'Oswald', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Raleway', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Nunito', category: 'sans-serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Rubik', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { family: 'Work Sans', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Manrope', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Sora', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Syne', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Lexend', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Urbanist', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Figtree', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Archivo', category: 'sans-serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Public Sans', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Albert Sans', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Quicksand', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Cabin', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Barlow', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Jost', category: 'sans-serif', weights: [400, 600, 700, 800] },
  { family: 'Mulish', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Kanit', category: 'sans-serif', weights: [300, 400, 600, 700, 800] },
  { family: 'Questrial', category: 'sans-serif', weights: [400] },

  // --- Serif ---
  { family: 'Playfair Display', category: 'serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Cinzel', category: 'serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 600, 700] },
  { family: 'EB Garamond', category: 'serif', weights: [400, 600, 700, 800] },
  { family: 'Bitter', category: 'serif', weights: [400, 600, 700, 800] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { family: 'Crimson Text', category: 'serif', weights: [400, 600, 700] },
  { family: 'Bodoni Moda', category: 'serif', weights: [400, 600, 700, 800, 900] },
  { family: 'DM Serif Display', category: 'serif', weights: [400] },
  { family: 'Fraunces', category: 'serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Spectral', category: 'serif', weights: [400, 600, 700, 800] },
  { family: 'Prata', category: 'serif', weights: [400] },
  { family: 'Castoro', category: 'serif', weights: [400] },
  { family: 'Marcellus', category: 'serif', weights: [400] },
  { family: 'Alice', category: 'serif', weights: [400] },
  { family: 'Cardo', category: 'serif', weights: [400, 700] },
  { family: 'Domine', category: 'serif', weights: [400, 600, 700] },
  { family: 'Frank Ruhl Libre', category: 'serif', weights: [400, 700, 900] },

  // --- Display ---
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Anton', category: 'display', weights: [400] },
  { family: 'Archivo Black', category: 'display', weights: [400] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Abril Fatface', category: 'display', weights: [400] },
  { family: 'Bungee', category: 'display', weights: [400] },
  { family: 'Alfa Slab One', category: 'display', weights: [400] },
  { family: 'Lobster', category: 'display', weights: [400] },
  { family: 'Shrikhand', category: 'display', weights: [400] },
  { family: 'Pacifico', category: 'display', weights: [400] },
  { family: 'Permanent Marker', category: 'display', weights: [400] },
  { family: 'Comfortaa', category: 'display', weights: [400, 600, 700] },
  { family: 'Fredoka', category: 'display', weights: [400, 600, 700] },
  { family: 'Bangers', category: 'display', weights: [400] },
  { family: 'Audiowide', category: 'display', weights: [400] },
  { family: 'Press Start 2P', category: 'display', weights: [400] },
  { family: 'Titan One', category: 'display', weights: [400] },
  { family: 'Luckiest Guy', category: 'display', weights: [400] },
  { family: 'Special Elite', category: 'display', weights: [400] },
  { family: 'Ultra', category: 'display', weights: [400] },
  { family: 'Bowlby One', category: 'display', weights: [400] },
  { family: 'Fugaz One', category: 'display', weights: [400] },
  { family: 'Chango', category: 'display', weights: [400] },
  { family: 'Monoton', category: 'display', weights: [400] },

  // --- Handwriting ---
  { family: 'Caveat', category: 'handwriting', weights: [400, 600, 700] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 600, 700] },
  { family: 'Satisfy', category: 'handwriting', weights: [400] },
  { family: 'Sacramento', category: 'handwriting', weights: [400] },
  { family: 'Shadows Into Light', category: 'handwriting', weights: [400] },
  { family: 'Indie Flower', category: 'handwriting', weights: [400] },
  { family: 'Great Vibes', category: 'handwriting', weights: [400] },
  { family: 'Kalam', category: 'handwriting', weights: [400, 700] },
  { family: 'Yellowtail', category: 'handwriting', weights: [400] },
  { family: 'Marck Script', category: 'handwriting', weights: [400] },
  { family: 'Patrick Hand', category: 'handwriting', weights: [400] },
  { family: 'Courgette', category: 'handwriting', weights: [400] },
  { family: 'Allura', category: 'handwriting', weights: [400] },
  { family: 'Alex Brush', category: 'handwriting', weights: [400] },
  { family: 'Reenie Beanie', category: 'handwriting', weights: [400] },
  { family: 'Gloria Hallelujah', category: 'handwriting', weights: [400] },
  { family: 'Homemade Apple', category: 'handwriting', weights: [400] },
  { family: 'Kaushan Script', category: 'handwriting', weights: [400] },
  { family: 'Parisienne', category: 'handwriting', weights: [400] },
  { family: 'Cookie', category: 'handwriting', weights: [400] },

  // --- Monospace ---
  { family: 'Fira Code', category: 'monospace', weights: [400, 500, 600, 700] },
  { family: 'JetBrains Mono', category: 'monospace', weights: [400, 600, 700, 800] },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { family: 'Roboto Mono', category: 'monospace', weights: [300, 400, 600, 700] },
  { family: 'Inconsolata', category: 'monospace', weights: [400, 600, 700] },
  { family: 'Source Code Pro', category: 'monospace', weights: [400, 600, 700, 800] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [400, 600, 700] },
  { family: 'Courier Prime', category: 'monospace', weights: [400, 700] },
  { family: 'DM Mono', category: 'monospace', weights: [400, 500] },
  { family: 'Share Tech Mono', category: 'monospace', weights: [400] },
  { family: 'VT323', category: 'monospace', weights: [400] },
]

/**
 * Add a dynamic Google Font to the font list by family name and category.
 * If weights are not specified or only basic [400, 700], automatically resolves
 * all authentic weights from GOOGLE_FONTS_CATALOG.
 */
export async function addGoogleFontFamily(
  familyName: string,
  weights?: number[],
  category?: FontCategory
): Promise<FontDefinition | null> {
  const norm = familyName.trim()
  if (!norm) return null

  const catalogEntry = GOOGLE_FONTS_CATALOG.find((f) => f.family.toLowerCase() === norm.toLowerCase())
  const resolvedCategory = category || catalogEntry?.category || 'sans-serif'
  const resolvedWeights =
    weights && weights.length > 2
      ? weights
      : catalogEntry?.weights || weights || [400, 700]

  // Ensure link stylesheet is injected into DOM
  injectGoogleFontLink(norm, resolvedWeights)

  // Check if already in list
  const existing = customFontRegistry.get(norm.toLowerCase())
  if (existing) {
    // Merge any new weights
    for (const w of resolvedWeights) {
      if (!existing.variants.some((v) => v.weight === w)) {
        existing.variants.push({
          weight: w,
          label:
            w === 100 ? 'Thin' : w === 200 ? 'ExtraLight' : w === 300 ? 'Light' : w === 400 ? 'Regular' : w === 500 ? 'Medium' : w === 600 ? 'SemiBold' : w === 700 ? 'Bold' : w === 800 ? 'ExtraBold' : w === 900 ? 'Black' : `${w}`,
          googleFont: true,
        })
      }
    }
    existing.variants.sort((a, b) => a.weight - b.weight)
    notifyFontsChanged()
    return existing
  }

  const variants: FontVariant[] = resolvedWeights.map((w) => ({
    weight: w,
    label:
      w === 100 ? 'Thin' : w === 200 ? 'ExtraLight' : w === 300 ? 'Light' : w === 400 ? 'Regular' : w === 500 ? 'Medium' : w === 600 ? 'SemiBold' : w === 700 ? 'Bold' : w === 800 ? 'ExtraBold' : w === 900 ? 'Black' : `${w}`,
    googleFont: true,
  }))

  const def: FontDefinition = {
    family: norm,
    category: resolvedCategory,
    source: 'google',
    variants,
  }

  customFontRegistry.set(norm.toLowerCase(), def)
  notifyFontsChanged()

  // In background, proactively pre-fetch TTF buffers for commonly used weights (400, 700, and first)
  const preloadWeights = Array.from(new Set([400, 700, resolvedWeights[0]])).filter((w) =>
    resolvedWeights.includes(w)
  )
  for (const w of preloadWeights) {
    fetchGoogleFontTTF(norm, w).catch(() => {})
  }

  return def
}

/**
 * Load an opentype.Font instance for a given family and weight with guaranteed real typography.
 */
export async function getVerifiedOpenTypeFont(
  family: string = 'Manrope',
  weight: number = 700
): Promise<opentype.Font> {
  // Clamp to closest real available weight
  const actualWeight = getClosestAvailableWeight(family, weight)
  const cacheKey = `${family.toLowerCase()}__${actualWeight}`

  if (parsedOpenTypeCache.has(cacheKey)) {
    return parsedOpenTypeCache.get(cacheKey)!
  }

  if (pendingFontLoads.has(cacheKey)) {
    return pendingFontLoads.get(cacheKey)!
  }

  const loadPromise = (async () => {
    // 1. Check if buffer already exists in memory (from upload or prior fetch)
    if (fontBufferCache.has(cacheKey)) {
      const buf = fontBufferCache.get(cacheKey)!
      const font = opentype.parse(buf)
      parsedOpenTypeCache.set(cacheKey, font)
      return font
    }

    // 2. Check font definition
    const def = findFontDefinition(family)
    const variant = def?.variants.find((v) => v.weight === actualWeight) || def?.variants[0]

    // 3. Try bundled local path
    if (variant?.localPath) {
      try {
        const res = await fetch(variant.localPath)
        if (res.ok) {
          const buf = await res.arrayBuffer()
          const font = opentype.parse(buf)
          fontBufferCache.set(cacheKey, buf)
          parsedOpenTypeCache.set(cacheKey, font)
          return font
        }
      } catch {
        // Continue
      }
    }

    // 4. Try Google Fonts direct TTF fetch
    const googleBuf = await fetchGoogleFontTTF(family, actualWeight)
    if (googleBuf) {
      try {
        const font = opentype.parse(googleBuf)
        fontBufferCache.set(cacheKey, googleBuf)
        parsedOpenTypeCache.set(cacheKey, font)

        // Inject font face for DOM rendering sync
        const blob = new Blob([googleBuf], { type: 'font/ttf' })
        injectFontFace(family, actualWeight, URL.createObjectURL(blob))
        console.info(`[fonts] Successfully loaded genuine OpenType font for "${family}" (${actualWeight})`)
        return font
      } catch (err) {
        console.warn(`[fonts] Failed to parse Google Font buffer for ${family}:`, err)
      }
    }

    // 5. Hard fallback: verified local Manrope
    console.warn(`[fonts] Could not fetch "${family}" (${actualWeight}), falling back to Manrope`)
    const fallbackPath = actualWeight >= 600 ? '/fonts/manrope-800.ttf' : '/fonts/manrope-400.ttf'
    const fallbackRes = await fetch(fallbackPath)
    const fallbackBuf = await fallbackRes.arrayBuffer()
    const font = opentype.parse(fallbackBuf)
    parsedOpenTypeCache.set(cacheKey, font)
    return font
  })().finally(() => {
    pendingFontLoads.delete(cacheKey)
  })

  pendingFontLoads.set(cacheKey, loadPromise)
  return loadPromise
}
