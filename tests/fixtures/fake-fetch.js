// tests/fixtures/fake-fetch.js — replaces globalThis.fetch so Jev tests open no socket.
//
// In-process: require it, then set `fakeFetch.next` to a behavior.
// Child process: `NODE_OPTIONS=--require <this file>` plus a GPS_FAKE_FETCH env var holding
// the behavior as JSON. A behavior is one of:
//   { status?: number, body: <json> }  respond (status defaults to 200)
//   { hang: true }                     never respond; rejects with the signal's reason on abort
//   { refuse: true }                   reject like a refused connection
// Every call is recorded in `fakeFetch.calls` as { url, init }.

const fakeFetch = {
  next: null,
  calls: [],
  reset() {
    this.next = null;
    this.calls = [];
  },
};

function behavior() {
  if (fakeFetch.next) return fakeFetch.next;
  if (process.env.GPS_FAKE_FETCH) return JSON.parse(process.env.GPS_FAKE_FETCH);
  throw new Error('fake-fetch: no behavior set (fakeFetch.next or GPS_FAKE_FETCH)');
}

globalThis.fetch = async (url, init = {}) => {
  fakeFetch.calls.push({ url: String(url), init });
  const b = behavior();
  if (b.refuse) throw new TypeError('fetch failed');
  if (b.hang) {
    return new Promise((_, reject) => {
      if (!init.signal) return;
      if (init.signal.aborted) return reject(init.signal.reason);
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  }
  const status = b.status || 200;
  const text = typeof b.body === 'string' ? b.body : JSON.stringify(b.body);
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
};

module.exports = fakeFetch;
