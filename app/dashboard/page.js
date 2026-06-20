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

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [tab, setTab] = useState("queue"); // staff/admin: "queue" | "users" (admin only)

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
          <span className="mark">Curbside</span>
          <span className="sub">{user.role}</span>
        </div>
        <button className="btn-ghost" style={{ width: "auto", padding: "8px 14px", borderRadius: 20, fontSize: 11 }} onClick={logout}>
          Sign out
        </button>
      </header>
      <main>
        {user.role === "GUEST" && <GuestView user={user} />}
        {(user.role === "STAFF" || user.role === "ADMIN") && (
          <StaffView user={user} tab={tab} setTab={setTab} />
        )}
      </main>
      <footer className="note">Signed in as {user.name} ({user.email})</footer>
    </div>
  );
}

// ---------------- GUEST ----------------
function GuestView({ user }) {
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);

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

  const activeRequest = requests.find((r) => ["WAITING", "PULLING", "READY"].includes(r.status));

  async function addVehicle(e) {
    e.preventDefault();
    setError("");
    const form = e.target;
    const body = {
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
    setShowAddVehicle(false);
    load();
  }

  async function requestPickup(vehicleId) {
    setError("");
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, etaMinutes: 0 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    load();
  }

  async function cancel(requestId) {
    await fetch(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    load();
  }

  if (activeRequest) {
    return (
      <>
        <div className="hero-line">Ticket received</div>
        <h1 className="title">We're on it</h1>
        <div className="stub">
          <div className="stub-top">
            <div>
              <div className="stub-num-label">Ticket</div>
              <div className="stub-num">{activeRequest.vehicle.ticketNumber}</div>
            </div>
            <span className={`status-pill status-${activeRequest.status}`}>
              <span className="dot"></span>
              {STATUS_LABEL[activeRequest.status]}
            </span>
          </div>
          <div className="stub-divider"></div>
          <div className="stub-row">
            <span>Vehicle</span>
            <span>
              {activeRequest.vehicle.color} {activeRequest.vehicle.make} {activeRequest.vehicle.model}
            </span>
          </div>
          <div className="stub-row">
            <span>Requested</span>
            <span>{new Date(activeRequest.createdAt).toLocaleTimeString()}</span>
          </div>
        </div>
        {activeRequest.status === "WAITING" && (
          <button className="btn btn-ghost" onClick={() => cancel(activeRequest.id)}>
            Cancel request
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="hero-line">Heading out?</div>
      <h1 className="title">Request your car</h1>
      {error && <div className="error-box">{error}</div>}

      {vehicles.length === 0 && !showAddVehicle && (
        <div className="empty-state">
          <div className="big">No vehicles yet</div>
          Add your car's ticket details to request a pickup.
        </div>
      )}

      {vehicles.map((v) => (
        <div key={v.id} className="queue-item">
          <div className="queue-num">#{v.ticketNumber}</div>
          <div className="queue-info">
            <div className="car">
              {v.color} {v.make} {v.model}
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

      {showAddVehicle ? (
        <form onSubmit={addVehicle} style={{ marginTop: 18 }}>
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
            Save vehicle
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowAddVehicle(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowAddVehicle(true)} style={{ marginTop: 14 }}>
          + Add a vehicle
        </button>
      )}
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

function StaffView({ user, tab, setTab }) {
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

  const waitingCount = requests.filter((r) => r.status === "WAITING").length;

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
            requests.map((r) => (
              <div key={r.id} className="queue-item">
                <div className="queue-num">#{r.vehicle.ticketNumber}</div>
                <div className="queue-info">
                  <div className="car">
                    {r.vehicle.color} {r.vehicle.make} {r.vehicle.model}
                  </div>
                  <div className="meta">
                    {r.requestedBy.name}
                    {r.vehicle.building ? ` · ${r.vehicle.building.name}` : ""} · {STATUS_LABEL[r.status]}
                    {r.status === "WAITING" && alertsEnabled && (
                      <span style={{ color: "var(--brass-light)", marginLeft: 6 }}>● ringing</span>
                    )}
                  </div>
                </div>
                <div className="queue-actions">
                  {r.status === "WAITING" && (
                    <button className="mini-btn start" onClick={() => advance(r.id, "PULLING")}>
                      Start pull
                    </button>
                  )}
                  {r.status === "PULLING" && (
                    <button className="mini-btn ready" onClick={() => advance(r.id, "READY")}>
                      Mark ready
                    </button>
                  )}
                  {r.status === "READY" && (
                    <button className="mini-btn done" onClick={() => advance(r.id, "COMPLETED")}>
                      Complete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {tab === "history" && user.role === "ADMIN" && <HistoryView />}

      {tab === "buildings" && user.role === "ADMIN" && <BuildingsView />}

      {tab === "users" && user.role === "ADMIN" && <UserAdmin />}
    </>
  );
}

// ---------------- ADMIN: BUILDINGS ----------------
function BuildingsView() {
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
          <div className="queue-info">
            <div className="car">{b.name}</div>
            <div className="meta">
              {b.address || "No address on file"} · {b._count?.users ?? 0} accounts · {b._count?.vehicles ?? 0} vehicles
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

  const load = useCallback(async () => {
    const res = await fetch("/api/requests/history");
    if (res.ok) setHistory(await res.json());
    setLoading(false);
  }, []);

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
                  {r.vehicle.color} {r.vehicle.make} {r.vehicle.model}
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

// ---------------- ADMIN: USERS ----------------
function UserAdmin() {
  const [users, setUsers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState("STAFF");

  const load = useCallback(async () => {
    const [uRes, bRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/buildings"),
    ]);
    if (uRes.ok) setUsers(await uRes.json());
    if (bRes.ok) setBuildings(await bRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e) {
    e.preventDefault();
    setError("");
    const form = e.target;
    const body = {
      name: form.name.value,
      email: form.email.value,
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
    setRole("STAFF");
    load();
  }

  return (
    <>
      <div className="queue-header">
        <h1 className="title" style={{ marginBottom: 2 }}>
          Team & guests
        </h1>
        <span className="count-badge">{users.length} accounts</span>
      </div>
      {error && <div className="error-box">{error}</div>}

      {users.map((u) => (
        <div key={u.id} className="list-row">
          <div>
            <div>{u.name}</div>
            <div style={{ fontSize: 12, color: "var(--slate2)" }}>
              {u.email}
              {u.building ? ` · ${u.building.name}` : ""}
            </div>
          </div>
          <span className="role-tag">{u.role}</span>
        </div>
      ))}

      {showForm ? (
        <form onSubmit={createUser} style={{ marginTop: 18 }}>
          <div className="field">
            <label>Name</label>
            <input name="name" required />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" required minLength={6} />
          </div>
          <div className="field">
            <label>Role</label>
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
              <option value="GUEST">Guest</option>
            </select>
          </div>
          {role !== "ADMIN" && (
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
          <button className="btn btn-primary" type="submit">
            Create account
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowForm(true)} style={{ marginTop: 14 }}>
          + Add staff or admin
        </button>
      )}
    </>
  );
}
