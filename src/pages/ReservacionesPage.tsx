import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./ReservacionesPage.css";

type Cliente = {
  id: string;
  nombre: string;
};

type Espacio = {
  id: string;
  nombre: string;
  capacidad: number;
  tarifa: number;
  unidad_tarifa: string;
};

type Reserva = {
  id: string;
  nombre_evento: string;
  inicio: string;
  fin: string;
  estado: string;
  total: number;
};

type Props = {
  onBack: () => void;
  onCalendario?: () => void;
  onGestion?: () => void;
};

const moneda = new Intl.NumberFormat("es-NI", {
  style: "currency",
  currency: "NIO",
});

const fecha = new Intl.DateTimeFormat("es-NI", {
  timeZone: "America/Managua",
  dateStyle: "short",
  timeStyle: "short",
});

const resumenVacio = {
  cliente: "",
  evento: "",
  inicio: "",
  fin: "",
  personas: "",
};

export default function ReservacionesPage({
  onBack,
  onCalendario,
  onGestion,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [vista, setVista] = useState<"nueva" | "registradas">("nueva");
  const [resumen, setResumen] = useState(resumenVacio);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [importes, setImportes] = useState<Record<string, string>>({});
  const [quintaCompleta, setQuintaCompleta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function cargarDatos() {
      setLoading(true);
      setLoadError("");

      try {
        const [clientesResult, espaciosResult, reservasResult] =
          await Promise.all([
            supabase.from("clientes").select("id, nombre").order("nombre"),
            supabase
              .from("espacios")
              .select("id, nombre, capacidad, tarifa, unidad_tarifa")
              .eq("activo", true)
              .order("nombre"),
            supabase
              .from("reservaciones")
              .select("id, nombre_evento, inicio, fin, estado, total")
              .order("creado_en", { ascending: false }),
          ]);

        if (cancelled) return;

        if (
          clientesResult.error ||
          espaciosResult.error ||
          reservasResult.error
        ) {
          setLoadError("No se pudieron cargar los datos de reservaciones.");
          return;
        }

        setClientes(clientesResult.data ?? []);
        setEspacios(espaciosResult.data ?? []);
        setReservas(reservasResult.data ?? []);
      } catch {
        if (!cancelled) {
          setLoadError("No se pudo conectar. Intentá actualizar los datos.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void cargarDatos();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const seleccionados = espacios.filter((espacio) =>
    Object.hasOwn(importes, espacio.id),
  );

  const subtotalCentavos = seleccionados.reduce(
    (total, espacio) => total + Math.round(Number(espacio.tarifa) * 100),
    0,
  );

  // El descuento se distribuye por espacio y se redondea a centavos,
  // para que el total enviado a la base de datos coincida con el resumen.
  const detallesConImporte = seleccionados.map((espacio) => {
    const tarifaCentavos = Math.round(Number(espacio.tarifa) * 100);
    const importeCentavos = quintaCompleta
      ? Math.round(tarifaCentavos * 0.7)
      : tarifaCentavos;

    return {
      espacio_id: espacio.id,
      importe: importeCentavos / 100,
      importeCentavos,
    };
  });

  const totalCentavos = detallesConImporte.reduce(
    (total, detalle) => total + detalle.importeCentavos,
    0,
  );
  const descuentoCentavos = subtotalCentavos - totalCentavos;

  function seleccionarEspacio(id: string, seleccionado: boolean) {
    const espacio = espacios.find((item) => item.id === id);
    setImportes((actuales) => {
      const nuevos = { ...actuales };

      if (seleccionado && espacio) {
        nuevos[id] = String(espacio.tarifa);
      } else {
        delete nuevos[id];
      }

      return nuevos;
    });
  }

  function seleccionarQuinta(completa: boolean) {
    setQuintaCompleta(completa);

    if (completa) {
      setImportes(
        Object.fromEntries(
          espacios.map((espacio) => [espacio.id, String(espacio.tarifa)]),
        ),
      );
    }
  }

  async function guardarReserva(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const form = event.currentTarget;
    const datos = new FormData(form);
    const nombreEvento = String(datos.get("nombre_evento") ?? "").trim();
    const inicioTexto = String(datos.get("inicio") ?? "");
    const finTexto = String(datos.get("fin") ?? "");

    // datetime-local no incluye zona: usamos explícitamente Nicaragua.
    const inicio = new Date(`${inicioTexto}:00-06:00`);
    const fin = new Date(`${finTexto}:00-06:00`);

    setFormError("");
    setMessage("");

    if (
      nombreEvento.length < 2 ||
      !Number.isFinite(inicio.getTime()) ||
      !Number.isFinite(fin.getTime()) ||
      fin <= inicio
    ) {
      setFormError("Revisá el nombre del evento y sus fechas.");
      return;
    }

    if (seleccionados.length === 0) {
      setFormError("Seleccioná al menos un espacio.");
      return;
    }

    const detalles = detallesConImporte.map(({ espacio_id, importe }) => ({
      espacio_id,
      importe,
    }));

    if (
      seleccionados.some(
        (espacio) =>
          !Number.isFinite(Number(espacio.tarifa)) || Number(espacio.tarifa) < 0,
      )
    ) {
      setFormError("Uno de los espacios tiene una tarifa inválida.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("crear_reservacion", {
        p_cliente_id: String(datos.get("cliente_id") ?? ""),
        p_nombre_evento: nombreEvento,
        p_inicio: inicio.toISOString(),
        p_fin: fin.toISOString(),
        p_cantidad_personas: Number(datos.get("cantidad_personas")),
        p_quinta_completa: quintaCompleta,
        p_detalles: detalles,
        p_observaciones:
          String(datos.get("observaciones") ?? "").trim() || null,
      });

      if (error) {
        setFormError(
          error.code === "P0001"
            ? error.message
            : "No se pudo guardar la reserva. Revisá los datos y tus permisos.",
        );
        return;
      }

      form.reset();
      setResumen(resumenVacio);
      setImportes({});
      setQuintaCompleta(false);
      setMessage("Reserva pendiente registrada correctamente.");
      setReload((value) => value + 1);
    } catch {
      setFormError(
        "No se pudo confirmar el registro. Actualizá la lista antes de reintentar.",
      );
    } finally {
      setSaving(false);
    }
  }

  function actualizarResumen(event: FormEvent<HTMLFormElement>) {
    const datos = new FormData(event.currentTarget);
    setResumen({
      cliente: String(datos.get("cliente_id") ?? ""),
      evento: String(datos.get("nombre_evento") ?? ""),
      inicio: String(datos.get("inicio") ?? ""),
      fin: String(datos.get("fin") ?? ""),
      personas: String(datos.get("cantidad_personas") ?? ""),
    });
  }

  function limpiar() {
    formRef.current?.reset();
    setImportes({});
    setQuintaCompleta(false);
    setResumen(resumenVacio);
    setFormError("");
    setMessage("");
  }

  function fechaResumen(valor: string) {
    if (!valor) return "Por definir";
    const instante = new Date(`${valor}:00-06:00`);
    return Number.isFinite(instante.getTime())
      ? fecha.format(instante)
      : "Por definir";
  }

  return (
    <main className="cita-reservas">
      <header className="cita-reservas__header">
        <div>
          
          <h1>Reservaciones</h1>
          <p>Organizá las solicitudes y los espacios de Quinta Anfuso.</p>
        </div>
        <div className="cita-reservas__acciones">
          {onCalendario && (
            <button type="button" onClick={onCalendario} disabled={saving}>
              Ver calendario
            </button>
          )}
          <button type="button" onClick={onBack} disabled={saving}>
            Volver al inicio
          </button>
        </div>
      </header>

      <nav
        className="cita-reservas__tabs"
        aria-label="Secciones de reservaciones"
      >
        <button
          type="button"
          aria-current={vista === "nueva" ? "page" : undefined}
          disabled={saving}
          onClick={() => setVista("nueva")}
        >
          ＋ Nueva reservación
        </button>
        <button
          type="button"
          aria-current={vista === "registradas" ? "page" : undefined}
          disabled={saving}
          onClick={() => setVista("registradas")}
        >
          ☷ Registradas
        </button>
        {onGestion && (
          <button type="button" disabled={saving} onClick={onGestion}>
            ↶ Cancelaciones y devoluciones
          </button>
        )}
      </nav>

      {message && (
        <p className="cita-reservas__mensaje" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando datos…</p>
      ) : loadError ? (
        <section className="cita-reservas__panel">
          <p role="alert">{loadError}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Actualizar datos
          </button>
        </section>
      ) : (
        <>
          <div hidden={vista !== "nueva"}>
            {clientes.length === 0 || espacios.length === 0 ? (
              <section className="cita-reservas__panel">
                <p>Primero registrá al menos un cliente y un espacio activo.</p>
              </section>
            ) : (
              <form
                ref={formRef}
                onSubmit={guardarReserva}
                onChange={actualizarResumen}
              >
                <fieldset disabled={saving} className="cita-reservas__layout">
                  <div className="cita-reservas__panel">
                    <section
                      className="cita-reservas__paso"
                      aria-labelledby="reserva-datos"
                    >
                      <h2 id="reserva-datos">
                        <span>1</span> Datos de la reservación
                      </h2>
                      <div className="cita-reservas__datos">
                        <label>
                          Cliente
                          <select name="cliente_id" defaultValue="" required>
                            <option value="" disabled>
                              Seleccioná un cliente
                            </option>
                            {clientes.map((cliente) => (
                              <option key={cliente.id} value={cliente.id}>
                                {cliente.nombre}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Evento o actividad
                          <input
                            name="nombre_evento"
                            placeholder="Nombre del evento"
                            minLength={2}
                            maxLength={150}
                            required
                          />
                        </label>
                      </div>
                      <div className="cita-reservas__fechas">
                        <label>
                          Inicio
                          <input name="inicio" type="datetime-local" required />
                        </label>
                        <label>
                          Fin
                          <input name="fin" type="datetime-local" required />
                        </label>
                        <div>
                          <label>
                            Cantidad de personas
                            <input
                              name="cantidad_personas"
                              type="number"
                              placeholder="Ej. 40"
                              min={1}
                              max={2147483647}
                              step={1}
                              required
                            />
                          </label>
                          <label className="cita-reservas__check">
                            <input
                              type="checkbox"
                              checked={quintaCompleta}
                              onChange={(event) =>
                                seleccionarQuinta(event.target.checked)
                              }
                            />
                            Reservar la quinta completa
                          </label>
                        </div>
                      </div>
                    </section>
                    <section
                      className="cita-reservas__paso"
                      aria-labelledby="reserva-espacios"
                    >
                      <h2 id="reserva-espacios">
                        <span>2</span> Espacios incluidos
                      </h2>
                      <p className="cita-reservas__ayuda">
                        Importe acordado por todo el período, en córdobas.
                      </p>
                      <div className="cita-reservas__espacios">
                        {espacios.map((espacio) => {
                          const seleccionado = Object.hasOwn(
                            importes,
                            espacio.id,
                          );
                          return (
                            <article
                              className={`cita-reservas__espacio${seleccionado ? " cita-reservas__espacio--seleccionado" : ""}`}
                              key={espacio.id}
                            >
                              <label className="cita-reservas__check">
                                <input
                                  type="checkbox"
                                  checked={seleccionado}
                                  disabled={quintaCompleta}
                                  onChange={(event) =>
                                    seleccionarEspacio(
                                      espacio.id,
                                      event.target.checked,
                                    )
                                  }
                                />
                                <span>
                                  <strong>{espacio.nombre}</strong>
                                  <small>{espacio.capacidad} personas</small>
                                </span>
                              </label>
                              <label className="cita-reservas__importe">
                                <span className="cita-reservas__sr">
                                  Importe de {espacio.nombre} en córdobas
                                </span>
                                <span aria-hidden="true">C$</span>
                                <input
                                  type="text"
                                  value={
                                    seleccionado
                                      ? Number(espacio.tarifa).toFixed(2)
                                      : ""
                                  }
                                  placeholder="Precio registrado"
                                  disabled={!seleccionado}
                                  readOnly
                                  aria-label={`Tarifa registrada de ${espacio.nombre}`}
                                />
                              </label>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                    <section
                      className="cita-reservas__paso"
                      aria-labelledby="reserva-observaciones"
                    >
                      <h2 id="reserva-observaciones">
                        <span>3</span> Observaciones <small>Opcional</small>
                      </h2>
                      <label>
                        <span className="cita-reservas__sr">
                          Observaciones del evento
                        </span>
                        <textarea
                          name="observaciones"
                          rows={3}
                          maxLength={2000}
                          placeholder="Agregá indicaciones o detalles del evento…"
                        />
                      </label>
                    </section>
                  </div>
                  <aside
                    className="cita-reservas__panel cita-reservas__resumen"
                    aria-labelledby="reserva-resumen"
                  >
                    <div className="cita-reservas__resumen-titulo">
                      <h2 id="reserva-resumen">Resumen de la solicitud</h2>
                      <span className="cita-reservas__estado">Pendiente</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Cliente</dt>
                        <dd>
                          {clientes.find(
                            (cliente) => cliente.id === resumen.cliente,
                          )?.nombre || "Por seleccionar"}
                        </dd>
                      </div>
                      <div>
                        <dt>Actividad</dt>
                        <dd>{resumen.evento.trim() || "Por definir"}</dd>
                      </div>
                      <div>
                        <dt>Inicio</dt>
                        <dd>{fechaResumen(resumen.inicio)}</dd>
                      </div>
                      <div>
                        <dt>Fin</dt>
                        <dd>{fechaResumen(resumen.fin)}</dd>
                      </div>
                      <div>
                        <dt>Personas</dt>
                        <dd>{resumen.personas || "Por definir"}</dd>
                      </div>
                    </dl>
                    <div className="cita-reservas__desglose">
                      {seleccionados.length === 0 ? (
                        <p>
                          Seleccioná los espacios que incluirá la solicitud.
                        </p>
                      ) : (
                        seleccionados.map((espacio) => (
                          <div key={espacio.id}>
                            <span>{espacio.nombre}</span>
                            <strong>
                              {moneda.format(Number(espacio.tarifa) || 0)}
                            </strong>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="cita-reservas__precios">
                      <div>
                        <span>Subtotal</span>
                        <strong>{moneda.format(subtotalCentavos / 100)}</strong>
                      </div>
                      {quintaCompleta && (
                        <div className="cita-reservas__descuento">
                          <span>Descuento por quinta completa (30 %)</span>
                          <strong>
                            −{moneda.format(descuentoCentavos / 100)}
                          </strong>
                        </div>
                      )}
                    </div>
                    <div className="cita-reservas__total">
                      <strong>Total</strong>
                      <strong>{moneda.format(totalCentavos / 100)}</strong>
                    </div>
                    <p className="cita-reservas__aviso">
                      Los espacios se bloquearán al registrar el anticipo y
                      confirmar la reserva.
                    </p>
                    <button type="submit" className="cita-reservas__primary">
                      {saving ? "Guardando…" : "Guardar solicitud"}
                    </button>
                    <button
                      type="button"
                      className="cita-reservas__limpiar"
                      onClick={limpiar}
                    >
                      Limpiar
                    </button>
                    {formError && (
                      <p className="cita-reservas__error" role="alert">
                        {formError}
                      </p>
                    )}
                    <p className="cita-reservas__zona">
                      Horarios de Nicaragua · Montos en córdobas
                    </p>
                  </aside>
                </fieldset>
              </form>
            )}
          </div>
          <section
            className="cita-reservas__panel"
            hidden={vista !== "registradas"}
            aria-labelledby="reserva-lista"
          >
            <div className="cita-reservas__header">
              <h2 id="reserva-lista">
                Reservaciones registradas <small>({reservas.length})</small>
              </h2>
              <button
                type="button"
                disabled={saving}
                onClick={() => setReload((value) => value + 1)}
              >
                Actualizar datos
              </button>
            </div>
            {reservas.length === 0 ? (
              <p>Todavía no hay reservaciones registradas.</p>
            ) : (
              <div className="cita-reservas__tabla">
                <table>
                  <caption>{reservas.length} reservaciones registradas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Actividad</th>
                      <th scope="col">Inicio</th>
                      <th scope="col">Fin</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservas.map((reserva) => (
                      <tr key={reserva.id}>
                        <td>{reserva.nombre_evento}</td>
                        <td>{fecha.format(new Date(reserva.inicio))}</td>
                        <td>{fecha.format(new Date(reserva.fin))}</td>
                        <td>
                          <span
                            className={`cita-reservas__estado cita-reservas__estado--${["pendiente", "confirmada", "cancelada", "completada"].includes(reserva.estado) ? reserva.estado : "otro"}`}
                          >
                            {reserva.estado}
                          </span>
                        </td>
                        <td>{moneda.format(reserva.total)}</td>
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
  );
}
