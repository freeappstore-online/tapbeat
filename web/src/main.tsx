import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { engine } from './audio'

// Mobile browsers keep audio suspended until a user gesture; the first tap
// anywhere creates and unlocks the AudioContext so pads play instantly.
engine.unlockOnFirstGesture(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
