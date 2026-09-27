import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import AlertsPage from './pages/AlertsPage'
import JobsPage from './pages/JobsPage'

export default function App() {
  return (
    <BrowserRouter>
      <header>
        <h1>PSC Helper</h1>
        <Link to="/">Jobs</Link>
        <Link to="/alerts">Alerts</Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<JobsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
