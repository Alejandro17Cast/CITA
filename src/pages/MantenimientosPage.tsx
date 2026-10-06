import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

type Props = {
  rol: 'administrador' | 'encargado'
  onBack: () => void
}

type Espacio = {
  id: string
  nombre: string
  activo: boolean
}

type Mantenimiento = {
  id: string
  espacio_id: string
  inicio: string
  fin: string
  motivo: string
  estado: 'activo' | 'liberado'
  liberado_en: string | null
}

const fecha = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function MantenimientosPage({
  rol,
  onBack,
}: Props) {
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [mantenimientos, setMantenimientos] =
    useState<Mantenimiento[]>([])

  const [espacioId, setEspacioId] = useState('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [motivo, setMotivo] = useState('')
  const [liberarId, setLiberarId] = useState('')
  const [confirmado, setConfirmado] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  const administrador = rol === 'administrador'

  useEffect(() => {
    let cancelled = false

    async function cargar() {
      setLoading(true)
      setLoadError('')

      try {
        const [espaciosResult, mantenimientosResult] =
          await Promise.all([
            supabase
              .from('espacios')
              .select('id, nombre, activo')
              .order('nombre'),

            supabase
              .from('mantenimientos')
              .select(
                'id, espacio_id, inicio, fin, motivo, estado, liberado_en'
              )
              .order('inicio', { ascending: false }),
          ])

        if (cancelled) return

        if (espaciosResult.error || mantenimientosResult.error) {
          setLoadError('No se pudieron cargar los mantenimientos.')
          return
        }

        setEspacios(espaciosResult.data ?? [])
        setMantenimientos(mantenimientosResult.data ?? [])
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo conectar para consultar los datos.')
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

  function nombreEspacio(id: string) {
    return (
      espacios.find((espacio) => espacio.id === id)?.nombre ??
      'Espacio'
    )
  }

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !administrador) return

    setFormError('')
    setMessage('')

    const inicioISO = `${inicio}:00-06:00`
    const finISO = `${fin}:00-06:00`
    const inicioTiempo = new Date(inicioISO).getTime()
    const finTiempo = new Date(finISO).getTime()

    if (
      !espacioId ||
      !Number.isFinite(inicioTiempo) ||
      !Number.isFinite(finTiempo) ||
      finTiempo <= inicioTiempo
    ) {
      setFormError(
        'Seleccioná un espacio y una fecha final posterior al inicio.'
      )
      return
    }

    if (motivo.trim().length < 5) {
      setFormError('Escribí un motivo de al menos 5 caracteres.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.rpc('crear_mantenimiento', {
        p_espacio_id: espacioId,
        p_inicio: inicioISO,
        p_fin: finISO,
        p_motivo: motivo.trim(),
      })

      if (error) {
        setFormError(
          error.code === 'P0001'
            ? error.message
            : 'No se pudo confirmar el bloqueo. Actualizá la lista antes de reintentar.'
        )
        return
      }

      setEspacioId('')
      setInicio('')
      setFin('')
      setMotivo('')
      setMessage('Bloqueo registrado. El calendario reflejará el mantenimiento.')
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'Se interrumpió la conexión. Actualizá la lista para verificar si se registró.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function liberar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !administrador || !liberarId || !confirmado) return

    setFormError('')
    setMessage('')
    setSaving(true)

    try {
      const { error } = await supabase.rpc('liberar_mantenimiento', {
        p_mantenimiento_id: liberarId,
      })

      if (error) {
        setFormError(
          error.code === 'P0001'
            ? error.message
            : 'No se pudo confirmar la liberación. Actualizá la lista antes de reintentar.'
        )
        return
      }

      setLiberarId('')
      setConfirmado(false)
      setMessage('Bloqueo liberado. Se conservó el historial.')
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'Se interrumpió la conexión. Actualizá la lista para verificar el resultado.'
      )
    } finally {
      setSaving(false)
    }
  }

  const bloqueos = mantenimientos.filter(
    (item) => item.estado === 'activo'
  )

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <h1>Mantenimientos</h1>
          <p>Bloqueá espacios durante reparaciones o trabajos de limpieza.</p>
        </div>

        <button type="button" onClick={onBack} disabled={saving}>
          Volver al inicio
        </button>
      </header>

      {message && <p role="status">{message}</p>}
      {formError && <p role="alert">{formError}</p>}

      {administrador && (
        <section className="clientes__panel">
          <h2>Nuevo bloqueo</h2>
          <p>Las fechas se registran con la hora de Nicaragua.</p>

          <form onSubmit={crear}>
            <fieldset
              disabled={saving || loading || Boolean(loadError)}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <div className="clientes__fields">
                <label className="clientes__wide">
                  Espacio
                  <select
                    value={espacioId}
                    onChange={(event) => setEspacioId(event.target.value)}
                    required
                  >
                    <option value="">Seleccioná un espacio</option>
                    {espacios
                      .filter((espacio) => espacio.activo)
                      .map((espacio) => (
                        <option key={espacio.id} value={espacio.id}>
                          {espacio.nombre}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  Inicio
                  <input
                    type="datetime-local"
                    value={inicio}
                    onChange={(event) => setInicio(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Fin
                  <input
                    type="datetime-local"
                    value={fin}
                    onChange={(event) => setFin(event.target.value)}
                    required
                  />
                </label>

                <label className="clientes__wide">
                  Motivo
                  <textarea
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                    minLength={5}
                    maxLength={1000}
                    rows={3}
                    required
                    placeholder="Ejemplo: reparación del aire acondicionado."
                  />
                </label>
              </div>

              <button type="submit" className="clientes__primary">
                {saving ? 'Guardando…' : 'Registrar bloqueo'}
              </button>
            </fieldset>
          </form>
        </section>
      )}

      <section className="clientes__panel">
        <h2>Historial de mantenimientos</h2>

        <button
          type="button"
          disabled={loading || saving}
          onClick={() => {
            setLiberarId('')
            setConfirmado(false)
            setReload((value) => value + 1)
          }}
        >
          Actualizar lista
        </button>

        {loading ? (
          <p role="status">Cargando mantenimientos…</p>
        ) : loadError ? (
          <p role="alert">{loadError}</p>
        ) : mantenimientos.length === 0 ? (
          <p>No hay mantenimientos registrados.</p>
        ) : (
          <div className="clientes__table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Espacio</th>
                  <th scope="col">Inicio</th>
                  <th scope="col">Fin</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Liberado el</th>
                </tr>
              </thead>

              <tbody>
                {mantenimientos.map((item) => (
                  <tr key={item.id}>
                    <td>{nombreEspacio(item.espacio_id)}</td>
                    <td>{fecha.format(new Date(item.inicio))}</td>
                    <td>{fecha.format(new Date(item.fin))}</td>
                    <td>{item.motivo}</td>
                    <td>
                      {item.estado === 'liberado'
                        ? 'Liberado'
                        : new Date(item.fin).getTime() <= Date.now()
                          ? 'Período finalizado'
                          : 'Bloqueo registrado'}
                    </td>
                    <td>
                      {item.liberado_en
                        ? fecha.format(new Date(item.liberado_en))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {administrador && !loading && !loadError && bloqueos.length > 0 && (
        <section className="clientes__panel">
          <h2>Liberar un bloqueo</h2>
          <p>
            Usá esta opción si el trabajo terminó antes de lo previsto
            o si necesitás retirar el bloqueo.
          </p>

          <form onSubmit={liberar}>
            <fieldset
              disabled={saving}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <label>
                Mantenimiento
                <select
                  value={liberarId}
                  onChange={(event) => {
                    setLiberarId(event.target.value)
                    setConfirmado(false)
                  }}
                  required
                >
                  <option value="">Seleccioná un bloqueo</option>
                  {bloqueos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {nombreEspacio(item.espacio_id)}
                      {' · '}
                      {fecha.format(new Date(item.inicio))}
                      {' · '}
                      {item.motivo}
                    </option>
                  ))}
                </select>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  margin: '18px 0',
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(event) => setConfirmado(event.target.checked)}
                  style={{ width: 'auto' }}
                  required
                />
                Confirmo que este bloqueo puede retirarse.
              </label>

              <button
                type="submit"
                className="clientes__primary"
                disabled={!liberarId || !confirmado}
              >
                {saving ? 'Guardando…' : 'Liberar bloqueo'}
              </button>
            </fieldset>
          </form>
        </section>
      )}
    </main>
  )
}