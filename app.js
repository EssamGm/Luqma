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

  var logEmpty = document.getElementById("logEmpty");
  var logDays = document.getElementById("logDays");
  var summaryBtn = document.getElementById("summaryBtn");
  var summaryCard = document.getElementById("summaryCard");
  var summaryLoading = document.getElementById("summaryLoading");
  var summaryText = document.getElementById("summaryText");
  var summaryError = document.getElementById("summaryError");

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
          body: JSON.stringify({ image: base64, mediaType: "image/jpeg" })
        });
      })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
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
      deleteMeal(m.id).then(refreshLog);
    });
    row.appendChild(del);

    return row;
  }

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

  /* ---------------- Init ---------------- */
  refreshLog();
})();
