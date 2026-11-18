import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import GestionReservacionesPage from './GestionReservacionesPage'
import './PagosPage.css'

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
  rol: 'administrador' | 'encargado'
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

export default function PagosPage({ onBack }: Props)  {
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
  const [seccion, setSeccion] = useState<'pagos' | 'cancelaciones'>('pagos')

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
    <main className="pagos">
      <header className="pagos__page-header">
        <div>
          <span className="pagos__eyebrow">CITA / ADMINISTRACIÓN FINANCIERA</span>
          <h1>Gestión financiera</h1>
          <p>Administrá pagos, abonos, cancelaciones y devoluciones de las reservaciones.</p>
        </div>
      </header>

      <nav className="pagos__tabs" aria-label="Secciones de gestión financiera">
        <button
          type="button"
          className={seccion === 'pagos' ? 'pagos__tab pagos__tab--active' : 'pagos__tab'}
          aria-current={seccion === 'pagos' ? 'page' : undefined}
          onClick={() => setSeccion('pagos')}
        >
          <span>01</span>
          Pagos y abonos
        </button>
        <button
          type="button"
          className={seccion === 'cancelaciones' ? 'pagos__tab pagos__tab--active' : 'pagos__tab'}
          aria-current={seccion === 'cancelaciones' ? 'page' : undefined}
          onClick={() => setSeccion('cancelaciones')}
        >
          <span>02</span>
          Cancelaciones y devoluciones
        </button>
      </nav>

      {seccion === 'pagos' ? (
        <>
            {message && <p className="pagos__message" role="status">{message}</p>}

      {loading ? (
        <p className="pagos__notice" role="status">Cargando pagos…</p>
      ) : loadError ? (
        <section className="pagos__panel">
          <p className="pagos__error" role="alert">{loadError}</p>
          <button className="pagos__secondary" type="button" onClick={() => setReload((v) => v + 1)}>
            Actualizar datos
          </button>
        </section>
      ) : (
        <>
          <section className="pagos__panel pagos__selector">
            <div className="pagos__section-heading">
              <div><span className="pagos__step">01</span><h2>Seleccioná una reservación</h2></div>
              <p>Elegí la reserva para consultar su estado de cuenta.</p>
            </div>
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
            <div className="pagos__layout">
              {reserva.estado !== 'cancelada' && saldoCentavos > 0 && (
                <section className="pagos__panel pagos__form-panel">
                  <div className="pagos__section-heading">
                    <div><span className="pagos__step">03</span><h2>Registrar pago</h2></div>
                  </div>

                  {reserva.estado === 'pendiente' && (
                    <p className="pagos__hint">El primer anticipo confirmará esta reserva y bloqueará sus espacios si siguen disponibles.</p>
                  )}

                  <form onSubmit={registrarPago}>
                    <fieldset disabled={saving || !!solicitud}>
                      <div className="pagos__fields">
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

                        <label className="pagos__wide">
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

                      <button type="submit" className="pagos__primary">
                        {saving ? 'Registrando…' : 'Registrar pago recibido'}
                      </button>
                    </fieldset>
                  </form>
                </section>
              )}


              <section className="pagos__panel pagos__summary">
                <div className="pagos__section-heading">
                  <div><span className="pagos__step">02</span><h2>Resumen de la reserva</h2></div>
                </div>
                <div className="pagos__summary-status">
                  <span>Estado de la reservación</span>
                  <strong className={`pagos__badge pagos__badge--${reserva.estado}`}>
                    {reserva.estado}
                  </strong>
                </div>
                <dl className="pagos__amounts">
                  <div><dt>Total de la reserva</dt><dd>{moneda.format(reserva.total)}</dd></div>
                  <div><dt>Total pagado</dt><dd>{moneda.format(pagadoCentavos / 100)}</dd></div>
                  <div className="pagos__balance"><dt>Saldo pendiente</dt><dd>{moneda.format(saldoCentavos / 100)}</dd></div>
                </dl>
                <div className="pagos__progress" aria-label={`Pagado ${Math.min(100, Math.max(0, (pagadoCentavos / Math.max(1, Math.round(Number(reserva.total) * 100))) * 100)).toFixed(0)} por ciento`}>
                  <span style={{ width: `${Math.min(100, Math.max(0, (pagadoCentavos / Math.max(1, Math.round(Number(reserva.total) * 100))) * 100))}%` }} />
                </div>
              </section>

              {formError && <p className="pagos__error pagos__layout-wide" role="alert">{formError}</p>}

              {solicitud && !saving && (
                <section className="pagos__panel pagos__retry pagos__layout-wide">
                  <p>
                    Hay una operación sin resultado confirmado.
                    Este reintento conserva el mismo identificador para evitar
                    duplicar el pago. Mantené esta página abierta.
                  </p>
                  <button
                    className="pagos__secondary"
                    type="button"
                    onClick={() => void enviarPago(solicitud)}
                  >
                    Reintentar el mismo pago
                  </button>
                </section>
              )}

              <section className="pagos__panel pagos__history pagos__layout-wide">
                <div className="pagos__list-header">
                  <h2>Historial de pagos</h2>
                  <button
                    className="pagos__secondary"
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
                  <div className="pagos__table-wrapper">
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
            </div>
          )}
        </>
      )}
        </>
      ) : (
        <>
          <section className="pagos__management-section">
            <GestionReservacionesPage onBack={onBack} soloGestion />
          </section>

        </>
      )}
    </main>
  )
}