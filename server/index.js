require('dotenv').config();
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: [
        'http://localhost:3000', 
        'http://127.0.0.1:3000',
        'https://dojo-clicker.vercel.app'
    ] 
}));
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// 🛠️ 1. STREFA NARZĘDZIOWA (SŁOWNIKI I FUNKCJE)
// ==========================================

// --- 1A. SŁOWNIKI I KONFIGURACJE ---
// Zbiorczy słownik ID Misji używanych w logice (aby uniknąć literówek)
const MISSION_IDS = {
  TRAINING_FOREST: '10000000-0000-0000-0000-000000000004', // Poziom Sklepu 2
  MENTOR_OLD_MASTER: '10000000-0000-0000-0000-000000000005',
  WORK_MILK: '10000000-0000-0000-0000-000000000006',
  WORK_BUILDING: '10000000-0000-0000-0000-000000000007',
  WORK_FIELD: '10000000-0000-0000-0000-000000000008',
  WORK_LUMBERJACK: '10000000-0000-0000-0000-000000000009',
  WORK_COURIER: '10000000-0000-0000-0000-000000000010',
  SHOP_LVL_4: '10000000-0000-0000-0000-000000000014',
  WORK_ROSA: '10000000-0000-0000-0000-000000000015',
  WORK_GARDENS: '10000000-0000-0000-0000-000000000020',
  SHOP_LVL_5: '10000000-0000-0000-0000-000000000023',
  MENTOR_TIME_CHAMBER: '10000000-0000-0000-0000-000000000024',
  PVP_FINALS: '10000000-0000-0000-0000-000000000025'
};

const TRAINING_MENTORS = {
  'old_master': { name: 'Stary Mistrz', emoji: '🐢', cost: 10, multiplier: 2, reqMission: MISSION_IDS.MENTOR_OLD_MASTER },
  'cat_hermit': { name: 'Koci Pustelnik', emoji: '🐈', cost: 25, multiplier: 6, reqMission: MISSION_IDS.WORK_ROSA },
  'celestial': { name: 'Pan Niebiańskiego Pałacu', emoji: '☁️', cost: 50, multiplier: 15, reqMission: MISSION_IDS.WORK_GARDENS },
  'time_chamber': { name: 'Sala Czasu', emoji: '⏳', cost: 100, multiplier: 40, reqMission: MISSION_IDS.MENTOR_TIME_CHAMBER }
};

const WORK_MODES = {
  praca_mleko:  { req_mission: MISSION_IDS.WORK_MILK, duration_sec: 15, cost_stamina: 10n, cost_hp_pct: 2n, reward_coins: 2n, penalty_pct: 10n },
  praca_budowa: { req_mission: MISSION_IDS.WORK_BUILDING, duration_sec: 20, cost_stamina: 10n, cost_hp_pct: 5n, reward_coins: 5n, penalty_pct: 12n },
  praca_pole:   { req_mission: MISSION_IDS.WORK_FIELD, duration_sec: 25, cost_stamina: 15n, cost_hp_pct: 8n, reward_coins: 12n, penalty_pct: 15n },
  praca_drwal:  { req_mission: MISSION_IDS.WORK_LUMBERJACK, duration_sec: 30, cost_stamina: 15n, cost_hp_pct: 15n, reward_coins: 25n, penalty_pct: 18n },
  praca_kurier: { req_mission: MISSION_IDS.WORK_COURIER, duration_sec: 40, cost_stamina: 20n, cost_hp_pct: 25n, reward_coins: 60n, penalty_pct: 22n },
  praca_rosa:   { req_mission: MISSION_IDS.WORK_ROSA, duration_sec: 50, cost_stamina: 25n, cost_hp_pct: 10n, reward_coins: 150n, penalty_pct: 25n, drop_woda: true },
  praca_ogrody: { req_mission: MISSION_IDS.WORK_GARDENS, duration_sec: 60, cost_stamina: 40n, cost_hp_pct: 30n, reward_coins: 500n, penalty_pct: 30n }
};

const BANK_COIN_LIMITS = {
  1: { limit: 10000, cost: 0 }, 2: { limit: 50000, cost: 5000 }, 3: { limit: 250000, cost: 25000 },
  4: { limit: 1000000, cost: 100000 }, 5: { limit: 5000000, cost: 500000 }, 6: { limit: 25000000, cost: 2500000 },
  7: { limit: 100000000, cost: 10000000 }, 8: { limit: 500000000, cost: 50000000 }, 9: { limit: 2000000000, cost: 200000000 },
  10: { limit: 9007199254740991, cost: 1000000000 }
};

const BANK_SLOT_COSTS = { '6-10': 5000, '11-15': 25000, '16-20': 100000, '21-25': 500000 };

// --- KONFIGURACJA NAGRODY GŁÓWNEJ ZA ZADANIA (Zależnie od dnia Rundy) ---
const MAIN_DAILY_REWARDS = [
  // Od Dnia 1 do 25
  { max_day: 25, reward: { stats: { bonus_hp: 50n, bonus_mp: 50n } }, text: '+50 Max HP, +50 Max MP (Nagroda Rundy)' },
  // Od Dnia 26 do 50
  { max_day: 50, reward: { stats: { bonus_hp: 100n, bonus_mp: 100n } }, text: '+100 Max HP, +100 Max MP (Nagroda Rundy)' },
  // Od Dnia 51 do 75 (Koniec rundy)
  { max_day: 75, reward: { coins: 50000n }, text: '50,000 Monet (Nagroda Końcowa Rundy)' }
];

// --- 1B. ZMIENNE GLOBALNE I CACHE ---
let globalServerState = null;
let itemDictCache = null;
let itemDictCacheTime = 0;
let rankingCache = null;
let rankingCacheTime = 0;
const RANKING_CACHE_TTL = 1 * 60 * 1000; // 1 minuta
const chatRateLimitMap = new Map();
const CHAT_RATE_LIMIT_TTL = 3000; // 3 sekundy

// --- 1C. FUNKCJE POMOCNICZE ---
const minBigInt = (a, b) => (a < b ? a : b);
const maxBigInt = (a, b) => (a > b ? a : b);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function calculateMaxBackpackSlots(charStats) {
  const minPhysicalStat = minBigInt(BigInt(charStats.strength || '0'), minBigInt(BigInt(charStats.speed || '0'), BigInt(charStats.endurance || '0')));
  return Math.min(50, 5 + Number(minPhysicalStat / 10000n));
}

function bigIntReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function getCharacterShopLevel(completedMissions) {
    const completed = completedMissions || [];
    if (completed.includes(MISSION_IDS.SHOP_LVL_5)) return 5;
    if (completed.includes(MISSION_IDS.SHOP_LVL_4)) return 4;
    if (completed.includes(MISSION_IDS.WORK_BUILDING)) return 3;
    if (completed.includes(MISSION_IDS.TRAINING_FOREST)) return 2;
    return 1;
}

// Oblicza, o której godzinie gracz wyjdzie ze szpitala po śmierci
function calculateHospitalTime(powerLevelBigInt) {
    const pl = Number(powerLevelBigInt);
    const hospitalMinutes = Math.min(120, 5 + Math.floor(Math.pow(pl, 0.25)));
    const exactEndMs = Date.now() + hospitalMinutes * 60000;
    return {
        minutes: hospitalMinutes,
        exactEndMs: exactEndMs,
        utcString: new Date(exactEndMs).toISOString()
    };
}

// Helper 1: Obliczanie kar za zbyt duży poziom (Diminishing Returns)
function calculatePowerPenalty(weakestStat, reqStat) {
    let multiplier = 100n;
    let injuryChance = 20n;
    let warning = null;

    if (weakestStat >= (reqStat * 8n) + 100n) {
        multiplier = 10n; injuryChance = 0n; warning = 'Zyski obniżone o 90% (Duża kara za potęgę)';
    } else if (weakestStat >= (reqStat * 4n) + 40n) {
        multiplier = 50n; injuryChance = 5n; warning = 'Zyski obniżone o 50% (Średnia kara za potęgę)';
    } else if (weakestStat >= (reqStat * 2n) + 15n) {
        multiplier = 75n; injuryChance = 10n; warning = 'Zyski obniżone o 25% (Mała kara za potęgę)';
    }
    return { multiplier, injuryChance, warning };
}

// Helper 2: Rozdzielanie utraconych statystyk przy porażce (Misje i Praca)
function distributeStatLoss(totalLossNum) {
    let guaranteedPool = Math.floor(totalLossNum * 0.5);
    let randomPool = totalLossNum - guaranteedPool;

    let guaranteedPerStat = Math.floor(guaranteedPool / 4);
    let guaranteedRemainder = guaranteedPool - (guaranteedPerStat * 4);

    let r1 = Math.random(); let r2 = Math.random(); let r3 = Math.random(); let r4 = Math.random();
    const sumR = r1 + r2 + r3 + r4;

    return {
        str: BigInt(Math.max(1, guaranteedPerStat + Math.floor(randomPool * (r1 / sumR)))),
        spd: BigInt(Math.max(1, guaranteedPerStat + Math.floor(randomPool * (r2 / sumR)))),
        end: BigInt(Math.max(1, guaranteedPerStat + Math.floor(randomPool * (r3 / sumR)))),
        tech: BigInt(Math.max(1, guaranteedPerStat + guaranteedRemainder + Math.floor(randomPool * (r4 / sumR))))
    };
}

// Helper 3: Rozdzielanie zyskanych statystyk przy sukcesie (Fokus na najsłabszą cechę)
function distributeStatGains(finalStats, lowestStatName) {
    let gains = { str: 0n, spd: 0n, end: 0n, tech: 0n };
    if (finalStats < 10n) {
        const baseGain = finalStats / 4n; 
        gains.str = baseGain; gains.spd = baseGain; gains.end = baseGain; gains.tech = baseGain;
        const localRem = Number(finalStats % 4n);
        if (localRem > 0) {
            let targets = [0, 1, 2, 3].sort(() => 0.5 - Math.random());
            if (lowestStatName === 'strength') targets = [0, ...targets.filter(t => t !== 0)];
            else if (lowestStatName === 'speed') targets = [1, ...targets.filter(t => t !== 1)];
            else if (lowestStatName === 'endurance') targets = [2, ...targets.filter(t => t !== 2)];
            else targets = [3, ...targets.filter(t => t !== 3)];
            
            for (let i = 0; i < localRem; i++) { 
                if (targets[i] === 0) gains.str += 1n; 
                else if (targets[i] === 1) gains.spd += 1n; 
                else if (targets[i] === 2) gains.end += 1n; 
                else if (targets[i] === 3) gains.tech += 1n; 
            }
        }
    } else {
        const sumW = BigInt((lowestStatName === 'strength' ? 100 : 50) + (lowestStatName === 'speed' ? 100 : 50) + (lowestStatName === 'endurance' ? 100 : 50) + (lowestStatName === 'technique' ? 100 : 50));
        gains.str = (finalStats * BigInt(lowestStatName === 'strength' ? 100 : 50)) / sumW;
        gains.spd = (finalStats * BigInt(lowestStatName === 'speed' ? 100 : 50)) / sumW;
        gains.end = (finalStats * BigInt(lowestStatName === 'endurance' ? 100 : 50)) / sumW;
        gains.tech = (finalStats * BigInt(lowestStatName === 'technique' ? 100 : 50)) / sumW;
        const rem = finalStats - (gains.str + gains.spd + gains.end + gains.tech);
        
        if (lowestStatName === 'strength') gains.str += rem; 
        else if (lowestStatName === 'speed') gains.spd += rem; 
        else if (lowestStatName === 'endurance') gains.end += rem;
        else gains.tech += rem;
    }
    return gains;
}

// Helper 4: Aplikowanie Krytycznej Porażki (Śmierci w walce)
function calculateDeathPenalty(character, currentStats, powerLevel, source) {
    const pl = BigInt(powerLevel);
    let deathPenaltyPct = 2n;
    if (pl > 10000000n) deathPenaltyPct = 10n;
    else if (pl > 1000000n) deathPenaltyPct = 8n;
    else if (pl > 100000n) deathPenaltyPct = 6n;
    else if (pl > 10000n) deathPenaltyPct = 4n;

    const currentCoinsBeforeLoss = BigInt(character.coins || '0');
    const coinsLost = currentCoinsBeforeLoss > 0n ? maxBigInt(1n, (currentCoinsBeforeLoss * 10n) / 100n) : 0n;
    const newCoins = currentCoinsBeforeLoss - coinsLost;

    const applyLoss = (val) => (BigInt(val) * deathPenaltyPct) / 100n;
    
    const strLoss = applyLoss(currentStats.str);
    const spdLoss = applyLoss(currentStats.spd);
    const endLoss = applyLoss(currentStats.end);
    const techLoss = applyLoss(currentStats.tech);
    const intLoss = applyLoss(currentStats.int);
    const menLoss = applyLoss(currentStats.men);

    const hospitalData = calculateHospitalTime(pl);

    const statsLostLog = {
        strength: strLoss.toString(), speed: spdLoss.toString(),
        endurance: endLoss.toString(), technique: techLoss.toString(),
        intelligence: intLoss.toString(), mental_strength: menLoss.toString(),
        hospital_end_ms: hospitalData.exactEndMs.toString(),
        source: source
    };

    return {
        newCoins: newCoins.toString(), coinsLost: coinsLost.toString(),
        hospitalData, statsLostLog,
        finalStats: {
            str: maxBigInt(1n, BigInt(currentStats.str) - strLoss).toString(),
            spd: maxBigInt(1n, BigInt(currentStats.spd) - spdLoss).toString(),
            end: maxBigInt(1n, BigInt(currentStats.end) - endLoss).toString(),
            tech: maxBigInt(1n, BigInt(currentStats.tech) - techLoss).toString(),
            int: maxBigInt(1n, BigInt(currentStats.int) - intLoss).toString(),
            men: maxBigInt(1n, BigInt(currentStats.men) - menLoss).toString()
        }
    };
}

// Helper 5: Aktualizacja postępu Dziennych Zadań Specjalnych
async function updateTaskProgress(userId, taskType, targetId, amountToAdd) {
    if (!globalServerState || !globalServerState.daily_global_tasks) return;
    
    // Szukamy aktywnych zadań, które pasują do tego typu akcji
    const activeTasks = globalServerState.daily_global_tasks.filter(t => 
        t.task_type === taskType && (t.target_id === targetId || t.target_id === 'any')
    );
    if (activeTasks.length === 0) return;

    try {
        // Upewniamy się, że szukamy po profile_id (jako string UUID)
        const { data: char } = await supabase.from('characters').select('id, daily_tasks_progress').eq('profile_id', String(userId)).single();
        if (!char) return;

        let progress = char.daily_tasks_progress || {};
        let updated = false;

        activeTasks.forEach(task => {
            if (!progress[task.id]) progress[task.id] = { current: 0, claimed: false };
            
            if (!progress[task.id].claimed && progress[task.id].current < task.goal_amount) {
                progress[task.id].current += amountToAdd;
                updated = true;
            }
        });

        if (updated) {
            await supabase.from('characters').update({ daily_tasks_progress: progress }).eq('id', char.id);
            console.log(`[Tasks] Zaktualizowano zadanie ${taskType} dla gracza. Dodano: ${amountToAdd}`);
        }
    } catch(err) {
        console.error('[Tasks] Błąd aktualizacji postępu:', err.message);
    }
}

