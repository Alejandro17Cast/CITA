export type TipoReporte =
  | 'reservas'
  | 'pagos'
  | 'saldos'
  | 'espacios'
  | 'clientes'
  | 'cancelaciones'
  | 'caja'
export type Reserva = {
  id: string
  cliente_id: string
  nombre_evento: string
  inicio: string
  fin: string
  estado: string
  total: number | string
}
export type Pago = {
  id: string
  reservacion_id: string
  monto: number | string
  metodo: string
  referencia: string | null
  registrado_en: string
}
export type Reembolso = {
  id: string
  reservacion_id: string
  monto: number | string
  estado: string
  entregado_en: string | null
}
export type Espacio = { id: string; nombre: string }
export type Cliente = { id: string; nombre: string }
export type Detalle = { reservacion_id: string; espacio_id: string }
export type Datos = {
  reservas: Reserva[]
  pagos: Pago[]
  reembolsos: Reembolso[]
  espacios: Espacio[]
  clientes: Cliente[]
  detalles: Detalle[]
}
export type Filtros = {
  tipo: TipoReporte
  inicio: string
  fin: string
  espacio: string
}
export type Celda = string | number
export type Resumen = { etiqueta: string; valor: number; monetario?: boolean }
export type Resultado = {
  titulo: string
  nota: string
  columnas: string[]
  filas: Celda[][]
  resumen: Resumen[]
}

export const tipos: { valor: TipoReporte; nombre: string }[] = [
  { valor: 'reservas', nombre: 'Reservas y pagos' },
  { valor: 'pagos', nombre: 'Pagos y abonos' },
  { valor: 'saldos', nombre: 'Saldos pendientes' },
  { valor: 'espacios', nombre: 'Uso de espacios' },
  { valor: 'clientes', nombre: 'Clientes' },
  { valor: 'cancelaciones', nombre: 'Cancelaciones' },
  { valor: 'caja', nombre: 'Movimiento de dinero' },
]
export const moneda = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
})
export function centavos(valor: number | string) {
  const numero = Number(valor)
  if (!Number.isFinite(numero))
    throw new Error('Se encontró un importe inválido.')
  return Math.round(numero * 100)
}
export function diaNicaragua(fecha: string | Date) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(fecha))
  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}
