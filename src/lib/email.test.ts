import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  assertHeaderSafe,
  createEmailTransport,
  isEmailConfigured,
  isHeaderSafe,
  MemoryTransport,
  resolveNotifyRecipient,
} from "./email";

/**
 * The transport seam (Story 3.3, AC12) and the header-safety guard (AC5).
 *
 * `fetch` is mocked throughout: an unmocked Resend transport would post to the
 * real provider from a test run, and vitest loads `.env`, so a developer with a
 * live key would actually send mail.
 */

const savedEnv = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const key of ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM", "RFQ_NOTIFY_TO"]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("header safety — the one injection a plain-text email still has", () => {
  it("rejects CR, LF and NUL; accepts ordinary text", () => {
    // A newline in a Subject splits the header block and forges headers. The
    // control characters are built by CHAR CODE: writing them as escapes in
    // source is what has repeatedly planted raw control bytes in this repo.
    expect(isHeaderSafe("New RFQ GLH-RFQ-2042")).toBe(true);
    expect(isHeaderSafe(`x${String.fromCharCode(10)}Bcc: evil@example.com`)).toBe(false);
    expect(isHeaderSafe(`x${String.fromCharCode(13)}y`)).toBe(false);
    expect(isHeaderSafe(`x${String.fromCharCode(0)}y`)).toBe(false);
  });

  it("assertHeaderSafe THROWS rather than sanitizing", () => {
    // Every subject is built from a DB-minted reference, so an unsafe one means
    // a caller started interpolating buyer input into a header — a defect to
    // fix, not a value to quietly clean up (the schema's refuse-never-alter
    // doctrine).
    expect(() => assertHeaderSafe(`a${String.fromCharCode(10)}b`, "subject")).toThrow("subject");
    expect(assertHeaderSafe("GLH-RFQ-2042", "subject")).toBe("GLH-RFQ-2042");
  });
});

describe("createEmailTransport — selection never crashes and never guesses the provider", () => {
  it("selects by name", () => {
    expect(createEmailTransport("resend").name).toBe("resend");
    expect(createEmailTransport("memory").name).toBe("memory");
    expect(createEmailTransport("log").name).toBe("log");
  });

  it("unset or empty selects `log` — a dev must not silently mail real buyers", () => {
    // ⚠️ Read from the ENVIRONMENT, not by passing `undefined`: a JS default
    // parameter fires on an explicit `undefined` too, so
    // `createEmailTransport(undefined)` re-reads `EMAIL_PROVIDER` — and this
    // repo's `.env` sets it to `resend`, which is how the first version of this
    // test failed while the code was correct.
    delete process.env.EMAIL_PROVIDER;
    expect(createEmailTransport().name).toBe("log");
    process.env.EMAIL_PROVIDER = "";
    expect(createEmailTransport().name).toBe("log");
    expect(createEmailTransport("").name).toBe("log");
  });

  it("an UNKNOWN value logs loudly and falls back to `log`, never to `resend`", () => {
    // A typo in a deployment variable must degrade to "nothing sent, and we
    // said so" — never to a crashed worker, and never to real sends from a
    // half-configured account.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = createEmailTransport("rensd");
    expect(transport.name).toBe("log");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("unknown EMAIL_PROVIDER"));
    error.mockRestore();
  });
});

