var redisStats = require("./_redis");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function page(bodyHtml) {
  return (
    "<!doctype html><html dir=\"rtl\" lang=\"ar\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>إحصائيات لقمة</title>" +
    "<style>" +
    "body{font-family:Tahoma,Segoe UI,sans-serif;background:#f5f6f1;color:#20241d;margin:0;padding:32px 20px;}" +
    ".wrap{max-width:480px;margin:0 auto;}" +
    "h1{font-size:22px;margin:0 0 20px;}" +
    ".card{background:#fff;border:1px solid #e1e4d9;border-radius:14px;padding:18px 20px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;}" +
    ".card .num{font-size:28px;font-weight:800;color:#e2a93a;}" +
    ".card.small .num{font-size:20px;}" +
    ".card .label{font-size:14px;color:#5b6355;}" +
    ".note{font-size:12px;color:#8b9282;margin-top:18px;line-height:1.7;}" +
    "h2.section{font-size:15px;margin:28px 0 10px;}" +
    ".fb{background:#fff;border:1px solid #e1e4d9;border-radius:12px;padding:12px 14px;margin-bottom:8px;font-size:13.5px;line-height:1.6;}" +
    ".fb .fb-at{font-size:11px;color:#8b9282;margin-top:6px;}" +
    "</style></head><body><div class=\"wrap\"><h1>إحصائيات لقمة</h1>" + bodyHtml + "</div></body></html>"
  );
}

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    res.status(405).end("Method not allowed");
    return;
  }

  if (!process.env.STATS_SECRET) {
    res.status(404).end("Not found");
    return;
  }

  var key = (req.query && req.query.key) || "";
  if (key !== process.env.STATS_SECRET) {
    res.status(403).end("Forbidden");
    return;
  }

  if (!redisStats.ready()) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).end(page("<p>لم يتم إعداد قاعدة بيانات الإحصائيات بعد.</p>"));
    return;
  }

  var triedCount = 0;
  var returnedCount = 0;
  var totalMeals = 0;
  var totalCostSar = 0;
  var unclearPhotos = 0;
  var notFoodPhotos = 0;
  var mealsDeletedSoon = 0;
  var feedback = [];

  try {
    var members = (await redisStats.smembers("luqma:devices:tried")) || [];
    triedCount = members.length;

    var dayCounts = await Promise.all(
      members.map(function (id) { return redisStats.scard("luqma:device_days:" + id); })
    );
    returnedCount = dayCounts.filter(function (c) { return c >= 2; }).length;

    var totalRaw = await redisStats.get("luqma:stat:total_meals");
    totalMeals = parseInt(totalRaw, 10) || 0;

    var totalCostRaw = await redisStats.get("luqma:stat:total_cost_sar");
    totalCostSar = parseFloat(totalCostRaw) || 0;

    unclearPhotos = parseInt(await redisStats.get("luqma:stat:unclear_photos"), 10) || 0;
    notFoodPhotos = parseInt(await redisStats.get("luqma:stat:not_food_photos"), 10) || 0;
    mealsDeletedSoon = parseInt(await redisStats.get("luqma:stat:event:meal_deleted_soon"), 10) || 0;

    var feedbackRaw = (await redisStats.lrange("luqma:feedback", -20, -1)) || [];
    feedback = feedbackRaw.map(function (raw) {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }).filter(Boolean).reverse();
  } catch (err) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).end(page("<p>تعذر جلب الإحصائيات حالياً، حاول لاحقاً.</p>"));
    return;
  }

  if (req.query && req.query.format === "json") {
    res.status(200).json({
      triedCount: triedCount, returnedCount: returnedCount, totalMeals: totalMeals, totalCostSar: totalCostSar,
      unclearPhotos: unclearPhotos, notFoodPhotos: notFoodPhotos, mealsDeletedSoon: mealsDeletedSoon,
      feedback: feedback
    });
    return;
  }

  var html =
    "<div class=\"card\"><span class=\"label\">أشخاص جرّبوا التطبيق</span><span class=\"num\">" + escapeHtml(triedCount) + "</span></div>" +
    "<div class=\"card\"><span class=\"label\">استمروا باستخدامه (أكثر من يوم)</span><span class=\"num\">" + escapeHtml(returnedCount) + "</span></div>" +
    "<div class=\"card\"><span class=\"label\">إجمالي الوجبات المحلَّلة</span><span class=\"num\">" + escapeHtml(totalMeals) + "</span></div>" +
    "<div class=\"card\"><span class=\"label\">إجمالي التكلفة الفعلية</span><span class=\"num\">" + escapeHtml(totalCostSar.toFixed(2)) + " ريال</span></div>" +
    "<h2 class=\"section\">إشارات احتكاك (تقريبية)</h2>" +
    "<div class=\"card small\"><span class=\"label\">صور غير واضحة</span><span class=\"num\">" + escapeHtml(unclearPhotos) + "</span></div>" +
    "<div class=\"card small\"><span class=\"label\">صور بدون طعام</span><span class=\"num\">" + escapeHtml(notFoodPhotos) + "</span></div>" +
    "<div class=\"card small\"><span class=\"label\">وجبات حُذفت بعد تسجيلها بدقائق</span><span class=\"num\">" + escapeHtml(mealsDeletedSoon) + "</span></div>" +
    "<h2 class=\"section\">آخر الملاحظات (حتى 20)</h2>" +
    (feedback.length
      ? feedback.map(function (f) {
          return "<div class=\"fb\">" + escapeHtml(f.message) + "<div class=\"fb-at\">" + escapeHtml(f.at || "") + "</div></div>";
        }).join("")
      : "<p class=\"note\">لا توجد ملاحظات بعد.</p>") +
    "<p class=\"note\">أرقام مجهولة تماماً — بدون أسماء أو صور أو أي بيانات شخصية، فقط عدد الأجهزة.</p>";

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).end(page(html));
};
