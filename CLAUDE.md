# tapbeat

TapBeat: a free drum pad and beat maker on FreeAppStore — a 4×4 pad grid with synthesised kits
(Web Audio, no samples), a 16-step sequencer, live recording and WAV export. Patterns stay on the
device (localStorage). Currently a "Coming soon" shell (Pads, About); see
freeappstore-online/platform#212.

- Live: https://tapbeat.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- Every sound is synthesised; never add sample files that would need a licence.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
