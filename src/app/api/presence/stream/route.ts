import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/session";
import { resolveBoard } from "@/lib/notes";
import {
  subscribePresence,
  unsubscribePresence,
  type PresenceEditor,
} from "@/lib/presence-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeSse(
  encoder: TextEncoder,
  event: string,
  data: unknown,
): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  const boardParam = request.nextUrl.searchParams.get("board");
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim();
  if (!clientId || clientId.length > 80) {
    return new Response(JSON.stringify({ error: "clientId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const board = await resolveBoard(boardParam, user.id);
  if (board.type === "private" && board.ownerUserId !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let subId: string | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encodeSse(encoder, event, data));
        } catch {
          cleanup();
        }
      };

      const { subId: id, snapshot } = subscribePresence(
        board.id,
        user.id,
        clientId,
        (payload) => send(payload.event, payload.data),
      );
      subId = id;
      send("presence.snapshot", { editors: snapshot as PresenceEditor[] });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      const onAbort = () => cleanup();
      request.signal.addEventListener("abort", onAbort);

      function cleanup() {
        if (closed) return;
        closed = true;
        request.signal.removeEventListener("abort", onAbort);
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (subId) {
          unsubscribePresence(board.id, subId);
          subId = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (subId) {
        unsubscribePresence(board.id, subId);
        subId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