// --- FUNKCJA POMOCNICZA: Losowanie i wstrzykiwanie nazw/kategorii przedmiotów ---
async function generateAndEnrichDailyTasks(nextDay) {

    if (nextDay > 75) return [];



    const { data: allTasks, error: tasksErr } = await supabase

        .from('special_tasks_templates')

        .select('*')

        .lte('min_dc_day', nextDay)

        .gte('max_dc_day', nextDay);



    if (tasksErr || !allTasks || allTasks.length === 0) return [];



    const { data: allItems } = await supabase.from('item_templates').select('*');

    const itemMap = {};

    if (allItems) allItems.forEach(i => itemMap[i.id] = i);



    // 🔴 KROK 1: Obliczenie docelowej ilości zadań na dany dzień

    let minTasks = 3, maxTasks = 3;

    if (nextDay <= 40) { minTasks = 3; maxTasks = 4; }

    else if (nextDay <= 50) { minTasks = 4; maxTasks = 5; }

    else if (nextDay <= 60) { minTasks = 5; maxTasks = 6; }

    else if (nextDay < 70) { minTasks = 6; maxTasks = 7; }

    else if (nextDay === 70) { minTasks = 7; maxTasks = 7; }

    else if (nextDay === 71) { minTasks = 8; maxTasks = 8; }

    else if (nextDay === 72) { minTasks = 9; maxTasks = 9; }

    else { minTasks = 10; maxTasks = 10; } // Dni 73, 74, 75 zawsze równe 10!



    let targetNumTasks = Math.floor(Math.random() * (maxTasks - minTasks + 1)) + minTasks;



    // 🔴 KROK 2: Ustawienie rygorystycznych limitów i filtrów

    const limits = {

        'work': 2, 'training': 1, 'shop_buy': 2, 'shop_sell': 2,

        'bank_upgrade': 1, 'mission': 3, 'consume': 3, 'training_stats': 1

    };



    const currentCounts = {

        'work': 0, 'training': 0, 'shop_buy': 0, 'shop_sell': 0,

        'bank_upgrade': 0, 'mission': 0, 'consume': 0, 'training_stats': 0

    };



    const selectedTasks = [];

    const usedTargets = new Set(); // Blokada różnych poziomów tego samego zadania



    // Tasujemy pulę zadań

    const shuffled = allTasks.sort(() => 0.5 - Math.random());



    // Główna pętla filtrująca

    for (const task of shuffled) {

        if (selectedTasks.length >= targetNumTasks) break;



        const type = task.task_type;

        const target = task.target_id;



        // Czy przekroczono limit kategorii na dziś?

        if (limits[type] !== undefined && currentCounts[type] >= limits[type]) continue;



        // Czy wylosowano już dzisiaj to samo zadanie (nawet z innym poziomem)?

        const familyKey = `${type}_${target}`;

        if (usedTargets.has(familyKey)) continue;



        // Zadanie przechodzi przez filtry!

        selectedTasks.push(task);

        if (limits[type] !== undefined) currentCounts[type]++;

        usedTargets.add(familyKey);

    }

    

    // 🔴 KROK 3: BEZPIECZNIK. 

    // Jeśli rygorystyczne limity sprawiły, że nie dobraliśmy np. 10 misji,

    // dobieramy brakujące misje ignorując max. limity kategorii (ale wciąż blokujemy duble poziomów!).

    if (selectedTasks.length < targetNumTasks) {

        for (const task of shuffled) {

            if (selectedTasks.length >= targetNumTasks) break;

            const familyKey = `${task.task_type}_${task.target_id}`;

            if (!usedTargets.has(familyKey)) {

                selectedTasks.push(task);

                usedTargets.add(familyKey);

            }

        }

    }



    // 🔴 KROK 4: Wstrzyknięcie pełnych danych i przygotowanie na front

    return selectedTasks.map(task => {

        let rewardObj = task.reward;

        if (typeof rewardObj === 'string') {

            try { rewardObj = JSON.parse(rewardObj); } catch (e) {}

        }



        if (rewardObj && rewardObj.items && Array.isArray(rewardObj.items)) {

            rewardObj.items = rewardObj.items.map(reqItem => {

                const template = itemMap[reqItem.id];

                if (template) {

                    reqItem.name = template.name;

                    reqItem.category = template.category;

                    reqItem.template = template; 

                }

                return reqItem;

            });

        }

        

        task.reward = rewardObj;

        return task;

    });

}

// ==========================================
// 📊 2. SILNIK STATYSTYK I AUTORYZACJA (MIDDLEWARE)
// ==========================================
async function getFullCharacterStats(userId) {
  try {
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*, profiles!inner(username)') 
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
        console.error('[DB Error] Postać/Profil:', characterError);
        throw new Error('Nie znaleziono postaci gracza (Trwa odświeżanie bazy lub problem z profilem)');
    }

    const profile = { username: character.profiles.username };

    let { data: equippedItems, error: equipmentError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('character_id', character.id)
      .not('equipped_slot', 'is', null)
      .neq('equipped_slot', 'bank'); 

    if (equipmentError) {
      console.error('[Stats] Błąd pobierania ekwipunku:', equipmentError);
      equippedItems = [];
    }

    const equipBonuses = { strength: 0n, speed: 0n, endurance: 0n, technique: 0n, intelligence: 0n, mental_strength: 0n, bonus_hp: 0n, bonus_mp: 0n, bonus_coins_pct: 0n, bonus_coins: 0n };
    const equipBreakdown = { strength: [], speed: [], endurance: [], technique: [], intelligence: [], mental_strength: [], bonus_hp: [], bonus_mp: [], bonus_coins_pct: [], bonus_coins: [] };
    const trainingBonuses = { strength: 0n, speed: 0n, endurance: 0n, technique: 0n, intelligence: 0n, mental_strength: 0n, bonus_hp: 0n, bonus_mp: 0n, bonus_coins_pct: 0n };

    // Lista statystyk, które dynamicznie sprawdzamy i sumujemy
    const PASSIVE_STATS = ['strength', 'speed', 'endurance', 'technique', 'intelligence', 'mental_strength', 'bonus_hp', 'bonus_mp', 'bonus_coins_pct', 'bonus_coins'];
    const TRAINING_STATS = ['strength', 'speed', 'endurance', 'technique', 'intelligence', 'mental_strength', 'bonus_hp', 'bonus_mp', 'bonus_coins_pct'];

    equippedItems.forEach(item => {
      if (item.item_templates && item.item_templates.bonuses) {
        const bonuses = item.item_templates.bonuses;
        
        // 1. Pasywne bonusy do statystyk (Domyślne)
        if (bonuses.type === 'passive' || bonuses.type === undefined) {
          PASSIVE_STATS.forEach(stat => {
            if (bonuses[stat]) {
              equipBonuses[stat] += BigInt(bonuses[stat]);
              const sign = stat === 'bonus_coins_pct' ? '%' : '';
              equipBreakdown[stat].push(`${item.item_templates.name}: +${bonuses[stat]}${sign}`);
            }
          });
        }

        // 2. Bonusy wpływające na wyniki treningu
        if (bonuses.type === 'training') {
          TRAINING_STATS.forEach(stat => {
            if (bonuses[stat]) {
              trainingBonuses[stat] += BigInt(bonuses[stat]);
            }
          });
        }
      }
    }); 

    const baseStats = {
      strength: BigInt(character.strength || '1'),
      speed: BigInt(character.speed || '1'),
      endurance: BigInt(character.endurance || '1'),
      technique: BigInt(character.technique || '1'),
      intelligence: BigInt(character.intelligence || '1'),
      mental_strength: BigInt(character.mental_strength || '1'),
      bonus_hp: BigInt(character.bonus_hp || '0'),
      bonus_mp: BigInt(character.bonus_mp || '0'),
      bonus_stamina: BigInt(character.bonus_stamina || '0')
    };

    const totalStr = baseStats.strength + equipBonuses.strength;
    const totalInt = baseStats.intelligence + equipBonuses.intelligence;
    
    const max_hp = 100n + (totalStr / 20n) + baseStats.bonus_hp + equipBonuses.bonus_hp;
    const max_mp = 100n + (totalInt / 5n) + baseStats.bonus_mp + equipBonuses.bonus_mp;
    const max_stamina = 100n + baseStats.bonus_stamina;

    // --- ⚡ OBLICZANIE POZIOMÓW MOCY ---
    // 1. Prawdziwa moc gracza (Tylko Baza) - do rankingu i kar
    const base_power_level = 
        baseStats.strength + baseStats.speed + baseStats.endurance + 
        baseStats.technique + baseStats.intelligence + baseStats.mental_strength + 
        baseStats.bonus_hp + (baseStats.bonus_mp * 2n) + (baseStats.bonus_stamina * 5n);

    // 2. Całkowita moc (Baza + Ekwipunek) - do podglądu UI
    const total_stats_sum = 
        baseStats.strength + equipBonuses.strength + 
        baseStats.speed + equipBonuses.speed + 
        baseStats.endurance + equipBonuses.endurance + 
        baseStats.technique + equipBonuses.technique + 
        baseStats.intelligence + equipBonuses.intelligence + 
        baseStats.mental_strength + equipBonuses.mental_strength;

    const total_power_level = total_stats_sum + 
        baseStats.bonus_hp + equipBonuses.bonus_hp + 
        ((baseStats.bonus_mp + equipBonuses.bonus_mp) * 2n) + 
        (baseStats.bonus_stamina * 5n);

    return {
      character, profile, 
      basePowerLevel: base_power_level, // Wysłanie bazy
      totalPowerLevel: total_power_level, // Wysłanie całości
      max_hp, max_mp, max_stamina,
      baseStats: {
        strength: baseStats.strength.toString(),
        speed: baseStats.speed.toString(),
        endurance: baseStats.endurance.toString(),
        technique: baseStats.technique.toString(),
        intelligence: baseStats.intelligence.toString(),
        mental_strength: baseStats.mental_strength.toString(),
        bonus_hp: baseStats.bonus_hp.toString(),
        bonus_mp: baseStats.bonus_mp.toString(),
        bonus_stamina: baseStats.bonus_stamina.toString()
      },
      equipStats: {
        strength: equipBonuses.strength.toString(),
        speed: equipBonuses.speed.toString(),
        endurance: equipBonuses.endurance.toString(),
        technique: equipBonuses.technique.toString(),
        intelligence: equipBonuses.intelligence.toString(),
        mental_strength: equipBonuses.mental_strength.toString(),
        bonus_hp: equipBonuses.bonus_hp.toString(),
        bonus_mp: equipBonuses.bonus_mp.toString(),
        bonus_coins_pct: equipBonuses.bonus_coins_pct.toString(), 
        bonus_coins: equipBonuses.bonus_coins.toString(), 
        breakdown: equipBreakdown
      },
      trainingStats: {
        strength: trainingBonuses.strength.toString(),
        speed: trainingBonuses.speed.toString(),
        endurance: trainingBonuses.endurance.toString(),
        technique: trainingBonuses.technique.toString(), 
        intelligence: trainingBonuses.intelligence.toString(),
        mental_strength: trainingBonuses.mental_strength.toString(),
        bonus_hp: trainingBonuses.bonus_hp.toString(),
        bonus_mp: trainingBonuses.bonus_mp.toString(),
        bonus_coins_pct: trainingBonuses.bonus_coins_pct.toString()
      }
    };

  } catch (err) {
    console.error('[Stats] Błąd w getFullCharacterStats:', err.message);
    throw err;
  }
}

// Funkcja pobierająca początkowy stan z bazy przy starcie serwera
async function initGlobalState() {
  try {
    const { data, error } = await supabase
      .from('global_server_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;
    globalServerState = data;
    
    // 🛡️ BEZPIECZNIK: Jeśli serwer zrestartował się w trakcie przerwy, wymuś odblokowanie!
    if (globalServerState.is_maintenance) {
        console.log('[BEZPIECZNIK] Wykryto zablokowany serwer po restarcie! Wymuszam odblokowanie...');
        await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
        globalServerState.is_maintenance = false;
    }

    console.log(`[Zegar DC] Stan serwera załadowany do RAM. Runda: ${globalServerState.current_round}, Dzień DC: ${globalServerState.current_dc_day}`);
    
    // Uruchomienie nasłuchiwania na zmiany w bazie (WebSockets)
    subscribeToGlobalStateChanges();
  } catch (err) {
    console.error('Krytyczny błąd pobierania globalnego stanu:', err.message);
  }
}

// Funkcja nasłuchująca na zmiany w tabeli za pomocą Supabase Realtime
function subscribeToGlobalStateChanges() {
  supabase
    .channel('global_state_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'global_server_state', filter: 'id=eq.1' },
      (payload) => {
        globalServerState = payload.new;
        console.log(`[Zegar DC] Wykryto zmianę! Zaktualizowano bufor RAM. Runda: ${globalServerState.current_round}, Dzień: ${globalServerState.current_dc_day}`);
        console.log(`[Zegar DC] Przerwa techniczna (Maintenance): ${globalServerState.is_maintenance}`);
      }
    )
    .subscribe();
}

// ==========================================
// ENDPOINTY API
// ==========================================

// Middleware (Bezpiecznik) sprawdzający przerwę techniczną przed każdą akcją
app.use((req, res, next) => {
  if (!globalServerState) {
    return res.status(503).json({ error: 'Serwer się uruchamia, spróbuj ponownie za chwilę.' });
  }
  
  if (globalServerState.is_maintenance) {
    return res.status(503).json({ error: 'Trwa zmiana dnia DC (Przerwa techniczna). Gra zablokowana na chwilę.' });
  }
  
  next(); 
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    ram_buffer: globalServerState
  });
});

// ==========================================
// SYSTEM AUTORYZACJI I KONT
// ==========================================

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ error: 'Brak tokenu autoryzacyjnego' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(403).json({ error: 'Nieprawidłowy lub wygasły token' });

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Błąd weryfikacji tokenu:', err.message);
    return res.status(403).json({ error: 'Błąd weryfikacji tokenu' });
  }
}

const requireAlive = async (req, res, next) => {
    try {
        const { data: char, error } = await supabase
            .from('characters')
            .select('hp')
            .eq('profile_id', req.user.id)
            .single();

        if (error || !char) return res.status(404).json({ error: 'Nie znaleziono postaci' });

        if (BigInt(char.hp || '0') <= 0n) {
            return res.status(400).json({ success: false, error: 'Jesteś w Szpitalu! Nie możesz wykonywać tej akcji.' });
        }
        next(); 
    } catch (err) {
        res.status(500).json({ error: 'Błąd weryfikacji zdrowia' });
    }
};

app.post('/api/auth/register', async (req, res) => {
  const { email, password, username, gender } = req.body;
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    const userId = authData.user.id;

    const { error: profileError } = await supabase.from('profiles').insert([{ id: userId, username, gender }]);
    if (profileError) throw new Error('Nie udało się utworzyć profilu. Nick może być już zajęty.');

    const { error: charError } = await supabase.from('characters').insert([{ profile_id: userId }]);
    if (charError) throw charError;

    res.json({ status: 'success', message: 'Konto utworzone pomyślnie!' });
  } catch (err) {
    console.error('[Auth] Błąd rejestracji:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    res.json({ status: 'success', token: data.session.access_token, user: data.user });
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Nieprawidłowy email lub hasło.' });
  }
});

// ==========================================
// 🧍‍♂️ 3. DANE POSTACI, EKWIPUNEK I PRZEDMIOTY
// ==========================================

