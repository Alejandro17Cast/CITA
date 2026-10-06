import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import ReservacionesPage from './ReservacionesPage'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

type Reserva = {
  id: string
  nombre_evento: string
  inicio: string
  estado: string
  motivo_cancelacion: string | null
  cancelado_en: string | null
}

type Pago = {
  reservacion_id: string
  monto: number
}

type Reembolso = {
  id: string
  reservacion_id: string
  tipo: string
  total_pagado: number
  monto: number
  motivo: string
  estado: string
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

const tipos: Record<string, string> = {
  ninguno: 'Sin reembolso',
  total: 'Devolución total',
  porcentaje: 'Porcentaje',
  monto: 'Monto específico',
}

const estados: Record<string, string> = {
  no_aplica: 'Sin devolución',
  pendiente: 'Pendiente de entregar',
  entregado: 'Entregado',
}

export default function GestionReservacionesPage({ onBack }: Props) {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [reembolsos, setReembolsos] = useState<Reembolso[]>([])
  const [administrador, setAdministrador] = useState(false)

  const [reservaId, setReservaId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [tipo, setTipo] = useState('')
  const [valor, setValor] = useState('')
  const [confirmado, setConfirmado] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function cargarDatos() {
      setLoading(true)
      setLoadError('')

      try {
        const { data: auth, error: authError } =
          await supabase.auth.getUser()

        if (authError || !auth.user) {
          throw new Error('No se pudo validar el usuario.')
        }

        const [reservasResult, pagosResult, reembolsosResult, perfilResult] =
          await Promise.all([
            supabase
              .from('reservaciones')
              .select(
                'id, nombre_evento, inicio, estado, motivo_cancelacion, cancelado_en'
              )
              .order('creado_en', { ascending: false }),
            supabase.from('pagos').select('reservacion_id, monto'),
            supabase
              .from('reembolsos')
              .select(
                'id, reservacion_id, tipo, total_pagado, monto, motivo, estado'
              ),
            supabase
              .from('perfiles')
              .select('rol, activo')
              .eq('id', auth.user.id)
              .single(),
          ])

        if (cancelled) return

        if (
          reservasResult.error ||
          pagosResult.error ||
          reembolsosResult.error ||
          perfilResult.error ||
          !perfilResult.data?.activo
        ) {
          setLoadError('No se pudieron cargar los datos o tu perfil no está activo.')
          return
        }

        setReservas(reservasResult.data ?? [])
        setPagos(pagosResult.data ?? [])
        setReembolsos(reembolsosResult.data ?? [])
        setAdministrador(perfilResult.data.rol === 'administrador')
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo conectar para consultar las cancelaciones.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarDatos()
    return () => { cancelled = true }
  }, [reload])

  const seleccionada = reservas.find((reserva) => reserva.id === reservaId)

  const pagadoCentavos = pagos
    .filter((pago) => pago.reservacion_id === reservaId)
    .reduce(
      (total, pago) => total + Math.round(Number(pago.monto) * 100),
      0
    )

  const valorNumero = Number(valor)

  const valorValido =
    (tipo === 'ninguno' || tipo === 'total') ||
    (
      valor.trim() !== '' &&
      Number.isFinite(valorNumero) &&
      valorNumero > 0 &&
      (tipo !== 'porcentaje' || valorNumero <= 100)
    )

  const devolverCentavos = !valorValido
    ? 0
    : tipo === 'total'
      ? pagadoCentavos
      : tipo === 'porcentaje'
        ? Math.round(pagadoCentavos * valorNumero / 100)
        : tipo === 'monto'
          ? Math.round(valorNumero * 100)
          : 0

  const requiereAdministrador = pagadoCentavos > 0 && !administrador

  const opciones = reservas.filter((reserva) =>
    !reembolsos.some((item) => item.reservacion_id === reserva.id)
  )

  const canceladas = reservas.filter((reserva) => reserva.estado === 'cancelada')

  function limpiarDecision() {
    setMotivo('')
    setTipo('')
    setValor('')
    setConfirmado(false)
    setFormError('')
  }

  async function cancelarReserva(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    setFormError('')
    setMessage('')

    if (
      !seleccionada ||
      requiereAdministrador ||
      !tipo ||
      !valorValido ||
      motivo.trim().length < 5 ||
      !confirmado
    ) {
      setFormError('Revisá la reserva, el motivo y la decisión de reembolso.')
      return
    }

    if (
      devolverCentavos > pagadoCentavos ||
      (tipo !== 'ninguno' && devolverCentavos <= 0)
    ) {
      setFormError('El reembolso debe ser positivo y no superar lo pagado.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.rpc('cancelar_con_reembolso', {
        p_reservacion_id: reservaId,
        p_motivo: motivo.trim(),
        p_tipo: tipo,
        p_valor:
          tipo === 'porcentaje' || tipo === 'monto'
            ? valorNumero
            : 0,
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
        devolverCentavos > 0
          ? 'Cancelación registrada. El reembolso quedó pendiente de entrega.'
          : 'Cancelación registrada sin reembolso.'
      )

      setReservaId('')
      limpiarDecision()
      setReload((value) => value + 1)
      setVersion((value) => value + 1)
    } catch {
      setFormError(
        'La conexión se interrumpió. Actualizá los datos para verificar el resultado.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ReservacionesPage key={version} onBack={onBack} />

      <section className="cancelaciones">
        <div className="clientes__panel">
          <div className="clientes__list-header">
            <h2>Cancelación y reembolso</h2>

            <button
              type="button"
              disabled={loading || saving}
              onClick={() => {
                setReservaId('')
                limpiarDecision()
                setReload((value) => value + 1)
                setVersion((value) => value + 1)
              }}
            >
              Actualizar datos
            </button>
          </div>

          <p>
            Cancelá una reserva o registrá la decisión de reembolso
            de una cancelación anterior.
          </p>

          {loading ? (
            <p role="status">Cargando datos…</p>
          ) : loadError ? (
            <p role="alert">{loadError}</p>
          ) : (
            <form onSubmit={cancelarReserva}>
              <fieldset disabled={saving}>
                <label>
                  Reservación
                  <select
                    value={reservaId}
                    onChange={(event) => {
                      setReservaId(event.target.value)
                      limpiarDecision()
                      setMessage('')
                      if (!administrador) setTipo('ninguno')
                    }}
                    required
                  >
                    <option value="">Seleccioná una reserva</option>
                    {opciones.map((reserva) => (
                      <option key={reserva.id} value={reserva.id}>
                        {reserva.nombre_evento} · {fecha.format(
                          new Date(reserva.inicio)
                        )} · {reserva.estado} · {reserva.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>

                {seleccionada && (
                  <>
                    <p>
                      Total pagado:
                      {' '}<strong>{moneda.format(pagadoCentavos / 100)}</strong>
                    </p>

                    {requiereAdministrador ? (
                      <p>
                        Esta reserva tiene pagos.
                        Su cancelación y decisión de reembolso
                        deben registrarlas un administrador.
                      </p>
                    ) : (
                      <>
                        <label>
                          Decisión de reembolso
                          <select
                            value={tipo}
                            onChange={(event) => {
                              setTipo(event.target.value)
                              setValor('')
                              setConfirmado(false)
                            }}
                            required
                          >
                            <option value="" disabled>Seleccioná una opción</option>
                            <option value="ninguno">Sin reembolso</option>
                            {administrador && pagadoCentavos > 0 && (
                              <>
                                <option value="total">Devolución total</option>
                                <option value="porcentaje">Porcentaje</option>
                                <option value="monto">Monto específico</option>
                              </>
                            )}
                          </select>
                        </label>

                        {(tipo === 'porcentaje' || tipo === 'monto') && (
                          <label>
                            {tipo === 'porcentaje'
                              ? 'Porcentaje a devolver'
                              : 'Monto a devolver en córdobas'}
                            <input
                              type="number"
                              min="0.01"
                              max={tipo === 'porcentaje' ? 100 : pagadoCentavos / 100}
                              step="0.01"
                              value={valor}
                              onChange={(event) => {
                                setValor(event.target.value)
                                setConfirmado(false)
                              }}
                              required
                            />
                          </label>
                        )}

                        {tipo && (
                          <div className="reembolso__resumen">
                            <p>
                              A devolver:
                              {' '}<strong>
                                {moneda.format(devolverCentavos / 100)}
                              </strong>
                            </p>
                            <p>
                              A retener:
                              {' '}<strong>
                                {moneda.format(
                                  (pagadoCentavos - devolverCentavos) / 100
                                )}
                              </strong>
                            </p>
                            <p>
                              La devolución quedará pendiente.
                              Aquí no se registra la entrega del dinero.
                            </p>
                          </div>
                        )}

                        <label>
                          Motivo de cancelación y decisión de reembolso
                          <textarea
                            rows={3}
                            minLength={5}
                            maxLength={1000}
                            value={motivo}
                            onChange={(event) => {
                              setMotivo(event.target.value)
                              setConfirmado(false)
                            }}
                            required
                          />
                        </label>

                        <label className="cancelaciones__confirmacion">
                          <input
                            type="checkbox"
                            checked={confirmado}
                            onChange={(event) => setConfirmado(event.target.checked)}
                            required
                          />
                          Confirmo la cancelación y los importes indicados.
                        </label>

                        <button
                          type="submit"
                          className="clientes__primary"
                          disabled={!confirmado}
                        >
                          {saving ? 'Guardando…' : 'Confirmar cancelación y decisión'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </fieldset>
            </form>
          )}

          {formError && <p role="alert">{formError}</p>}
          {message && <p role="status">{message}</p>}
        </div>

        {!loading && !loadError && (
          <div className="clientes__panel">
            <h2>Cancelaciones y devoluciones</h2>

            {canceladas.length === 0 ? (
              <p>No hay reservaciones canceladas.</p>
            ) : (
              <div className="clientes__table-wrapper">
                <table>
                  <caption>Decisiones registradas por reservación</caption>
                  <thead>
                    <tr>
                      <th scope="col">Actividad</th>
                      <th scope="col">Pagado</th>
                      <th scope="col">Decisión</th>
                      <th scope="col">A devolver</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canceladas.map((reserva) => {
                      const decision = reembolsos.find(
                        (item) => item.reservacion_id === reserva.id
                      )

                      const pagado = pagos
                        .filter((pago) => pago.reservacion_id === reserva.id)
                        .reduce(
                          (total, pago) =>
                            total + Math.round(Number(pago.monto) * 100),
                          0
                        ) / 100

                      return (
                        <tr key={reserva.id}>
                          <td>{reserva.nombre_evento}</td>
                          <td>{moneda.format(pagado)}</td>
                          <td>{decision ? tipos[decision.tipo] : 'Sin decisión'}</td>
                          <td>{decision ? moneda.format(decision.monto) : '—'}</td>
                          <td>
                            {decision
                              ? estados[decision.estado]
                              : 'Pendiente de decisión'}
                          </td>
                          <td>
                            {decision?.motivo ||
                              reserva.motivo_cancelacion ||
                              'Sin motivo registrado'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}