var redisStats = require("./_redis");

// Tiny anonymous behavior-signal counter. Only a fixed, whitelisted set of
// event names is accepted — this is not a general analytics sink, just a
// few specific proxies for real friction (e.g. deleting a meal minutes
// after logging it, which usually means the estimate was visibly wrong).
var ALLOWED_EVENTS = ["meal_deleted_soon"];

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  var body = req.body || {};
  var event = body.event;

  if (typeof event !== "string" || ALLOWED_EVENTS.indexOf(event) === -1) {
    res.status(204).end();
    return;
  }

  if (redisStats.ready()) {
    try {
      await redisStats.incr("luqma:stat:event:" + event);
    } catch (err) {
      // ignore — analytics must never break the feature
    }
  }

  res.status(204).end();
};
