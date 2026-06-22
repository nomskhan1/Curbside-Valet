"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

const STATUS_LABEL = {
  WAITING: "Waiting in queue",
  PULLING: "Being pulled around",
  READY: "Ready at curb",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const CHARGE_STATUS_LABEL = {
  WAITING: "Charging requested",
  PULLING: "Charging in progress",
  READY: "Charging complete",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Visitor cars created with just a ticket number won't have make/model on
// file yet — fall back to a generic label instead of showing blank space.
function vehicleLabel(vehicle) {
  if (vehicle.make || vehicle.model) {
    return [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  }
  return "Visitor vehicle (no details on file)";
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [tab, setTab] = useState("queue"); // staff/admin: "queue" | "users" (admin only)
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [vehiclesFilterBuilding, setVehiclesFilterBuilding] = useState("all");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.replace("/login");
        } else {
          setUser(d.user);
        }
      });
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (user === undefined) return null;
  if (!user) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="" className="logo" />
          <span className="mark">Integral</span>
          <span className="sub">{user.role}</span>
        </div>
        <button className="btn-ghost" style={{ width: "auto", padding: "8px 14px", borderRadius: 20, fontSize: 11 }} onClick={logout}>
          Sign out
        </button>
      </header>
      <main>
        {user.role === "GUEST" && <GuestView user={user} />}
        {(user.role === "STAFF" || user.role === "MANAGER" || user.role === "ADMIN") && (
          <StaffView
            user={user}
            tab={tab}
            setTab={setTab}
            vehiclesFilterBuilding={vehiclesFilterBuilding}
            setVehiclesFilterBuilding={setVehiclesFilterBuilding}
          />
        )}

        {showPasswordPanel && <ChangePasswordPanel onClose={() => setShowPasswordPanel(false)} />}
      </main>
      <footer className="note">
        Signed in as {user.name} ({user.username})
        {" · "}
        <button
          onClick={() => setShowPasswordPanel((v) => !v)}
          style={{
            background: "none",
            border: "none",
            color: "var(--brass-light)",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          Change password
        </button>
      </footer>
    </div>
  );
}

// ---------------- CHANGE PASSWORD ----------------
function ChangePasswordPanel({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Couldn't change password.");
      return;
    }
    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="stub" style={{ marginTop: 20 }}>
      <div className="stub-top">
        <h1 className="title" style={{ marginBottom: 0, fontSize: 18 }}>
          Change password
        </h1>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--slate2)", cursor: "pointer", fontSize: 13 }}
        >
          Close
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success ? (
        <p style={{ color: "var(--green)", fontSize: 14 }}>Password updated successfully.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------- GUEST ----------------
function GuestView({ user }) {
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [showChargeForm, setShowChargeForm] = useState(false);

  const load = useCallback(async () => {
    const [vRes, rRes] = await Promise.all([fetch("/api/vehicles"), fetch("/api/requests")]);
    setVehicles(await vRes.json());
    setRequests(await rRes.json());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  // Pickup and charging requests are independent of each other — a guest
  // can have both active at once, so they're tracked separately.
  const activeRequest = requests.find(
    (r) => r.type !== "CHARGE" && ["WAITING", "PULLING", "READY"].includes(r.status)
  );
  const activeChargeRequests = requests.filter(
    (r) => r.type === "CHARGE" && ["WAITING", "PULLING", "READY"].includes(r.status)
  );

  async function submitRequest(payload) {
    setError("");
    const body = { ...payload };
    if (scheduleMode && scheduledFor) {
      body.scheduledFor = new Date(scheduledFor).toISOString();
    }
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setScheduleMode(false);
    setScheduledFor("");
    setShowTicketForm(false);
    load();
  }

  async function requestPickup(vehicleId) {
    submitRequest({ vehicleId });
  }

  async function requestCharge(vehicleId) {
    setError("");
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, type: "CHARGE" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setShowChargeForm(false);
    load();
  }

  async function requestChargeByTicket(e) {
    e.preventDefault();
    const ticketNumber = e.target.ticketNumber.value.trim();
    if (!ticketNumber) return;
    setError("");
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketNumber, type: "CHARGE" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setShowChargeForm(false);
    load();
  }

  async function requestByTicket(e) {
    e.preventDefault();
    const ticketNumber = e.target.ticketNumber.value.trim();
    if (!ticketNumber) return;
    submitRequest({ ticketNumber });
  }

  async function cancel(requestId) {
    await fetch(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    load();
  }

  let pickupSection;
  if (activeRequest) {
    const isFuture = activeRequest.scheduledFor && new Date(activeRequest.scheduledFor) > new Date();
    pickupSection = (
      <>
        <div className="hero-line">Ticket received</div>
        <h1 className="title">{isFuture ? "Pickup scheduled" : "We're on it"}</h1>
        <div className="stub">
          <div className="stub-top">
            <div>
              <div className="stub-num-label">Ticket</div>
              <div className="stub-num">{activeRequest.vehicle.ticketNumber}</div>
            </div>
            <span className={`status-pill status-${activeRequest.status}`}>
              <span className="dot"></span>
              {isFuture ? "Scheduled" : STATUS_LABEL[activeRequest.status]}
            </span>
          </div>
          <div className="stub-divider"></div>
          <div className="stub-row">
            <span>Vehicle</span>
            <span>
              {vehicleLabel(activeRequest.vehicle)}
            </span>
          </div>
          {isFuture ? (
            <div className="stub-row">
              <span>Scheduled for</span>
              <span>{new Date(activeRequest.scheduledFor).toLocaleString()}</span>
            </div>
          ) : (
            <div className="stub-row">
              <span>Requested</span>
              <span>{new Date(activeRequest.createdAt).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
        {activeRequest.status === "WAITING" && (
          <button className="btn btn-ghost" onClick={() => cancel(activeRequest.id)}>
            Cancel request
          </button>
        )}
      </>
    );
  } else {
    pickupSection = (
      <>
      {vehicles.length === 0 && (
        <div className="empty-state">
          <div className="big">No vehicles yet</div>
          Ask your building's front desk or admin to add your vehicle to your account.
        </div>
      )}

      {vehicles.map((v) => (
        <div key={v.id} className="queue-item">
          <div className="queue-num">#{v.ticketNumber}</div>
          <div className="queue-info">
            <div className="car">
              {vehicleLabel(v)}
            </div>
            <div className="meta">{v.licensePlate || "No plate on file"}</div>
          </div>
          <div className="queue-actions">
            <button className="mini-btn start" onClick={() => requestPickup(v.id)}>
              Request
            </button>
          </div>
        </div>
      ))}

      {/* Schedule-for-later toggle, applies to whichever request button is pressed next */}
      <div className="field" style={{ marginTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.checked)}
            style={{ width: "auto" }}
          />
          Schedule for later instead of right now
        </label>
        {scheduleMode && (
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            style={{ marginTop: 10 }}
            required
          />
        )}
      </div>

      <div className="stub-divider" style={{ margin: "22px 0" }}></div>

      {showTicketForm ? (
        <form onSubmit={requestByTicket}>
          <div className="hero-line" style={{ marginBottom: 10 }}>
            Requesting a visitor's car
          </div>
          <div className="field">
            <label>Ticket number</label>
            <input name="ticketNumber" placeholder="e.g. 042" required />
          </div>
          <button className="btn btn-primary" type="submit">
            Request this car
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowTicketForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowTicketForm(true)}>
          Request a visitor's car instead
        </button>
      )}
      </>
    );
  }

  const chargeSection = (
    <>
      <div className="stub-divider" style={{ margin: "26px 0" }}></div>
      <div className="hero-line">Plugged in but parked</div>
      <h1 className="title" style={{ fontSize: 22 }}>
        Request charging
      </h1>

      {activeChargeRequests.length > 0 && (
        <>
          {activeChargeRequests.map((r) => (
            <div key={r.id} className="stub" style={{ marginBottom: 12 }}>
              <div className="stub-top">
                <div>
                  <div className="stub-num-label">Ticket</div>
                  <div className="stub-num" style={{ fontSize: 28 }}>
                    {r.vehicle.ticketNumber}
                  </div>
                </div>
                <span className={`status-pill status-${r.status}`}>
                  <span className="dot"></span>
                  {CHARGE_STATUS_LABEL[r.status]}
                </span>
              </div>
              <div className="stub-divider"></div>
              <div className="stub-row">
                <span>Vehicle</span>
                <span>{vehicleLabel(r.vehicle)}</span>
              </div>
              {r.status === "WAITING" && (
                <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => cancel(r.id)}>
                  Cancel charging request
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {showChargeForm ? (
        <form onSubmit={requestChargeByTicket}>
          <div className="field">
            <label>Ticket number</label>
            <input name="ticketNumber" placeholder="e.g. 042" required />
          </div>
          <button className="btn btn-primary" type="submit">
            Request charging
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowChargeForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          {vehicles
            .filter((v) => !activeChargeRequests.some((r) => r.vehicleId === v.id))
            .map((v) => (
              <div key={v.id} className="queue-item">
                <div className="queue-num">#{v.ticketNumber}</div>
                <div className="queue-info">
                  <div className="car">{vehicleLabel(v)}</div>
                  <div className="meta">{v.licensePlate || "No plate on file"}</div>
                </div>
                <div className="queue-actions">
                  <button className="mini-btn start" onClick={() => requestCharge(v.id)}>
                    ⚡ Charge
                  </button>
                </div>
              </div>
            ))}
          <button className="btn btn-ghost" onClick={() => setShowChargeForm(true)} style={{ marginTop: 10 }}>
            Request charging by ticket number
          </button>
        </>
      )}
    </>
  );

  return (
    <>
      {pickupSection}
      {chargeSection}
    </>
  );
}

// ---------------- STAFF / ADMIN ----------------

// Generates a short, attention-getting two-tone beep using the Web Audio API.
// No audio file needed, and it works offline.
function playAlertBeep(ctx) {
  const now = ctx.currentTime;
  [880, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

function StaffView({ user, tab, setTab, vehiclesFilterBuilding, setVehiclesFilterBuilding }) {
  const [requests, setRequests] = useState([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const audioCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/requests");
    setRequests(await res.json());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  // Don't ring for requests scheduled for later — only for ones that are
  // actually due now (no scheduledFor, or a scheduledFor time that's arrived).
  const waitingCount = requests.filter(
    (r) => r.status === "WAITING" && (!r.scheduledFor || new Date(r.scheduledFor) <= new Date())
  ).length;

  // Browsers block sound until a person interacts with the page once.
  // Staff tap "Enable alerts" at the start of their shift to unlock it.
  function enableAlerts() {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    audioCtxRef.current.resume();
    setAlertsEnabled(true);
  }

  // Loop the beep every 2 seconds for as long as any request is WAITING.
  // Stops the moment staff accept it (status moves to PULLING) or it's cancelled.
  useEffect(() => {
    if (alertsEnabled && waitingCount > 0 && audioCtxRef.current) {
      if (!beepIntervalRef.current) {
        playAlertBeep(audioCtxRef.current);
        beepIntervalRef.current = setInterval(() => {
          playAlertBeep(audioCtxRef.current);
        }, 2000);
      }
    } else if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [alertsEnabled, waitingCount]);

  async function advance(id, status) {
    await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <>
      {!alertsEnabled && (
        <button
          className="btn btn-ghost"
          style={{ marginBottom: 16, borderColor: "var(--brass)", color: "var(--brass-light)" }}
          onClick={enableAlerts}
        >
          🔔 Enable sound alerts
        </button>
      )}

      {user.role === "ADMIN" && (
        <div className="tabs">
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
            Queue
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            History
          </button>
          <button className={tab === "buildings" ? "active" : ""} onClick={() => setTab("buildings")}>
            Buildings
          </button>
          <button className={tab === "vehicles" ? "active" : ""} onClick={() => setTab("vehicles")}>
            Vehicles
          </button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            Users
          </button>
        </div>
      )}

      {user.role === "MANAGER" && (
        <div className="tabs">
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
            Queue
          </button>
          <button className={tab === "vehicles" ? "active" : ""} onClick={() => setTab("vehicles")}>
            Vehicles
          </button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            Users
          </button>
        </div>
      )}

      {tab === "queue" && (
        <>
          <div className="queue-header">
            <h1 className="title" style={{ marginBottom: 2 }}>
              Pickup queue
            </h1>
            <span className="count-badge">{requests.length} waiting</span>
          </div>

          {requests.length === 0 ? (
            <div className="empty-state">
              <div className="big">Queue is clear</div>
              All caught up — no pending pickups.
            </div>
          ) : (
            requests.map((r) => {
              const isFuture = r.scheduledFor && new Date(r.scheduledFor) > new Date();
              return (
                <div key={r.id} className="queue-item">
                  <div className="queue-num">#{r.vehicle.ticketNumber}</div>
                  <div className="queue-info">
                    <div className="car">
                      {vehicleLabel(r.vehicle)}
                      {r.vehicle.isVisitor && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 10,
                            border: "1px solid var(--line)",
                            color: "var(--slate2)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Visitor
                        </span>
                      )}
                      {r.type === "CHARGE" && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 10,
                            border: "1px solid var(--brass)",
                            color: "var(--brass-light)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          ⚡ Charging
                        </span>
                      )}
                    </div>
                    <div className="meta">
                      {r.requestedBy.name}
                      {r.vehicle.building ? ` · ${r.vehicle.building.name}` : ""} ·{" "}
                      {r.type === "CHARGE" ? CHARGE_STATUS_LABEL[r.status] : STATUS_LABEL[r.status]}
                      {isFuture && (
                        <span style={{ color: "var(--brass-light)", marginLeft: 6 }}>
                          · scheduled {new Date(r.scheduledFor).toLocaleString()}
                        </span>
                      )}
                      {r.status === "WAITING" && !isFuture && alertsEnabled && (
                        <span style={{ color: "var(--brass-light)", marginLeft: 6 }}>● ringing</span>
                      )}
                    </div>
                  </div>
                  <div className="queue-actions">
                    {r.status === "WAITING" && (
                      <button className="mini-btn start" onClick={() => advance(r.id, "PULLING")}>
                        {r.type === "CHARGE" ? "Start charging" : "Start pull"}
                      </button>
                    )}
                    {r.status === "PULLING" && (
                      <button className="mini-btn ready" onClick={() => advance(r.id, "READY")}>
                        {r.type === "CHARGE" ? "Mark charged" : "Mark ready"}
                      </button>
                    )}
                    {r.status === "READY" && (
                      <button className="mini-btn done" onClick={() => advance(r.id, "COMPLETED")}>
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {tab === "history" && user.role === "ADMIN" && <HistoryView />}

      {tab === "vehicles" && (user.role === "ADMIN" || user.role === "MANAGER") && (
        <VehiclesView
          filterBuilding={vehiclesFilterBuilding}
          setFilterBuilding={setVehiclesFilterBuilding}
          currentUser={user}
        />
      )}

      {tab === "buildings" && user.role === "ADMIN" && (
        <BuildingsView
          onSelectBuilding={(name) => {
            setVehiclesFilterBuilding(name);
            setTab("vehicles");
          }}
        />
      )}

      {tab === "users" && (user.role === "ADMIN" || user.role === "MANAGER") && (
        <UserAdmin currentUser={user} />
      )}
    </>
  );
}

// ---------------- ADMIN: VEHICLES ----------------
function VehiclesView({ filterBuilding, setFilterBuilding }) {
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [vRes, uRes] = await Promise.all([fetch("/api/vehicles"), fetch("/api/admin/users")]);
    if (vRes.ok) setVehicles(await vRes.json());
    if (uRes.ok) setUsers(await uRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addVehicle(e) {
    e.preventDefault();
    setError("");
    const form = e.target;
    const body = {
      ownerId: form.ownerId.value,
      make: form.make.value,
      model: form.model.value,
      color: form.color.value,
      licensePlate: form.licensePlate.value,
      ticketNumber: form.ticketNumber.value,
    };
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    form.reset();
    setShowAddForm(false);
    load();
  }

  async function removeVehicle(id) {
    setError("");
    const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    load();
  }

  const guestUsers = users.filter((u) => u.role === "GUEST");

  const buildingNames = Array.from(
    new Set(vehicles.map((v) => v.building?.name || "Unassigned"))
  ).sort();

  const grouped = {};
  for (const v of vehicles) {
    const key = v.building?.name || "Unassigned";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  }

  const visibleGroups =
    filterBuilding === "all" ? Object.keys(grouped).sort() : [filterBuilding];

  return (
    <>
      <div className="queue-header">
        <h1 className="title" style={{ marginBottom: 2 }}>
          Registered vehicles
        </h1>
        <span className="count-badge">{vehicles.length} total</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showAddForm ? (
        <form onSubmit={addVehicle} style={{ marginBottom: 22 }}>
          <div className="field">
            <label>Owner (guest)</label>
            <select name="ownerId" required>
              <option value="" disabled>
                Select a guest...
              </option>
              {guestUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.username}){u.building ? ` · ${u.building.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Make</label>
            <input name="make" required />
          </div>
          <div className="field">
            <label>Model</label>
            <input name="model" required />
          </div>
          <div className="field">
            <label>Color</label>
            <input name="color" />
          </div>
          <div className="field">
            <label>License plate</label>
            <input name="licensePlate" />
          </div>
          <div className="field">
            <label>Ticket number</label>
            <input name="ticketNumber" required />
          </div>
          <button className="btn btn-primary" type="submit">
            Add vehicle
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowAddForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowAddForm(true)} style={{ marginBottom: 22 }}>
          + Add a vehicle for a guest
        </button>
      )}

      {buildingNames.length > 1 && (
        <div className="field">
          <label>Filter by building</label>
          <select value={filterBuilding} onChange={(e) => setFilterBuilding(e.target.value)}>
            <option value="all">All buildings</option>
            {buildingNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? null : vehicles.length === 0 ? (
        <div className="empty-state">
          <div className="big">No vehicles yet</div>
          Use "Add a vehicle for a guest" above to register the first one.
        </div>
      ) : (
        visibleGroups.map((groupName) => {
          const groupVehicles = grouped[groupName] || [];
          return (
            <div key={groupName} style={{ marginBottom: 22 }}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--brass-light)",
                  marginBottom: 8,
                  marginTop: 8,
                }}
              >
                {groupName} ({groupVehicles.length})
              </div>
              {groupVehicles.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}>
                  No vehicles registered at this building yet.
                </div>
              ) : (
                groupVehicles.map((v) => (
                  <div key={v.id} className="queue-item">
                    <div className="queue-num">#{v.ticketNumber}</div>
                    <div className="queue-info">
                      <div className="car">
                        {vehicleLabel(v)}
                        {v.isVisitor && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 10,
                              border: "1px solid var(--line)",
                              color: "var(--slate2)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            Visitor
                          </span>
                        )}
                      </div>
                      <div className="meta">
                        {v.licensePlate || "No plate on file"} · owner: {v.owner?.name} ({v.owner?.username})
                      </div>
                    </div>
                    <div className="queue-actions">
                      <button
                        className="mini-btn done"
                        onClick={() => {
                          if (window.confirm(`Remove vehicle #${v.ticketNumber}? This can't be undone.`)) {
                            removeVehicle(v.id);
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })
      )}
    </>
  );
}

// ---------------- ADMIN: BUILDINGS ----------------
function BuildingsView({ onSelectBuilding }) {
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/buildings");
    if (res.ok) setBuildings(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addBuilding(e) {
    e.preventDefault();
    setError("");
    const form = e.target;
    const body = { name: form.name.value, address: form.address.value };
    const res = await fetch("/api/admin/buildings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    form.reset();
    setShowForm(false);
    load();
  }

  async function removeBuilding(id) {
    setError("");
    const res = await fetch(`/api/admin/buildings/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    load();
  }

  return (
    <>
      <div className="queue-header">
        <h1 className="title" style={{ marginBottom: 2 }}>
          Buildings
        </h1>
        <span className="count-badge">{buildings.length} locations</span>
      </div>
      {error && <div className="error-box">{error}</div>}

      {buildings.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="big">No buildings yet</div>
          Add your first property to start assigning staff and guests to it.
        </div>
      )}

      {buildings.map((b) => (
        <div key={b.id} className="queue-item">
          <div
            className="queue-info"
            onClick={() => onSelectBuilding && onSelectBuilding(b.name)}
            style={{ cursor: onSelectBuilding ? "pointer" : "default" }}
            title="View vehicles registered at this building"
          >
            <div className="car">{b.name}</div>
            <div className="meta">
              {b.address || "No address on file"} · {b._count?.users ?? 0} accounts ·{" "}
              <span style={{ color: "var(--brass-light)", textDecoration: "underline" }}>
                {b._count?.vehicles ?? 0} vehicles
              </span>
            </div>
          </div>
          <div className="queue-actions">
            <button className="mini-btn done" onClick={() => removeBuilding(b.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <form onSubmit={addBuilding} style={{ marginTop: 18 }}>
          <div className="field">
            <label>Building name</label>
            <input name="name" placeholder="e.g. The Meridian Tower" required />
          </div>
          <div className="field">
            <label>Address (optional)</label>
            <input name="address" placeholder="123 Main St" />
          </div>
          <button className="btn btn-primary" type="submit">
            Save building
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowForm(true)} style={{ marginTop: 14 }}>
          + Add a building
        </button>
      )}
    </>
  );
}

// ---------------- ADMIN: HISTORY ----------------
function HistoryView() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const qs = params.toString();
    const res = await fetch(`/api/requests/history${qs ? `?${qs}` : ""}`);
    if (res.ok) setHistory(await res.json());
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const STATUS_BADGE = {
    COMPLETED: { label: "Completed", color: "var(--green)" },
    CANCELLED: { label: "Cancelled", color: "var(--red)" },
  };

  return (
    <>
      <div className="queue-header">
        <h1 className="title" style={{ marginBottom: 2 }}>
          Request history
        </h1>
        <span className="count-badge">{history.length} records</span>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
          <label>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {(fromDate || toDate) && (
          <button
            className="btn btn-ghost"
            style={{ width: "auto", alignSelf: "flex-end", padding: "13px 16px" }}
            onClick={() => {
              setFromDate("");
              setToDate("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? null : history.length === 0 ? (
        <div className="empty-state">
          <div className="big">No history yet</div>
          Completed and cancelled pickups will show up here.
        </div>
      ) : (
        history.map((r) => {
          const badge = STATUS_BADGE[r.status] || { label: r.status, color: "var(--slate2)" };
          return (
            <div key={r.id} className="queue-item">
              <div className="queue-num">#{r.vehicle.ticketNumber}</div>
              <div className="queue-info">
                <div className="car">
                  {vehicleLabel(r.vehicle)}
                  {r.vehicle.isVisitor && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        color: "var(--slate2)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Visitor
                    </span>
                  )}
                  {r.type === "CHARGE" && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 10,
                        border: "1px solid var(--brass)",
                        color: "var(--brass-light)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      ⚡ Charging
                    </span>
                  )}
                </div>
                <div className="meta">
                  {r.requestedBy.name}
                  {r.vehicle.building ? ` · ${r.vehicle.building.name}` : ""}
                  {r.handledBy ? ` · handled by ${r.handledBy.name}` : ""}
                  <br />
                  {new Date(r.createdAt).toLocaleString()}
                  {r.completedAt ? ` → ${new Date(r.completedAt).toLocaleTimeString()}` : ""}
                </div>
              </div>
              <span
                className="role-tag"
                style={{ color: badge.color, borderColor: badge.color, flexShrink: 0 }}
              >
                {badge.label}
              </span>
            </div>
          );
        })
      )}
    </>
  );
}

// ---------------- ADMIN / MANAGER: USERS ----------------
function UserAdmin({ currentUser }) {
  const isManager = currentUser?.role === "MANAGER";
  const [users, setUsers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState("GUEST");

  const load = useCallback(async () => {
    const requests = [fetch("/api/admin/users")];
    if (!isManager) requests.push(fetch("/api/admin/buildings"));
    const results = await Promise.all(requests);
    if (results[0].ok) setUsers(await results[0].json());
    if (!isManager && results[1]?.ok) setBuildings(await results[1].json());
  }, [isManager]);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e) {
    e.preventDefault();
    setError("");
    const form = e.target;
    const body = {
      name: form.name.value,
      username: form.username.value,
      password: form.password.value,
      role: form.role.value,
      buildingId: form.buildingId ? form.buildingId.value : null,
    };
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    form.reset();
    setShowForm(false);
    setRole("GUEST");
    load();
  }

  async function removeUser(id) {
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    load();
  }

  return (
    <>
      <div className="queue-header">
        <h1 className="title" style={{ marginBottom: 2 }}>
          {isManager ? "Guests & staff" : "Team & guests"}
        </h1>
        <span className="count-badge">{users.length} accounts</span>
      </div>
      {error && <div className="error-box">{error}</div>}

      {users.map((u) => (
        <div key={u.id} className="list-row">
          <div>
            <div>{u.name}</div>
            <div style={{ fontSize: 12, color: "var(--slate2)" }}>
              {u.username}
              {u.building ? ` · ${u.building.name}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="role-tag">{u.role}</span>
            {!isManager && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${u.name} (${u.username})? This will also permanently delete any vehicles and request history tied to this account. This can't be undone.`
                    )
                  ) {
                    removeUser(u.id);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--red)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}

      {showForm ? (
        <form onSubmit={createUser} style={{ marginTop: 18 }}>
          <div className="field">
            <label>Name</label>
            <input name="name" required />
          </div>
          <div className="field">
            <label>Username</label>
            <input name="username" type="text" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" required minLength={6} />
          </div>
          <div className="field">
            <label>Role</label>
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="GUEST">Guest</option>
              <option value="STAFF">Staff</option>
              {!isManager && <option value="MANAGER">Manager</option>}
              {!isManager && <option value="ADMIN">Admin</option>}
            </select>
          </div>
          {!isManager && role !== "ADMIN" && (
            <div className="field">
              <label>Building</label>
              <select name="buildingId" required>
                <option value="" disabled>
                  Select a building…
                </option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isManager && (
            <p style={{ fontSize: 12, color: "var(--slate2)", marginTop: -6, marginBottom: 16 }}>
              This account will automatically be assigned to your building.
            </p>
          )}
          <button className="btn btn-primary" type="submit">
            Create account
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowForm(true)} style={{ marginTop: 14 }}>
          {isManager ? "+ Add guest or staff" : "+ Add staff or admin"}
        </button>
      )}
    </>
  );
}
