var redisStats = require("./_redis");

// Anonymous feedback, stored as a bounded list (most recent 200) so someone
// using the app — often a stranger you don't know — has a direct line to
// you without needing an account. Read back via /api/stats (STATS_SECRET).

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, errorAr: "طريقة الطلب غير مدعومة." });
    return;
  }

  var body = req.body || {};
  var message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message || message.length > 2000) {
    res.status(400).json({ ok: false, errorAr: "الرسالة غير صالحة." });
    return;
  }

  if (!redisStats.ready()) {
    // No stats store configured — accept silently rather than break the UI.
    res.status(200).json({ ok: true });
    return;
  }

  var entry = JSON.stringify({
    message: message,
    deviceId: typeof body.deviceId === "string" ? body.deviceId.slice(0, 100) : null,
    at: new Date().toISOString()
  });

  try {
    await redisStats.rpush("luqma:feedback", entry);
    await redisStats.ltrim("luqma:feedback", -200, -1);
  } catch (err) {
    // Still tell the user it went through — losing a feedback entry to a
    // transient Redis error shouldn't surface as a broken feature.
  }

  res.status(200).json({ ok: true });
};
