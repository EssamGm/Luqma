(function () {
  "use strict";

  /* ---------------- Service worker ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  /* ---------------- Offline badge ---------------- */
  var offlineBadge = document.getElementById("offlineBadge");
  function updateOnlineStatus() {
    offlineBadge.hidden = navigator.onLine;
  }
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  /* ---------------- Anonymous device id ----------------
     Used only to count how many distinct devices tried the app and how many
     came back on another day. No personal data, no name, nothing tied to
     the meals themselves. */
  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function getDeviceId() {
    try {
      var id = localStorage.getItem("luqma_device_id");
      if (!id) {
        id = randomId();
        localStorage.setItem("luqma_device_id", id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }

  var deviceId = getDeviceId();

  /* ---------------- Wallet cost counter ----------------
     Real per-device running total of what this device has actually cost in
     Anthropic API spend, computed server-side from token usage on every
     call and accumulated here. Persists in localStorage like the device id
     above — no server round trip needed to display it. */
  var walletCounter = document.getElementById("walletCounter");
  var walletAmount = document.getElementById("walletAmount");
  var walletPanel = document.getElementById("walletPanel");

  function getCostTotal() {
    try {
      var v = parseFloat(localStorage.getItem("luqma_cost_sar"));
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function renderCostTotal(v) {
    walletAmount.textContent = (v > 0 ? "-" + v.toFixed(2) : "0.00") + " ريال";
  }

  function addCost(sar) {
    if (typeof sar !== "number" || !isFinite(sar) || sar <= 0) return;
    var total = getCostTotal() + sar;
    try { localStorage.setItem("luqma_cost_sar", String(total)); } catch (e) {}
    renderCostTotal(total);
    walletCounter.classList.remove("bump");
    void walletCounter.offsetWidth;
    walletCounter.classList.add("bump");
  }

  renderCostTotal(getCostTotal());

  walletCounter.addEventListener("click", function () {
    var open = walletPanel.classList.toggle("open");
    walletCounter.setAttribute("aria-expanded", open ? "true" : "false");
  });

  /* ---------------- IndexedDB helper ---------------- */
  var DB_NAME = "luqma-db";
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("meals")) {
          var store = db.createObjectStore("meals", { keyPath: "id", autoIncrement: true });
          store.createIndex("byTimestamp", "timestamp", { unique: false });
          store.createIndex("byDay", "day", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function addMeal(meal) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("meals", "readwrite");
        tx.objectStore("meals").add(meal);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getAllMeals() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("meals", "readonly");
        var req = tx.objectStore("meals").getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function deleteMeal(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("meals", "readwrite");
        tx.objectStore("meals").delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* ---------------- Image handling ---------------- */
  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  function resizeToDataUrl(img, maxEdge, quality) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL("image/jpeg", quality);
  }

  /* ---------------- DOM refs ---------------- */
  var captureBtn = document.getElementById("captureBtn");
  var photoInput = document.getElementById("photoInput");
  var captureHint = document.getElementById("captureHint");
  var stage = document.getElementById("stage");
  var scanRow = document.getElementById("scanRow");
  var scanThumb = document.getElementById("scanThumb");
  var result = document.getElementById("result");
  var errorBox = document.getElementById("errorBox");
  var errorText = document.getElementById("errorText");
  var errorRetryBtn = document.getElementById("errorRetryBtn");
  var againBtn = document.getElementById("againBtn");

  var resultThumb = document.getElementById("resultThumb");
  var resultName = document.getElementById("resultName");
  var resultConfidence = document.getElementById("resultConfidence");
  var factCalories = document.getElementById("factCalories");
  var barProtein = document.getElementById("barProtein");
  var barCarbs = document.getElementById("barCarbs");
  var barFat = document.getElementById("barFat");
  var valProtein = document.getElementById("valProtein");
  var valCarbs = document.getElementById("valCarbs");
  var valFat = document.getElementById("valFat");
  var coachText = document.getElementById("coachText");
  var breakdownNote = document.getElementById("breakdownNote");
  var shareBtn = document.getElementById("shareBtn");

  var logEmpty = document.getElementById("logEmpty");
  var logDays = document.getElementById("logDays");
  var summaryBtn = document.getElementById("summaryBtn");
  var summaryCard = document.getElementById("summaryCard");
  var summaryLoading = document.getElementById("summaryLoading");
  var summaryText = document.getElementById("summaryText");
  var summaryError = document.getElementById("summaryError");

  var goalSetPrompt = document.getElementById("goalSetPrompt");
  var goalProgress = document.getElementById("goalProgress");
  var goalCustomInput = document.getElementById("goalCustomInput");
  var goalCustomBtn = document.getElementById("goalCustomBtn");
  var goalEditBtn = document.getElementById("goalEditBtn");
  var goalBarCalories = document.getElementById("goalBarCalories");
  var goalBarProtein = document.getElementById("goalBarProtein");
  var goalBarCarbs = document.getElementById("goalBarCarbs");
  var goalBarFat = document.getElementById("goalBarFat");
  var goalValCalories = document.getElementById("goalValCalories");
  var goalValProtein = document.getElementById("goalValProtein");
  var goalValCarbs = document.getElementById("goalValCarbs");
  var goalValFat = document.getElementById("goalValFat");

  var feedbackToggle = document.getElementById("feedbackToggle");
  var feedbackForm = document.getElementById("feedbackForm");
  var feedbackText = document.getElementById("feedbackText");
  var feedbackSendBtn = document.getElementById("feedbackSendBtn");
  var feedbackSent = document.getElementById("feedbackSent");

  var currentMeal = null;

  /* ---------------- Lightweight anonymous events ----------------
     Fire-and-forget behavioral signals — no personal data, just a named
     counter server-side. Must never block or affect the feature itself. */
  function sendEvent(name) {
    try {
      var payload = JSON.stringify({ event: name, deviceId: deviceId });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/event", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* ignore — analytics must never break the feature */ }
  }

  var CONFIDENCE_LABEL = {
    high: "مستوى ثقة لُقْمَة في دقة التحليل: عالية",
    medium: "مستوى ثقة لُقْمَة في دقة التحليل: متوسطة",
    low: "مستوى ثقة لُقْمَة في دقة التحليل: منخفضة — تقدير تقريبي فقط"
  };

  var busy = false;
  var lastFile = null;

  /* ---------------- Capture flow ---------------- */
  captureBtn.addEventListener("click", function () {
    if (busy) return;
    photoInput.value = "";
    photoInput.click();
  });

  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showTopLevelError("الصورة غير صالحة. حاول مرة أخرى.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showTopLevelError("حجم الصورة كبير جداً. جرب صورة أخرى.");
      return;
    }
    lastFile = file;
    runAnalysis(file);
  });

  function showTopLevelError(msg) {
    stage.hidden = false;
    scanRow.hidden = true;
    result.hidden = true;
    errorBox.hidden = false;
    errorText.textContent = msg;
  }

  function runAnalysis(file) {
    busy = true;
    captureBtn.disabled = true;
    stage.hidden = false;
    scanRow.hidden = false;
    result.hidden = true;
    errorBox.hidden = true;

    var analysisDataUrl, thumbDataUrl;

    fileToImage(file)
      .then(function (img) {
        analysisDataUrl = resizeToDataUrl(img, 1024, 0.75);
        thumbDataUrl = resizeToDataUrl(img, 240, 0.7);
        scanThumb.src = thumbDataUrl;

        var base64 = analysisDataUrl.split(",")[1];
        return fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType: "image/jpeg", deviceId: deviceId })
        });
      })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        // Any real model call costs money even when the result is "not food"
        // or unclear, so the counter updates regardless of ok/not-ok below.
        if (r.data) addCost(r.data.costSar);

        if (!r.ok || !r.data || r.data.ok === false) {
          var msg = (r.data && r.data.errorAr) || "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ.";
          showTopLevelError(msg);
          return;
        }
        var meal = r.data;
        var now = Date.now();
        var d = new Date(now);
        var day = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

        var record = {
          timestamp: now,
          day: day,
          dishNameAr: meal.dishNameAr,
          calories: meal.calories,
          proteinG: meal.proteinG,
          carbsG: meal.carbsG,
          fatG: meal.fatG,
          confidence: meal.confidence,
          breakdownAr: meal.breakdownAr,
          adviceAr: meal.adviceAr,
          thumbnail: thumbDataUrl
        };

        showResult(record);

        return addMeal(record).then(refreshLog);
      })
      .catch(function () {
        showTopLevelError("تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت.");
      })
      .then(function () {
        busy = false;
        captureBtn.disabled = false;
      });
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function showResult(m) {
    stage.hidden = false;
    scanRow.hidden = true;
    errorBox.hidden = true;
    renderResult(m);
    result.hidden = false;
  }

  function openMealDetail(m) {
    lastFile = null;
    showResult(m);
    stage.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderResult(m) {
    currentMeal = m;
    resultThumb.src = m.thumbnail;
    resultName.textContent = m.dishNameAr;
    resultConfidence.textContent = CONFIDENCE_LABEL[m.confidence] || "";
    factCalories.textContent = m.calories;

    var maxMacro = Math.max(m.proteinG, m.carbsG, m.fatG, 1);
    barProtein.style.width = (m.proteinG / maxMacro * 100) + "%";
    barCarbs.style.width = (m.carbsG / maxMacro * 100) + "%";
    barFat.style.width = (m.fatG / maxMacro * 100) + "%";
    valProtein.textContent = m.proteinG;
    valCarbs.textContent = m.carbsG;
    valFat.textContent = m.fatG;

    breakdownNote.hidden = !m.breakdownAr;
    breakdownNote.textContent = m.breakdownAr || "";

    coachText.textContent = m.adviceAr;
  }

  againBtn.addEventListener("click", function () {
    stage.hidden = true;
    photoInput.value = "";
    photoInput.click();
  });

  errorRetryBtn.addEventListener("click", function () {
    if (lastFile) { runAnalysis(lastFile); return; }
    photoInput.value = "";
    photoInput.click();
  });

  /* ---------------- Meal log ---------------- */
  var DAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  function dayLabel(dayStr) {
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
    var yesterday = new Date(today.getTime() - 86400000);
    var yesterdayStr = yesterday.getFullYear() + "-" + pad(yesterday.getMonth() + 1) + "-" + pad(yesterday.getDate());
    if (dayStr === todayStr) return "اليوم";
    if (dayStr === yesterdayStr) return "أمس";
    var parts = dayStr.split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return DAY_NAMES_AR[d.getDay()] + " " + parts[2] + "/" + parts[1];
  }

  function refreshLog() {
    return getAllMeals().then(function (meals) {
      meals.sort(function (a, b) { return b.timestamp - a.timestamp; });

      logEmpty.hidden = meals.length > 0;
      logDays.innerHTML = "";
      summaryBtn.hidden = meals.length < 3;

      var groups = [];
      var groupMap = {};
      meals.forEach(function (m) {
        if (!groupMap[m.day]) {
          groupMap[m.day] = [];
          groups.push(m.day);
        }
        groupMap[m.day].push(m);
      });

      groups.forEach(function (day) {
        var section = document.createElement("div");
        section.className = "day-group";

        var label = document.createElement("p");
        label.className = "day-label";
        label.textContent = dayLabel(day);
        section.appendChild(label);

        groupMap[day].forEach(function (m) {
          section.appendChild(buildMealRow(m));
        });

        logDays.appendChild(section);
      });

      renderGoalProgress(meals);
    });
  }

  function buildMealRow(m) {
    var row = document.createElement("div");
    row.className = "meal-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "عرض تفاصيل " + m.dishNameAr);
    row.addEventListener("click", function () { openMealDetail(m); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMealDetail(m); }
    });

    var img = document.createElement("img");
    img.src = m.thumbnail;
    img.alt = "";
    row.appendChild(img);

    var info = document.createElement("div");
    info.className = "meal-info";
    var name = document.createElement("p");
    name.className = "meal-name";
    name.textContent = m.dishNameAr;
    var meta = document.createElement("span");
    meta.className = "meal-meta";
    var t = new Date(m.timestamp);
    meta.textContent = pad(t.getHours()) + ":" + pad(t.getMinutes());
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    var cal = document.createElement("span");
    cal.className = "meal-cal";
    cal.textContent = m.calories;
    row.appendChild(cal);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.setAttribute("aria-label", "حذف");
    del.textContent = "×";
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      if (Date.now() - m.timestamp < 10 * 60 * 1000) sendEvent("meal_deleted_soon");
      deleteMeal(m.id).then(refreshLog);
    });
    row.appendChild(del);

    return row;
  }

  /* ---------------- Daily goal ---------------- */
  var GOAL_PRESETS = {
    cut: { calories: 1600, proteinG: 130, carbsG: 140, fatG: 53 },
    maintain: { calories: 2000, proteinG: 120, carbsG: 220, fatG: 71 },
    build: { calories: 2400, proteinG: 150, carbsG: 280, fatG: 76 }
  };

  function goalFromCalories(calories) {
    return {
      calories: calories,
      proteinG: Math.round(calories * 0.30 / 4),
      carbsG: Math.round(calories * 0.40 / 4),
      fatG: Math.round(calories * 0.30 / 9)
    };
  }

  function getGoal() {
    try {
      var raw = localStorage.getItem("luqma_goal");
      if (!raw) return null;
      var g = JSON.parse(raw);
      if (g && typeof g.calories === "number" && g.calories > 0) return g;
      return null;
    } catch (e) {
      return null;
    }
  }

  function setGoal(goal) {
    try { localStorage.setItem("luqma_goal", JSON.stringify(goal)); } catch (e) {}
  }

  function clearGoal() {
    try { localStorage.removeItem("luqma_goal"); } catch (e) {}
  }

  function todayTotals(meals) {
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
    var t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    meals.forEach(function (m) {
      if (m.day !== todayStr) return;
      t.calories += m.calories;
      t.proteinG += m.proteinG;
      t.carbsG += m.carbsG;
      t.fatG += m.fatG;
    });
    return t;
  }

  function setGoalRow(barEl, valEl, current, goal, unit) {
    var pct = goal > 0 ? Math.min(100, Math.round(current / goal * 100)) : 0;
    barEl.style.width = pct + "%";
    valEl.textContent = current + " / " + goal + (unit ? " " + unit : "");
  }

  function renderGoalProgress(meals) {
    var goal = getGoal();
    if (!goal) {
      goalSetPrompt.hidden = false;
      goalProgress.hidden = true;
      return;
    }
    goalSetPrompt.hidden = true;
    goalProgress.hidden = false;
    var totals = todayTotals(meals);
    setGoalRow(goalBarCalories, goalValCalories, totals.calories, goal.calories, "سعرة");
    setGoalRow(goalBarProtein, goalValProtein, totals.proteinG, goal.proteinG, "غ");
    setGoalRow(goalBarCarbs, goalValCarbs, totals.carbsG, goal.carbsG, "غ");
    setGoalRow(goalBarFat, goalValFat, totals.fatG, goal.fatG, "غ");
  }

  Array.prototype.forEach.call(document.querySelectorAll(".goal-preset-btn[data-preset]"), function (btn) {
    btn.addEventListener("click", function () {
      setGoal(GOAL_PRESETS[btn.getAttribute("data-preset")]);
      getAllMeals().then(renderGoalProgress);
    });
  });

  goalCustomBtn.addEventListener("click", function () {
    var calories = parseInt(goalCustomInput.value, 10);
    if (!calories || calories < 500 || calories > 6000) return;
    setGoal(goalFromCalories(calories));
    goalCustomInput.value = "";
    getAllMeals().then(renderGoalProgress);
  });

  goalEditBtn.addEventListener("click", function () {
    clearGoal();
    goalSetPrompt.hidden = false;
    goalProgress.hidden = true;
  });

  /* ---------------- Aggregate summary ---------------- */
  summaryBtn.addEventListener("click", function () {
    summaryCard.hidden = false;
    summaryLoading.hidden = false;
    summaryText.hidden = true;
    summaryError.hidden = true;
    summaryCard.scrollIntoView({ behavior: "smooth", block: "start" });

    getAllMeals().then(function (meals) {
      if (meals.length === 0) return;
      var days = {};
      var totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
      meals.forEach(function (m) {
        days[m.day] = true;
        totalCalories += m.calories;
        totalProtein += m.proteinG;
        totalCarbs += m.carbsG;
        totalFat += m.fatG;
      });
      var dayCount = Object.keys(days).length || 1;
      var mealCount = meals.length;
      var macroSum = totalProtein + totalCarbs + totalFat;

      var stats = {
        totalMeals: mealCount,
        dateRangeDays: dayCount,
        avgCalories: Math.round(totalCalories / mealCount),
        avgProteinG: Math.round(totalProtein / mealCount),
        avgCarbsG: Math.round(totalCarbs / mealCount),
        avgFatG: Math.round(totalFat / mealCount),
        proteinRatioPct: macroSum ? Math.round(totalProtein / macroSum * 100) : 0,
        carbRatioPct: macroSum ? Math.round(totalCarbs / macroSum * 100) : 0,
        fatRatioPct: macroSum ? Math.round(totalFat / macroSum * 100) : 0
      };

      return fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats: stats })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (r) {
          summaryLoading.hidden = true;
          if (r.data) addCost(r.data.costSar);
          if (!r.ok || !r.data || r.data.ok === false) {
            summaryError.hidden = false;
            summaryError.textContent = (r.data && r.data.errorAr) || "حدث خطأ في الخادم، حاول لاحقاً. تواصل مع عصام لإصلاح الخطأ.";
            return;
          }
          summaryText.hidden = false;
          summaryText.textContent = r.data.summaryAr;
        });
    }).catch(function () {
      summaryLoading.hidden = true;
      summaryError.hidden = false;
      summaryError.textContent = "تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت.";
    });
  });

  /* ---------------- Share card ----------------
     Rendered entirely client-side with Canvas — no API call, no cost.
     Handed to the Web Share API where available (native share sheet on
     mobile), falling back to a plain download on desktop. */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.max(w / iw, h / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    var words = text.split(" ");
    var line = "", lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    var startY = y - (lines.length - 1) * lineHeight / 2;
    lines.forEach(function (l, idx) { ctx.fillText(l, cx, startY + idx * lineHeight); });
  }

  function drawShareCard(m) {
    return document.fonts.ready.then(function () {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          try {
            var W = 1080, H = 1350;
            var canvas = document.createElement("canvas");
            canvas.width = W;
            canvas.height = H;
            var ctx = canvas.getContext("2d");

            ctx.fillStyle = "#f5f6f1";
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "#e2a93a";
            ctx.fillRect(0, 0, W, 18);

            var photoSize = 640, photoX = (W - photoSize) / 2, photoY = 140;
            ctx.save();
            roundRectPath(ctx, photoX, photoY, photoSize, photoSize, 32);
            ctx.clip();
            drawImageCover(ctx, img, photoX, photoY, photoSize, photoSize);
            ctx.restore();

            ctx.direction = "rtl";
            ctx.textAlign = "center";

            ctx.fillStyle = "#20241d";
            ctx.font = "700 56px Tajawal, sans-serif";
            wrapText(ctx, m.dishNameAr, W / 2, photoY + photoSize + 90, W - 160, 64);

            ctx.font = "800 84px Tajawal, sans-serif";
            ctx.fillText(m.calories + " سعرة", W / 2, photoY + photoSize + 210);

            ctx.font = "500 34px Tajawal, sans-serif";
            ctx.fillStyle = "#5b6355";
            ctx.fillText(
              "بروتين " + m.proteinG + "غ   ·   كارب " + m.carbsG + "غ   ·   دهون " + m.fatG + "غ",
              W / 2, photoY + photoSize + 280
            );

            ctx.font = "800 44px Tajawal, sans-serif";
            ctx.fillStyle = "#c98a1f";
            ctx.fillText("لُقْمَة", W / 2, H - 90);
            ctx.font = "400 26px Tajawal, sans-serif";
            ctx.fillStyle = "#8b9282";
            ctx.fillText("صوّر وجبتك، واعرف ما فيها", W / 2, H - 50);

            resolve(canvas);
          } catch (e) { reject(e); }
        };
        img.onerror = reject;
        img.src = m.thumbnail;
      });
    });
  }

  shareBtn.addEventListener("click", function () {
    if (!currentMeal) return;
    shareBtn.disabled = true;
    drawShareCard(currentMeal).then(function (canvas) {
      canvas.toBlob(function (blob) {
        shareBtn.disabled = false;
        if (!blob) return;
        var file = new File([blob], "luqma.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "لُقْمَة", text: currentMeal.dishNameAr }).catch(function () {});
        } else {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "luqma.png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        }
      }, "image/png");
    }).catch(function () {
      shareBtn.disabled = false;
    });
  });

  /* ---------------- Feedback ---------------- */
  feedbackToggle.addEventListener("click", function () {
    feedbackForm.hidden = !feedbackForm.hidden;
  });

  feedbackSendBtn.addEventListener("click", function () {
    var msg = feedbackText.value.trim();
    if (!msg) return;
    feedbackSendBtn.disabled = true;
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, deviceId: deviceId })
    })
      .then(function () {
        feedbackText.value = "";
        feedbackSent.hidden = false;
        setTimeout(function () { feedbackForm.hidden = true; feedbackSent.hidden = true; }, 2500);
      })
      .catch(function () {})
      .then(function () { feedbackSendBtn.disabled = false; });
  });

  /* ---------------- Init ---------------- */
  refreshLog();
})();
