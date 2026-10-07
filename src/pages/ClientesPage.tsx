import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'
import './ClientesDiseno.css'

type Cliente = {
  id: string
  nombre: string
  telefono: string
  correo: string | null
  observaciones: string | null
}

type Props = {
  onBack: () => void
}

function Icono({
  tipo,
}: {
  tipo: 'buscar' | 'actualizar' | 'ver' | 'agregar'
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tipo === 'buscar' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </>
      )}

      {tipo === 'actualizar' && (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6.2 7a7 7 0 0 1 11.6-1L20 9" />
          <path d="M17.8 17a7 7 0 0 1-11.6 1L4 15" />
        </>
      )}

      {tipo === 'ver' && (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}

      {tipo === 'agregar' && (
        <>
          <circle cx="9" cy="7" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M19 7v6M16 10h6" />
        </>
      )}
    </svg>
  )
}

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toLocaleUpperCase('es') || 'C'
}

export default function ClientesPage({ onBack }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [seleccionado, setSeleccionado] =
    useState<Cliente | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function cargarClientes() {
      setLoading(true)
      setLoadError('')

      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('id, nombre, telefono, correo, observaciones')
          .order('creado_en', { ascending: false })

        if (cancelled) return

        if (error) {
          setLoadError('No se pudieron cargar los clientes.')
          return
        }

        setClientes(data ?? [])
      } catch {
        if (!cancelled) {
          setLoadError(
            'No se pudo conectar para consultar los clientes.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarClientes()

    return () => {
      cancelled = true
    }
  }, [reload])

  async function registrarCliente(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const datos = new FormData(form)

    const nombre = String(datos.get('nombre') ?? '').trim()
    const telefono = String(datos.get('telefono') ?? '').trim()
    const correo = String(datos.get('correo') ?? '').trim()
    const observaciones =
      String(datos.get('observaciones') ?? '').trim()

    setFormError('')
    setMessage('')

    if (nombre.length < 2 || telefono.length < 8) {
      setFormError('Revisá el nombre y el teléfono del cliente.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase
        .from('clientes')
        .insert({
          nombre,
          telefono,
          correo: correo || null,
          observaciones: observaciones || null,
        })

      if (error) {
        setFormError(
          'No se pudo registrar el cliente. Revisá tus permisos.'
        )
        return
      }

      form.reset()
      setMessage('Cliente registrado correctamente.')
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

  const filtrados = clientes.filter((cliente) =>
    [cliente.nombre, cliente.telefono, cliente.correo ?? '']
      .some((valor) =>
        valor.toLocaleLowerCase('es').includes(texto)
      )
  )

  return (
    <main className="clientes clientes--directorio">
      <header className="clientes__header">
        <div>
          <p className="clientes__eyebrow">
            
          </p>
          <h1>Clientes</h1>
          <p>
            Registrá sus datos y encontralos cuando los necesités.
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={onBack}
        >
          Volver al inicio
        </button>
      </header>

      <div className="directorio__layout">
        <section
          className="clientes__panel directorio__registro"
          aria-labelledby="nuevo-cliente"
        >
          <h2 id="nuevo-cliente">Nuevo cliente</h2>
          <p className="directorio__subtitulo">
            Información de contacto.
          </p>

          <form
            onSubmit={registrarCliente}
            onReset={() => {
              setFormError('')
              setMessage('')
            }}
            className="clientes__form"
            aria-busy={saving}
          >
            <fieldset disabled={saving}>
              <div className="clientes__fields">
                <label>
                  <span>
                    Nombre completo
                    <span className="directorio__requerido">
                      {' '}*
                    </span>
                  </span>
                  <input
                    name="nombre"
                    autoComplete="name"
                    placeholder="Ej. Ana Martínez"
                    minLength={2}
                    maxLength={150}
                    required
                  />
                </label>

                <label>
                  <span>
                    Teléfono
                    <span className="directorio__requerido">
                      {' '}*
                    </span>
                  </span>
                  <input
                    name="telefono"
                    type="tel"
                    autoComplete="tel"
                    placeholder="Ej. 8888 1234"
                    minLength={8}
                    maxLength={25}
                    required
                  />
                </label>

                <label>
                  <span className="directorio__label">
                    Correo electrónico
                    <span className="directorio__opcional">
                      Opcional
                    </span>
                  </span>
                  <input
                    name="correo"
                    type="email"
                    autoComplete="email"
                    placeholder="Ej. ana@ejemplo.com"
                    maxLength={254}
                  />
                </label>

                <label>
                  <span className="directorio__label">
                    Observaciones
                    <span className="directorio__opcional">
                      Opcional
                    </span>
                  </span>
                  <textarea
                    name="observaciones"
                    placeholder="Preferencias, notas adicionales…"
                    rows={3}
                    maxLength={2000}
                  />
                </label>
              </div>

              <div className="directorio__form-actions">
                <button
                  type="submit"
                  className="clientes__primary"
                >
                  <Icono tipo="agregar" />
                  {saving ? 'Guardando…' : 'Guardar cliente'}
                </button>

                <button
                  type="reset"
                  className="directorio__limpiar"
                >
                  Limpiar
                </button>
              </div>
            </fieldset>

            {formError && (
              <p
                className="directorio__aviso directorio__aviso--error"
                role="alert"
              >
                {formError}
              </p>
            )}

            {message && (
              <p className="directorio__aviso" role="status">
                {message}
              </p>
            )}
          </form>
        </section>

        <section
          className="clientes__panel directorio__lista"
          aria-labelledby="lista-clientes"
          aria-busy={loading}
        >
          <div className="clientes__list-header">
            <div className="directorio__titulo-lista">
              <h2 id="lista-clientes">Clientes registrados</h2>

              {!loading && !loadError && (
                <span className="directorio__contador">
                  {clientes.length}{' '}
                  {clientes.length === 1 ? 'cliente' : 'clientes'}
                </span>
              )}
            </div>

            <button
              type="button"
              className="directorio__icon-button"
              aria-label="Actualizar lista de clientes"
              title="Actualizar lista"
              disabled={loading || saving}
              onClick={() =>
                setReload((value) => value + 1)
              }
            >
              <Icono tipo="actualizar" />
            </button>
          </div>

          <label className="directorio__busqueda">
            <span className="directorio__sr-only">
              Buscar por nombre, teléfono o correo
            </span>

            <Icono tipo="buscar" />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar por nombre, teléfono o correo"
            />
          </label>

          {loading ? (
            <div className="directorio__estado" role="status">
              Cargando clientes…
            </div>
          ) : loadError ? (
            <div className="directorio__estado" role="alert">
              <p>{loadError}</p>
              <p>
                Usá el botón de actualizar para intentar nuevamente.
              </p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="directorio__estado">
              <h3>
                {clientes.length === 0
                  ? 'Tu directorio comienza aquí'
                  : 'Sin coincidencias'}
              </h3>
              <p>
                {clientes.length === 0
                  ? 'Registrá tu primer cliente usando el formulario.'
                  : 'Probá con otro nombre, teléfono o correo.'}
              </p>
            </div>
          ) : (
            <>
              <div className="clientes__table-wrapper">
                <table>
                  <caption className="directorio__sr-only">
                    Clientes que coinciden con la búsqueda
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Cliente</th>
                      <th scope="col">Teléfono</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtrados.map((cliente) => (
                      <tr key={cliente.id}>
                        <td>
                          <div className="directorio__persona">
                            <span
                              className="directorio__avatar"
                              aria-hidden="true"
                            >
                              {iniciales(cliente.nombre)}
                            </span>

                            <div>
                              <strong>{cliente.nombre}</strong>
                              <span>
                                {cliente.correo ||
                                  'Sin correo registrado'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="directorio__telefono">
                          {cliente.telefono}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="directorio__icon-button"
                            aria-label={`Ver datos de ${cliente.nombre}`}
                            title="Ver datos del cliente"
                            aria-expanded={
                              seleccionado?.id === cliente.id
                            }
                            aria-controls="detalle-cliente"
                            onClick={() =>
                              setSeleccionado((actual) =>
                                actual?.id === cliente.id
                                  ? null
                                  : cliente
                              )
                            }
                          >
                            <Icono tipo="ver" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="directorio__resultado">
                Mostrando {filtrados.length} de {clientes.length}{' '}
                clientes cargados
              </p>
            </>
          )}

          {seleccionado && (
            <section
              id="detalle-cliente"
              className="directorio__detalle"
              aria-labelledby="detalle-cliente-titulo"
            >
              <div className="clientes__list-header">
                <h3 id="detalle-cliente-titulo">
                  Datos del cliente
                </h3>

                <button
                  type="button"
                  onClick={() => setSeleccionado(null)}
                >
                  Cerrar
                </button>
              </div>

              <dl>
                <div>
                  <dt>Nombre</dt>
                  <dd>{seleccionado.nombre}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{seleccionado.telefono}</dd>
                </div>
                <div>
                  <dt>Correo electrónico</dt>
                  <dd>
                    {seleccionado.correo || 'No registrado'}
                  </dd>
                </div>
                <div>
                  <dt>Observaciones</dt>
                  <dd>
                    {seleccionado.observaciones ||
                      'Sin observaciones'}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </section>
      </div>
    </main>
  )
}