app.get('/api/character', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fullStats = await getFullCharacterStats(userId);
    const { character, profile, basePowerLevel, totalPowerLevel, max_hp, max_mp, max_stamina, baseStats, equipStats } = fullStats;

    const ensureUTC = (dateVal) => {
        if (!dateVal || dateVal === 'null' || dateVal === 'undefined') return null;
        const str = String(dateVal).trim();
        if (str.endsWith('Z') || str.includes('+') || (str.includes('T') && str.indexOf('-', str.indexOf('T')) !== -1)) return str; 
        return str + 'Z';
    };

    const lastCalcStr = ensureUTC(character.last_calculation_time);
    
    let exactHospitalEndTime = null;
    if (character.last_death_penalty && character.last_death_penalty.hospital_end_ms) {
        exactHospitalEndTime = Number(character.last_death_penalty.hospital_end_ms);
    } else if (character.hospital_until) {
        exactHospitalEndTime = new Date(ensureUTC(character.hospital_until)).getTime();
    }

    const now = Date.now();
    let effectiveLastCalcTime = now;
    
    if (lastCalcStr) {
        const parsedTime = new Date(lastCalcStr).getTime();
        if (!isNaN(parsedTime)) effectiveLastCalcTime = parsedTime;
    }
    
    let isHospitalized = false;
    let hospitalExitTime = null;
    
    if (BigInt(character.hp ?? '100') <= 0n) {
        if (exactHospitalEndTime && !isNaN(exactHospitalEndTime)) {
            if (now + 500 < exactHospitalEndTime) {
                isHospitalized = true;
                effectiveLastCalcTime = now; 
            } else {
                isHospitalized = false;
                hospitalExitTime = exactHospitalEndTime;
                effectiveLastCalcTime = exactHospitalEndTime; 
            }
        } else {
            isHospitalized = true;
            effectiveLastCalcTime = now;
        }
    }

    let elapsedMs = now - effectiveLastCalcTime;
    if (isNaN(elapsedMs) || elapsedMs < 0) elapsedMs = 0;

    let isTrainingActiveRightNow = false;
    if (character.active_training_id && character.training_end_time) {
        const trainingEndTimeMs = new Date(character.training_end_time).getTime();
        
        if (now < trainingEndTimeMs) {
            isTrainingActiveRightNow = true;
            elapsedMs = 0; 
        } else {
            if (effectiveLastCalcTime < trainingEndTimeMs) {
                elapsedMs = now - trainingEndTimeMs;
            }
        }
    }
    
    const consumedMs = elapsedMs - (elapsedMs % 60000);
    let remainderMs = elapsedMs % 60000; 
    if (isNaN(remainderMs)) remainderMs = 0;
    
    const ticks60s = BigInt(Math.floor(consumedMs / 60000));
    const newCalcTimeUTC = new Date(now - remainderMs).toISOString(); 
    
    let current_stamina = BigInt(character.stamina ?? '100');
    let current_hp = BigInt(character.hp ?? '100');
    let current_mp = BigInt(character.mp ?? '100');
    let dbUpdateNeeded = false;

    if (hospitalExitTime && current_hp <= 0n) {
        const initialHp = (max_hp * 10n) / 100n; 
        current_hp = maxBigInt(initialHp, current_hp);
        dbUpdateNeeded = true;
    }

    if (ticks60s > 0n || !character.last_calculation_time) {
      if (isHospitalized) {
        dbUpdateNeeded = false;
      } else if (isTrainingActiveRightNow) {
        dbUpdateNeeded = true; 
      } else {
        const finalEndurance = BigInt(baseStats.endurance) + BigInt(equipStats.endurance || '0');
        const finalMentalStrength = BigInt(baseStats.mental_strength) + BigInt(equipStats.mental_strength || '0');
        
        const staminaGain = ticks60s * 1n;
        const enduranceBonus = BigInt(Math.floor(Math.sqrt(Number(finalEndurance)) / 10));
        const hpGain = ticks60s * (1n + enduranceBonus);
        const mentalBonus = BigInt(Math.floor(Math.sqrt(Number(finalMentalStrength)) / 5));
        const mpGain = ticks60s * (2n + mentalBonus);

        current_stamina = minBigInt(max_stamina, current_stamina + staminaGain);
        current_hp = minBigInt(max_hp, current_hp + hpGain);
        current_mp = minBigInt(max_mp, current_mp + mpGain);
        
        dbUpdateNeeded = true;
      }
    }

    let updateData = {};

    if (dbUpdateNeeded) {
        updateData.stamina = current_stamina.toString();
        updateData.hp = current_hp.toString();
        updateData.mp = current_mp.toString();
        updateData.last_calculation_time = newCalcTimeUTC;
    }

    if (String(character.total_power_level || '0') !== totalPowerLevel.toString()) {
        updateData.total_power_level = parseInt(totalPowerLevel.toString(), 10); 
    }

    let features = character.unlocked_features || [];
    if (character.completed_missions && character.completed_missions.includes('10000000-0000-0000-0000-000000000006')) {
        if (!features.includes('work')) {
            features.push('work');
            updateData.unlocked_features = features;
        }
    }

    if (Object.keys(updateData).length > 0) {
        const { error: updErr } = await supabase.from('characters').update(updateData).eq('profile_id', userId);
        if (updErr) console.error('[Stats] ⚠️ Błąd zapisu danych postaci (Top 10):', updErr.message);
    }

    const characterData = {
      username: profile.username,
      power_level: basePowerLevel.toString(),
      total_power_level: totalPowerLevel.toString(),
      coins: character.coins ?? '0',
      bank_coins: character.bank_coins ?? '0',
      bank_coin_limit_level: character.bank_coin_limit_level ?? 1,
      bank_slots_unlocked: character.bank_slots_unlocked ?? 5,
      current_form: character.current_form ?? 'Stan Podstawowy',
      current_hp: current_hp.toString(),
      current_mp: current_mp.toString(),
      current_stamina: current_stamina.toString(), 
      max_hp: max_hp.toString(),
      max_mp: max_mp.toString(),
      max_stamina: max_stamina.toString(),
      stats: baseStats, 
      equip_stats: equipStats, 
      completed_missions: character.completed_missions || [],
      attempted_one_try_missions: character.attempted_one_try_missions || [],
      hospital_until: exactHospitalEndTime ? new Date(exactHospitalEndTime).toISOString() : (character.hospital_until ? String(character.hospital_until).trim() + 'Z' : null),
      hospital_reason: character.last_death_penalty ? character.last_death_penalty.source : null,
      unlocked_features: features,
      // --- NOWE: ZADANIA SPECJALNE ---
      daily_tasks_progress: character.daily_tasks_progress || {},
      daily_global_tasks: globalServerState?.daily_global_tasks || []
    };

    res.json(JSON.parse(JSON.stringify(characterData, bigIntReplacer)));
  } catch (err) {
    console.error('[Character] Błąd pobierania danych postaci:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania danych postaci' });
  }
});

app.get('/api/missions', authenticateToken, async (req, res) => {
  try {
    const { data: missions, error } = await supabase
      .from('missions')
      .select('*')
      .order('stamina_cost', { ascending: true });

    if (error) return res.status(500).json({ error: 'Błąd serwera podczas pobierania misji' });

    const now = Date.now();
    if (!itemDictCache || (now - itemDictCacheTime > 30 * 60 * 1000)) {
        const { data: items } = await supabase.from('item_templates').select('id, name');
        itemDictCache = {};
        if (items) items.forEach(item => itemDictCache[item.id] = item.name);
        itemDictCacheTime = now;
    }
    const itemDict = itemDictCache;

    const enrichedMissions = missions.map(mission => {
        if (mission.drop_table && Array.isArray(mission.drop_table)) {
            mission.drop_table = mission.drop_table.map(drop => ({
                ...drop,
                item_name: itemDict[drop.item_id] || 'Przedmiot'
            }));
        }
        return mission;
    });

    enrichedMissions.sort((a, b) => {
        const strA = parseInt(a.req_stats?.strength || '0', 10);
        const strB = parseInt(b.req_stats?.strength || '0', 10);
        return strA - strB;
    });

    res.json(enrichedMissions || []);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera podczas pobierania misji' });
  }
});

app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: character, error: characterError } = await supabase.from('characters').select('id').eq('profile_id', userId).single();
    if (characterError || !character) return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });

    const { data: inventory, error: inventoryError } = await supabase.from('inventory').select('*, item_templates(*)').eq('character_id', character.id);
    if (inventoryError) return res.status(500).json({ error: 'Błąd serwera podczas pobierania ekwipunku' });

    res.json(inventory || []);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera podczas pobierania ekwipunku' });
  }
});

app.post('/api/inventory/swap', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id_1, slot_target, backpack_index_target, item_id_2 } = req.body;

    if (!item_id_1 || !slot_target) return res.status(400).json({ error: 'Brak parametrów' });

    const { data: character } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (!character) return res.status(404).json({ error: 'Postać nie istnieje' });

    const { data: draggedItem } = await supabase.from('inventory').select('*, item_templates(*)').eq('id', item_id_1).eq('character_id', character.id).single();
    if (!draggedItem) return res.status(404).json({ error: 'Brak przedmiotu' });

    if (draggedItem.item_templates.category === 'equipment' && draggedItem.item_templates.req_stats && slot_target !== 'backpack') {
      for (const [stat, requiredValue] of Object.entries(draggedItem.item_templates.req_stats)) {
        const playerStat = BigInt(character[stat] || '1');
        const requiredStat = BigInt(requiredValue);
        if (playerStat < requiredStat) {
          const statNames = { 'strength': 'Siła', 'speed': 'Szybkość', 'endurance': 'Wytrzymałość', 'intelligence': 'Inteligencja', 'mental_strength': 'Siła Mentalna' };
          return res.status(400).json({ error: `Nie spełniasz wymagań! Wymagana ${statNames[stat] || stat}: ${requiredValue}` });
        }
      }
    }

    let wasOccupied = false;
    let targetItem = null;
    
    if (slot_target === 'backpack' && backpack_index_target !== null && backpack_index_target !== undefined) {
      const { data: existingBackpackItem } = await supabase
        .from('inventory').select('*, item_templates(*)').eq('character_id', character.id).is('equipped_slot', null)
        .eq('backpack_index', backpack_index_target).neq('id', item_id_1).maybeSingle();
      if (existingBackpackItem) { targetItem = existingBackpackItem; wasOccupied = true; }
    } else if (slot_target !== 'backpack' && slot_target !== 'bank') {
      const { data: existingItem } = await supabase
        .from('inventory').select('id').eq('character_id', character.id).eq('equipped_slot', slot_target)
        .neq('id', item_id_1).maybeSingle();
      if (existingItem) wasOccupied = true;
    }

    if (targetItem && draggedItem.equipped_slot !== null && slot_target === 'backpack') {
      if (targetItem.item_templates && targetItem.item_templates.category === 'equipment' && targetItem.item_templates.req_stats) {
        for (const [stat, requiredValue] of Object.entries(targetItem.item_templates.req_stats)) {
          const playerStat = BigInt(character[stat] || '1');
          const requiredStat = BigInt(requiredValue);
          if (playerStat < requiredStat) {
            const statNames = { 'strength': 'Siła', 'speed': 'Szybkość', 'endurance': 'Wytrzymałość', 'intelligence': 'Inteligencja', 'mental_strength': 'Siła Mentalna' };
            return res.status(400).json({ error: `Przedmiot w plecaku wymaga więcej statystyk! Wymagana ${statNames[stat] || stat}: ${requiredValue}` });
          }
        }
      }
    }

    if (targetItem && draggedItem.item_template_id === targetItem.item_template_id && (draggedItem.item_templates.category === 'consumable' || draggedItem.item_templates.category === 'special_consumable')) {
      const totalQuantity = BigInt(draggedItem.quantity || '1') + BigInt(targetItem.quantity || '1');
      if (totalQuantity <= 99n) {
        await supabase.from('inventory').update({ quantity: totalQuantity.toString() }).eq('id', targetItem.id);
        await supabase.from('inventory').delete().eq('id', item_id_1);
        return res.json({ success: true, message: 'Przedmioty zostały połączone.' });
      } else {
        const overflow = totalQuantity - 99n;
        await supabase.from('inventory').update({ quantity: '99' }).eq('id', targetItem.id);
        await supabase.from('inventory').update({ quantity: overflow.toString() }).eq('id', item_id_1);
        return res.json({ success: true, message: 'Przedmioty zostały połączone (osiągnięto maksymalną ilość).' });
      }
    }

    const { error: swapError } = await supabase.rpc('swap_items', {
        p_character_id: character.id, 
        p_item_id_1: item_id_1, 
        p_slot_target: slot_target,
        p_backpack_index_target: backpack_index_target || null, 
        p_item_id_2: item_id_2 || null
    });

    if (swapError) return res.status(500).json({ error: 'Błąd podczas zamiany przedmiotów' });

    const fullStats = await getFullCharacterStats(userId);
    const newMaxHp = BigInt(fullStats.max_hp);
    const newMaxMp = BigInt(fullStats.max_mp);
    const newMaxStamina = BigInt(fullStats.max_stamina);

    const currentHp = BigInt(character.hp || '100');
    const currentMp = BigInt(character.mp || '100');
    const currentStamina = BigInt(character.stamina || '100');

    const finalHp = currentHp > newMaxHp ? newMaxHp : currentHp;
    const finalMp = currentMp > newMaxMp ? newMaxMp : currentMp;
    const finalStamina = currentStamina > newMaxStamina ? newMaxStamina : currentStamina;

    await supabase.from('characters').update({
        hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString()
    }).eq('id', character.id);

    let responseMessage = 'Akcja wykonana pomyślnie.';
    if (slot_target === 'backpack') {
      responseMessage = wasOccupied ? 'Przedmioty zostały zamienione miejscami.' : 'Przedmiot schowany do plecaka / przeniesiony.';
    } else {
      responseMessage = wasOccupied ? 'Przedmioty zostały zamienione miejscami.' : (draggedItem.equipped_slot !== null ? 'Sprzęt zdjęty.' : 'Sprzęt założony.');
    }

    res.json({ success: true, message: responseMessage, character_updates: { hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString() }});
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera podczas zamiany przedmiotów' });
  }
});

