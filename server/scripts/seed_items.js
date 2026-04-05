require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Dane przedmiotów z GDD - wszystkie wartości liczbowe w JSONB jako stringi!
const itemsData = [
    // === KONSUMPCYJNE (consumable) ===
    {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Mięso",
        category: "consumable",
        slot: null,
        buy_price_coins: "50",
        sell_price_coins: "25",
        consumable_effect: { "restore_hp": "50" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Jagody",
        category: "consumable",
        slot: null,
        buy_price_coins: "50",
        sell_price_coins: "25",
        consumable_effect: { "restore_mp": "50" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000003",
        name: "Pieczony Dinozaur",
        category: "consumable",
        slot: null,
        buy_price_coins: "2500",
        sell_price_coins: "1250",
        consumable_effect: { "restore_hp_pct": 10 },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000004",
        name: "Magiczny Nektar",
        category: "consumable",
        slot: null,
        buy_price_coins: "2500",
        sell_price_coins: "1250",
        consumable_effect: { "restore_mp_pct": 10 },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000005",
        name: "Napój Sportowy",
        category: "consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "50",
        consumable_effect: { "restore_stamina": "10" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000006",
        name: "Magiczna Fasolka",
        category: "consumable",
        slot: null,
        buy_price_coins: "50",
        sell_price_coins: "25",
        consumable_effect: { "hospital_exit_zenkai": true, "restore_hp_pct": 100, "restore_mp_pct": 100 },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000007",
        name: "Kapsułka Energii",
        category: "consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "1000",
        consumable_effect: { "restore_stamina_pct": 100 },
        req_stats: null,
        bonuses: null
    },

    // === SPECJALNE KONSUMPCYJNE (special_consumable) ===
    {
        id: "00000000-0000-0000-0000-000000000008",
        name: "Święta Woda",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "5000",
        consumable_effect: { "bonus_stamina": "10" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000009",
        name: "Kropla Krwi Smoka",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "50000",
        consumable_effect: { "bonus_hp": "100" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000010",
        name: "Łza Bogów",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "125000",
        consumable_effect: { "bonus_mp": "100" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000011",
        name: "Ziarno Formy Super",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "250000",
        consumable_effect: { "unlock_form": "super" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000012",
        name: "Zwój Mocy Ki",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "25000",
        consumable_effect: { "unlock_skill": "fala_uderzeniowa" },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000013",
        name: "Zwój Szybkości",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "25000",
        consumable_effect: { "unlock_skill": "powidok" },
        req_stats: null,
        bonuses: null
    },

    // === EKWIPUNEK (equipment) ===
    
    // Klatka piersiowa (chest)
    {
        id: "00000000-0000-0000-0000-000000000014",
        name: "Podstawowe Gi",
        category: "equipment",
        slot: "chest",
        buy_price_coins: "1500",
        sell_price_coins: "750",
        req_stats: { "strength": "50", "endurance": "50" },
        bonuses: { "type": "passive", "bonus_hp": "100" }
    },
    {
        id: "00000000-0000-0000-0000-000000000015",
        name: "Ciężka Skorupa",
        category: "equipment",
        slot: "chest",
        buy_price_coins: "5000",
        sell_price_coins: "2500",
        req_stats: { "endurance": "200", "strength": "200" },
        bonuses: { "type": "training", "bonus_hp": "1" }
    },

    // Głowa (head)
    {
        id: "00000000-0000-0000-0000-000000000016",
        name: "Opaska Nowicjusza",
        category: "equipment",
        slot: "head",
        buy_price_coins: "1500",
        sell_price_coins: "750",
        req_stats: { "strength": "50", "endurance": "50" },
        bonuses: { "type": "passive", "bonus_mp": "100" }
    },
    {
        id: "00000000-0000-0000-0000-000000000017",
        name: "Ciężka Opaska",
        category: "equipment",
        slot: "head",
        buy_price_coins: "8000",
        sell_price_coins: "4000",
        req_stats: { "endurance": "200", "strength": "200" },
        bonuses: { "type": "training", "bonus_mp": "1" }
    },

    // Dłonie (hands)
    {
        id: "00000000-0000-0000-0000-000000000018",
        name: "Bandaże Treningowe",
        category: "equipment",
        slot: "hands",
        buy_price_coins: "800",
        sell_price_coins: "400",
        req_stats: { "strength": "50" },
        bonuses: { "type": "passive", "strength": "50" }
    },
    {
        id: "00000000-0000-0000-0000-000000000019",
        name: "Ciężkie Rękawice",
        category: "equipment",
        slot: "hands",
        buy_price_coins: "12000",
        sell_price_coins: "6000",
        req_stats: { "strength": "150" },
        bonuses: { "type": "training", "strength": "10" }
    },
    {
        id: "00000000-0000-0000-0000-000000000020",
        name: "Ciężki Miecz",
        category: "equipment",
        slot: "hands",
        buy_price_coins: "20000",
        sell_price_coins: "10000",
        req_stats: { "strength": "100" },
        bonuses: { "type": "training", "strength": "20" }
    },

    // Nogi (legs)
    {
        id: "00000000-0000-0000-0000-000000000021",
        name: "Wygodne Spodnie",
        category: "equipment",
        slot: "legs",
        buy_price_coins: "1000",
        sell_price_coins: "500",
        req_stats: { "endurance": "50" },
        bonuses: { "type": "passive", "endurance": "50" }
    },
    {
        id: "00000000-0000-0000-0000-000000000022",
        name: "Ciężkie Spodnie",
        category: "equipment",
        slot: "legs",
        buy_price_coins: "15000",
        sell_price_coins: "7500",
        req_stats: { "endurance": "150" },
        bonuses: { "type": "training", "endurance": "10" }
    },

    // Stopy (feet)
    {
        id: "00000000-0000-0000-0000-000000000023",
        name: "Trampki",
        category: "equipment",
        slot: "feet",
        buy_price_coins: "800",
        sell_price_coins: "400",
        req_stats: { "speed": "40" },
        bonuses: { "type": "passive", "speed": "40" }
    },
    {
        id: "00000000-0000-0000-0000-000000000024",
        name: "Obciążone Buty",
        category: "equipment",
        slot: "feet",
        buy_price_coins: "10000",
        sell_price_coins: "5000",
        req_stats: { "speed": "150" },
        bonuses: { "type": "training", "speed": "10" }
    },

    // Biżuteria
    {
        id: "00000000-0000-0000-0000-000000000025",
        name: "Kolczyk Umysłu",
        category: "equipment",
        slot: "ear_l",
        buy_price_coins: "25000",
        sell_price_coins: "12500",
        req_stats: { "intelligence": "400" },
        bonuses: { "type": "passive", "intelligence": "400" }
    },
    {
        id: "00000000-0000-0000-0000-000000000026",
        name: "Pierścień Ducha",
        category: "equipment",
        slot: "ring_l",
        buy_price_coins: "30000",
        sell_price_coins: "15000",
        req_stats: { "mental_strength": "400" },
        bonuses: { "type": "passive", "mental_strength": "400" }
    },
    {
        id: "00000000-0000-0000-0000-000000000027",
        name: "Rzemyk Harmonii",
        category: "equipment",
        slot: "necklace",
        buy_price_coins: "20000",
        sell_price_coins: "10000",
        req_stats: { "intelligence": "400", "mental_strength": "400" },
        bonuses: { "type": "passive", "intelligence": "400", "mental_strength": "400" }
    }
];

// Funkcja wgrania przedmiotów do bazy danych
async function seedItems() {
    try {
        console.log('🌱 Rozpoczynam aktualizację przedmiotów w bazie danych...');
        
    //    console.log('🧹 Czyszczenie starych przedmiotów...');
    //    const { error: deleteError } = await supabase.from('item_templates').delete().not('id', 'is', null);
    //    if (deleteError) throw deleteError;
        
        // Krok 1: Wgraj/zaktualizuj przedmioty za pomocą upsert
        console.log('📦 Aktualizowanie przedmiotów (upsert)...');
        const { data, error } = await supabase
            .from('item_templates')
            .upsert(itemsData, { onConflict: 'id' })
            .select();
            
        if (error) {
            console.error('❌ Błąd aktualizacji przedmiotów:', error.message);
            console.error('Szczegóły błędu:', error);
            process.exit(1);
        }
        
        console.log(`✅ Pomyślnie zaktualizowano ${data.length} przedmiotów w bazie danych:`);
        
        // Grupowanie po kategoriach
        const categories = {};
        data.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });
        
        Object.keys(categories).forEach(category => {
            console.log(`\n📂 Kategoria: ${category}`);
            categories[category].forEach((item, index) => {
                const price = item.buy_price_coins || 'nie na sprzedaż';
                console.log(`   ${index + 1}. ${item.name} - ${price} monet`);
            });
        });
        
        console.log('\n🎉 Seeder przedmiotów zakończony sukcesem!');
        console.log('📊 Statystyki:');
        console.log(`   - Łącznie przedmiotów: ${data.length}`);
        console.log(`   - Konsumpcyjne: ${categories.consumable?.length || 0}`);
        console.log(`   - Specjalne konsumpcyjne: ${categories.special_consumable?.length || 0}`);
        console.log(`   - Ekwipunek: ${categories.equipment?.length || 0}`);
        
    } catch (err) {
        console.error('❌ Nieoczekiwany błąd podczas seedera przedmiotów:', err.message);
        process.exit(1);
    }
    
    // Zakończ proces
    process.exit(0);
}

// Uruchom seedera
seedItems();