import Link from "next/link";

// Accounts are created by each building's management (one at a time or by
// importing a parker list), so there's no public sign-up form.
export default function RegisterPage() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="" className="logo" />
          <span className="mark">Bring My Car</span>
        </div>
      </header>
      <main>
        <div className="hero-line">New to Bring My Car?</div>
        <h1 className="title">Ask your building for a login</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 520 }}>
          Accounts are set up by your building&apos;s management or valet office. Ask them for your
          username and temporary password, then sign in.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 520 }}>
          Visiting someone? Scan the QR code your valet gives you to request your car. No account
          needed.
        </p>
        <p style={{ marginTop: 18 }}>
          <Link className="btn btn-primary" href="/login" style={{ display: "inline-block", textDecoration: "none" }}>
            Go to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
