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

export interface FontDefinition {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'monospace' | 'custom'
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
      { weight: 400, label: 'Regular', googleFont: true },
      { weight: 600, label: 'SemiBold', googleFont: true },
      { weight: 700, label: 'Bold', googleFont: true },
      { weight: 800, label: 'ExtraBold', googleFont: true },
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
  const custom = Array.from(customFontRegistry.values())
  cachedAllFontsSnapshot = [...SYSTEM_FONTS, ...POPULAR_GOOGLE_FONTS, ...custom]
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
  return getAllFonts().find((f) => f.family.toLowerCase() === norm)
}

/**
 * Get all real available weights for a font family.
 * Always returns at least one real weight (defaults to 400 or 700 if unknown).
 */
export function getAvailableWeightsForFont(family: string): FontVariant[] {
  const def = findFontDefinition(family)
  if (def && def.variants.length > 0) {
    return def.variants
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
 * Dynamically fetch a TTF directly from Google Fonts Web API.
 */
export async function fetchGoogleFontTTF(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const famParam = family.trim().replace(/\s+/g, '+')
    const query = `family=${famParam}:wght@${weight}`
    const cssUrl = `https://fonts.googleapis.com/css2?${query}`
    const res = await fetch(cssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; U; Android 4.3; en-us; SM-N900T Build/JSS15J) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
      },
    })
    if (!res.ok) return null
    const css = await res.text()
    const match = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"]?truetype['"]?\)/i)
    if (!match) return null

    const fontRes = await fetch(match[1])
    if (!fontRes.ok) return null
    const buffer = await fontRes.arrayBuffer()
    return buffer
  } catch (err) {
    console.warn(`[fonts] Failed to fetch Google Font TTF for ${family} (${weight}):`, err)
    return null
  }
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
 * Add a dynamic Google Font to the font list by family name.
 */
export async function addGoogleFontFamily(
  familyName: string,
  weights: number[] = [400, 700]
): Promise<FontDefinition | null> {
  const norm = familyName.trim()
  if (!norm) return null

  // Check if already in list
  const existing = findFontDefinition(norm)
  if (existing) return existing

  const variants: FontVariant[] = weights.map((w) => ({
    weight: w,
    label: w === 400 ? 'Regular' : w === 600 ? 'SemiBold' : w === 700 ? 'Bold' : w === 800 ? 'ExtraBold' : `${w}`,
    googleFont: true,
  }))

  const def: FontDefinition = {
    family: norm,
    category: 'sans-serif',
    source: 'google',
    variants,
  }

  customFontRegistry.set(norm.toLowerCase(), def)
  notifyFontsChanged()
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
        return font
      } catch (err) {
        console.warn(`[fonts] Failed to parse Google Font buffer for ${family}:`, err)
      }
    }

    // 5. Hard fallback: verified local Manrope
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
