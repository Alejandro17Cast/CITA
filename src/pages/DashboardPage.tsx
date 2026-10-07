import { useEffect, useState } from 'react'
import ClientesPage from './ClientesPage'
import EspaciosPage from './EspaciosPage'
import ReservacionesPage from './GestionReservacionesPage'
import PagosPage from './PagosPage'
import CalendarioPage from './CalendarioPage'
import FinanzasPanel from './FinanzasPanel'
import { supabase } from '../lib/supabase'
import MantenimientosPage from './MantenimientosPage'
import Sidebar from './Sidebar'
import ReportesPage from './ReportesPage'
import UsuariosPage from './UsuariosPage'
import './DashboardPage.css'

type Props = {
  nombre: string
  rol: 'administrador' | 'encargado'
  signingOut: boolean
  message: string
  onSignOut: () => void
}

type Page =
  | 'inicio'
  | 'clientes'
  | 'espacios'
  | 'reservaciones'
  | 'pagos'
  | 'calendario'
  | 'mantenimientos'
  | 'reportes'
  | 'usuarios'
type Reserva = {
  id: string
  nombre_evento: string
  inicio: string
  fin: string
  estado: string
}

type MesFinanciero = {
  clave: string
  nombre: string
  recibido: number
  devuelto: number
  neto: number
}

type Resumen = {
  clientes: number
  espacios: number
  ocupados: number
  reservasMes: Reserva[]
  proximas: Reserva[]
  meses: MesFinanciero[]
}

function diaNicaragua(date: Date) {
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

function mesRelativo(anio: number, mes: number, cambio: number) {
  return diaNicaragua(
    new Date(Date.UTC(anio, mes - 1 + cambio, 1, 12))
  ).slice(0, 7)
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

const formatoMes = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  month: 'long',
  year: 'numeric',
})

