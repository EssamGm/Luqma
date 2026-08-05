// Shared Upstash Redis REST helper. Prefixed with `_` so Vercel does not
// turn this file into its own route.
//
// Supports either env var naming Vercel's Upstash marketplace integration
// may inject: the legacy KV_REST_API_* names, or the native UPSTASH_REDIS_REST_* names.

var REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
var REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function ready() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function command(parts) {
  var url = REDIS_URL + "/" + parts.map(function (p) { return encodeURIComponent(String(p)); }).join("/");
  var res = await fetch(url, { headers: { Authorization: "Bearer " + REDIS_TOKEN } });
  var data = await res.json();
  return data.result;
}

module.exports = {
  ready: ready,
  sadd: function (key, member) { return command(["sadd", key, member]); },
  scard: function (key) { return command(["scard", key]); },
  smembers: function (key) { return command(["smembers", key]); },
  incr: function (key) { return command(["incr", key]); },
  incrbyfloat: function (key, amount) { return command(["incrbyfloat", key, amount]); },
  get: function (key) { return command(["get", key]); },
  rpush: function (key, value) { return command(["rpush", key, value]); },
  lrange: function (key, start, stop) { return command(["lrange", key, start, stop]); },
  ltrim: function (key, start, stop) { return command(["ltrim", key, start, stop]); }
};
