import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReservacionesPage from "./ReservacionesPage";
import { supabase } from "../lib/supabase";
import "./ReservacionesPage.css";
import "./GestionReservacionesPage.css";

type Reserva = {
  id: string;
  nombre_evento: string;
  inicio: string;
  estado: string;
  motivo_cancelacion: string | null;
  cancelado_en: string | null;
};

type Pago = {
  reservacion_id: string;
  monto: number;
};

type Reembolso = {
  id: string;
  reservacion_id: string;
  tipo: string;
  total_pagado: number;
  monto: number;
  motivo: string;
  estado: string;
};

type Props = {
  onBack: () => void;
  soloGestion?: boolean;
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

const tipos: Record<string, string> = {
  ninguno: "Sin reembolso",
  total: "Devolución total",
  porcentaje: "Porcentaje",
  monto: "Monto específico",
};

const estados: Record<string, string> = {
  no_aplica: "Sin devolución",
  pendiente: "Pendiente de entregar",
  entregado: "Entregado",
};

export default function GestionReservacionesPage({
  onBack,
  soloGestion = false,
}: Props) {
  const gestionRef = useRef<HTMLElement>(null);
  const [vista, setVista] = useState<"decision" | "historial">("decision");
  const [busqueda, setBusqueda] = useState("");
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [reembolsos, setReembolsos] = useState<Reembolso[]>([]);
  const [administrador, setAdministrador] = useState(false);

  const [reservaId, setReservaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tipo, setTipo] = useState("");
  const [valor, setValor] = useState("");
  const [confirmado, setConfirmado] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function cargarDatos() {
      setLoading(true);
      setLoadError("");

      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();

        if (authError || !auth.user) {
          throw new Error("No se pudo validar el usuario.");
        }

        const [reservasResult, pagosResult, reembolsosResult, perfilResult] =
          await Promise.all([
            supabase
              .from("reservaciones")
              .select(
                "id, nombre_evento, inicio, estado, motivo_cancelacion, cancelado_en",
              )
              .order("creado_en", { ascending: false }),
            supabase.from("pagos").select("reservacion_id, monto"),
            supabase
              .from("reembolsos")
              .select(
                "id, reservacion_id, tipo, total_pagado, monto, motivo, estado",
              ),
            supabase
              .from("perfiles")
              .select("rol, activo")
              .eq("id", auth.user.id)
              .single(),
          ]);

        if (cancelled) return;

        if (
          reservasResult.error ||
          pagosResult.error ||
          reembolsosResult.error ||
          perfilResult.error ||
          !perfilResult.data?.activo
        ) {
          setLoadError(
            "No se pudieron cargar los datos o tu perfil no está activo.",
          );
          return;
        }

        setReservas(reservasResult.data ?? []);
        setPagos(pagosResult.data ?? []);
        setReembolsos(reembolsosResult.data ?? []);
        setAdministrador(perfilResult.data.rol === "administrador");
      } catch {
        if (!cancelled) {
          setLoadError("No se pudo conectar para consultar las cancelaciones.");
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

  const seleccionada = reservas.find((reserva) => reserva.id === reservaId);

  const pagadoCentavos = pagos
    .filter((pago) => pago.reservacion_id === reservaId)
    .reduce((total, pago) => total + Math.round(Number(pago.monto) * 100), 0);

  const valorNumero = Number(valor);

  const valorValido =
    tipo === "ninguno" ||
    tipo === "total" ||
    (valor.trim() !== "" &&
      Number.isFinite(valorNumero) &&
      valorNumero > 0 &&
      (tipo !== "porcentaje" || valorNumero <= 100));

  const devolverCentavos = !valorValido
    ? 0
    : tipo === "total"
      ? pagadoCentavos
      : tipo === "porcentaje"
        ? Math.round((pagadoCentavos * valorNumero) / 100)
        : tipo === "monto"
          ? Math.round(valorNumero * 100)
          : 0;

  const requiereAdministrador = pagadoCentavos > 0 && !administrador;

  const opciones = reservas.filter(
    (reserva) => !reembolsos.some((item) => item.reservacion_id === reserva.id),
  );

  const canceladas = reservas.filter(
    (reserva) => reserva.estado === "cancelada",
  );

  function limpiarDecision() {
    setMotivo("");
    setTipo("");
    setValor("");
    setConfirmado(false);
    setFormError("");
  }

  async function cancelarReserva(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setFormError("");
    setMessage("");

    if (
      !seleccionada ||
      requiereAdministrador ||
      !tipo ||
      !valorValido ||
      motivo.trim().length < 5 ||
      !confirmado
    ) {
      setFormError("Revisá la reserva, el motivo y la decisión de reembolso.");
      return;
    }

    if (
      devolverCentavos > pagadoCentavos ||
      (tipo !== "ninguno" && devolverCentavos <= 0)
    ) {
      setFormError("El reembolso debe ser positivo y no superar lo pagado.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("cancelar_con_reembolso", {
        p_reservacion_id: reservaId,
        p_motivo: motivo.trim(),
        p_tipo: tipo,
        p_valor: tipo === "porcentaje" || tipo === "monto" ? valorNumero : 0,
      });

      if (error) {
        setFormError(
          error.code === "P0001"
            ? error.message
            : "No se pudo confirmar el resultado. Actualizá los datos antes de reintentar.",
        );
        return;
      }

      setMessage(
        devolverCentavos > 0
          ? "Cancelación registrada. El reembolso quedó pendiente de entrega."
          : "Cancelación registrada sin reembolso.",
      );

      setReservaId("");
      limpiarDecision();
      setReload((value) => value + 1);
      setVersion((value) => value + 1);
    } catch {
      setFormError(
        "La conexión se interrumpió. Actualizá los datos para verificar el resultado.",
      );
    } finally {
      setSaving(false);
    }
  }

  const importeCorrecto =
    Boolean(tipo) &&
    valorValido &&
    devolverCentavos <= pagadoCentavos &&
    (tipo === "ninguno" || devolverCentavos > 0);
  const historial = canceladas.filter((reserva) => {
    const decision = reembolsos.find(
      (item) => item.reservacion_id === reserva.id,
    );
    return `${reserva.nombre_evento} ${reserva.id} ${decision?.motivo ?? reserva.motivo_cancelacion ?? ""}`
      .toLocaleLowerCase("es")
      .includes(busqueda.trim().toLocaleLowerCase("es"));
  });

  function actualizar() {
    setReservaId("");
    limpiarDecision();
    setReload((value) => value + 1);
    setVersion((value) => value + 1);
  }

  return (
    <>
      {!soloGestion && (
        <ReservacionesPage
          key={version}
          onBack={onBack}
          onGestion={() =>
            gestionRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          }
        />
      )}
      <section
        ref={gestionRef}
        className="cita-reservas cita-gestion"
        aria-labelledby="gestion-titulo"
      >
        <header className="cita-reservas__header">
          <div>
            <h1 id="gestion-titulo">Cancelaciones y devoluciones</h1>
            <p>
              Registrá la cancelación y definí qué parte del dinero se
              devolverá.
            </p>
          </div>
          <button
            type="button"
            disabled={loading || saving}
            onClick={actualizar}
          >
            Actualizar datos
          </button>
        </header>
        <nav
          className="cita-reservas__tabs"
          aria-label="Secciones de cancelaciones"
        >
          <button
            type="button"
            disabled={saving}
            aria-current={vista === "decision" ? "page" : undefined}
            onClick={() => setVista("decision")}
          >
            Cancelación y reembolso
          </button>
          <button
            type="button"
            disabled={saving}
            aria-current={vista === "historial" ? "page" : undefined}
            onClick={() => setVista("historial")}
          >
            Cancelaciones y devoluciones
          </button>
        </nav>
        {message && (
          <p className="cita-reservas__mensaje" role="status">
            {message}
          </p>
        )}
        {loading ? (
          <p role="status">Cargando datos…</p>
        ) : loadError ? (
          <p role="alert">{loadError}</p>
        ) : (
          <>
            <div className="cita-gestion__decision" hidden={vista !== "decision"}>
              <form onSubmit={cancelarReserva}>
                <fieldset disabled={saving} className="cita-reservas__layout">
                  <div className="cita-reservas__panel">
                    <section className="cita-reservas__paso">
                      <h2>
                        <span>1</span> Seleccioná la reservación
                      </h2>
                      <p className="cita-reservas__ayuda">
                        También podés registrar la decisión de una cancelación
                        anterior.
                      </p>
                      <label>
                        Reservación
                        <select
                          value={reservaId}
                          onChange={(event) => {
                            setReservaId(event.target.value);
                            limpiarDecision();
                            setMessage("");
                            if (!administrador) setTipo("ninguno");
                          }}
                          required
                        >
                          <option value="">Seleccioná una reserva</option>
                          {opciones.map((reserva) => (
                            <option key={reserva.id} value={reserva.id}>
                              {reserva.nombre_evento} ·{" "}
                              {fecha.format(new Date(reserva.inicio))} ·{" "}
                              {reserva.estado} · {reserva.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {opciones.length === 0 && (
                        <p>
                          No hay reservaciones sin decisión de reembolso
                          registrada.
                        </p>
                      )}
                    </section>
                    {seleccionada &&
                      (requiereAdministrador ? (
                        <p className="cita-reservas__aviso" role="status">
                          Esta reserva tiene pagos. Un administrador debe
                          registrar su cancelación y la decisión de reembolso.
                        </p>
                      ) : (
                        <>
                          <section className="cita-reservas__paso">
                            <h2>
                              <span>2</span> Decisión de reembolso
                            </h2>
                            <label>
                              Tipo de devolución
                              <select
                                value={tipo}
                                onChange={(event) => {
                                  setTipo(event.target.value);
                                  setValor("");
                                  setConfirmado(false);
                                }}
                                required
                              >
                                <option value="" disabled>
                                  Seleccioná una opción
                                </option>
                                <option value="ninguno">Sin reembolso</option>
                                {administrador && pagadoCentavos > 0 && (
                                  <>
                                    <option value="total">
                                      Devolución total
                                    </option>
                                    <option value="porcentaje">
                                      Porcentaje
                                    </option>
                                    <option value="monto">
                                      Monto específico
                                    </option>
                                  </>
                                )}
                              </select>
                            </label>
                            {(tipo === "porcentaje" || tipo === "monto") && (
                              <label className="cita-gestion__valor">
                                {tipo === "porcentaje"
                                  ? "Porcentaje a devolver"
                                  : "Monto a devolver en córdobas"}
                                <input
                                  type="number"
                                  min="0.01"
                                  max={
                                    tipo === "porcentaje"
                                      ? 100
                                      : pagadoCentavos / 100
                                  }
                                  step="0.01"
                                  value={valor}
                                  onChange={(event) => {
                                    setValor(event.target.value);
                                    setConfirmado(false);
                                  }}
                                  required
                                />
                              </label>
                            )}
                            {tipo === "total" && (
                              <p>
                                Se devolverá el 100 % de los pagos recibidos.
                              </p>
                            )}
                            {tipo === "ninguno" && (
                              <p>
                                La cancelación se registrará sin devolución de
                                dinero.
                              </p>
                            )}
                          </section>
                          <section className="cita-reservas__paso">
                            <h2>
                              <span>3</span> Motivo de la decisión
                            </h2>
                            <label>
                              Motivo de cancelación y reembolso
                              <textarea
                                rows={4}
                                minLength={5}
                                maxLength={1000}
                                value={motivo}
                                placeholder="Explicá el motivo y las condiciones acordadas…"
                                onChange={(event) => {
                                  setMotivo(event.target.value);
                                  setConfirmado(false);
                                }}
                                required
                              />
                            </label>
                          </section>
                        </>
                      ))}
                  </div>
                  <aside
                    className="cita-reservas__panel cita-reservas__resumen"
                    aria-labelledby="decision-resumen"
                  >
                    <div className="cita-reservas__resumen-titulo">
                      <h2 id="decision-resumen">Resumen de la decisión</h2>
                      <span className="cita-reservas__estado">
                        {seleccionada?.estado === "cancelada"
                          ? "Cancelada"
                          : "Por confirmar"}
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>Actividad</dt>
                        <dd>
                          {seleccionada?.nombre_evento || "Por seleccionar"}
                        </dd>
                      </div>
                      <div>
                        <dt>Inicio</dt>
                        <dd>
                          {seleccionada
                            ? fecha.format(new Date(seleccionada.inicio))
                            : "Por definir"}
                        </dd>
                      </div>
                      <div>
                        <dt>Referencia</dt>
                        <dd>{seleccionada?.id.slice(0, 8) || "—"}</dd>
                      </div>
                      <div>
                        <dt>Decisión</dt>
                        <dd>{tipos[tipo] || "Por seleccionar"}</dd>
                      </div>
                    </dl>
                    <div className="cita-gestion__importes">
                      <div>
                        <span>Total pagado</span>
                        <strong>{moneda.format(pagadoCentavos / 100)}</strong>
                      </div>
                      <div className="cita-gestion__devolver">
                        <span>A devolver</span>
                        <strong>
                          {importeCorrecto
                            ? moneda.format(devolverCentavos / 100)
                            : "Por definir"}
                        </strong>
                      </div>
                      <div>
                        <span>A retener</span>
                        <strong>
                          {importeCorrecto
                            ? moneda.format(
                                (pagadoCentavos - devolverCentavos) / 100,
                              )
                            : "Por definir"}
                        </strong>
                      </div>
                    </div>
                    {tipo && !importeCorrecto && !requiereAdministrador && (
                      <p className="cita-reservas__error">
                        Ingresá un importe válido. La devolución no puede
                        superar lo pagado.
                      </p>
                    )}
                    <p className="cita-reservas__aviso">
                      {importeCorrecto && devolverCentavos === 0
                        ? "Se registrará la decisión sin reembolso."
                        : "La devolución quedará pendiente de entrega. El dinero saldrá del saldo neto cuando se registre su entrega."}
                    </p>
                    {seleccionada && !requiereAdministrador && (
                      <>
                        <label className="cita-reservas__check cita-gestion__confirmacion">
                          <input
                            type="checkbox"
                            checked={confirmado}
                            onChange={(event) =>
                              setConfirmado(event.target.checked)
                            }
                            required
                          />
                          Confirmo la cancelación y los importes indicados.
                        </label>
                        <button
                          type="submit"
                          className="cita-reservas__primary"
                          disabled={!confirmado || !importeCorrecto}
                        >
                          {saving
                            ? "Guardando…"
                            : "Confirmar cancelación y decisión"}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="cita-reservas__limpiar"
                      onClick={() => {
                        setReservaId("");
                        limpiarDecision();
                        setMessage("");
                      }}
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
            </div>
            <section
  className="cita-reservas__panel cita-gestion__historial"
  hidden={vista !== "historial"}
              aria-labelledby="historial-titulo"
            >
              <div className="cita-reservas__header">
                <div>
                  <h2 id="historial-titulo">Cancelaciones registradas</h2>
                  <p>Consultá las decisiones y el estado de cada devolución.</p>
                </div>
                <span className="cita-reservas__estado">
                  {canceladas.length} cancelaciones
                </span>
              </div>
              <label className="cita-gestion__busqueda">
                Buscar por actividad, referencia o motivo
                <input
                  type="search"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar cancelación…"
                />
              </label>
              {historial.length === 0 ? (
                <p>
                  {canceladas.length === 0
                    ? "No hay reservaciones canceladas."
                    : "No se encontraron coincidencias."}
                </p>
              ) : (
                <div className="cita-reservas__tabla">
                  <table>
                    <caption>
                      Mostrando {historial.length} de {canceladas.length}{" "}
                      cancelaciones
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Actividad</th>
                        <th scope="col">Cancelación</th>
                        <th scope="col">Pagado</th>
                        <th scope="col">Decisión</th>
                        <th scope="col">A devolver</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((reserva) => {
                        const decision = reembolsos.find(
                          (item) => item.reservacion_id === reserva.id,
                        );
                        const pagado =
                          pagos
                            .filter(
                              (pago) => pago.reservacion_id === reserva.id,
                            )
                            .reduce(
                              (total, pago) =>
                                total + Math.round(Number(pago.monto) * 100),
                              0,
                            ) / 100;
                        return (
                          <tr key={reserva.id}>
                            <td>
                              <strong>{reserva.nombre_evento}</strong>
                              <small className="cita-gestion__referencia">
                                {reserva.id.slice(0, 8)}
                              </small>
                            </td>
                            <td>
                              {reserva.cancelado_en
                                ? fecha.format(new Date(reserva.cancelado_en))
                                : "Sin fecha registrada"}
                            </td>
                            <td>{moneda.format(pagado)}</td>
                            <td>
                              {decision
                                ? tipos[decision.tipo] || decision.tipo
                                : "Sin decisión"}
                            </td>
                            <td>
                              {decision ? moneda.format(decision.monto) : "—"}
                            </td>
                            <td>
                              <span
                                className={`cita-reservas__estado ${decision?.estado === "entregado" ? "cita-reservas__estado--completada" : ""}`}
                              >
                                {decision
                                  ? estados[decision.estado] || decision.estado
                                  : "Pendiente de decisión"}
                              </span>
                            </td>
                            <td className="cita-gestion__motivo">
                              {decision?.motivo ||
                                reserva.motivo_cancelacion ||
                                "Sin motivo registrado"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </>
  );
}
