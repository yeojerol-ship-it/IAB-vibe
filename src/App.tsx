import { useState, useEffect, useRef, useCallback, memo } from 'react'

import poiDetailBg from './assets/poi-detail-bg.png'
import viatorIcon from './assets/viator-icon.png'
import webviewContent from './assets/webview-content.png'
import popoverArtVideo from './assets/popover-art.mp4'
import cashbackChevron from './assets/cashback-chevron.svg'
import tikTokGoLogoMark from './assets/tiktok-go-logo-mark.png'
import navBackIcon from './assets/nav-back-icon.png'
import navForwardIcon from './assets/nav-forward-icon.png'
import statusBarImg from './assets/status-bar.png'

// ─── TikTok GO logo ───────────────────────────────────────────────────────────

function TikTokGoLogo() {
  return (
    <img
      src={tikTokGoLogoMark}
      alt="TikTok GO"
      className="nav-logo-png"
      width={79}
      height={36}
    />
  )
}

// ─── ChromaKeyVideo ───────────────────────────────────────────────────────────
// Plays a video offscreen, strips near-white background per-frame via canvas,
// and renders the result transparently over whatever is behind it.

const ChromaKeyVideo = memo(function ChromaKeyVideo({
  src,
  playTrigger,
  className,
}: {
  src: string
  playTrigger: unknown   // changing this value restarts playback
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  // Restart video whenever playTrigger changes
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    v.play().catch(() => {/* autoplay blocked */})
  }, [playTrigger])

  // Frame loop: draw → chroma-key → paint canvas
  useEffect(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    // willReadFrequently tells the browser to keep pixel data in CPU-accessible memory
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    const renderFrame = () => {
      if (video.paused || video.ended || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(renderFrame)
        return
      }
      ctx.drawImage(video, 0, 0, W, H)
      const frame = ctx.getImageData(0, 0, W, H)
      const d = frame.data

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        // Green-difference chroma key: background is ~rgb(92, 249, 74).
        // greenDiff = G – max(R,B). Pure green key = ~157. Feather range 80–120.
        const greenDiff = g - Math.max(r, b)
        if (greenDiff > 25) {
          const alpha = greenDiff > 60 ? 0 : Math.round((1 - (greenDiff - 25) / 35) * 255)
          d[i + 3] = alpha
        }
      }
      ctx.putImageData(frame, 0, 0)
      rafRef.current = requestAnimationFrame(renderFrame)
    }

    const onPlay = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(renderFrame)
    }
    const onEnd  = () => cancelAnimationFrame(rafRef.current)

    video.addEventListener('play',  onPlay)
    video.addEventListener('ended', onEnd)
    return () => {
      video.removeEventListener('play',  onPlay)
      video.removeEventListener('ended', onEnd)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <>
      {/* Hidden video source — never rendered visually */}
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ display: 'none' }}
      />
      {/* Canvas output — transparent background shows through */}
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className={className}
        aria-hidden="true"
      />
    </>
  )
})

// ─── Types ───────────────────────────────────────────────────────────────────

type AppState = 'poi' | 'loading' | 'webview' | 'popover'

// ─── SVG icon primitives ──────────────────────────────────────────────────────

function IconBack() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round"/>
    </svg>
  )
}

function IconMore() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2"/>
      <circle cx="12" cy="12" r="2"/>
      <circle cx="19" cy="12" r="2"/>
    </svg>
  )
}

function IconChevronRight() {
  return (
    <img
      src={cashbackChevron}
      alt=""
      aria-hidden="true"
      className="cashback-chevron"
      width={5}
      height={10}
    />
  )
}

function IconNavBack() {
  return <img src={navBackIcon} alt="" aria-hidden="true" width={24} height={24} className="webview-nav-icon" />
}

function IconNavForward() {
  return <img src={navForwardIcon} alt="" aria-hidden="true" width={24} height={24} className="webview-nav-icon" />
}

