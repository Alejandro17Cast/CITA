import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './LoginPage.css'

function Isotipo() {
  return (
    <img
      className="cita-login__isotipo"
      src="/cita-identidad.png"
      alt="Isotipo de CITA"
    />
  )
}
function Hojas({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 360"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M120 345C118 260 125 130 160 20"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {[0, 1, 2, 3, 4, 5, 6].map((numero) => (
        <g key={numero} transform={`translate(0 ${numero * 38})`}>
          <path
            d="M140 70C110 26 66 24 30 30C63 65 96 81 140 70Z"
            fill="currentColor"
          />
          <path
            d="M141 72C159 31 198 13 226 12C212 50 183 76 141 72Z"
            fill="currentColor"
          />
        </g>
      ))}
    </svg>
  )
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    setMessage('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setMessage(
          error.code === 'invalid_credentials'
            ? 'El correo o la contraseña son incorrectos.'
            : error.code === 'email_not_confirmed'
              ? 'Tu correo todavía no está confirmado.'
              : 'No se pudo iniciar sesión. Intentá nuevamente.'
        )
      }
    } catch {
      setMessage('No se pudo conectar. Revisá tu conexión a internet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="cita-login">
      <Hojas className="cita-login__fondo-hojas cita-login__fondo-hojas--izquierda" />
      <Hojas className="cita-login__fondo-hojas cita-login__fondo-hojas--derecha" />

      <section
        className="cita-login__card"
        aria-labelledby="cita-login-title"
      >
        <div className="cita-login__contenido">
          <header className="cita-login__marca">
            <span>CITA</span>
            <p>QUINTA ANFUSO</p>
          </header>

          <div className="cita-login__heading">
            <span className="cita-login__eyebrow">BIENVENIDO DE NUEVO</span>
            <h1 id="cita-login-title">Iniciar sesión</h1>
            <p>Ingresá a tu cuenta para gestionar las reservaciones.</p>
          </div>

          <form className="cita-login__form" onSubmit={handleSubmit}>
            <div className="cita-login__field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="nombre@ejemplo.com"
                disabled={loading}
                required
              />
            </div>

            <div className="cita-login__field">
              <label htmlFor="password">Contraseña</label>

              <div className="cita-login__password">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingresá tu contraseña"
                  disabled={loading}
                  required
                />

                <button
                  type="button"
                  className="cita-login__toggle"
                  aria-controls="password"
                  aria-pressed={showPassword}
                  disabled={loading}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="cita-login__submit"
              disabled={loading}
            >
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
              <span aria-hidden="true">→</span>
            </button>

            <p className="cita-login__message" role="status">
              {message}
            </p>
          </form>

          <footer className="cita-login__footer">
            <span aria-hidden="true">•</span>
            Acceso exclusivo para personal autorizado.
          </footer>
        </div>

        <div className="cita-login__visual">
          <Hojas className="cita-login__hojas cita-login__hojas--arriba" />
          <Hojas className="cita-login__hojas cita-login__hojas--abajo" />

          <svg
            className="cita-login__curvas"
            viewBox="0 0 180 700"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 0H135C175 100 40 160 105 250C170 340 30 405 95 500C145 580 100 645 160 700H0Z"
              fill="#edb895"
            />
            <path
              d="M0 0H100C140 100 5 160 70 250C135 340 -5 405 60 500C110 580 65 645 125 700H0Z"
              fill="#fde3cf"
            />
            <path
              d="M0 0H65C105 100 -30 160 35 250C100 340 -40 405 25 500C75 580 30 645 90 700H0Z"
              fill="#ffffff"
            />
          </svg>

          <div className="cita-login__identidad">
            <div className="cita-login__logo">
              <Isotipo />
            </div>

            <h2>CITA</h2>
            <p>Control Inteligente de Tiempos y Agendamiento</p>
            <span className="cita-login__quinta">QUINTA ANFUSO</span>
          </div>
        </div>
      </section>
    </main>
  )
}