describe("the Resend transport is one fetch with the pinned shape (AC12)", () => {
  const validEnv = () => {
    process.env.EMAIL_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "GLH <rfq@glh.example>";
  };

  it("POSTs the documented URL, auth and body — never an SDK", async () => {
    validEnv();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEmailTransport("resend").send({
      to: "buyer@example.com",
      subject: "New RFQ GLH-RFQ-2042",
      text: "body",
      idempotencyKey: "GLH-RFQ-2042:confirm",
    });

    expect(result).toEqual({ ok: true, id: "abc" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    expect(headers["Idempotency-Key"]).toBe("GLH-RFQ-2042:confirm");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "GLH <rfq@glh.example>",
      to: "buyer@example.com",
      subject: "New RFQ GLH-RFQ-2042",
      text: "body",
    });
    vi.unstubAllGlobals();
  });

  it("caps the idempotency key at the provider's 256-character limit", async () => {
    validEnv();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createEmailTransport("resend").send({
      to: "a@b.example",
      subject: "s",
      text: "t",
      idempotencyKey: "x".repeat(400),
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toHaveLength(256);
    vi.unstubAllGlobals();
  });

  it("a non-2xx is `provider` (the provider spoke and said no)", async () => {
    validEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    const result = await createEmailTransport("resend").send({
      to: "a@b.example",
      subject: "s",
      text: "t",
    });
    expect(result).toMatchObject({ ok: false, code: "provider" });
    vi.unstubAllGlobals();
  });

  it("a THROWN fetch is `transport` (no answer at all) — never an exception", async () => {
    // The classification matters: the caller retries both, but 4.7 renders the
    // distinction and an operator triages "they rejected us" differently from
    // "we could not reach them".
    validEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND api.resend.com");
      }),
    );
    const result = await createEmailTransport("resend").send({
      to: "a@b.example",
      subject: "s",
      text: "t",
    });
    expect(result).toMatchObject({ ok: false, code: "transport" });
    vi.unstubAllGlobals();
  });

  it("missing credentials fail structurally rather than posting an unauthenticated request", async () => {
    delete process.env.EMAIL_API_KEY;
    delete process.env.EMAIL_FROM;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEmailTransport("resend").send({
      to: "a@b.example",
      subject: "s",
      text: "t",
    });
    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("MemoryTransport — the CI instrument", () => {
  it("records sends and can be driven to fail exactly once", async () => {
    const transport = new MemoryTransport();
    transport.failNext();
    expect(await transport.send({ to: "a@b.example", subject: "s", text: "t" })).toMatchObject({
      ok: false,
      code: "provider",
    });
    // The NEXT send succeeds — which is what makes a retry proof possible.
    expect(await transport.send({ to: "a@b.example", subject: "s", text: "t" })).toMatchObject({
      ok: true,
    });
    expect(transport.sent).toHaveLength(1);
  });

  it("a FAILED send is not recorded as sent — the count is the evidence", async () => {
    // Every exactly-once assertion in this story counts `sent`. If failures
    // landed in it, "exactly one confirmation" could never be measured.
    const transport = new MemoryTransport();
    transport.failNext();
    await transport.send({ to: "a@b.example", subject: "s", text: "t" });
    expect(transport.sent).toHaveLength(0);
  });
});

describe("resolveNotifyRecipient — the ONE reader of RFQ_NOTIFY_TO (AC7)", () => {
  it("returns the trimmed address, or null when there is nowhere to send", () => {
    process.env.RFQ_NOTIFY_TO = "  aylin@glh.example  ";
    expect(resolveNotifyRecipient()).toBe("aylin@glh.example");
    process.env.RFQ_NOTIFY_TO = "   ";
    expect(resolveNotifyRecipient()).toBeNull();
    delete process.env.RFQ_NOTIFY_TO;
    expect(resolveNotifyRecipient()).toBeNull();
  });
});

describe("isEmailConfigured — two ways to fail it, and the second one shipped", () => {
  /**
   * ⚠️ THIS BLOCK USED TO ASSERT THE DEFECT. Its previous claim was "only
   * `resend` can be unconfigured — log and memory never call out", which reads
   * as a design statement and is really the bug: `log` never calls out because
   * IT NEVER SENDS ANYTHING, and answering `true` for it told the send flow to
   * stamp `notifiedAt` on mail that was only printed. Two review lenses filed
   * it HIGH; `.env.example` ships `log`, so it was the default state.
   */
  it("a transport that DELIVERS NOTHING is never configured, whatever its name", () => {
    process.env.EMAIL_API_KEY = "k";
    process.env.EMAIL_FROM = "f@example.com";
    // Credentials present and irrelevant: the log transport still cannot send.
    expect(isEmailConfigured(createEmailTransport("log"))).toBe(false);
    // …and an unset or misspelled EMAIL_PROVIDER resolves to exactly that one.
    expect(isEmailConfigured(createEmailTransport("rensd"))).toBe(false);
    expect(isEmailConfigured(createEmailTransport(""))).toBe(false);
  });

  it("`memory` DOES deliver — the CI suite counts real sends off it", () => {
    delete process.env.EMAIL_API_KEY;
    expect(new MemoryTransport().delivers).toBe(true);
    expect(isEmailConfigured(new MemoryTransport())).toBe(true);
  });

  it("`resend` is configured only with BOTH credentials", () => {
    delete process.env.EMAIL_API_KEY;
    delete process.env.EMAIL_FROM;
    expect(isEmailConfigured(createEmailTransport("resend"))).toBe(false);
    process.env.EMAIL_API_KEY = "k";
    expect(isEmailConfigured(createEmailTransport("resend"))).toBe(false);
    process.env.EMAIL_FROM = "f@example.com";
    expect(isEmailConfigured(createEmailTransport("resend"))).toBe(true);
  });
});

describe("RFQ_NOTIFY_TO has exactly ONE production reader (AC7) — a gate, not a grep", () => {
  it("only `resolveNotifyRecipient` reads the variable", () => {
    // Story 4.8 (FR36b) repoints this at an admin-managed setting by editing
    // ONE function body. That is only true while it stays the single reader —
    // and "we checked once during implementation" is exactly the kind of claim
    // this project has watched decay. Asserting it makes the second reader a
    // red test rather than a review finding two stories later.
    const files = execFileSync("git", ["ls-files", "src", "worker", "scripts"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((file) => /\.(ts|tsx|mjs)$/.test(file))
      // Tests legitimately SET the variable to drive the code under test.
      .filter((file) => !/\.test\.tsx?$/.test(file));

    // ANTI-VACUITY, and it is not theoretical: `git ls-files` lists TRACKED
    // files only, so before these files were staged this gate scanned an empty
    // set and "found" zero readers — passing while proving nothing. The exact
    // failure mode Story 3.7b's byte-sweep hit. Assert the corpus first.
    expect(files.length, "the file list must not be empty").toBeGreaterThan(20);
    expect(files, "the module under test must be in the corpus").toContain("src/lib/email.ts");

    const readers = files.filter((file) =>
      readFileSync(file, "utf8").includes("process.env.RFQ_NOTIFY_TO"),
    );
    expect(readers, "exactly one module may read RFQ_NOTIFY_TO").toEqual(["src/lib/email.ts"]);
  });
});
