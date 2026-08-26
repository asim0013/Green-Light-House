import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scanBuffer, interpretClamdReply, type ScanSocket } from "./clamav";

/**
 * The INSTREAM client's contract (Story 3.7b, AC4).
 *
 * A FAKE SOCKET, not a live clamd: these tests pin the protocol framing and —
 * more importantly — the four terminal outcomes, including the two that can
 * only be produced by a server misbehaving in ways a real one will not do on
 * demand (never answering, closing mute). The LIVE proof that the framing is
 * the framing clamd actually speaks is `e2e/rfq.spec.ts`'s EICAR submission
 * and the measurements recorded in the story; a fake can only prove that this
 * code does what this code claims.
 *
 * ⚠️ The deadline test is the one that matters most. `MaxScanTime` is DISABLED
 * on the shipped clamav image with `ScanArchive yes`, so a crafted archive has
 * no server-side wall-clock bound — this timeout is the only thing standing
 * between a zip bomb and a hung request handler (Task 0 #3).
 */

/** Minimal event-emitting stand-in. Not `implements ScanSocket` — the tests
 *  drive it through `emit`, which the real interface has no business exposing. */
class FakeSocket {
  readonly written: Uint8Array[] = [];
  destroyed = false;
  private readonly listeners = new Map<string, ((arg?: unknown) => void)[]>();

