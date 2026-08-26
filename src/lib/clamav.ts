import { connect as netConnect } from "node:net";
import { throttledError } from "./redis";

/**
 * ClamAV `INSTREAM` client (Story 3.7b — FR32a) — zero dependencies, over
 * `node:net`. The architecture reserved this as `lib/clamav`; Story 3.7b builds
 * it and runs it SYNCHRONOUSLY inside `POST /api/rfq` (Task 0 #1).
 *
 * WHY IN-HANDLER AND NOT A WORKER. The epics justified a worker by asserting
 * that "a ClamAV INSTREAM of a 15 MB file inside the POST handler would block
 * the immediate on-screen confirmation". That premise was MEASURED FALSE
 * against the live container (ClamAV 1.5.3/28104): a 15 MB stream answers in
 * 502 ms cold / 148 ms warm, EICAR in 54 ms, 1 KB in 13 ms. With the 3.7a
 * limiter sitting at guard 2.5 — BEFORE the body is read — at most 5 bodies per
 * client-hour ever reach this code.
 *
 * ⚠️ THE REAL RISK IS SCAN TIME, NOT BYTE COUNT, AND IT IS WHY THE DEADLINE
 * BELOW IS NOT OPTIONAL (Task 0 #3). `clamconf` on the live container reports
 * `ScanArchive = yes` with **`MaxScanTime disabled`**, `MaxRecursion 17`,
 * `MaxFiles 10000`. XLSX *is* a ZIP, so an accepted attachment takes the
 * archive path, and the 502 ms figure above was measured on incompressible flat
 * bytes that exercised none of it. A crafted archive therefore has NO
 * clamd-side wall-clock bound at all. A per-connection deadline on OUR side is
 * what turns that unbounded server-side work into a bounded client-side wait:
 * on expiry the socket is destroyed and the result is `failed`, which the route
 * turns into a rejection — never a stored, unscanned file.
 *
 * THE PROTOCOL (clamd, `zINSTREAM`): send `zINSTREAM\0`, then a sequence of
 * chunks each prefixed with its length as a 4-byte big-endian integer, then a
 * zero-length chunk as the terminator. clamd answers one NUL-terminated line:
 * `stream: OK`, `stream: <signature> FOUND`, or `... ERROR`. `StreamMaxLength`
 * on this image is the compiled default **104857600 (100 MB)** — the directive
 * is commented out in the shipped config, so the 25 M the sample suggests never
 * applies. That is 6.7× headroom over our 15 MB ceiling (the epics' "verify
 * StreamMaxLength" instruction is hereby discharged).
 *
 * IMPORT-INERT, like `lib/redis` and `lib/storage`: no socket and no env read
 * at module scope. The DB-free build imports the RFQ route with every backing
 * service blanked and must stay green.
 */

/** Task 0 #3's recommendation. Generous for a clean 15 MB, fatal to a zip bomb. */
export const SCAN_DEADLINE_MS = 20_000;

/** clamd accepts arbitrary chunk sizes; 64 KB keeps per-chunk overhead trivial
 *  without ever building a second full-size copy of the attachment. */
const CHUNK_BYTES = 64 * 1024;

/**
 * The terminal states this client can report. They map 1:1 onto three of the
 * four `AttachmentScanStatus` members; `pending` is deliberately unreachable
 * from here because the scan is synchronous (see `lib/lead-attachment.ts` for
 * what a `pending` row would MEAN if some later async path ever wrote one).
 */
export type ScanOutcome =
  | { status: "clean" }
  | { status: "infected"; signature: string }
  | { status: "failed"; reason: "timeout" | "unreachable" | "protocol" };

/** The slice of `net.Socket` this client uses. Narrow on purpose: unit tests
 *  hand in a fake rather than standing up a real clamd. */
export interface ScanSocket {
  write(data: Uint8Array): unknown;
  destroy(): unknown;
  on(event: "connect", listener: () => void): unknown;
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: () => void): unknown;
}

export interface ScanOptions {
  /** Whole-connection wall-clock bound. Expiry destroys the socket → `failed`. */
  deadlineMs?: number;
  /** Test seam. Defaults to a real TCP connection to `CLAMAV_HOST:CLAMAV_PORT`. */
  connect?: (host: string, port: number) => ScanSocket;
}