export function fechaVisible(fecha: string) {
  return new Intl.DateTimeFormat('es-NI', {
    timeZone: 'America/Managua',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

export function construirReporte(datos: Datos, filtros: Filtros): Resultado {
  const enPeriodo = (fecha: string) => {
    const dia = diaNicaragua(fecha)
    return dia >= filtros.inicio && dia <= filtros.fin
  }
  const clientes = new Map(datos.clientes.map((item) => [item.id, item.nombre]))
  const espacios = new Map(datos.espacios.map((item) => [item.id, item.nombre]))
  const reservasPorId = new Map(datos.reservas.map((item) => [item.id, item]))
  const espaciosPorReserva = new Map<string, Set<string>>()
  for (const detalle of datos.detalles) {
    const ids =
      espaciosPorReserva.get(detalle.reservacion_id) ?? new Set<string>()
    ids.add(detalle.espacio_id)
    espaciosPorReserva.set(detalle.reservacion_id, ids)
  }
  const pertenece = (id: string) =>
    !filtros.espacio ||
    Boolean(espaciosPorReserva.get(id)?.has(filtros.espacio))
  const nombresEspacios = (id: string) =>
    [...(espaciosPorReserva.get(id) ?? [])]
      .map((valor) => espacios.get(valor) ?? 'Espacio no disponible')
      .join(', ') || 'Sin espacios asociados'
  const nombreCliente = (reserva?: Reserva) =>
    reserva
      ? (clientes.get(reserva.cliente_id) ?? 'Cliente no disponible')
      : 'Reserva no disponible'
  const abonos = new Map<string, number>()
  for (const pago of datos.pagos)
    abonos.set(
      pago.reservacion_id,
      (abonos.get(pago.reservacion_id) ?? 0) + centavos(pago.monto),
    )
  const pagado = (reserva: Reserva) => abonos.get(reserva.id) ?? 0
  const saldo = (reserva: Reserva) =>
    reserva.estado === 'cancelada'
      ? 0
      : Math.max(0, centavos(reserva.total) - pagado(reserva))
  const reservas = datos.reservas
    .filter((item) => enPeriodo(item.inicio) && pertenece(item.id))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const vigentes = reservas.filter((item) => item.estado !== 'cancelada')
  const suma = (lista: Reserva[], calcular: (item: Reserva) => number) =>
    lista.reduce((total, item) => total + calcular(item), 0) / 100
  const resumenReservas = (lista: Reserva[]): Resumen[] => [
    { etiqueta: 'Reservas', valor: lista.length },
    {
      etiqueta: 'Total reservado',
      valor: suma(lista, (item) => centavos(item.total)),
      monetario: true,
    },
    {
      etiqueta: 'Abonos acumulados',
      valor: suma(lista, pagado),
      monetario: true,
    },
    { etiqueta: 'Saldo pendiente', valor: suma(lista, saldo), monetario: true },
  ]
  const notaReservas =
    'Filtra por fecha de inicio de la reserva. Abonos y saldos acumulados a la fecha de consulta; incluyen pagos de otros períodos. Los totales excluyen reservas canceladas. El filtro de espacio incluye el importe completo de cada reserva que contiene ese espacio.'
  if (filtros.tipo === 'reservas' || filtros.tipo === 'saldos') {
    const lista =
      filtros.tipo === 'saldos'
        ? vigentes.filter((item) => saldo(item) > 0)
        : reservas
    return {
      titulo:
        filtros.tipo === 'saldos'
          ? 'Detalle de saldos pendientes'
          : 'Detalle de reservas y pagos',
      nota: notaReservas,
      columnas: [
        'Inicio',
        'Cliente',
        'Actividad',
        'Espacios',
        'Total (NIO)',
        'Abonado (NIO)',
        'Pendiente (NIO)',
        'Estado de reserva',
        'Estado de pago',
      ],
      filas: lista.map((item) => [
        fechaVisible(item.inicio),
        nombreCliente(item),
        item.nombre_evento,
        nombresEspacios(item.id),
        centavos(item.total) / 100,
        pagado(item) / 100,
        saldo(item) / 100,
        item.estado,
        item.estado === 'cancelada'
          ? 'No aplica'
          : saldo(item) === 0
            ? 'Pagado'
            : pagado(item) > 0
              ? 'Parcial'
              : 'Pendiente',
      ]),
      resumen: resumenReservas(filtros.tipo === 'saldos' ? lista : vigentes),
    }
  }
  if (filtros.tipo === 'pagos') {
    const lista = datos.pagos
      .filter(
        (item) =>
          enPeriodo(item.registrado_en) && pertenece(item.reservacion_id),
      )
      .sort((a, b) => a.registrado_en.localeCompare(b.registrado_en))
    const total = lista.reduce((valor, item) => valor + centavos(item.monto), 0)
    return {
      titulo: 'Detalle de pagos y abonos',
      nota: 'Filtra por fecha de registro del pago, independientemente de la fecha de la reserva. Incluye pagos de reservas posteriormente canceladas. Consultá Movimiento de dinero para descontar devoluciones entregadas.',
      columnas: [
        'Fecha',
        'Cliente',
        'Actividad',
        'Espacios',
        'Monto (NIO)',
        'Método',
        'Referencia',
      ],
      filas: lista.map((item) => [
        fechaVisible(item.registrado_en),
        nombreCliente(reservasPorId.get(item.reservacion_id)),
        reservasPorId.get(item.reservacion_id)?.nombre_evento ??
          'Reserva no disponible',
        nombresEspacios(item.reservacion_id),
        centavos(item.monto) / 100,
        item.metodo,
        item.referencia ?? '—',
      ]),
      resumen: [
        { etiqueta: 'Pagos registrados', valor: lista.length },
        { etiqueta: 'Pagos recibidos', valor: total / 100, monetario: true },
        {
          etiqueta: 'Efectivo',
          valor:
            lista
              .filter((item) => item.metodo === 'efectivo')
              .reduce((valor, item) => valor + centavos(item.monto), 0) / 100,
          monetario: true,
        },
        {
          etiqueta: 'Otros métodos',
          valor:
            lista
              .filter((item) => item.metodo !== 'efectivo')
              .reduce((valor, item) => valor + centavos(item.monto), 0) / 100,
          monetario: true,
        },
      ],
    }
  }
  if (filtros.tipo === 'caja') {
    const dias = new Map<string, { recibido: number; devuelto: number }>()
    const obtener = (fecha: string) => {
      const dia = diaNicaragua(fecha)
      const valores = dias.get(dia) ?? { recibido: 0, devuelto: 0 }
      dias.set(dia, valores)
      return valores
    }
    let cantidad = 0
    for (const pago of datos.pagos)
      if (enPeriodo(pago.registrado_en) && pertenece(pago.reservacion_id)) {
        obtener(pago.registrado_en).recibido += centavos(pago.monto)
        cantidad += 1
      }
    for (const item of datos.reembolsos)
      if (
        item.estado === 'entregado' &&
        item.entregado_en &&
        enPeriodo(item.entregado_en) &&
        pertenece(item.reservacion_id)
      ) {
        obtener(item.entregado_en).devuelto += centavos(item.monto)
        cantidad += 1
      }
    const recibido = [...dias.values()].reduce(
      (valor, item) => valor + item.recibido,
      0,
    )
    const devuelto = [...dias.values()].reduce(
      (valor, item) => valor + item.devuelto,
      0,
    )
    return {
      titulo: 'Movimiento de dinero por día',
      nota: 'Pagos según su fecha de registro y devoluciones según su fecha de entrega, en hora de Nicaragua. Neto = pagos recibidos menos reembolsos entregados. Las devoluciones pendientes no se descuentan.',
      columnas: ['Fecha', 'Recibido (NIO)', 'Devuelto (NIO)', 'Neto (NIO)'],
      filas: [...dias.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, item]) => [
          dia,
          item.recibido / 100,
          item.devuelto / 100,
          (item.recibido - item.devuelto) / 100,
        ]),
      resumen: [
        { etiqueta: 'Movimientos', valor: cantidad },
        { etiqueta: 'Pagos recibidos', valor: recibido / 100, monetario: true },
        {
          etiqueta: 'Reembolsos entregados',
          valor: devuelto / 100,
          monetario: true,
        },
        {
          etiqueta: 'Neto recibido',
          valor: (recibido - devuelto) / 100,
          monetario: true,
        },
      ],
    }
  }
  if (filtros.tipo === 'cancelaciones') {
    const lista = reservas.filter((item) => item.estado === 'cancelada')
    const ids = new Set(lista.map((item) => item.id))
    const devoluciones = datos.reembolsos.filter((item) =>
      ids.has(item.reservacion_id),
    )
    return {
      titulo: 'Reservas canceladas',
      nota: 'El período corresponde al inicio previsto de la reserva, no al día de cancelación. Las devoluciones son acumuladas a la fecha de consulta.',
      columnas: [
        'Inicio previsto',
        'Cliente',
        'Actividad',
        'Espacios',
        'Total contratado (NIO)',
        'Pagos recibidos (NIO)',
        'Devuelto (NIO)',
        'Estado',
      ],
      filas: lista.map((item) => [
        fechaVisible(item.inicio),
        nombreCliente(item),
        item.nombre_evento,
        nombresEspacios(item.id),
        centavos(item.total) / 100,
        pagado(item) / 100,
        devoluciones
          .filter(
            (devolucion) =>
              devolucion.reservacion_id === item.id &&
              devolucion.estado === 'entregado',
          )
          .reduce(
            (valor, devolucion) => valor + centavos(devolucion.monto),
            0,
          ) / 100,
        item.estado,
      ]),
      resumen: [
        { etiqueta: 'Cancelaciones', valor: lista.length },
        {
          etiqueta: 'Valor cancelado',
          valor: suma(lista, (item) => centavos(item.total)),
          monetario: true,
        },
        {
          etiqueta: 'Devuelto',
          valor:
            devoluciones
              .filter((item) => item.estado === 'entregado')
              .reduce((valor, item) => valor + centavos(item.monto), 0) / 100,
          monetario: true,
        },
        {
          etiqueta: 'Reembolsos pendientes',
          valor:
            devoluciones
              .filter((item) => item.estado === 'pendiente')
              .reduce((valor, item) => valor + centavos(item.monto), 0) / 100,
          monetario: true,
        },
      ],
    }
  }
  if (filtros.tipo === 'clientes') {
    const grupos = new Map<string, Reserva[]>()
    for (const item of vigentes)
      grupos.set(item.cliente_id, [
        ...(grupos.get(item.cliente_id) ?? []),
        item,
      ])
    return {
      titulo: 'Actividad por cliente',
      nota: notaReservas,
      columnas: [
        'Cliente',
        'Reservas',
        'Total reservado (NIO)',
        'Abonos acumulados (NIO)',
        'Saldo pendiente (NIO)',
      ],
      filas: [...grupos.entries()]
        .sort(([a], [b]) =>
          (clientes.get(a) ?? '').localeCompare(clientes.get(b) ?? '', 'es'),
        )
        .map(([id, lista]) => [
          clientes.get(id) ?? 'Cliente no disponible',
          lista.length,
          suma(lista, (item) => centavos(item.total)),
          suma(lista, pagado),
          suma(lista, saldo),
        ]),
      resumen: [
        { etiqueta: 'Clientes con reservas', valor: grupos.size },
        ...resumenReservas(vigentes).slice(1),
      ],
    }
  }
  const confirmadas = vigentes.filter(
    (item) => item.estado === 'confirmada' || item.estado === 'completada',
  )
  const filas = datos.espacios
    .filter((item) => !filtros.espacio || item.id === filtros.espacio)
    .map((item) => {
      const incluye = (reserva: Reserva) =>
        espaciosPorReserva.get(reserva.id)?.has(item.id)
      return [
        item.nombre,
        confirmadas.filter(incluye).length,
        vigentes.filter(
          (reserva) => reserva.estado === 'pendiente' && incluye(reserva),
        ).length,
      ] satisfies Celda[]
    })
  return {
    titulo: 'Uso de espacios',
    nota: 'Cuenta reservas por su fecha de inicio. Distingue reservas confirmadas o completadas de solicitudes pendientes. Una reserva de quinta completa cuenta una vez en cada espacio incluido. No incluye mantenimientos ni mide porcentaje de ocupación.',
    columnas: [
      'Espacio',
      'Reservas confirmadas / completadas',
      'Solicitudes pendientes',
    ],
    filas,
    resumen: [
      { etiqueta: 'Espacios', valor: filas.length },
      {
        etiqueta: 'Reservas confirmadas / completadas',
        valor: confirmadas.length,
      },
      {
        etiqueta: 'Solicitudes pendientes',
        valor: vigentes.filter((item) => item.estado === 'pendiente').length,
      },
      {
        etiqueta: 'Asignaciones confirmadas a espacios',
        valor: filas.reduce((total, fila) => total + Number(fila[1]), 0),
      },
    ],
  }
}
