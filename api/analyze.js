var redisStats = require("./_redis");
var cost = require("./_cost");

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-opus-5";

var PROMPT_AR =
  "انظر إلى هذه الصورة بعناية. أولاً حدّد: هل تُظهر الصورة وجبة طعام حقيقية أو طبقاً " +
  "يمكن تحليله غذائياً؟ إذا لم تكن الصورة لطعام على الإطلاق (مثل صورة لجهاز، أو مكان، أو " +
  "شخص، أو أي شيء آخر لا عَلاقة له بالأكل)، اجعل is_food = false، واترك الحقول الرقمية " +
  "صفراً، ولا تحاول اختلاق وجبة غير موجودة.\n\n" +
  "إذا كانت الصورة تُظهر طعاماً فعلاً، اجعل is_food = true، ثم: حدّد اسم الطبق أو الوجبة " +
  "بالعربية الفصحى بإيجاز، وقدّر السعرات الحرارية، والبروتين، والكربوهيدرات، والدهون " +
  "بالجرام كأفضل تقدير ممكن كأعداد صحيحة. حدّد مستوى ثقتك بصدق (low أو medium أو high) " +
  "حسب وضوح الصورة وقابلية التعرف على مكونات الوجبة. اكتب أيضاً تفصيلاً موجزاً جداً " +
  "لعناصر الوجبة الرئيسية وسعرات كل عنصر تقريبياً (مثال: أرز ~180، دجاج مشوي ~250، " +
  "صلصة ~60) — فكّر في العناصر منفصلة قبل أن تجمعها في السعرات الإجمالية. ثم اكتب " +
  "نصيحة عملية قصيرة ومباشرة (جملة أو جملتين) خاصة بهذه الوجبة تحديداً بناءً على " +
  "تركيبتها الغذائية — لا داعي للتحذيرات الطبية المبالغ فيها، فهذا معروف للمستخدم مسبقاً.";

var TOOL = {
  name: "record_meal_analysis",
  description: "سجّل نتيجة تحليل الصورة بصيغة منظمة",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      is_food: { type: "boolean", description: "هل تُظهر الصورة طعاماً يمكن تحليله؟" },
      dish_name_ar: { type: "string", description: "اسم الطبق أو الوجبة بالعربية الفصحى" },
      calories: { type: "integer" },
      protein_g: { type: "integer" },
      carbs_g: { type: "integer" },
      fat_g: { type: "integer" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      breakdown_ar: { type: "string", description: "تفصيل موجز جداً لعناصر الوجبة الرئيسية وسعرات كل عنصر تقريبياً، مثال: أرز ~180، دجاج مشوي ~250، صلصة ~60" },
      advice_ar: { type: "string", description: "نصيحة عملية قصيرة ومباشرة بالعربية الفصحى" }
    },
    required: ["is_food", "dish_name_ar", "calories", "protein_g", "carbs_g", "fat_g", "confidence", "breakdown_ar", "advice_ar"],
    additionalProperties: false
  }
};

var ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, errorAr: "طريقة الطلب غير مدعومة." });
    return;
  }

  var body = req.body || {};
  var image = body.image;
  var mediaType = body.mediaType;

  if (typeof image !== "string" || image.length === 0 || ALLOWED_MEDIA_TYPES.indexOf(mediaType) === -1) {
    res.status(400).json({ ok: false, errorAr: "الصورة غير صالحة. حاول مرة أخرى." });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ ok: false, errorAr: "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ." });
    return;
  }

  var payload = {
    model: MODEL,
    max_tokens: 2048,
    // Kept at "medium" — the earlier failures were a missing Vercel function
    // timeout, not the effort level itself. See vercel.json's maxDuration.
    output_config: { effort: "medium" },
    // The instructions + tool schema are identical on every call across every
    // device, so they go in `system` with a cache breakpoint instead of the
    // user turn — repeated analyses within the cache TTL can share the hit.
    system: [{ type: "text", text: PROMPT_AR, cache_control: { type: "ephemeral" } }],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } }
        ]
      }
    ]
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

  // A real model call happened from here on (even a refusal or a "not food"
  // result burned tokens), so this is real cost regardless of the outcome
  // below. Mirror it into the global running total — best effort, must never
  // affect the real response.
  var costSar = cost.sarFromUsage(data.usage);
  if (costSar > 0 && redisStats.ready()) {
    try {
      await redisStats.incrbyfloat("luqma:stat:total_cost_sar", costSar);
    } catch (err) {
      // ignore — cost tracking must never break the feature
    }
  }

  if (data.stop_reason === "refusal") {
    res.status(200).json({ ok: false, errorAr: "الصورة غير واضحة. جرب صورة أوضح لوجبة الطعام.", costSar: costSar });
    return;
  }

  var content = data.content || [];
  var toolUse = null;
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === "tool_use") { toolUse = content[i]; break; }
  }

  if (!toolUse || !toolUse.input) {
    if (redisStats.ready()) {
      try { await redisStats.incr("luqma:stat:unclear_photos"); } catch (err) { /* ignore */ }
    }
    res.status(200).json({ ok: false, errorAr: "الصورة غير واضحة. جرب صورة أوضح لوجبة الطعام.", costSar: costSar });
    return;
  }

  var input = toolUse.input;

  if (input.is_food === false) {
    if (redisStats.ready()) {
      try { await redisStats.incr("luqma:stat:not_food_photos"); } catch (err) { /* ignore */ }
    }
    res.status(200).json({ ok: false, errorAr: "لم يتم التعرف على وجبة طعام في هذه الصورة. صوّر طبق الطعام بوضوح.", costSar: costSar });
    return;
  }

  // Anonymous usage counting only — no photos, no personal data. Never let
  // this affect the real response even if the store isn't set up yet or errors.
  if (redisStats.ready() && typeof body.deviceId === "string" && body.deviceId.length > 0 && body.deviceId.length < 100) {
    var today = new Date().toISOString().slice(0, 10);
    try {
      await Promise.all([
        redisStats.sadd("luqma:devices:tried", body.deviceId),
        redisStats.sadd("luqma:device_days:" + body.deviceId, today),
        redisStats.incr("luqma:stat:total_meals")
      ]);
    } catch (err) {
      // ignore — analytics must never break the feature
    }
  }

  res.status(200).json({
    ok: true,
    dishNameAr: input.dish_name_ar,
    calories: input.calories,
    proteinG: input.protein_g,
    carbsG: input.carbs_g,
    fatG: input.fat_g,
    confidence: input.confidence,
    breakdownAr: input.breakdown_ar,
    adviceAr: input.advice_ar,
    costSar: costSar
  });
};