app.post('/api/inventory/consume', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id } = req.body;

    if (!inventory_id) return res.status(400).json({ error: 'Brak parametru' });

    const { data: character } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (!character) return res.status(404).json({ error: 'Nie znaleziono postaci' });

    const { data: item } = await supabase.from('inventory').select('*, item_templates(*)').eq('id', inventory_id).eq('character_id', character.id).single();
    if (!item) return res.status(404).json({ error: 'Nie znaleziono przedmiotu' });

    if (item.item_templates.category !== 'consumable' && item.item_templates.category !== 'special_consumable') {
      return res.status(400).json({ error: 'Ten przedmiot nie jest używalny!' });
    }
    if (item.equipped_slot !== null) return res.status(400).json({ error: 'Zdejmij przedmiot przed użyciem!' });

    const fullStats = await getFullCharacterStats(userId);

    let currentStr = BigInt(fullStats.baseStats.strength || '1');
    let currentTech = BigInt(fullStats.baseStats.technique || '1');
    let currentInt = BigInt(fullStats.baseStats.intelligence || '1');
    let currentEnd = BigInt(fullStats.baseStats.endurance || '1');
    let currentSpd = BigInt(fullStats.baseStats.speed || '1');
    let currentMen = BigInt(fullStats.baseStats.mental_strength || '1');
    const currentBonusStamina = BigInt(character.bonus_stamina || '0');
    
    let maxHp = BigInt(fullStats.max_hp);
    let maxMp = BigInt(fullStats.max_mp);
    const maxStamina = BigInt(fullStats.max_stamina);

    let currentHp = BigInt(character.hp ?? '100');
    let currentMp = BigInt(character.mp ?? '100');
    let currentStamina = BigInt(character.stamina ?? '100');
    let currentCoins = BigInt(character.coins ?? '0');
    let newBonusStamina = BigInt(fullStats.baseStats.bonus_stamina);

    const effects = item.item_templates.consumable_effect;
    if (!effects) return res.status(400).json({ error: 'Brak efektów!' });

    let effectMessages = [];

    for (const [effect, value] of Object.entries(effects)) {
      if (effect === 'restore_hp') {
        currentHp = minBigInt(maxHp, currentHp + BigInt(value)); effectMessages.push(`+${value} HP`);
      } else if (effect === 'restore_mp') {
        currentMp = minBigInt(maxMp, currentMp + BigInt(value)); effectMessages.push(`+${value} MP`);
      } else if (effect === 'restore_stamina') {
        currentStamina = minBigInt(maxStamina, currentStamina + BigInt(value)); effectMessages.push(`+${value} Staminy`);
      } else if (effect === 'restore_hp_pct') {
        currentHp = minBigInt(maxHp, currentHp + (maxHp * BigInt(value)) / 100n); effectMessages.push(`+${value}% HP`);
      } else if (effect === 'restore_mp_pct') {
        currentMp = minBigInt(maxMp, currentMp + (maxMp * BigInt(value)) / 100n); effectMessages.push(`+${value}% MP`);
      } else if (effect === 'add_coins') { 
        currentCoins = currentCoins + BigInt(value); effectMessages.push(`+${value} Monet`);
      } else if (effect === 'restore_stamina_pct') {
        currentStamina = minBigInt(maxStamina, currentStamina + (maxStamina * BigInt(value)) / 100n); effectMessages.push(`+${value}% Staminy`);
      } else if (effect === 'bonus_stamina') {
        newBonusStamina = currentBonusStamina + BigInt(value);
        if (newBonusStamina > 900n) return res.status(400).json({ error: 'Osiągnięto limit (900)!' });
        effectMessages.push(`+${value} Max Staminy`);
      } else if (effect === 'hospital_exit_recovery' || effect === 'full_resurrection') {
        currentHp = maxHp; currentMp = maxMp; currentStamina = maxStamina; effectMessages.push('Odzyskano 100% zasobów');
        if (BigInt(character.hp || '0') <= 0n) {
            if (character.last_death_penalty) {
                const dp = character.last_death_penalty;
                currentStr += BigInt(dp.strength || '0'); currentSpd += BigInt(dp.speed || '0');
                currentEnd += BigInt(dp.endurance || '0'); currentInt += BigInt(dp.intelligence || '0');
                currentMen += BigInt(dp.mental_strength || '0');

                const totalStr = currentStr + BigInt(fullStats.equipStats.strength || '0');
                const totalInt = currentInt + BigInt(fullStats.equipStats.intelligence || '0');
                
                maxHp = 100n + (totalStr / 20n) + BigInt(character.bonus_hp || '0') + BigInt(fullStats.equipStats.bonus_hp || '0');
                maxMp = 100n + (totalInt / 5n) + BigInt(character.bonus_mp || '0') + BigInt(fullStats.equipStats.bonus_mp || '0');
                
                currentHp = maxHp; currentMp = maxMp;
                effectMessages.push('Przebudzenie! Zwrócono statystyki.');
            } else { effectMessages.push('Wskrzeszenie!'); }
            req.clearHospital = true;
        }
      } else if (effect === 'restore_hp' && value === 'full') {
        currentHp = maxHp; effectMessages.push('Pełne HP');
      } else if (effect === 'restore_mp' && value === 'full') {
        currentMp = maxMp; effectMessages.push('Pełne MP');
      } else if (effect === 'restore_stamina' && value === 'full') {
        currentStamina = maxStamina; effectMessages.push('Pełna Stamina');
      } else if (effect === 'permanent_bonus') {
        for (const [stat, statValue] of Object.entries(value)) {
          const bonus = BigInt(statValue);
          if (stat === 'strength') currentStr += bonus;
          else if (stat === 'speed') currentSpd += bonus;
          else if (stat === 'endurance') currentEnd += bonus;
          else if (stat === 'technique') currentTech += bonus;
          else if (stat === 'intelligence') currentInt += bonus;
          else if (stat === 'mental_strength') currentMen += bonus;
          
          effectMessages.push(`+${statValue} ${stat}`);
        }
      }
    }

    const originalHp = BigInt(character.hp ?? '100');
    const originalMp = BigInt(character.mp ?? '100');
    const originalStamina = BigInt(character.stamina ?? '100');
    const originalBonusStamina = BigInt(character.bonus_stamina ?? '0');
    const hasPermanentEffects = effects.permanent_bonus || effects.bonus_stamina || ((effects.hospital_exit_recovery || effects.full_resurrection) && originalHp <= 0n);
    
    if (currentHp === originalHp && currentMp === originalMp && currentStamina === originalStamina && currentCoins === BigInt(character.coins || '0') && !hasPermanentEffects) {
      return res.json({ success: false, status: 'warning', message: 'Twoje zasoby są już w pełni odnowione, szkoda marnować przedmiotu!' });
    }

    if (BigInt(item.quantity) > 1n) {
      await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - 1n).toString() }).eq('id', inventory_id);
    } else {
      await supabase.from('inventory').delete().eq('id', inventory_id);
    }

    const updateData = {
        hp: currentHp.toString(), mp: currentMp.toString(), stamina: currentStamina.toString(), coins: currentCoins.toString(),
        bonus_stamina: newBonusStamina.toString(), strength: currentStr.toString(), speed: currentSpd.toString(),
        endurance: currentEnd.toString(), technique: currentTech.toString(), intelligence: currentInt.toString(), mental_strength: currentMen.toString()
    };

    if (req.clearHospital) { updateData.hospital_until = null; updateData.last_death_penalty = null; }
    await supabase.from('characters').update(updateData).eq('id', character.id);

    // --- TRACKER ZADAŃ SPECJALNYCH (ZUŻYCIE) ---
    await updateTaskProgress(userId, 'consume', item.item_template_id, 1);
    await updateTaskProgress(userId, 'consume', 'any', 1);

    res.json({ success: true, message: `Użyto ${item.item_templates.name}! ${effectMessages.join(', ')}`, effects: effectMessages, character_updates: { hp: currentHp.toString(), mp: currentMp.toString(), stamina: currentStamina.toString(), bonus_stamina: newBonusStamina.toString(), coins: (character.coins || '0').toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ==========================================
// ⚔️ 4. SYSTEM MISJI I DROPÓW
// ==========================================
app.post('/api/missions/start', authenticateToken, requireAlive, async (req, res) => {
  try {
    const { missionId } = req.body;
    const userId = req.user.id;

    const fullStats = await getFullCharacterStats(userId);
    const character = fullStats.character;

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) return res.status(404).json({ error: 'Nie znaleziono misji' });
    if (BigInt(character.stamina ?? '0') < BigInt(mission.stamina_cost)) return res.status(400).json({ status: 'error', message: 'Nie masz staminy!' });

    const completedMissions = character.completed_missions || [];
    const attemptedOneTry = character.attempted_one_try_missions || [];

    if (mission.is_repeatable === false && completedMissions.includes(missionId)) return res.status(400).json({ status: 'error', message: 'Ta misja została już przez Ciebie ukończona!' });
    if (mission.is_one_try === true && attemptedOneTry.includes(missionId)) return res.status(400).json({ status: 'error', message: 'Wykorzystałeś już swoją jedyną szansę w tej misji!' });

    const reqStats = mission.req_stats || {};
    let totalCappedRatio = 0n; 
    let reqCount = 0n;

    const effectiveStr = BigInt(fullStats.baseStats.strength) + BigInt(fullStats.equipStats.strength || '0');
    const effectiveSpd = BigInt(fullStats.baseStats.speed) + BigInt(fullStats.equipStats.speed || '0');
    const effectiveEnd = BigInt(fullStats.baseStats.endurance) + BigInt(fullStats.equipStats.endurance || '0');

    let lowestRawPlayerStat = -1n;
    let reqStatForThreshold = 1n;

    ['strength', 'speed', 'endurance', 'technique'].forEach(stat => {
      if (reqStats[stat] && reqStats[stat] > 0) {
        let playerStat = 1n;
        if (stat === 'strength') playerStat = effectiveStr;
        if (stat === 'speed') playerStat = effectiveSpd;
        if (stat === 'endurance') playerStat = effectiveEnd;
        if (stat === 'technique') playerStat = BigInt(fullStats.baseStats.technique) + BigInt(fullStats.equipStats.technique || '0');
        
        const reqStat = BigInt(reqStats[stat]);
        if (lowestRawPlayerStat === -1n || playerStat < lowestRawPlayerStat) {
            lowestRawPlayerStat = playerStat;
            reqStatForThreshold = reqStat;
        }
        totalCappedRatio += minBigInt(100n, (playerStat * 100n) / reqStat);
        reqCount += 1n;
      }
    });
    
    let successChance = reqCount > 0n ? (totalCappedRatio / reqCount) : 100n;

    const currentStr = BigInt(fullStats.baseStats.strength);
    const currentSpd = BigInt(fullStats.baseStats.speed);
    const currentEnd = BigInt(fullStats.baseStats.endurance);
    const currentTech = BigInt(fullStats.baseStats.technique);
    const currentInt = BigInt(fullStats.baseStats.intelligence);
    const currentMen = BigInt(fullStats.baseStats.mental_strength);

    // KROK 1: Kary za Potęgę z użyciem Helpera
    const penaltyData = calculatePowerPenalty(lowestRawPlayerStat !== -1n ? lowestRawPlayerStat : 0n, reqStatForThreshold);
    const rewardMultiplier = penaltyData.multiplier;
    const boredomInjuryChance = penaltyData.injuryChance;
    
    let newStamina = BigInt(character.stamina || '0') - BigInt(mission.stamina_cost);
    const roll = Math.random() * 100;

    const maxHp = BigInt(fullStats.max_hp);
    const maxMp = BigInt(fullStats.max_mp);
    const maxStamina = BigInt(fullStats.max_stamina);

    // --- GAŁĄŹ: PORAŻKA ---
    if (roll > Number(successChance)) {
      const damagePercent = 5n + (100n - successChance);

      let newHp = maxBigInt(0n, BigInt(character.hp || '100') - ((maxHp * damagePercent) / 100n));
      let newMp = maxBigInt(0n, BigInt(character.mp || '100') - ((maxMp * damagePercent) / 100n));
      newStamina = maxBigInt(0n, newStamina - ((maxStamina * damagePercent) / 100n));

      let penaltyMultiplier = 2n; 
      if (successChance >= 40n && successChance <= 79n) penaltyMultiplier = 3n; 
      else if (successChance <= 39n) penaltyMultiplier = 4n; 
      
      const baseReward = maxBigInt(1n, BigInt(mission.reward_stats?.min || '1'));
      
      // KROK 2: Rozdzielanie strat przy porażce używając Helpera
      const loss = distributeStatLoss(Number(baseReward * penaltyMultiplier));
      const strLoss = loss.str; const spdLoss = loss.spd; const endLoss = loss.end; const techLoss = loss.tech;
      
      const baseCoinsReward = maxBigInt(1n, BigInt(mission.reward_coins_min || '1'));
      const coinsLost = maxBigInt(0n, (baseCoinsReward * penaltyMultiplier));
      const newCoins = maxBigInt(0n, BigInt(character.coins || '0') - coinsLost);

      const finalStr = maxBigInt(1n, currentStr - strLoss);
      const finalSpd = maxBigInt(1n, currentSpd - spdLoss);
      const finalEnd = maxBigInt(1n, currentEnd - endLoss);
      const finalTech = maxBigInt(1n, currentTech - techLoss);

      const statsLostLog = {
          strength: strLoss.toString(), speed: spdLoss.toString(),
          endurance: endLoss.toString(), technique: techLoss.toString(),
          intelligence: '0', mental_strength: '0'
      };

      const isDead = newHp <= 0n;

      // KROK 3: Obsługa śmierci używając Helpera
      if (isDead) {
          const currentStatsObj = { str: currentStr, spd: currentSpd, end: currentEnd, tech: currentTech, int: currentInt, men: currentMen };
          const deathData = calculateDeathPenalty(character, currentStatsObj, fullStats.basePowerLevel, 'mission');

          await supabase.from('characters').update({
              hp: '0', mp: '0', stamina: newStamina.toString(), coins: deathData.newCoins,
              strength: deathData.finalStats.str, speed: deathData.finalStats.spd, endurance: deathData.finalStats.end,
              technique: deathData.finalStats.tech, intelligence: deathData.finalStats.int, mental_strength: deathData.finalStats.men,
              last_death_penalty: deathData.statsLostLog, hospital_until: deathData.hospitalData.utcString, current_form: 'Stan Podstawowy',
              attempted_one_try_missions: (mission.is_one_try === true && !attemptedOneTry.includes(missionId)) ? [...attemptedOneTry, missionId] : attemptedOneTry
          }).eq('profile_id', userId);

          return res.json({ 
            result: 'death', message: `KRYTYCZNA PORAŻKA! Szpital na ${deathData.hospitalData.minutes} min.`, 
            penalty: { coins_lost: deathData.coinsLost, hospital_minutes: deathData.hospitalData.minutes, stats_lost: deathData.statsLostLog, hospital_until: deathData.hospitalData.utcString } 
          });
      } else {
        await supabase.from('characters').update({
            hp: newHp.toString(), mp: newMp.toString(), stamina: newStamina.toString(), coins: newCoins.toString(),
            strength: finalStr.toString(), speed: finalSpd.toString(), endurance: finalEnd.toString(), technique: finalTech.toString(), 
            intelligence: currentInt.toString(), mental_strength: currentMen.toString(),
            attempted_one_try_missions: (mission.is_one_try === true && !attemptedOneTry.includes(missionId)) ? [...attemptedOneTry, missionId] : attemptedOneTry
        }).eq('profile_id', userId);

        return res.json({ result: 'hurt', message: `PORAŻKA! Obrażenia: ${damagePercent}%`, damage: { hp: ((maxHp * damagePercent) / 100n).toString(), mp: ((maxMp * damagePercent) / 100n).toString(), stamina: ((maxStamina * damagePercent) / 100n).toString() }, penalty: { coins_lost: coinsLost.toString(), stats_lost: statsLostLog } });
      }
    }

    // --- GAŁĄŹ: SUKCES ---
    const minC = BigInt(mission.reward_coins_min || '0'); 
    const maxC = BigInt(mission.reward_coins_max || '0');
    let finalCoinsBase = ((minC + BigInt(Math.floor(Math.random() * Number(maxC - minC + 1n)))) * rewardMultiplier) / 100n;

    const equipCoinBonusFlat = BigInt(fullStats.equipStats.bonus_coins || '0'); 
    const trainingCoinBonusPct = BigInt(fullStats.trainingStats.bonus_coins_pct || '0'); 

    let trainingCoinBonusValue = 0n;
    if (trainingCoinBonusPct > 0n) {
        trainingCoinBonusValue = (finalCoinsBase * trainingCoinBonusPct) / 100n;
        if (trainingCoinBonusValue === 0n) trainingCoinBonusValue = 1n; 
    }
    
    const finalCoins = finalCoinsBase + trainingCoinBonusValue + equipCoinBonusFlat;
    const newCoins = BigInt(character.coins || '0') + finalCoins;

    const minS = BigInt(mission.reward_stats?.min || '0'); const maxS = BigInt(mission.reward_stats?.max || '0');
    const finalStats = maxBigInt(1n, (maxBigInt(1n, minS + BigInt(Math.floor(Math.random() * Number(maxS - minS + 1n)))) * rewardMultiplier) / 100n);

    let lowestStat = 'strength'; let minVal = currentStr;
    if (currentSpd < minVal) { lowestStat = 'speed'; minVal = currentSpd; }
    if (currentEnd < minVal) { lowestStat = 'endurance'; minVal = currentEnd; }
    if (currentTech < minVal) { lowestStat = 'technique'; minVal = currentTech; }

    // KROK 4: Dystrybucja zysków z użyciem Helpera
    const gains = distributeStatGains(finalStats, lowestStat);
    let gainStr = gains.str; let gainSpd = gains.spd; let gainEnd = gains.end; let gainTech = gains.tech;

    let trainGainStr = 0n; let trainGainSpd = 0n; let trainGainEnd = 0n; let trainGainTech = 0n;
    let trainGainBonusHp = 0n; let trainGainBonusMp = 0n;
    
    if (fullStats.trainingStats && roll <= Number(successChance)) {
        if (BigInt(fullStats.trainingStats.strength || '0') > 0n) trainGainStr = maxBigInt(1n, (BigInt(fullStats.trainingStats.strength) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.speed || '0') > 0n) trainGainSpd = maxBigInt(1n, (BigInt(fullStats.trainingStats.speed) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.endurance || '0') > 0n) trainGainEnd = maxBigInt(1n, (BigInt(fullStats.trainingStats.endurance) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.technique || '0') > 0n) trainGainTech = maxBigInt(1n, (BigInt(fullStats.trainingStats.technique) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.bonus_hp || '0') > 0n) trainGainBonusHp = maxBigInt(1n, (BigInt(fullStats.trainingStats.bonus_hp) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.bonus_mp || '0') > 0n) trainGainBonusMp = maxBigInt(1n, (BigInt(fullStats.trainingStats.bonus_mp) * rewardMultiplier) / 100n);
    }

    const newStr = currentStr + gainStr + trainGainStr;
    const newSpd = currentSpd + gainSpd + trainGainSpd;
    const newEnd = currentEnd + gainEnd + trainGainEnd;
    const newTech = currentTech + gainTech + trainGainTech;
    const newBonusHp = BigInt(character.bonus_hp || '0') + trainGainBonusHp;
    const newBonusMp = BigInt(character.bonus_mp || '0') + trainGainBonusMp;

    let finalHp = BigInt(character.hp || '100');
    let finalMp = BigInt(character.mp || '100');
    let finalStamina = newStamina;
    let appliedBoredomDamage = 0n;
    
    if (roll <= Number(successChance) && Math.random() * 100 < Number(boredomInjuryChance)) {
        appliedBoredomDamage = maxBigInt(1n, (maxHp * 10n) / 100n);
        finalHp = maxBigInt(1n, BigInt(character.hp || '100') - appliedBoredomDamage);
    } 

    // === SYSTEM DROPÓW W MISJACH ===
    let droppedItems = []; let lostDrops = []; 
    if (mission.drop_table && mission.drop_table.length > 0 && roll <= Number(successChance)) {
        const maxBackpackSlots = calculateMaxBackpackSlots({ strength: currentStr, speed: currentSpd, endurance: currentEnd });

        const { data: currentInventory } = await supabase.from('inventory').select('*, item_templates(*)').eq('character_id', character.id).is('equipped_slot', null);
        const backpackItems = currentInventory || [];

        const dropItemIds = mission.drop_table.map(d => d.item_id);
        const { data: dropTemplates } = await supabase.from('item_templates').select('*').in('id', dropItemIds);
        const templateMap = {};
        if (dropTemplates) dropTemplates.forEach(t => templateMap[t.id] = t);

        const itemsToInsert = []; const itemsToUpdate = [];

        for (const drop of mission.drop_table) {
            if ((Math.floor(Math.random() * 100) + 1) <= drop.chance_pct) {
                const itemTemplate = templateMap[drop.item_id]; 
                if (!itemTemplate) continue;

                if (itemTemplate.category === 'special_consumable') {
                    const hasInBackpack = backpackItems.some(i => i.item_template_id === itemTemplate.id);
                    let alreadyUnlocked = false;
                    if (itemTemplate.consumable_effect?.unlock_form && (character.unlocked_forms || []).includes(itemTemplate.consumable_effect.unlock_form)) alreadyUnlocked = true;
                    if (itemTemplate.consumable_effect?.unlock_skill && (character.unlocked_skills || []).includes(itemTemplate.consumable_effect.unlock_skill)) alreadyUnlocked = true;
                    if (hasInBackpack || alreadyUnlocked) continue; 
                }

                const isStackable = itemTemplate.category === 'consumable' || itemTemplate.category === 'special_consumable';
                const existingStack = backpackItems.find(i => i.item_template_id === itemTemplate.id && BigInt(i.quantity) < 99n);

                if (isStackable && existingStack) {
                    existingStack.quantity = (BigInt(existingStack.quantity) + 1n).toString();
                    itemsToUpdate.push({ id: existingStack.id, quantity: existingStack.quantity });
                    droppedItems.push({ name: itemTemplate.name, quantity: 1 });
                } else {
                    const occupiedIndexes = backpackItems.map(i => i.backpack_index);
                    let freeIdx = 1; while (occupiedIndexes.includes(freeIdx)) freeIdx++;

                    if (freeIdx <= maxBackpackSlots) {
                        const newItem = { character_id: character.id, item_template_id: itemTemplate.id, quantity: '1', equipped_slot: null, backpack_index: freeIdx };
                        itemsToInsert.push(newItem); 
                        droppedItems.push({ name: itemTemplate.name, quantity: 1 });
                        backpackItems.push(newItem); 
                    } else { lostDrops.push(itemTemplate.name); }
                }
            }
        }
        if (itemsToInsert.length > 0) await supabase.from('inventory').insert(itemsToInsert); 
        if (itemsToUpdate.length > 0) await Promise.all(itemsToUpdate.map(update => supabase.from('inventory').update({ quantity: update.quantity }).eq('id', update.id)));
    }

    let newCompleted = [...completedMissions];
    let newAttempted = [...attemptedOneTry];
    let newUnlockedFeatures = character.unlocked_features || []; 
    
    if (!newCompleted.includes(missionId)) newCompleted.push(missionId);
    if (mission.is_one_try === true && !newAttempted.includes(missionId)) newAttempted.push(missionId);

    const STORY_MISSIONS_IDS = {
        TRAINING: '00000000-0000-0000-0000-000000000005', WORK: '10000000-0000-0000-0000-000000000006',
        SPECIAL_TASKS: '10000000-0000-0000-0000-000000000010', LABORATORY: '10000000-0000-0000-0000-000000000015',
        MEDITATION: '10000000-0000-0000-0000-000000000020', PVP: '00000000-0000-0000-0000-000000000025'
    };

    if (missionId === STORY_MISSIONS_IDS.TRAINING && !newUnlockedFeatures.includes('training')) newUnlockedFeatures.push('training');
    if (missionId === STORY_MISSIONS_IDS.WORK && !newUnlockedFeatures.includes('work')) newUnlockedFeatures.push('work');
    if (missionId === STORY_MISSIONS_IDS.SPECIAL_TASKS && !newUnlockedFeatures.includes('special_tasks')) newUnlockedFeatures.push('special_tasks');
    if (missionId === STORY_MISSIONS_IDS.LABORATORY && !newUnlockedFeatures.includes('laboratory')) newUnlockedFeatures.push('laboratory');
    if (missionId === STORY_MISSIONS_IDS.MEDITATION && !newUnlockedFeatures.includes('meditation')) newUnlockedFeatures.push('meditation');
    if (missionId === STORY_MISSIONS_IDS.PVP && !newUnlockedFeatures.includes('pvp')) newUnlockedFeatures.push('pvp');

    // --- TRACKER ZADAŃ SPECJALNYCH ---
    if (roll <= Number(successChance)) {
        await updateTaskProgress(userId, 'mission', missionId, 1);
        
        const totalTrainGains = trainGainStr + trainGainSpd + trainGainEnd + trainGainTech;
        if (totalTrainGains > 0n) {
            await updateTaskProgress(userId, 'training_stats', 'strength', Number(trainGainStr));
            await updateTaskProgress(userId, 'training_stats', 'speed', Number(trainGainSpd));
            await updateTaskProgress(userId, 'training_stats', 'endurance', Number(trainGainEnd));
            await updateTaskProgress(userId, 'training_stats', 'technique', Number(trainGainTech));
            await updateTaskProgress(userId, 'training_stats', 'all', Number(totalTrainGains));
        }
    }

    await supabase.from('characters').update({
        coins: newCoins.toString(), strength: newStr.toString(), speed: newSpd.toString(), endurance: newEnd.toString(), technique: newTech.toString(),
        hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString(), bonus_hp: newBonusHp.toString(), bonus_mp: newBonusMp.toString(),
        completed_missions: newCompleted, attempted_one_try_missions: newAttempted, unlocked_features: newUnlockedFeatures 
      }).eq('profile_id', userId);

    res.json({ 
      result: 'success', message: 'Sukces!', multiplier: Number(rewardMultiplier),
      rewards: { 
        coins: finalCoins.toString(), base_coins: finalCoinsBase.toString(), bonus_coins_passive: equipCoinBonusFlat.toString(), bonus_coins_training: trainingCoinBonusValue.toString(), 
        stats_gained: finalStats.toString(), boredom_damage: appliedBoredomDamage.toString(), dropped_items: droppedItems, lost_items: lostDrops,
        gains: { strength: gainStr.toString(), speed: gainSpd.toString(), endurance: gainEnd.toString(), technique: gainTech.toString() },
        training_gains: { strength: trainGainStr.toString(), speed: trainGainSpd.toString(), endurance: trainGainEnd.toString(), technique: trainGainTech.toString(), bonus_hp: trainGainBonusHp.toString(), bonus_mp: trainGainBonusMp.toString() }
      }
    });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera podczas rozpoczynania misji' }); }
});

app.post('/api/inventory/split', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount_to_split } = req.body;

    if (!inventory_id || !amount_to_split) return res.status(400).json({ error: 'Brak parametrów' });

    const { data: character } = await supabase.from('characters').select('id').eq('profile_id', userId).single();
    if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
    const maxSlots = calculateMaxBackpackSlots(charStats);

    const { data: backpackItems } = await supabase.from('inventory').select('id, backpack_index').eq('character_id', character.id).is('equipped_slot', null);
    if (backpackItems.length >= maxSlots) return res.status(400).json({ error: 'Brak miejsca w plecaku!' });

    const { data: item } = await supabase.from('inventory').select('*').eq('id', inventory_id).eq('character_id', character.id).single();
    if (!item) return res.status(404).json({ error: 'Nie znaleziono' });
    if (item.equipped_slot !== null) return res.status(400).json({ error: 'Nie można dzielić założonych!' });

    const splitAmount = BigInt(amount_to_split);
    if (BigInt(item.quantity) <= splitAmount || splitAmount <= 0n) return res.status(400).json({ error: 'Zła ilość!' });

    await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - splitAmount).toString() }).eq('id', inventory_id);

    const occupiedIndexes = backpackItems.map(i => i.backpack_index);
    let firstFreeIndex = 1;
    while (occupiedIndexes.includes(firstFreeIndex)) firstFreeIndex++;
    
    await supabase.from('inventory').insert({ character_id: character.id, item_template_id: item.item_template_id, quantity: splitAmount.toString(), equipped_slot: null, backpack_index: firstFreeIndex });

    res.json({ success: true, message: 'Przedmiot został podzielony!' });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// --- ENDPOINT: ODBIÓR NAGRÓD ZA ZADANIA SPECJALNE ---
