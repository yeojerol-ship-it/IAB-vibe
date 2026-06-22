import { useState, useEffect, useRef, useCallback, memo, type ReactNode } from 'react'

import poiDetailBg from './assets/poi-detail-bg.png'
import tripIcon from './assets/trip-icon.png'
import webviewContent from './assets/webview-content.webp'
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
  loopTailSeconds,
  loopSpeed = 0.85,
}: {
  src: string
  playTrigger: unknown   // changing this value restarts playback
  className?: string
  loopTailSeconds?: number // ping-pong loop the last N seconds after the intro
  loopSpeed?: number       // 0–1, slows the ping-pong loop (1 = source speed)
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const loopStartRef = useRef<number | null>(null)
  const loopModeRef = useRef<'intro' | 'forward' | 'reverse'>('intro')
  const lastFrameTsRef = useRef(0)

  const syncLoopStart = useCallback((video: HTMLVideoElement) => {
    if (!loopTailSeconds || !Number.isFinite(video.duration)) {
      loopStartRef.current = null
      return
    }
    loopStartRef.current = Math.max(0, video.duration - loopTailSeconds)
  }, [loopTailSeconds])

  // Restart video whenever playTrigger changes
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    loopModeRef.current = 'intro'
    lastFrameTsRef.current = 0
    v.playbackRate = 1
    v.currentTime = 0
    syncLoopStart(v)
    v.play().catch(() => {/* autoplay blocked */})
  }, [playTrigger, syncLoopStart])

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

    const paintFrame = () => {
      ctx.drawImage(video, 0, 0, W, H)
      const frame = ctx.getImageData(0, 0, W, H)
      const d = frame.data

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        // Green-difference chroma key: background is ~rgb(92, 249, 74).
        // greenDiff = G – max(R,B). Pure green key = ~157. Feather range 80–120.
        const greenDiff = g - Math.max(r, b)
        if (greenDiff > 3) {
          const alpha = greenDiff > 25 ? 0 : Math.round((1 - (greenDiff - 3) / 22) * 255)
          d[i + 3] = alpha
        }
      }
      ctx.putImageData(frame, 0, 0)
    }

    const advancePingPong = (ts: number) => {
      const loopStart = loopStartRef.current
      if (loopStart == null || !Number.isFinite(video.duration)) return

      const loopEnd = video.duration - 1 / 60
      const dt = lastFrameTsRef.current
        ? Math.min((ts - lastFrameTsRef.current) / 1000, 0.05)
        : 0
      lastFrameTsRef.current = ts

      if (loopModeRef.current === 'intro' && video.currentTime >= loopStart) {
        loopModeRef.current = 'forward'
        video.playbackRate = loopSpeed
      }

      if (loopModeRef.current === 'forward' && video.currentTime >= loopEnd) {
        loopModeRef.current = 'reverse'
        video.pause()
      }

      if (loopModeRef.current === 'reverse') {
        video.currentTime = Math.max(loopStart, video.currentTime - dt * loopSpeed)
        if (video.currentTime <= loopStart + 1 / 60) {
          loopModeRef.current = 'forward'
          video.playbackRate = loopSpeed
          video.play().catch(() => {/* autoplay blocked */})
        }
      }
    }

    const renderFrame = (ts: number) => {
      if (video.readyState >= 2) {
        advancePingPong(ts)
        if (!video.paused || loopModeRef.current === 'reverse') {
          paintFrame()
        }
      }
      rafRef.current = requestAnimationFrame(renderFrame)
    }

    const onMetadata = () => syncLoopStart(video)
    const onPlay = () => {
      cancelAnimationFrame(rafRef.current)
      lastFrameTsRef.current = 0
      rafRef.current = requestAnimationFrame(renderFrame)
    }

    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('play', onPlay)
    if (video.readyState >= 1) syncLoopStart(video)
    if (!video.paused) onPlay()

    return () => {
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('play', onPlay)
      cancelAnimationFrame(rafRef.current)
    }
  }, [syncLoopStart, loopSpeed])

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
  return <img src={navBackIcon} alt="" aria-hidden="true" width={20} height={20} className="webview-nav-icon" />
}

