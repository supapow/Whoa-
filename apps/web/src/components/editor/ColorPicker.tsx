import { useState, useEffect, useRef, useCallback } from 'react'
import { Pipette, Copy, Check, Sliders, RotateCcw } from 'lucide-react'

// --- Color conversion helpers ---

export interface RgbColor {
  r: number
  g: number
  b: number
  a?: number
}

export interface HsvColor {
  h: number // 0 - 360
  s: number // 0 - 100
  v: number // 0 - 100
}

export function parseColorToRgb(color: string): RgbColor {
  if (!color || color === 'transparent') {
    return { r: 0, g: 122, b: 255, a: 1 }
  }

  // Hex format #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (color.startsWith('#')) {
    let hex = color.slice(1).trim()
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('')
    } else if (hex.length === 4) {
      hex = hex.slice(0, 3).split('').map((c) => c + c).join('') + hex[3] + hex[3]
    }

    if (hex.length === 6) {
      const num = parseInt(hex, 16)
      if (!isNaN(num)) {
        return {
          r: (num >> 16) & 255,
          g: (num >> 8) & 255,
          b: num & 255,
          a: 1,
        }
      }
    } else if (hex.length === 8) {
      const num = parseInt(hex, 16)
      if (!isNaN(num)) {
        return {
          r: (num >> 24) & 255,
          g: (num >> 16) & 255,
          b: (num >> 8) & 255,
          a: Math.round(((num & 255) / 255) * 100) / 100,
        }
      }
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    }
  }

  // Default fallback
  return { r: 0, g: 122, b: 255, a: 1 }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (max !== min) {
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)
        break
      case gNorm:
        h = (bNorm - rNorm) / d + 2
        break
      case bNorm:
        h = (rNorm - gNorm) / d + 4
        break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  }
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
  const hNorm = (((h % 360) + 360) % 360) / 60
  const sNorm = Math.max(0, Math.min(100, s)) / 100
  const vNorm = Math.max(0, Math.min(100, v)) / 100

  const c = vNorm * sNorm
  const x = c * (1 - Math.abs((hNorm % 2) - 1))
  const m = vNorm - c

  let r1 = 0, g1 = 0, b1 = 0
  if (hNorm >= 0 && hNorm < 1) {
    r1 = c; g1 = x; b1 = 0
  } else if (hNorm >= 1 && hNorm < 2) {
    r1 = x; g1 = c; b1 = 0
  } else if (hNorm >= 2 && hNorm < 3) {
    r1 = 0; g1 = c; b1 = x
  } else if (hNorm >= 3 && hNorm < 4) {
    r1 = 0; g1 = x; b1 = c
  } else if (hNorm >= 4 && hNorm < 5) {
    r1 = x; g1 = 0; b1 = c
  } else {
    r1 = c; g1 = 0; b1 = x
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: 1,
  }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  return rgbToHex(r, g, b)
}

const RECENT_COLORS_KEY = 'bannr_custom_recent_colors'
const DEFAULT_RECENTS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FFFFFF']

function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COLORS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 8)
    }
  } catch {}
  return DEFAULT_RECENTS
}

function saveRecentColor(color: string) {
  if (!color || !color.startsWith('#')) return
  try {
    const recents = getRecentColors().filter((c) => c.toUpperCase() !== color.toUpperCase())
    recents.unshift(color.toUpperCase())
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recents.slice(0, 8)))
  } catch {}
}

export interface ColorPickerProps {
  color: string
  onChange: (hex: string) => void
  onClose?: () => void
  className?: string
}

