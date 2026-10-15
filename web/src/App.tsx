import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'tapbeat' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Pads', href: '/', title: 'TapBeat' },
  { label: 'About', href: '/about', title: 'About — TapBeat' },
]

// The features planned for v1 (freeappstore-online/platform#212).
const FEATURES = [
  { name: 'Pads', what: 'A 4×4 grid that plays the moment you tap, with several fingers at once.' },
  { name: 'Kits', what: '808-style, acoustic-ish, lo-fi and electro, every sound synthesised.' },
  { name: 'Sequencer', what: '16 steps per pad, 60–180 BPM, swing, mute and solo, patterns A and B.' },
  { name: 'Record', what: 'Jam live over the loop and keep the take.' },
  { name: 'Export', what: 'Download your pattern or recording as a WAV file.' },
  { name: 'Private', what: 'Patterns stay on your device. No account; export a backup any time.' },
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
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">{path === '/about' ? <About /> : <Pads />}</div>
      <BuildInfo />
    </Shell>
  )
}

function Pads() {
  return (
    <>
      <PageHeader
        title="TapBeat"
        description="Coming soon — a free drum pad and beat maker: 16 synthesised pads and a step sequencer. Private and offline."
      />
      <ComingSoon />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <ComingSoon />
      <p className="mt-4 text-[var(--muted)]">
        TapBeat will be a free drum pad and beat maker: tap out rhythms on 16 pads, build loops in a
        step sequencer, and export what you make as a WAV file. Every sound will be synthesised in
        your browser, so it works offline and nothing you play leaves your device. No account, no
        ads.
      </p>
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

// Placeholder until the features are built. None of them work yet, so it says so plainly.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Coming soon. TapBeat is in development; the features below aren't available yet.
    </p>
  )
}
