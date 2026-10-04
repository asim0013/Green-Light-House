// A stand-in for a self-hosted Plausible instance, for `e2e/analytics-enabled.spec.ts`
// (Story 5.8 review F3). The app under test is built with
// PLAUSIBLE_HOST=http://localhost:<STUB_PORT>, so its same-origin rewrites
// (/hive/js/script.js, /api/hive/event) proxy HERE — the test then reads what
// actually arrived at the "provider" through the full chain.
//
// Zero dependencies. Not a faithful Plausible: it implements only what the loader
// relies on — `data-api`/`data-domain`, the queue stub flush, an initial pageview,
// and Plausible's per-event `localStorage.plausible_ignore` opt-out.
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 3202);
const events = [];

const SCRIPT = `(function () {
  var s = document.currentScript;
  var api = s.getAttribute("data-api");
  var domain = s.getAttribute("data-domain");
  function ignored() { try { return localStorage.getItem("plausible_ignore") === "true"; } catch (e) { return false; } }
  function send(n, o) {
    if (ignored()) return;
    fetch(api, { method: "POST", headers: { "content-type": "text/plain" }, keepalive: true,
      body: JSON.stringify({ n: n, d: domain, u: location.href, p: (o && o.props) || {} }) });
  }
  var q = (window.plausible && window.plausible.q) || [];
  window.plausible = function (n, o) { send(n, o); };
  send("pageview");
  for (var i = 0; i < q.length; i++) window.plausible.apply(null, q[i]);
})();`;

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/js/script.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end(SCRIPT);
    } else if (req.method === "POST" && req.url === "/api/event") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          events.push(JSON.parse(body));
        } catch {
          events.push({ raw: body });
        }
        res.writeHead(202);
        res.end("ok");
      });
    } else if (req.url === "/__events") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(events));
    } else if (req.url === "/__reset") {
      events.length = 0;
      res.writeHead(204);
      res.end();
    } else if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(PORT, () => console.log(`[plausible-stub] listening on ${PORT}`));
