"use client";
import { useEffect, useState, useCallback } from "react";
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
function StaffView({ user, tab, setTab }) {
  const [requests, setRequests] = useState([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/requests");
    setRequests(await res.json());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

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
      {user.role === "ADMIN" && (
        <div className="tabs">
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
            Queue
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
                    {r.requestedBy.name} · {STATUS_LABEL[r.status]}
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

      {tab === "users" && user.role === "ADMIN" && <UserAdmin />}
    </>
  );
}

// ---------------- ADMIN: USERS ----------------
function UserAdmin() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
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
            <div style={{ fontSize: 12, color: "var(--slate2)" }}>{u.email}</div>
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
            <select name="role" defaultValue="STAFF">
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
              <option value="GUEST">Guest</option>
            </select>
          </div>
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
