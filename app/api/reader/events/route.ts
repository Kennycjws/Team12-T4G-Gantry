import { subscribe } from "@/lib/reader-bus";

export const dynamic = "force-dynamic";

// Server-sent events: pushes card taps to the browser.
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      const unsubscribe = subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), 15000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