export default function DashboardPage({
  nombre,
  rol,
  signingOut,
  message,
  onSignOut,
}: Props) {
  const [page, setPage] = useState<Page>('inicio')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const hoy = diaNicaragua(new Date())
  const mesActual = hoy.slice(0, 7)
  const [anio, mes] = mesActual.split('-').map(Number)

  useEffect(() => {
    if (page !== 'inicio') return

    let cancelled = false

    async function cargarResumen() {
      setLoading(true)
      setError('')

      const ahora = new Date().toISOString()
      const mesSiguiente = mesRelativo(anio, mes, 1)
      const primerMes = mesRelativo(anio, mes, -5)

      const inicioPeriodo = `${primerMes}-01T00:00:00-06:00`
      const finPeriodo = `${mesSiguiente}-01T00:00:00-06:00`

      try {
        const [
          clientesResult,
          espaciosResult,
          ocupacionesResult,
          reservasResult,
          proximasResult,
          pagosResult,
          reembolsosResult,
        ] = await Promise.all([
          supabase.from('clientes').select('id', {
            count: 'exact',
            head: true,
          }),

          supabase
            .from('espacios')
            .select('id')
            .eq('activo', true),

          supabase
            .from('ocupaciones')
            .select('espacio_id')
            .lte('inicio', ahora)
            .gt('fin', ahora),

          supabase
            .from('reservaciones')
            .select('id, nombre_evento, inicio, fin, estado')
            .eq('estado', 'confirmada')
            .lt('inicio', `${mesSiguiente}-01T00:00:00-06:00`)
            .gt('fin', `${mesActual}-01T00:00:00-06:00`),

          supabase
            .from('reservaciones')
            .select('id, nombre_evento, inicio, fin, estado')
            .eq('estado', 'confirmada')
            .gte('inicio', ahora)
            .order('inicio')
            .limit(5),

          rol === 'administrador'
            ? supabase
                .from('pagos')
                .select('monto, registrado_en')
                .gte('registrado_en', inicioPeriodo)
                .lt('registrado_en', finPeriodo)
            : Promise.resolve({ data: [], error: null }),

          rol === 'administrador'
            ? supabase
                .from('reembolsos')
                .select('monto, entregado_en')
                .eq('estado', 'entregado')
                .gte('entregado_en', inicioPeriodo)
                .lt('entregado_en', finPeriodo)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (cancelled) return

        if (
          clientesResult.error ||
          espaciosResult.error ||
          ocupacionesResult.error ||
          reservasResult.error ||
          proximasResult.error ||
          pagosResult.error ||
          reembolsosResult.error
        ) {
          setError('No se pudieron cargar los indicadores.')
          return
        }

        const activos = new Set(
          (espaciosResult.data ?? []).map((espacio) => espacio.id)
        )

        const ocupados = new Set(
          (ocupacionesResult.data ?? [])
            .filter((item) => activos.has(item.espacio_id))
            .map((item) => item.espacio_id)
        )

        const meses: MesFinanciero[] = Array.from(
          { length: 6 },
          (_, index) => {
            const clave = mesRelativo(anio, mes, index - 5)

            const recibidoCentavos = (pagosResult.data ?? [])
              .filter((pago) =>
                diaNicaragua(new Date(pago.registrado_en))
                  .startsWith(clave)
              )
              .reduce(
                (total, pago) =>
                  total + Math.round(Number(pago.monto) * 100),
                0
              )

            const devueltoCentavos = (reembolsosResult.data ?? [])
              .filter((reembolso) =>
                reembolso.entregado_en !== null &&
                diaNicaragua(new Date(reembolso.entregado_en))
                  .startsWith(clave)
              )
              .reduce(
                (total, reembolso) =>
                  total + Math.round(Number(reembolso.monto) * 100),
                0
              )

            return {
              clave,
              nombre: new Intl.DateTimeFormat('es-NI', {
                timeZone: 'America/Managua',
                month: 'short',
              }).format(new Date(`${clave}-01T12:00:00-06:00`)),
              recibido: recibidoCentavos / 100,
              devuelto: devueltoCentavos / 100,
              neto: (recibidoCentavos - devueltoCentavos) / 100,
            }
          }
        )

        setResumen({
          clientes: clientesResult.count ?? 0,
          espacios: activos.size,
          ocupados: ocupados.size,
          reservasMes: reservasResult.data ?? [],
          proximas: proximasResult.data ?? [],
          meses,
        })
      } catch {
        if (!cancelled) {
          setError('No se pudo conectar para cargar el resumen.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarResumen()

    return () => {
      cancelled = true
    }
  }, [page, reload, rol, anio, mes, mesActual])

  const modulos: { nombre: string; pagina?: Page }[] = [
    { nombre: 'Inicio', pagina: 'inicio' },
    { nombre: 'Clientes', pagina: 'clientes' },
    { nombre: 'Habitaciones y espacios', pagina: 'espacios' },
    { nombre: 'Reservaciones', pagina: 'reservaciones' },
    { nombre: 'Calendario', pagina: 'calendario' },
    { nombre: 'Pagos y abonos', pagina: 'pagos' },
    { nombre: 'Mantenimientos', pagina: 'mantenimientos' },
    ...(rol === 'administrador'
      ? [
    { nombre: 'Reportes', pagina: 'reportes' as Page },
    { nombre: 'Usuarios', pagina: 'usuarios' as Page },
  ]
      : []),
  ]

  function navegar(pagina: Page) {
    if (pagina === 'inicio') setLoading(true)
    setPage(pagina)
  }

  function volver() {
    navegar('inicio')
  }

  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()

  const desplazamiento =
    (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7

  const maxMovimiento = Math.max(
    1,
    ...(resumen?.meses.map((item) => Math.abs(item.neto)) ?? [])
  )

  function tieneReserva(numero: number) {
    const dia = `${mesActual}-${String(numero).padStart(2, '0')}`
    const inicio = new Date(`${dia}T00:00:00-06:00`).getTime()

    return resumen?.reservasMes.some((reserva) =>
      new Date(reserva.inicio).getTime() < inicio + 86400000 &&
      new Date(reserva.fin).getTime() > inicio
    )
  }

  return (
    <div className="dashboard">
      <Sidebar
  modulos={modulos}
  paginaActual={page}
  nombre={nombre}
  rol={rol}
  signingOut={signingOut}
  onNavigate={navegar}
  onSignOut={onSignOut}
/>

      <div className="dashboard__workspace">
        {message && (
          <p className="dashboard__message" role="alert">
            {message}
          </p>
        )}

        {page === 'clientes' && <ClientesPage onBack={volver} />}

        {page === 'espacios' && (
          <EspaciosPage rol={rol} onBack={volver} />
        )}

        {page === 'reservaciones' && (
          <ReservacionesPage onBack={volver} />
        )}

        {page === 'pagos' && (
          <>
            <PagosPage onBack={volver} />

            {rol === 'administrador' && (
              <div style={{ padding: '0 28px 28px' }}>
                <FinanzasPanel permitirEntrega />
              </div>
            )}
          </>
        )}
        {page === 'reportes' && rol === 'administrador' && (
  <ReportesPage onBack={volver} />
)}
{page === 'usuarios' && rol === 'administrador' && (
  <UsuariosPage onBack={volver} />
)}
{page === 'mantenimientos' && (
  <MantenimientosPage rol={rol} onBack={volver} />
)}
        {page === 'calendario' && (
          <CalendarioPage onBack={volver} />
        )}

        {page === 'inicio' && (
          <main className="dashboard__main">
            <header className="dashboard__header">
              <div>
                <p className="dashboard__eyebrow">QUINTA ANFUSO</p>
                <h2>Panel de administración</h2>
                <p>Bienvenido, {nombre || 'usuario'}.</p>
              </div>

              <button
                type="button"
                className="dashboard__action"
                disabled={loading}
                onClick={() => {
                  setLoading(true)
                  setReload((value) => value + 1)
                }}
              >
                {loading ? 'Actualizando…' : 'Actualizar datos'}
              </button>
            </header>

            {loading ? (
              <p role="status">Cargando el resumen…</p>
            ) : error ? (
              <p role="alert">
                {error} Usá “Actualizar datos” para reintentar.
              </p>
            ) : resumen && (
              <>
                {rol === 'administrador' && (
                  <FinanzasPanel key={reload} />
                )}

                <section
                  className="dashboard__stats"
                  aria-label="Indicadores operativos"
                >
                  <article className="dashboard__stat">
                    <h3>Reservas confirmadas del mes</h3>
                    <strong>{resumen.reservasMes.length}</strong>
                    <p>Con actividad durante este mes</p>
                  </article>

                  <article className="dashboard__stat">
                    <h3>Clientes registrados</h3>
                    <strong>{resumen.clientes}</strong>
                    <p>En el directorio de CITA</p>
                  </article>

                  <article className="dashboard__stat">
                    <h3>Espacios libres ahora</h3>
                    <strong>
                      {resumen.espacios - resumen.ocupados}
                    </strong>
                    <p>
                      {resumen.ocupados} ocupados de {resumen.espacios} activos
                    </p>
                  </article>
                </section>

                <div className="dashboard__middle">
                  <section className="dashboard__panel">
                    {rol === 'administrador' ? (
                      <>
                        <div className="dashboard__panel-heading">
                          <h3>Neto de los últimos seis meses</h3>
                          <span>Córdobas</span>
                        </div>

                        <div
                          className="dashboard__chart"
                          role="img"
                          aria-label={resumen.meses.map((item) =>
                            `${item.clave}: pagos ${
                              moneda.format(item.recibido)
                            }, devoluciones ${
                              moneda.format(item.devuelto)
                            }, neto ${
                              moneda.format(item.neto)
                            }`
                          ).join('; ')}
                        >
                          {resumen.meses.map((item) => (
                            <div
                              className="dashboard__column"
                              key={item.clave}
                            >
                              <span className="dashboard__bar-value">
                                {moneda.format(item.neto)}
                              </span>

                              <div
                                className="dashboard__bar-track"
                                style={{
                                  position: 'relative',
                                  display: 'block',
                                  borderBottom: 'none',
                                }}
                              >
                                <div
                                  aria-hidden="true"
                                  style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '-8px',
                                    right: '-8px',
                                    borderTop: '1px solid #dac1b4',
                                  }}
                                />

                                <div
                                  className="dashboard__bar"
                                  style={{
                                    position: 'absolute',
                                    height: `${
                                      Math.abs(item.neto) / maxMovimiento * 45
                                    }%`,
                                    ...(item.neto >= 0
                                      ? { bottom: '50%' }
                                      : { top: '50%' }),
                                    background: item.neto >= 0
                                      ? 'var(--color-primary)'
                                      : 'var(--color-brown)',
                                    borderRadius: item.neto >= 0
                                      ? '10px 10px 0 0'
                                      : '0 0 10px 10px',
                                  }}
                                />
                              </div>

                              <span>{item.nombre}</span>
                            </div>
                          ))}
                        </div>

                        <p className="dashboard__note">
                          Línea central: cero. Arriba: neto positivo.
                          Abajo: neto negativo. Solo se descuentan
                          reembolsos entregados.
                        </p>

                        <div className="dashboard__table-wrapper">
                          <table>
                            <caption>Detalle del movimiento mensual</caption>
                            <thead>
                              <tr>
                                <th scope="col">Mes</th>
                                <th scope="col">Recibido</th>
                                <th scope="col">Devuelto</th>
                                <th scope="col">Neto</th>
                              </tr>
                            </thead>

                            <tbody>
                              {resumen.meses.map((item) => (
                                <tr key={item.clave}>
                                  <td>{item.clave}</td>
                                  <td>{moneda.format(item.recibido)}</td>
                                  <td>{moneda.format(item.devuelto)}</td>
                                  <td>{moneda.format(item.neto)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3>Organizá la operación</h3>
                        <p>
                          Consultá disponibilidad antes de atender
                          una solicitud.
                        </p>

                        <button
                          type="button"
                          className="dashboard__action"
                          onClick={() => navegar('reservaciones')}
                        >
                          Nueva reservación
                        </button>

                        <button
                          type="button"
                          className="dashboard__action"
                          onClick={() => navegar('clientes')}
                        >
                          Consultar clientes
                        </button>
                      </>
                    )}
                  </section>

                  <section className="dashboard__panel">
                    <div className="dashboard__panel-heading">
                      <h3>
                        {formatoMes.format(
                          new Date(`${mesActual}-01T12:00:00-06:00`)
                        )}
                      </h3>
                    </div>

                    <div className="dashboard__mini-calendar">
                      {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(
                        (dia, index) => (
                          <strong key={`semana-${index}`}>
                            {dia}
                          </strong>
                        )
                      )}

                      {Array.from(
                        { length: desplazamiento },
                        (_, index) => (
                          <span
                            key={`vacio-${index}`}
                            aria-hidden="true"
                          />
                        )
                      )}

                      {Array.from({ length: diasMes }, (_, index) => {
                        const numero = index + 1
                        const dia =
                          `${mesActual}-${String(numero).padStart(2, '0')}`
                        const reservado = tieneReserva(numero)

                        return (
                          <span
                            key={numero}
                            className={[
                              'dashboard__mini-day',
                              dia === hoy
                                ? 'dashboard__mini-day--today'
                                : '',
                              reservado
                                ? 'dashboard__mini-day--reserved'
                                : '',
                            ].join(' ')}
                            aria-label={
                              `${numero}${
                                reservado ? ', con reserva confirmada' : ''
                              }`
                            }
                          >
                            {numero}
                          </span>
                        )
                      })}
                    </div>

                    <p className="dashboard__note">
                      Fondo crema: día con reserva · Contorno: hoy.
                    </p>

                    <button
                      type="button"
                      className="dashboard__action"
                      onClick={() => navegar('calendario')}
                    >
                      Abrir calendario
                    </button>
                  </section>
                </div>

                <section className="dashboard__panel">
                  <div className="dashboard__panel-heading">
                    <h3>Próximas reservas confirmadas</h3>

                    <button
                      type="button"
                      className="dashboard__action"
                      onClick={() => navegar('reservaciones')}
                    >
                      Ver reservaciones
                    </button>
                  </div>

                  {resumen.proximas.length === 0 ? (
                    <p>No hay próximas reservas confirmadas.</p>
                  ) : (
                    <div className="dashboard__table-wrapper">
                      <table>
                        <caption>
                          Hasta cinco reservas con inicio futuro
                        </caption>

                        <thead>
                          <tr>
                            <th scope="col">Actividad</th>
                            <th scope="col">Inicio</th>
                            <th scope="col">Fin</th>
                            <th scope="col">Estado</th>
                          </tr>
                        </thead>

                        <tbody>
                          {resumen.proximas.map((reserva) => (
                            <tr key={reserva.id}>
                              <td>{reserva.nombre_evento}</td>
                              <td>
                                {fecha.format(new Date(reserva.inicio))}
                              </td>
                              <td>
                                {fecha.format(new Date(reserva.fin))}
                              </td>
                              <td>
                                <span className="dashboard__badge">
                                  Confirmada
                                </span>
                              </td>
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
        )}
      </div>
    </div>
  )
}