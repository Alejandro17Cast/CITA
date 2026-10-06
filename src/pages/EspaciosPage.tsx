import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

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
    [espacio.nombre, tipos[espacio.tipo]]
      .some((valor) => valor.toLocaleLowerCase('es').includes(texto))
  )

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <p className="clientes__eyebrow">CITA · QUINTA ANFUSO</p>
          <h1>Habitaciones y espacios</h1>
          <p>Consultá las áreas, sus capacidades y tarifas.</p>
        </div>

        <button type="button" onClick={onBack}>
          Volver al inicio
        </button>
      </header>

      {rol === 'administrador' && (
        <section className="clientes__panel" aria-labelledby="nuevo-espacio">
          <h2 id="nuevo-espacio">Nuevo espacio</h2>

          <form onSubmit={registrarEspacio}>
            <fieldset disabled={saving}>
              <div className="clientes__fields">
                <label>
                  Nombre
                  <input name="nombre" minLength={2} maxLength={100} required />
                </label>

                <label>
                  Tipo de espacio
                  <select name="tipo" defaultValue="habitacion" required>
                    {Object.entries(tipos).map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Capacidad de personas
                  <input
                    name="capacidad"
                    type="number"
                    min={1}
                    max={2147483647}
                    step={1}
                    required
                  />
                </label>

                <label>
                  Tarifa en córdobas
                  <input
                    name="tarifa"
                    type="number"
                    min={0}
                    max={9999999999.99}
                    step="0.01"
                    required
                  />
                </label>

                <label>
                  Tarifa por
                  <select name="unidad_tarifa" defaultValue="noche" required>
                    {Object.entries(unidades).map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                </label>

                <label className="clientes__wide">
                  Descripción (opcional)
                  <textarea name="descripcion" rows={3} maxLength={2000} />
                </label>
              </div>

              <button type="submit" className="clientes__primary">
                {saving ? 'Guardando…' : 'Guardar espacio'}
              </button>
            </fieldset>
          </form>

          {formError && <p role="alert">{formError}</p>}
          {message && <p role="status">{message}</p>}
        </section>
      )}

      <section className="clientes__panel" aria-labelledby="lista-espacios">
        <div className="clientes__list-header">
          <h2 id="lista-espacios">Espacios registrados</h2>

          <button
            type="button"
            disabled={loading || saving}
            onClick={() => setReload((value) => value + 1)}
          >
            Actualizar lista
          </button>
        </div>

        <label className="clientes__search">
          Buscar por nombre o tipo
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar espacio…"
          />
        </label>

        {loading ? (
          <p role="status">Cargando espacios…</p>
        ) : listError ? (
          <p role="alert">{listError}</p>
        ) : filtrados.length === 0 ? (
          <p>
            {espacios.length === 0
              ? 'Todavía no hay espacios registrados.'
              : 'No se encontraron coincidencias.'}
          </p>
        ) : (
          <div className="clientes__table-wrapper">
            <table>
              <caption>{filtrados.length} espacios en esta lista</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Capacidad</th>
                  <th scope="col">Tarifa</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((espacio) => (
                  <tr key={espacio.id}>
                    <td>{espacio.nombre}</td>
                    <td>{tipos[espacio.tipo]}</td>
                    <td>{espacio.capacidad} personas</td>
                    <td>
                      {moneda.format(espacio.tarifa)}
                      {' / '}
                      {unidades[espacio.unidad_tarifa]}
                    </td>
                    <td>{espacio.activo ? 'Activo' : 'Inactivo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}