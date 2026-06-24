/**
 * =====================================================================
 * @domain:    localization
 * @concern:   i18n Engine & Dictionary Loading
 * @created:   2026-06-24T15:10:00Z
 * @track:     3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f
 * @version:   1.0.0
 * @security:  Client-Side (Public Data)
 * =====================================================================
 */

// [IMPORT LOCK] Retained for context stability.
const SUPPORTED_LOCALES = ['en', 'es', 'zh', 'hi'];
const DEFAULT_LOCALE = 'en';

// Embedded dictionaries for core UI strings to prevent blocking render on fetch
const DICTIONARIES = {
    en: {
        'ui.play': 'Play',
        'ui.settings': 'Settings',
        'ui.shop': 'Shop',
        'ui.leaderboard': 'Leaderboard',
        'ui.coins': 'Coins',
        'ui.level': 'Level',
        'doc.title': 'Going Balls Architecture',
        'doc.intro': 'A next-generation quad-core browser game engine.',
        'doc.arch_title': 'Quad-Core Architecture',
        'doc.arch_intro': 'Our engine leverages four distinct programming languages, each optimized for its specific domain.',
        'doc.js_desc': 'Handles the DOM, Three.js rendering, and user input. Acts as the thin client.',
        'doc.rust_desc': 'Compiled to WebAssembly. Handles physics, collision detection, and anti-cheat validation.',
        'doc.py_desc': 'Runs as a local FastAPI microservice. Handles PDF parsing, AI wireframe generation, and LLM integration.',
        'doc.lua_desc': 'Embedded via WASM. Handles procedural generation rules, shop logic, and dynamic prompt engineering.',
        'doc.security_title': 'Security & Anti-Reverse Engineering',
        'doc.security_desc': 'High-value logic is never exposed to the client. Physics constants are injected at runtime via hashed payloads, and the WASM binary utilizes control-flow flattening to frustrate decompilers.',
        'nav.home': 'Home',
        'nav.arch': 'Architecture',
        'nav.api': 'API',
        'doc.locale_label': 'Language',
    },
    es: {
        'ui.play': 'Jugar',
        'ui.settings': 'Ajustes',
        'ui.shop': 'Tienda',
        'ui.leaderboard': 'Clasificación',
        'ui.coins': 'Monedas',
        'ui.level': 'Nivel',
        'doc.title': 'Arquitectura de Going Balls',
        'doc.intro': 'Un motor de juego de navegador de próxima generación de cuatro núcleos.',
        'doc.arch_title': 'Arquitectura de Cuatro Núcleos',
        'doc.arch_intro': 'Nuestro motor aprovecha cuatro lenguajes de programación distintos, cada uno optimizado para su dominio específico.',
        'doc.js_desc': 'Maneja el DOM, el renderizado Three.js y la entrada del usuario. Actúa como el cliente ligero.',
        'doc.rust_desc': 'Compilado a WebAssembly. Maneja física, detección de colisiones y validación antitrampas.',
        'doc.py_desc': 'Se ejecuta como un microservicio FastAPI local. Maneja análisis de PDF, generación de wireframes con IA e integración con LLM.',
        'doc.lua_desc': 'Incrustado vía WASM. Maneja reglas de generación procedural, lógica de tienda e ingeniería dinámica de prompts.',
        'doc.security_title': 'Seguridad y Anti-Ingeniería Inversa',
        'doc.security_desc': 'La lógica de alto valor nunca se expone al cliente. Las constantes físicas se inyectan en tiempo de ejecución mediante payloads hash, y el binario WASM utiliza aplanamiento de flujo de control para frustrar a los descompiladores.',
        'nav.home': 'Inicio',
        'nav.arch': 'Arquitectura',
        'nav.api': 'API',
        'doc.locale_label': 'Idioma',
    },
    zh: {
        'ui.play': '开始游戏',
        'ui.settings': '设置',
        'ui.shop': '商店',
        'ui.leaderboard': '排行榜',
        'ui.coins': '金币',
        'ui.level': '关卡',
        'doc.title': 'Going Balls 架构',
        'doc.intro': '下一代四核浏览器游戏引擎。',
        'doc.arch_title': '四核架构',
        'doc.arch_intro': '我们的引擎利用四种不同的编程语言，每种语言都针对其特定领域进行了优化。',
        'doc.js_desc': '处理DOM、Three.js渲染和用户输入。充当瘦客户端。',
        'doc.rust_desc': '编译为WebAssembly。处理物理、碰撞检测和反作弊验证。',
        'doc.py_desc': '作为本地FastAPI微服务运行。处理PDF解析、AI线框生成和LLM集成。',
        'doc.lua_desc': '通过WASM嵌入。处理程序化生成规则、商店逻辑和动态提示工程。',
        'doc.security_title': '安全与反逆向工程',
        'doc.security_desc': '高价值逻辑永远不会暴露给客户端。物理常量通过哈希负载在运行时注入，WASM二进制文件利用控制流扁平化来挫败反编译器。',
        'nav.home': '首页',
        'nav.arch': '架构',
        'nav.api': 'API',
        'doc.locale_label': '语言',
    },
    hi: {
        'ui.play': 'खेलें',
        'ui.settings': 'सेटिंग्स',
        'ui.shop': 'दुकान',
        'ui.leaderboard': 'लीडरबोर्ड',
        'ui.coins': 'सिक्के',
        'ui.level': 'स्तर',
        'doc.title': 'गोइंग बॉल्स आर्किटेक्चर',
        'doc.intro': 'एक अगली पीढ़ी का क्वाड-कोर ब्राउज़र गेम इंजन।',
        'doc.arch_title': 'क्वाड-कोर आर्किटेक्चर',
        'doc.arch_intro': 'हमारा इंजन चार अलग-अलग प्रोग्रामिंग भाषाओं का उपयोग करता है, प्रत्येक अपने विशिष्ट डोमेन के लिए अनुकूलित है।',
        'doc.js_desc': 'DOM, Three.js रेंडरिंग और उपयोगकर्ता इनपुट को संभालता है। थिन क्लाइंट के रूप में कार्य करता है।',
        'doc.rust_desc': 'WebAssembly में संकलित। फिजिक्स, कोलिजन डिटेक्शन और एंटी-चीट वैलिडेशन को संभालता है।',
        'doc.py_desc': 'एक स्थानीय FastAPI माइक्रोसर्विस के रूप में चलता है। PDF पार्सिंग, AI वायरफ्रेम जनरेशन और LLM इंटीग्रेशन को संभालता है।',
        'doc.lua_desc': 'WASM के माध्यम से एम्बेडेड। प्रोसीजरल जनरेशन नियम, शॉप लॉजिक और डायनेमिक प्रॉम्प्ट इंजीनियरिंग को संभालता है।',
        'doc.security_title': 'सुरक्षा और एंटी-रिवर्स इंजीनियरिंग',
        'doc.security_desc': 'उच्च-मूल्य वाला लॉजिक कभी भी क्लाइंट को एक्सपोज़ नहीं किया जाता है। फिजिक्स कॉन्स्टेंट हैश्ड पेलोड के माध्यम से रनटाइम पर इंजेक्ट किए जाते हैं, और WASM बाइनरी डीकंपाइलर्स को विफल करने के लिए कंट्रोल-फ्लो फ्लैटनिंग का उपयोग करता है।',
        'nav.home': 'होम',
        'nav.arch': 'आर्किटेक्चर',
        'nav.api': 'एपीआई',
        'doc.locale_label': 'भाषा',
    }
};

export class LocaleManager {
    constructor() {
        this.currentLocale = this._detectLocale();
        this.listeners = new Set();
    }

    _detectLocale() {
        const saved = localStorage.getItem('app_locale');
        if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;

        const browserLang = navigator.language.split('-')[0].toLowerCase();
        return SUPPORTED_LOCALES.includes(browserLang) ? browserLang : DEFAULT_LOCALE;
    }

    setLocale(locale) {
        if (!SUPPORTED_LOCALES.includes(locale)) return;
        this.currentLocale = locale;
        localStorage.setItem('app_locale', locale);
        this._notifyListeners();
    }

    t(key, fallback = '') {
        const dict = DICTIONARIES[this.currentLocale] || DICTIONARIES[DEFAULT_LOCALE];
        return dict[key] || fallback || key;
    }

    subscribe(callback) {
        this.listeners.add(callback);
    }

    unsubscribe(callback) {
        this.listeners.delete(callback);
    }

    _notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLocale));
    }
}

// Singleton export
export const i18n = new LocaleManager();
