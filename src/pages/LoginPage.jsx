import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]       = useState('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const fn = mode === 'login' ? signIn : signUp
    const { error: err } = await fn(email, password)
    setLoading(false)
    if (err) {
      const msgs = {
        'Invalid login credentials': 'Correo o contraseña incorrectos.',
        'Email not confirmed': 'Confirma tu correo antes de ingresar.',
        'User already registered': 'Este correo ya está registrado.',
      }
      setError(msgs[err.message] || err.message)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      background: 'var(--bg)'
    }}>
      {/* Logo */}
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, background: 'var(--accent)',
          borderRadius: '16px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 1rem',
          boxShadow: '0 8px 24px rgba(79,142,247,0.35)'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Finanzas</h1>
        <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginTop: 4 }}>
          {mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="input-group">
            <label>Correo electrónico</label>
            <input className="input" type="email" placeholder="tu@correo.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="input-group">
            <label>Contraseña</label>
            <input className="input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              minLength={6} required />
          </div>

          {error && (
            <div style={{ background: 'rgba(247,95,95,0.1)', border: '1px solid rgba(247,95,95,0.3)', borderRadius: 8, padding: '0.65rem 0.9rem', color: 'var(--red)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary w-full" type="submit"
            disabled={loading} style={{ justifyContent: 'center', marginTop: 4 }}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.25rem', color: 'var(--text2)', fontSize: '0.875rem' }}>
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.875rem', fontWeight: 500 }}>
            {mode === 'login' ? 'Crear cuenta' : 'Ingresar'}
          </button>
        </p>
      </form>
    </div>
  )
}
