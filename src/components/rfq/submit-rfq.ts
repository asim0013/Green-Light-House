/**
 * The RFQ submit transport (Story 3.7b, AC1/AC7).
 *
 * TWO TRANSPORTS, ONE PAYLOAD. Without a file the form keeps Story 3.2's
 * `fetch` + JSON path exactly as it was — proven, and not worth disturbing for
 * the 90% of submissions that carry no attachment. With a file it switches to
 * `multipart/form-data`, and to `XMLHttpRequest` rather than `fetch`, for one
 * concrete reason: **fetch cannot report upload progress**. There is no
 * `upload.onprogress` equivalent and no request-side stream this platform
 * exposes, so a determinate progress bar (AC7) is simply not implementable over
 * fetch. A 15 MB upload on a site connection is long enough that
 * `disabled:opacity-50` alone leaves the buyer wondering whether anything is
 * happening.
 *
 * The payload is IDENTICAL in both cases — the same object, validated by the
 * same schema — because multipart carries it as a single JSON `payload` part
 * (Task 0 #2) rather than as loose form fields. One encoding, one set of stable
 * error keys, nothing to drift.
 */

export interface RfqResponse {
  status: number;
  /** The parsed JSON envelope, or `null` when the response carried none. */
  body: unknown;
}

/**
 * Build the multipart body. Extracted and exported because it is the half that
 * can be tested without a network: the XHR wiring below is proven end-to-end by
 * `e2e/rfq.spec.ts`, which uploads a real file through a real browser.
 */
export function buildRfqFormData(payload: unknown, file: File): FormData {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.set("attachment", file);
  return form;
}

/** Progress as a whole percentage, or `null` when the total is unknown. */
export type ProgressHandler = (percent: number | null) => void;

async function submitJson(payload: unknown): Promise<RfqResponse> {
  const response = await fetch("/api/rfq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function submitMultipart(
  payload: unknown,
  file: File,
  onProgress?: ProgressHandler,
): Promise<RfqResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/rfq");
    // The `content-type` is NOT set here on purpose: the browser must write it
    // itself so the multipart `boundary=` parameter matches the body it
    // serializes. Setting it by hand produces a header with no boundary and a
    // body the server cannot parse.
    xhr.upload.addEventListener("progress", (event) => {
      onProgress?.(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
    });
    xhr.addEventListener("load", () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // A non-JSON response is a transport-level failure; the status still
        // carries the meaning, and the caller maps it like any other non-201.
      }
      resolve({ status: xhr.status, body });
    });
    // A network failure and an abort both reject, so the caller's catch shows
    // the same "nothing you entered was lost" copy the fetch path shows.
    xhr.addEventListener("error", () => reject(new Error("network error")));
    xhr.addEventListener("abort", () => reject(new Error("aborted")));
    xhr.send(buildRfqFormData(payload, file));
  });
}

export function submitRfq(
  payload: unknown,
  file: File | null,
  onProgress?: ProgressHandler,
): Promise<RfqResponse> {
  return file ? submitMultipart(payload, file, onProgress) : submitJson(payload);
}
