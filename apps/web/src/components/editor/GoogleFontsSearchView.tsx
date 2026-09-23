import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Search, Globe, Check, Plus, Clipboard, Loader2, ArrowRight,
  RotateCcw, Sparkles, X, ChevronLeft,
} from 'lucide-react'
import type { Layer } from '#/types'
import {
  GOOGLE_FONTS_CATALOG,
  type CatalogGoogleFont,
  type FontCategory,
  parseGoogleFontsInput,
  verifyGoogleFontExists,
  addGoogleFontFamily,
  injectGoogleFontLink,
  getClosestAvailableWeight,
} from '#/lib/fonts'

interface GoogleFontsSearchViewProps {
  onBack: () => void
  selectedLayer: Layer
  onApplyFont: (family: string, weight?: number) => void
}

const CATEGORIES: { id: 'all' | FontCategory; label: string }[] = [
  { id: 'all', label: 'All Styles' },
  { id: 'sans-serif', label: 'Sans Serif' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'monospace', label: 'Monospace' },
]

export default function GoogleFontsSearchView({
  onBack,
  selectedLayer,
  onApplyFont,
}: GoogleFontsSearchViewProps) {
  // Import text from selected element as sample text
  const layerRawText = (selectedLayer.text || '').trim()
  const defaultSample = layerRawText || 'The quick brown fox jumps 123'
  const [sampleText, setSampleText] = useState(defaultSample)
  const [isEditingSample, setIsEditingSample] = useState(false)

  // Update sample text if selected layer text changes and user hasn't typed custom sample
  useEffect(() => {
    if (layerRawText) {
      setSampleText(layerRawText)
    }
  }, [layerRawText])

  const [activeCategory, setActiveCategory] = useState<'all' | FontCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [pasteInput, setPasteInput] = useState('')
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pasteInputRef = useRef<HTMLInputElement>(null)

  const currentFamily = selectedLayer.fontFamily || 'Manrope'

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Filter catalog by category and search query (deduplicated by family)
  const filteredFonts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const seen = new Set<string>()
    return GOOGLE_FONTS_CATALOG.filter((f) => {
      const norm = f.family.toLowerCase()
      if (seen.has(norm)) return false
      seen.add(norm)
      if (activeCategory !== 'all' && f.category !== activeCategory) return false
      if (q && !norm.includes(q)) return false
      return true
    })
  }, [activeCategory, searchQuery])

  // Pre-load font stylesheets for visible preview cards (top 35)
  useEffect(() => {
    const topFonts = filteredFonts.slice(0, 35)
    for (const font of topFonts) {
      injectGoogleFontLink(font.family, [400])
    }
  }, [filteredFonts])

  // Handle Quick Paste & Import
  const handleImportPasted = async (customText?: string) => {
    const raw = (customText !== undefined ? customText : pasteInput).trim()
    if (!raw) return
    setIsVerifying(true)
    setFeedback(null)

    try {
      const parsed = parseGoogleFontsInput(raw)
      if (parsed.length === 0) {
        setFeedback({
          message: 'Could not detect font name. Try typing it directly.',
          type: 'error',
        })
        return
      }

      const importedNames: string[] = []
      for (const item of parsed) {
        const exists = await verifyGoogleFontExists(item.family)
        if (!exists) {
          setFeedback({
            message: `"${item.family}" was not found on Google Fonts. Check spelling.`,
            type: 'error',
          })
          return
        }

        await addGoogleFontFamily(item.family, item.weights)
        importedNames.push(item.family)
      }

      if (importedNames.length > 0) {
        const primary = importedNames[0]
        const currentLayerWeight = selectedLayer.fontWeight || 700
        const targetWeight = getClosestAvailableWeight(primary, currentLayerWeight)
        onApplyFont(primary, targetWeight)
        setFeedback({
          message: `Applied "${primary}" (${targetWeight}) to selected text!`,
          type: 'success',
        })
        setPasteInput('')
        setTimeout(() => setFeedback(null), 3000)
      }
    } catch {
      setFeedback({
        message: 'Failed to import font. Check network connection.',
        type: 'error',
      })
    } finally {
      setIsVerifying(false)
    }
  }

  // Handle selecting font from catalog
  const handleSelectFont = async (font: CatalogGoogleFont, specificWeight?: number) => {
    try {
      await addGoogleFontFamily(font.family, font.weights, font.category)
      const currentLayerWeight = selectedLayer.fontWeight || 700
      const targetWeight =
        specificWeight !== undefined
          ? specificWeight
          : getClosestAvailableWeight(font.family, currentLayerWeight)
      onApplyFont(font.family, targetWeight)
      setFeedback({
        message: `Applied "${font.family}" (weight ${targetWeight})`,
        type: 'success',
      })
      setTimeout(() => setFeedback(null), 2500)
    } catch (err) {
      console.error(err)
    }
  }

  // Handle clipboard paste
  const handleClipboardPaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setPasteInput(text)
          handleImportPasted(text)
        }
      }
    } catch {
      pasteInputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-full -mx-5 px-5 space-y-3 pb-6 animate-in fade-in duration-150">
      {/* Search Bar + Controls */}
      <div className="space-y-2 pt-1 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            data-testid="google-search-back-btn"
            className="flex items-center gap-1 rounded-xl bg-surface2 px-2.5 py-2 text-xs font-semibold text-txt2 hover:text-txt transition-colors cursor-pointer border border-line/60 shrink-0"
            title="Back to Font list"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt3" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 130+ Google fonts or type any font name..."
              className="w-full rounded-xl bg-surface2/90 pl-9 pr-8 py-2 text-xs text-txt placeholder:text-txt3 outline-none focus:ring-1 focus:ring-accent border border-line/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt3 hover:text-txt text-xs"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowPasteBox((v) => !v)}
            title="Paste Google Fonts link or @import code"
            className={`flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer border shrink-0 ${
              showPasteBox
                ? 'bg-accent text-white border-accent'
                : 'bg-surface2 text-txt2 hover:text-txt border-line/60'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>Paste Link</span>
          </button>
        </div>

        {/* Quick Paste Dropdown Box */}
        {showPasteBox && (
          <div className="rounded-xl bg-surface2 p-2.5 space-y-2 border border-line animate-in fade-in">
            <div className="flex items-center justify-between text-[11px] text-txt3">
              <span>Paste &lt;link&gt;, @import, specimen URL, or font name:</span>
              <button
                type="button"
                onClick={handleClipboardPaste}
                className="text-accent hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Clipboard className="h-3 w-3" />
                <span>Paste clipboard</span>
              </button>
            </div>
            <div className="flex gap-1.5">
              <input
                ref={pasteInputRef}
                type="text"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleImportPasted()}
                placeholder="e.g. <link href='...'>, fonts.google.com/..., or Outfit"
                className="flex-1 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-txt placeholder:text-txt3 outline-none border border-line"
              />
              <button
                type="button"
                onClick={() => handleImportPasted()}
                disabled={!pasteInput.trim() || isVerifying}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-accent/90 transition-colors cursor-pointer shrink-0"
              >
                {isVerifying ? 'Importing...' : 'Import & Apply'}
              </button>
            </div>
          </div>
        )}

        {/* Sample text banner: explicitly shows text imported from selected element */}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface2/60 border border-line px-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-txt3 shrink-0 font-medium">Sample text:</span>
            {isEditingSample ? (
              <input
                type="text"
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                onBlur={() => setIsEditingSample(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingSample(false)}
                autoFocus
                className="flex-1 bg-surface px-2 py-0.5 rounded text-txt text-[11px] outline-none border border-accent"
              />
            ) : (
              <span
                onClick={() => setIsEditingSample(true)}
                className="truncate text-txt font-medium cursor-pointer hover:underline"
                title="Click to edit sample text"
              >
                "{sampleText}"
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {layerRawText && sampleText !== layerRawText && (
              <button
                type="button"
                onClick={() => setSampleText(layerRawText)}
                className="text-[10px] text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
                title="Reset to element's original text"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Reset to element</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsEditingSample((v) => !v)}
              className="text-[10px] text-txt3 hover:text-txt px-1 py-0.5 rounded bg-surface/60 cursor-pointer"
            >
              {isEditingSample ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-accent text-white font-semibold shadow-xs'
                  : 'bg-surface2 text-txt3 hover:text-txt2'
              }`}
            >
              {cat.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-txt3 shrink-0 pl-1">
            {filteredFonts.length} fonts
          </span>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div
            className={`rounded-lg px-2.5 py-1 text-xs font-medium flex items-center gap-2 animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
            }`}
          >
            {feedback.type === 'success' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Font Cards Grid */}
      <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-0.5">
        {/* If query has no matches in curated catalog, allow direct API load */}
        {filteredFonts.length === 0 && searchQuery.trim() && (
          <div className="rounded-2xl bg-surface2/60 border border-line p-5 text-center space-y-3">
            <Globe className="h-8 w-8 text-accent mx-auto opacity-80" />
            <div>
              <p className="text-sm font-bold text-white">
                "{searchQuery.trim()}" not in quick list
              </p>
              <p className="text-xs text-txt3 mt-1">
                You can fetch and load it directly from Google Fonts!
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPasteInput(searchQuery.trim())
                handleImportPasted(searchQuery.trim())
              }}
              disabled={isVerifying}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 transition-colors cursor-pointer"
            >
              {isVerifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span>Load "{searchQuery.trim()}" from Google Fonts</span>
            </button>
          </div>
        )}

        {/* Catalog grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filteredFonts.map((f) => {
            const isSelected = currentFamily.toLowerCase() === f.family.toLowerCase()
            const currentWeight = selectedLayer.fontWeight || 700
            const previewWeight = getClosestAvailableWeight(f.family, currentWeight)

            return (
              <div
                key={`gfont-${f.family}`}
                onClick={() => handleSelectFont(f)}
                className={`group relative flex flex-col justify-between rounded-xl p-3 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-accent/15 border-accent shadow-md ring-1 ring-accent/40'
                    : 'bg-surface2/60 hover:bg-surface2 border-line/80 hover:border-txt3/30'
                }`}
              >
                {/* Top header row */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-txt group-hover:text-accent transition-colors truncate">
                    {f.family}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded bg-surface px-1.5 py-0.2 text-[8.5px] uppercase tracking-wider font-semibold text-txt3">
                      {f.category}
                    </span>
                    {isSelected && (
                      <span className="flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.2 text-[8.5px] font-bold text-white">
                        <Check className="h-2.5 w-2.5" />
                        <span>Active ({currentWeight})</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Live Font Preview using imported layer text and corresponding weight */}
                <div
                  className="py-1 text-base sm:text-lg text-txt leading-snug line-clamp-2 overflow-hidden break-words"
                  style={{
                    fontFamily: `'${f.family}', sans-serif`,
                    fontWeight: previewWeight,
                  }}
                >
                  {sampleText}
                </div>

                {/* Available Weights Quick Selector */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.weights.map((w) => {
                    const isWeightActive = isSelected && currentWeight === w
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectFont(f, w)
                        }}
                        title={`Apply ${f.family} at weight ${w}`}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors cursor-pointer ${
                          isWeightActive
                            ? 'bg-accent text-white font-bold shadow-sm'
                            : 'bg-surface/80 text-txt3 hover:text-txt hover:bg-surface border border-line/40'
                        }`}
                      >
                        {w}
                      </button>
                    )
                  })}
                </div>

                {/* Bottom footer row */}
                <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-line/60">
                  <span className="text-[9.5px] text-txt3">
                    {f.weights.length} {f.weights.length === 1 ? 'weight' : 'weights'}
                  </span>
                  <span className="text-[10px] font-semibold text-accent group-hover:underline flex items-center gap-0.5">
                    <span>{isSelected ? `Using ${currentWeight}` : `Apply (${previewWeight})`}</span>
                    <ArrowRight className="h-2.5 w-2.5" />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
