import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { construirReporte, diaNicaragua, moneda, tipos } from './reportesModelo'
import type {
  Celda,
  Cliente,
  Datos,
  Detalle,
  Espacio,
  Filtros,
  Pago,
  Reembolso,
  Reserva,
  Resultado,
  TipoReporte,
} from './reportesModelo'
import './ReportesPage.css'

type Props = { onBack: () => void }
type Reporte = { filtros: Filtros; resultado: Resultado; espacioNombre: string }
const tamanoPagina = 10

async function cargarTabla<T>(tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = []
  let pagina = 0
  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .order('id')
      .range(pagina * 500, pagina * 500 + 499)
    if (error)
      throw new Error(`No se pudo consultar ${tabla}: ${error.message}`)
    const lote = (data ?? []) as unknown as T[]
    filas.push(...lote)
    if (lote.length < 500) return filas
    pagina += 1
  }
}

function textoCelda(valor: Celda, columna: string) {
  return typeof valor === 'number' && columna.includes('(NIO)')
    ? moneda.format(valor)
    : String(valor)
}

function Icono({ tipo }: { tipo: 'excel' | 'pdf' | 'filtro' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tipo === 'filtro' ? (
        <>
          <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
        </>
      ) : (
        <>
          <path d="M5 3h9l5 5v13H5Z" />
          <path d="M14 3v6h5" />
          {tipo === 'excel' ? (
            <>
              <path d="M8 12h8M8 16h8M12 12v7" />
            </>
          ) : (
            <path d="M8 14h8M8 17h6" />
          )}
        </>
      )}
    </svg>
  )
}

