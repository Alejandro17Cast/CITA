import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

type Cliente = {
  id: string
  nombre: string
}

type Espacio = {
  id: string
  nombre: string
  capacidad: number
}

type Reserva = {
  id: string
  nombre_evento: string
  inicio: string
  fin: string
  estado: string
  total: number
}

type Props = {
  onBack: () => void
}

const moneda = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
})

const fecha = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function ReservacionesPage({ onBack }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [importes, setImportes] = useState<Record<string, string>>({})
  const [quintaCompleta, setQuintaCompleta] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function cargarDatos() {
      setLoading(true)
      setLoadError('')

      try {
        const [clientesResult, espaciosResult, reservasResult] =
          await Promise.all([
            supabase.from('clientes').select('id, nombre').order('nombre'),
            supabase
              .from('espacios')
              .select('id, nombre, capacidad')
              .eq('activo', true)
              .order('nombre'),
            supabase
              .from('reservaciones')
              .select('id, nombre_evento, inicio, fin, estado, total')
              .order('creado_en', { ascending: false }),
          ])

        if (cancelled) return

        if (
          clientesResult.error ||
          espaciosResult.error ||
          reservasResult.error
        ) {
          setLoadError('No se pudieron cargar los datos de reservaciones.')
          return
        }

        setClientes(clientesResult.data ?? [])
        setEspacios(espaciosResult.data ?? [])
        setReservas(reservasResult.data ?? [])
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo conectar. Intentá actualizar los datos.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarDatos()
    return () => { cancelled = true }
  }, [reload])

  const seleccionados = espacios.filter((espacio) =>
    Object.hasOwn(importes, espacio.id)
  )

  const totalCentavos = seleccionados.reduce((total, espacio) => {
    const valor = Number(importes[espacio.id])
    return total + (Number.isFinite(valor) ? Math.round(valor * 100) : 0)
  }, 0)

  function seleccionarEspacio(id: string, seleccionado: boolean) {
    setImportes((actuales) => {
      const nuevos = { ...actuales }

      if (seleccionado) {
        nuevos[id] = ''
      } else {
        delete nuevos[id]
      }

      return nuevos
    })
  }

  function seleccionarQuinta(completa: boolean) {
    setQuintaCompleta(completa)

    if (completa) {
      setImportes((actuales) =>
        Object.fromEntries(
          espacios.map((espacio) => [
            espacio.id,
            actuales[espacio.id] ?? '',
          ])
        )
      )
    }
  }

  async function guardarReserva(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const datos = new FormData(form)
    const nombreEvento = String(datos.get('nombre_evento') ?? '').trim()
    const inicioTexto = String(datos.get('inicio') ?? '')
    const finTexto = String(datos.get('fin') ?? '')

    // datetime-local no incluye zona: usamos explícitamente Nicaragua.
    const inicio = new Date(`${inicioTexto}:00-06:00`)
    const fin = new Date(`${finTexto}:00-06:00`)

    setFormError('')
    setMessage('')

    if (
      nombreEvento.length < 2 ||
      !Number.isFinite(inicio.getTime()) ||
      !Number.isFinite(fin.getTime()) ||
      fin <= inicio
    ) {
      setFormError('Revisá el nombre del evento y sus fechas.')
      return
    }

    if (seleccionados.length === 0) {
      setFormError('Seleccioná al menos un espacio.')
      return
    }

    const detalles = seleccionados.map((espacio) => ({
      espacio_id: espacio.id,
      importe: Number(importes[espacio.id]),
    }))

    if (seleccionados.some((espacio) =>
      importes[espacio.id].trim() === ''
    ) || detalles.some((detalle) =>
      !Number.isFinite(detalle.importe) || detalle.importe < 0
    )) {
      setFormError('Ingresá un importe válido para cada espacio.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.rpc('crear_reservacion', {
        p_cliente_id: String(datos.get('cliente_id') ?? ''),
        p_nombre_evento: nombreEvento,
        p_inicio: inicio.toISOString(),
        p_fin: fin.toISOString(),
        p_cantidad_personas: Number(datos.get('cantidad_personas')),
        p_quinta_completa: quintaCompleta,
        p_detalles: detalles,
        p_observaciones:
          String(datos.get('observaciones') ?? '').trim() || null,
      })

      if (error) {
        setFormError(
          error.code === 'P0001'
            ? error.message
            : 'No se pudo guardar la reserva. Revisá los datos y tus permisos.'
        )
        return
      }

      form.reset()
      setImportes({})
      setQuintaCompleta(false)
      setMessage('Reserva pendiente registrada correctamente.')
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'No se pudo confirmar el registro. Actualizá la lista antes de reintentar.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <p className="clientes__eyebrow">CITA · QUINTA ANFUSO</p>
          <h1>Reservaciones</h1>
          <p>Registrá solicitudes y los espacios incluidos.</p>
        </div>
        <button type="button" onClick={onBack}>Volver al inicio</button>
      </header>

      {message && <p role="status">{message}</p>}

      {loading ? (
        <p role="status">Cargando datos…</p>
      ) : loadError ? (
        <section className="clientes__panel">
          <p role="alert">{loadError}</p>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
          >
            Actualizar datos
          </button>
        </section>
      ) : (
        <>
          <section className="clientes__panel">
            <h2>Nueva reservación</h2>

            {clientes.length === 0 || espacios.length === 0 ? (
              <p>
                Primero registrá al menos un cliente y un espacio activo.
              </p>
            ) : (
              <form onSubmit={guardarReserva}>
                <fieldset disabled={saving}>
                  <div className="clientes__fields">
                    <label>
                      Cliente
                      <select name="cliente_id" defaultValue="" required>
                        <option value="" disabled>Seleccioná un cliente</option>
                        {clientes.map((cliente) => (
                          <option key={cliente.id} value={cliente.id}>
                            {cliente.nombre}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Nombre del evento o actividad
                      <input
                        name="nombre_evento"
                        minLength={2}
                        maxLength={150}
                        required
                      />
                    </label>

                    <label>
                      Inicio · hora de Nicaragua
                      <input name="inicio" type="datetime-local" required />
                    </label>

                    <label>
                      Fin · hora de Nicaragua
                      <input name="fin" type="datetime-local" required />
                    </label>

                    <label>
                      Cantidad de personas
                      <input
                        name="cantidad_personas"
                        type="number"
                        min={1}
                        max={2147483647}
                        step={1}
                        required
                      />
                    </label>

                    <label className="reservas__check">
                      <input
                        type="checkbox"
                        checked={quintaCompleta}
                        onChange={(event) =>
                          seleccionarQuinta(event.target.checked)
                        }
                      />
                      Reservar la quinta completa
                    </label>
                  </div>

                  <h3>Espacios incluidos</h3>
                  <p>
                    Ingresá el importe acordado para todo el período,
                    en córdobas, para cada espacio.
                  </p>

                  <div className="clientes__fields">
                    {espacios.map((espacio) => (
                      <div className="reservas__espacio" key={espacio.id}>
                        <label className="reservas__check">
                          <input
                            type="checkbox"
                            checked={Object.hasOwn(importes, espacio.id)}
                            disabled={quintaCompleta}
                            onChange={(event) =>
                              seleccionarEspacio(espacio.id, event.target.checked)
                            }
                          />
                          {espacio.nombre} · {espacio.capacidad} personas
                        </label>

                        {Object.hasOwn(importes, espacio.id) && (
                          <label>
                            Importe de {espacio.nombre}
                            <input
                              type="number"
                              min={0}
                              max={9999999999.99}
                              step="0.01"
                              value={importes[espacio.id]}
                              onChange={(event) =>
                                setImportes((actuales) => ({
                                  ...actuales,
                                  [espacio.id]: event.target.value,
                                }))
                              }
                              required
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  <p><strong>Total: {moneda.format(totalCentavos / 100)}</strong></p>

                  <label>
                    Observaciones (opcional)
                    <textarea name="observaciones" rows={3} maxLength={2000} />
                  </label>

                  <p>
                    La solicitud quedará pendiente. Los espacios se bloquearán
                    cuando se registre el anticipo y se confirme la reserva.
                  </p>

                  <button type="submit" className="clientes__primary">
                    {saving ? 'Guardando…' : 'Guardar solicitud'}
                  </button>
                </fieldset>
              </form>
            )}

            {formError && <p role="alert">{formError}</p>}
          </section>

          <section className="clientes__panel">
            <div className="clientes__list-header">
              <h2>Reservaciones registradas</h2>
              <button
                type="button"
                disabled={saving}
                onClick={() => setReload((value) => value + 1)}
              >
                Actualizar datos
              </button>
            </div>

            {reservas.length === 0 ? (
              <p>Todavía no hay reservaciones registradas.</p>
            ) : (
              <div className="clientes__table-wrapper">
                <table>
                  <caption>{reservas.length} reservaciones registradas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Actividad</th>
                      <th scope="col">Inicio</th>
                      <th scope="col">Fin</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservas.map((reserva) => (
                      <tr key={reserva.id}>
                        <td>{reserva.nombre_evento}</td>
                        <td>{fecha.format(new Date(reserva.inicio))}</td>
                        <td>{fecha.format(new Date(reserva.fin))}</td>
                        <td>{reserva.estado}</td>
                        <td>{moneda.format(reserva.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}