app.post('/api/tasks/claim', authenticateToken, requireAlive, async (req, res) => {
    try {
        const userId = req.user.id;
        const { task_id } = req.body;
        
        if (!task_id) return res.status(400).json({ error: 'Brak ID zadania' });
        
        const globalTasks = globalServerState?.daily_global_tasks || [];
        if (globalTasks.length === 0) return res.status(400).json({ error: 'Brak aktywnych zadań' });

        const { data: char } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
        if (!char) return res.status(404).json({ error: 'Postać nie istnieje' });

        let progress = char.daily_tasks_progress || {};
        let rewardsToGive = { coins: 0n, stats: {}, items: [] };
        let rewardsText = [];
        let overflowWarnings = [];

        if (task_id === 'main') {
            if (progress['main_reward_claimed']) return res.status(400).json({ error: 'Nagroda główna już odebrana!' });
            
            let allDone = true;
            globalTasks.forEach(t => {
                const p = progress[t.id] || { current: 0 };
                if (p.current < t.goal_amount) allDone = false;
            });
            
            if (!allDone) return res.status(400).json({ error: 'Nie wykonałeś jeszcze wszystkich zadań!' });

            const day = globalServerState.current_dc_day || 1;
            const config = MAIN_DAILY_REWARDS.find(r => day <= r.max_day) || MAIN_DAILY_REWARDS[MAIN_DAILY_REWARDS.length - 1];

            // 🔴 SKALOWANIE NAGRODY WZGLĘDEM ILOŚCI ZADAŃ
            // Bazowa wartość w słowniku dotyczy wykonania 3 zadań.
            const taskCount = BigInt(globalTasks.length);
            const baseTaskCount = 3n; 
            
            let dynamicTexts = [];

            if (config.reward.stats) {
                for (const [s, val] of Object.entries(config.reward.stats)) { 
                    // Skalowanie: np. 50 HP * 10 misji / 3 = 166 HP (Proporcjonalny wzrost!)
                    const scaledVal = (val * taskCount) / baseTaskCount;
                    rewardsToGive.stats[s] = scaledVal; 
                    dynamicTexts.push(`+${scaledVal} Max ${s.replace('bonus_', '').toUpperCase()}`);
                }
            }
            if (config.reward.coins) {
                const scaledCoins = (config.reward.coins * taskCount) / baseTaskCount;
                rewardsToGive.coins = scaledCoins;
                dynamicTexts.push(`${scaledCoins} Monet`);
            }
            if (config.reward.items) {
                config.reward.items.forEach(i => {
                    const scaledQty = maxBigInt(1n, (BigInt(i.qty) * taskCount) / baseTaskCount);
                    rewardsToGive.items.push({ id: i.id, qty: scaledQty });
                });
            }
            
            rewardsText.push(dynamicTexts.join(', ') + ' (Skalowana Nagroda Dnia)');
            progress['main_reward_claimed'] = true;
        } else {
            const task = globalTasks.find(t => t.id === task_id);
            if (!task) return res.status(404).json({ error: 'Nie znaleziono zadania' });
            
            const p = progress[task.id] || { current: 0, claimed: false };
            if (p.claimed) return res.status(400).json({ error: 'Nagroda już odebrana!' });
            if (p.current < task.goal_amount) return res.status(400).json({ error: 'Zadanie nie jest jeszcze ukończone!' });

            if (task.reward) {
                let rewardData = task.reward;
                if (typeof rewardData === 'string') {
                    try { rewardData = JSON.parse(rewardData); } catch (e) {}
                }

                if (rewardData.coins) { 
                    rewardsToGive.coins = BigInt(rewardData.coins); 
                    rewardsText.push(`${rewardData.coins} Monet`); 
                }
                if (rewardData.stats) {
                    for (const [s, val] of Object.entries(rewardData.stats)) { 
                        rewardsToGive.stats[s] = BigInt(val); 
                        rewardsText.push(`+${val} ${s}`); 
                    }
                }
                if (rewardData.items && Array.isArray(rewardData.items)) {
                    rewardData.items.forEach(i => rewardsToGive.items.push({ id: i.id, qty: BigInt(i.qty) }));
                }
            } else {
                rewardsToGive.coins = 500n; rewardsText.push('500 Monet');
            }
            if (!progress[task.id]) progress[task.id] = { current: task.goal_amount };
            progress[task.id].claimed = true;
        }

        let updateData = { daily_tasks_progress: progress };
        if (rewardsToGive.coins > 0n) updateData.coins = (BigInt(char.coins || '0') + rewardsToGive.coins).toString();
        for (const [stat, val] of Object.entries(rewardsToGive.stats)) updateData[stat] = (BigInt(char[stat] || '0') + val).toString();

        if (rewardsToGive.items.length > 0) {
            const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', char.id).single();
            const maxBackpackSlots = calculateMaxBackpackSlots(charStats);
            const bankSlotsUnlocked = parseInt(char.bank_slots_unlocked || '5');

            const { data: currentInv } = await supabase.from('inventory').select('*').eq('character_id', char.id);
            const backpackItems = currentInv.filter(i => i.equipped_slot === null);
            const bankItems = currentInv.filter(i => i.equipped_slot === 'bank');

            const itemIds = rewardsToGive.items.map(i => i.id);
            const { data: templates } = await supabase.from('item_templates').select('*').in('id', itemIds);
            
            let itemsToInsert = []; let itemsToUpdate = [];

            for (const rItem of rewardsToGive.items) {
                const template = templates?.find(t => t.id === rItem.id);
                if (!template) continue;
                rewardsText.push(`${rItem.qty}x ${template.name}`);
                const isStackable = template.category === 'consumable' || template.category === 'special_consumable';
                let qtyLeft = rItem.qty;

                // 1. Stosowanie w plecaku
                if (isStackable) {
                    const existingBp = backpackItems.find(i => i.item_template_id === template.id && BigInt(i.quantity) < 99n);
                    if (existingBp) {
                        const space = 99n - BigInt(existingBp.quantity);
                        const toAdd = minBigInt(space, qtyLeft);
                        existingBp.quantity = (BigInt(existingBp.quantity) + toAdd).toString();
                        itemsToUpdate.push({ id: existingBp.id, quantity: existingBp.quantity });
                        qtyLeft -= toAdd;
                    }
                }
                // 2. Nowe sloty w plecaku
                while (qtyLeft > 0n && backpackItems.length < maxBackpackSlots) {
                    const toAdd = isStackable ? minBigInt(99n, qtyLeft) : 1n;
                    const occupied = backpackItems.map(i => i.backpack_index);
                    let freeIdx = 1; while(occupied.includes(freeIdx)) freeIdx++;
                    const newItem = { character_id: char.id, item_template_id: template.id, quantity: toAdd.toString(), equipped_slot: null, backpack_index: freeIdx };
                    itemsToInsert.push(newItem); backpackItems.push(newItem); qtyLeft -= toAdd;
                }
                // 3. Overflow do Banku
                if (qtyLeft > 0n) {
                    overflowWarnings.push(`Brak miejsca w plecaku! ${template.name} zabezpieczono w Banku.`);
                    if (isStackable) {
                        const existingBank = bankItems.find(i => i.item_template_id === template.id && BigInt(i.quantity) < 99n);
                        if (existingBank) {
                            const space = 99n - BigInt(existingBank.quantity);
                            const toAdd = minBigInt(space, qtyLeft);
                            existingBank.quantity = (BigInt(existingBank.quantity) + toAdd).toString();
                            itemsToUpdate.push({ id: existingBank.id, quantity: existingBank.quantity });
                            qtyLeft -= toAdd;
                        }
                    }
                    while (qtyLeft > 0n && bankItems.length < bankSlotsUnlocked) {
                        const toAdd = isStackable ? minBigInt(99n, qtyLeft) : 1n;
                        const occupied = bankItems.map(i => i.backpack_index);
                        let freeIdx = 1; while(occupied.includes(freeIdx)) freeIdx++;
                        const newItem = { character_id: char.id, item_template_id: template.id, quantity: toAdd.toString(), equipped_slot: 'bank', backpack_index: freeIdx };
                        itemsToInsert.push(newItem); bankItems.push(newItem); qtyLeft -= toAdd;
                    }
                    // 4. Przepada
                    if (qtyLeft > 0n) overflowWarnings.push(`Brak miejsca w Banku! Utracono ${qtyLeft}x ${template.name}.`);
                }
            }
            if (itemsToInsert.length > 0) await supabase.from('inventory').insert(itemsToInsert);
            if (itemsToUpdate.length > 0) await Promise.all(itemsToUpdate.map(u => supabase.from('inventory').update({ quantity: u.quantity }).eq('id', u.id)));
        }

        await supabase.from('characters').update(updateData).eq('id', char.id);
        res.json({ success: true, rewards_text: rewardsText, overflow_warnings: overflowWarnings });
        
    } catch (err) { 
        console.error('[Tasks Claim] Błąd:', err);
        res.status(500).json({ error: 'Błąd serwera podczas odbierania nagrody' }); 
    }
});

