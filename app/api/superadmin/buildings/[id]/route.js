import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(req, { params }) {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id } = params;

  try {
    // Delete all related data first
    await prisma.request.deleteMany({ where: { vehicle: { user: { buildingId: id } } } });
    await prisma.vehicle.deleteMany({ where: { user: { buildingId: id } } });
    await prisma.user.deleteMany({ where: { buildingId: id } });
    await prisma.building.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete building error:", err);
    return NextResponse.json({ error: "Failed to delete garage. " + err.message }, { status: 500 });
  }
}
