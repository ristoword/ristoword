/**
 * Ristoword i18n - frontend-only internationalization
 * Loads JSON from /i18n/{lang}.json and replaces text on elements with data-i18n attribute.
 * Supports data-i18n-placeholder for input placeholders.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "rw_lang";
  const SUPPORTED = ["it", "en", "nl"];
  const DEFAULT_LANG = "it";

  let translations = {};
  let currentLang = DEFAULT_LANG;

  function getSavedLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) {}
    return DEFAULT_LANG;
  }

  function setSavedLang(lang) {
    try {
      if (SUPPORTED.includes(lang)) {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (_) {}
  }

  async function loadTranslations(lang) {
    const url = "/i18n/" + lang + ".json";
    const res = await fetch(url);
    if (!res.ok) throw new Error("i18n load failed: " + res.status);
    return res.json();
  }

  function isLoggedIn() {
    try {
      const raw = localStorage.getItem("rw_auth");
      if (!raw) return false;
      const auth = JSON.parse(raw);
      return !!(auth && auth.user);
    } catch (_) {
      return false;
    }
  }

  function applyTranslations() {
    const loggedIn = isLoggedIn();
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      if (el.id === "user-name-label" && loggedIn) return;
      const key = el.getAttribute("data-i18n");
      const t = translations[key];
      if (t !== undefined && t !== null) {
        el.textContent = t;
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-placeholder");
      const t = translations[key];
      if (t !== undefined && t !== null) {
        el.placeholder = t;
      }
    });
    document.documentElement.lang = currentLang;
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("i18n:updated", { detail: { lang: currentLang } }));
    }
  }

  async function switchLanguage(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try {
      translations = await loadTranslations(lang);
      currentLang = lang;
      setSavedLang(lang);
      applyTranslations();
      updateLangSelector();
    } catch (err) {
      console.warn("i18n: failed to load " + lang, err);
    }
  }

  function updateLangSelector() {
    document.querySelectorAll(".lang-option").forEach(function (btn) {
      const l = btn.getAttribute("data-lang");
      if (l === currentLang) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
      }
    });
  }

  function initLangSelector() {
    const container = document.getElementById("lang-selector");
    if (!container) return;
    ["it", "en", "nl"].forEach(function (code) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lang-option" + (code === currentLang ? " active" : "");
      btn.setAttribute("data-lang", code);
      btn.setAttribute("aria-pressed", code === currentLang ? "true" : "false");
      btn.setAttribute("aria-label", "Language: " + code.toUpperCase());
      btn.textContent = code.toUpperCase();
      btn.addEventListener("click", function () {
        switchLanguage(code);
      });
      container.appendChild(btn);
    });
  }

  async function init() {
    currentLang = getSavedLang();
    try {
      translations = await loadTranslations(currentLang);
    } catch (_) {
      if (currentLang !== DEFAULT_LANG) {
        currentLang = DEFAULT_LANG;
        try {
          translations = await loadTranslations(DEFAULT_LANG);
        } catch (e) {
          return;
        }
      } else {
        return;
      }
    }
    applyTranslations();
    initLangSelector();
  }

  window.RistowordI18n = {
    getLang: function () {
      return currentLang;
    },
    setLang: switchLanguage,
    t: function (key) {
      return translations[key] !== undefined ? translations[key] : key;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