// ==========================================
// 🛒 5. SYSTEM SKLEPU (KUPOWANIE I SPRZEDAWANIE)
// ==========================================
app.get('/api/shop/items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: char } = await supabase.from('characters').select('completed_missions, daily_shop_buys').eq('profile_id', userId).single();
    
    const unlockedLevel = getCharacterShopLevel(char.completed_missions);
    
    const { data: templates, error } = await supabase
      .from('item_templates')
      .select('*')
      .lte('shop_level', unlockedLevel) 
      .order('shop_level', { ascending: true })
      .order('buy_price_coins', { ascending: true });

    if (error) throw error;

    res.json({
      unlockedLevel,
      items: templates,
      dailyBuys: char.daily_shop_buys || {}
    });
  } catch (err) { res.status(500).json({ error: 'Błąd pobierania sklepu' }); }
});

app.post('/api/shop/buy', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { template_id, quantity = 1 } = req.body;

    const { data: character } = await supabase
        .from('characters')
        .select('id, coins, completed_missions, daily_shop_buys')
        .eq('profile_id', userId)
        .single();

    const { data: itemTemplate } = await supabase
        .from('item_templates')
        .select('*')
        .eq('id', template_id)
        .single();

    if (!character || !itemTemplate || itemTemplate.buy_price_coins === null) return res.status(400).json({ error: 'Błąd zakupu' });

    const totalCost = BigInt(itemTemplate.buy_price_coins) * BigInt(quantity);
    if (BigInt(character.coins || '0') < totalCost) return res.status(400).json({ error: 'Nie masz monet!' });

    const unlockedLevel = getCharacterShopLevel(character.completed_missions);
    if ((itemTemplate.shop_level || 1) > unlockedLevel) {
        return res.status(403).json({ error: 'Ten przedmiot jest jeszcze zablokowany!' });
    }

    const maxDaily = 11 - (itemTemplate.shop_level || 1);
    const currentBuys = character.daily_shop_buys?.[itemTemplate.id] || 0;

    if (currentBuys + quantity > maxDaily) {
        return res.status(400).json({ error: `Osiągnąłeś dzienny limit zakupu tego przedmiotu (${maxDaily}x)` });
    }

    const { data: backpackItems } = await supabase.from('inventory').select('id, item_template_id, quantity, backpack_index').eq('character_id', character.id).is('equipped_slot', null);
    const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
    const maxSlots = calculateMaxBackpackSlots(charStats);

    const existingItem = backpackItems.find(item => item.item_template_id === template_id);
    const isStackable = itemTemplate.category === 'consumable' || itemTemplate.category === 'special_consumable';

    if (!existingItem || !isStackable) {
        if (backpackItems.length >= maxSlots) return res.status(400).json({ error: 'Brak miejsca w plecaku!' });
    }

    const newDailyBuys = { ...character.daily_shop_buys };
    newDailyBuys[itemTemplate.id] = currentBuys + quantity;
    const newCoins = (BigInt(character.coins || '0') - totalCost).toString();

    await supabase.from('characters').update({
        coins: newCoins,
        daily_shop_buys: newDailyBuys
    }).eq('id', character.id);

    if (existingItem && isStackable) {
      await supabase.from('inventory').update({ quantity: (BigInt(existingItem.quantity) + BigInt(quantity)).toString() }).eq('id', existingItem.id);
    } else {
      const occupied = backpackItems.map(i => i.backpack_index);
      let freeIdx = 1; while (occupied.includes(freeIdx)) freeIdx++;
      await supabase.from('inventory').insert({ character_id: character.id, item_template_id: template_id, quantity: quantity, equipped_slot: null, backpack_index: freeIdx });
    }

    // --- TRACKER ZADAŃ SPECJALNYCH (ZAKUPY) ---
    await updateTaskProgress(userId, 'shop_buy', `shop_${itemTemplate.shop_level || 1}`, quantity);
    await updateTaskProgress(userId, 'shop_buy', 'any', quantity);

    res.json({ success: true, message: `Kupiono x${quantity}!`, item: { name: itemTemplate.name, quantity: quantity, total_cost: totalCost.toString() }});
  } catch (err) { res.status(500).json({ error: 'Błąd podczas zakupu' }); }
});

app.post('/api/shop/sell', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount } = req.body;

    const { data: character } = await supabase.from('characters').select('id, coins').eq('profile_id', userId).single();
    const { data: item } = await supabase.from('inventory').select('*, item_templates(*)').eq('id', inventory_id).eq('character_id', character.id).is('equipped_slot', null).single();

    if (!item || item.item_templates.buy_price_coins === null) return res.status(400).json({ error: 'Nie można sprzedać' });

    const sellQuantity = (!amount || amount === 'all') ? BigInt(item.quantity) : minBigInt(BigInt(amount), BigInt(item.quantity));
    const totalSellPrice = (BigInt(item.item_templates.buy_price_coins) / 2n) * sellQuantity;

    await supabase.from('characters').update({ coins: (BigInt(character.coins || '0') + totalSellPrice).toString() }).eq('id', character.id);

    if (sellQuantity === BigInt(item.quantity)) await supabase.from('inventory').delete().eq('id', inventory_id);
    else await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - sellQuantity).toString() }).eq('id', inventory_id);

    // --- TRACKER ZADAŃ SPECJALNYCH (SPRZEDAŻ) ---
    await updateTaskProgress(userId, 'shop_sell', 'any', Number(sellQuantity));
    await updateTaskProgress(userId, 'shop_sell', item.item_template_id, Number(sellQuantity));
    if (item.item_templates.category) {
        await updateTaskProgress(userId, 'shop_sell', item.item_templates.category, Number(sellQuantity));
    }

    res.json({ success: true, message: `Sprzedano za ${totalSellPrice}!`, item: { name: item.item_templates.name, quantity: sellQuantity.toString(), total_sell_price: totalSellPrice.toString() }});
  } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

// ==========================================
// 🏦 6. SYSTEM BANKU I SKRYTKI
// ==========================================

app.post('/api/bank/transfer_coins', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action, amount } = req.body;

    if (!action || !amount) return res.status(400).json({ error: 'Brak parametrów' });
    if (!['deposit', 'withdraw'].includes(action)) return res.status(400).json({ error: 'Nieprawidłowa akcja' });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, coins, bank_coins, bank_coin_limit_level')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    const transferAmount = BigInt(amount);
    if (transferAmount <= 0n) return res.status(400).json({ error: 'Kwota musi być dodatnia' });

    const currentCoins = BigInt(character.coins || '0');
    const currentBankCoins = BigInt(character.bank_coins || '0');
    const currentLimitLevel = parseInt(character.bank_coin_limit_level || '1');
    const bankLimit = BigInt(BANK_COIN_LIMITS[currentLimitLevel].limit);

    if (action === 'deposit') {
      if (currentCoins < transferAmount) return res.status(400).json({ error: 'Nie masz tyle monet!' });
      if (currentBankCoins + transferAmount > bankLimit) {
        return res.status(400).json({ error: `Przekroczysz limit banku (${bankLimit})!` });
      }
      
      await supabase.from('characters').update({
        coins: (currentCoins - transferAmount).toString(),
        bank_coins: (currentBankCoins + transferAmount).toString()
      }).eq('id', character.id);

      res.json({ success: true, message: `Wpłacono ${amount} monet do banku!` });
    } else {
      if (currentBankCoins < transferAmount) return res.status(400).json({ error: 'Nie masz tyle monet w banku!' });
      
      await supabase.from('characters').update({
        coins: (currentCoins + transferAmount).toString(),
        bank_coins: (currentBankCoins - transferAmount).toString()
      }).eq('id', character.id);

      res.json({ success: true, message: `Wypłacono ${amount} monet z banku!` });
    }
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

app.post('/api/bank/upgrade', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { upgrade_type } = req.body;

    if (!upgrade_type || !['coin_limit', 'slot'].includes(upgrade_type)) {
      return res.status(400).json({ error: 'Nieprawidłowy typ ulepszenia' });
    }

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, coins, bank_coin_limit_level, bank_slots_unlocked')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    if (BigInt(character.hp || '0') <= 0n) {
      return res.status(400).json({ error: 'Jesteś w Szpitalu! Bank jest niedostępny.' });
    }

    const currentCoins = BigInt(character.coins || '0');

    if (upgrade_type === 'coin_limit') {
      const currentLevel = parseInt(character.bank_coin_limit_level || '1');
      if (currentLevel >= 10) return res.status(400).json({ error: 'Osiągnięto maksymalny poziom!' });
      
      const nextLevel = currentLevel + 1;
      const upgradeCost = BigInt(BANK_COIN_LIMITS[nextLevel].cost);
      
      if (currentCoins < upgradeCost) return res.status(400).json({ error: 'Nie masz tyle monet na ulepszenie!' });
      
      await supabase.from('characters').update({
        coins: (currentCoins - upgradeCost).toString(),
        bank_coin_limit_level: nextLevel
      }).eq('id', character.id);

      res.json({ success: true, message: `Limit banku ulepszony do poziomu ${nextLevel}!` });
    } else {
      const currentSlots = parseInt(character.bank_slots_unlocked || '5');
      if (currentSlots >= 25) return res.status(400).json({ error: 'Osiągnięto maksymalną liczbę slotów!' });
      
      const nextSlot = currentSlots + 1;
      let upgradeCost;
      
      if (nextSlot >= 6 && nextSlot <= 10) upgradeCost = BigInt(BANK_SLOT_COSTS['6-10']);
      else if (nextSlot >= 11 && nextSlot <= 15) upgradeCost = BigInt(BANK_SLOT_COSTS['11-15']);
      else if (nextSlot >= 16 && nextSlot <= 20) upgradeCost = BigInt(BANK_SLOT_COSTS['16-20']);
      else if (nextSlot >= 21 && nextSlot <= 25) upgradeCost = BigInt(BANK_SLOT_COSTS['21-25']);
      
      if (currentCoins < upgradeCost) return res.status(400).json({ error: 'Nie masz tyle monet na ulepszenie!' });
      
      await supabase.from('characters').update({
        coins: (currentCoins - upgradeCost).toString(),
        bank_slots_unlocked: nextSlot
      }).eq('id', character.id);

      res.json({ success: true, message: `Odblokowano ${nextSlot} slotów w banku!` });
    }
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

