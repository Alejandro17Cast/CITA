import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

type Props = {
  onBack: () => void
}

type Usuario = {
  id: string
  nombre: string
  rol: 'administrador' | 'encargado'
  activo: boolean
  correo: string | null
}

type RespuestaInvitacion = {
  ok?: boolean
  requiereRevision?: boolean
  message?: string
  error?: string
}

export default function UsuariosPage({ onBack }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null)

  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Usuario['rol']>('encargado')
  const [activo, setActivo] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoCorreo, setNuevoCorreo] = useState('')
  const [nuevoRol, setNuevoRol] = useState<Usuario['rol']>('encargado')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  const ocupado = saving || inviting

  useEffect(() => {
    let cancelled = false

    async function cargar() {
      setLoading(true)
      setLoadError('')

      try {
        const { data, error } = await supabase.rpc('listar_usuarios')

        if (cancelled) return

        if (error) {
          setLoadError(
            error.code === 'P0001'
              ? error.message
              : 'No se pudieron consultar los usuarios.'
          )
          return
        }

        setUsuarios((data ?? []) as Usuario[])
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo conectar para consultar los usuarios.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargar()

    return () => {
      cancelled = true
    }
  }, [reload])

  function editar(usuario: Usuario) {
    setSeleccionado(usuario)
    setNombre(usuario.nombre)
    setRol(usuario.rol)
    setActivo(usuario.activo)
    setFormError('')
    setMessage('')
  }

  function cerrarEdicion() {
    setSeleccionado(null)
    setFormError('')
  }

  async function invitar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (ocupado) return

    setInviteError('')
    setMessage('')

    if (nuevoNombre.trim().length < 2) {
      setInviteError('Escribí un nombre de al menos 2 caracteres.')
      return
    }

    setInviting(true)

    try {
      const { data, error } =
        await supabase.functions.invoke<RespuestaInvitacion>(
          'invitar-usuario',
          {
            body: {
              nombre: nuevoNombre.trim(),
              correo: nuevoCorreo.trim(),
              rol: nuevoRol,
            },
          }
        )

      if (error) {
        let mensaje =
          'No se pudo confirmar la invitación. Actualizá la lista antes de reintentar.'

        if (error instanceof FunctionsHttpError) {
          try {
            const respuesta: unknown = await error.context.json()

            if (
              respuesta &&
              typeof respuesta === 'object' &&
              'error' in respuesta &&
              typeof respuesta.error === 'string'
            ) {
              mensaje = respuesta.error
            }
          } catch {
            // Conserva el mensaje si la respuesta no contiene JSON.
          }
        }

        setInviteError(mensaje)
        setReload((value) => value + 1)
        return
      }

      if (!data?.ok) {
        setInviteError(
          data?.error ??
            'No se pudo confirmar la invitación. Actualizá la lista antes de reintentar.'
        )
        setReload((value) => value + 1)
        return
      }

      setMessage(
        data.message ??
          'Invitación enviada. La persona debe revisar su correo.'
      )
      setNuevoNombre('')
      setNuevoCorreo('')
      setNuevoRol('encargado')
      setReload((value) => value + 1)
    } catch {
      setInviteError(
        'Se interrumpió la conexión. Actualizá la lista antes de reintentar.'
      )
      setReload((value) => value + 1)
    } finally {
      setInviting(false)
    }
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!seleccionado || ocupado) return

    setFormError('')
    setMessage('')

    if (nombre.trim().length < 2) {
      setFormError('Escribí un nombre de al menos 2 caracteres.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.rpc('actualizar_usuario', {
        p_usuario_id: seleccionado.id,
        p_nombre: nombre.trim(),
        p_rol: rol,
        p_activo: activo,
      })

      if (error) {
        setFormError(
          error.code === 'P0001'
            ? error.message
            : 'No se pudo confirmar el cambio. Actualizá la lista para verificar el resultado.'
        )
        return
      }

      setMessage('Usuario actualizado correctamente.')
      setSeleccionado(null)
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'Se interrumpió la conexión. Actualizá la lista para verificar el resultado.'
      )
    } finally {
      setSaving(false)
    }
  }

  const texto = busqueda.trim().toLocaleLowerCase('es')

  const filtrados = usuarios.filter((usuario) =>
    `${usuario.nombre} ${usuario.correo ?? ''}`
      .toLocaleLowerCase('es')
      .includes(texto)
  )

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <h1>Usuarios y roles</h1>
          <p>Administrá las cuentas del personal de Quinta Anfuso.</p>
        </div>

        <button type="button" onClick={onBack} disabled={ocupado}>
          Volver al inicio
        </button>
      </header>

      {message && <p role="status">{message}</p>}

      <section className="clientes__panel">
        <h2>Nuevo usuario</h2>
        <p>
          La persona recibirá una invitación por correo para establecer
          su contraseña.
        </p>

        <form onSubmit={invitar}>
          <fieldset
            disabled={ocupado}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div className="clientes__fields">
              <label className="clientes__wide">
                Nombre completo
                <input
                  value={nuevoNombre}
                  onChange={(event) => setNuevoNombre(event.target.value)}
                  minLength={2}
                  maxLength={150}
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                Correo electrónico
                <input
                  type="email"
                  value={nuevoCorreo}
                  onChange={(event) => setNuevoCorreo(event.target.value)}
                  maxLength={254}
                  autoComplete="off"
                  placeholder="nombre@ejemplo.com"
                  required
                />
              </label>

              <label>
                Rol
                <select
                  value={nuevoRol}
                  onChange={(event) =>
                    setNuevoRol(event.target.value as Usuario['rol'])
                  }
                >
                  <option value="encargado">Encargado</option>
                  <option value="administrador">Administrador</option>
                </select>
              </label>
            </div>

            <button type="submit" className="clientes__primary">
              {inviting ? 'Enviando invitación…' : 'Enviar invitación'}
            </button>
          </fieldset>
        </form>

        {inviteError && <p role="alert">{inviteError}</p>}
      </section>

      {seleccionado && (
        <section className="clientes__panel">
          <h2>Editar usuario</h2>
          <p>{seleccionado.correo || 'Sin correo registrado'}</p>

          <form onSubmit={guardar}>
            <fieldset
              disabled={ocupado}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <div className="clientes__fields">
                <label className="clientes__wide">
                  Nombre
                  <input
                    value={nombre}
                    onChange={(event) => setNombre(event.target.value)}
                    minLength={2}
                    maxLength={150}
                    required
                  />
                </label>

                <label>
                  Rol
                  <select
                    value={rol}
                    onChange={(event) =>
                      setRol(event.target.value as Usuario['rol'])
                    }
                  >
                    <option value="encargado">Encargado</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </label>

                <label>
                  Acceso
                  <select
                    value={activo ? 'activo' : 'inactivo'}
                    onChange={(event) =>
                      setActivo(event.target.value === 'activo')
                    }
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>
              </div>

              <p>
                El administrador puede modificar usuarios y autorizar
                devoluciones. El encargado gestiona la operación diaria.
              </p>

              <button type="submit" className="clientes__primary">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>

              <button
                type="button"
                onClick={cerrarEdicion}
                style={{ marginLeft: 12 }}
              >
                Cancelar
              </button>
            </fieldset>
          </form>

          {formError && <p role="alert">{formError}</p>}
        </section>
      )}

      <section className="clientes__panel">
        <h2>Cuentas registradas</h2>

        <div className="clientes__fields">
          <label>
            Buscar por nombre o correo
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar usuario…"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={loading || ocupado}
          onClick={() => {
            cerrarEdicion()
            setReload((value) => value + 1)
          }}
          style={{ margin: '16px 0' }}
        >
          Actualizar lista
        </button>

        {loading ? (
          <p role="status">Cargando usuarios…</p>
        ) : loadError ? (
          <p role="alert">{loadError}</p>
        ) : filtrados.length === 0 ? (
          <p>No hay usuarios que coincidan con la búsqueda.</p>
        ) : (
          <div className="clientes__table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Acceso</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>{usuario.nombre || 'Sin nombre'}</td>
                    <td>{usuario.correo || '—'}</td>
                    <td>
                      {usuario.rol === 'administrador'
                        ? 'Administrador'
                        : 'Encargado'}
                    </td>
                    <td>{usuario.activo ? 'Activo' : 'Inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => editar(usuario)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}