import { useState } from 'react'
import './Sidebar.css'

type Modulo<T extends string> = {
  nombre: string
  pagina?: T
}

type Props<T extends string> = {
  modulos: Modulo<T>[]
  paginaActual: T
  nombre: string
  rol: 'administrador' | 'encargado'
  signingOut: boolean
  onNavigate: (pagina: T) => void
  onSignOut: () => void
}

const iconos: Record<string, string[]> = {
  Inicio: [
    'M3 10 12 3l9 7',
    'M5 9v12h5v-7h4v7h5V9',
  ],
  Clientes: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  'Habitaciones y espacios': [
    'M3 21h18',
    'M5 21V7l7-4 7 4v14',
    'M9 21v-6h6v6',
    'M9 9h.01M15 9h.01',
  ],
  Reservaciones: [
    'M8 3h8v4H8z',
    'M8 5H5v16h14V5h-3',
    'm8 14 3 3 5-6',
  ],
  Calendario: [
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2',
    'M16 3v4M8 3v4M3 11h18',
    'M8 15h.01M12 15h.01M16 15h.01',
  ],
  'Pagos y abonos': [
    'M3 5h18v14H3z',
    'M3 9h18',
    'M7 15h4',
  ],
  Mantenimientos: [
    'M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3 3.7-3.7Z',
  ],
  Reportes: [
    'M4 3v18h17',
    'M8 16v-5M13 16V7M18 16V4',
  ],
  Usuarios: [
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  ],
}

function Icono({ nombre }: { nombre: string }) {
  const trazos = iconos[nombre] ?? [
    'M4 4h16v16H4z',
    'M4 12h16M12 4v16',
  ]

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {trazos.map((trazo, index) => (
        <path key={index} d={trazo} />
      ))}
    </svg>
  )
}

export default function Sidebar<T extends string>({
  modulos,
  paginaActual,
  nombre,
  rol,
  signingOut,
  onNavigate,
  onSignOut,
}: Props<T>) {
  const [expandido, setExpandido] = useState(true)

  return (
    <aside
      className={[
        'cita-sidebar',
        expandido ? '' : 'cita-sidebar--compacto',
      ].join(' ')}
    >
      <div className="cita-sidebar__cabecera">
  <img
    className="cita-sidebar__isotipo"
    src="/cita-identidad.png"
    alt="CITA"
  />

  <img
    className="cita-sidebar__logotipo"
    src="/cita-logotipo.png"
    alt="CITA · Quinta Anfuso"
  />
</div>

      <button
        type="button"
        className="cita-sidebar__control"
        onClick={() => setExpandido((value) => !value)}
        aria-expanded={expandido}
        aria-controls="cita-sidebar-menu"
        aria-label={expandido ? 'Contraer menú' : 'Expandir menú'}
        title={expandido ? 'Contraer menú' : 'Expandir menú'}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d={expandido ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
        </svg>
      </button>

      <p className="cita-sidebar__seccion cita-sidebar__texto">
        MENÚ PRINCIPAL
      </p>

      <nav
        id="cita-sidebar-menu"
        className="cita-sidebar__menu"
        aria-label="Menú principal"
      >
        {modulos.map((modulo) => {
          const activo = modulo.pagina === paginaActual

          return (
            <button
              key={modulo.nombre}
              type="button"
              className={[
                'cita-sidebar__item',
                activo ? 'cita-sidebar__item--activo' : '',
              ].join(' ')}
              disabled={!modulo.pagina}
              aria-label={modulo.nombre}
              aria-current={activo ? 'page' : undefined}
              title={
                modulo.pagina
                  ? modulo.nombre
                  : `${modulo.nombre} · Próximamente`
              }
              onClick={() => {
                if (modulo.pagina) onNavigate(modulo.pagina)
              }}
            >
              <span className="cita-sidebar__icono">
                <Icono nombre={modulo.nombre} />
              </span>

              <span className="cita-sidebar__texto">
                {modulo.nombre}
              </span>

              {activo && (
                <span
                  className="cita-sidebar__flecha cita-sidebar__texto"
                  aria-hidden="true"
                >
                  ›
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="cita-sidebar__pie">
        <button
          type="button"
          className="cita-sidebar__item"
          onClick={onSignOut}
          disabled={signingOut}
          aria-label={signingOut ? 'Cerrando sesión' : 'Cerrar sesión'}
          title="Cerrar sesión"
        >
          <span className="cita-sidebar__icono">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H4V3h5M14 8l5 4-5 4M8 12h11" />
            </svg>
          </span>

          <span className="cita-sidebar__texto">
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </span>
        </button>

        <div
          className="cita-sidebar__cuenta"
          title={`${nombre || 'Usuario'} · ${rol}`}
        >
          <span className="cita-sidebar__avatar" aria-hidden="true">
            {nombre.trim().charAt(0).toUpperCase() || 'U'}
          </span>

          <div className="cita-sidebar__texto">
            <strong>{nombre || 'Usuario'}</strong>
            <small>
              {rol === 'administrador' ? 'Administrador' : 'Encargado'}
            </small>
          </div>
        </div>
      </div>
    </aside>
  )
}