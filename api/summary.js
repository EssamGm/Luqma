var redisStats = require("./_redis");
var cost = require("./_cost");

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-opus-5";

function buildPrompt(stats) {
  return (
    "هذه إحصائيات وجبات مستخدم لتطبيق تتبّع غذائي على مدى عدة أيام:\n\n" +
    "- عدد الوجبات المسجَّلة: " + stats.totalMeals + "\n" +
    "- عدد الأيام: " + stats.dateRangeDays + "\n" +
    "- متوسط السعرات الحرارية لكل وجبة: " + stats.avgCalories + " سعرة\n" +
    "- متوسط البروتين لكل وجبة: " + stats.avgProteinG + " غ\n" +
    "- متوسط الكربوهيدرات لكل وجبة: " + stats.avgCarbsG + " غ\n" +
    "- متوسط الدهون لكل وجبة: " + stats.avgFatG + " غ\n" +
    "- نسبة البروتين من إجمالي العناصر الكبرى: " + stats.proteinRatioPct + "%\n" +
    "- نسبة الكربوهيدرات: " + stats.carbRatioPct + "%\n" +
    "- نسبة الدهون: " + stats.fatRatioPct + "%\n\n" +
    "اكتب انطباعاً عاماً ودوداً ومباشراً بالعربية الفصحى (فقرة واحدة قصيرة، ٣ إلى ٥ جمل) " +
    "حول نمط هذه الوجبات مجتمعة — وازن بين ذكر الجوانب الإيجابية واقتراح تعديل بسيط وعملي واحد " +
    "أو اثنين قابلين للتطبيق فوراً. لا تكرر الأرقام حرفياً، بل فسّرها. لا تكتب مقدمات مثل " +
    "\"بناءً على البيانات\"، ابدأ مباشرة بالمضمون."
  );
}

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, errorAr: "طريقة الطلب غير مدعومة." });
    return;
  }

  var body = req.body || {};
  var stats = body.stats;

  if (!stats || typeof stats.totalMeals !== "number" || stats.totalMeals <= 0) {
    res.status(400).json({ ok: false, errorAr: "لا توجد بيانات كافية لإجراء التحليل." });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ ok: false, errorAr: "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ." });
    return;
  }

  var payload = {
    model: MODEL,
    max_tokens: 800,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: buildPrompt(stats) }]
  };

  var upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    res.status(502).json({ ok: false, errorAr: "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ." });
    return;
  }

  if (upstream.status === 429) {
    res.status(429).json({ ok: false, errorAr: "الخادم مشغول حالياً، حاول بعد لحظات." });
    return;
  }

  if (!upstream.ok) {
    res.status(502).json({ ok: false, errorAr: "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ." });
    return;
  }

  var data;
  try {
    data = await upstream.json();
  } catch (err) {
    res.status(502).json({ ok: false, errorAr: "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ." });
    return;
  }

  // A real model call happened from here on — mirror the cost into the same
  // global running total analyze.js contributes to. Best effort only.
  var costSar = cost.sarFromUsage(data.usage);
  if (costSar > 0 && redisStats.ready()) {
    try {
      await redisStats.incrbyfloat("luqma:stat:total_cost_sar", costSar);
    } catch (err) {
      // ignore — cost tracking must never break the feature
    }
  }

  if (data.stop_reason === "refusal") {
    res.status(200).json({ ok: false, errorAr: "تعذر إجراء التحليل الشامل حالياً. حاول لاحقاً.", costSar: costSar });
    return;
  }

  var content = data.content || [];
  var textBlock = null;
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === "text") { textBlock = content[i]; break; }
  }

  if (!textBlock || !textBlock.text) {
    res.status(200).json({ ok: false, errorAr: "تعذر إجراء التحليل الشامل حالياً. حاول لاحقاً.", costSar: costSar });
    return;
  }

  res.status(200).json({ ok: true, summaryAr: textBlock.text.trim(), costSar: costSar });
};