function IconNavForward() {
  return <img src={navForwardIcon} alt="" aria-hidden="true" width={20} height={20} className="webview-nav-icon" />
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
  title?: string
  showBrand?: boolean
  showMore?: boolean
  centerBadge?: ReactNode
  scrolled?: boolean
  compact?: boolean
}

function NavBar({
  leftIcon = 'back',
  onLeftTap,
  subtitle,
  title,
  showBrand = true,
  showMore = true,
  centerBadge,
  scrolled = false,
  compact = false,
}: NavBarProps) {
  return (
    <div className={`nav-bar${centerBadge ? ' nav-bar--with-badge' : ''}${scrolled ? ' nav-bar--scrolled' : ''}${compact ? ' nav-bar--compact' : ''}${!showBrand && !showMore && !title && !centerBadge ? ' nav-bar--minimal' : ''}`}>
      <button className="nav-btn nav-btn-left" onClick={onLeftTap}
              aria-label={leftIcon === 'close' ? 'Close' : 'Back'}>
        {leftIcon === 'close' ? <IconClose /> : <IconBack />}
      </button>

      {(showBrand || subtitle || title || centerBadge) && (
        <div className={`nav-center${centerBadge ? ' nav-center--with-badge' : ''}`}>
          {title ? (
            <span className="nav-title">{title}</span>
          ) : (
            <>
              {showBrand && <TikTokGoLogo />}
              {subtitle && <span className="nav-subtitle">{subtitle}</span>}
            </>
          )}
          {centerBadge}
        </div>
      )}

      {showMore ? (
        <button className="nav-btn nav-btn-right" aria-label="More options">
          <IconMore />
        </button>
      ) : (
        <div className="nav-btn-spacer" aria-hidden="true" />
      )}
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
            Image is 780×1688 native → 390×844 CSS. Tickets section ≈ y 350–770 px. */}
        <button
          className="poi-shelf-zone"
          onClick={onShelfTap}
          aria-label="Tap to buy tickets on Trip"
        />
      </div>
    </div>
  )
}

// ─── Carousel Loading Screen ──────────────────────────────────────────────────

const CAROUSEL_LINES = [
  'Best deal found',
  '20% off at checkout',
  'Opening Trip for you',
]

const SLOT_H = 32
const GAP_PX = 24
const CONTAINER_H = 122

function computeCarouselY(activeIdx: number): number {
  const activeCenter = activeIdx * (SLOT_H + GAP_PX) + SLOT_H / 2
  return CONTAINER_H / 2 - activeCenter
}

