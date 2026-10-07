import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

type Props = {
  onBack: () => void
}

type Pago = {
  monto: number
  registrado_en: string
}

type Reembolso = {
  monto: number
  entregado_en: string | null
}
type ResultadoConsulta<T> = {
  data: T[] | null
  error: { message: string } | null
}

type Movimiento = {
  dia: string
  recibido: number
  devuelto: number
}

type Reporte = {
  inicio: string
  fin: string
  movimientos: Movimiento[]
}

const moneda = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
})

function diaNicaragua(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? ''

  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function siguienteDia(dia: string) {
  const fecha = new Date(`${dia}T12:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 1)
  return fecha.toISOString().slice(0, 10)
}

export default function ReportesPage({ onBack }: Props) {
  const hoy = diaNicaragua(new Date())

  const [inicio, setInicio] = useState(`${hoy.slice(0, 7)}-01`)
  const [fin, setFin] = useState(hoy)
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    setError('')

    if (!inicio || !fin || fin < inicio) {
      setError('Seleccioná un período válido.')
      return
    }

    const desde = `${inicio}T00:00:00-06:00`
    const hasta = `${siguienteDia(fin)}T00:00:00-06:00`

    setLoading(true)
    setReporte(null)

    try {
      const pagos: Pago[] = []
      const reembolsos: Reembolso[] = []

      let paginaPagos = 0
      let paginaReembolsos = 0
      let faltanPagos = true
      let faltanReembolsos = true

      // Consultas por páginas para incluir más de 1000 registros.
      while (faltanPagos || faltanReembolsos) {
        const [pagosResult, reembolsosResult]: [
  ResultadoConsulta<Pago>,
  ResultadoConsulta<Reembolso>,
] = await Promise.all([
          faltanPagos
            ? supabase
                .from('pagos')
                .select('monto, registrado_en')
                .gte('registrado_en', desde)
                .lt('registrado_en', hasta)
                .order('registrado_en')
                .order('id')
                .range(paginaPagos * 500, paginaPagos * 500 + 499)
            : Promise.resolve({ data: [], error: null }),

          faltanReembolsos
            ? supabase
                .from('reembolsos')
                .select('monto, entregado_en')
                .eq('estado', 'entregado')
                .gte('entregado_en', desde)
                .lt('entregado_en', hasta)
                .order('entregado_en')
                .order('id')
                .range(
                  paginaReembolsos * 500,
                  paginaReembolsos * 500 + 499
                )
            : Promise.resolve({ data: [], error: null }),
        ])

        if (pagosResult.error || reembolsosResult.error) {
          throw new Error('consulta')
        }

        if (faltanPagos) {
  const lista: Pago[] = pagosResult.data ?? []
  pagos.push(...lista)
  faltanPagos = lista.length === 500
  paginaPagos += 1
}

if (faltanReembolsos) {
  const lista: Reembolso[] = reembolsosResult.data ?? []
  reembolsos.push(...lista)
  faltanReembolsos = lista.length === 500
  paginaReembolsos += 1
}
      }

      const porDia = new Map<string, Movimiento>()

      function obtenerDia(dia: string) {
        let movimiento = porDia.get(dia)

        if (!movimiento) {
          movimiento = { dia, recibido: 0, devuelto: 0 }
          porDia.set(dia, movimiento)
        }

        return movimiento
      }

      for (const pago of pagos) {
        const dia = diaNicaragua(new Date(pago.registrado_en))
        obtenerDia(dia).recibido += Math.round(Number(pago.monto) * 100)
      }

      for (const reembolso of reembolsos) {
        if (!reembolso.entregado_en) continue

        const dia = diaNicaragua(new Date(reembolso.entregado_en))
        obtenerDia(dia).devuelto += Math.round(
          Number(reembolso.monto) * 100
        )
      }

      setReporte({
        inicio,
        fin,
        movimientos: [...porDia.values()].sort((a, b) =>
          a.dia.localeCompare(b.dia)
        ),
      })
    } catch {
      setError(
        'No se pudo generar el reporte. Revisá la conexión e intentá nuevamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  const recibido =
    reporte?.movimientos.reduce((total, item) => total + item.recibido, 0) ??
    0

  const devuelto =
    reporte?.movimientos.reduce((total, item) => total + item.devuelto, 0) ??
    0

  function descargar() {
    if (!reporte) return

    const filas = [
      ['Fecha', 'Pagos recibidos (NIO)', 'Reembolsos entregados (NIO)', 'Neto (NIO)'],
      ...reporte.movimientos.map((item) => [
        item.dia,
        (item.recibido / 100).toFixed(2),
        (item.devuelto / 100).toFixed(2),
        ((item.recibido - item.devuelto) / 100).toFixed(2),
      ]),
      [
        'TOTAL',
        (recibido / 100).toFixed(2),
        (devuelto / 100).toFixed(2),
        ((recibido - devuelto) / 100).toFixed(2),
      ],
    ]

    const contenido = filas
      .map((fila) => fila.map((valor) => `"${valor}"`).join(','))
      .join('\r\n')

    const archivo = new Blob(['\uFEFF', contenido], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(archivo)
    const enlace = document.createElement('a')

    enlace.href = url
    enlace.download = `CITA-movimientos-${reporte.inicio}-${reporte.fin}.csv`
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()

    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <h1>Reportes</h1>
          <p>Consultá el movimiento de dinero por período.</p>
        </div>

        <button type="button" onClick={onBack} disabled={loading}>
          Volver al inicio
        </button>
      </header>

      <section className="clientes__panel">
        <h2>Seleccionar período</h2>
        <p>Incluye ambos días. Fechas según la hora de Nicaragua.</p>

        <form onSubmit={consultar}>
          <fieldset
            disabled={loading}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div className="clientes__fields">
              <label>
                Desde
                <input
                  type="date"
                  value={inicio}
                  onChange={(event) => setInicio(event.target.value)}
                  required
                />
              </label>

              <label>
                Hasta
                <input
                  type="date"
                  value={fin}
                  onChange={(event) => setFin(event.target.value)}
                  min={inicio}
                  required
                />
              </label>
            </div>

            <button type="submit" className="clientes__primary">
              {loading ? 'Consultando…' : 'Generar reporte'}
            </button>
          </fieldset>
        </form>

        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Cargando movimientos…</p>}
      </section>

      {reporte && (
        <section className="clientes__panel">
          <h2>Movimiento de dinero</h2>
          <p>
            Del {reporte.inicio} al {reporte.fin} · Córdobas
          </p>

          <div className="reportes__resumen">
            <article>
              <h3>Pagos recibidos</h3>
              <strong>{moneda.format(recibido / 100)}</strong>
            </article>

            <article>
              <h3>Reembolsos entregados</h3>
              <strong>{moneda.format(devuelto / 100)}</strong>
            </article>

            <article>
              <h3>Neto recibido</h3>
              <strong>
                {moneda.format((recibido - devuelto) / 100)}
              </strong>
            </article>
          </div>

          <button
            type="button"
            className="clientes__primary"
            onClick={descargar}
          >
            Descargar CSV para Excel
          </button>

          {reporte.movimientos.length === 0 ? (
            <p>No hay movimientos registrados durante este período.</p>
          ) : (
            <div className="clientes__table-wrapper">
              <table>
                <caption>Detalle por día con movimientos registrados</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Recibido</th>
                    <th scope="col">Devuelto</th>
                    <th scope="col">Neto</th>
                  </tr>
                </thead>

                <tbody>
                  {reporte.movimientos.map((item) => (
                    <tr key={item.dia}>
                      <td>{item.dia}</td>
                      <td>{moneda.format(item.recibido / 100)}</td>
                      <td>{moneda.format(item.devuelto / 100)}</td>
                      <td>
                        {moneda.format(
                          (item.recibido - item.devuelto) / 100
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p>
            El neto corresponde a pagos recibidos menos reembolsos
            entregados. Las devoluciones pendientes no se descuentan.
          </p>
        </section>
      )}
    </main>
  )
}