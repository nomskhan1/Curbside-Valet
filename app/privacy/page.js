export const metadata = {
  title: "Privacy Policy - Integral Valet",
};

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px", lineHeight: 1.7 }}>
      <h1 style={{ fontFamily: "Oswald, sans-serif" }}>Privacy Policy</h1>
      <p style={{ color: "#6B7280", fontSize: 14 }}>Last updated: January 2026</p>

      <p>
        Integral Valet (the App) is a valet vehicle request system used by residents, staff,
        and administrators of participating buildings. This policy explains what information the
        App collects and how it is used.
      </p>

      <h2>Information we collect</h2>
      <p>When you use Integral Valet, we collect:</p>
      <ul>
        <li>Your name and a username you choose</li>
        <li>A securely hashed password (we never store your actual password in readable form)</li>
        <li>Vehicle information you provide (make, model, color, license plate, ticket number)</li>
        <li>Which building your account is associated with</li>
        <li>Pickup request activity (timestamps, status, which staff member handled a request)</li>
      </ul>

      <h2>How we use this information</h2>
      <p>
        This information is used solely to operate the valet request service: matching guests to
        their vehicles, routing requests to the correct building's staff, and maintaining a record
        of pickup activity for that building's management.
      </p>

      <h2>What we don't do</h2>
      <ul>
        <li>We do not sell or share your information with advertisers or third parties.</li>
        <li>We do not display ads in the App.</li>
        <li>We do not track you outside of the App.</li>
      </ul>

      <h2>Data storage</h2>
      <p>
        Data is stored in a secured database and is only accessible to authorized staff and
        administrators of the building you are associated with, and to system administrators for
        maintenance purposes.
      </p>

      <h2>Data retention</h2>
      <p>
        Account and request information is retained for as long as your account is active, or as
        needed for the building's operational records. You can request removal of your account by
        contacting your building's management.
      </p>

      <h2>Children's privacy</h2>
      <p>This App is not directed at children and is not intended for use by anyone under 18.</p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes, the updated version will be posted at this same address with a new
        Last updated date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data can be directed to your building's management
        office.
      </p>
    </div>
  );
}