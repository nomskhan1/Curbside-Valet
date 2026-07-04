"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function GuestRequestPage() {
  const { token } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/guest/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        setVehicle(data.vehicle);
        setActiveRequest(data.activeRequest);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleRequest() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/guest/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Centered>Loading your ticket…</Centered>;
  }

  if (error && !vehicle) {
    return <Centered>{error}</Centered>;
  }

  return (
    <Centered>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
        {vehicle.building || "Valet"}
      </h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Ticket #{vehicle.ticketNumber}</p>

      <div
        style={{
          background: "#f5f5f5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          textAlign: "left",
        }}
      >
        {vehicle.make || vehicle.model ? (
          <p style={{ margin: 0 }}>
            {[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
          </p>
        ) : (
          <p style={{ margin: 0, color: "#666" }}>Vehicle on file</p>
        )}
        {vehicle.licensePlate && (
          <p style={{ margin: "4px 0 0", color: "#666" }}>{vehicle.licensePlate}</p>
        )}
      </div>

      {submitted || activeRequest ? (
        <div>
          <p style={{ fontSize: 18, fontWeight: 600 }}>
            {activeRequest?.status === "READY"
              ? "Your car is ready!"
              : activeRequest?.status === "PULLING"
              ? "Your car is on its way."
              : "Request received — sit tight."}
          </p>
          <p style={{ color: "#666" }}>Staff have been notified.</p>
        </div>
      ) : (
        <button
          onClick={handleRequest}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "14px 0",
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
            background: submitting ? "#999" : "#111",
            border: "none",
            borderRadius: 10,
            cursor: submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Requesting…" : "Request my car"}
        </button>
      )}

      {error && <p style={{ color: "#c00", marginTop: 12 }}>{error}</p>}
    </Centered>
  );
}

function Centered({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        textAlign: "center",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}
