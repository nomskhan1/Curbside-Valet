export const metadata = {
  title: "Delete Your Account - Integral Valet",
};

export default function DeleteAccount() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px", lineHeight: 1.7 }}>
      <h1 style={{ fontFamily: "Oswald, sans-serif" }}>Delete Your Account</h1>

      <p>
        If you would like your Integral Valet account and associated data deleted, you can
        request this in either of the following ways:
      </p>

      <h2>Option 1: Contact your building</h2>
      <p>
        Reach out to your building's front desk, property manager, or valet staff and ask
        them to remove your account. They can do this directly from the admin dashboard.
      </p>

      <h2>Option 2: Contact us directly</h2>
      <p>
        Email your building name and the username on your account to:
        <br />
        <strong>support@integralvalet.app</strong>
      </p>

      <h2>What gets deleted</h2>
      <p>When an account is removed, the following are permanently deleted:</p>
      <ul>
        <li>Your name and username</li>
        <li>Any vehicles registered under your account</li>
        <li>Your pickup and charging request history</li>
      </ul>

      <h2>Timeframe</h2>
      <p>
        Account deletion requests are typically processed within a few business days of being
        received by your building's management.
      </p>
    </div>
  );
}
