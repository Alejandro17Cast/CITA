import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { crearClienteInvitacion } from '../lib/supabase'

type Props = {
  tieneSesion: boolean
  onComplete: () => void
  onCancel: () => void
}

export default function EstablecerContrasenaPage({
  onComplete,
  onCancel,
}: Props) {
  const [cliente] = useState(crearClienteInvitacion)

  const [enlace] = useState(() => {
    const url = new URL(window.location.href)

    return {
      token: url.searchParams.get('token_hash'),
      tipo: url.searchParams.get('type'),
    }
  })

  const [usuario, setUsuario] = useState<{
    id: string
    correo: string
  } | null>(null)

  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completado, setCompletado] = useState(false)
  const [error, setError] = useState('')

  const ocupado = useRef(false)

  const enlaceValido =
    Boolean(enlace.token) && enlace.tipo === 'invite'

  async function validarInvitacion() {
    if (ocupado.current || usuario || !enlaceValido) return

    ocupado.current = true
    setSaving(true)
    setError('')

    try {
      const { data, error: verifyError } =
        await cliente.auth.verifyOtp({
          token_hash: enlace.token!,
          type: 'invite',
        })

      if (
        verifyError ||
        !data.session ||
        !data.user ||
        !data.user.email
      ) {
        setError(
          'La invitación no es válida, venció o ya fue utilizada. Contactá al administrador.'
        )
        return
      }

      setUsuario({
        id: data.user.id,
        correo: data.user.email,
      })

      // Quitamos el token del enlace después de validarlo.
      const url = new URL(window.location.href)
      url.searchParams.delete('token_hash')
      url.searchParams.delete('type')

      window.history.replaceState(
        null,
        '',
        `${url.pathname}${url.search}`
      )
    } catch {
      setError(
        'No se pudo validar la invitación. Revisá tu conexión.'
      )
    } finally {
      ocupado.current = false
      setSaving(false)
    }
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (ocupado.current || completado || !usuario) return

    setError('')

    if (password.length < 8) {
      setError('Usá una contraseña de al menos 8 caracteres.')
      return
    }

    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }

    ocupado.current = true
    setSaving(true)

    try {
      // Verificamos nuevamente qué cuenta tiene esta sesión.
      const { data, error: userError } =
        await cliente.auth.getUser()

      if (
        userError ||
        !data.user ||
        data.user.id !== usuario.id
      ) {
        setError(
          'La sesión de la invitación ya no es válida. Contactá al administrador.'
        )
        return
      }

      // Solo modifica la cuenta validada por la invitación.
      const { data: resultado, error: updateError } =
        await cliente.auth.updateUser({ password })

      if (updateError) {
        setError(
          updateError.code === 'weak_password'
            ? 'La contraseña no cumple los requisitos de seguridad. Elegí una más fuerte.'
            : 'No se pudo guardar la contraseña. Intentá nuevamente.'
        )
        return
      }

      if (resultado.user?.id !== usuario.id) {
        setError(
          'No se pudo confirmar el resultado. Contactá al administrador.'
        )
        return
      }

      setPassword('')
      setConfirmacion('')
      setCompletado(true)
    } catch {
      setError(
        'No se pudo confirmar el cambio. Revisá tu conexión.'
      )
    } finally {
      ocupado.current = false
      setSaving(false)
    }
  }

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__brand">
          <h1>CITA</h1>
          <p>Quinta Anfuso</p>
        </header>

        <div className="login__heading">
          <h2>
            {completado
              ? 'Tu contraseña está lista'
              : 'Activá tu cuenta'}
          </h2>

          {usuario ? (
            <p>
              Cuenta: <strong>{usuario.correo}</strong>
            </p>
          ) : (
            <p>
              Primero validá la invitación recibida por correo.
            </p>
          )}
        </div>

        {completado ? (
          <>
            <p>
              Ya podés iniciar sesión con este correo y la
              contraseña que acabás de crear.
            </p>

            <button
              type="button"
              className="login__submit"
              onClick={onComplete}
            >
              Ir al inicio de sesión
            </button>
          </>
        ) : !usuario ? (
          <>
            {enlaceValido ? (
              <button
                type="button"
                className="login__submit"
                disabled={saving}
                onClick={() => void validarInvitacion()}
              >
                {saving
                  ? 'Validando…'
                  : 'Validar invitación'}
              </button>
            ) : (
              <p role="alert">
                Esta dirección no contiene una invitación
                válida. Abrí el enlace del nuevo correo de
                invitación.
              </p>
            )}

            <button
              type="button"
              className="login__toggle"
              disabled={saving}
              onClick={onCancel}
            >
              Volver al inicio
            </button>
          </>
        ) : (
          <form className="login__form" onSubmit={guardar}>
            <div className="login__field">
              <label htmlFor="nueva-password">
                Nueva contraseña
              </label>

              <input
                id="nueva-password"
                type={mostrar ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                minLength={8}
                disabled={saving}
                required
              />
            </div>

            <div className="login__field">
              <label htmlFor="confirmar-password">
                Confirmar contraseña
              </label>

              <input
                id="confirmar-password"
                type={mostrar ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmacion}
                onChange={(event) =>
                  setConfirmacion(event.target.value)
                }
                minLength={8}
                disabled={saving}
                required
              />
            </div>

            <button
              type="button"
              className="login__toggle"
              aria-pressed={mostrar}
              disabled={saving}
              onClick={() =>
                setMostrar((value) => !value)
              }
            >
              {mostrar
                ? 'Ocultar contraseñas'
                : 'Mostrar contraseñas'}
            </button>

            <button
              type="submit"
              className="login__submit"
              disabled={saving}
            >
              {saving
                ? 'Guardando…'
                : 'Guardar contraseña'}
            </button>

            <button
              type="button"
              className="login__toggle"
              disabled={saving}
              onClick={onCancel}
            >
              Cancelar y cerrar sesión
            </button>
          </form>
        )}

        {error && (
          <p className="login__message" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}