import { PageHeader } from '@freeappstore/sdk/ui'
import { Section } from './saves/SavesView'

export default function Privacy() {
  return (
    <>
      <PageHeader title="Privacy" description="What TapBeat keeps, where, and what leaves your device." />
      <PrivacyNote />
    </>
  )
}

export function PrivacyNote() {
  return (
    <Section id="privacy-note" title="Your beats stay on this device">
      <ul className="grid list-disc gap-2 pl-5">
        <li>
          Nothing you play or record leaves this device. Every sound is synthesised in your browser, a
          recorded jam is a list of pad hits kept in the app (TapBeat never uses the microphone), and WAV
          exports are rendered on the device and downloaded straight to it.
        </li>
        <li>
          What's stored: your saved patterns (names, steps, kit, tempo, swing, mute and solo, patterns A
          and B, and recorded jams) and the beat you're working on. They're kept only in this browser on
          this device. Nothing is uploaded, and TapBeat never sends them anywhere.
        </li>
        <li>
          No account is needed. Signing in to FreeAppStore is optional, and TapBeat doesn't add any of
          your data to your account.
        </li>
        <li>
          Page-view counts: the app loads FreeAppStore's store analytics script, which records which
          screen you opened (for example /sequencer), the page that linked here, and the time. It's sent
          to FreeAppStore without cookies and without your account, and held in this browser while
          you're offline. Your patterns, recordings and exports are never included.
        </li>
        <li>
          TapBeat is served via FreeAppStore, which also loads Cloudflare Web Analytics (beacon.min.js
          from static.cloudflareinsights.com). It doesn't use cookies and reports only aggregate
          page-view statistics, such as page load times and visit counts. As with any website, the
          servers handling these requests see your IP address and browser type.
        </li>
        <li>No ads, no tracking cookies, and no advertising or tracking SDKs.</li>
        <li>
          Clearing this browser's data or uninstalling the app deletes your saved patterns. Export a
          backup from the Saves screen to keep a copy.
        </li>
      </ul>
    </Section>
  )
}
