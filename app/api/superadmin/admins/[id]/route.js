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
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete admin error:", err);
    return NextResponse.json({ error: "Failed to delete admin. " + err.message }, { status: 500 });
  }
}
