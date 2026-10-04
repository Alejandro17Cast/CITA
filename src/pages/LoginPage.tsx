import { useState } from 'react'
import type { FormEvent } from 'react'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setMessage(
      'El formulario está listo. El acceso se habilitará al conectar Supabase.'
    )
  }

  return (
    <main className="login">
      <section className="login__card" aria-labelledby="login-title">
        <header className="login__brand">
          <span className="login__location">QUINTA ANFUSO</span>
          <h1>CITA</h1>
          <p>Control Inteligente de Tiempos y Agendamiento</p>
        </header>

        <div className="login__heading">
          <h2 id="login-title">Bienvenido de nuevo</h2>
          <p>Ingresá con tu cuenta para gestionar las reservaciones.</p>
        </div>

        <form className="login__form" onSubmit={handleSubmit}>
          <div className="login__field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="nombre@ejemplo.com"
              required
            />
          </div>

          <div className="login__field">
            <label htmlFor="password">Contraseña</label>

            <div className="login__password">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ingresá tu contraseña"
                required
              />

              <button
                type="button"
                className="login__toggle"
                aria-controls="password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button type="submit" className="login__submit">
            Iniciar sesión
          </button>

          <p className="login__message" role="status">
            {message}
          </p>
        </form>

        <footer className="login__footer">
          Acceso exclusivo para personal autorizado.
        </footer>
      </section>
    </main>
  )
}