export default function ColorPicker({ color, onChange, onClose, className = '' }: ColorPickerProps) {
  const initialRgb = parseColorToRgb(color)
  const initialHsv = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b)

  const [h, setH] = useState(initialHsv.h)
  const [s, setS] = useState(initialHsv.s)
  const [v, setV] = useState(initialHsv.v)
  const [hexInput, setHexInput] = useState(rgbToHex(initialRgb.r, initialRgb.g, initialRgb.b))
  const [copied, setCopied] = useState(false)
  const [recentColors, setRecentColors] = useState<string[]>(getRecentColors)
  const [hasEyeDropper, setHasEyeDropper] = useState(false)

  const satValRef = useRef<HTMLDivElement>(null)
  const isDraggingSatVal = useRef(false)
  const nativeColorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHasEyeDropper(typeof window !== 'undefined' && 'EyeDropper' in window)
  }, [])

  // Sync state if external color changes (unless it matches our current HSV derived hex)
  useEffect(() => {
    const currentHex = hsvToHex(h, s, v).toUpperCase()
    const targetRgb = parseColorToRgb(color)
    const targetHex = rgbToHex(targetRgb.r, targetRgb.g, targetRgb.b).toUpperCase()

    if (currentHex !== targetHex) {
      const newHsv = rgbToHsv(targetRgb.r, targetRgb.g, targetRgb.b)
      setH(newHsv.h)
      setS(newHsv.s)
      setV(newHsv.v)
      setHexInput(targetHex)
    }
  }, [color])

  const applyHsv = useCallback((newH: number, newS: number, newV: number) => {
    const newHex = hsvToHex(newH, newS, newV)
    setH(newH)
    setS(newS)
    setV(newV)
    setHexInput(newHex)
    onChange(newHex)
    saveRecentColor(newHex)
    setRecentColors(getRecentColors())
  }, [onChange])

  // Handle 2D Saturation / Value interactive box
  const updateFromPointer = useCallback((e: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
    if (!satValRef.current) return
    const rect = satValRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))

    const newS = Math.round(x * 100)
    const newV = Math.round((1 - y) * 100)
    applyHsv(h, newS, newV)
  }, [h, applyHsv])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingSatVal.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromPointer(e)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSatVal.current) {
      updateFromPointer(e)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSatVal.current) {
      isDraggingSatVal.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
    }
  }

  // Handle Hex text input change
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.trim()
    setHexInput(val)
    if (!val.startsWith('#')) val = '#' + val
    if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
      const rgb = parseColorToRgb(val)
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
      setH(hsv.h)
      setS(hsv.s)
      setV(hsv.v)
      const fullHex = rgbToHex(rgb.r, rgb.g, rgb.b)
      onChange(fullHex)
      saveRecentColor(fullHex)
      setRecentColors(getRecentColors())
    }
  }

  // Handle RGB inputs
  const currentRgb = hsvToRgb(h, s, v)

  const handleRgbChange = (channel: 'r' | 'g' | 'b', valStr: string) => {
    const val = Math.max(0, Math.min(255, parseInt(valStr, 10) || 0))
    const nextRgb = { ...currentRgb, [channel]: val }
    const nextHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b)
    const nextHsv = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b)
    setH(nextHsv.h)
    setS(nextHsv.s)
    setV(nextHsv.v)
    setHexInput(nextHex)
    onChange(nextHex)
    saveRecentColor(nextHex)
    setRecentColors(getRecentColors())
  }

  // Copy hex to clipboard
  const handleCopyHex = () => {
    const hex = hsvToHex(h, s, v)
    navigator.clipboard?.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // Native EyeDropper API
  const handleEyeDropper = async () => {
    if (typeof window === 'undefined' || !('EyeDropper' in window)) return
    try {
      const eyeDropper = new (window as any).EyeDropper()
      const result = await eyeDropper.open()
      if (result?.sRGBHex) {
        const hex = result.sRGBHex.toUpperCase()
        const rgb = parseColorToRgb(hex)
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
        setH(hsv.h)
        setS(hsv.s)
        setV(hsv.v)
        setHexInput(hex)
        onChange(hex)
        saveRecentColor(hex)
        setRecentColors(getRecentColors())
      }
    } catch {}
  }

  const pureHueHex = hsvToHex(h, 100, 100)
  const currentHex = hsvToHex(h, s, v)

  // Compute 6 dynamic shade presets for the active hue
  const hueShades = [
    hsvToHex(h, 30, 95),
    hsvToHex(h, 60, 90),
    hsvToHex(h, 95, 80),
    hsvToHex(h, 100, 60),
    hsvToHex(h, 100, 40),
    hsvToHex(h, 100, 20),
  ]

  return (
    <div
      id="color-picker-expanded-panel"
      data-testid="color-picker-expanded-panel"
      className={`space-y-3 rounded-2xl bg-surface p-3 text-txt border border-line ${className}`}
    >
      {/* 2D Saturation / Value Gradient Area */}
      <div
        ref={satValRef}
        id="color-picker-sat-val-area"
        data-testid="color-picker-sat-val-area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-32 sm:h-36 w-full cursor-crosshair overflow-hidden rounded-xl touch-none select-none shadow-inner"
        style={{
          backgroundColor: pureHueHex,
        }}
      >
        {/* White horizontal gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, #FFFFFF 0%, rgba(255, 255, 255, 0) 100%)',
          }}
        />
        {/* Black vertical gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, #000000 100%)',
          }}
        />

        {/* Reticle / Position Indicator */}
        <div
          id="color-picker-reticle"
          data-testid="color-picker-reticle"
          className="absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white shadow-md ring-1 ring-black/30 pointer-events-none transition-transform active:scale-125"
          style={{
            left: `${s}%`,
            top: `${100 - v}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Hue Slider Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-txt3 font-medium px-0.5">
          <span>Hue Spectrum</span>
          <span className="font-mono text-[10px]">{h}°</span>
        </div>
        <div className="relative flex items-center h-5 w-full">
          <input
            type="range"
            min={0}
            max={360}
            value={h}
            id="color-picker-hue-slider"
            data-testid="color-picker-hue-slider"
            aria-label="Color hue slider"
            onChange={(e) => {
              const newH = Number(e.target.value)
              applyHsv(newH, s, v)
            }}
            className="w-full h-3.5 rounded-full appearance-none cursor-pointer outline-none focus:ring-1 focus:ring-accent"
            style={{
              background: 'linear-gradient(to right, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)',
            }}
          />
        </div>
      </div>

      {/* Hex & Eyedropper & RGB Channel Controls */}
      <div className="grid grid-cols-12 gap-2 pt-1 items-center">
        {/* Swatch & EyeDropper */}
        <div className="col-span-3 flex items-center gap-1.5">
          <div
            id="color-picker-active-swatch"
            data-testid="color-picker-active-swatch"
            className="h-8 w-8 shrink-0 rounded-xl border border-white/20 shadow-xs ring-1 ring-black/20"
            style={{ backgroundColor: currentHex }}
            title={`Active: ${currentHex}`}
          />
          {hasEyeDropper && (
            <button
              type="button"
              id="color-picker-eyedropper-btn"
              data-testid="color-picker-eyedropper-btn"
              onClick={handleEyeDropper}
              title="Sample screen color with Eyedropper"
              className="grid h-8 w-8 place-items-center rounded-xl bg-surface2 hover:bg-surface2/80 text-txt2 hover:text-white transition-colors cursor-pointer"
            >
              <Pipette className="h-4 w-4" />
            </button>
          )}
          {/* OS native picker button fallback */}
          <button
            type="button"
            id="color-picker-native-btn"
            data-testid="color-picker-native-btn"
            onClick={() => nativeColorInputRef.current?.click()}
            title="System color picker"
            className="grid h-8 w-8 place-items-center rounded-xl bg-surface2 hover:bg-surface2/80 text-txt2 hover:text-white transition-colors cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5" />
            <input
              ref={nativeColorInputRef}
              type="color"
              value={currentHex}
              onChange={(e) => {
                const val = e.target.value.toUpperCase()
                const rgb = parseColorToRgb(val)
                const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
                setH(hsv.h)
                setS(hsv.s)
                setV(hsv.v)
                setHexInput(val)
                onChange(val)
                saveRecentColor(val)
                setRecentColors(getRecentColors())
              }}
              className="sr-only"
            />
          </button>
        </div>

        {/* Hex Input & Copy */}
        <div className="col-span-5 flex items-center rounded-xl bg-surface2 px-2 py-1 border border-line focus-within:border-accent">
          <span className="text-xs text-txt3 font-mono mr-1">#</span>
          <input
            type="text"
            id="color-picker-hex-input"
            data-testid="color-picker-hex-input"
            value={hexInput.replace(/^#/, '')}
            onChange={handleHexChange}
            maxLength={7}
            placeholder="007AFF"
            className="w-full bg-transparent text-xs font-mono font-medium uppercase text-txt focus:outline-none"
          />
          <button
            type="button"
            id="color-picker-copy-btn"
            data-testid="color-picker-copy-btn"
            onClick={handleCopyHex}
            title={copied ? 'Copied!' : 'Copy Hex'}
            className="p-1 text-txt3 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>

        {/* RGB Channels */}
        <div className="col-span-4 flex items-center gap-1 text-[10px]">
          <div className="flex-1 rounded-lg bg-surface2 px-1 py-1 text-center border border-line">
            <span className="text-[9px] text-txt3 block leading-none">R</span>
            <input
              type="number"
              min={0}
              max={255}
              id="color-picker-rgb-r"
              data-testid="color-picker-rgb-r"
              value={currentRgb.r}
              onChange={(e) => handleRgbChange('r', e.target.value)}
              className="w-full bg-transparent text-center font-mono text-[10px] text-txt outline-none"
            />
          </div>
          <div className="flex-1 rounded-lg bg-surface2 px-1 py-1 text-center border border-line">
            <span className="text-[9px] text-txt3 block leading-none">G</span>
            <input
              type="number"
              min={0}
              max={255}
              id="color-picker-rgb-g"
              data-testid="color-picker-rgb-g"
              value={currentRgb.g}
              onChange={(e) => handleRgbChange('g', e.target.value)}
              className="w-full bg-transparent text-center font-mono text-[10px] text-txt outline-none"
            />
          </div>
          <div className="flex-1 rounded-lg bg-surface2 px-1 py-1 text-center border border-line">
            <span className="text-[9px] text-txt3 block leading-none">B</span>
            <input
              type="number"
              min={0}
              max={255}
              id="color-picker-rgb-b"
              data-testid="color-picker-rgb-b"
              value={currentRgb.b}
              onChange={(e) => handleRgbChange('b', e.target.value)}
              className="w-full bg-transparent text-center font-mono text-[10px] text-txt outline-none"
            />
          </div>
        </div>
      </div>

      {/* Hue Shades & Tints */}
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-txt3">
          Tints & Shades
        </span>
        <div className="grid grid-cols-6 gap-1.5">
          {hueShades.map((shade, idx) => (
            <button
              key={`${shade}-${idx}`}
              type="button"
              data-testid={`color-picker-shade-${idx}`}
              onClick={() => {
                const rgb = parseColorToRgb(shade)
                const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
                applyHsv(hsv.h, hsv.s, hsv.v)
              }}
              className="h-6 rounded-lg border border-white/10 transition-transform active:scale-90 hover:scale-105 cursor-pointer"
              style={{ backgroundColor: shade }}
              title={shade}
            />
          ))}
        </div>
      </div>

      {/* Recent / Favorite Custom Colors */}
      {recentColors.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="uppercase font-semibold tracking-wider text-txt3">Recent Colors</span>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(RECENT_COLORS_KEY)
                setRecentColors(DEFAULT_RECENTS)
              }}
              className="text-txt3 hover:text-txt2 transition-colors flex items-center gap-0.5 text-[9px]"
              title="Reset recent colors"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Reset
            </button>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {recentColors.map((rc, idx) => (
              <button
                key={`${rc}-${idx}`}
                type="button"
                data-testid={`color-picker-recent-${idx}`}
                onClick={() => {
                  const rgb = parseColorToRgb(rc)
                  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
                  applyHsv(hsv.h, hsv.s, hsv.v)
                }}
                className={`aspect-square rounded-full border transition-transform active:scale-90 hover:scale-110 cursor-pointer ${
                  currentHex === rc.toUpperCase() ? 'border-accent ring-2 ring-accent/40' : 'border-line'
                }`}
                style={{ backgroundColor: rc }}
                title={rc}
              />
            ))}
          </div>
        </div>
      )}

      {onClose && (
        <div className="pt-0.5 flex justify-end">
          <button
            type="button"
            id="color-picker-done-btn"
            data-testid="color-picker-done-btn"
            onClick={onClose}
            className="rounded-lg bg-surface2 hover:bg-surface2/80 px-3 py-1 text-xs font-semibold text-txt2 hover:text-white transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
