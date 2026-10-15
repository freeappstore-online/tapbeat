import { useSyncExternalStore } from 'react'
import type { Sequencer } from './sequencer'

interface JamBarProps {
  sequencer: Sequencer
  /** Called inside the tap, before anything starts (unlocks audio). */
  onBeforePlay?: () => void
}

/** Play the loop and record a jam over it, from the pads screen. */
export function JamBar({ sequencer, onBeforePlay }: JamBarProps) {
  const state = useSyncExternalStore(sequencer.subscribe, sequencer.getState)
  const { playing, recording, take } = state

  const togglePlay = () => {
    if (playing) return sequencer.stop()
    onBeforePlay?.()
    sequencer.start()
  }

  const toggleRecord = () => {
    if (!playing) onBeforePlay?.()
    sequencer.toggleRecord()
  }

  return (
    <div className="jam-bar">
      <button type="button" className="seq-play" aria-pressed={playing} onClick={togglePlay}>
        {playing ? 'Stop' : 'Play'}
      </button>
      <RecordButton recording={recording} onClick={toggleRecord} />
      <p className="jam-status" aria-live="polite">
        {recording
          ? 'Recording: play the pads'
          : take
            ? `Jam: ${take.bars} bar${take.bars === 1 ? '' : 's'}, loops with the pattern`
            : 'Record a jam over the loop'}
      </p>
      {take && !recording && (
        <button type="button" className="jam-clear" onClick={() => sequencer.clearTake()}>
          Clear jam
        </button>
      )}
    </div>
  )
}

export function RecordButton({ recording, onClick }: { recording: boolean; onClick: () => void }) {
  return (
    <button type="button" className="seq-record" aria-pressed={recording} aria-label="Record" onClick={onClick}>
      <span className="seq-record-dot" aria-hidden="true" />
      Rec
    </button>
  )
}
