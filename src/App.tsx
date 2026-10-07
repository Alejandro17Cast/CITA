import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EstablecerContrasenaPage from './pages/EstablecerContrasenaPage'
import { supabase } from './lib/supabase'
import './App.css'

type Perfil = {
  nombre: string
  rol: 'administrador' | 'encargado'
  activo: boolean
}

function solicitaContrasena() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const tipo = hash.get('type')

  return (
    url.searchParams.get('establecer-contrasena') === '1' ||
    tipo === 'invite' ||
    tipo === 'recovery'
  )
}

function limpiarEnlace() {
  const url = new URL(window.location.href)
  url.searchParams.delete('establecer-contrasena')
  url.hash = ''
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [message, setMessage] = useState('')
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [perfilUserId, setPerfilUserId] = useState<string | null>(null)
  const [perfilError, setPerfilError] = useState('')
  const [retry, setRetry] = useState(0)
  const [establecerContrasena, setEstablecerContrasena] =
    useState(solicitaContrasena)

  const userId = session?.user.id

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession)
        setLoading(false)
        setMessage('')

        if (event === 'PASSWORD_RECOVERY') {
          setEstablecerContrasena(true)
        }

        if (event === 'SIGNED_OUT') {
          setPerfil(null)
          setPerfilUserId(null)
          setPerfilError('')
        }
      }
    )

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function loadPerfil() {
      try {
        const { data, error } = await supabase
          .from('perfiles')
          .select('nombre, rol, activo')
          .eq('id', userId)
          .single()

        if (cancelled) return

        if (error || !data) {
          setPerfil(null)
          setPerfilError('No se pudo cargar tu perfil.')
        } else if (
          data.rol !== 'administrador' &&
          data.rol !== 'encargado'
        ) {
          setPerfil(null)
          setPerfilError('Tu perfil no tiene un rol válido.')
        } else {
          setPerfil({
            nombre: data.nombre,
            rol: data.rol,
            activo: data.activo,
          })
          setPerfilError('')
        }
      } catch {
        if (cancelled) return

        setPerfil(null)
        setPerfilError('No se pudo conectar para consultar tu perfil.')
      }

      if (!cancelled) setPerfilUserId(userId ?? null)
    }

    void loadPerfil()

    return () => {
      cancelled = true
    }
  }, [userId, retry])

  async function handleSignOut() {
    if (signingOut) return

    setSigningOut(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })

      if (error) {
        setMessage('No se pudo cerrar sesión. Intentá nuevamente.')
      } else {
        setSession(null)
        setPerfil(null)
        setPerfilUserId(null)
        setPerfilError('')
        setEstablecerContrasena(false)
        limpiarEnlace()
      }
    } catch {
      setMessage('No se pudo conectar para cerrar sesión.')
    } finally {
      setSigningOut(false)
    }
  }

  function retryPerfil() {
    setPerfilUserId(null)
    setPerfilError('')
    setRetry((value) => value + 1)
  }

  function completarContrasena() {
    limpiarEnlace()
    setEstablecerContrasena(false)
    retryPerfil()
  }

  if (loading) {
    return (
      <main className="login">
        <p role="status">Cargando CITA…</p>
      </main>
    )
  }
  if (establecerContrasena) {
  return (
    <>
      <EstablecerContrasenaPage
        tieneSesion={false}
        onComplete={() => void handleSignOut()}
        onCancel={() => void handleSignOut()}
      />

      {message && <p role="alert">{message}</p>}
    </>
  )
}

  if (!session) {
    if (establecerContrasena) {
      return (
        <EstablecerContrasenaPage
          tieneSesion={false}
          onComplete={completarContrasena}
          onCancel={() => {
            limpiarEnlace()
            setEstablecerContrasena(false)
          }}
        />
      )
    }

    return <LoginPage />
  }

  const perfilLoading = perfilUserId !== userId

  if (!perfilLoading && !perfilError && perfil?.activo) {
    if (establecerContrasena) {
      return (
        <>
          <EstablecerContrasenaPage
            tieneSesion
            onComplete={completarContrasena}
            onCancel={() => {
              void handleSignOut()
            }}
          />

          {message && <p role="alert">{message}</p>}
        </>
      )
    }

    return (
      <DashboardPage
        nombre={perfil.nombre}
        rol={perfil.rol}
        signingOut={signingOut}
        message={message}
        onSignOut={handleSignOut}
      />
    )
  }

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__brand">
          <h1>CITA</h1>
          <p>Quinta Anfuso</p>
        </header>

        <div className="login__heading">
          {perfilLoading ? (
            <p role="status">Cargando tu perfil…</p>
          ) : perfilError ? (
            <>
              <h2>No pudimos cargar tu perfil</h2>
              <p role="alert">{perfilError}</p>
              <button
                type="button"
                className="login__toggle"
                onClick={retryPerfil}
              >
                Intentar nuevamente
              </button>
            </>
          ) : (
            <>
              <h2>Cuenta desactivada</h2>
              <p>Contactá al administrador para recuperar el acceso.</p>
            </>
          )}
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