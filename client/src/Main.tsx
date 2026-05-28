import { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './Main.css'


import Index from './Index'
import Lobby from './Lobby'
import Game from './Game'
import Summary from './Summary'


import SVGFilters from './SVGFilters'

import { SocketProvider } from './SocketProvider'

const LobbiesPage = lazy(() => import("./Lobbies"))

const PaperPlaneFolding = lazy(() => import("./PaperPlaneFolding"))


import HowToPlay from './pages/HowToPlay'
import Rules from './pages/Rules'
import FAQ from './pages/FAQ'
import Contact from './pages/Contact'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'

createRoot(document.getElementById('root')!).render(
  <SocketProvider>
    <BrowserRouter>
      <SVGFilters />
      <Suspense fallback={<div className="loadingMessage">Ładowanie…</div>}>
        <Routes>
          <Route path="/" element={<Index />} />

          <Route path="/lobby" element={<Lobby />} />
          <Route path="/game" element={<Game />} />
          <Route path="/summary" element={<Summary />} />

          <Route path="/lobbies" element={<LobbiesPage />} />

          <Route path="/howtoplay" element={<HowToPlay />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/termsofservice" element={<TermsOfService />} />
          <Route path="/privacypolicy" element={<PrivacyPolicy />} />

          <Route path="/plane" element={<PaperPlaneFolding />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </SocketProvider>
)
