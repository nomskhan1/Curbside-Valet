"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

// The guest-facing URL a QR code should point to for a given vehicle.
// Falls back gracefully if a vehicle predates claimToken (shows nothing).
function guestUrl(vehicle) {
  if (!vehicle?.claimToken) return null;
  return `${typeof window !== "undefined" ? window.location.origin : ""}/guest/${vehicle.claimToken}`;
}

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

// Show just the first name in the queue — staff don't need a guest's full
// name at a glance, and it keeps the queue line shorter.
function firstName(fullName) {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0];
}

// Visitor cars created with just a ticket number won't have make/model on
// file yet — fall back to a generic label instead of showing blank space.
function vehicleLabel(vehicle) {
  if (vehicle.make || vehicle.model) {
    return [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  }
  return "Visitor vehicle (no details on file)";
}

// Resizes/compresses a selected image file in the browser before it's sent
// to the server, so uploads stay fast and don't bloat storage. Returns a
// base64 data URL.
function resizeImageFile(file, maxDimension = 1024, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
      {vehicles.filter((v) => !v.isVisitor).length === 0 && (
        <div className="empty-state">
          <div className="big">No vehicles yet</div>
          Ask your building's front desk or admin to add your vehicle to your account.
        </div>
      )}

      {vehicles
        .filter((v) => !v.isVisitor)
        .map((v) => (
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
            .filter(
              (v) =>
                (v.fuelType === "ELECTRIC" || v.fuelType === "PLUGIN_HYBRID") &&
                !activeChargeRequests.some((r) => r.vehicleId === v.id)
            )
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
          {vehicles.length > 0 &&
            vehicles.every((v) => v.fuelType !== "ELECTRIC" && v.fuelType !== "PLUGIN_HYBRID") && (
              <p style={{ fontSize: 13, color: "var(--slate2)", marginBottom: 10 }}>
                None of your registered vehicles are marked as electric or plug-in hybrid.
              </p>
            )}
          <button className="btn btn-ghost" onClick={() => setShowChargeForm(true)} style={{ marginTop: 10 }}>
            Request charging by ticket number
          </button>
        </>
      )}
    </>
  );

  return (
    <>
      {error && <div className="error-box">{error}</div>}
      {pickupSection}
      {chargeSection}
    </>
  );
}

// ---------------- STAFF / ADMIN ----------------

// Plays the notification alert MP3.
function playAlertSound() {
  try {
    const audio = new Audio("/alert.mp3");
    audio.volume = 1.0;
    audio.play().catch(() => {});
  } catch {}
}

function StaffView({ user, tab, setTab, vehiclesFilterBuilding, setVehiclesFilterBuilding }) {
  const [requests, setRequests] = useState([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState(null);
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

  const waitingCount = requests.filter(
    (r) => r.status === "WAITING" && (!r.scheduledFor || new Date(r.scheduledFor) <= new Date())
  ).length;

  // Browsers block sound until a person interacts with the page once.
  function enableAlerts() {
    // Play a silent sound to unlock audio context on this device.
    const audio = new Audio("/alert.mp3");
    audio.volume = 0;
    audio.play().then(() => audio.pause()).catch(() => {});
    setAlertsEnabled(true);
  }

  // Play the alert every 3 seconds while any request is WAITING.
  useEffect(() => {
    if (alertsEnabled && waitingCount > 0) {
      if (!beepIntervalRef.current) {
        playAlertSound();
        beepIntervalRef.current = setInterval(() => {
          playAlertSound();
        }, 3000);
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
          <button className={tab === "carwash" ? "active" : ""} onClick={() => setTab("carwash")}>
            Car Wash
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

      {user.role === "STAFF" && (
        <div className="tabs">
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
            Queue
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            History
          </button>
          <button className={tab === "carwash" ? "active" : ""} onClick={() => setTab("carwash")}>
            Car Wash
          </button>
        </div>
      )}

      {user.role === "MANAGER" && (
        <div className="tabs">
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
            Queue
          </button>
          <button className={tab === "carwash" ? "active" : ""} onClick={() => setTab("carwash")}>
            Car Wash
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
                  {r.vehicle.photoUrl ? (
                    <img
                      src={r.vehicle.photoUrl}
                      alt=""
                      onClick={() => setZoomedPhoto(r.vehicle.photoUrl)}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 8,
                        objectFit: "cover",
                        flexShrink: 0,
                        cursor: "pointer",
                      }}
                    />
                  ) : (
                    <div className="queue-num">#{r.vehicle.ticketNumber}</div>
                  )}
                  <div className="queue-info">
                    <div className="car">
                      {r.vehicle.photoUrl && (
                        <span style={{ color: "var(--brass-light)", marginRight: 6 }}>
                          #{r.vehicle.ticketNumber}
                        </span>
                      )}
                      {vehicleLabel(r.vehicle)}
                      {r.vehicle.section && (
                        <span style={{ color: "var(--slate2)", marginLeft: 6, fontSize: 13 }}>
                          · Sec {r.vehicle.section}
                        </span>
                      )}
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
                      {firstName(r.requestedBy.name)}
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

      {tab === "history" && (user.role === "ADMIN" || user.role === "STAFF") && <HistoryView />}

      {tab === "carwash" && <CarWashView user={user} />}

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

      {zoomedPhoto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setZoomedPhoto(null)}
        >
          <img
            src={zoomedPhoto}
            alt="Vehicle"
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
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
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [fuelTypeFilter, setFuelTypeFilter] = useState("ALL");
  const [qrVehicle, setQrVehicle] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  useEffect(() => {
    if (!qrVehicle) {
      setQrDataUrl(null);
      return;
    }
    const url = guestUrl(qrVehicle);
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [qrVehicle]);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState("");
  const [editVehicleId, setEditVehicleId] = useState(null);
  const [editVehicle, setEditVehicle] = useState({});
  const [editVehicleError, setEditVehicleError] = useState("");
  const [addVehicleSuccess, setAddVehicleSuccess] = useState(false);

  const load = useCallback(async () => {
    const [vRes, uRes] = await Promise.all([fetch("/api/vehicles"), fetch("/api/admin/users")]);
    if (vRes.ok) setVehicles(await vRes.json());
    if (uRes.ok) setUsers(await uRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setPhotoUploading(true);
    try {
      const dataUrl = await resizeImageFile(file);
      setPhotoPreview(dataUrl);
      const res = await fetch("/api/vehicles/upload-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setPhotoPreview(null);
        return;
      }
      setPhotoUrl(data.url);
    } catch (err) {
      setError("Couldn't process that image. Try a different photo.");
      setPhotoPreview(null);
    } finally {
      setPhotoUploading(false);
    }
  }

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
      fuelType: form.fuelType.value,
      washDay: form.washDay.value || null,
      photoUrl: photoUrl || null,
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
    // Keep the form open with the same owner selected, just clear the
    // car-specific fields, so adding several vehicles for the same guest
    // doesn't require reopening the form and reselecting them each time.
    form.make.value = "";
    form.model.value = "";
    form.color.value = "";
    form.licensePlate.value = "";
    form.ticketNumber.value = "";
    form.fuelType.value = "GASOLINE";
    form.washDay.value = "";
    setPhotoPreview(null);
    setPhotoUrl(null);
    setAddVehicleSuccess(true);
    setTimeout(() => setAddVehicleSuccess(false), 2000);
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

  function startEditVehicle(v) {
    setEditVehicleId(v.id);
    setEditVehicle({
      make: v.make || "",
      model: v.model || "",
      color: v.color || "",
      licensePlate: v.licensePlate || "",
      ticketNumber: v.ticketNumber || "",
      fuelType: v.fuelType || "GASOLINE",
      washDay: v.washDay || "",
    });
    setEditVehicleError("");
  }

  async function saveEditVehicle(id) {
    setEditVehicleError("");
    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editVehicle),
    });
    const data = await res.json();
    if (!res.ok) {
      setEditVehicleError(data.error);
      return;
    }
    setEditVehicleId(null);
    load();
  }

  const guestUsers = users.filter((u) => u.role === "GUEST");

  const fuelFilteredVehicles = vehicles
    .filter((v) => fuelTypeFilter === "ALL" || v.fuelType === fuelTypeFilter)
    .filter((v) => {
      if (!vehicleSearchQuery) return true;
      const q = vehicleSearchQuery.toLowerCase();
      return (
        (v.licensePlate || "").toLowerCase().includes(q) ||
        (v.make || "").toLowerCase().includes(q) ||
        (v.model || "").toLowerCase().includes(q) ||
        (v.ticketNumber || "").toLowerCase().includes(q)
      );
    });

  const buildingNames = Array.from(
    new Set(fuelFilteredVehicles.map((v) => v.building?.name || "Unassigned"))
  ).sort();

  const grouped = {};
  for (const v of fuelFilteredVehicles) {
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
        <span className="count-badge">{fuelFilteredVehicles.length} total</span>
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
            <label>Vehicle type</label>
            <select name="fuelType" defaultValue="GASOLINE">
              <option value="GASOLINE">Gasoline</option>
              <option value="ELECTRIC">Electric</option>
              <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
            </select>
          </div>
          <div className="field">
            <label>Ticket number</label>
            <input name="ticketNumber" required />
          </div>
          <div className="field">
            <label>Wash day (optional)</label>
            <select name="washDay" defaultValue="">
              <option value="">Not enrolled</option>
              <option value="SUNDAY">Sunday</option>
              <option value="MONDAY">Monday</option>
              <option value="TUESDAY">Tuesday</option>
              <option value="WEDNESDAY">Wednesday</option>
              <option value="THURSDAY">Thursday</option>
              <option value="FRIDAY">Friday</option>
              <option value="SATURDAY">Saturday</option>
            </select>
          </div>
          <div className="field">
            <label>Photo (optional)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => cameraInputRef.current?.click()}
              >
                📷 Take Photo
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => galleryInputRef.current?.click()}
              >
                🖼️ Choose Photo
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              style={{ display: "none" }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              style={{ display: "none" }}
            />
            {photoUploading && (
              <p style={{ fontSize: 12, color: "var(--slate2)", marginTop: 6 }}>Uploading...</p>
            )}
            {photoPreview && !photoUploading && (
              <img
                src={photoPreview}
                alt="Vehicle preview"
                style={{ marginTop: 10, maxWidth: "100%", borderRadius: 8, maxHeight: 160 }}
              />
            )}
          </div>
          {addVehicleSuccess && (
            <p style={{ color: "var(--green)", fontSize: 13, marginBottom: 10 }}>
              Vehicle added! Add another for the same guest, or tap Done.
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={photoUploading}>
            Add vehicle
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setShowAddForm(false);
              setPhotoPreview(null);
              setPhotoUrl(null);
              setAddVehicleSuccess(false);
            }}
          >
            Done
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowAddForm(true)} style={{ marginBottom: 22 }}>
          + Add a vehicle for a guest
        </button>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Search by plate, make, or model</label>
          <input
            type="text"
            placeholder="e.g. 8XJ-201 or Tesla"
            value={vehicleSearchQuery}
            onChange={(e) => setVehicleSearchQuery(e.target.value)}
          />
        </div>
        {buildingNames.length > 1 && (
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
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
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Filter by vehicle type</label>
          <select value={fuelTypeFilter} onChange={(e) => setFuelTypeFilter(e.target.value)}>
            <option value="ALL">All types</option>
            <option value="GASOLINE">Gasoline</option>
            <option value="ELECTRIC">Electric</option>
            <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
          </select>
        </div>
      </div>

      {loading ? null : fuelFilteredVehicles.length === 0 ? (
        <div className="empty-state">
          <div className="big">No vehicles found</div>
          {vehicles.length === 0
            ? 'Use "Add a vehicle for a guest" above to register the first one.'
            : "No vehicles match this filter."}
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
                  <div key={v.id}>
                  <div className="queue-item">
                    {v.photoUrl ? (
                      <img
                        src={v.photoUrl}
                        alt=""
                        style={{ width: 46, height: 46, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <div className="queue-num">#{v.ticketNumber}</div>
                    )}
                    <div className="queue-info">
                      <div className="car">
                        {v.photoUrl && (
                          <span style={{ color: "var(--brass-light)", marginRight: 6 }}>
                            #{v.ticketNumber}
                          </span>
                        )}
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
                        {(v.fuelType === "ELECTRIC" || v.fuelType === "PLUGIN_HYBRID") && (
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
                            ⚡ {v.fuelType === "ELECTRIC" ? "Electric" : "Plug-in Hybrid"}
                          </span>
                        )}
                      </div>
                      <div className="meta">
                        {v.licensePlate || "No plate on file"} · owner: {v.owner?.name} ({v.owner?.username})
                      </div>
                    </div>
                    <div className="queue-actions">
                      <button
                        className="mini-btn start"
                        onClick={() => setQrVehicle(v)}
                        disabled={!v.claimToken}
                        title={!v.claimToken ? "This vehicle predates QR codes" : "Show guest QR code"}
                      >
                        QR
                      </button>
                      <button
                        className="mini-btn start"
                        onClick={() =>
                          editVehicleId === v.id ? setEditVehicleId(null) : startEditVehicle(v)
                        }
                      >
                        Edit
                      </button>
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

                  {editVehicleId === v.id && (
                    <div style={{ padding: "10px 0 14px", borderBottom: "1px solid var(--line)" }}>
                      {editVehicleError && <div className="error-box">{editVehicleError}</div>}
                      <div className="field">
                        <label>Make</label>
                        <input
                          value={editVehicle.make}
                          onChange={(e) => setEditVehicle({ ...editVehicle, make: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Model</label>
                        <input
                          value={editVehicle.model}
                          onChange={(e) => setEditVehicle({ ...editVehicle, model: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Color</label>
                        <input
                          value={editVehicle.color}
                          onChange={(e) => setEditVehicle({ ...editVehicle, color: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>License plate</label>
                        <input
                          value={editVehicle.licensePlate}
                          onChange={(e) => setEditVehicle({ ...editVehicle, licensePlate: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Vehicle type</label>
                        <select
                          value={editVehicle.fuelType}
                          onChange={(e) => setEditVehicle({ ...editVehicle, fuelType: e.target.value })}
                        >
                          <option value="GASOLINE">Gasoline</option>
                          <option value="ELECTRIC">Electric</option>
                          <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Ticket number</label>
                        <input
                          value={editVehicle.ticketNumber}
                          onChange={(e) => setEditVehicle({ ...editVehicle, ticketNumber: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Wash day (optional)</label>
                        <select
                          value={editVehicle.washDay}
                          onChange={(e) => setEditVehicle({ ...editVehicle, washDay: e.target.value })}
                        >
                          <option value="">Not enrolled</option>
                          <option value="SUNDAY">Sunday</option>
                          <option value="MONDAY">Monday</option>
                          <option value="TUESDAY">Tuesday</option>
                          <option value="WEDNESDAY">Wednesday</option>
                          <option value="THURSDAY">Thursday</option>
                          <option value="FRIDAY">Friday</option>
                          <option value="SATURDAY">Saturday</option>
                        </select>
                      </div>
                      <button className="mini-btn start" onClick={() => saveEditVehicle(v.id)}>
                        Save changes
                      </button>
                    </div>
                  )}
                  </div>
                ))
              )}
            </div>
          );
        })
      )}

      {qrVehicle && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setQrVehicle(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              textAlign: "center",
              maxWidth: 360,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 4px", color: "#111" }}>Ticket #{qrVehicle.ticketNumber}</h3>
            <p style={{ margin: "0 0 16px", color: "#666", fontSize: 14 }}>
              Guests scan this to request their car
            </p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Guest request QR code" style={{ width: 240, height: 240 }} />
            ) : (
              <p style={{ color: "#666" }}>Generating…</p>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="mini-btn start" onClick={() => window.print()}>
                Print
              </button>
              <button className="mini-btn done" onClick={() => setQrVehicle(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
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
// ---------------- CAR WASH ----------------
function todayLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CarWashView({ user }) {
  const isManagerOrAdmin = user.role === "ADMIN" || user.role === "MANAGER";
  const [subTab, setSubTab] = useState("today"); // "today" | "report"
  const [date, setDate] = useState(todayLocalDateString());
  const [washes, setWashes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [initialsDraft, setInitialsDraft] = useState({}); // vehicleId -> typed initials
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/washes?date=${date}`);
    const data = await res.json();
    setWashes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    if (subTab === "today") load();
  }, [subTab, load]);

  async function markComplete(vehicleId) {
    const initials = (initialsDraft[vehicleId] || "").trim();
    if (!initials) {
      setError("Enter initials before marking complete.");
      return;
    }
    setError("");
    setSavingId(vehicleId);
    const res = await fetch("/api/washes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, date, initials }),
    });
    const data = await res.json();
    setSavingId(null);
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
          Car Wash
        </h1>
      </div>

      {isManagerOrAdmin && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={subTab === "today" ? "active" : ""} onClick={() => setSubTab("today")}>
            Daily list
          </button>
          <button className={subTab === "report" ? "active" : ""} onClick={() => setSubTab("report")}>
            Report
          </button>
        </div>
      )}

      {subTab === "today" && (
        <>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {error && <div className="error-box">{error}</div>}

          {loading ? null : washes.length === 0 ? (
            <div className="empty-state">
              <div className="big">No washes scheduled</div>
              No vehicles are enrolled for this day.
            </div>
          ) : (
            washes.map((v) => (
              <div key={v.id} className="queue-item">
                <div className="queue-num">#{v.ticketNumber}</div>
                <div className="queue-info">
                  <div className="car">
                    {[v.color, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}
                    {v.section && (
                      <span style={{ color: "var(--slate2)", marginLeft: 6, fontSize: 13 }}>
                        · Sec {v.section}
                      </span>
                    )}
                  </div>
                  <div className="meta">
                    {firstName(v.owner?.name)}
                    {v.building ? ` · ${v.building.name}` : ""}
                  </div>
                </div>
                {v.completed ? (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>Done</div>
                    <div style={{ color: "var(--slate2)", fontSize: 12 }}>{v.completed.initials}</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <input
                      placeholder="Initials"
                      value={initialsDraft[v.id] || ""}
                      onChange={(e) => setInitialsDraft({ ...initialsDraft, [v.id]: e.target.value })}
                      style={{
                        width: 64,
                        background: "var(--bg-2)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        padding: "8px 6px",
                        color: "var(--ink)",
                        fontSize: 13,
                        textTransform: "uppercase",
                      }}
                      maxLength={4}
                    />
                    <button
                      className="mini-btn ready"
                      disabled={savingId === v.id}
                      onClick={() => markComplete(v.id)}
                    >
                      {savingId === v.id ? "…" : "Done"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {subTab === "report" && isManagerOrAdmin && <CarWashReportView />}
    </>
  );
}

// Prints via a hidden iframe on the same page — more reliable across
// desktop and mobile browsers than window.open() popups.
function printHtmlViaIframe(html) {
  let iframe = document.getElementById("__wash_print_iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "__wash_print_iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.onload = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  };
}

function CarWashReportView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/washes/report?${params.toString()}`);
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const tally = {};
  logs.forEach((log) => {
    const key = log.initials || "—";
    tally[key] = (tally[key] || 0) + 1;
  });
  const tallyRows = Object.entries(tally).sort((a, b) => b[1] - a[1]);

  function printReport() {
    const rangeLabel = from || to ? `${from || "…"} to ${to || "…"}` : "All dates";
    const tallyHtml = tallyRows
      .map(
        ([initials, count]) =>
          `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd;"><span>${initials}</span><span>${count} vehicle${count === 1 ? "" : "s"}</span></div>`
      )
      .join("");
    const detailHtml = logs
      .map((log) => {
        const owner = log.vehicle?.owner?.name ? log.vehicle.owner.name.split(" ")[0] : "";
        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #eee;">
          <span>#${log.vehicle?.ticketNumber || ""} — ${owner}${log.vehicle?.building ? " · " + log.vehicle.building.name : ""}</span>
          <span>${new Date(log.washDate).toLocaleDateString()} · ${log.initials}</span>
        </div>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html><head>
      <title>Car Wash Report</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 15px; margin: 20px 0 8px; }
        .sub { color: #666; font-size: 13px; margin-bottom: 20px; }
      </style>
      </head><body>
        <h1>Car Wash Report</h1>
        <div class="sub">${rangeLabel} · ${logs.length} total wash${logs.length === 1 ? "" : "es"}</div>
        <h2>By employee</h2>
        ${tallyHtml || "<p>No washes in this range.</p>"}
        <h2>Detail</h2>
        ${detailHtml || "<p>No washes in this range.</p>"}
      </body></html>`;
    printHtmlViaIframe(html);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-ghost" onClick={printReport} style={{ marginBottom: 16 }}>
        Print report
      </button>

      {!loading && tallyRows.length > 0 && (
        <div className="stub" style={{ marginBottom: 16 }}>
          <div className="stub-num-label">By employee</div>
          {tallyRows.map(([initials, count]) => (
            <div className="stub-row" key={initials}>
              <span>{initials}</span>
              <span>
                {count} vehicle{count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading ? null : logs.length === 0 ? (
        <div className="empty-state">
          <div className="big">No washes logged</div>
          Try a different date range.
        </div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="list-row">
            <span>
              #{log.vehicle?.ticketNumber} — {firstName(log.vehicle?.owner?.name)}
              {log.vehicle?.building ? ` · ${log.vehicle.building.name}` : ""}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--slate2)", fontSize: 12 }}>
                {new Date(log.washDate).toLocaleDateString()}
              </span>
              <span className="role-tag">{log.initials}</span>
            </span>
          </div>
        ))
      )}
    </>
  );
}

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
                  {r.vehicle.section && (
                    <span style={{ color: "var(--slate2)", marginLeft: 6, fontSize: 13 }}>
                      · Sec {r.vehicle.section}
                    </span>
                  )}
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
  const [addVehicleNow, setAddVehicleNow] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(null);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [editUserId, setEditUserId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editError, setEditError] = useState("");
  const [newGuestId, setNewGuestId] = useState(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestVehicleError, setNewGuestVehicleError] = useState("");
  const [newGuestVehicleSuccess, setNewGuestVehicleSuccess] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [editUserVehicleId, setEditUserVehicleId] = useState(null);
  const [editUserVehicle, setEditUserVehicle] = useState({});
  const [editUserVehicleError, setEditUserVehicleError] = useState("");
  const [showAddVehicleForUser, setShowAddVehicleForUser] = useState(false);
  const [addVehicleForUserError, setAddVehicleForUserError] = useState("");

  function startEditUser(u) {
    setEditUserId(u.id);
    setEditName(u.name);
    setEditUsername(u.username);
    setEditError("");
    setResetPasswordUserId(null);
    setShowAddVehicleForUser(false);
    setEditUserVehicleId(null);
  }

  function startEditUserVehicle(v) {
    setEditUserVehicleId(v.id);
    setEditUserVehicle({
      make: v.make || "",
      model: v.model || "",
      color: v.color || "",
      licensePlate: v.licensePlate || "",
      ticketNumber: v.ticketNumber || "",
      fuelType: v.fuelType || "GASOLINE",
    });
    setEditUserVehicleError("");
  }

  async function saveEditUserVehicle(id) {
    setEditUserVehicleError("");
    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editUserVehicle),
    });
    const data = await res.json();
    if (!res.ok) {
      setEditUserVehicleError(data.error);
      return;
    }
    setEditUserVehicleId(null);
    load();
  }

  async function removeUserVehicle(id) {
    const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setEditUserVehicleError(data.error);
      return;
    }
    load();
  }

  async function addVehicleForUser(e, userId) {
    e.preventDefault();
    setAddVehicleForUserError("");
    const form = e.target;
    const body = {
      ownerId: userId,
      make: form.make.value,
      model: form.model.value,
      color: form.color.value,
      licensePlate: form.licensePlate.value,
      ticketNumber: form.ticketNumber.value,
      fuelType: form.fuelType.value,
      washDay: form.washDay ? form.washDay.value || null : null,
    };
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddVehicleForUserError(data.error);
      return;
    }
    form.reset();
    load();
  }

  async function saveEditUser(userId) {
    setEditError("");
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, username: editUsername }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEditError(data.error);
      return;
    }
    setEditUserId(null);
    load();
  }

  async function resetPassword(userId) {
    setResetError("");
    if (!resetPasswordValue || resetPasswordValue.length < 6) {
      setResetError("New password must be at least 6 characters.");
      return;
    }
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPasswordValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      setResetError(data.error);
      return;
    }
    setResetSuccess(userId);
    setResetPasswordValue("");
    setTimeout(() => {
      setResetPasswordUserId(null);
      setResetSuccess(null);
    }, 2000);
  }

  const load = useCallback(async () => {
    const requests = [fetch("/api/admin/users"), fetch("/api/vehicles")];
    if (!isManager) requests.push(fetch("/api/admin/buildings"));
    const results = await Promise.all(requests);
    if (results[0].ok) setUsers(await results[0].json());
    if (results[1].ok) setVehicles(await results[1].json());
    if (!isManager && results[2]?.ok) setBuildings(await results[2].json());
  }, [isManager]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setPhotoUploading(true);
    try {
      const dataUrl = await resizeImageFile(file);
      setPhotoPreview(dataUrl);
      const res = await fetch("/api/vehicles/upload-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setPhotoPreview(null);
        return;
      }
      setPhotoUrl(data.url);
    } catch (err) {
      setError("Couldn't process that image. Try a different photo.");
      setPhotoPreview(null);
    } finally {
      setPhotoUploading(false);
    }
  }

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

    // If this is a guest and "add a vehicle now" was checked, register the
    // vehicle right away using the new account's id as the owner.
    if (body.role === "GUEST" && addVehicleNow) {
      const vBody = {
        ownerId: data.id,
        make: form.vehicleMake.value,
        model: form.vehicleModel.value,
        color: form.vehicleColor.value,
        licensePlate: form.vehicleLicensePlate.value,
        ticketNumber: form.vehicleTicketNumber.value,
        section: form.vehicleSection ? form.vehicleSection.value : "",
        washDay: form.vehicleWashDay ? form.vehicleWashDay.value || null : null,
        fuelType: form.vehicleFuelType.value,
        photoUrl: photoUrl || null,
      };
      const vRes = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vBody),
      });
      if (!vRes.ok) {
        const vData = await vRes.json();
        setError(
          `Account created, but the vehicle couldn't be added: ${vData.error}. You can add it from the Vehicles tab instead.`
        );
        setShowForm(false);
        setRole("GUEST");
        setAddVehicleNow(false);
        setPhotoPreview(null);
        setPhotoUrl(null);
        load();
        return;
      }
    }

    form.reset();
    setShowForm(false);
    setRole("GUEST");
    setAddVehicleNow(false);
    setPhotoPreview(null);
    setPhotoUrl(null);

    // For a new guest, offer to keep adding more vehicles for them right
    // away instead of having to go find them again in the Vehicles tab.
    if (body.role === "GUEST") {
      setNewGuestId(data.id);
      setNewGuestName(body.name);
    }

    load();
  }

  async function addAnotherVehicleForNewGuest(e) {
    e.preventDefault();
    setNewGuestVehicleError("");
    const form = e.target;
    const vBody = {
      ownerId: newGuestId,
      make: form.make.value,
      model: form.model.value,
      color: form.color.value,
      licensePlate: form.licensePlate.value,
      ticketNumber: form.ticketNumber.value,
      section: form.section ? form.section.value : "",
      fuelType: form.fuelType.value,
    };
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vBody),
    });
    const data = await res.json();
    if (!res.ok) {
      setNewGuestVehicleError(data.error);
      return;
    }
    form.reset();
    setNewGuestVehicleSuccess(true);
    setTimeout(() => setNewGuestVehicleSuccess(false), 2000);
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Search by name</label>
          <input
            type="text"
            placeholder="e.g. Jordan Park"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Filter by role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="ALL">All roles</option>
            <option value="GUEST">Monthly parker</option>
            <option value="STAFF">Staff</option>
            {!isManager && <option value="MANAGER">Manager</option>}
            {!isManager && <option value="ADMIN">Admin</option>}
          </select>
        </div>
      </div>

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
              <option value="GUEST">Monthly parker</option>
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

          {role === "GUEST" && (
            <div className="field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={addVehicleNow}
                  onChange={(e) => setAddVehicleNow(e.target.checked)}
                  style={{ width: "auto" }}
                />
                Add a vehicle for this guest now
              </label>
            </div>
          )}

          {role === "GUEST" && addVehicleNow && (
            <>
              <div className="stub-divider" style={{ margin: "16px 0" }}></div>
              <div className="field">
                <label>Make</label>
                <input name="vehicleMake" required />
              </div>
              <div className="field">
                <label>Model</label>
                <input name="vehicleModel" required />
              </div>
              <div className="field">
                <label>Color</label>
                <input name="vehicleColor" />
              </div>
              <div className="field">
                <label>License plate</label>
                <input name="vehicleLicensePlate" />
              </div>
              <div className="field">
                <label>Vehicle type</label>
                <select name="vehicleFuelType" defaultValue="GASOLINE">
                  <option value="GASOLINE">Gasoline</option>
                  <option value="ELECTRIC">Electric</option>
                  <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
                </select>
              </div>
              <div className="field">
                <label>Decal number</label>
                <input name="vehicleTicketNumber" required />
              </div>
              <div className="field">
                <label>Section</label>
                <input name="vehicleSection" />
              </div>
              <div className="field">
                <label>Wash day (optional)</label>
                <select name="vehicleWashDay" defaultValue="">
                  <option value="">Not enrolled</option>
                  <option value="SUNDAY">Sunday</option>
                  <option value="MONDAY">Monday</option>
                  <option value="TUESDAY">Tuesday</option>
                  <option value="WEDNESDAY">Wednesday</option>
                  <option value="THURSDAY">Thursday</option>
                  <option value="FRIDAY">Friday</option>
                  <option value="SATURDAY">Saturday</option>
                </select>
              </div>
              <div className="field">
                <label>Photo (optional)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    📷 Take Photo
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    🖼️ Choose Photo
                  </button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  style={{ display: "none" }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  style={{ display: "none" }}
                />
                {photoUploading && (
                  <p style={{ fontSize: 12, color: "var(--slate2)", marginTop: 6 }}>Uploading...</p>
                )}
                {photoPreview && !photoUploading && (
                  <img
                    src={photoPreview}
                    alt="Vehicle preview"
                    style={{ marginTop: 10, maxWidth: "100%", borderRadius: 8, maxHeight: 160 }}
                  />
                )}
              </div>
              <div className="stub-divider" style={{ margin: "16px 0" }}></div>
            </>
          )}

          <button className="btn btn-primary" type="submit" disabled={photoUploading}>
            Create account
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setShowForm(false);
              setAddVehicleNow(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowForm(true)} style={{ marginTop: 14 }}>
          {isManager ? "+ Add guest or staff" : "+ Add staff or admin"}
        </button>
      )}

      {users
        .filter((u) => roleFilter === "ALL" || u.role === roleFilter)
        .filter(
          (u) =>
            !searchQuery ||
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.username.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .map((u) => (
        <div key={u.id} style={{ marginBottom: resetPasswordUserId === u.id ? 4 : 0 }}>
          <div className="list-row">
            <div>
              <div>{u.name}</div>
              <div style={{ fontSize: 12, color: "var(--slate2)" }}>
                {u.username}
                {u.building ? ` · ${u.building.name}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="role-tag">{u.role}</span>
              {(!isManager || ["GUEST", "STAFF"].includes(u.role)) && (
                <button
                  onClick={() => (editUserId === u.id ? setEditUserId(null) : startEditUser(u))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--brass-light)",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Edit
                </button>
              )}
              {(!isManager || ["GUEST", "STAFF"].includes(u.role)) && (
                <button
                  onClick={() => {
                    setResetPasswordUserId(resetPasswordUserId === u.id ? null : u.id);
                    setResetPasswordValue("");
                    setResetError("");
                    setResetSuccess(null);
                    setEditUserId(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--brass-light)",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Reset password
                </button>
              )}
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

          {editUserId === u.id && (
            <div style={{ padding: "10px 0 14px", borderBottom: "1px solid var(--line)" }}>
              {editError && <div className="error-box">{editError}</div>}
              <div className="field">
                <label>Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="field">
                <label>Username</label>
                <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
              </div>
              <button className="mini-btn start" onClick={() => saveEditUser(u.id)}>
                Save changes
              </button>

              {u.role === "GUEST" && (
                <div style={{ marginTop: 18 }}>
                  <div className="stub-divider" style={{ margin: "14px 0" }}></div>
                  <div
                    style={{
                      fontSize: 12,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--brass-light)",
                      marginBottom: 10,
                    }}
                  >
                    Vehicles
                  </div>

                  {editUserVehicleError && <div className="error-box">{editUserVehicleError}</div>}

                  {vehicles.filter((v) => v.ownerId === u.id).length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--slate2)", marginBottom: 10 }}>
                      No vehicles on file yet.
                    </p>
                  )}

                  {vehicles
                    .filter((v) => v.ownerId === u.id)
                    .map((v) => (
                      <div key={v.id} style={{ marginBottom: 8 }}>
                        <div className="queue-item">
                          <div className="queue-num">#{v.ticketNumber}</div>
                          <div className="queue-info">
                            <div className="car">{vehicleLabel(v)}</div>
                            <div className="meta">{v.licensePlate || "No plate on file"}</div>
                          </div>
                          <div className="queue-actions">
                            <button
                              className="mini-btn start"
                              onClick={() =>
                                editUserVehicleId === v.id
                                  ? setEditUserVehicleId(null)
                                  : startEditUserVehicle(v)
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="mini-btn done"
                              onClick={() => {
                                if (window.confirm(`Remove vehicle #${v.ticketNumber}?`)) {
                                  removeUserVehicle(v.id);
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        {editUserVehicleId === v.id && (
                          <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                            <div className="field">
                              <label>Make</label>
                              <input
                                value={editUserVehicle.make}
                                onChange={(e) =>
                                  setEditUserVehicle({ ...editUserVehicle, make: e.target.value })
                                }
                              />
                            </div>
                            <div className="field">
                              <label>Model</label>
                              <input
                                value={editUserVehicle.model}
                                onChange={(e) =>
                                  setEditUserVehicle({ ...editUserVehicle, model: e.target.value })
                                }
                              />
                            </div>
                            <div className="field">
                              <label>Color</label>
                              <input
                                value={editUserVehicle.color}
                                onChange={(e) =>
                                  setEditUserVehicle({ ...editUserVehicle, color: e.target.value })
                                }
                              />
                            </div>
                            <div className="field">
                              <label>License plate</label>
                              <input
                                value={editUserVehicle.licensePlate}
                                onChange={(e) =>
                                  setEditUserVehicle({ ...editUserVehicle, licensePlate: e.target.value })
                                }
                              />
                            </div>
                            <div className="field">
                              <label>Vehicle type</label>
                              <select
                                value={editUserVehicle.fuelType}
                                onChange={(e) =>
                                  setEditUserVehicle({ ...editUserVehicle, fuelType: e.target.value })
                                }
                              >
                                <option value="GASOLINE">Gasoline</option>
                                <option value="ELECTRIC">Electric</option>
                                <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
                              </select>
                            </div>
                            <div className="field">
                              <label>Ticket number</label>
                              <input
                                value={editUserVehicle.ticketNumber}
                                onChange={(e) =>
                                  setEditUserVehicle({ ...editUserVehicle, ticketNumber: e.target.value })
                                }
                              />
                            </div>
                            <button className="mini-btn start" onClick={() => saveEditUserVehicle(v.id)}>
                              Save changes
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                  {showAddVehicleForUser ? (
                    <form onSubmit={(e) => addVehicleForUser(e, u.id)} style={{ marginTop: 10 }}>
                      {addVehicleForUserError && <div className="error-box">{addVehicleForUserError}</div>}
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
                        <label>Vehicle type</label>
                        <select name="fuelType" defaultValue="GASOLINE">
                          <option value="GASOLINE">Gasoline</option>
                          <option value="ELECTRIC">Electric</option>
                          <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Ticket number</label>
                        <input name="ticketNumber" required />
                      </div>
                      <div className="field">
                        <label>Wash day (optional)</label>
                        <select name="washDay" defaultValue="">
                          <option value="">Not enrolled</option>
                          <option value="SUNDAY">Sunday</option>
                          <option value="MONDAY">Monday</option>
                          <option value="TUESDAY">Tuesday</option>
                          <option value="WEDNESDAY">Wednesday</option>
                          <option value="THURSDAY">Thursday</option>
                          <option value="FRIDAY">Friday</option>
                          <option value="SATURDAY">Saturday</option>
                        </select>
                      </div>
                      <button className="btn btn-primary" type="submit">
                        Add vehicle
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setShowAddVehicleForUser(false)}
                      >
                        Done
                      </button>
                    </form>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setShowAddVehicleForUser(true)}
                      style={{ marginTop: 4 }}
                    >
                      + Add a vehicle
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {resetPasswordUserId === u.id && (
            <div style={{ padding: "10px 0 14px", borderBottom: "1px solid var(--line)" }}>
              {resetSuccess === u.id ? (
                <p style={{ color: "var(--green)", fontSize: 13 }}>Password updated.</p>
              ) : (
                <>
                  {resetError && <div className="error-box">{resetError}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="password"
                      placeholder="New password"
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      style={{ flex: 1 }}
                      minLength={6}
                    />
                    <button
                      className="mini-btn start"
                      style={{ flexShrink: 0 }}
                      onClick={() => resetPassword(u.id)}
                    >
                      Save
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {newGuestId && (
        <div className="stub" style={{ marginTop: 18 }}>
          <div className="stub-top">
            <h1 className="title" style={{ marginBottom: 0, fontSize: 18 }}>
              Add another vehicle for {newGuestName}?
            </h1>
            <button
              onClick={() => setNewGuestId(null)}
              style={{ background: "none", border: "none", color: "var(--slate2)", cursor: "pointer", fontSize: 13 }}
            >
              Close
            </button>
          </div>
          {newGuestVehicleError && <div className="error-box">{newGuestVehicleError}</div>}
          {newGuestVehicleSuccess && (
            <p style={{ color: "var(--green)", fontSize: 13 }}>Vehicle added! Add another, or tap Done.</p>
          )}
          <form onSubmit={addAnotherVehicleForNewGuest}>
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
              <label>Vehicle type</label>
              <select name="fuelType" defaultValue="GASOLINE">
                <option value="GASOLINE">Gasoline</option>
                <option value="ELECTRIC">Electric</option>
                <option value="PLUGIN_HYBRID">Plug-in Hybrid</option>
              </select>
            </div>
            <div className="field">
              <label>Decal number</label>
              <input name="ticketNumber" required />
            </div>
            <div className="field">
              <label>Section</label>
              <input name="section" />
            </div>
            <button className="btn btn-primary" type="submit">
              Add vehicle
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setNewGuestId(null)}>
              Done
            </button>
          </form>
        </div>
      )}
    </>
  );
}