  write(data: Uint8Array): boolean {
    this.written.push(new Uint8Array(data));
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  on(event: string, listener: (arg?: unknown) => void): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  emit(event: string, arg?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(arg);
  }

  /** Everything written, concatenated — the wire as clamd would see it. */
  wire(): Uint8Array {
    const total = this.written.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of this.written) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  asScanSocket(): ScanSocket {
    return this as unknown as ScanSocket;
  }
}

function reply(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

/** Run a scan, giving the caller the socket so it can answer mid-flight. */
function scanWith(bytes: Uint8Array, answer: (socket: FakeSocket) => void, deadlineMs = 5_000) {
  const socket = new FakeSocket();
  const result = scanBuffer(bytes, { deadlineMs, connect: () => socket.asScanSocket() });
  socket.emit("connect");
  answer(socket);
  return { socket, result };
}

describe("interpretClamdReply", () => {
  it("classifies the three real reply shapes", () => {
    expect(interpretClamdReply("stream: OK\0")).toEqual({ status: "clean" });
    expect(interpretClamdReply("stream: Win.Test.EICAR_HDB-1 FOUND\0")).toEqual({
      status: "infected",
      signature: "Win.Test.EICAR_HDB-1",
    });
    expect(interpretClamdReply("INSTREAM size limit exceeded. ERROR\0")).toEqual({
      status: "failed",
      reason: "protocol",
    });
  });

  it("an unrecognised line is `failed`, NEVER clean — the fail-safe direction", () => {
    // The whole point: an unparseable answer must never be read as "no malware
    // found". If this ever returned `clean`, a clamd speaking a future dialect
    // would silently wave every file through.
    expect(interpretClamdReply("what?\0")).toEqual({ status: "failed", reason: "protocol" });
    expect(interpretClamdReply("")).toEqual({ status: "failed", reason: "protocol" });
  });
});

describe("scanBuffer — protocol framing", () => {
  it("sends zINSTREAM, a length-prefixed chunk and the zero terminator", async () => {
    const { socket, result } = scanWith(new TextEncoder().encode("hello"), (s) =>
      s.emit("data", reply("stream: OK\0")),
    );
    await result;

    const wire = socket.wire();
    expect(new TextDecoder().decode(wire.subarray(0, 10))).toBe("zINSTREAM\0");
    // 4-byte big-endian length of "hello", then the bytes, then 4 zero bytes.
    expect(Array.from(wire.subarray(10, 14))).toEqual([0, 0, 0, 5]);
    expect(new TextDecoder().decode(wire.subarray(14, 19))).toBe("hello");
    expect(Array.from(wire.subarray(19, 23))).toEqual([0, 0, 0, 0]);
    expect(wire.length).toBe(23);
  });

  it("chunks a payload larger than 64 KB rather than building a second copy", async () => {
    const bytes = new Uint8Array(130 * 1024);
    const { socket, result } = scanWith(bytes, (s) => s.emit("data", reply("stream: OK\0")));
    await result;

    // zINSTREAM + (header,chunk) × 3 + terminator = 8 writes for 130 KB at 64 KB.
    expect(socket.written.length).toBe(8);
    expect(Array.from(socket.written[1])).toEqual([0, 1, 0, 0]); // 65536, big-endian
    expect(socket.written[6].length).toBe(130 * 1024 - 2 * 64 * 1024);
  });
});

describe("scanBuffer — terminal outcomes", () => {
  it("clean", async () => {
    const { result } = scanWith(reply("x"), (s) => s.emit("data", reply("stream: OK\0")));
    await expect(result).resolves.toEqual({ status: "clean" });
  });

  it("infected, carrying the signature name", async () => {
    const { result } = scanWith(reply("x"), (s) =>
      s.emit("data", reply("stream: Win.Test.EICAR_HDB-1 FOUND\0")),
    );
    await expect(result).resolves.toEqual({
      status: "infected",
      signature: "Win.Test.EICAR_HDB-1",
    });
  });

  it("a reply split across packets is reassembled before it is judged", async () => {
    // clamd's answer is one line, but TCP does not promise one packet. Judging
    // a partial "stream: Eicar…" would classify an infection as `protocol`.
    const { result } = scanWith(reply("x"), (s) => {
      s.emit("data", reply("stream: Win.Test."));
      s.emit("data", reply("EICAR_HDB-1 FOUND\0"));
    });
    await expect(result).resolves.toEqual({
      status: "infected",
      signature: "Win.Test.EICAR_HDB-1",
    });
  });

  it("DEADLINE: a clamd that never answers yields `failed` and the socket is destroyed", async () => {
    // The zip-bomb case. `MaxScanTime` is disabled server-side, so without this
    // the handler waits forever on a crafted archive (Task 0 #3).
    const socket = new FakeSocket();
    const result = scanBuffer(reply("x"), {
      deadlineMs: 20,
      connect: () => socket.asScanSocket(),
    });
    socket.emit("connect");
    await expect(result).resolves.toEqual({ status: "failed", reason: "timeout" });
    expect(socket.destroyed).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[rfq-attach]"));
  });

  it("connection refused → `failed`/unreachable, never a throw", async () => {
    const { result } = scanWith(reply("x"), (s) =>
      s.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:3310")),
    );
    await expect(result).resolves.toEqual({ status: "failed", reason: "unreachable" });
  });

  it("a connector that throws synchronously is absorbed", async () => {
    await expect(
      scanBuffer(reply("x"), {
        connect: () => {
          throw new Error("getaddrinfo ENOTFOUND clamav");
        },
      }),
    ).resolves.toEqual({ status: "failed", reason: "unreachable" });
  });

  it("closed without answering → `failed`, not a hang and not a clean pass", async () => {
    const { result } = scanWith(reply("x"), (s) => s.emit("close"));
    await expect(result).resolves.toEqual({ status: "failed", reason: "unreachable" });
  });

  it("the FIRST outcome wins — a late close cannot overwrite a verdict", async () => {
    // Both `data` and `close` fire on every real scan; without the settle
    // guard the close handler would re-resolve (harmless) or, worse, a future
    // edit could make the second path the observed one.
    const { result } = scanWith(reply("x"), (s) => {
      s.emit("data", reply("stream: Win.Test.EICAR_HDB-1 FOUND\0"));
      s.emit("close");
    });
    await expect(result).resolves.toMatchObject({ status: "infected" });
  });
});
