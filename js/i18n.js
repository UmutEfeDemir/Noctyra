// =============================================================
//  i18n.js  —  Translations (TR / EN / RU / FR) + helpers
//  Loaded FIRST (before constants.js) so t(), tf(), rndName()
//  are available to all other modules.
// =============================================================

const LANG_META = {
    tr: { fiCode: 'tr', code: 'TR', name: 'Türkçe'  },
    en: { fiCode: 'gb', code: 'EN', name: 'English'  },
    ru: { fiCode: 'ru', code: 'RU', name: 'Русский'  },
    fr: { fiCode: 'fr', code: 'FR', name: 'Français' },
};

const TRANSLATIONS = {
    tr: {
        title:          'NOCTYRA',
        subtitle:       'Denizlerin En Ünlü Korsanı Ol!',
        namePlaceholder:'Korsan Adın...',
        startBtn:       'YELKEN AÇ',
        controls:       'Fare ile yön ver &nbsp;|&nbsp; Sol tık veya BOŞLUK: Hızlan<br>Düşman gemisini bedenine çarparak batır!<br>Doubloon ve sandıklar topla, gemini büyüt!',
        boostLabel:     'Rüzgar Gücü',
        lbTitle:        'Korsan Sıralaması',
        score:          '{{n}} Altın',
        killMsg:        '{{name}} BATTI! +{{bonus}}',
        yourShipSank:   'GEMİN BATTI!',
        killedBy:       '{{name}} seni batırdı!',
        treasure:       'Topladığın Hazine: <b>{{score}}</b> Altın',
        restartBtn:     'YENİDEN YELKEN AÇ',
        shipCustomTitle:'GEMİ ÖZELLEŞTİR',
        shipType:       'GEMİ TÜRÜ',
        hull:           'TEKNE',
        sail:           'YELKEN',
        accent:         'AKSAN',
        wake:           'İZ RENGİ',
        typeSandal:     'Sandal',
        typeGemi:       'Gemi',
        typeSavas:      'Savaş Gemisi',
        highScore:      'En Yüksek: {{n}} Altın',
        newRecord:      'YENİ REKOR!',
        globalLbTitle:  'Küresel Sıralama',
        comboText:      'COMBO x{{n}}!',
        achUnlocked:    'BAŞARIM AÇILDI',
        ach_first_kill: 'İlk Gemi Battı!',
        ach_kills_5:    '5 Gemi Batırdın!',
        ach_kills_10:   '10 Gemi Batırdın!',
        ach_gold_100:   '100 Altın Toplandı!',
        ach_gold_500:   '500 Altın Toplandı!',
        ach_survive_2m: '2 Dakika Hayatta!',
        ach_kills_25:   '25 Gemi Batırdın!',
        ach_kills_50:   '50 Gemi Batırdın!',
        ach_gold_1000:  '1000 Altın Toplandı!',
        ach_gold_2500:  '2500 Altın Toplandı!',
        ach_survive_5m: '5 Dakika Hayatta!',
        ach_survive_10m:'10 Dakika Hayatta!',
        ach_combo_3:    'Üçlü Kombo!',
        ach_big_ship:   'Dev Gemi!',
        spectating:     'Gemi battı — izliyorsunuz...',
        winner:         'Son Korsan Sen Kaldın!',
        roomCodePlaceholder: 'Oda Kodu (isteğe bağlı)',
        roomCodeCopied: 'Oda kodu kopyalandı!',
        nameLabel:      'KORSAN ADI',
        roomLabel:      'ODA KODU',
        createRoom:     'ODA AÇ',
        yourShip:       'SENİN GEMİN',
        bestScore:      'EN İYİ SKOR',
        totalKills:     'TOPLAM AV',
        serverOnline:   '{{n}} Korsan Aktif',
        serverOffline:  'Çevrimdışı',
        names: ['Kara Sakallı','Ölüm Morgan','Kılıç Jack','Fırtına Reis',
                'Tuzlu Pete','Korku Kaptan','Köpek Piraya','Deniz Canavarı',
                'Altın Diş','Şeytan Liman','Kör Göz','Demir Yürek',
                'Kan Kırmızı','Sis Kaptan','Gemi Avcısı','Zehir Bıçak',
                'Ejder Yürek','Karanlık Fırtına','Lanet Morgan','Çılgın Pete'],
    },

    en: {
        title:          'NOCTYRA',
        subtitle:       'Become the Most Famous Pirate!',
        namePlaceholder:'Your Pirate Name...',
        startBtn:       'SET SAIL',
        controls:       'Mouse to steer &nbsp;|&nbsp; Left click or SPACE: Boost<br>Sink enemies by making them hit your trail!<br>Collect doubloons & chests to grow your ship!',
        boostLabel:     'Wind Power',
        lbTitle:        'Pirate Rankings',
        score:          '{{n}} Gold',
        killMsg:        '{{name}} SUNK! +{{bonus}}',
        yourShipSank:   'YOUR SHIP SANK!',
        killedBy:       '{{name}} sank you!',
        treasure:       'Treasure Collected: <b>{{score}}</b> Gold',
        restartBtn:     'SET SAIL AGAIN',
        shipCustomTitle:'CUSTOMIZE SHIP',
        shipType:       'SHIP TYPE',
        hull:           'HULL',
        sail:           'SAIL',
        accent:         'ACCENT',
        wake:           'WAKE COLOR',
        typeSandal:     'Rowboat',
        typeGemi:       'Brigantine',
        typeSavas:      'Man-of-War',
        highScore:      'Best: {{n}} Gold',
        newRecord:      'NEW RECORD!',
        globalLbTitle:  'Global Rankings',
        comboText:      'COMBO x{{n}}!',
        achUnlocked:    'ACHIEVEMENT',
        ach_first_kill: 'First Blood!',
        ach_kills_5:    '5 Ships Sunk!',
        ach_kills_10:   '10 Ships Sunk!',
        ach_gold_100:   '100 Gold Collected!',
        ach_gold_500:   '500 Gold Collected!',
        ach_survive_2m: '2 Minutes Survived!',
        ach_kills_25:   '25 Ships Sunk!',
        ach_kills_50:   '50 Ships Sunk!',
        ach_gold_1000:  '1000 Gold Collected!',
        ach_gold_2500:  '2500 Gold Collected!',
        ach_survive_5m: '5 Minutes Survived!',
        ach_survive_10m:'10 Minutes Survived!',
        ach_combo_3:    'Triple Kill!',
        ach_big_ship:   'Massive Ship!',
        spectating:     'Ship sunk — spectating...',
        winner:         'Last Pirate Standing!',
        roomCodePlaceholder: 'Room Code (optional)',
        roomCodeCopied: 'Room code copied!',
        nameLabel:      'PIRATE NAME',
        roomLabel:      'ROOM CODE',
        createRoom:     'CREATE',
        yourShip:       'YOUR SHIP',
        bestScore:      'BEST SCORE',
        totalKills:     'TOTAL KILLS',
        serverOnline:   '{{n}} Players Online',
        serverOffline:  'Offline',
        names: ['Blackbeard','Dead Morgan','Cutlass Jack','Storm Captain',
                'Salty Pete','Dread Captain','Sea Dog','Ocean Terror',
                'Golden Tooth','Devil Harbor','One Eye','Iron Heart',
                'Bloody Red','Fog Captain','Ship Hunter','Venom Blade',
                'Dragon Heart','Dark Storm','Cursed Morgan','Mad Pete'],
    },

    ru: {
        title:          'NOCTYRA',
        subtitle:       'Стань самым знаменитым пиратом!',
        namePlaceholder:'Имя пирата...',
        startBtn:       'ОТПЛЫТЬ',
        controls:       'Мышь для управления &nbsp;|&nbsp; ЛКМ или ПРОБЕЛ: Ускорение<br>Топи врагов, направляя их в свой след!<br>Собирай монеты и сундуки чтобы расти!',
        boostLabel:     'Сила ветра',
        lbTitle:        'Рейтинг пиратов',
        score:          '{{n}} Золото',
        killMsg:        '{{name}} ПОТОПЛЕН! +{{bonus}}',
        yourShipSank:   'ВАШ КОРАБЛЬ ПОТОПЛЕН!',
        killedBy:       '{{name}} потопил тебя!',
        treasure:       'Собрано сокровищ: <b>{{score}}</b> Золото',
        restartBtn:     'ОТПЛЫТЬ СНОВА',
        shipCustomTitle:'НАСТРОЙКА',
        shipType:       'ТИП КОРАБЛЯ',
        hull:           'КОРПУС',
        sail:           'ПАРУС',
        accent:         'АКЦЕНТ',
        wake:           'ЦВЕТ СЛЕДА',
        typeSandal:     'Лодка',
        typeGemi:       'Бригантина',
        typeSavas:      'Линкор',
        highScore:      'Рекорд: {{n}} Золото',
        newRecord:      'НОВЫЙ РЕКОРД!',
        globalLbTitle:  'Мировой рейтинг',
        comboText:      'КОМБО x{{n}}!',
        achUnlocked:    'ДОСТИЖЕНИЕ',
        ach_first_kill: 'Первая Кровь!',
        ach_kills_5:    '5 Кораблей Потоплено!',
        ach_kills_10:   '10 Кораблей Потоплено!',
        ach_gold_100:   '100 Золота Собрано!',
        ach_gold_500:   '500 Золота Собрано!',
        ach_survive_2m: '2 Минуты Выжил!',
        ach_kills_25:   '25 Кораблей Потоплено!',
        ach_kills_50:   '50 Кораблей Потоплено!',
        ach_gold_1000:  '1000 Золота Собрано!',
        ach_gold_2500:  '2500 Золота Собрано!',
        ach_survive_5m: '5 Минут Выжил!',
        ach_survive_10m:'10 Минут Выжил!',
        ach_combo_3:    'Тройное Убийство!',
        ach_big_ship:   'Огромный Корабль!',
        spectating:     'Корабль потоплен — наблюдение...',
        winner:         'Последний пират на море!',
        roomCodePlaceholder: 'Код комнаты (необязательно)',
        roomCodeCopied: 'Код скопирован!',
        nameLabel:      'ИМЯ ПИРАТА',
        roomLabel:      'КОД КОМНАТЫ',
        createRoom:     'СОЗДАТЬ',
        yourShip:       'ВАШ КОРАБЛЬ',
        bestScore:      'РЕКОРД',
        totalKills:     'ВСЕГО ЖЕРТВ',
        serverOnline:   '{{n}} Пиратов онлайн',
        serverOffline:  'Офлайн',
        names: ['Чёрная Борода','Мёртвый Морган','Кинжал Джек','Шторм Капитан',
                'Солёный Пит','Страх Капитан','Морской Пёс','Ужас Океана',
                'Золотой Зуб','Дьявол Гавань','Одноглазый','Железное Сердце',
                'Кровавый Ред','Туман Капитан','Охотник','Яд Клинок',
                'Дракон Сердце','Тёмная Буря','Проклятый Морган','Бешеный Пит'],
    },

    fr: {
        title:          'NOCTYRA',
        subtitle:       'Deviens le pirate le plus célèbre!',
        namePlaceholder:'Ton nom de pirate...',
        startBtn:       'HISSER LES VOILES',
        controls:       'Souris pour diriger &nbsp;|&nbsp; Clic gauche ou ESPACE: Accélérer<br>Coule tes ennemis en les faisant percuter ta traîne!<br>Collecte pièces et coffres pour grandir!',
        boostLabel:     'Force du vent',
        lbTitle:        'Classement pirates',
        score:          '{{n}} Or',
        killMsg:        '{{name}} COULÉ! +{{bonus}}',
        yourShipSank:   'TON NAVIRE A COULÉ!',
        killedBy:       "{{name}} t'a coulé!",
        treasure:       'Trésor collecté: <b>{{score}}</b> Or',
        restartBtn:     'REPRENDRE LA MER',
        shipCustomTitle:'PERSONNALISER',
        shipType:       'TYPE DE NAVIRE',
        hull:           'COQUE',
        sail:           'VOILE',
        accent:         'ACCENT',
        wake:           'SILLAGE',
        typeSandal:     'Barque',
        typeGemi:       'Brigantin',
        typeSavas:      'Vaisseau de ligne',
        highScore:      'Record: {{n}} Or',
        newRecord:      'NOUVEAU RECORD!',
        globalLbTitle:  'Classement mondial',
        comboText:      'COMBO x{{n}}!',
        achUnlocked:    'SUCCÈS',
        ach_first_kill: 'Premier Sang!',
        ach_kills_5:    '5 Navires Coulés!',
        ach_kills_10:   '10 Navires Coulés!',
        ach_gold_100:   '100 Or Collecté!',
        ach_gold_500:   '500 Or Collecté!',
        ach_survive_2m: '2 Minutes Survécu!',
        ach_kills_25:   '25 Navires Coulés!',
        ach_kills_50:   '50 Navires Coulés!',
        ach_gold_1000:  '1000 Or Collecté!',
        ach_gold_2500:  '2500 Or Collecté!',
        ach_survive_5m: '5 Minutes Survécu!',
        ach_survive_10m:'10 Minutes Survécu!',
        ach_combo_3:    'Triple Élimination!',
        ach_big_ship:   'Navire Colossal!',
        spectating:     'Navire coulé — spectateur...',
        winner:         'Dernier pirate en mer!',
        roomCodePlaceholder: 'Code de salle (optionnel)',
        roomCodeCopied: 'Code copié!',
        nameLabel:      'NOM PIRATE',
        roomLabel:      'CODE SALLE',
        createRoom:     'CRÉER',
        yourShip:       'TON NAVIRE',
        bestScore:      'RECORD',
        totalKills:     'ÉLIMINATIONS',
        serverOnline:   '{{n}} Pirates en mer',
        serverOffline:  'Hors ligne',
        names: ['Barbe Noire','Mort Morgan','Sabre Jack','Capitaine Tempête',
                'Pierre Salé','Capitaine Terreur','Chien de Mer','Terreur des Mers',
                "Dent d'Or",'Diable du Port','Borgne','Cœur de Fer',
                'Rouge Sang','Brume Capitaine','Chasseur','Lame Venin',
                'Cœur Dragon','Tempête Noire','Morgan Maudit','Pierre Fou'],
    },
};

