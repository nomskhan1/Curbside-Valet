"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
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
          <span className="mark">Curbside</span>
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
              minLength={6}
            />
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