app.post('/api/bank/transfer_item', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, target_panel, amount, target_index } = req.body;

    if (!inventory_id || !target_panel || !amount) return res.status(400).json({ error: 'Brak parametrów' });
    if (!['bank', 'backpack'].includes(target_panel)) return res.status(400).json({ error: 'Nieprawidłowy panel docelowy' });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, bank_slots_unlocked')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    if (BigInt(character.hp || '0') <= 0n) {
      return res.status(400).json({ error: 'Jesteś w Szpitalu! Bank jest niedostępny.' });
    }

    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .single();

    if (itemError || !item) return res.status(404).json({ error: 'Przedmiot nie znaleziony' });

    const transferAmount = amount === 'all' ? BigInt(item.quantity) : BigInt(amount);

    if (transferAmount <= 0n || transferAmount > BigInt(item.quantity)) {
      return res.status(400).json({ error: 'Nieprawidłowa ilość' });
    }

    let targetStackItem = null;
    const isStackable = item.item_templates.category === 'consumable' || item.item_templates.category === 'special_consumable';

    if (isStackable) {
            let query = supabase.from('inventory').select('id, quantity, backpack_index')
                .eq('character_id', character.id)
                .eq('item_template_id', item.item_template_id)
                .neq('id', inventory_id); 
                
            if (target_panel === 'bank') query = query.eq('equipped_slot', 'bank');
            else query = query.is('equipped_slot', null);
            
            const { data: targetItems } = await query;

        if (targetItems && targetItems.length > 0) {
            if (target_index !== undefined && target_index !== null) {
                targetStackItem = targetItems.find(t => t.backpack_index === parseInt(target_index) && BigInt(t.quantity) + transferAmount <= 99n);
            } else {
                targetStackItem = targetItems.find(t => BigInt(t.quantity) + transferAmount <= 99n);
            }
        }
    }

    if (!targetStackItem) {
        let isSwap = false;
        
        const isInternalMove = (item.equipped_slot === 'bank' && target_panel === 'bank') || (item.equipped_slot === null && target_panel === 'backpack');

        if (target_index !== undefined && target_index !== null && transferAmount === BigInt(item.quantity)) {
            let query = supabase.from('inventory').select('id').eq('character_id', character.id).eq('backpack_index', parseInt(target_index));
            if (target_panel === 'bank') query = query.eq('equipped_slot', 'bank');
            else query = query.is('equipped_slot', null);
            
            const { data: existItem } = await query;
            if (existItem && existItem.length > 0) isSwap = true;
        }

        if (!isSwap && !isInternalMove) {
            if (target_panel === 'bank') {
                const bankSlots = parseInt(character.bank_slots_unlocked || '5');
                const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('character_id', character.id).eq('equipped_slot', 'bank');
                if (count >= bankSlots) return res.status(400).json({ error: 'Brak miejsca w banku!' });
            } else {
                const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
                const maxSlots = calculateMaxBackpackSlots(charStats);
                const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('character_id', character.id).is('equipped_slot', null);
                if (count >= maxSlots) return res.status(400).json({ error: 'Brak miejsca w plecaku!' });
            }
        }
    }

    if (targetStackItem) {
        await supabase.from('inventory').update({ 
            quantity: (BigInt(targetStackItem.quantity) + transferAmount).toString() 
        }).eq('id', targetStackItem.id);

        if (transferAmount === BigInt(item.quantity)) {
            await supabase.from('inventory').delete().eq('id', inventory_id); 
        } else {
            await supabase.from('inventory').update({ 
                quantity: (BigInt(item.quantity) - transferAmount).toString() 
            }).eq('id', inventory_id); 
        }
    } else {
          let idxQuery = supabase.from('inventory').select('id, backpack_index')
              .eq('character_id', character.id);
            
        if (target_panel === 'bank') {
            idxQuery = idxQuery.eq('equipped_slot', 'bank');
        } else {
            idxQuery = idxQuery.is('equipped_slot', null);
        }
        
        const { data: existingItems } = await idxQuery;
            
        const occupiedIndexes = existingItems.map(i => i.backpack_index).filter(i => i !== null);
        let firstFreeIndex = 1;
        while (occupiedIndexes.includes(firstFreeIndex)) firstFreeIndex++;

        let finalIndex = firstFreeIndex;
        let swapTargetItem = null;

        if (target_index !== undefined && target_index !== null) {
            let parsedIdx = parseInt(target_index);
            if (!occupiedIndexes.includes(parsedIdx)) {
                finalIndex = parsedIdx;
            } else if (transferAmount === BigInt(item.quantity)) {
                finalIndex = parsedIdx;
                swapTargetItem = existingItems.find(i => i.backpack_index === parsedIdx);
            }
        }

        if (transferAmount === BigInt(item.quantity)) {
            if (swapTargetItem) {
                if (item.equipped_slot !== 'bank' && item.equipped_slot !== null) {
                    return res.status(400).json({ error: 'Nie możesz podmienić przedmiotu w banku bezpośrednio na założony ekwipunek!' });
                }
                
                await supabase.from('inventory').update({
                    equipped_slot: item.equipped_slot,
                    backpack_index: item.backpack_index
                }).eq('id', swapTargetItem.id);
            }

            await supabase.from('inventory').update({ 
                equipped_slot: target_panel === 'bank' ? 'bank' : null, 
                backpack_index: finalIndex 
            }).eq('id', inventory_id);
        } else {
            await supabase.from('inventory').update({ 
                quantity: (BigInt(item.quantity) - transferAmount).toString() 
            }).eq('id', inventory_id);

            await supabase.from('inventory').insert({
                character_id: character.id,
                item_template_id: item.item_template_id,
                quantity: transferAmount.toString(),
                equipped_slot: target_panel === 'bank' ? 'bank' : null,
                backpack_index: finalIndex
            });
        }
    }

    res.json({ success: true, message: `Przeniesiono ${amount === 'all' ? 'całość' : amount + ' szt.'} pomyślnie!` });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

app.post('/api/bank/split', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount_to_split } = req.body;

    if (!inventory_id || !amount_to_split) return res.status(400).json({ error: 'Brak parametrów' });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, bank_slots_unlocked')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    if (BigInt(character.hp || '0') <= 0n) {
      return res.status(400).json({ error: 'Jesteś w Szpitalu! Bank jest niedostępny.' });
    }

    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .single();

    if (itemError || !item) return res.status(404).json({ error: 'Przedmiot nie znaleziony' });

    const splitAmount = BigInt(amount_to_split);
    if (BigInt(item.quantity) <= splitAmount || splitAmount <= 0n) {
      return res.status(400).json({ error: 'Zła ilość do podziału!' });
    }

    await supabase.from('inventory').update({ 
      quantity: (BigInt(item.quantity) - splitAmount).toString() 
    }).eq('id', inventory_id);

    const isFromBank = item.equipped_slot === 'bank';
    const targetPanel = isFromBank ? 'bank' : null;
    
    let panelQuery = supabase.from('inventory').select('backpack_index').eq('character_id', character.id);
    if (isFromBank) panelQuery = panelQuery.eq('equipped_slot', 'bank');
    else panelQuery = panelQuery.is('equipped_slot', null);
    
    const { data: panelItems } = await panelQuery;
    const occupied = panelItems.map(i => i.backpack_index).filter(i => i !== null);
    
    let hasSpace = false;
    if (isFromBank) {
        const bankSlots = parseInt(character.bank_slots_unlocked || '5');
        hasSpace = panelItems.length < bankSlots;
    } else {
        const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
        const maxSlots = calculateMaxBackpackSlots(charStats);
        hasSpace = panelItems.length < maxSlots;
    }

    if (hasSpace) {
        let freeIdx = 1;
        while (occupied.includes(freeIdx)) freeIdx++;
        
        await supabase.from('inventory').insert({
            character_id: character.id,
            item_template_id: item.item_template_id,
            quantity: splitAmount.toString(),
            equipped_slot: targetPanel,
            backpack_index: freeIdx 
        });
        return res.json({ success: true, message: `Podzielono stos i umieszczono w nowym slocie!` });
    } else {
        await supabase.from('inventory').update({ quantity: item.quantity }).eq('id', inventory_id);
        return res.status(400).json({ error: `Brak wolnych miejsc w ${isFromBank ? 'banku' : 'plecaku'} na wydzielenie stosu!` });
    }
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// ==========================================
// 💬 7. CZAT, RANKING I DASHBOARD
// ==========================================

async function getRanking() {
  const now = Date.now();
  
  if (rankingCache && (now - rankingCacheTime) < RANKING_CACHE_TTL) {
    return rankingCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('characters')
      .select(`id, base_power_level, profiles!inner(username)`) // Zmienione z total na base
      .order('base_power_level', { ascending: false }) // Sortujemy po bazie!
      .limit(10);
    
    if (error) throw error;
    
    rankingCache = data;
    rankingCacheTime = now;
    
    return data;
  } catch (err) {
    console.error('[Ranking] Błąd pobierania rankingu:', err.message);
    return [];
  }
}

app.get('/api/ranking', async (req, res) => {
  try {
    const ranking = await getRanking();
    
    const formattedRanking = ranking.map((player, index) => ({
      position: index + 1,
      username: player.profiles.username,
      power_level: BigInt(player.base_power_level || '1').toString() // Zmienione z total
    }));
    
    res.json(formattedRanking);
  } catch (err) {
    console.error('[Ranking] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania rankingu' });
  }
});

app.post('/api/chat/send', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Wiadomość nie może być pusta' });
    }
    
    if (message.length > 200) {
      return res.status(400).json({ error: 'Wiadomość może mieć maksymalnie 200 znaków' });
    }
    
    const now = Date.now();
    const lastMessageTime = chatRateLimitMap.get(userId) || 0;
    if (now - lastMessageTime < CHAT_RATE_LIMIT_TTL) {
      return res.status(429).json({ error: 'Możesz wysłać tylko 1 wiadomość na 3 sekundy' });
    }
    
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('hp, profiles!inner(username)')
      .eq('profile_id', userId)
      .single();
    
    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci' });
    }
    
    const isGhost = BigInt(character.hp || '0') <= 0n;
    
    const { error: insertError } = await supabase
      .from('global_messages')
      .insert({
        profile_id: userId,
        username: character.profiles.username, 
        content: message.trim(),               
        is_ghost: isGhost
      });
    
    if (insertError) {
      console.error('[Chat] Błąd zapisu wiadomości:', insertError);
      return res.status(500).json({ error: 'Błąd serwera podczas wysyłania wiadomości' });
    }
    
    chatRateLimitMap.set(userId, now);
    
    res.json({ 
      success: true, 
      message: isGhost ? 'Wiadomość wysłana jako duch 👻' : 'Wiadomość wysłana',
      is_ghost: isGhost
    });
    
  } catch (err) {
    console.error('[Chat] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas wysyłania wiadomości' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of chatRateLimitMap.entries()) {
    if (now - timestamp > CHAT_RATE_LIMIT_TTL) {
      chatRateLimitMap.delete(userId);
    }
  }
}, 60 * 60 * 1000);

// ==========================================
// 🧘‍♂️ 8. SYSTEM TRENINGU (SALA CZASU I MISTRZOWIE)
// ==========================================

app.get('/api/training/status', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const { data, error } = await supabase
      .from('characters')
      .select('active_training_id, training_end_time, unlocked_features, completed_missions, daily_time_chamber_used')
      .eq('profile_id', userId).single();

    if (error) throw error;
    
    const unlockedFeatures = data.unlocked_features || [];
    const completedMissions = data.completed_missions || [];

    const mentorsList = Object.entries(TRAINING_MENTORS).map(([id, m]) => ({
        id, name: m.name, emoji: m.emoji, cost: m.cost, multiplier: m.multiplier,
        isLocked: m.reqMission ? !completedMissions.includes(m.reqMission) : false,
        reqMission: m.reqMission
    }));

    const isDojoUnlocked = unlockedFeatures.includes('training') || completedMissions.includes(TRAINING_MENTORS['old_master'].reqMission);

    res.json({ 
        isUnlocked: isDojoUnlocked,
        activeTraining: data.active_training_id, 
        endTime: data.training_end_time,
        dailyTimeChamberUsed: data.daily_time_chamber_used,
        mentors: mentorsList
    });
  } catch (err) { res.status(500).json({ error: 'Błąd statusu' }); }
});

app.post('/api/training/start', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { mentorId, hours, targetStat } = req.body; 
  try {
    const { data: char, error: charErr } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (charErr || !char) return res.status(404).json({ error: 'Postać nie znaleziona' });

    const mentor = TRAINING_MENTORS[mentorId];
    if (!mentor) return res.status(400).json({ error: 'Zły mentor' });

    const completedMissions = char.completed_missions || [];

    if (mentor.reqMission && !completedMissions.includes(mentor.reqMission)) {
        return res.status(403).json({ error: 'Ukończ wymaganą misję!' });
    }

    if (mentorId === 'time_chamber' && char.daily_time_chamber_used) {
        return res.status(400).json({ error: 'Sala Czasu raz na dobę DC!' });
    }

    const totalStaminaCost = Math.ceil(mentor.cost * parseFloat(hours));
    if (BigInt(char.stamina) < BigInt(totalStaminaCost)) return res.status(400).json({ error: 'Za mało staminy!' });

    const validStat = ['strength', 'speed', 'endurance', 'technique', 'balanced'].includes(targetStat) ? targetStat : 'balanced';
    
    let realDurationMinutes;
    if (mentorId === 'time_chamber') {
        // Sala Czasu ma swój unikalny wzór: X min RL = odpowiednik godzin
        realDurationMinutes = parseFloat(hours) * 5; 
    } else {
        // Standardowy trening: 1 godzina w grze (DC) to 20 minut w rzeczywistości (RL)
        // Dlatego dzielimy wybrane godziny gry przez 3
        realDurationMinutes = (parseFloat(hours) / 3) * 60; 
    }

    const endTime = new Date(Date.now() + realDurationMinutes * 60 * 1000).toISOString();
    
    let updates = {
      stamina: (BigInt(char.stamina) - BigInt(totalStaminaCost)).toString(),
      active_training_id: `${mentorId}:${hours}:${validStat}`, 
      training_end_time: endTime
    };
    if (mentorId === 'time_chamber') updates.daily_time_chamber_used = true;

    const { error: upErr } = await supabase.from('characters').update(updates).eq('profile_id', userId);
    if (upErr) throw upErr;

    res.json({ success: true, endTime });
  } catch (err) { res.status(500).json({ error: 'Błąd startu' }); }
});

app.post('/api/training/stop', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    // 1. ZMIANA: Pobieramy pełne statystyki (żeby mieć dostęp do bonusów ze sprzętu)
    const fullStats = await getFullCharacterStats(userId);
    const char = fullStats.character;

    if (!char.active_training_id || !char.training_end_time) return res.status(400).json({ error: 'Brak aktywnego treningu' });

    const now = new Date();
    const endTime = new Date(char.training_end_time);
    const [mentorId, hoursStr, targetStat] = char.active_training_id.split(':');
    const action = now < endTime ? 'interrupted' : 'completed';
    const mentor = TRAINING_MENTORS[mentorId];

    let updates = { active_training_id: null, training_end_time: null };
    let rewardMsg = "Trening przerwany. Straciłeś staminę.";

    if (action === 'completed' && mentor) {
      const effectivePower = Math.max(1000, parseInt(char.total_power_level || '0'));
      const trainingHours = parseFloat(hoursStr);

      // --- KROK A: OBLICZAMY KARĘ ZA POTĘGĘ ---
      let reqStat = 1n;
      if (mentor.reqMission) {
          const { data: mission } = await supabase.from('missions').select('req_stats').eq('id', mentor.reqMission).single();
          if (mission && mission.req_stats) {
              reqStat = BigInt(mission.req_stats.strength || mission.req_stats.speed || mission.req_stats.endurance || 1);
          }
      }

      const pStr = BigInt(fullStats.baseStats.strength) + BigInt(fullStats.equipStats.strength || '0');
      const pSpd = BigInt(fullStats.baseStats.speed) + BigInt(fullStats.equipStats.speed || '0');
      const pEnd = BigInt(fullStats.baseStats.endurance) + BigInt(fullStats.equipStats.endurance || '0');
      const pTech = BigInt(fullStats.baseStats.technique) + BigInt(fullStats.equipStats.technique || '0');
      
      const weakestStat = minBigInt(pTech, minBigInt(pStr, minBigInt(pSpd, pEnd)));
      const penaltyData = calculatePowerPenalty(weakestStat, reqStat);
      const penaltyMultiplier = penaltyData.multiplier; // 100n, 75n, 50n, 10n

      // --- KROK B: BAZOWY ZYSK (Ukarany) ---
      let baseGainRaw = Math.floor((400 + Math.pow(effectivePower, 0.55)) * mentor.multiplier * trainingHours);
      let baseGain = (BigInt(baseGainRaw) * penaltyMultiplier) / 100n;

      // --- KROK C: ZYSKI Z PRZEDMIOTÓW TRENINGOWYCH (Pomnożone przez godziny i ukarane) ---
      const applyTrainBonus = (statVal) => {
          const val = BigInt(statVal || '0');
          // Mnożymy statystyki przedmiotu przez całkowite godziny treningu
          return (val * BigInt(Math.max(1, Math.floor(trainingHours))) * penaltyMultiplier) / 100n;
      };

      let trainGainStr = applyTrainBonus(fullStats.trainingStats.strength);
      let trainGainSpd = applyTrainBonus(fullStats.trainingStats.speed);
      let trainGainEnd = applyTrainBonus(fullStats.trainingStats.endurance);
      let trainGainTech = applyTrainBonus(fullStats.trainingStats.technique);
      let trainGainHp = applyTrainBonus(fullStats.trainingStats.bonus_hp);
      let trainGainMp = applyTrainBonus(fullStats.trainingStats.bonus_mp);

      // --- KROK D: TRACKER ZADAŃ SPECJALNYCH ---
      // Zaliczenie spędzonych minut (Zadanie treningowe)
      await updateTaskProgress(userId, 'training', 'any', Math.floor(trainingHours * 60));
      if (mentorId === 'time_chamber') {
          await updateTaskProgress(userId, 'training', 'time_chamber', Math.floor(trainingHours * 5)); // 5 min RL = 1h DC
      } else {
          await updateTaskProgress(userId, 'training', mentorId, Math.floor(trainingHours * 60));
      }
      
      // Zaliczenie statystyk z przedmiotów treningowych
      const totalTrainGains = trainGainStr + trainGainSpd + trainGainEnd + trainGainTech;
      if (totalTrainGains > 0n) {
          await updateTaskProgress(userId, 'training_stats', 'strength', Number(trainGainStr));
          await updateTaskProgress(userId, 'training_stats', 'speed', Number(trainGainSpd));
          await updateTaskProgress(userId, 'training_stats', 'endurance', Number(trainGainEnd));
          await updateTaskProgress(userId, 'training_stats', 'technique', Number(trainGainTech));
          await updateTaskProgress(userId, 'training_stats', 'all', Number(totalTrainGains));
      }

      // --- KROK E: FINALNE NALICZENIE STATYSTYK ---
      let finalStr = BigInt(char.strength || '1') + trainGainStr;
      let finalSpd = BigInt(char.speed || '1') + trainGainSpd;
      let finalEnd = BigInt(char.endurance || '1') + trainGainEnd;
      let finalTech = BigInt(char.technique || '1') + trainGainTech;

      if (targetStat === 'balanced') {
        const perStat = baseGain / 4n; 
        finalStr += perStat; finalSpd += perStat; finalEnd += perStat; finalTech += perStat;
        rewardMsg = `Zyskano po +${perStat} do Siły, Szybk., Wytrz. i Techniki!`;
      } else {
        const safeStat = ['strength', 'speed', 'endurance', 'technique'].includes(targetStat) ? targetStat : 'strength';
        if (safeStat === 'strength') finalStr += baseGain;
        if (safeStat === 'speed') finalSpd += baseGain;
        if (safeStat === 'endurance') finalEnd += baseGain;
        if (safeStat === 'technique') finalTech += baseGain;
        
        let namePL = safeStat === 'strength' ? 'Siły' : (safeStat === 'speed' ? 'Szybkości' : (safeStat === 'endurance' ? 'Wytrzymałości' : 'Techniki'));
        rewardMsg = `Twoja cecha (${namePL}) wzrosła o +${baseGain}!`;
      }

      updates.strength = finalStr.toString();
      updates.speed = finalSpd.toString();
      updates.endurance = finalEnd.toString();
      updates.technique = finalTech.toString();
      
      if (trainGainHp > 0n) updates.bonus_hp = (BigInt(char.bonus_hp || '0') + trainGainHp).toString();
      if (trainGainMp > 0n) updates.bonus_mp = (BigInt(char.bonus_mp || '0') + trainGainMp).toString();

      if (totalTrainGains > 0n) {
          rewardMsg += ` (Dodatkowo: +${totalTrainGains} zysku z zał. sprzętu!)`;
      }
      if (penaltyMultiplier < 100n) {
          rewardMsg += ` ⚠️ Zyski obniżone o ${100n - penaltyMultiplier}% (Kara za potęgę)`;
      }
    }

    const { error: updateErr } = await supabase.from('characters').update(updates).eq('profile_id', userId);
    if (updateErr) throw updateErr;
    
    res.json({ success: true, message: rewardMsg, action });
  } catch (err) { 
      console.error('[Training Stop Error]', err);
      res.status(500).json({ error: 'Błąd stopu' }); 
  }
});