let currentLang = 'tr';

// ── Core helpers ──────────────────────────────────────────────
function t(key) {
    return TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.tr[key] ?? key;
}

function tf(key, vars) {
    let str = t(key);
    if (typeof str !== 'string') return String(key);
    for (const [k, v] of Object.entries(vars || {})) {
        str = str.split('{{' + k + '}}').join(String(v));
    }
    return str;
}

function rndName() {
    const names = t('names');
    return names[Math.floor(Math.random() * names.length)];
}

// ── Dropdown ──────────────────────────────────────────────────
function toggleLangMenu() {
    document.getElementById('langDropdown').classList.toggle('open');
}

function selectLang(code) {
    setLang(code);
    document.getElementById('langDropdown').classList.remove('open');
}

// Close when clicking outside the dropdown
document.addEventListener('click', e => {
    const dd = document.getElementById('langDropdown');
    if (dd && !dd.contains(e.target)) dd.classList.remove('open');
});

// ── Set language ──────────────────────────────────────────────
function setLang(code) {
    if (!TRANSLATIONS[code]) return;
    currentLang = code;
    document.documentElement.lang = code;
    document.title = t('title');

    applyTranslations();
    if (typeof rebuildCustomizerLang === 'function') rebuildCustomizerLang();
    if (typeof rebuildDeathScreen === 'function' && typeof gameState !== 'undefined' && gameState === 'dead') rebuildDeathScreen();

    // Update toggle button
    const meta = LANG_META[code];
    const flagEl = document.getElementById('langFlag');
    const codeEl = document.getElementById('langCode');
    if (flagEl) flagEl.className = `fi fi-${meta.fiCode}`;
    if (codeEl) codeEl.textContent = meta.code;

    // Mark active option
    document.querySelectorAll('.lang-option').forEach(el => {
        el.classList.toggle('active', el.dataset.lang === code);
    });
}

// ── Apply data-i18n attributes ────────────────────────────────
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const val = t(el.dataset.i18n);
        if (typeof val === 'string') el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const val = t(el.dataset.i18nHtml);
        if (typeof val === 'string') el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const val = t(el.dataset.i18nPlaceholder);
        if (typeof val === 'string') el.placeholder = val;
    });
}
