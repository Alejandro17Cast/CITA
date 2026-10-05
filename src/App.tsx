import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession)
        setLoading(false)
        setMessage('')
      }
    )

    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })

      if (error) {
        setMessage('No se pudo cerrar sesión. Intentá nuevamente.')
      }
    } catch {
      setMessage('No se pudo conectar para cerrar sesión.')
    } finally {
      setSigningOut(false)
    }
  }

  if (loading) {
    return (
      <main className="login">
        <p role="status">Cargando CITA…</p>
      </main>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__brand">
          <span className="login__location">QUINTA ANFUSO</span>
          <h1>CITA</h1>
          <p>Control Inteligente de Tiempos y Agendamiento</p>
        </header>

        <div className="login__heading">
          <h2>Bienvenido a CITA</h2>
          <p>Ingresaste con {session.user.email}.</p>
        </div>

        <button
          type="button"
          className="login__submit"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>

        <p className="login__message" role="status">
          {message}
        </p>
      </section>
    </main>
  )
}

export default App