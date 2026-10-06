import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

type Reserva = {
  id: string
  nombre_evento: string
  estado: string
  total: number
}

type Pago = {
  id: string
  reservacion_id: string
  monto: number
  metodo: string
  referencia: string | null
  registrado_en: string
}

type Solicitud = {
  p_reservacion_id: string
  p_monto: number
  p_metodo: string
  p_solicitud_id: string
  p_referencia: string | null
  p_observaciones: string | null
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

export default function PagosPage({ onBack }: Props) {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [reservaId, setReservaId] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [referencia, setReferencia] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)

  useEffect(() => {
    let cancelled = false

    async function cargarDatos() {
      setLoading(true)
      setLoadError('')

      try {
        const [reservasResult, pagosResult] = await Promise.all([
          supabase
            .from('reservaciones')
            .select('id, nombre_evento, estado, total')
            .order('creado_en', { ascending: false }),
          supabase
            .from('pagos')
            .select(
              'id, reservacion_id, monto, metodo, referencia, registrado_en'
            )
            .order('registrado_en', { ascending: false }),
        ])

        if (cancelled) return

        if (reservasResult.error || pagosResult.error) {
          setLoadError('No se pudieron consultar las reservas y pagos.')
        } else {
          setReservas(reservasResult.data ?? [])
          setPagos(pagosResult.data ?? [])
        }
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo conectar para consultar los pagos.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarDatos()
    return () => { cancelled = true }
  }, [reload])

  const reserva = reservas.find((item) => item.id === reservaId)
  const historial = pagos.filter((pago) => pago.reservacion_id === reservaId)

  const pagadoCentavos = historial.reduce(
    (total, pago) => total + Math.round(Number(pago.monto) * 100),
    0
  )

  const saldoCentavos = reserva
    ? Math.round(Number(reserva.total) * 100) - pagadoCentavos
    : 0

  async function enviarPago(datos: Solicitud) {
    if (saving) return

    setSaving(true)
    setFormError('')
    setMessage('')

    try {
      const { error } = await supabase.rpc('registrar_pago', datos)

      if (error) {
        if (error.code === 'P0001') {
          setSolicitud(null)
          setFormError(error.message)
          setReload((value) => value + 1)
        } else {
          setFormError(
            'No se pudo confirmar el resultado. Reintentá la misma operación.'
          )
        }
        return
      }

      setSolicitud(null)
      setMonto('')
      setReferencia('')
      setObservaciones('')
      setMessage('Pago registrado correctamente.')
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'La conexión se interrumpió. Reintentá la misma operación.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function registrarPago(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || solicitud) return

    setFormError('')
    setMessage('')

    const valor = Number(monto)
    const centavos = Math.round(valor * 100)

    if (
      !reserva ||
      reserva.estado === 'cancelada' ||
      monto.trim() === '' ||
      !Number.isFinite(valor) ||
      valor <= 0 ||
      centavos > saldoCentavos
    ) {
      setFormError('Revisá la reserva y el monto. No debe superar el saldo.')
      return
    }

    if (metodo === 'transferencia' && !referencia.trim()) {
      setFormError('Ingresá la referencia de la transferencia.')
      return
    }

    const datos: Solicitud = {
      p_reservacion_id: reservaId,
      p_monto: valor,
      p_metodo: metodo,
      p_solicitud_id: crypto.randomUUID(),
      p_referencia: referencia.trim() || null,
      p_observaciones: observaciones.trim() || null,
    }

    setSolicitud(datos)
    await enviarPago(datos)
  }

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <p className="clientes__eyebrow">CITA · QUINTA ANFUSO</p>
          <h1>Pagos y abonos</h1>
          <p>Consultá saldos y registrá pagos en córdobas.</p>
        </div>
        <button
          type="button"
          disabled={saving || !!solicitud}
          onClick={onBack}
        >
          Volver al inicio
        </button>
      </header>

      {message && <p role="status">{message}</p>}

      {loading ? (
        <p role="status">Cargando pagos…</p>
      ) : loadError ? (
        <section className="clientes__panel">
          <p role="alert">{loadError}</p>
          <button type="button" onClick={() => setReload((v) => v + 1)}>
            Actualizar datos
          </button>
        </section>
      ) : (
        <>
          <section className="clientes__panel">
            <h2>Seleccioná una reservación</h2>
            <label>
              Reservación
              <select
                value={reservaId}
                disabled={saving || !!solicitud}
                onChange={(event) => {
                  setReservaId(event.target.value)
                  setMonto('')
                  setReferencia('')
                  setObservaciones('')
                  setFormError('')
                  setMessage('')
                }}
              >
                <option value="">Seleccioná una reserva</option>
                {reservas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre_evento} · {item.estado} · {item.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            {reservas.length === 0 && <p>No hay reservaciones registradas.</p>}
          </section>

          {reserva && (
            <>
              <section className="clientes__panel">
                <h2>Resumen de la reserva</h2>
                <p>Estado: <strong>{reserva.estado}</strong></p>
                <p>Total: <strong>{moneda.format(reserva.total)}</strong></p>
                <p>Pagado: <strong>{moneda.format(pagadoCentavos / 100)}</strong></p>
                <p>Saldo pendiente: <strong>{moneda.format(saldoCentavos / 100)}</strong></p>
              </section>

              {reserva.estado !== 'cancelada' && saldoCentavos > 0 && (
                <section className="clientes__panel">
                  <h2>Registrar pago</h2>

                  {reserva.estado === 'pendiente' && (
                    <p>
                      El primer anticipo confirmará esta reserva y bloqueará
                      sus espacios si siguen disponibles.
                    </p>
                  )}

                  <form onSubmit={registrarPago}>
                    <fieldset disabled={saving || !!solicitud}>
                      <div className="clientes__fields">
                        <label>
                          Monto en córdobas
                          <input
                            type="number"
                            min="0.01"
                            max={saldoCentavos / 100}
                            step="0.01"
                            value={monto}
                            onChange={(event) => setMonto(event.target.value)}
                            required
                          />
                        </label>

                        <label>
                          Método de pago
                          <select
                            value={metodo}
                            onChange={(event) => setMetodo(event.target.value)}
                          >
                            <option value="efectivo">Efectivo</option>
                            <option value="transferencia">Transferencia</option>
                          </select>
                        </label>

                        <label>
                          Referencia {metodo === 'efectivo' ? '(opcional)' : ''}
                          <input
                            value={referencia}
                            maxLength={150}
                            required={metodo === 'transferencia'}
                            onChange={(event) => setReferencia(event.target.value)}
                          />
                        </label>

                        <label className="clientes__wide">
                          Observaciones (opcional)
                          <textarea
                            rows={3}
                            maxLength={1000}
                            value={observaciones}
                            onChange={(event) =>
                              setObservaciones(event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <button type="submit" className="clientes__primary">
                        {saving ? 'Registrando…' : 'Registrar pago recibido'}
                      </button>
                    </fieldset>
                  </form>
                </section>
              )}

              {formError && <p role="alert">{formError}</p>}

              {solicitud && !saving && (
                <section className="clientes__panel">
                  <p>
                    Hay una operación sin resultado confirmado.
                    Este reintento conserva el mismo identificador para evitar
                    duplicar el pago. Mantené esta página abierta.
                  </p>
                  <button
                    type="button"
                    onClick={() => void enviarPago(solicitud)}
                  >
                    Reintentar el mismo pago
                  </button>
                </section>
              )}

              <section className="clientes__panel">
                <div className="clientes__list-header">
                  <h2>Historial de pagos</h2>
                  <button
                    type="button"
                    disabled={saving || !!solicitud}
                    onClick={() => setReload((value) => value + 1)}
                  >
                    Actualizar datos
                  </button>
                </div>

                {historial.length === 0 ? (
                  <p>Esta reserva todavía no tiene pagos registrados.</p>
                ) : (
                  <div className="clientes__table-wrapper">
                    <table>
                      <caption>Pagos de {reserva.nombre_evento}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Fecha</th>
                          <th scope="col">Monto</th>
                          <th scope="col">Método</th>
                          <th scope="col">Referencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((pago) => (
                          <tr key={pago.id}>
                            <td>{fecha.format(new Date(pago.registrado_en))}</td>
                            <td>{moneda.format(pago.monto)}</td>
                            <td>{pago.metodo}</td>
                            <td>{pago.referencia || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  )
}