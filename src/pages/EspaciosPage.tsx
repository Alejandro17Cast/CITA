import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './EspaciosPage.css'

type Espacio = {
  id: string
  nombre: string
  tipo: 'habitacion' | 'salon' | 'cancha' | 'area'
  capacidad: number
  tarifa: number
  unidad_tarifa: 'hora' | 'dia' | 'noche' | 'evento'
  descripcion: string | null
  activo: boolean
}

type Props = {
  rol: 'administrador' | 'encargado'
  onBack: () => void
}

const tipos = {
  habitacion: 'Habitación',
  salon: 'Salón',
  cancha: 'Cancha',
  area: 'Área',
}

const unidades = {
  hora: 'Hora',
  dia: 'Día',
  noche: 'Noche',
  evento: 'Evento',
}

const moneda = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
})

export default function EspaciosPage({ rol, onBack }: Props) {
  const [filtroTipo, setFiltroTipo] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function cargarEspacios() {
      setLoading(true)
      setListError('')

      try {
        const { data, error } = await supabase
          .from('espacios')
          .select(
            'id, nombre, tipo, capacidad, tarifa, unidad_tarifa, descripcion, activo'
          )
          .order('nombre')

        if (cancelled) return

        if (error) {
          setListError('No se pudieron cargar los espacios.')
        } else {
          setEspacios(data ?? [])
        }
      } catch {
        if (!cancelled) {
          setListError('No se pudo conectar para consultar los espacios.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarEspacios()

    return () => {
      cancelled = true
    }
  }, [reload])

  async function registrarEspacio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || rol !== 'administrador') return

    const form = event.currentTarget
    const datos = new FormData(form)

    const nombre = String(datos.get('nombre') ?? '').trim()
    const tipo = String(datos.get('tipo') ?? '')
    const capacidad = Number(datos.get('capacidad'))
    const tarifa = Number(datos.get('tarifa'))
    const unidadTarifa = String(datos.get('unidad_tarifa') ?? '')
    const descripcion = String(datos.get('descripcion') ?? '').trim()

    setFormError('')
    setMessage('')

    if (
      nombre.length < 2 ||
      !Number.isInteger(capacidad) ||
      capacidad < 1 ||
      capacidad > 2147483647 ||
      !Number.isFinite(tarifa) ||
      tarifa < 0 ||
      tarifa > 9999999999.99 ||
      !Object.hasOwn(tipos, tipo) ||
      !Object.hasOwn(unidades, unidadTarifa)
    ) {
      setFormError('Revisá el nombre, la capacidad y la tarifa.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.from('espacios').insert({
        nombre,
        tipo,
        capacidad,
        tarifa,
        unidad_tarifa: unidadTarifa,
        descripcion: descripcion || null,
      })

      if (error) {
        setFormError(
          error.code === '23505'
            ? 'Ya existe un espacio con ese nombre.'
            : 'No se pudo registrar el espacio. Revisá tus permisos.'
        )
        return
      }

      form.reset()
      setMessage('Espacio registrado correctamente.')
      setReload((value) => value + 1)
    } catch {
      setFormError(
        'No se pudo confirmar el registro. Actualizá la lista antes de reintentar.'
      )
    } finally {
      setSaving(false)
    }
  }

  const texto = search.trim().toLocaleLowerCase('es')
  const filtrados = espacios.filter((espacio) =>
    (!filtroTipo || espacio.tipo === filtroTipo) &&
    [espacio.nombre, tipos[espacio.tipo]].some((valor) => valor.toLocaleLowerCase('es').includes(texto))
  )

  return (
    <main className="cita-espacios">
      <header className="cita-espacios__header">
        <div><p className="cita-espacios__eyebrow">CITA · QUINTA ANFUSO</p><h1>Habitaciones y espacios</h1><p>Consultá las áreas, sus capacidades y tarifas.</p></div>
        <button type="button" onClick={onBack} disabled={saving}>Volver al inicio</button>
      </header>
      <div className={`cita-espacios__layout${rol !== 'administrador' ? ' cita-espacios__layout--consulta' : ''}`}>
        {rol === 'administrador' && (
          <section className="cita-espacios__panel" aria-labelledby="nuevo-espacio">
            <h2 id="nuevo-espacio">Nuevo espacio</h2><p className="cita-espacios__subtitulo">Datos generales</p>
            <form onSubmit={registrarEspacio} onReset={() => { setFormError(''); setMessage('') }}>
              <fieldset disabled={saving}>
                <label>Nombre<input name="nombre" placeholder="Ej. Cuarto 3" minLength={2} maxLength={100} required /></label>
                <label>Tipo de espacio<select name="tipo" defaultValue="habitacion" required>{Object.entries(tipos).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></label>
                <div className="cita-espacios__campos">
                  <label>Capacidad<input name="capacidad" type="number" placeholder="Personas" min={1} max={2147483647} step={1} required /></label>
                  <label>Tarifa en córdobas<div className="cita-espacios__moneda"><span aria-hidden="true">C$</span><input name="tarifa" type="number" placeholder="0.00" min={0} max={9999999999.99} step="0.01" required /></div></label>
                </div>
                <label>Tarifa por<select name="unidad_tarifa" defaultValue="noche" required>{Object.entries(unidades).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></label>
                <label><span>Descripción <small className="cita-espacios__opcional">Opcional</small></span><textarea name="descripcion" rows={3} maxLength={2000} placeholder="Características del espacio…" /></label>
                <button type="submit" className="cita-espacios__primary">{saving ? 'Guardando…' : 'Guardar espacio'}</button>
                <button type="reset" className="cita-espacios__limpiar">Limpiar</button>
              </fieldset>
            </form>
            {formError && <p className="cita-espacios__error" role="alert">{formError}</p>}
            {message && <p className="cita-espacios__mensaje" role="status">{message}</p>}
          </section>
        )}
        <section className="cita-espacios__panel" aria-labelledby="lista-espacios">
          <div className="cita-espacios__lista-header">
            <div><h2 id="lista-espacios">Espacios registrados</h2>{!loading && !listError && <span className="cita-espacios__contador">{espacios.length} {espacios.length === 1 ? 'espacio' : 'espacios'}</span>}</div>
            <button type="button" disabled={loading || saving} onClick={() => setReload((value) => value + 1)}><span aria-hidden="true">↻ </span>Actualizar</button>
          </div>
          <div className="cita-espacios__filtros">
            <label>Buscar por nombre o tipo<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar espacio…" /></label>
            <label>Tipo de espacio<select value={filtroTipo} onChange={(event) => setFiltroTipo(event.target.value)}><option value="">Todos los tipos</option>{Object.entries(tipos).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></label>
          </div>
          {loading ? <p role="status">Cargando espacios…</p> : listError ? <p className="cita-espacios__error" role="alert">{listError}</p> : filtrados.length === 0 ? (
            <p>{espacios.length === 0 ? 'Todavía no hay espacios registrados.' : 'No se encontraron coincidencias.'}</p>
          ) : (
            <ul className="cita-espacios__lista">
              {filtrados.map((espacio) => (
                <li className="cita-espacios__fila" key={espacio.id}>
                  <div className="cita-espacios__fila-contenido">
                    <span className="cita-espacios__icono"><IconoEspacio tipo={espacio.tipo} /></span>
                    <div className="cita-espacios__nombre"><h3>{espacio.nombre}</h3><p>{tipos[espacio.tipo]}</p></div>
                    <span className="cita-espacios__capacidad">{espacio.capacidad} personas</span>
                    <div className="cita-espacios__tarifa"><strong>{moneda.format(espacio.tarifa)}</strong><small>/ {unidades[espacio.unidad_tarifa].toLocaleLowerCase('es')}</small></div>
                    <span className={`cita-espacios__estado${espacio.activo ? '' : ' cita-espacios__estado--inactivo'}`}><span aria-hidden="true">●</span> {espacio.activo ? 'Activo' : 'Inactivo'}</span>
                    <button type="button" className="cita-espacios__detalle-boton" aria-expanded={detalleId === espacio.id} aria-controls={`detalle-${espacio.id}`} aria-label={`${detalleId === espacio.id ? 'Ocultar' : 'Ver'} detalles de ${espacio.nombre}`} onClick={() => setDetalleId((actual) => actual === espacio.id ? null : espacio.id)}>{detalleId === espacio.id ? 'Ocultar' : 'Ver detalles'}</button>
                  </div>
                  <div id={`detalle-${espacio.id}`} className="cita-espacios__detalle" hidden={detalleId !== espacio.id}>
                    <h4>Descripción de {espacio.nombre}</h4><p>{espacio.descripcion || 'Este espacio no tiene descripción registrada.'}</p>
                    <p>La disponibilidad para una fecha y un horario se consulta en el calendario.</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && !listError && <footer className="cita-espacios__footer"><span>Mostrando {filtrados.length} de {espacios.length} espacios</span><span>La disponibilidad se consulta en el calendario.</span></footer>}
        </section>
      </div>
    </main>
  )
}

function IconoEspacio({ tipo }: { tipo: Espacio['tipo'] }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tipo === 'habitacion' ? <><path d="M3 5v15M21 11v9M3 17h18M3 9h5v5H3M8 10h9a4 4 0 0 1 4 4v3H8z" /></> : tipo === 'salon' ? <><path d="M4 21V5h16v16M8 5V2h8v3M2 21h20M10 21v-5h4v5M8 9h1M15 9h1M8 12h1M15 12h1" /></> : tipo === 'cancha' ? <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M12 5v14M2 9h4v6H2M22 9h-4v6h4" /><circle cx="12" cy="12" r="3" /></> : <><path d="M12 21V9M5 21h14M8 9a4 4 0 1 1 8 0 4 4 0 1 1-1 7H9a4 4 0 1 1-1-7z" /></>}
  </svg>
}
