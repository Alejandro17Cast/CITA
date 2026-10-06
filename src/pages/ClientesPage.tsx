import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './ClientesPage.css'

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

export default function ClientesPage({ onBack }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function cargarClientes() {
      setLoading(true)
      setError('')

      try {
        const { data, error: queryError } = await supabase
          .from('clientes')
          .select('id, nombre, telefono, correo, observaciones')
          .order('creado_en', { ascending: false })

        if (cancelled) return

        if (queryError) {
          setError('No se pudieron cargar los clientes.')
        } else {
          setClientes(data ?? [])
        }
      } catch {
        if (!cancelled) {
          setError('No se pudo conectar para consultar los clientes.')
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

  async function registrarCliente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const datos = new FormData(form)

    const nombre = String(datos.get('nombre') ?? '').trim()
    const telefono = String(datos.get('telefono') ?? '').trim()
    const correo = String(datos.get('correo') ?? '').trim()
    const observaciones = String(datos.get('observaciones') ?? '').trim()

    setError('')
    setMessage('')

    if (nombre.length < 2 || telefono.length < 8) {
      setError('Revisá el nombre y el teléfono del cliente.')
      return
    }

    setSaving(true)

    try {
      const { error: insertError } = await supabase
        .from('clientes')
        .insert({
          nombre,
          telefono,
          correo: correo || null,
          observaciones: observaciones || null,
        })

      if (insertError) {
        setError('No se pudo registrar el cliente. Revisá tus permisos.')
        return
      }

      form.reset()
      setMessage('Cliente registrado correctamente.')
      setReload((value) => value + 1)
    } catch {
      setError(
        'No se pudo confirmar el registro. Actualizá la lista antes de reintentar.'
      )
    } finally {
      setSaving(false)
    }
  }

  const texto = search.trim().toLocaleLowerCase('es')

  const filtrados = clientes.filter((cliente) =>
    [cliente.nombre, cliente.telefono, cliente.correo ?? '']
      .some((valor) => valor.toLocaleLowerCase('es').includes(texto))
  )

  return (
    <main className="clientes">
      <header className="clientes__header">
        <div>
          <p className="clientes__eyebrow">CITA · QUINTA ANFUSO</p>
          <h1>Clientes</h1>
          <p>Registrá sus datos y encontralos cuando los necesités.</p>
        </div>

        <button type="button" onClick={onBack}>
          Volver al inicio
        </button>
      </header>

      <section className="clientes__panel" aria-labelledby="nuevo-cliente">
        <h2 id="nuevo-cliente">Nuevo cliente</h2>

        <form onSubmit={registrarCliente} className="clientes__form">
          <fieldset disabled={saving}>
            <div className="clientes__fields">
              <label>
                Nombre completo
                <input
                  name="nombre"
                  autoComplete="name"
                  minLength={2}
                  maxLength={150}
                  required
                />
              </label>

              <label>
                Teléfono
                <input
                  name="telefono"
                  type="tel"
                  autoComplete="tel"
                  minLength={8}
                  maxLength={25}
                  required
                />
              </label>

              <label>
                Correo electrónico (opcional)
                <input
                  name="correo"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                />
              </label>

              <label className="clientes__wide">
                Observaciones (opcional)
                <textarea
                  name="observaciones"
                  rows={3}
                  maxLength={2000}
                />
              </label>
            </div>

            <button type="submit" className="clientes__primary">
              {saving ? 'Guardando…' : 'Guardar cliente'}
            </button>
          </fieldset>
        </form>
      </section>

      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <section className="clientes__panel" aria-labelledby="lista-clientes">
        <div className="clientes__list-header">
          <h2 id="lista-clientes">Clientes registrados</h2>
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => setReload((value) => value + 1)}
          >
            Actualizar lista
          </button>
        </div>

        <label className="clientes__search">
          Buscar por nombre, teléfono o correo
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente…"
          />
        </label>

        {loading ? (
          <p role="status">Cargando clientes…</p>
        ) : error ? (
          <p>Usá “Actualizar lista” para volver a consultar los registros.</p>
        ) : filtrados.length === 0 ? (
          <p>
            {clientes.length === 0
              ? 'Todavía no hay clientes registrados.'
              : 'No se encontraron coincidencias.'}
          </p>
        ) : (
          <div className="clientes__table-wrapper">
            <table>
              <caption>{filtrados.length} clientes en esta lista</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>{cliente.nombre}</td>
                    <td>{cliente.telefono}</td>
                    <td>{cliente.correo || '—'}</td>
                    <td>{cliente.observaciones || '—'}</td>
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