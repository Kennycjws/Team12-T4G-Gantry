import { publish } from "@/lib/reader-bus";

// Called by bridge/reader.mjs, and by the dev panel in place of a real reader.
export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === "removed") {
    publish({ type: "removed" });
    return Response.json({ ok: true });
  }

  const uid = String(body.uid ?? "").toUpperCase();
  if (body.type !== "present" || !/^[0-9A-F]{4,32}$/.test(uid)) {
    return Response.json({ error: "Invalid tap" }, { status: 400 });
  }
  publish({ type: "present", uid });
  return Response.json({ ok: true });
}