export default function ReportesPage({ onBack }: Props) {
  const hoy = diaNicaragua(new Date())
  const [tipo, setTipo] = useState<TipoReporte>('reservas')
  const [inicio, setInicio] = useState(`${hoy.slice(0, 7)}-01`)
  const [fin, setFin] = useState(hoy)
  const [espacio, setEspacio] = useState('')
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [espaciosError, setEspaciosError] = useState('')
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [pagina, setPagina] = useState(1)
  const [loading, setLoading] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState('')
  const ocupado = useRef(false)

  useEffect(() => {
    let cancelled = false
    void cargarTabla<Espacio>('espacios', 'id, nombre')
      .then((datos) => {
        if (!cancelled)
          setEspacios(
            datos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
          )
      })
      .catch(() => {
        if (!cancelled)
          setEspaciosError(
            'No se pudo cargar el filtro de espacios. Podés consultar todos; al aplicar filtros se intentará nuevamente.',
          )
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (ocupado.current) return
    setError('')
    if (!inicio || !fin || fin < inicio) {
      setError('Seleccioná un período válido.')
      return
    }
    const filtros: Filtros = { tipo, inicio, fin, espacio }
    ocupado.current = true
    setLoading(true)
    setReporte(null)
    try {
      // Todos los abonos son necesarios para calcular correctamente los saldos.
      const [reservas, pagos, reembolsos, listaEspacios, clientes, detalles] =
        await Promise.all([
          cargarTabla<Reserva>(
            'reservaciones',
            'id, cliente_id, nombre_evento, inicio, fin, estado, total',
          ),
          cargarTabla<Pago>(
            'pagos',
            'id, reservacion_id, monto, metodo, referencia, registrado_en',
          ),
          cargarTabla<Reembolso>(
            'reembolsos',
            'id, reservacion_id, monto, estado, entregado_en',
          ),
          cargarTabla<Espacio>('espacios', 'id, nombre'),
          cargarTabla<Cliente>('clientes', 'id, nombre'),
          cargarDetalles(),
        ])
      const datos: Datos = {
        reservas,
        pagos,
        reembolsos,
        espacios: listaEspacios,
        clientes,
        detalles,
      }
      if (espacio && !listaEspacios.some((item) => item.id === espacio))
        throw new Error(
          'El espacio seleccionado ya no está disponible. Seleccioná Todos.',
        )
      setEspacios(
        listaEspacios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      )
      setEspaciosError('')
      setReporte({
        filtros,
        resultado: construirReporte(datos, filtros),
        espacioNombre:
          listaEspacios.find((item) => item.id === espacio)?.nombre ?? 'Todos',
      })
      setPagina(1)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo generar el reporte. Revisá la conexión e intentá nuevamente.',
      )
    } finally {
      ocupado.current = false
      setLoading(false)
    }
  }

  async function exportar(formato: 'excel' | 'pdf') {
    if (!reporte || ocupado.current) return
    ocupado.current = true
    setExportando(true)
    setError('')
    const { resultado, filtros, espacioNombre } = reporte
    const nombre = `CITA-${filtros.tipo}-${filtros.inicio}-${filtros.fin}`
    try {
      if (formato === 'excel') {
        const { default: ExcelJS } = await import('exceljs')
        const libro = new ExcelJS.Workbook()
        libro.creator = 'CITA · Quinta Anfuso'
        const resumen = libro.addWorksheet('Resumen')
        resumen.addRows([
          ['CITA · Quinta Anfuso'],
          [resultado.titulo],
          ['Desde', filtros.inicio],
          ['Hasta', filtros.fin],
          ['Espacio', espacioNombre],
          ['Moneda', 'NIO'],
          ['Generado', new Date().toISOString()],
          [],
          ...resultado.resumen.map((item) => [item.etiqueta, item.valor]),
          [],
          ['Criterio', resultado.nota],
        ])
        resumen.getColumn(1).width = 42
        resumen.getColumn(2).width = 85
        resumen.getColumn(2).alignment = { wrapText: true }
        resultado.resumen.forEach((item, indice) => {
          if (item.monetario) resumen.getCell(indice + 9, 2).numFmt = '#,##0.00'
        })
        const hoja = libro.addWorksheet('Detalle')
        hoja.addRow(resultado.columnas)
        // Las cadenas se escriben como texto, no como fórmulas.
        resultado.filas.forEach((fila) => hoja.addRow(fila))
        hoja.getRow(1).font = { bold: true, color: { argb: 'FF632713' } }
        hoja.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFDE3CF' },
        }
        hoja.views = [{ state: 'frozen', ySplit: 1 }]
        hoja.autoFilter = {
          from: { row: 1, column: 1 },
          to: {
            row: Math.max(1, hoja.rowCount),
            column: resultado.columnas.length,
          },
        }
        resultado.columnas.forEach((columna, indice) => {
          hoja.getColumn(indice + 1).width = columna.includes('(NIO)') ? 20 : 28
          if (columna.includes('(NIO)'))
            hoja.getColumn(indice + 1).numFmt = '#,##0.00'
        })
        const buffer = await libro.xlsx.writeBuffer()
        const bytes = new Uint8Array(buffer).slice()
        descargarBlob(
          new Blob([bytes.buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          `${nombre}.xlsx`,
        )
      } else {
        const [{ jsPDF }, { autoTable }] = await Promise.all([
          import('jspdf'),
          import('jspdf-autotable'),
        ])
        const doc = new jsPDF({ orientation: 'landscape' })
        doc.setTextColor(99, 39, 19)
        doc.setFontSize(18)
        doc.text('CITA · Quinta Anfuso', 14, 16)
        doc.setFontSize(12)
        doc.text(resultado.titulo, 14, 24)
        doc.setFontSize(9)
        doc.text(
          `Del ${filtros.inicio} al ${filtros.fin} · Espacio: ${espacioNombre} · Moneda: NIO`,
          14,
          31,
        )
        const texto = resultado.resumen
          .map(
            (item) =>
              `${item.etiqueta}: ${item.monetario ? moneda.format(item.valor) : item.valor}`,
          )
          .join(' | ')
        const lineas = doc.splitTextToSize(texto, 265) as string[]
        doc.text(lineas, 14, 38)
        const notas = doc.splitTextToSize(resultado.nota, 265) as string[]
        const notasY = 38 + lineas.length * 5
        doc.text(notas, 14, notasY)
        autoTable(doc, {
          startY: notasY + notas.length * 5 + 4,
          head: [resultado.columnas],
          body: resultado.filas.map((fila) =>
            fila.map((valor, indice) =>
              textoCelda(valor, resultado.columnas[indice]),
            ),
          ),
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
          headStyles: { fillColor: [253, 227, 207], textColor: [99, 39, 19] },
          alternateRowStyles: { fillColor: [255, 248, 242] },
          margin: { bottom: 16 },
          didDrawPage: () => {
            doc.setFontSize(8)
            doc.text(
              `CITA · Página ${doc.getNumberOfPages()}`,
              14,
              doc.internal.pageSize.getHeight() - 8,
            )
          },
        })
        doc.save(`${nombre}.pdf`)
      }
    } catch {
      setError('No se pudo generar el archivo. Intentá nuevamente.')
    } finally {
      ocupado.current = false
      setExportando(false)
    }
  }

  const resultado = reporte?.resultado
  const totalPaginas = Math.max(
    1,
    Math.ceil((resultado?.filas.length ?? 0) / tamanoPagina),
  )
  const filasPagina =
    resultado?.filas.slice(
      (pagina - 1) * tamanoPagina,
      pagina * tamanoPagina,
    ) ?? []
  const filtrosCambiaron =
    reporte &&
    (tipo !== reporte.filtros.tipo ||
      inicio !== reporte.filtros.inicio ||
      fin !== reporte.filtros.fin ||
      espacio !== reporte.filtros.espacio)

  return (
    <main className="cita-reportes">
      <header className="cita-reportes__header">
        <div>
          
          <h1>Reportes</h1>
          <p>Consultá las reservas y los movimientos de tu quinta.</p>
        </div>
        <div className="cita-reportes__acciones">
          <button
            type="button"
            disabled={loading || exportando}
            onClick={onBack}
          >
            Volver al inicio
          </button>
          <button
            type="button"
            disabled={!reporte || loading || exportando}
            onClick={() => void exportar('excel')}
          >
            <Icono tipo="excel" />
            Exportar Excel
          </button>
          <button
            type="button"
            className="cita-reportes__primary"
            disabled={!reporte || loading || exportando}
            onClick={() => void exportar('pdf')}
          >
            <Icono tipo="pdf" />
            Descargar PDF
          </button>
        </div>
      </header>
      <section
        className="cita-reportes__panel cita-reportes__filtros"
        aria-label="Filtros del reporte"
      >
        <form onSubmit={consultar}>
          <fieldset disabled={loading || exportando}>
            <label>
              Tipo de reporte
              <select
                value={tipo}
                onChange={(event) => setTipo(event.target.value as TipoReporte)}
              >
                {tipos.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
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
                min={inicio}
                value={fin}
                onChange={(event) => setFin(event.target.value)}
                required
              />
            </label>
            <label>
              Espacio
              <select
                value={espacio}
                onChange={(event) => setEspacio(event.target.value)}
              >
                <option value="">Todos</option>
                {espacios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button className="cita-reportes__primary" type="submit">
              <Icono tipo="filtro" />
              {loading ? 'Consultando…' : 'Aplicar filtros'}
            </button>
          </fieldset>
        </form>
        {espaciosError && <p role="status">{espaciosError}</p>}
        {filtrosCambiaron && (
          <p role="status">
            Cambiaste los filtros. Pulsá Aplicar filtros para actualizar el
            resultado. Las descargas corresponden al reporte visible.
          </p>
        )}
      </section>
      {error && (
        <p className="cita-reportes__error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="cita-reportes__estado" role="status">
          Consultando los registros…
        </p>
      )}
      {exportando && <p role="status">Preparando la descarga completa…</p>}
      {resultado && reporte ? (
        <>
          <div className="cita-reportes__resumen">
            {resultado.resumen.map((item, indice) => (
              <article key={item.etiqueta}>
                <span
                  className={`cita-reportes__indicador cita-reportes__indicador--${indice}`}
                  aria-hidden="true"
                >
                  {item.monetario ? 'C$' : '#'}
                </span>
                <div>
                  <h2>{item.etiqueta}</h2>
                  <strong>
                    {item.monetario ? moneda.format(item.valor) : item.valor}
                  </strong>
                </div>
              </article>
            ))}
          </div>
          <section
            className="cita-reportes__panel"
            aria-labelledby="reporte-titulo"
          >
            <div className="cita-reportes__tabla-header">
              <h2 id="reporte-titulo">{resultado.titulo}</h2>
              <span>
                {reporte.filtros.inicio} — {reporte.filtros.fin} ·{' '}
                {reporte.espacioNombre}
              </span>
            </div>
            {resultado.filas.length === 0 ? (
              <p className="cita-reportes__estado">
                No hay registros para estos filtros.
              </p>
            ) : (
              <>
                <div className="cita-reportes__tabla">
                  <table>
                    <caption className="cita-reportes__sr-only">
                      {resultado.titulo}. Página {pagina} de {totalPaginas}
                    </caption>
                    <thead>
                      <tr>
                        {resultado.columnas.map((columna) => (
                          <th scope="col" key={columna}>
                            {columna.replace(' (NIO)', '')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filasPagina.map((fila, indice) => (
                        <tr key={(pagina - 1) * tamanoPagina + indice}>
                          {fila.map((valor, columna) => (
                            <td key={columna}>
                              {resultado.columnas[columna].startsWith(
                                'Estado',
                              ) ? (
                                <span
                                  className={`cita-reportes__badge cita-reportes__badge--${String(valor).toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  {String(valor)}
                                </span>
                              ) : (
                                textoCelda(valor, resultado.columnas[columna])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="cita-reportes__paginacion">
                  <p>
                    Mostrando {(pagina - 1) * tamanoPagina + 1}–
                    {Math.min(pagina * tamanoPagina, resultado.filas.length)} de{' '}
                    {resultado.filas.length} registros
                  </p>
                  <nav aria-label="Páginas del reporte">
                    <button
                      type="button"
                      disabled={pagina === 1}
                      onClick={() => setPagina((valor) => valor - 1)}
                    >
                      Anterior
                    </button>
                    <span aria-live="polite">
                      {pagina} / {totalPaginas}
                    </span>
                    <button
                      type="button"
                      disabled={pagina === totalPaginas}
                      onClick={() => setPagina((valor) => valor + 1)}
                    >
                      Siguiente
                    </button>
                  </nav>
                </div>
              </>
            )}
            <p className="cita-reportes__nota">{resultado.nota}</p>
          </section>
        </>
      ) : (
        !loading && (
          <section className="cita-reportes__panel cita-reportes__estado">
            <h2>Elegí qué querés consultar</h2>
            <p>
              Seleccioná el tipo de reporte y el período, y pulsá Aplicar
              filtros.
            </p>
          </section>
        )
      )}
    </main>
  )
}

async function cargarDetalles(): Promise<Detalle[]> {
  // Esta tabla puede tener una clave compuesta en lugar de una columna id.
  const filas: Detalle[] = []
  let pagina = 0
  while (true) {
    const { data, error } = await supabase
      .from('reservacion_espacios')
      .select('reservacion_id, espacio_id')
      .order('reservacion_id')
      .order('espacio_id')
      .range(pagina * 500, pagina * 500 + 499)
    if (error)
      throw new Error(
        `No se pudieron consultar los espacios de las reservas: ${error.message}`,
      )
    const lote: Detalle[] = data ?? []
    filas.push(...lote)
    if (lote.length < 500) return filas
    pagina += 1
  }
}

function descargarBlob(archivo: Blob, nombre: string) {
  const url = URL.createObjectURL(archivo)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