function LoadingScreen({ carouselIndex, shimmer }: {
  carouselIndex: number
  shimmer: boolean
}) {
  const translateY = computeCarouselY(carouselIndex)

  return (
    <div className="screen loading-screen">
      <StatusBar />
      <NavBar leftIcon="close" showBrand={false} showMore={false} />

      <div className="loading-body">
        <div className="loading-icon-frame">
          <img src={tripIcon} alt="Trip" className="loading-icon-img" />
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

// ─── Third-party page (Trip.com screenshot) ───────────────────────────────────

function ThirdPartyFrame({
  onScroll,
  onWheelScroll,
  revealed = false,
}: {
  onScroll?: (scrollTop: number) => void
  onWheelScroll?: (deltaY: number) => void
  revealed?: boolean
}) {
  return (
    <div
      className={`webview-scroll-area${revealed ? ' webview-scroll-area--revealed' : ''}`}
      onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
      onWheel={(e) => onWheelScroll?.(e.deltaY)}
    >
      <div className="webview-img-crop">
        <img
          src={webviewContent}
          alt="Yellowstone National Park – Trip.com booking page"
          className="webview-content-img"
          draggable={false}
        />
      </div>
    </div>
  )
}

type WebviewLayoutOption = 1 | 2

interface WebviewScreenProps {
  layoutOption: WebviewLayoutOption
  preloading?: boolean
  onCashbackTap: () => void
  showPopover: boolean
  onClosePopover: () => void
  onClose: () => void
  glowKey: number
}

// ─── Cashback badge — continuous gradient arc (Figma 1028:24340) ─────────────

interface CashbackBadgeProps {
  glowKey: number
  onClick: () => void
  placement?: 'bottom' | 'nav'
}

const ARC_LOOP_DURATION_S = 3.1
const ARC_FADE_DELAY_MS = 3000

const ARC_GRAD_STOPS = (
  <>
    <stop offset="0%" stopColor="#FDF2F8" stopOpacity="0" />
    <stop offset="10%" stopColor="#FDF2F8" stopOpacity="0.45" />
    <stop offset="50%" stopColor="#F08BA8" stopOpacity="0.85" />
    <stop offset="90%" stopColor="#FDF2F8" stopOpacity="0.45" />
    <stop offset="100%" stopColor="#FDF2F8" stopOpacity="0" />
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

function CashbackBadge({ glowKey, onClick, placement = 'bottom' }: CashbackBadgeProps) {
  const badgeRef = useRef<HTMLButtonElement>(null)
  const gradientRef = useRef<SVGLinearGradientElement>(null)
  const arcAngleRef = useRef(0)
  const arcRafRef = useRef(0)
  const { count, landed } = useCashbackCountUp(20, 900, 350)
  const [pillSize, setPillSize] = useState({ w: 180, h: 28 })
  const [arcComplete, setArcComplete] = useState(false)
  const [arcSoftened, setArcSoftened] = useState(false)
  const gradId = `badge-arc-${glowKey}`

  useEffect(() => {
    const el = badgeRef.current
    if (!el) return

    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      setPillSize({
        w: Math.max(Math.round(width), 1),
        h: Math.max(Math.round(height), 1),
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [glowKey])

  useEffect(() => {
    setArcComplete(false)
    const t = setTimeout(() => setArcComplete(true), 3300)
    return () => clearTimeout(t)
  }, [glowKey])

  useEffect(() => {
    setArcSoftened(false)
    const t = setTimeout(() => setArcSoftened(true), ARC_FADE_DELAY_MS)
    return () => clearTimeout(t)
  }, [glowKey])

  const inset = 0.75
  const rx = Math.max((pillSize.h - inset * 2) / 2, 0)
  const cx = pillSize.w / 2
  const cy = pillSize.h / 2

  // Continuous linear rotation — avoids the snap-back stutter at each SMIL loop
  useEffect(() => {
    if (arcSoftened) {
      cancelAnimationFrame(arcRafRef.current)
      return
    }

    arcAngleRef.current = 0
    let lastTs = 0
    const degPerSec = 360 / ARC_LOOP_DURATION_S

    const tick = (ts: number) => {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0
      lastTs = ts
      arcAngleRef.current += degPerSec * dt
      gradientRef.current?.setAttribute(
        'gradientTransform',
        `rotate(${arcAngleRef.current} ${cx} ${cy})`,
      )
      arcRafRef.current = requestAnimationFrame(tick)
    }

    arcRafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(arcRafRef.current)
  }, [cx, cy, arcSoftened, glowKey])

  return (
    <div
      key={glowKey}
      className={`cashback-badge-wrap${placement === 'nav' ? ' cashback-badge-wrap--nav' : ''}`}
    >
      <svg
        className={`cashback-glow-svg${arcSoftened ? ' cashback-glow-svg--softened' : ''}`}
        viewBox={`0 0 ${pillSize.w} ${pillSize.h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            ref={gradientRef}
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={cy}
            x2={pillSize.w}
            y2={cy}
          >
            {ARC_GRAD_STOPS}
          </linearGradient>
        </defs>
        <rect
          className="cashback-glow-rect"
          x={inset}
          y={inset}
          width={Math.max(pillSize.w - inset * 2, 0)}
          height={Math.max(pillSize.h - inset * 2, 0)}
          rx={rx}
          ry={rx}
          pathLength="360"
          stroke={`url(#${gradId})`}
        />
      </svg>
      <button
        ref={badgeRef}
        className={`cashback-badge${placement === 'nav' ? ' cashback-badge--nav' : ''}`}
        onClick={onClick}
        aria-label="20% off at checkout — tap for details"
      >
        <span className={`cashback-copy${arcComplete ? ' cashback-copy--twinkle' : ''}`}>
          <span className={`cashback-amount${landed ? ' cashback-amount--landed' : ''}`}>{count}%</span>
          <span className="cashback-text">off at checkout</span>
        </span>
        <IconChevronRight />
      </button>
    </div>
  )
}

// ─── Webview Screen ───────────────────────────────────────────────────────────

const POPOVER_EXIT_MS = 225

function LayoutChipGroup({
  value,
  onChange,
}: {
  value: WebviewLayoutOption
  onChange: (value: WebviewLayoutOption) => void
}) {
  return (
    <div className="layout-chip-group" role="group" aria-label="Webview layout">
      <button
        type="button"
        aria-pressed={value === 1}
        className={`layout-chip${value === 1 ? ' layout-chip--selected' : ''}`}
        onClick={() => onChange(1)}
      >
        Option 1
      </button>
      <button
        type="button"
        aria-pressed={value === 2}
        className={`layout-chip${value === 2 ? ' layout-chip--selected' : ''}`}
        onClick={() => onChange(2)}
      >
        Option 2
      </button>
    </div>
  )
}

function WebviewScreen({
  layoutOption,
  preloading = false,
  onCashbackTap,
  showPopover,
  onClosePopover,
  onClose,
  glowKey,
}: WebviewScreenProps) {
  const [popoverVisible, setPopoverVisible] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [navCompact, setNavCompact] = useState(false)
  const lastScrollTopRef = useRef(0)
  const syntheticScrollRef = useRef(0)
  const isClosingRef = useRef(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleContentScroll = useCallback((scrollTop: number) => {
    const lastScrollTop = lastScrollTopRef.current
    const delta = scrollTop - lastScrollTop

    syntheticScrollRef.current = scrollTop
    setNavScrolled(scrollTop > 0)

    if (scrollTop <= 0) {
      setNavCompact(false)
    } else if (delta > 2) {
      setNavCompact(true)
    } else if (delta < -2) {
      setNavCompact(false)
    }

    lastScrollTopRef.current = scrollTop
  }, [])

  const handleContentWheel = useCallback((deltaY: number) => {
    if (deltaY > 0) {
      syntheticScrollRef.current += Math.abs(deltaY)
      setNavScrolled(true)
      setNavCompact(true)
    } else if (deltaY < 0) {
      syntheticScrollRef.current = Math.max(0, syntheticScrollRef.current - Math.abs(deltaY))
      setNavCompact(false)
      if (syntheticScrollRef.current <= 0) {
        setNavScrolled(false)
      }
    }
  }, [])

  useEffect(() => {
    setNavScrolled(false)
    setNavCompact(false)
    lastScrollTopRef.current = 0
    syntheticScrollRef.current = 0
  }, [glowKey, layoutOption])

  const dismissPopover = useCallback(() => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    setPopoverOpen(false)
    exitTimerRef.current = setTimeout(() => {
      setPopoverVisible(false)
      isClosingRef.current = false
      onClosePopover()
    }, POPOVER_EXIT_MS)
  }, [onClosePopover])

  useEffect(() => {
    if (!showPopover) return
    isClosingRef.current = false
    setPopoverVisible(true)
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPopoverOpen(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [showPopover])

  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
  }, [])

  return (
    <div className={`screen webview-screen${layoutOption === 2 ? ' webview-screen--option2' : ''}${preloading ? ' webview-screen--preloading' : ''}`}>
      {layoutOption === 2 ? (
        <header className={`webview-header-option2${navCompact ? ' webview-header-option2--compact' : ''}`}>
          <StatusBar />
          <NavBar
            leftIcon="close"
            onLeftTap={onClose}
            title="Trip"
            showBrand={false}
            scrolled={navScrolled}
            compact={navCompact}
            centerBadge={
              !preloading ? (
                <CashbackBadge glowKey={glowKey} onClick={onCashbackTap} placement="nav" />
              ) : undefined
            }
          />
        </header>
      ) : (
        <>
          <StatusBar />
          <NavBar leftIcon="close" onLeftTap={onClose} subtitle="trip.com" scrolled={navScrolled} compact={navCompact} />
        </>
      )}

      <ThirdPartyFrame
        revealed={!preloading}
        onScroll={handleContentScroll}
        onWheelScroll={handleContentWheel}
      />

      <div className={`webview-bottom-bar${layoutOption === 2 ? ' webview-bottom-bar--center' : ''}`}>
        <div className="webview-nav-group">
          <button className="webview-icon-btn" aria-label="Go back">
            <IconNavBack />
          </button>
          <button className="webview-icon-btn" aria-label="Go forward">
            <IconNavForward />
          </button>
        </div>

        {layoutOption === 1 && !preloading && (
          <CashbackBadge glowKey={glowKey} onClick={onCashbackTap} />
        )}
      </div>

      {/* Cashback explanation popover */}
      {popoverVisible && (
        <div
          className={`popover-scrim${popoverOpen ? ' popover-scrim--open' : ''}`}
          onClick={dismissPopover}
          role="dialog"
          aria-modal="true"
          aria-labelledby="popover-title"
        >
          <div className="popover-panel" onClick={(e) => e.stopPropagation()}>
            <div className="popover-sheet">
              <button
                className="popover-close-btn"
                onClick={dismissPopover}
                aria-label="Close"
              >
                <IconClose />
              </button>

              <div className="popover-art-frame">
                <ChromaKeyVideo
                  src={popoverArtVideo}
                  playTrigger={showPopover}
                  className="popover-art"
                  loopTailSeconds={1.05}
                />
              </div>

              <div className="popover-body">
                <div className="popover-copy">
                  <h2 id="popover-title" className="popover-title">
                    Sit back and enjoy 20% off at checkout
                  </h2>
                  <p className="popover-subtitle">
                    Stay on this browser when you book with Trip to keep your discount.
                  </p>
                </div>

                <div className="popover-stats" role="group" aria-label="Offer details">
                  <div className="popover-stat">
                    <span className="popover-stat-label">Max discount</span>
                    <span className="popover-stat-value">$20</span>
                  </div>
                  <div className="popover-stat-divider" aria-hidden="true" />
                  <div className="popover-stat">
                    <span className="popover-stat-label">Valid till</span>
                    <span className="popover-stat-value">31 Dec 25</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="popover-cta-area">
              <button className="cta-primary-btn cta-primary-btn--sweep" onClick={dismissPopover}>
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
  const [layoutOption, setLayoutOption] = useState<WebviewLayoutOption>(1)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselShimmer, setCarouselShimmer] = useState(false)
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
    setWebviewGlowKey((k) => k + 1)
    setAppState('loading')

    const t1 = setTimeout(() => setCarouselIndex(1), 1100)
    const t2 = setTimeout(() => setCarouselIndex(2), 2400)
    const tShimmer = setTimeout(() => setCarouselShimmer(true), 2980)
    const t3 = setTimeout(() => setAppState('webview'), 4200)

    timersRef.current = [t1, t2, tShimmer, t3]
  }, [clearTimers])

  const handleCloseWebview = useCallback(() => {
    clearTimers()
    setAppState('poi')
  }, [clearTimers])

  useEffect(() => () => clearTimers(), [clearTimers])

  const showWebviewLayer = appState === 'loading' || appState === 'webview' || appState === 'popover'

  return (
    <div className="app-shell">
      <div className="demo-stage">
        <div className="device-frame">
          {appState === 'poi' && (
            <PoiScreen onShelfTap={handleShelfTap} />
          )}

          {showWebviewLayer && (
            <WebviewScreen
              layoutOption={layoutOption}
              preloading={appState === 'loading'}
              onCashbackTap={() => setAppState('popover')}
              showPopover={appState === 'popover'}
              onClosePopover={() => setAppState('webview')}
              onClose={handleCloseWebview}
              glowKey={webviewGlowKey}
            />
          )}

          {appState === 'loading' && (
            <LoadingScreen carouselIndex={carouselIndex} shimmer={carouselShimmer} />
          )}
        </div>

        <LayoutChipGroup value={layoutOption} onChange={setLayoutOption} />
      </div>
    </div>
  )
}
