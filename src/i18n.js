/**
 * =====================================================================
 * @domain:    core
 * @concern:   Internationalization (i18n) — EN, ES, ZH, HI
 * @created:   2026-06-24T15:00:00Z
 * @track:     5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b
 * @version:   1.0.0
 * @security:  Client-Side (UI Strings / No Secrets)
 * =====================================================================
 *
 * i18n module providing localized strings for all user-facing text.
 * Supports four languages: English, Spanish, Mandarin Chinese, Hindi.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from './i18n.js';
 *   setLocale('es');
 *   console.log(t('shop.title')); // "Tienda"
 *
 * Locale is auto-detected from navigator.language and persisted to localStorage.
 * Falls back to English for unsupported locales.
 */

// ---------------------------------------------------------------------------
// Supported Locales
// ---------------------------------------------------------------------------

const LOCALES = ['en', 'es', 'zh', 'hi'];
const DEFAULT_LOCALE = 'en';

// ---------------------------------------------------------------------------
// Translation Strings
// ---------------------------------------------------------------------------

const STRINGS = {
  // --- General UI ---
  'app.title': {
    en: 'Going Balls — Quad-Core Edition',
    es: 'Going Balls — Edición Quad-Core',
    zh: 'Going Balls — 四核版',
    hi: 'Going Balls — क्वाड-कोर संस्करण',
  },
  'app.version': {
    en: 'Version',
    es: 'Versión',
    zh: '版本',
    hi: 'संस्करण',
  },
  'loading.title': {
    en: 'LOADING',
    es: 'CARGANDO',
    zh: '加载中',
    hi: 'लोड हो रहा है',
  },
  'loading.assets': {
    en: 'Loading assets...',
    es: 'Cargando recursos...',
    zh: '加载资源...',
    hi: 'संसाधन लोड हो रहे हैं...',
  },
  'loading.physics': {
    en: 'Initializing physics...',
    es: 'Inicializando física...',
    zh: '初始化物理引擎...',
    hi: 'भौतिकी आरंभ हो रही है...',
  },
  'loading.scene': {
    en: 'Building scene...',
    es: 'Construyendo escena...',
    zh: '构建场景...',
    hi: 'दृश्य बनाया जा रहा है...',
  },
  'loading.audio': {
    en: 'Initializing audio...',
    es: 'Inicializando audio...',
    zh: '初始化音频...',
    hi: 'ऑडियो आरंभ हो रहा है...',
  },
  'loading.cores': {
    en: 'Booting Quad-Core IPC...',
    es: 'Iniciando IPC Quad-Core...',
    zh: '启动四核 IPC...',
    hi: 'क्वाड-कोर IPC शुरू हो रहा है...',
  },
  'loading.ready': {
    en: 'Ready!',
    es: '¡Listo!',
    zh: '准备就绪！',
    hi: 'तैयार!',
  },

  // --- Shop ---
  'shop.title': {
    en: 'Shop',
    es: 'Tienda',
    zh: '商店',
    hi: 'दुकान',
  },
  'shop.skins': {
    en: 'Skins',
    es: 'Pieles',
    zh: '皮肤',
    hi: 'स्किन्स',
  },
  'shop.skies': {
    en: 'Skies',
    es: 'Cielos',
    zh: '天空',
    hi: 'आसमान',
  },
  'shop.powerups': {
    en: 'Powerups',
    es: 'Mejoras',
    zh: '道具',
    hi: 'पावरअप',
  },
  'shop.buy': {
    en: 'BUY',
    es: 'COMPRAR',
    zh: '购买',
    hi: 'खरीदें',
  },
  'shop.equip': {
    en: 'EQUIP',
    es: 'EQUIPAR',
    zh: '装备',
    hi: 'लैस करें',
  },
  'shop.equipped': {
    en: 'EQUIPPED',
    es: 'EQUIPADO',
    zh: '已装备',
    hi: 'लैस',
  },
  'shop.owned': {
    en: 'OWNED',
    es: 'POSEE',
    zh: '已拥有',
    hi: 'स्वामित्व',
  },
  'shop.selected': {
    en: 'SELECTED',
    es: 'SELECCIONADO',
    zh: '已选择',
    hi: 'चयनित',
  },

  // --- Game UI ---
  'game.coins': {
    en: 'Coins',
    es: 'Monedas',
    zh: '金币',
    hi: 'सिक्के',
  },
  'game.progress': {
    en: 'Progress',
    es: 'Progreso',
    zh: '进度',
    hi: 'प्रगति',
  },
  'game.time': {
    en: 'Time',
    es: 'Tiempo',
    zh: '时间',
    hi: 'समय',
  },
  'game.score': {
    en: 'Score',
    es: 'Puntuación',
    zh: '得分',
    hi: 'स्कोर',
  },
  'game.level': {
    en: 'Level',
    es: 'Nivel',
    zh: '关卡',
    hi: 'स्तर',
  },

  // --- Game States ---
  'game.level_complete': {
    en: 'Level Complete!',
    es: '¡Nivel Completado!',
    zh: '关卡完成！',
    hi: 'स्तर पूरा हुआ!',
  },
  'game.you_fell': {
    en: 'You Fell!',
    es: '¡Caíste!',
    zh: '你掉下去了！',
    hi: 'आप गिर गए!',
  },
  'game.retry': {
    en: 'Retry',
    es: 'Reintentar',
    zh: '重试',
    hi: 'पुनः प्रयास करें',
  },
  'game.next_level': {
    en: 'Next Level',
    es: 'Siguiente Nivel',
    zh: '下一关',
    hi: 'अगला स्तर',
  },
  'game.time_bonus': {
    en: 'Time Bonus',
    es: 'Bonus de Tiempo',
    zh: '时间奖励',
    hi: 'समय बोनस',
  },

  // --- Shop Tiers ---
  'tier.basic.name': {
    en: 'Basic',
    es: 'Básico',
    zh: '基础版',
    hi: 'बेसिक',
  },
  'tier.pro.name': {
    en: 'Pro',
    es: 'Pro',
    zh: '专业版',
    hi: 'प्रो',
  },
  'tier.ultimate.name': {
    en: 'Ultimate',
    es: 'Ultimate',
    zh: '终极版',
    hi: 'अल्टीमेट',
  },
  'tier.basic.desc': {
    en: 'Basic ball skin, ad-free play, cloud saves',
    es: 'Piel básica, juego sin anuncios, guardado en la nube',
    zh: '基础皮肤、无广告、云存档',
    hi: 'बेसिक बॉल स्किन, विज्ञापन-मुक्त खेल, क्लाउड सेव',
  },
  'tier.pro.desc': {
    en: 'All Basic perks + 3 premium skins, double coin weekends',
    es: 'Todos los beneficios Básicos + 3 pieles premium, fines de semana de monedas dobles',
    zh: '所有基础权益 + 3款高级皮肤、周末双倍金币',
    hi: 'सभी बेसिक लाभ + 3 प्रीमियम स्किन, डबल कॉइन वीकेंड',
  },
  'tier.ultimate.desc': {
    en: 'ALL skins, ALL skies, unlimited track builder, VIP badge',
    es: 'TODAS las pieles, TODOS los cielos, constructor ilimitado, insignia VIP',
    zh: '所有皮肤、所有天空、无限赛道建造、VIP徽章',
    hi: 'सभी स्किन, सभी आसमान, असीमित ट्रैक बिल्डर, VIP बैज',
  },

  // --- Monetization ---
  'shop.upsell.title': {
    en: 'Upgrade to Ultimate!',
    es: '¡Mejora a Ultimate!',
    zh: '升级到终极版！',
    hi: 'अल्टीमेट में अपग्रेड करें!',
  },
  'shop.upsell.desc': {
    en: 'Only {diff} more coins for ALL content!',
    es: '¡Solo {diff} monedas más para TODO el contenido!',
    zh: '仅需 {diff} 金币即可获得所有内容！',
    hi: 'सभी सामग्री के लिए केवल {diff} सिक्के और!',
  },
  'shop.stamps': {
    en: 'Battle Pass Progress: {current}/{total}',
    es: 'Progreso del Pase: {current}/{total}',
    zh: '战斗通行证进度：{current}/{total}',
    hi: 'बैटल पास प्रगति: {current}/{total}',
  },

  // --- Leaderboard ---
  'leaderboard.title': {
    en: 'Leaderboard',
    es: 'Clasificación',
    zh: '排行榜',
    hi: 'लीडरबोर्ड',
  },
  'leaderboard.empty': {
    en: 'No entries yet!',
    es: '¡Sin entradas aún!',
    zh: '暂无记录！',
    hi: 'अभी तक कोई प्रविष्टि नहीं!',
  },

  // --- Settings ---
  'settings.title': {
    en: 'Settings',
    es: 'Ajustes',
    zh: '设置',
    hi: 'सेटिंग्स',
  },
  'settings.language': {
    en: 'Language',
    es: 'Idioma',
    zh: '语言',
    hi: 'भाषा',
  },
  'settings.joystick': {
    en: 'Joystick Deadzone',
    es: 'Zona muerta del joystick',
    zh: '摇杆死区',
    hi: 'जॉयस्टिक डेडज़ोन',
  },
  'settings.power': {
    en: 'Joystick Power',
    es: 'Potencia del joystick',
    zh: '摇杆力度',
    hi: 'जॉयस्टिक पावर',
  },

  // --- Help ---
  'help.title': {
    en: 'How to Play',
    es: 'Cómo Jugar',
    zh: '游戏说明',
    hi: 'कैसे खेलें',
  },
  'help.desktop': {
    en: 'Desktop: WASD/Arrows to steer · Space to jump · Drag mouse to look around',
    es: 'Escritorio: WASD/Flechas para mover · Espacio para saltar · Arrastrar ratón para mirar',
    zh: '桌面：WASD/方向键移动 · 空格跳跃 · 拖动鼠标环顾',
    hi: 'डेस्कटॉप: WASD/तीर चलाने के लिए · Space कूदने के लिए · माउस खींचें देखने के लिए',
  },
  'help.mobile': {
    en: 'Mobile: On-screen joystick to move · Jump button to hop',
    es: 'Móvil: Joystick en pantalla para mover · Botón de salto para saltar',
    zh: '移动：屏幕摇杆移动 · 跳跃按钮跳跃',
    hi: 'मोबाइल: ऑन-स्क्रीन जॉयस्टिक चलाने के लिए · जंप बटन कूदने के लिए',
  },
  'help.goal': {
    en: 'Goal: Roll to the green finish line! Collect coins and avoid hazards.',
    es: 'Objetivo: ¡Rueda hasta la línea de meta verde! Recoge monedas y evita obstáculos.',
    zh: '目标：滚到绿色终点线！收集金币并避开障碍物。',
    hi: 'लक्ष्य: हरी फिनिश लाइन तक रोल करें! सिक्के इकट्ठा करें और खतरों से बचें।',
  },

  // --- Modals ---
  'modal.close': {
    en: 'Close',
    es: 'Cerrar',
    zh: '关闭',
    hi: 'बंद करें',
  },
  'modal.ok': {
    en: 'OK',
    es: 'OK',
    zh: '确定',
    hi: 'ठीक है',
  },
  'modal.cancel': {
    en: 'Cancel',
    es: 'Cancelar',
    zh: '取消',
    hi: 'रद्द करें',
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _currentLocale = DEFAULT_LOCALE;

// Auto-detect locale from browser
try {
  const stored = localStorage.getItem('goingBalls_locale');
  if (stored && LOCALES.includes(stored)) {
    _currentLocale = stored;
  } else {
    const browserLang = (navigator.language || '').slice(0, 2);
    if (LOCALES.includes(browserLang)) {
      _currentLocale = browserLang;
    }
  }
} catch (e) {
  _currentLocale = DEFAULT_LOCALE;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a localized string.
 * @param {string} key - Dot-notation string key
 * @param {Object} [params] - Optional interpolation parameters (e.g., { current: 3, total: 10 })
 * @returns {string} Localized string, or the key itself if not found
 */
export function t(key, params = {}) {
  const translations = STRINGS[key];
  if (!translations) {
    console.warn(`[i18n] Missing translation key: "${key}"`);
    return key;
  }

  let str = translations[_currentLocale] || translations[DEFAULT_LOCALE] || key;

  // Interpolate {param} placeholders
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, String(v));
  }

  return str;
}

/**
 * Set the active locale.
 * @param {string} locale - One of 'en', 'es', 'zh', 'hi'
 */
export function setLocale(locale) {
  if (!LOCALES.includes(locale)) {
    console.warn(`[i18n] Unsupported locale: "${locale}". Falling back to "${DEFAULT_LOCALE}".`);
    _currentLocale = DEFAULT_LOCALE;
  } else {
    _currentLocale = locale;
  }
  try {
    localStorage.setItem('goingBalls_locale', _currentLocale);
  } catch (e) {}
}

/**
 * Get the currently active locale.
 * @returns {string} Current locale code
 */
export function getLocale() {
  return _currentLocale;
}

/**
 * Get all supported locales with their display names.
 * @returns {Array<{ code: string, name: string }>}
 */
export function getSupportedLocales() {
  return [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'zh', name: '中文' },
    { code: 'hi', name: 'हिन्दी' },
  ];
}