// ==========================================
// 🛠️ 8.5. TRYB PRACA (MINIGRA)
// ==========================================

app.post('/api/work/start', authenticateToken, requireAlive, async (req, res) => {
  const userId = req.user.id;
  const { workId } = req.body;
  const work = WORK_MODES[workId];
  if (!work) return res.status(400).json({ error: 'Nieprawidłowa praca.' });

  try {
    const fullStats = await getFullCharacterStats(userId);
    const char = fullStats.character;

    const { data: mission } = await supabase.from('missions').select('req_stats').eq('id', work.req_mission).single();
    if (mission && mission.req_stats) {
        const sReq = BigInt(mission.req_stats.strength || 0);
        const spReq = BigInt(mission.req_stats.speed || 0);
        const eReq = BigInt(mission.req_stats.endurance || 0);
        
        if (BigInt(char.strength) < sReq || BigInt(char.speed) < spReq || BigInt(char.endurance) < eReq) {
            return res.status(400).json({ error: `Twoje statystyki są zbyt niskie, by podjąć tę pracę!` });
        }
    }

    const hpCost = (BigInt(fullStats.max_hp) * work.cost_hp_pct) / 100n;
    const currentHp = BigInt(char.hp || '100');
    const currentStamina = BigInt(char.stamina || '100');

    if (currentHp <= hpCost) return res.status(400).json({ error: `Jesteś zbyt wyczerpany. Wymagane HP: ${hpCost}` });
    if (currentStamina < work.cost_stamina) return res.status(400).json({ error: `Brak Staminy. Wymagane: ${work.cost_stamina}` });

    await supabase.from('characters').update({ hp: (currentHp - hpCost).toString(), stamina: (currentStamina - work.cost_stamina).toString() }).eq('id', char.id);
    res.json({ success: true, duration: work.duration_sec, hpCost: hpCost.toString() });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

app.post('/api/work/finish', authenticateToken, requireAlive, async (req, res) => {
  const userId = req.user.id;
  const { workId, goodObjectsCaught, obstaclesCaught, failed } = req.body;
  const work = WORK_MODES[workId];
  if (!work) return res.status(400).json({ error: 'Nieprawidłowa praca.' });

  try {
    const fullStats = await getFullCharacterStats(userId);
    const char = fullStats.character;
    
    const { data: mission } = await supabase.from('missions').select('req_stats, reward_stats').eq('id', work.req_mission).single();
    let reqStat = 1n;
    if (mission && mission.req_stats) {
        reqStat = BigInt(mission.req_stats.strength || mission.req_stats.speed || mission.req_stats.endurance || 1);
    }

    // --- GAŁĄŹ: PORAŻKA W MINIGRZE ---
    if (failed) {
        const pct = work.penalty_pct;
        let totalLoss = 50n; 
        if (mission?.reward_stats?.min && mission?.reward_stats?.max) {
            totalLoss = maxBigInt(1n, BigInt(Math.floor(Math.random() * (Number(mission.reward_stats.max) - Number(mission.reward_stats.min) + 1)) + Number(mission.reward_stats.min)) * 3n); 
        } else if (mission?.reward_stats?.min) {
            totalLoss = maxBigInt(1n, BigInt(mission.reward_stats.min) * 3n);
        } else {
            totalLoss = maxBigInt(1n, reqStat / 10n); 
        }
        
        // Rozdzielanie statystyk używając Helpera
        const loss = distributeStatLoss(Number(totalLoss));
        let sLossStr = loss.str; let sLossSpd = loss.spd; let sLossEnd = loss.end; let sLossTech = loss.tech;

        const extraHpPct = BigInt(req.body.extraHpPenaltyPct || 0); 
        let newHp = maxBigInt(0n, BigInt(char.hp) - (BigInt(fullStats.max_hp) * pct / 100n));
        newHp = maxBigInt(0n, newHp - (BigInt(fullStats.max_hp) * extraHpPct / 100n));
        
        let newMp = maxBigInt(0n, BigInt(char.mp) - (BigInt(fullStats.max_mp) * pct / 100n));
        let newStamina = maxBigInt(0n, BigInt(char.stamina) - (BigInt(fullStats.max_stamina) * pct / 100n));
        
        let isDead = newHp <= 0n;
        
        let updateData = {
            hp: newHp.toString(), mp: newMp.toString(), stamina: newStamina.toString(),
            strength: maxBigInt(1n, BigInt(char.strength) - sLossStr).toString(),
            speed: maxBigInt(1n, BigInt(char.speed) - sLossSpd).toString(),
            endurance: maxBigInt(1n, BigInt(char.endurance) - sLossEnd).toString(),
            technique: maxBigInt(1n, BigInt(char.technique || '1') - sLossTech).toString()
        };

        if (isDead) {
            const hospitalData = calculateHospitalTime(BigInt(fullStats.basePowerLevel));
            updateData.hospital_until = hospitalData.utcString;
            updateData.current_form = 'Stan Podstawowy';
            updateData.last_death_penalty = {
                strength: sLossStr.toString(), speed: sLossSpd.toString(), endurance: sLossEnd.toString(), technique: sLossTech.toString(),
                intelligence: '0', mental_strength: '0', hospital_end_ms: hospitalData.exactEndMs.toString(), source: 'work'
            };
        }

        await supabase.from('characters').update(updateData).eq('id', char.id);
        return res.json({ success: true, failed: true, isDead: isDead, penalty: { resources_pct: pct.toString(), loss_str: sLossStr.toString(), loss_spd: sLossSpd.toString(), loss_end: sLossEnd.toString(), loss_tech: sLossTech.toString() } });
    }

    // --- GAŁĄŹ: SUKCES W MINIGRZE ---
    const netScore = maxBigInt(0n, BigInt(goodObjectsCaught) - BigInt(obstaclesCaught));
    
    const extraHpPct = BigInt(req.body.extraHpPenaltyPct || 0);
    let newHp = BigInt(char.hp);
    let isDead = false;
    let exactEndMs = null;

    if (extraHpPct > 0n) {
        newHp = maxBigInt(0n, newHp - (BigInt(fullStats.max_hp) * extraHpPct / 100n));
        isDead = newHp <= 0n;
    }

    let activeStr = BigInt(fullStats.baseStats.strength || 0) + BigInt(fullStats.equipStats.strength || 0);
    let activeSpd = BigInt(fullStats.baseStats.speed || 0) + BigInt(fullStats.equipStats.speed || 0);
    let activeEnd = BigInt(fullStats.baseStats.endurance || 0) + BigInt(fullStats.equipStats.endurance || 0);
    let activeTech = BigInt(fullStats.baseStats.technique || 0) + BigInt(fullStats.equipStats.technique || 0);

    const weakest = minBigInt(activeTech, minBigInt(activeStr, minBigInt(activeSpd, activeEnd)));
    
    // Kary za Potęgę z użyciem Helpera
    const penaltyData = calculatePowerPenalty(weakest, reqStat);
    let penaltyMultiplierPct = penaltyData.multiplier; 
    let serverWarningText = penaltyData.warning; 

    let finalCoinsBase = (netScore * BigInt(work.reward_coins) * penaltyMultiplierPct) / 100n;
    
    const equipCoinBonusFlat = BigInt(fullStats.equipStats.bonus_coins || '0');
    const trainingCoinBonusPct = BigInt(fullStats.trainingStats.bonus_coins_pct || '0');
    
    let trainingCoinBonusValue = 0n;
    if (trainingCoinBonusPct > 0n && finalCoinsBase > 0n) {
        trainingCoinBonusValue = (finalCoinsBase * trainingCoinBonusPct) / 100n;
        if (trainingCoinBonusValue === 0n) trainingCoinBonusValue = 1n; 
    }
    const finalCoins = finalCoinsBase + trainingCoinBonusValue + equipCoinBonusFlat;

    const applyPenalty = (val) => (netScore * BigInt(val) * penaltyMultiplierPct) / 100n;

    const gStr = applyPenalty(fullStats.trainingStats.strength || 0);
    const gSpd = applyPenalty(fullStats.trainingStats.speed || 0);
    const gEnd = applyPenalty(fullStats.trainingStats.endurance || 0);
    const gTech = applyPenalty(fullStats.trainingStats.technique || 0); 
    const gHp = applyPenalty(fullStats.trainingStats.bonus_hp || 0);
    const gMp = applyPenalty(fullStats.trainingStats.bonus_mp || 0);

    let dropIds = [];
    if (work.drop_woda && netScore > 10n && Math.floor(Math.random() * 100) < 1) {
        dropIds.push("00000000-0000-0000-0000-000000000030"); 
        const { data: invData } = await supabase.from('inventory').select('backpack_index').eq('character_id', char.id).is('equipped_slot', null);
        const usedIndexes = invData ? invData.map(i => i.backpack_index) : [];
        let freeIndex = 1; while(usedIndexes.includes(freeIndex)) freeIndex++;
        await supabase.from('inventory').insert({ character_id: char.id, item_template_id: "00000000-0000-0000-0000-000000000030", quantity: 1, backpack_index: freeIndex });
    }

    let updateData = {
        coins: (BigInt(char.coins) + finalCoins).toString(),
        strength: (BigInt(char.strength) + gStr).toString(), speed: (BigInt(char.speed) + gSpd).toString(),
        endurance: (BigInt(char.endurance) + gEnd).toString(), technique: (BigInt(char.technique) + gTech).toString(), 
        bonus_hp: (BigInt(char.bonus_hp) + gHp).toString(), bonus_mp: (BigInt(char.bonus_mp) + gMp).toString(),
        hp: newHp.toString()
    };

    // --- TRACKER ZADAŃ SPECJALNYCH ---
    if (netScore > 0n) {
        await updateTaskProgress(userId, 'work', workId, 1);
        
        const totalTrainGains = gStr + gSpd + gEnd + gTech;
        if (totalTrainGains > 0n) {
            await updateTaskProgress(userId, 'training_stats', 'strength', Number(gStr));
            await updateTaskProgress(userId, 'training_stats', 'speed', Number(gSpd));
            await updateTaskProgress(userId, 'training_stats', 'endurance', Number(gEnd));
            await updateTaskProgress(userId, 'training_stats', 'technique', Number(gTech));
            await updateTaskProgress(userId, 'training_stats', 'all', Number(totalTrainGains));
        }
    }

    if (isDead) {
        const hospitalData = calculateHospitalTime(BigInt(fullStats.basePowerLevel));
        exactEndMs = hospitalData.exactEndMs; 
        
        updateData.hospital_until = hospitalData.utcString;
        updateData.current_form = 'Stan Podstawowy';
        updateData.last_death_penalty = {
            strength: '0', speed: '0', endurance: '0', intelligence: '0', mental_strength: '0',
            hospital_end_ms: exactEndMs.toString(), source: 'work'
        };
    }

    await supabase.from('characters').update(updateData).eq('id', char.id);

    res.json({ 
        success: true, isDead: isDead, finalCoins: finalCoins.toString(), baseCoins: finalCoinsBase.toString(), 
        bonusCoinsFlat: equipCoinBonusFlat.toString(), bonusCoinsPct: trainingCoinBonusValue.toString(),
        gains: { str: gStr.toString(), spd: gSpd.toString(), end: gEnd.toString(), tech: gTech.toString(), hp: gHp.toString(), mp: gMp.toString() }, 
        drops: dropIds, server_warning: serverWarningText 
    });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});



// ==========================================
// ⏰ 9. CRON JOBS I START SERWERA
// ==========================================
app.listen(port, async () => {
  console.log(`[Dojo-Clicker API] Serwer nasłuchuje na porcie ${port}...`);
  await initGlobalState();
  console.log('[Dojo-Clicker API] Serwer wystartował pomyślnie!');
});

cron.schedule('0 2,10,18 * * *', async () => {
  console.log('[Zegar DC] Rozpoczynam 60-sekundową zmianę dnia...');
  try {
    // 1. Blokujemy serwer
    await supabase.from('global_server_state').update({ is_maintenance: true }).eq('id', 1);
    
    // 2. Czekamy 55 sekund (dając graczom czas na zobaczenie komunikatu)
    await delay(55000); 
    
    // 3. Resetujemy postępy i limity graczy
    await supabase.from('characters').update({ 
        daily_time_chamber_used: false,
        daily_shop_buys: {},
        daily_tasks_progress: {} 
    }).neq('profile_id', '00000000-0000-0000-0000-000000000000');
    
    // 4. Losujemy i wzbogacamy nowe zadania
    let nextDay = (globalServerState?.current_dc_day || 0) + 1;
    if (nextDay > 76) nextDay = 76;

    const newDailyTasks = await generateAndEnrichDailyTasks(nextDay);

    // 5. Zapisujemy i odblokowujemy (is_maintenance: false)
    const { data: newState } = await supabase.from('global_server_state').update({ 
        current_dc_day: nextDay,
        daily_global_tasks: newDailyTasks,
        is_maintenance: false
    }).eq('id', 1).select().single();

    if (newState) globalServerState = newState;

  } catch (error) {
    console.error('[Zegar DC] Błąd:', error);
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
  }
}, { scheduled: true, timezone: "Europe/Warsaw" });