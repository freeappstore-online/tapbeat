import { useEffect, useState, useSyncExternalStore } from 'react'
import { PAD_NAMES } from '../audio/kits'
import { MAX_BPM, MIN_BPM } from '../audio/scheduler'
import { PAD_GROUPS } from '../pads/PadGrid'
import { useFitTop } from '../useFitTop'
import { hasSteps, PATTERN_IDS, STEPS } from './pattern'
import type { Sequencer } from './sequencer'

interface SequencerViewProps {
  sequencer: Sequencer
  /** Audio time being heard now, for the playhead. */
  now: () => number
  /** Called inside the Play tap, before starting (unlocks audio). */
  onBeforePlay?: () => void
  /** Plays a pad once, to hear it when picking it while stopped. */
  audition?: (pad: number) => void
}

/** The step under the playhead, polled each frame against the audio clock. */
function usePlayhead(sequencer: Sequencer, now: () => number, playing: boolean): number {
  const [step, setStep] = useState(-1)
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      setStep(sequencer.playheadAt(now()))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [sequencer, now, playing])
  return playing ? step : -1
}

/**
 * Transport (play, patterns A/B, clear, tempo, swing), a 4×4 picker of the
 * pad being edited (with mute/solo), and that pad's 16 steps as four beats of
 * four. Both grids fill the height left in the viewport.
 */
export function SequencerView({ sequencer, now, onBeforePlay, audition }: SequencerViewProps) {
  const state = useSyncExternalStore(sequencer.subscribe, sequencer.getState)
  const [track, setTrack] = useState(0)
  const playhead = usePlayhead(sequencer, now, state.playing)
  const body = useFitTop<HTMLDivElement>()
  const grid = state.patterns[state.pattern]
  const anySolo = state.solo.some(Boolean)
  const swingPercent = Math.round(state.swing * 200)

  const togglePlay = () => {
    if (state.playing) return sequencer.stop()
    onBeforePlay?.()
    sequencer.start()
  }

  const pickTrack = (pad: number) => {
    setTrack(pad)
    if (!state.playing) audition?.(pad)
  }

  return (
    <>
      <div className="seq-transport">
        <button type="button" className="seq-play" aria-pressed={state.playing} onClick={togglePlay}>
          {state.playing ? 'Stop' : 'Play'}
        </button>
        <div role="radiogroup" aria-label="Pattern" className="seq-patterns">
          {PATTERN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={state.pattern === id}
              aria-label={state.queued === id ? `Pattern ${id}, starts at the next bar` : `Pattern ${id}`}
              data-queued={state.queued === id || undefined}
              onClick={() => sequencer.selectPattern(id)}
            >
              {id}
            </button>
          ))}
        </div>
        <button type="button" className="seq-clear" onClick={() => sequencer.clear()}>
          Clear {state.pattern}
        </button>
        <label className="seq-slider">
          <span>Tempo</span>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            aria-label="Tempo"
            value={state.bpm}
            onChange={(e) => sequencer.setBpm(Number(e.target.value))}
          />
          <output>{state.bpm} BPM</output>
        </label>
        <label className="seq-slider">
          <span>Swing</span>
          <input
            type="range"
            min={0}
            max={100}
            aria-label="Swing"
            step={5}
            value={swingPercent}
            onChange={(e) => sequencer.setSwing(Number(e.target.value) / 200)}
          />
          <output>{swingPercent}%</output>
        </label>
      </div>

      <div ref={body} className="seq-body">
        <div role="radiogroup" aria-label="Pad to edit" className="seq-tracks">
          {PAD_NAMES.map((name, pad) => {
            const silent = anySolo ? !state.solo[pad] : state.mute[pad]
            return (
              <button
                key={pad}
                type="button"
                role="radio"
                aria-checked={pad === track}
                className="seq-track"
                data-group={PAD_GROUPS[pad]}
                data-silent={silent || undefined}
                onClick={() => pickTrack(pad)}
              >
                <span className="seq-track-name">{name}</span>
                <span className="seq-track-flags" aria-hidden="true">
                  {state.mute[pad] && 'M'}
                  {state.solo[pad] && 'S'}
                  {hasSteps(grid, pad) && <span className="seq-dot" />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="seq-editor" data-group={PAD_GROUPS[track]}>
          <div className="seq-editor-head">
            <span className="seq-editor-name">
              {PAD_NAMES[track]} · {state.pattern}
            </span>
            <button type="button" aria-pressed={state.mute[track]} onClick={() => sequencer.toggleMute(track)}>
              Mute
            </button>
            <button type="button" aria-pressed={state.solo[track]} onClick={() => sequencer.toggleSolo(track)}>
              Solo
            </button>
          </div>
          <div role="group" aria-label={`${PAD_NAMES[track]} steps`} className="seq-steps">
            {Array.from({ length: STEPS }, (_, step) => (
              <button
                key={step}
                type="button"
                className="seq-step"
                aria-label={`Step ${step + 1}`}
                aria-pressed={grid[track][step]}
                data-downbeat={step % 4 === 0 || undefined}
                data-playhead={playhead === step || undefined}
                onClick={() => sequencer.toggleStep(track, step)}
              >
                {step + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
