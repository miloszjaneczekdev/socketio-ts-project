import { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './Main.css'

import SVGFilters from './SVGFilters'

const Index = lazy(() => import('./Index'))
const Lobby = lazy(() => import('./Lobby'))
const Game = lazy(() => import('./Game'))
const Summary = lazy(() => import('./Summary'))
const LobbiesPage = lazy(() => import('./Lobbies'))
const SocketRoute = lazy(() => import('./SocketRoute'))
const PaperPlaneFolding = lazy(() => import('./PaperPlaneFolding'))

const HowToPlay = lazy(() => import('./pages/HowToPlay'))
const Rules = lazy(() => import('./pages/Rules'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Contact = lazy(() => import('./pages/Contact'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <SVGFilters />
    <Suspense fallback={<div className="loadingMessage">Ladowanie...</div>}>
      <Routes>
        <Route path="/" element={<SocketRoute><Index /></SocketRoute>} />
        <Route path="/lobby" element={<SocketRoute><Lobby /></SocketRoute>} />
        <Route path="/game" element={<SocketRoute><Game /></SocketRoute>} />
        <Route path="/summary" element={<SocketRoute><Summary /></SocketRoute>} />
        <Route path="/lobbies" element={<SocketRoute><LobbiesPage /></SocketRoute>} />

        <Route path="/howtoplay" element={<HowToPlay />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/termsofservice" element={<TermsOfService />} />
        <Route path="/privacypolicy" element={<PrivacyPolicy />} />

        <Route path="/plane" element={<PaperPlaneFolding />} />
      </Routes>
    </Suspense>
  </BrowserRouter>,
)
