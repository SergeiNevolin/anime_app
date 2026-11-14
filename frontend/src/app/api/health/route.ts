import { NextResponse } from "next/server";

/** Health endpoint used by the container health check. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
