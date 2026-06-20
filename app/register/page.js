"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then(setBuildings);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password, buildingId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Couldn't create account.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="" className="logo" />
          <span className="mark">Integral</span>
          <span className="sub">Valet</span>
        </div>
      </header>
      <main>
        <div className="hero-line">First time here?</div>
        <h1 className="title">Create your account</h1>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="field">
            <label htmlFor="building">Building</label>
            <select
              id="building"
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select your building…
              </option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--slate2)", marginTop: 18 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </main>
    </div>
  );
}

