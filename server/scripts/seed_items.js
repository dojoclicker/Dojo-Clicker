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
        consumable_effect: {
            "restore_hp": "30",
            "restore_stamina": "10"
        },
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
        consumable_effect: {
            "restore_mp": "20",
            "restore_stamina": "15"
        },
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
        consumable_effect: {
            "restore_hp": "100",
            "restore_mp": "50",
            "restore_stamina": "30"
        },
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
        consumable_effect: {
            "restore_mp": "150",
            "restore_hp": "25"
        },
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
        consumable_effect: {
            "restore_stamina": "50"
        },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000006",
        name: "Magiczna Fasolka",
        category: "consumable",
        slot: null,
        buy_price_coins: "50000",
        sell_price_coins: "25000",
        consumable_effect: {
            "zenkai_resurrection": "true"
        },
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
        consumable_effect: {
            "restore_hp": "full",
            "restore_mp": "full",
            "restore_stamina": "full"
        },
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
        consumable_effect: {
            "temporary_buff": {
                "type": "holy_blessing",
                "duration_minutes": "60",
                "bonus_stats": {
                    "all_stats": "10"
                }
            }
        },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000009",
        name: "Kropla Krwi Smoka",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "10000",
        consumable_effect: {
            "permanent_bonus": {
                "strength": "5",
                "speed": "3",
                "endurance": "4"
            }
        },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000010",
        name: "Łza Bogów",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "50000",
        consumable_effect: {
            "permanent_bonus": {
                "strength": "20",
                "speed": "15",
                "endurance": "18",
                "intelligence": "10",
                "mental_strength": "12"
            }
        },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000011",
        name: "Ziarno Formy Super",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "100000",
        consumable_effect: {
            "unlock_transformation": "super_saiyan"
        },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000012",
        name: "Zwój Mocy Ki",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "7500",
        consumable_effect: {
            "permanent_bonus": {
                "intelligence": "8",
                "mental_strength": "12"
            }
        },
        req_stats: null,
        bonuses: null
    },
    {
        id: "00000000-0000-0000-0000-000000000013",
        name: "Zwój Szybkości",
        category: "special_consumable",
        slot: null,
        buy_price_coins: null,
        sell_price_coins: "8000",
        consumable_effect: {
            "permanent_bonus": {
                "speed": "15",
                "endurance": "5"
            }
        },
        req_stats: null,
        bonuses: null
    },

    // === EKWIPEUNEK (equipment) ===
    
    // Klatka piersiowa (chest)
    {
        id: "00000000-0000-0000-0000-000000000014",
        name: "Podstawowe Gi",
        category: "equipment",
        slot: "chest",
        buy_price_coins: "1500",
        sell_price_coins: "750",
        req_stats: null,
        bonuses: {
            "bonus_hp": "20",
            "defense": "5"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000015",
        name: "Ciężka Skorupa",
        category: "equipment",
        slot: "chest",
        buy_price_coins: null,
        sell_price_coins: "5000",
        req_stats: {
            "strength": "50",
            "endurance": "40"
        },
        bonuses: {
            "bonus_hp": "100",
            "defense": "25",
            "speed_penalty": "10"
        }
    },

    // Głowa (head)
    {
        id: "00000000-0000-0000-0000-000000000016",
        name: "Opaska Nowicjusza",
        category: "equipment",
        slot: "head",
        buy_price_coins: "1500",
        sell_price_coins: "750",
        req_stats: null,
        bonuses: {
            "bonus_hp": "10",
            "defense": "3"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000017",
        name: "Ciężka Opaska",
        category: "equipment",
        slot: "head",
        buy_price_coins: "8000",
        sell_price_coins: "4000",
        req_stats: {
            "strength": "30",
            "endurance": "25"
        },
        bonuses: {
            "bonus_hp": "50",
            "defense": "15",
            "mental_strength": "5"
        }
    },

    // Dłonie (hands)
    {
        id: "00000000-0000-0000-0000-000000000018",
        name: "Bandaże Treningowe",
        category: "equipment",
        slot: "hands",
        buy_price_coins: null,
        sell_price_coins: "300",
        req_stats: null,
        bonuses: {
            "strength": "2",
            "defense": "2"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000019",
        name: "Ciężkie Rękawice",
        category: "equipment",
        slot: "hands",
        buy_price_coins: null,
        sell_price_coins: "3000",
        req_stats: {
            "strength": "25",
            "endurance": "20"
        },
        bonuses: {
            "strength": "8",
            "defense": "10",
            "speed_penalty": "3"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000020",
        name: "Ciężki Miecz",
        category: "equipment",
        slot: "hands",
        buy_price_coins: null,
        sell_price_coins: "4000",
        req_stats: {
            "strength": "80",
            "endurance": "30"
        },
        bonuses: {
            "attack_power": "25",
            "strength": "15",
            "speed_penalty": "15"
        }
    },

    // Nogi (legs)
    {
        id: "00000000-0000-0000-0000-000000000021",
        name: "Wygodne Spodnie",
        category: "equipment",
        slot: "legs",
        buy_price_coins: null,
        sell_price_coins: "500",
        req_stats: null,
        bonuses: {
            "bonus_hp": "15",
            "speed": "3"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000022",
        name: "Ciężkie Spodnie",
        category: "equipment",
        slot: "legs",
        buy_price_coins: "15000",
        sell_price_coins: "7500",
        req_stats: {
            "strength": "40",
            "endurance": "35"
        },
        bonuses: {
            "bonus_hp": "80",
            "defense": "20",
            "speed_penalty": "8"
        }
    },

    // Stopy (feet)
    {
        id: "00000000-0000-0000-0000-000000000023",
        name: "Trampki",
        category: "equipment",
        slot: "feet",
        buy_price_coins: "800",
        sell_price_coins: "400",
        req_stats: null,
        bonuses: {
            "speed": "5",
            "endurance": "2"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000024",
        name: "Obciążone Buty",
        category: "equipment",
        slot: "feet",
        buy_price_coins: null,
        sell_price_coins: "2000",
        req_stats: {
            "strength": "20",
            "endurance": "25"
        },
        bonuses: {
            "endurance": "10",
            "bonus_hp": "30",
            "speed_penalty": "5"
        }
    },

    // Biżuteria
    {
        id: "00000000-0000-0000-0000-000000000025",
        name: "Kolczyk Umysłu",
        category: "equipment",
        slot: "ear_l",
        buy_price_coins: null,
        sell_price_coins: "1500",
        req_stats: {
            "intelligence": "15",
            "mental_strength": "12"
        },
        bonuses: {
            "intelligence": "5",
            "mental_strength": "8",
            "mp_regeneration": "2"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000026",
        name: "Pierścień Ducha",
        category: "equipment",
        slot: "ring_l",
        buy_price_coins: null,
        sell_price_coins: "2000",
        req_stats: {
            "mental_strength": "18",
            "intelligence": "10"
        },
        bonuses: {
            "mental_strength": "6",
            "intelligence": "4",
            "bonus_mp": "25"
        }
    },
    {
        id: "00000000-0000-0000-0000-000000000027",
        name: "Rzemyk Harmonii",
        category: "equipment",
        slot: "necklace",
        buy_price_coins: null,
        sell_price_coins: "1200",
        req_stats: {
            "intelligence": "8",
            "mental_strength": "10"
        },
        bonuses: {
            "mental_strength": "4",
            "intelligence": "3",
            "ki_efficiency": "5"
        }
    }
];

// Funkcja wgrania przedmiotów do bazy danych
async function seedItems() {
    try {
        console.log('🌱 Rozpoczynam aktualizację przedmiotów w bazie danych...');
        
        console.log('🧹 Czyszczenie starych przedmiotów...');
        const { error: deleteError } = await supabase.from('item_templates').delete().not('id', 'is', null);
        if (deleteError) throw deleteError;
        
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