/** Read at CALL time, never at import (see the import-inert note above). */
function clamavTarget(): { host: string; port: number } {
  const host = process.env.CLAMAV_HOST?.trim() || "localhost";
  const port = Number(process.env.CLAMAV_PORT?.trim() || "3310");
  return { host, port: Number.isFinite(port) && port > 0 ? port : 3310 };
}

/** 4-byte big-endian length prefix — clamd's chunk framing. */
function lengthPrefix(size: number): Uint8Array {
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, size, false);
  return header;
}

/**
 * Turn clamd's reply line into an outcome.
 *
 * `FOUND` is checked BEFORE `OK` and `ERROR`: a signature name is attacker-
 * influenced only in the sense that it names the malware, but the reply is a
 * single line and the verdict token is its last word, so the order removes any
 * question of a crafted filename steering the classification (filenames are
 * never sent on this protocol — only bytes).
 */
export function interpretClamdReply(reply: string): ScanOutcome {
  const line = reply.replace(/\0+$/, "").trim();
  if (/\bFOUND$/.test(line)) {
    // "stream: Eicar-Signature FOUND" → "Eicar-Signature"
    const signature = line.replace(/^stream:\s*/i, "").replace(/\s+FOUND$/, "");
    return { status: "infected", signature: signature || "unknown" };
  }
  if (/\bOK$/.test(line)) return { status: "clean" };
  return { status: "failed", reason: "protocol" };
}

/**
 * Scan a buffer through clamd and resolve with a TERMINAL outcome. NEVER
 * throws and never outlives `deadlineMs`: every failure mode — refused
 * connection, mid-stream socket error, a reply that is neither OK nor FOUND,
 * or clamd simply going quiet on a zip bomb — resolves as `failed` with a
 * coded, throttled log line. The caller decides the HTTP consequence; this
 * module never decides policy.
 */
export function scanBuffer(bytes: Uint8Array, options: ScanOptions = {}): Promise<ScanOutcome> {
  const deadlineMs = options.deadlineMs ?? SCAN_DEADLINE_MS;
  const { host, port } = clamavTarget();
  const openSocket =
    options.connect ?? ((h: string, p: number) => netConnect({ host: h, port: p }) as ScanSocket);

  return new Promise<ScanOutcome>((resolve) => {
    let settled = false;
    let received = "";
    let socket: ScanSocket;

    const finish = (outcome: ScanOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        // already destroyed — `destroy()` on a closed socket is not an error we care about
      }
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      // The zip-bomb answer. `MaxScanTime` is disabled server-side, so this is
      // the ONLY wall-clock bound in the system (Task 0 #3).
      throttledError("rfq-attach", `clamd did not answer within ${deadlineMs}ms — scan failed`);
      finish({ status: "failed", reason: "timeout" });
    }, deadlineMs);

    try {
      socket = openSocket(host, port);
    } catch (error) {
      throttledError("rfq-attach", "clamd connection could not be opened", error);
      finish({ status: "failed", reason: "unreachable" });
      return;
    }

    socket.on("error", (error) => {
      throttledError("rfq-attach", "clamd unreachable — attachment rejected", error);
      finish({ status: "failed", reason: "unreachable" });
    });

    socket.on("connect", () => {
      try {
        socket.write(new TextEncoder().encode("zINSTREAM\0"));
        for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
          const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length));
          socket.write(lengthPrefix(chunk.length));
          socket.write(chunk);
        }
        // Zero-length chunk = "stream complete". The writable side stays open:
        // clamd answers on the same connection and closes it itself.
        socket.write(lengthPrefix(0));
      } catch (error) {
        throttledError("rfq-attach", "clamd stream write failed", error);
        finish({ status: "failed", reason: "unreachable" });
      }
    });

    socket.on("data", (chunk) => {
      received += new TextDecoder().decode(chunk);
      // The reply is ONE NUL-terminated line; act the moment it is complete
      // rather than waiting for the close, so a clamd that lingers cannot
      // spend our deadline after it has already answered.
      if (received.includes("\0")) finish(interpretClamdReply(received));
    });

    socket.on("close", () => {
      if (settled) return;
      if (received.length > 0) {
        finish(interpretClamdReply(received));
        return;
      }
      // Closed with nothing said — indistinguishable from an outage.
      throttledError("rfq-attach", "clamd closed the connection without answering");
      finish({ status: "failed", reason: "unreachable" });
    });
  });
}
