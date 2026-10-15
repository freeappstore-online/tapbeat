import { useCallback, useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { engine, KITS, PAD_NAMES, type KitId } from './audio'
import { PadGrid } from './pads/PadGrid'
import { sequencer } from './sequencer'
import { exportWav } from './sequencer/export'
import { JamBar } from './sequencer/JamBar'
import { SequencerView } from './sequencer/SequencerView'

const fas = initApp({ appId: 'tapbeat' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Pads', href: '/', title: 'TapBeat' },
  { label: 'Sequencer', href: '/sequencer', title: 'Sequencer — TapBeat' },
  { label: 'About', href: '/about', title: 'About — TapBeat' },
]

// The features planned for v1 (freeappstore-online/platform#212); `ready`
// marks the ones that work today.
const FEATURES = [
  { name: 'Pads', ready: true, what: 'A 4×4 grid that plays the moment you tap, with several fingers at once.' },
  { name: 'Kits', ready: true, what: '808-style, acoustic-ish, lo-fi and electro, every sound synthesised.' },
  { name: 'Sequencer', ready: true, what: '16 steps per pad, 60–180 BPM, swing, mute and solo, patterns A and B.' },
  { name: 'Record', ready: true, what: 'Jam live over the loop and keep the take.' },
  { name: 'Export', ready: true, what: 'Download your pattern or recording as a WAV file.' },
  { name: 'Private', ready: false, what: 'Patterns stay on your device. No account; export a backup any time.' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  return (
    <Shell app={fas} appName="TapBeat" nav={NAV} onNavigate={navigate}>
      <div className="screen mx-auto w-full max-w-3xl p-4 sm:p-8">{screen(path)}</div>
      <BuildInfo />
    </Shell>
  )
}

function screen(path: string) {
  if (path === '/about') return <About />
  if (path === '/sequencer') return <Sequence />
  return <Pads />
}

function Pads() {
  const [kit, setKit] = useState<KitId>(engine.kit.id)
  // Every live hit sounds, and goes into the take while recording.
  const play = useCallback((pad: number) => {
    engine.play(pad)
    sequencer.recordHit(pad)
  }, [])

  const chooseKit = (id: KitId) => {
    engine.setKit(id)
    setKit(id)
  }

  return (
    <>
      {/* On short (landscape phone) screens the title is visually hidden to give the pads the room. */}
      <div className="screen-title">
        <PageHeader title="TapBeat" />
      </div>
      <div className="pads-controls">
        <div role="radiogroup" aria-label="Kit" className="kit-picker">
          {KITS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={k.id === kit}
              onClick={() => chooseKit(k.id)}
            >
              {k.name}
            </button>
          ))}
        </div>
        <JamBar sequencer={sequencer} onBeforePlay={unlockAudio} />
      </div>
      <PadGrid names={PAD_NAMES} onHit={play} />
    </>
  )
}

// Stable references, so the playhead loop isn't restarted on every render.
const playbackTime = () => engine.playbackTime
const unlockAudio = () => void engine.unlock()
const audition = (pad: number) => engine.play(pad)
const exportCurrent = (bars: number, includeTake: boolean) =>
  exportWav(sequencer.getState(), engine.kit, bars, includeTake)

function Sequence() {
  return (
    <>
      <div className="screen-title">
        <PageHeader title="Sequencer" />
      </div>
      <SequencerView
        sequencer={sequencer}
        now={playbackTime}
        onBeforePlay={unlockAudio}
        audition={audition}
        onExport={exportCurrent}
      />
    </>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <p className="text-[var(--muted)]">
        TapBeat is a free drum pad and beat maker: tap out rhythms on 16 pads, build loops in a step
        sequencer, and export what you make as a WAV file. Every sound is synthesised in your
        browser, so it works offline and nothing you play leaves your device. No account, no ads.
      </p>
      <p className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
        TapBeat is in development. Everything but saving works now; saving patterns is coming soon.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">
              {feature.name}
              {!feature.ready && <span className="font-normal text-[var(--muted)]"> · coming soon</span>}
            </p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[var(--muted)]">
        TapBeat is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        .
      </p>
    </>
  )
}
