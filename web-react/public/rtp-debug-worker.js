// Decode-side tap worker for RTP egress/ingress reconciliation diagnostics
// (enable by setting localStorage webspeak:rtp-debug = "1" before joining).
// Lives as a same-origin static file because blob workers violate the site's
// Content-Security-Policy (script-src 'self').
let tapped = 0;
self.onrtctransform = (event) => {
  const { readable, writable } = event.transformer;
  readable.pipeThrough(new TransformStream({
    transform(frame, controller) {
      const data = new Uint8Array(frame.data);
      tapped++;
      if (tapped <= 5 || tapped % 250 === 0) {
        const hex = Array.from(data.subarray(0, 8)).map(b => b.toString(16).padStart(2, "0")).join(" ");
        self.postMessage({ len: data.length, hex, tapped });
      }
      controller.enqueue(frame);
    },
  })).pipeTo(writable).catch((e) => self.postMessage({ error: e.message }));
};
