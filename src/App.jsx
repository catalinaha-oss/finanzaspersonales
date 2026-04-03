import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import TransaccionesPage from './pages/TransaccionesPage'
import MetasPage from './pages/MetasPage'
import InversionesPage from './pages/InversionesPage'
import ConfigPage from './pages/ConfigPage'
import BottomNav from './components/BottomNav'
import TransactionModal from './components/TransactionModal'

function AppRoutes() {
  const { user, loading } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bg4)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ fontSize: '0.85rem' }}>Cargando...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!user) return <LoginPage />

  function handleSaved() { setRefreshKey(k => k + 1) }

  return (
    <>
      <Routes>
        <Route path="/"              element={<Dashboard refresh={refreshKey} />} />
        <Route path="/transacciones" element={<TransaccionesPage refresh={refreshKey} />} />
        <Route path="/metas"         element={<MetasPage />} />
        <Route path="/inversiones"   element={<InversionesPage />} />
        <Route path="/config"        element={<ConfigPage />} />
        <Route path="*"              element={<Navigate to="/" />} />
      </Routes>
      <BottomNav onAdd={() => setShowModal(true)} />
      {showModal && (
        <TransactionModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
