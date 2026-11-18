import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './CalendarioPage.css'

type Espacio = { id: string; nombre: string }
type Ocupacion = { id: string; espacio_id: string; reservacion_id: string | null; tipo: string; inicio: string; fin: string; motivo: string | null }
type Reserva = { id: string; nombre_evento: string; cliente_id: string; inicio: string; fin: string; estado: string }
type Cliente = { id: string; nombre: string }
type Detalle = { reservacion_id: string; espacio_id: string }
type Props = { onBack: () => void; onNuevaReservacion?: () => void }
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

const hora = new Intl.DateTimeFormat('es-NI', { timeZone: 'America/Managua', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function sumarDias(dia: string, cantidad: number) { return fechaLocal(new Date(inicioDia(dia) + cantidad * DAY)) }
function lunes(dia: string) { const numero = new Date(inicioDia(dia)).getUTCDay(); return sumarDias(dia, -((numero + 6) % 7)) }

export default function CalendarioPage({ onBack, onNuevaReservacion }: Props) {
  const hoy = fechaLocal(new Date())
  const [mes, setMes] = useState(() => hoy.slice(0, 7))
  const [seleccionado, setSeleccionado] = useState(hoy)
  const [vista, setVista] = useState<'mes' | 'semana'>('mes')
  const [filtro, setFiltro] = useState('')
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [ocupaciones, setOcupaciones] = useState<Ocupacion[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [detalles, setDetalles] = useState<Detalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [anio, numeroMes] = mes.split('-').map(Number)
  const primerDia = `${mes}-01`
  const diasDelMes = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate()
  const dias = Array.from({ length: diasDelMes }, (_, index) => `${mes}-${String(index + 1).padStart(2, '0')}`)
  const inicioMes = lunes(primerDia)
  const cantidadCeldas = Math.ceil(((inicioDia(primerDia) - inicioDia(inicioMes)) / DAY + diasDelMes) / 7) * 7
  // Load the whole visible grid, including the adjacent month's days.
  const desde = vista === 'mes' ? inicioMes : lunes(seleccionado)
  const hasta = sumarDias(desde, vista === 'mes' ? cantidadCeldas : 7)
  const celdas = Array.from({ length: vista === 'mes' ? cantidadCeldas : 7 }, (_, index) => sumarDias(desde, index))

  useEffect(() => {
    let cancelled = false
    async function cargar() {
      setLoading(true)
      setError('')
      try {
        const [espaciosResult, ocupacionesResult, reservasResult, clientesResult] = await Promise.all([
          supabase.from('espacios').select('id, nombre').order('nombre'),
          supabase.from('ocupaciones').select('id, espacio_id, reservacion_id, tipo, inicio, fin, motivo').lt('inicio', `${hasta}T00:00:00-06:00`).gt('fin', `${desde}T00:00:00-06:00`).order('inicio'),
          supabase.from('reservaciones').select('id, nombre_evento, cliente_id, inicio, fin, estado').in('estado', ['pendiente', 'confirmada', 'completada']).lt('inicio', `${hasta}T00:00:00-06:00`).gt('fin', `${desde}T00:00:00-06:00`),
          supabase.from('clientes').select('id, nombre'),
        ])
        if (cancelled) return
        if (espaciosResult.error || ocupacionesResult.error || reservasResult.error || clientesResult.error) throw new Error('consulta')
        const lista: Reserva[] = reservasResult.data ?? []
        const pendientes = lista.filter((reserva) => reserva.estado === 'pendiente').map((reserva) => reserva.id)
        let listaDetalles: Detalle[] = []
        if (pendientes.length > 0) {
          const resultado = await supabase.from('reservacion_espacios').select('reservacion_id, espacio_id').in('reservacion_id', pendientes)
          if (resultado.error) throw new Error('detalles')
          listaDetalles = resultado.data ?? []
        }
        if (cancelled) return
        setEspacios(espaciosResult.data ?? [])
        setOcupaciones(ocupacionesResult.data ?? [])
        setReservas(lista)
        setClientes(clientesResult.data ?? [])
        setDetalles(listaDetalles)
      } catch {
        if (!cancelled) setError('No se pudo cargar el calendario. Usá “Actualizar” para reintentar.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void cargar()
    return () => { cancelled = true }
  }, [desde, hasta, reload])

  const pendientes: Ocupacion[] = detalles.flatMap((detalle) => {
    const reserva = reservas.find((item) => item.id === detalle.reservacion_id && item.estado === 'pendiente')
    return reserva ? [{ id: `pendiente-${reserva.id}-${detalle.espacio_id}`, espacio_id: detalle.espacio_id, reservacion_id: reserva.id, tipo: 'pendiente', inicio: reserva.inicio, fin: reserva.fin, motivo: null }] : []
  })
  const eventos = [...ocupaciones, ...pendientes].filter((item) => !filtro || item.espacio_id === filtro).sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  const delDia = (dia: string) => eventos.filter((item) => ocupaDia(item, dia))
  const reservasDelDia = (dia: string) => new Set(delDia(dia).filter((item) => item.tipo === 'reservacion' && item.reservacion_id).map((item) => item.reservacion_id)).size
  const agenda = delDia(seleccionado)
  const confirmadas = reservasDelDia(seleccionado)
  const cantidadPendientes = new Set(agenda.filter((item) => item.tipo === 'pendiente').map((item) => item.reservacion_id)).size
  const diasReservados = dias.filter((dia) => reservasDelDia(dia) > 0)
  const visibles = espacios.filter((espacio) => !filtro || espacio.id === filtro)
  const etiqueta = (item: Ocupacion) => item.tipo === 'pendiente' ? 'Solicitud pendiente' : item.tipo === 'mantenimiento' ? 'Mantenimiento' : 'Reserva confirmada'
  const nombreEspacio = (id: string) => espacios.find((espacio) => espacio.id === id)?.nombre || 'Espacio'

  function mover(cambio: number) {
    if (vista === 'semana') {
      const dia = sumarDias(seleccionado, cambio * 7)
      setSeleccionado(dia); setMes(dia.slice(0, 7))
    } else {
      const nuevoMes = fechaLocal(new Date(Date.UTC(anio, numeroMes - 1 + cambio, 1, 12))).slice(0, 7)
      setMes(nuevoMes); setSeleccionado(`${nuevoMes}-01`)
    }
  }
  function irHoy() { setMes(hoy.slice(0, 7)); setSeleccionado(hoy) }

  return (
    <main className="calendario">
      <header className="calendario__header">
        <div><p className="calendario__eyebrow">CITA · QUINTA ANFUSO</p><h1>Calendario</h1><p>Reservaciones y disponibilidad · Hora de Nicaragua</p></div>
        <div className="calendario__controls">{onNuevaReservacion && <button type="button" className="calendario__primary" onClick={onNuevaReservacion}>＋ Nueva reservación</button>}<button type="button" onClick={onBack}>Volver al inicio</button></div>
      </header>
      <div className="calendario__toolbar">
        <div className="calendario__controls"><label className="calendario__filtro">Espacio<select value={filtro} onChange={(event) => setFiltro(event.target.value)}><option value="">Todos los espacios</option>{espacios.map((espacio) => <option key={espacio.id} value={espacio.id}>{espacio.nombre}</option>)}</select></label><button type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>↻ Actualizar</button></div>
        <div className="calendario__vistas" aria-label="Vista del calendario"><button type="button" aria-pressed={vista === 'mes'} onClick={() => setVista('mes')}>Mes</button><button type="button" aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>Semana</button></div>
      </div>
      <div className="calendario__layout">
        <section className="calendario__month" aria-label={vista === 'mes' ? 'Calendario mensual' : 'Calendario semanal'}>
          <div className="calendario__navegacion"><div className="calendario__controls"><button type="button" aria-label={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'} onClick={() => mover(-1)}>‹</button><button type="button" onClick={irHoy}>Hoy</button><button type="button" aria-label={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => mover(1)}>›</button></div><h2>{vista === 'mes' ? formatoMes.format(new Date(inicioDia(primerDia))) : `${formatoDia.format(new Date(inicioDia(desde)))} – ${formatoDia.format(new Date(inicioDia(sumarDias(hasta, -1))))}`}</h2></div>
          {loading ? <p role="status">Cargando calendario…</p> : error ? <p role="alert">{error}</p> : <>
            <div className="calendario__weekdays" aria-hidden="true">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dia) => <span key={dia}>{dia}</span>)}</div>
            <div className={`calendario__grid${vista === 'semana' ? ' calendario__grid--semana' : ''}`}>
              {celdas.map((dia) => {
                const marcas = delDia(dia)
                return <button key={dia} type="button" className={['calendario__day', dia === seleccionado ? 'calendario__day--selected' : '', dia.slice(0, 7) !== mes && vista === 'mes' ? 'calendario__day--fuera' : ''].join(' ')} aria-pressed={dia === seleccionado} aria-label={`${formatoDia.format(new Date(inicioDia(dia)))}, ${reservasDelDia(dia)} reservas confirmadas, ${marcas.filter((item) => item.tipo === 'pendiente').length} espacios con solicitudes pendientes, ${marcas.filter((item) => item.tipo === 'mantenimiento').length} mantenimientos`} onClick={() => setSeleccionado(dia)}>
                  <span className={`calendario__number${dia === hoy ? ' calendario__number--hoy' : ''}`}>{Number(dia.slice(-2))}</span>
                  {marcas.slice(0, vista === 'mes' ? 2 : 5).map((item) => <span key={item.id} className={`calendario__marca calendario__marca--${item.tipo}`}><i aria-hidden="true" />{fechaLocal(new Date(item.inicio)) < dia ? 'Continúa' : hora.format(new Date(item.inicio))} · {nombreEspacio(item.espacio_id)}</span>)}
                  {marcas.length > (vista === 'mes' ? 2 : 5) && <span className="calendario__mas">＋{marcas.length - (vista === 'mes' ? 2 : 5)} más</span>}
                </button>
              })}
            </div>
            <div className="calendario__legend"><span><i className="calendario__dot--reserve" />Confirmada</span><span><i className="calendario__dot--maintenance" />Mantenimiento</span><span><i className="calendario__dot--pending" />Solicitud pendiente</span></div>
            <p className="calendario__note">Una marca indica ocupación durante parte o todo el día. Las solicitudes pendientes no bloquean espacios.</p>
          </>}
        </section>
        <aside className="calendario__sidebar" aria-labelledby="calendario-dia">
          <h2 id="calendario-dia">{formatoDia.format(new Date(inicioDia(seleccionado)))}</h2>
          {loading ? <p role="status">Cargando detalle…</p> : error ? <p>Actualizá el calendario para consultar este día.</p> : <>
            <p>{confirmadas} {confirmadas === 1 ? 'confirmada' : 'confirmadas'} · {cantidadPendientes} {cantidadPendientes === 1 ? 'pendiente' : 'pendientes'}</p>
            {agenda.length === 0 ? <p>No hay reservas, solicitudes ni mantenimientos registrados para este día.</p> : <div className="calendario__events">{agenda.map((item) => {
              const reserva = reservas.find((reserva) => reserva.id === item.reservacion_id)
              return <article className={`calendario__event calendario__event--${item.tipo}`} key={item.id}>
                <span className="calendario__event-type">{etiqueta(item)}</span><h3>{item.tipo === 'mantenimiento' ? item.motivo || 'Mantenimiento' : reserva?.nombre_evento || 'Reservación'}</h3>
                <p>{nombreEspacio(item.espacio_id)}</p><p>Desde: {formatoHorario.format(new Date(item.inicio))}<br />Hasta: {formatoHorario.format(new Date(item.fin))}</p>
                {reserva && <p>{clientes.find((cliente) => cliente.id === reserva.cliente_id)?.nombre || 'Cliente'}<br /><small>Referencia: {reserva.id.slice(0, 8)}</small></p>}
              </article>
            })}</div>}
            <details className="calendario__disponibilidad"><summary>Bloqueos por espacio en este día</summary>{visibles.length === 0 ? <p>No hay espacios registrados.</p> : visibles.map((espacio) => {
              const bloqueos = agenda.filter((item) => item.espacio_id === espacio.id && item.tipo !== 'pendiente')
              return <div key={espacio.id}><strong>{espacio.nombre}</strong>{bloqueos.length === 0 ? <p>Sin bloqueos registrados en este día.</p> : bloqueos.map((item) => <p key={item.id}>{etiqueta(item)}<br />{formatoHorario.format(new Date(item.inicio))} – {formatoHorario.format(new Date(item.fin))}</p>)}</div>
            })}<p>Para reservar, verificá el intervalo exacto. Una ocupación puede abarcar solo parte del día.</p></details>
          </>}
        </aside>
      </div>
      {!loading && !error && <section className="calendario__reserved" aria-labelledby="dias-reservados"><h2 id="dias-reservados">Días reservados</h2><p>{vista === 'mes' ? `${diasReservados.length} días con reservas confirmadas este mes.` : 'Días con reservas confirmadas dentro de la semana visible.'}</p><div className="calendario__reserved-list">{(vista === 'mes' ? diasReservados : celdas.filter((dia) => reservasDelDia(dia) > 0)).map((dia) => <button type="button" key={dia} aria-pressed={dia === seleccionado} onClick={() => setSeleccionado(dia)}><strong>{Number(dia.slice(-2))}</strong><span>{formatoDia.format(new Date(inicioDia(dia)))}<small>{reservasDelDia(dia)} reservas confirmadas</small></span></button>)}</div>{(vista === 'mes' ? diasReservados : celdas.filter((dia) => reservasDelDia(dia) > 0)).length === 0 && <p>No hay días reservados en este período para el filtro seleccionado.</p>}</section>}
    </main>
  )
}
