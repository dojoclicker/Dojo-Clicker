require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Generator prostych UUID na potrzeby seedera
const generateId = (num) => `00000000-0000-0000-0000-${String(num).padStart(12, '0')}`;

const itemsData = [
    // ==========================================
    // 🟢 REGENERACJA ZASOBÓW (CONSUMABLE)
    // ==========================================
    // --- HP (Pieczone Mięsa / Kapsułki Medyczne) ---
    { id: generateId(1), name: "Kawałek Mięsa", category: "consumable", slot: null, buy_price_coins: "50", sell_price_coins: "25", consumable_effect: { "restore_hp": "10" } },
    { id: generateId(2), name: "Solidna Pieczeń", category: "consumable", slot: null, buy_price_coins: "120", sell_price_coins: "60", consumable_effect: { "restore_hp": "25" } },
    { id: generateId(3), name: "Wielka Pieczeń", category: "consumable", slot: null, buy_price_coins: "250", sell_price_coins: "125", consumable_effect: { "restore_hp": "50" } },
    { id: generateId(4), name: "Mała Kapsułka Med.", category: "consumable", slot: null, buy_price_coins: "1000", sell_price_coins: "500", consumable_effect: { "restore_hp_pct": 25 } },
    { id: generateId(5), name: "Średnia Kapsułka Med.", category: "consumable", slot: null, buy_price_coins: "2500", sell_price_coins: "1250", consumable_effect: { "restore_hp_pct": 50 } },
    { id: generateId(6), name: "Duża Kapsułka Med.", category: "consumable", slot: null, buy_price_coins: "6000", sell_price_coins: "3000", consumable_effect: { "restore_hp_pct": 100 } },

    // --- MP (Eliksiry Skupienia / Kapsułki Many) ---
    { id: generateId(7), name: "Magiczne Ziele", category: "consumable", slot: null, buy_price_coins: "50", sell_price_coins: "25", consumable_effect: { "restore_mp": "10" } },
    { id: generateId(8), name: "Magiczne Zioła", category: "consumable", slot: null, buy_price_coins: "120", sell_price_coins: "60", consumable_effect: { "restore_mp": "25" } },
    { id: generateId(9), name: "Magiczny Kwiat", category: "consumable", slot: null, buy_price_coins: "250", sell_price_coins: "125", consumable_effect: { "restore_mp": "50" } },
    { id: generateId(10), name: "Mała Kapsułka Many", category: "consumable", slot: null, buy_price_coins: "1000", sell_price_coins: "500", consumable_effect: { "restore_mp_pct": 25 } },
    { id: generateId(11), name: "Średnia Kapsułka Many", category: "consumable", slot: null, buy_price_coins: "2500", sell_price_coins: "1250", consumable_effect: { "restore_mp_pct": 50 } },
    { id: generateId(12), name: "Duża Kapsułka Many", category: "consumable", slot: null, buy_price_coins: "6000", sell_price_coins: "3000", consumable_effect: { "restore_mp_pct": 100 } },

    // --- STAMINA (Napoje Sportowe / Kapsułki Staminy) ---
    { id: generateId(13), name: "Mały Napój Sportowy", category: "consumable", slot: null, buy_price_coins: "100", sell_price_coins: "50", consumable_effect: { "restore_stamina": "10" } },
    { id: generateId(14), name: "Średni Napój Sportowy", category: "consumable", slot: null, buy_price_coins: "250", sell_price_coins: "125", consumable_effect: { "restore_stamina": "25" } },
    { id: generateId(15), name: "Duży Napój Sportowy", category: "consumable", slot: null, buy_price_coins: "500", sell_price_coins: "250", consumable_effect: { "restore_stamina": "50" } },
    { id: generateId(16), name: "Mała Kapsułka Stam.", category: "consumable", slot: null, buy_price_coins: "2000", sell_price_coins: "1000", consumable_effect: { "restore_stamina_pct": 25 } },
    { id: generateId(17), name: "Średnia Kapsułka Stam.", category: "consumable", slot: null, buy_price_coins: "5000", sell_price_coins: "2500", consumable_effect: { "restore_stamina_pct": 50 } },
    { id: generateId(18), name: "Duża Kapsułka Stam.", category: "consumable", slot: null, buy_price_coins: "12000", sell_price_coins: "6000", consumable_effect: { "restore_stamina_pct": 100 } },

    { id: generateId(19), name: "Magiczna Fasolka", category: "consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "hospital_exit_recovery": true, "restore_hp_pct": 100, "restore_mp_pct": 100, "restore_stamina_pct": 100 } },

    // ==========================================
    // 💰 SAKWY Z MONETAMI (Niesprzedawalne, tylko drop/nagroda)
    // ==========================================
    { id: generateId(20), name: "Mała Sakiewka", category: "consumable", slot: null, buy_price_coins: null, sell_price_coins: null, consumable_effect: { "add_coins": "250" } },
    { id: generateId(21), name: "Pękata Sakwa", category: "consumable", slot: null, buy_price_coins: null, sell_price_coins: null, consumable_effect: { "add_coins": "500" } },
    { id: generateId(22), name: "Worek Monet", category: "consumable", slot: null, buy_price_coins: null, sell_price_coins: null, consumable_effect: { "add_coins": "1000" } },
    { id: generateId(23), name: "Skrzynia Skarbów", category: "consumable", slot: null, buy_price_coins: null, sell_price_coins: null, consumable_effect: { "add_coins": "5000" } },
    { id: generateId(24), name: "Królewski Skarbiec", category: "consumable", slot: null, buy_price_coins: null, sell_price_coins: null, consumable_effect: { "add_coins": "10000" } },

    // ==========================================
    // 🌟 ZWIĘKSZANIE LIMITÓW (MAX HP / MP / STAMINA)
    // ==========================================
    { id: generateId(30), name: "Święta Woda", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "bonus_stamina": "10" } },
    { id: generateId(31), name: "Łza Syreny", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "15000", consumable_effect: { "bonus_stamina": "25" } },
    { id: generateId(32), name: "Esencja Życia", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "35000", consumable_effect: { "bonus_stamina": "50" } },

    { id: generateId(33), name: "Kropla Krwi Smoka", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "50000", consumable_effect: { "bonus_hp": "100" } },
    { id: generateId(34), name: "Krew Demona", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "125000", consumable_effect: { "bonus_hp": "250" } },
    { id: generateId(35), name: "Serce Tytana", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "300000", consumable_effect: { "bonus_hp": "500" } },

    { id: generateId(36), name: "Łza Bogów", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "50000", consumable_effect: { "bonus_mp": "100" } },
    { id: generateId(37), name: "Kryształ Umysłu", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "125000", consumable_effect: { "bonus_mp": "250" } },
    { id: generateId(38), name: "Oko Astralne", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "300000", consumable_effect: { "bonus_mp": "500" } },

    // ==========================================
    // 📖 KSIĘGI STATYSTYK (Trwałe punkty)
    // ==========================================
    // --- SIŁA ---
    { id: generateId(40), name: "Strona Księgi Siły", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "1000", consumable_effect: { "permanent_bonus": { "strength": "100" } } },
    { id: generateId(41), name: "Rozdział Księgi Siły", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "permanent_bonus": { "strength": "250" } } },
    { id: generateId(42), name: "Tomisko Siły", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "permanent_bonus": { "strength": "500" } } },
    { id: generateId(43), name: "Starożytny Tom Siły", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "10000", consumable_effect: { "permanent_bonus": { "strength": "1000" } } },
    // --- SZYBKOŚĆ ---
    { id: generateId(44), name: "Strona Księgi Szybkości", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "1000", consumable_effect: { "permanent_bonus": { "speed": "100" } } },
    { id: generateId(45), name: "Rozdział Księgi Szybkości", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "permanent_bonus": { "speed": "250" } } },
    { id: generateId(46), name: "Tomisko Szybkości", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "permanent_bonus": { "speed": "500" } } },
    { id: generateId(47), name: "Starożytny Tom Szybkości", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "10000", consumable_effect: { "permanent_bonus": { "speed": "1000" } } },
    // --- WYTRZYMAŁOŚĆ ---
    { id: generateId(48), name: "Strona Księgi Wytrzymałości", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "1000", consumable_effect: { "permanent_bonus": { "endurance": "100" } } },
    { id: generateId(49), name: "Rozdział Księgi Wytrz.", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "permanent_bonus": { "endurance": "250" } } },
    { id: generateId(50), name: "Tomisko Wytrzymałości", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "permanent_bonus": { "endurance": "500" } } },
    { id: generateId(51), name: "Starożytny Tom Wytrz.", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "10000", consumable_effect: { "permanent_bonus": { "endurance": "1000" } } },
    // --- INTELIGENCJA ---
    { id: generateId(52), name: "Strona Księgi Inteligencji", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "1000", consumable_effect: { "permanent_bonus": { "intelligence": "100" } } },
    { id: generateId(53), name: "Rozdział Księgi Intel.", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "permanent_bonus": { "intelligence": "250" } } },
    { id: generateId(54), name: "Tomisko Inteligencji", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "permanent_bonus": { "intelligence": "500" } } },
    { id: generateId(55), name: "Starożytny Tom Intel.", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "10000", consumable_effect: { "permanent_bonus": { "intelligence": "1000" } } },
    // --- SIŁA MENTALNA ---
    { id: generateId(56), name: "Strona Księgi Umysłu", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "1000", consumable_effect: { "permanent_bonus": { "mental_strength": "100" } } },
    { id: generateId(57), name: "Rozdział Księgi Umysłu", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "permanent_bonus": { "mental_strength": "250" } } },
    { id: generateId(58), name: "Tomisko Umysłu", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "permanent_bonus": { "mental_strength": "500" } } },
    { id: generateId(59), name: "Starożytny Tom Umysłu", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "10000", consumable_effect: { "permanent_bonus": { "mental_strength": "1000" } } },
    // --- TECHNIKA ---
    { id: generateId(60), name: "Strona Księgi Techniki", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "1000", consumable_effect: { "permanent_bonus": { "technique": "100" } } },
    { id: generateId(61), name: "Rozdział Księgi Techniki", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "2500", consumable_effect: { "permanent_bonus": { "technique": "250" } } },
    { id: generateId(62), name: "Tomisko Techniki", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "5000", consumable_effect: { "permanent_bonus": { "technique": "500" } } },
    { id: generateId(63), name: "Starożytny Tom Techniki", category: "special_consumable", slot: null, buy_price_coins: null, sell_price_coins: "10000", consumable_effect: { "permanent_bonus": { "technique": "1000" } } },

    // ==========================================
    // 🛡️ EKWIPUNEK (Zgodnie z wytycznymi GDD)
    // ==========================================
    
    // Klatka piersiowa (Chest) -> Daje i wymaga TECHNIKI
    {
        id: generateId(80), name: "Podstawowe Gi", category: "equipment", slot: "chest",
        buy_price_coins: "1500", sell_price_coins: "750", req_stats: { "technique": "50" },
        bonuses: { "type": "passive", "technique": "50" }
    },
    {
        id: generateId(81), name: "Ciężka Skorupa", category: "equipment", slot: "chest",
        buy_price_coins: "5000", sell_price_coins: "2500", 
        req_stats: { "technique": "100" }, // Wymaga tylko Techniki
        bonuses: { "type": "training", "technique": "1" }
    },

    // Głowa (Head) -> Opaska Nowicjusza (Pasywna - płaskie sztuki monet)
    {
        id: generateId(82), name: "Opaska Nowicjusza", category: "equipment", slot: "head",
        buy_price_coins: "1500", sell_price_coins: "750", req_stats: { "strength": "50", "endurance": "50" },
        bonuses: { "type": "passive", "bonus_coins": "5" } // Daje +5 monet do każdej misji/pracy
    },
    // Głowa (Head) -> Ciężka Opaska (Treningowa - procenty)
    {
        id: generateId(83), name: "Ciężka Opaska", category: "equipment", slot: "head",
        buy_price_coins: "5000", sell_price_coins: "2500", req_stats: { "endurance": "100", "strength": "100" },
        bonuses: { "type": "training", "bonus_coins_pct": "1" }
    },

    // Dłonie (Hands) -> Siła
    {
        id: generateId(84), name: "Bandaże Treningowe", category: "equipment", slot: "hands",
        buy_price_coins: "800", sell_price_coins: "400", req_stats: { "strength": "50" },
        bonuses: { "type": "passive", "strength": "50" }
    },
    {
        id: generateId(85), name: "Ciężkie Rękawice", category: "equipment", slot: "hands",
        buy_price_coins: "5000", sell_price_coins: "2500", req_stats: { "strength": "100" },
        bonuses: { "type": "training", "strength": "1" }
    },

    // Nogi (Legs) -> Wytrzymałość
    {
        id: generateId(86), name: "Wygodne Spodnie", category: "equipment", slot: "legs",
        buy_price_coins: "1000", sell_price_coins: "500", req_stats: { "endurance": "50" },
        bonuses: { "type": "passive", "endurance": "50" }
    },
    {
        id: generateId(87), name: "Ciężkie Spodnie", category: "equipment", slot: "legs",
        buy_price_coins: "5000", sell_price_coins: "2500", req_stats: { "endurance": "100" },
        bonuses: { "type": "training", "endurance": "1" }
    },

    // Stopy (Feet) -> Szybkość
    {
        id: generateId(88), name: "Trampki", category: "equipment", slot: "feet",
        buy_price_coins: "800", sell_price_coins: "400", req_stats: { "speed": "50" },
        bonuses: { "type": "passive", "speed": "50" }
    },
    {
        id: generateId(89), name: "Ciężkie Buty", category: "equipment", slot: "feet",
        buy_price_coins: "5000", sell_price_coins: "2500", req_stats: { "speed": "100" },
        bonuses: { "type": "training", "speed": "1" }
    },

    // Biżuteria (Bez zmian)
    {
        id: generateId(25), name: "Kolczyk Umysłu", category: "equipment", slot: "ear_l",
        buy_price_coins: "25000", sell_price_coins: "12500", req_stats: { "intelligence": "400" },
        bonuses: { "type": "passive", "intelligence": "400" }
    },
    {
        id: generateId(26), name: "Pierścień Ducha", category: "equipment", slot: "ring_l",
        buy_price_coins: "30000", sell_price_coins: "15000", req_stats: { "mental_strength": "400" },
        bonuses: { "type": "passive", "mental_strength": "400" }
    },
    {
        id: generateId(27), name: "Rzemyk Harmonii", category: "equipment", slot: "necklace",
        buy_price_coins: "20000", sell_price_coins: "10000", req_stats: { "intelligence": "400", "mental_strength": "400" },
        bonuses: { "type": "passive", "intelligence": "400", "mental_strength": "400" }
    }
];

async function seedItems() {
    try {
        console.log('🌱 Rozpoczynam aktualizację przedmiotów w bazie danych...');
        
        console.log('📦 Aktualizowanie przedmiotów (upsert)...');
        const { data, error } = await supabase
            .from('item_templates')
            .upsert(itemsData, { onConflict: 'id' })
            .select();
            
        if (error) throw error;
        
        console.log(`✅ Pomyślnie zaktualizowano ${data.length} przedmiotów w bazie danych!`);
        
    } catch (err) {
        console.error('❌ Nieoczekiwany błąd podczas seedera przedmiotów:', err.message);
        process.exit(1);
    }
    process.exit(0);
}

seedItems();