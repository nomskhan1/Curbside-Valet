"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Couldn't sign in.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">Curbside</span>
          <span className="sub">Valet</span>
        </div>
      </header>
      <main>
        <div className="hero-line">Welcome back</div>
        <h1 className="title">Sign in</h1>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--slate2)", marginTop: 18 }}>
          New here? <Link href="/register">Create a guest account</Link>
        </p>
        <p style={{ fontSize: 12, color: "var(--slate2)", marginTop: 30, lineHeight: 1.6 }}>
          Demo accounts (after seeding):<br />
          admin@curbside.app / admin123<br />
          staff@curbside.app / staff123<br />
          guest@curbside.app / guest123
        </p>
      </main>
    </div>
  );
}
