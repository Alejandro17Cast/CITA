import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './CalendarioPage.css'

type Espacio = {
  id: string
  nombre: string
}

type Ocupacion = {
  id: string
  espacio_id: string
  reservacion_id: string | null
  tipo: string
  inicio: string
  fin: string
  motivo: string | null
}

type Reserva = {
  id: string
  nombre_evento: string
}

type Props = {
  onBack: () => void
}

const DAY = 86400000

function fechaLocal(date: Date) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? ''

  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function inicioDia(dia: string) {
  return new Date(`${dia}T00:00:00-06:00`).getTime()
}

function ocupaDia(ocupacion: Ocupacion, dia: string) {
  const inicio = inicioDia(dia)

  return (
    new Date(ocupacion.inicio).getTime() < inicio + DAY &&
    new Date(ocupacion.fin).getTime() > inicio
  )
}

const formatoMes = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  month: 'long',
  year: 'numeric',
})

const formatoDia = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const formatoHorario = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function CalendarioPage({ onBack }: Props) {
  const hoy = fechaLocal(new Date())

  const [mes, setMes] = useState(() => hoy.slice(0, 7))
  const [seleccionado, setSeleccionado] = useState(hoy)
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [ocupaciones, setOcupaciones] = useState<Ocupacion[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const [anio, numeroMes] = mes.split('-').map(Number)
  const primerDia = `${mes}-01`

  const siguienteMes = fechaLocal(
    new Date(Date.UTC(anio, numeroMes, 1, 12))
  ).slice(0, 7)

  const diasDelMes = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate()
  const semanaInicio = new Date(Date.UTC(anio, numeroMes - 1, 1)).getUTCDay()
  const desplazamiento = (semanaInicio + 6) % 7

  const dias = Array.from(
    { length: diasDelMes },
    (_, index) => `${mes}-${String(index + 1).padStart(2, '0')}`
  )

  const cantidadCeldas = Math.ceil((desplazamiento + diasDelMes) / 7) * 7

  const celdas = Array.from({ length: cantidadCeldas }, (_, index) => {
    const numero = index - desplazamiento + 1
    return numero >= 1 && numero <= diasDelMes
      ? `${mes}-${String(numero).padStart(2, '0')}`
      : null
  })

  useEffect(() => {
    let cancelled = false

    async function cargarMes() {
      setLoading(true)
      setError('')

      try {
        const [espaciosResult, ocupacionesResult, reservasResult] =
          await Promise.all([
            supabase.from('espacios').select('id, nombre').order('nombre'),
            supabase
              .from('ocupaciones')
              .select(
                'id, espacio_id, reservacion_id, tipo, inicio, fin, motivo'
              )
              .lt('inicio', `${siguienteMes}-01T00:00:00-06:00`)
              .gt('fin', `${mes}-01T00:00:00-06:00`)
              .order('inicio'),
            supabase
              .from('reservaciones')
              .select('id, nombre_evento')
              .eq('estado', 'confirmada')
              .lt('inicio', `${siguienteMes}-01T00:00:00-06:00`)
              .gt('fin', `${mes}-01T00:00:00-06:00`),
          ])

        if (cancelled) return

        if (
          espaciosResult.error ||
          ocupacionesResult.error ||
          reservasResult.error
        ) {
          setError('No se pudo cargar el calendario.')
        } else {
          setEspacios(espaciosResult.data ?? [])
          setOcupaciones(ocupacionesResult.data ?? [])
          setReservas(reservasResult.data ?? [])
        }
      } catch {
        if (!cancelled) setError('No se pudo conectar para consultar el mes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarMes()
    return () => { cancelled = true }
  }, [mes, siguienteMes, reload])

  function cambiarMes(cambio: number) {
    const nuevoMes = fechaLocal(
      new Date(Date.UTC(anio, numeroMes - 1 + cambio, 1, 12))
    ).slice(0, 7)

    setLoading(true)
    setMes(nuevoMes)
    setSeleccionado(`${nuevoMes}-01`)
  }

  function irHoy() {
    if (mes !== hoy.slice(0, 7)) setLoading(true)
    setMes(hoy.slice(0, 7))
    setSeleccionado(hoy)
  }

  function reservasDelDia(dia: string) {
    return new Set(
      ocupaciones
        .filter((item) => item.tipo === 'reservacion' && ocupaDia(item, dia))
        .map((item) => item.reservacion_id)
    ).size
  }

  const diasReservados = dias.filter((dia) => reservasDelDia(dia) > 0)
  const agenda = ocupaciones.filter((item) => ocupaDia(item, seleccionado))

  return (
    <main className="calendario">
      <header className="calendario__header">
        <div>
          <p className="calendario__eyebrow">CITA · QUINTA ANFUSO</p>
          <h1>Calendario</h1>
          <p>Reservaciones y disponibilidad · hora de Nicaragua.</p>
        </div>

        <button type="button" onClick={onBack}>Volver al inicio</button>
      </header>

      <div className="calendario__toolbar">
        <h2>{formatoMes.format(new Date(inicioDia(primerDia)))}</h2>

        <div className="calendario__controls">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => cambiarMes(-1)}
          >
            ‹
          </button>
          <button type="button" onClick={irHoy}>Hoy</button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => cambiarMes(1)}
          >
            ›
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <p role="status">Cargando calendario…</p>
      ) : error ? (
        <p role="alert">{error} Usá “Actualizar” para reintentar.</p>
      ) : (
        <>
          <div className="calendario__layout">
            <section className="calendario__month" aria-label="Calendario mensual">
              <div className="calendario__weekdays" aria-hidden="true">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dia) => (
                  <span key={dia}>{dia}</span>
                ))}
              </div>

              <div className="calendario__grid">
                {celdas.map((dia, index) => {
                  if (!dia) {
                    return (
                      <div
                        key={`vacio-${index}`}
                        className="calendario__empty"
                        aria-hidden="true"
                      />
                    )
                  }

                  const cantidad = reservasDelDia(dia)
                  const mantenimiento = ocupaciones.some(
                    (item) => item.tipo === 'mantenimiento' && ocupaDia(item, dia)
                  )

                  return (
                    <button
                      key={dia}
                      type="button"
                      className={[
                        'calendario__day',
                        cantidad > 0 ? 'calendario__day--reserved' : '',
                        dia === seleccionado ? 'calendario__day--selected' : '',
                      ].join(' ')}
                      aria-pressed={dia === seleccionado}
                      aria-label={`${formatoDia.format(new Date(inicioDia(dia)))}, ${
                        cantidad
                      } reservas${mantenimiento ? ', con mantenimiento' : ''}`}
                      onClick={() => setSeleccionado(dia)}
                    >
                      <span className="calendario__number">
                        {Number(dia.slice(-2))}
                        {dia === hoy && <span className="calendario__today">Hoy</span>}
                      </span>

                      {cantidad > 0 && (
                        <span className="calendario__count">
                          {cantidad} {cantidad === 1 ? 'reserva' : 'reservas'}
                        </span>
                      )}

                      <span className="calendario__dots" aria-hidden="true">
                        {cantidad > 0 && <i className="calendario__dot--reserve" />}
                        {mantenimiento && <i className="calendario__dot--maintenance" />}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="calendario__legend">
                <span><i className="calendario__dot--reserve" /> Reserva confirmada</span>
                <span><i className="calendario__dot--maintenance" /> Mantenimiento</span>
              </div>

              <p className="calendario__note">
                Una marca indica ocupación durante parte o todo el día.
                Las solicitudes pendientes no bloquean espacios.
              </p>
            </section>

            <aside className="calendario__sidebar">
              <h2>Días reservados</h2>
              <p>{diasReservados.length} días con reservas este mes.</p>

              <div className="calendario__reserved-list">
                {diasReservados.length === 0 ? (
                  <p>No hay días reservados en este mes.</p>
                ) : diasReservados.map((dia) => (
                  <button
                    type="button"
                    key={dia}
                    className={dia === seleccionado ? 'calendario__list-active' : ''}
                    aria-pressed={dia === seleccionado}
                    onClick={() => setSeleccionado(dia)}
                  >
                    <strong>{Number(dia.slice(-2))}</strong>
                    <span>
                      {formatoDia.format(new Date(inicioDia(dia)))}
                      <small>{reservasDelDia(dia)} reservas confirmadas</small>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <section className="calendario__details" aria-live="polite">
            <h2>{formatoDia.format(new Date(inicioDia(seleccionado)))}</h2>

            {agenda.length === 0 ? (
              <p>No hay ocupaciones registradas para este día.</p>
            ) : (
              <div className="calendario__events">
                {agenda.map((item) => (
                  <article className="calendario__event" key={item.id}>
                    <span className="calendario__event-type">
                      {item.tipo === 'mantenimiento'
                        ? 'Mantenimiento'
                        : 'Reserva confirmada'}
                    </span>

                    <h3>
                      {item.tipo === 'mantenimiento'
                        ? item.motivo || 'Mantenimiento'
                        : reservas.find((reserva) =>
                            reserva.id === item.reservacion_id
                          )?.nombre_evento || 'Reservación'}
                    </h3>

                    <p>
                      {espacios.find((espacio) =>
                        espacio.id === item.espacio_id
                      )?.nombre || 'Espacio'}
                    </p>

                    <p>
                      Desde: {formatoHorario.format(new Date(item.inicio))}
                      <br />
                      Hasta: {formatoHorario.format(new Date(item.fin))}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}