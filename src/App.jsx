import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage         from './pages/LoginPage'
import Dashboard         from './pages/Dashboard'
import TransaccionesPage from './pages/TransaccionesPage'
import MetasPage         from './pages/MetasPage'
import InversionesPage   from './pages/InversionesPage'
import ConfigPage        from './pages/ConfigPage'
import ReportesPage      from './pages/ReportesPage'
import BottomNav         from './components/BottomNav'
import TransactionModal  from './components/TransactionModal'

// Módulo REGISTRO — con nav inferior y modal
function ModuloRegistro({ onAdd, refreshKey, onSaved }) {
  return (
    <>
      <Routes>
        <Route path="/"              element={<Dashboard       refresh={refreshKey} onRegistrarPago={onAdd} />} />
        <Route path="/transacciones" element={<TransaccionesPage refresh={refreshKey} />} />
        <Route path="/metas"         element={<MetasPage />} />
        <Route path="/inversiones"   element={<InversionesPage />} />
        <Route path="/config"        element={<ConfigPage />} />
      </Routes>
      <BottomNav onAdd={() => onAdd(null)} />
    </>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const [modal,      setModal]      = useState(null)
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

  function abrirModal(prefill) { setModal({ prefill }) }
  function cerrarModal()       { setModal(null) }
  function handleSaved()       { setRefreshKey(k => k + 1); cerrarModal() }

  return (
    <>
      <Routes>
        {/* Módulo SEGUIMIENTO — standalone, sin BottomNav */}
        <Route path="/reportes" element={<ReportesPage />} />

        {/* Módulo REGISTRO — con BottomNav */}
        <Route path="/*" element={
          <ModuloRegistro
            onAdd={abrirModal}
            refreshKey={refreshKey}
            onSaved={handleSaved}
          />
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {/* Modal global — solo activo en módulo registro */}
      {modal && (
        <TransactionModal
          prefill={modal.prefill}
          onClose={cerrarModal}
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
