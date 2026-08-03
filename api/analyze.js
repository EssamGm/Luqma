var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-opus-5";

var PROMPT_AR =
  "انظر إلى صورة هذه الوجبة بعناية. حدّد اسم الطبق أو الوجبة بالعربية الفصحى بإيجاز، " +
  "وقدّر السعرات الحرارية، والبروتين، والكربوهيدرات، والدهون بالجرام كأفضل تقدير ممكن " +
  "كأعداد صحيحة. حدّد مستوى ثقتك بصدق (low أو medium أو high) حسب وضوح الصورة وقابلية " +
  "التعرف على مكونات الوجبة. ثم اكتب نصيحة عملية قصيرة ومباشرة (جملة أو جملتين) خاصة بهذه " +
  "الوجبة تحديداً بناءً على تركيبتها الغذائية — لا داعي للتحذيرات الطبية المبالغ فيها، فهذا " +
  "معروف للمستخدم مسبقاً.";

var TOOL = {
  name: "record_meal_analysis",
  description: "سجّل نتيجة تحليل الوجبة الغذائية بصيغة منظمة",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      dish_name_ar: { type: "string", description: "اسم الطبق أو الوجبة بالعربية الفصحى" },
      calories: { type: "integer" },
      protein_g: { type: "integer" },
      carbs_g: { type: "integer" },
      fat_g: { type: "integer" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      advice_ar: { type: "string", description: "نصيحة عملية قصيرة ومباشرة بالعربية الفصحى" }
    },
    required: ["dish_name_ar", "calories", "protein_g", "carbs_g", "fat_g", "confidence", "advice_ar"],
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
    output_config: { effort: "low" },
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: PROMPT_AR }
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

  if (data.stop_reason === "refusal") {
    res.status(200).json({ ok: false, errorAr: "الصورة غير واضحة. جرب صورة أوضح لوجبة الطعام." });
    return;
  }

  var content = data.content || [];
  var toolUse = null;
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === "tool_use") { toolUse = content[i]; break; }
  }

  if (!toolUse || !toolUse.input) {
    res.status(200).json({ ok: false, errorAr: "الصورة غير واضحة. جرب صورة أوضح لوجبة الطعام." });
    return;
  }

  var input = toolUse.input;
  res.status(200).json({
    ok: true,
    dishNameAr: input.dish_name_ar,
    calories: input.calories,
    proteinG: input.protein_g,
    carbsG: input.carbs_g,
    fatG: input.fat_g,
    confidence: input.confidence,
    adviceAr: input.advice_ar
  });
};
