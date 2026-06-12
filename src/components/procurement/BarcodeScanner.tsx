'use client'

// Mobile-first barcode input with two parallel modes (plan decision 9):
// (a) keyboard-wedge scanner guns: a global key listener collects rapid
//     keystrokes terminated by Enter (only while no form field is focused,
//     so guns can still type into focused inputs directly), and
// (b) camera scanning: full-screen overlay using the native BarcodeDetector
//     API with a dynamic @zxing/browser fallback (iOS Safari).
//
// Feedback on every successful scan: vibration (navigator.vibrate) + beep.
// Controls are ≥44px and reachable one-handed at the bottom of the overlay.
// i18n namespace: procurement.scanner

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Check, Keyboard, Loader2, X } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'

interface BarcodeScannerProps {
  /** Called with the scanned/entered code (trimmed, non-empty) */
  onScan: (code: string) => void
  /** Keep the camera overlay open after a successful scan (連掃累加) */
  continuous?: boolean
}

// Minimal typings for the native BarcodeDetector API (not yet in lib.dom)
interface DetectedBarcode {
  rawValue: string
}
interface NativeBarcodeDetector {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => NativeBarcodeDetector
  }
}

const WEDGE_MAX_KEY_GAP_MS = 50
const WEDGE_MIN_LENGTH = 3
const DUPLICATE_SCAN_WINDOW_MS = 1500

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export default function BarcodeScanner({ onScan, continuous = false }: BarcodeScannerProps) {
  const t = useTranslations('procurement.scanner')

  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [lastScanned, setLastScanned] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const zxingControlsRef = useRef<IScannerControls | null>(null)
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const closeOnScanRef = useRef(!continuous)
  closeOnScanRef.current = !continuous

  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  // ── shared scan handling: dedupe + haptic/audio feedback ──
  const handleCode = useCallback((raw: string) => {
    const code = raw.trim()
    if (!code) return
    const now = Date.now()
    if (lastCodeRef.current.code === code && now - lastCodeRef.current.at < DUPLICATE_SCAN_WINDOW_MS) return
    lastCodeRef.current = { code, at: now }

    try {
      navigator.vibrate?.(60)
    } catch { /* unsupported */ }
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        gain.gain.value = 0.08
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.09)
        osc.onended = () => { void ctx.close() }
      }
    } catch { /* unsupported */ }

    setLastScanned(code)
    onScanRef.current(code)
    if (closeOnScanRef.current) setCameraOpen(false)
  }, [])

  // ── mode (a): keyboard-wedge scanner gun (Enter-terminated bursts) ──
  useEffect(() => {
    let buffer = ''
    let lastKeyAt = 0

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const now = Date.now()
      if (now - lastKeyAt > WEDGE_MAX_KEY_GAP_MS) buffer = ''
      lastKeyAt = now

      if (e.key === 'Enter') {
        if (buffer.length >= WEDGE_MIN_LENGTH) {
          e.preventDefault()
          handleCode(buffer)
        }
        buffer = ''
        return
      }
      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleCode])

  // ── mode (b): camera scanning ──
  const stopCamera = useCallback(() => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current)
      detectTimerRef.current = null
    }
    zxingControlsRef.current?.stop()
    zxingControlsRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera()
      return
    }

    let cancelled = false
    setCameraError(false)
    setStarting(true)

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        if (window.BarcodeDetector) {
          const detector = new window.BarcodeDetector()
          detectTimerRef.current = setInterval(async () => {
            const v = videoRef.current
            if (!v || v.readyState < 2) return
            try {
              const barcodes = await detector.detect(v)
              if (barcodes.length > 0 && barcodes[0].rawValue) handleCode(barcodes[0].rawValue)
            } catch { /* skip frame */ }
          }, 200)
        } else {
          // iOS Safari & friends: fall back to @zxing/browser
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const reader = new BrowserMultiFormatReader()
          zxingControlsRef.current = await reader.decodeFromStream(stream, video, result => {
            if (result) handleCode(result.getText())
          })
        }
        if (!cancelled) setStarting(false)
      } catch (e) {
        console.error('[BarcodeScanner] camera start failed:', e)
        if (!cancelled) {
          setCameraError(true)
          setStarting(false)
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [cameraOpen, handleCode, stopCamera])

  // ESC closes the overlay
  useEffect(() => {
    if (!cameraOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCameraOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cameraOpen])

  const submitManual = () => {
    const code = manualValue.trim()
    if (!code) return
    handleCode(code)
    setManualValue('')
    if (continuous) return
    setManualMode(false)
    setCameraOpen(false)
  }

  return (
    <>
      {/* trigger (≥44px touch target) */}
      <button
        type="button"
        onClick={() => setCameraOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-[0.97] dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <Camera className="h-5 w-5" aria-hidden="true" />
        {t('open')}
      </button>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={t('title')}>
          {/* top bar */}
          <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h2 className="text-base font-semibold text-white">{t('title')}</h2>
            <button
              type="button"
              onClick={() => setCameraOpen(false)}
              aria-label={t('close')}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* viewport */}
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />

            {starting && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden="true" />
              </div>
            )}

            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="text-center text-sm text-white">{t('cameraError')}</p>
              </div>
            ) : (
              <>
                {/* scan frame */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-44 w-72 max-w-[80vw] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
                <p className="absolute inset-x-0 top-[calc(50%+6.5rem)] px-6 text-center text-sm text-white/90">
                  {t('hint')}
                </p>
              </>
            )}

            {lastScanned && (
              <div
                aria-live="polite"
                className="absolute inset-x-4 top-3 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full bg-green-600/90 px-4 py-2 text-sm font-medium text-white"
              >
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t('lastScanned', { code: lastScanned })}</span>
              </div>
            )}
          </div>

          {/* bottom controls — one-hand reachable */}
          <div className="bg-black/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {manualMode ? (
              <form
                onSubmit={e => {
                  e.preventDefault()
                  submitManual()
                }}
                className="flex items-center gap-2"
              >
                <label htmlFor="barcode-manual-input" className="sr-only">
                  {t('manualPlaceholder')}
                </label>
                <input
                  id="barcode-manual-input"
                  value={manualValue}
                  onChange={e => setManualValue(e.target.value)}
                  placeholder={t('manualPlaceholder')}
                  autoFocus
                  autoComplete="off"
                  inputMode="text"
                  className="h-12 min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 text-base text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={!manualValue.trim()}
                  className="flex h-12 min-w-11 cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 font-medium text-white transition-colors duration-150 hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('submit')}
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  aria-label={t('close')}
                  className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-white/15 font-medium text-white transition-colors duration-150 hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-[0.97]"
              >
                <Keyboard className="h-5 w-5" aria-hidden="true" />
                {t('manualEntry')}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
