import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import AboutPage from './pages/AboutPage'
import AlertsPage from './pages/AlertsPage'
import JobsPage from './pages/JobsPage'
import ManagePage from './pages/ManagePage'
import PrivacyPage from './pages/PrivacyPage'
import UnsubscribePage from './pages/UnsubscribePage'
import VerifyPage from './pages/VerifyPage'

// Admin code is loaded only when /admin is opened
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))

export default function App() {
  return (
    <BrowserRouter>
      <header>
        <h1><Link to="/">PSC Helper</Link></h1>
        <NavLink to="/" end>Jobs</NavLink>
        <NavLink to="/alerts">Alerts</NavLink>
      </header>
      <main>
        <Suspense fallback={<p>Loading…</p>}>
          <Routes>
            <Route path="/" element={<JobsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/manage" element={<ManagePage />} />
            <Route path="/manage/:token" element={<ManagePage />} />
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<p>Page not found. <Link to="/">Go to job search</Link></p>} />
          </Routes>
        </Suspense>
      </main>
      <footer>
        <p>
          Not affiliated with Kerala PSC. Always confirm in the official notification before applying.{' '}
          <Link to="/about#disclaimer">Disclaimer</Link>
        </p>
        <p><Link to="/about">About</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/manage">Manage alerts</Link></p>
      </footer>
    </BrowserRouter>
  )
}
