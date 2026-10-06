import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './FinanzasPanel.css'

type Reembolso = {
  id: string
  reservacion_id: string
  monto: number
  estado: string
  entregado_en: string | null
  metodo: string | null
  referencia: string | null
}

type Reserva = {
  id: string
  nombre_evento: string
}

type Props = {
  permitirEntrega?: boolean
  mostrarTarjetas?: boolean
}

function mesNicaragua() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())

  const anio = partes.find((parte) => parte.type === 'year')?.value
  const mes = partes.find((parte) => parte.type === 'month')?.value

  return `${anio}-${mes}`
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

export default function FinanzasPanel({
  permitirEntrega = false,
  mostrarTarjetas = !permitirEntrega,
}: Props) {
  const [reembolsos, setReembolsos] = useState<Reembolso[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [recibido, setRecibido] = useState(0)
  const [devuelto, setDevuelto] = useState(0)

  const [reembolsoId, setReembolsoId] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [referencia, setReferencia] = useState('')
  const [confirmado, setConfirmado] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  const mesActual = mesNicaragua()

  useEffect(() => {
    let cancelled = false

    async function cargarFinanzas() {
      setLoading(true)
      setLoadError('')

      const [anio, mes] = mesActual.split('-').map(Number)
      const siguiente = new Date(Date.UTC(anio, mes, 1))
        .toISOString()
        .slice(0, 7)

      const inicio = `${mesActual}-01T00:00:00-06:00`
      const fin = `${siguiente}-01T00:00:00-06:00`

      try {
        const [pagosResult, reembolsosResult, reservasResult] =
          await Promise.all([
            supabase
              .from('pagos')
              .select('monto')
              .gte('registrado_en', inicio)
              .lt('registrado_en', fin),

            supabase
              .from('reembolsos')
              .select(
                'id, reservacion_id, monto, estado, entregado_en, metodo, referencia'
              )
              .order('autorizado_en', { ascending: false }),

            supabase
              .from('reservaciones')
              .select('id, nombre_evento')
              .eq('estado', 'cancelada'),
          ])

        if (cancelled) return

        if (
          pagosResult.error ||
          reembolsosResult.error ||
          reservasResult.error
        ) {
          setLoadError('No se pudieron cargar los datos financieros.')
          return
        }

        const lista = reembolsosResult.data ?? []

        const recibidoCentavos = (pagosResult.data ?? []).reduce(
          (total, pago) => total + Math.round(Number(pago.monto) * 100),
          0
        )

        const devueltoCentavos = lista
          .filter(
            (item) =>
              item.estado === 'entregado' &&
              item.entregado_en !== null &&
              new Date(item.entregado_en).getTime() >=
                new Date(inicio).getTime() &&
              new Date(item.entregado_en).getTime() <
                new Date(fin).getTime()
          )
          .reduce(
            (total, item) =>
              total + Math.round(Number(item.monto) * 100),
            0
          )

        setRecibido(recibidoCentavos)
        setDevuelto(devueltoCentavos)
        setReembolsos(lista)
        setReservas(reservasResult.data ?? [])
      } catch {
        if (!cancelled) {
          setLoadError(
            'No se pudo conectar para consultar las finanzas.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarFinanzas()

    return () => {
      cancelled = true
    }
  }, [reload, mesActual])

  const pendientes = reembolsos.filter(
    (item) => item.estado === 'pendiente'
  )

  const entregados = reembolsos.filter(
    (item) => item.estado === 'entregado'
  )

  const seleccionado = pendientes.find(
    (item) => item.id === reembolsoId
  )

  const pendienteCentavos = pendientes.reduce(
    (total, item) => total + Math.round(Number(item.monto) * 100),
    0
  )

  function actividad(id: string) {
    return (
      reservas.find((item) => item.id === id)?.nombre_evento ??
      `Reserva ${id.slice(0, 8)}`
    )
  }

  async function entregar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    setFormError('')
    setMessage('')

    if (!seleccionado || !confirmado) {
      setFormError(
        'Seleccioná una devolución y confirmá que ya entregaste el dinero.'
      )
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.rpc('entregar_reembolso', {
        p_reembolso_id: reembolsoId,
        p_metodo: metodo,
        p_referencia: referencia.trim() || null,
      })

      if (error) {
        setFormError(
          error.code === 'P0001'
            ? error.message
            : 'No se pudo confirmar el resultado. Actualizá los datos antes de reintentar.'
        )
        return
      }

      setMessage(
        'Entrega registrada. El resumen financiero se actualizará.'
      )
      setReembolsoId('')
      setReferencia('')
      setConfirmado(false)
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'La conexión se interrumpió. Actualizá los datos para verificar la entrega.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="finanzas">
      <div className="finanzas__heading">
        <div>
          <h3>Movimiento de dinero</h3>
          <p>Mes {mesActual} · Córdobas · Hora de Nicaragua</p>
        </div>

        <button
          type="button"
          disabled={loading || saving}
          onClick={() => {
            setReembolsoId('')
            setConfirmado(false)
            setReload((value) => value + 1)
          }}
        >
          Actualizar finanzas
        </button>
      </div>

      {loading ? (
        <p role="status">Cargando finanzas…</p>
      ) : loadError ? (
        <p role="alert">{loadError}</p>
      ) : (
        <>
          {mostrarTarjetas && (
            <div className="finanzas__cards">
              <article>
                <h4>Pagos recibidos este mes</h4>
                <strong>{moneda.format(recibido / 100)}</strong>
              </article>

              <article>
                <h4>Reembolsos entregados este mes</h4>
                <strong>{moneda.format(devuelto / 100)}</strong>
              </article>

              <article className="finanzas__neto">
                <h4>Neto recibido este mes</h4>
                <strong>
                  {moneda.format((recibido - devuelto) / 100)}
                </strong>
              </article>

              <article>
                <h4>Devoluciones pendientes</h4>
                <strong>
                  {moneda.format(pendienteCentavos / 100)}
                </strong>
                <p>Todos los meses · Aún no se restan del neto</p>
              </article>
            </div>
          )}

          {permitirEntrega && (
            <>
              <div className="finanzas__panel">
                <h3>Registrar devolución entregada</h3>

                <p>
                  Registrá esta operación después de devolver el dinero.
                  No realiza una transferencia bancaria.
                </p>

                {pendientes.length === 0 ? (
                  <p>No hay devoluciones pendientes.</p>
                ) : (
                  <form onSubmit={entregar}>
                    <fieldset disabled={saving}>
                      <label>
                        Devolución pendiente
                        <select
                          value={reembolsoId}
                          onChange={(event) => {
                            setReembolsoId(event.target.value)
                            setReferencia('')
                            setConfirmado(false)
                            setFormError('')
                          }}
                          required
                        >
                          <option value="">
                            Seleccioná una devolución
                          </option>

                          {pendientes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {actividad(item.reservacion_id)}
                              {' · '}
                              {moneda.format(item.monto)}
                            </option>
                          ))}
                        </select>
                      </label>

                      {seleccionado && (
                        <>
                          <p>
                            Importe autorizado:{' '}
                            <strong>
                              {moneda.format(seleccionado.monto)}
                            </strong>
                          </p>

                          <label>
                            Método utilizado
                            <select
                              value={metodo}
                              onChange={(event) => {
                                setMetodo(event.target.value)
                                setConfirmado(false)
                              }}
                            >
                              <option value="efectivo">
                                Efectivo
                              </option>
                              <option value="transferencia">
                                Transferencia
                              </option>
                            </select>
                          </label>

                          <label>
                            Referencia{' '}
                            {metodo === 'efectivo' ? '(opcional)' : ''}
                            <input
                              value={referencia}
                              maxLength={150}
                              required={metodo === 'transferencia'}
                              onChange={(event) => {
                                setReferencia(event.target.value)
                                setConfirmado(false)
                              }}
                            />
                          </label>

                          <label className="finanzas__check">
                            <input
                              type="checkbox"
                              checked={confirmado}
                              onChange={(event) =>
                                setConfirmado(event.target.checked)
                              }
                              required
                            />
                            Confirmo que ya entregué el importe completo
                            autorizado.
                          </label>

                          <button
                            type="submit"
                            disabled={!confirmado}
                          >
                            {saving
                              ? 'Registrando…'
                              : 'Registrar entrega'}
                          </button>
                        </>
                      )}
                    </fieldset>
                  </form>
                )}
              </div>

              <div className="finanzas__panel">
                <h3>Historial de devoluciones entregadas</h3>

                {entregados.length === 0 ? (
                  <p>No hay devoluciones entregadas registradas.</p>
                ) : (
                  <div className="finanzas__table">
                    <table>
                      <caption>
                        Entregas registradas de todos los meses
                      </caption>

                      <thead>
                        <tr>
                          <th scope="col">Reserva</th>
                          <th scope="col">Monto</th>
                          <th scope="col">Entrega</th>
                          <th scope="col">Método</th>
                          <th scope="col">Referencia</th>
                        </tr>
                      </thead>

                      <tbody>
                        {entregados.map((item) => (
                          <tr key={item.id}>
                            <td>
                              {actividad(item.reservacion_id)}
                            </td>
                            <td>{moneda.format(item.monto)}</td>
                            <td>
                              {item.entregado_en
                                ? fecha.format(
                                    new Date(item.entregado_en)
                                  )
                                : '—'}
                            </td>
                            <td>{item.metodo}</td>
                            <td>{item.referencia || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {formError && <p role="alert">{formError}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}