// ─── Status Bar (Figma PNG — exact 390×47 export) ────────────────────────────

function StatusBar() {
  return (
    <img
      src={statusBarImg}
      alt=""
      aria-hidden="true"
      className="status-bar-img"
      width={390}
      height={47}
      draggable={false}
    />
  )
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

interface NavBarProps {
  leftIcon?: 'back' | 'close'
  onLeftTap?: () => void
  subtitle?: string
}

function NavBar({ leftIcon = 'back', onLeftTap, subtitle }: NavBarProps) {
  return (
    <div className="nav-bar">
      <button className="nav-btn nav-btn-left" onClick={onLeftTap}
              aria-label={leftIcon === 'close' ? 'Close' : 'Back'}>
        {leftIcon === 'close' ? <IconClose /> : <IconBack />}
      </button>

      <div className="nav-center">
        <TikTokGoLogo />
        {subtitle && <span className="nav-subtitle">{subtitle}</span>}
      </div>

      <button className="nav-btn nav-btn-right" aria-label="More options">
        <IconMore />
      </button>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ runKey }: { runKey: number }) {
  return (
    <div className="progress-track" role="progressbar" aria-label="Page loading">
      <div key={runKey} className="progress-fill" />
    </div>
  )
}

// ─── POI Screen ───────────────────────────────────────────────────────────────
// Shows the full TikTok app POI detail screenshot (chrome included in image).
// No custom chrome overlay – image chrome IS the chrome.

function PoiScreen({ onShelfTap }: { onShelfTap: () => void }) {
  return (
    <div className="screen poi-screen">
      <div className="poi-scroll-area">
        <img
          src={poiDetailBg}
          alt="Yellowstone National Park – POI detail page"
          className="poi-bg"
          draggable={false}
        />

        {/* Transparent tap zone over the Tickets shelf (with Buy buttons) in the image.
            Image is 780×3688 native → 390×1844 CSS. Tickets section ≈ y 280–745 px. */}
        <button
          className="poi-shelf-zone"
          onClick={onShelfTap}
          aria-label="Tap to buy tickets on Viator"
        />
      </div>
    </div>
  )
}

// ─── Carousel Loading Screen ──────────────────────────────────────────────────

const CAROUSEL_LINES = [
  'Best deal found',
  'Cashback activated',
  'More savings await',
]

// Fixed item slot height + gap to keep column layout stable as font transitions
const SLOT_H = 32
const GAP_PX = 24
const CONTAINER_H = 122

function computeCarouselY(activeIdx: number): number {
  const activeCenter = activeIdx * (SLOT_H + GAP_PX) + SLOT_H / 2
  return CONTAINER_H / 2 - activeCenter
}

function LoadingScreen({ carouselIndex, runKey, shimmer }: {
  carouselIndex: number
  runKey: number
  shimmer: boolean
}) {
  const translateY = computeCarouselY(carouselIndex)

  return (
    <div className="screen loading-screen">
      <StatusBar />
      <NavBar leftIcon="close" subtitle="You are visiting: viator.com" />
      <ProgressBar runKey={runKey} />

      <div className="loading-body">
        <div className="loading-icon-frame">
          <img src={viatorIcon} alt="Viator" className="loading-icon-img" />
        </div>

        <div className="carousel-window" aria-live="polite" aria-atomic="true">
          <div
            className="carousel-column"
            style={{ transform: `translateY(${translateY}px)` }}
          >
            {CAROUSEL_LINES.map((line, i) => {
              const isActive = i === carouselIndex
              const isShimmerLine = i === 2 && shimmer && isActive
              const isIncoming = i > carouselIndex
              const isPast = i < carouselIndex
              return (
                <div
                  key={line}
                  className={[
                    'carousel-item',
                    isActive && 'carousel-item--active',
                    isIncoming && 'carousel-item--incoming',
                    isPast && 'carousel-item--past',
                  ].filter(Boolean).join(' ')}
                  aria-hidden={!isActive}
                >
                  <span className={`carousel-item-label${isShimmerLine ? ' carousel-item-label--shimmer' : ''}`}>
                    {line}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Webview Screen ───────────────────────────────────────────────────────────

interface WebviewScreenProps {
  onCashbackTap: () => void
  showPopover: boolean
  onClosePopover: () => void
  onClose: () => void
  glowKey: number
}

// ─── Cashback badge — SVG perimeter arc (even speed on pill shape) ───────────

interface CashbackBadgeProps { glowKey: number; onClick: () => void }

const ARC_GRAD_STOPS = (
  <>
    <stop offset="0%"   stopColor="#FAE0F1" stopOpacity="0" />
    <stop offset="18%"  stopColor="#FAE0F1" />
    <stop offset="50%"  stopColor="#ED658B" />
    <stop offset="82%"  stopColor="#FAE0F1" />
    <stop offset="100%" stopColor="#FAE0F1" stopOpacity="0" />
  </>
)

function useCashbackCountUp(target: number, duration: number, delay: number) {
  const [count, setCount] = useState(0)
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    setCount(0)
    setLanded(false)
    let raf: number
    let start: number | null = null
    const delayTimer = setTimeout(() => {
      const tick = (ts: number) => {
        if (!start) start = ts
        const elapsed = ts - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCount(Math.round(eased * target))
        if (progress >= 1) {
          setCount(target)
          setLanded(true)
        } else {
          raf = requestAnimationFrame(tick)
        }
      }
      raf = requestAnimationFrame(tick)
    }, delay)
    return () => { clearTimeout(delayTimer); cancelAnimationFrame(raf) }
  }, [target, duration, delay])
  return { count, landed }
}

function CashbackBadge({ glowKey, onClick }: CashbackBadgeProps) {
  const gradId = `badge-arc-${glowKey}`
  const { count: amount, landed } = useCashbackCountUp(50, 900, 350)
  const [arcComplete, setArcComplete] = useState(false)

  useEffect(() => {
    setArcComplete(false)
    // Arc: begin 0.3s, dur 3s → fades out at 3.3s
    const t = setTimeout(() => setArcComplete(true), 3300)
    return () => clearTimeout(t)
  }, [glowKey])

  return (
    <div key={glowKey} className="cashback-badge-wrap">
      <svg className="cashback-glow-svg" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {/* Full-ring gradient — simple from/to rotation, no path-sync needed */}
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="20" y1="15" x2="180" y2="15">
            {ARC_GRAD_STOPS}
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 100 15"
              to="180 100 15"
              dur="3s"
              begin="0.3s"
              fill="freeze"
            />
          </linearGradient>
        </defs>
        <rect
          className="cashback-glow-rect"
          x="0.75"
          y="0.75"
          width="198.5"
          height="28.5"
          rx="14.25"
          ry="14.25"
          pathLength="360"
          stroke={`url(#${gradId})`}
        />
      </svg>
      <button
        className="cashback-badge"
        onClick={onClick}
        aria-label="$50 Cashback activated — tap for details"
      >
        <span className={`cashback-copy${arcComplete ? ' cashback-copy--twinkle' : ''}`}>
          <span className={`cashback-amount${landed ? ' cashback-amount--landed' : ''}`}>${amount}</span>
          <span className="cashback-text">Cashback activated</span>
        </span>
        <IconChevronRight />
      </button>
    </div>
  )
}

// ─── Viator page screenshot scrollable view ───────────────────────────────────
// Clean Viator search results screenshot — 1170×2227 @3× (390 CSS px wide).

function ViatorFrame() {
  return (
    <div className="webview-scroll-area">
      <div className="webview-img-crop">
        <img
          src={webviewContent}
          alt="Viator – Guided Yellowstone Tour"
          className="webview-content-img"
          draggable={false}
        />
      </div>
    </div>
  )
}

function WebviewScreen({
  onCashbackTap,
  showPopover,
  onClosePopover,
  onClose,
  glowKey,
}: WebviewScreenProps) {
  return (
    <div className="screen webview-screen">
      <StatusBar />
      <NavBar leftIcon="close" onLeftTap={onClose} subtitle="You are visiting: viator.com" />

      {/* Live iframe — actual Viator product page with fallback */}
      <ViatorFrame />

      {/* Bottom navigation bar */}
      <div className="webview-bottom-bar">
        <div className="webview-nav-group">
          <button className="webview-icon-btn" aria-label="Go back">
            <IconNavBack />
          </button>
          <button className="webview-icon-btn" aria-label="Go forward">
            <IconNavForward />
          </button>
        </div>

        <CashbackBadge glowKey={glowKey} onClick={onCashbackTap} />
      </div>

      {/* Cashback explanation popover */}
      {showPopover && (
        <div
          className="popover-scrim"
          onClick={onClosePopover}
          role="dialog"
          aria-modal="true"
          aria-label="Cashback explanation"
        >
          <div className="popover-sheet" onClick={(e) => e.stopPropagation()}>
            <button
              className="popover-close-btn"
              onClick={onClosePopover}
              aria-label="Close"
            >
              <IconClose />
            </button>

            <div className="popover-art-frame">
              <ChromaKeyVideo
                src={popoverArtVideo}
                playTrigger={showPopover}
                className="popover-art"
              />
            </div>

            <div className="popover-body">
              <h2 className="popover-title">
                Sit back and enjoy $50 cashback at checkout
              </h2>
            </div>

            <div className="popover-cta-area">
              <button className="cta-primary-btn" onClick={onClosePopover}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── App state machine ────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState] = useState<AppState>('poi')
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselShimmer, setCarouselShimmer] = useState(false)
  const [loadRunKey, setLoadRunKey] = useState(0)
  const [webviewGlowKey, setWebviewGlowKey] = useState(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const handleShelfTap = useCallback(() => {
    clearTimers()
    setCarouselIndex(0)
    setCarouselShimmer(false)
    setLoadRunKey((k) => k + 1)
    setAppState('loading')

    // Carousel advance: line 0 → 1 at 1.1 s, then 1 → 2 at 2.4 s
    const t1 = setTimeout(() => setCarouselIndex(1), 1100)
    const t2 = setTimeout(() => setCarouselIndex(2), 2400)
    // Shimmer on final line after scroll settles (2.4 s + 0.58 s transition)
    const tShimmer = setTimeout(() => setCarouselShimmer(true), 2980)
    // Switch to webview at 4.2 s — after white sweep completes (~1.15 s)
    const t3 = setTimeout(() => {
      setWebviewGlowKey((k) => k + 1)
      setAppState('webview')
    }, 4200)

    timersRef.current = [t1, t2, tShimmer, t3]
  }, [clearTimers])

  const handleCloseWebview = useCallback(() => {
    clearTimers()
    setAppState('poi')
  }, [clearTimers])

  useEffect(() => () => clearTimers(), [clearTimers])

  return (
    <div className="app-shell">
      <div className="device-frame">
        {appState === 'poi' && (
          <PoiScreen onShelfTap={handleShelfTap} />
        )}

        {appState === 'loading' && (
          <LoadingScreen carouselIndex={carouselIndex} runKey={loadRunKey} shimmer={carouselShimmer} />
        )}

        {(appState === 'webview' || appState === 'popover') && (
          <WebviewScreen
            onCashbackTap={() => setAppState('popover')}
            showPopover={appState === 'popover'}
            onClosePopover={() => setAppState('webview')}
            onClose={handleCloseWebview}
            glowKey={webviewGlowKey}
          />
        )}
      </div>
    </div>
  )
}
