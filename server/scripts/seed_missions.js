require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Dane misji 1-5 z GDD - wszystkie wartości liczbowe w JSONB jako stringi!
const missionsData = [
    {
        name: "Trening w pobliskim lesie",
        description: "Wzmocnij swoje statystyki, trenując rąbanie drewna i bieganie.",
        stamina_cost: 2,
        req_stats: { 
            "strength": "1", 
            "speed": "1", 
            "endurance": "1" 
        },
        reward_coins_min: 0,
        reward_coins_max: 1,
        reward_stats: { 
            "min": "1", 
            "max": "2" 
        },
        drop_table: [
            { 
                "item_id": "jagody", 
                "chance_pct": 20 
            }
        ],
        is_repeatable: true
    },
    {
        name: "Atak z przestworzy",
        description: "Z nieba niespodziewanie pikuje na ciebie gigantyczna, wygłodniała bestia. Odeprzyj atak!",
        stamina_cost: 3,
        req_stats: { 
            "strength": "15", 
            "speed": "15", 
            "endurance": "15" 
        },
        reward_coins_min: 0,
        reward_coins_max: 2,
        reward_stats: { 
            "min": "3", 
            "max": "5" 
        },
        drop_table: [
            { 
                "item_id": "mieso", 
                "chance_pct": 20 
            }
        ],
        is_repeatable: true
    },
    {
        name: "Zagubiony Wędrowiec",
        description: "Znajdujesz ogromnego, morskiego żółwia, który zgubił drogę. Eskortuj go do oceanu.",
        stamina_cost: 4,
        req_stats: { 
            "strength": "40", 
            "speed": "40", 
            "endurance": "40" 
        },
        reward_coins_min: 0,
        reward_coins_max: 2,
        reward_stats: { 
            "min": "4", 
            "max": "6" 
        },
        drop_table: [],
        is_repeatable: true
    },
    {
        name: "Bandyta z wielkim mieczem",
        description: "Tuż przed celem drogę zachodzi wam potężny rabuś dzierżący wielki miecz. Pokaż mu siłę swoich pięści.",
        stamina_cost: 5,
        req_stats: { 
            "strength": "150", 
            "speed": "150", 
            "endurance": "150" 
        },
        reward_coins_min: 1,
        reward_coins_max: 4,
        reward_stats: { 
            "min": "10", 
            "max": "15" 
        },
        drop_table: [
            { 
                "item_id": "ciezki_miecz", 
                "chance_pct": 15 
            }
        ],
        is_repeatable: true
    },
    {
        name: "Test Starego Mistrza",
        description: "W nagrodę za pomoc z wody wyłania się starzec. Wyzywa cię na sparing, by sprawdzić twój potencjał.",
        stamina_cost: 10,
        req_stats: { 
            "strength": "300", 
            "speed": "300", 
            "endurance": "300" 
        },
        reward_coins_min: 2,
        reward_coins_max: 6,
        reward_stats: { 
            "min": "15", 
            "max": "25" 
        },
        drop_table: [
            { 
                "item_id": "napoj_sportowy", 
                "chance_pct": 10 
            },
            { 
                "item_id": "ciezka_skorupa", 
                "chance_pct": 100 
            }
        ],
        is_repeatable: false
    }
];

// Funkcja wgrania misji do bazy danych
async function seedMissions() {
    try {
        console.log('🌱 Rozpoczynam wgranie misji do bazy danych...');
        
        // Krok 1: Usuń istniejące misje (czysty start)
        console.log('🧹 Czyśczenie tabeli missions...');
        const { error: deleteError } = await supabase
            .from('missions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Usuń wszystko (warunek zawsze prawdziwy)
            
        if (deleteError) {
            console.error('❌ Błąd usuwania istniejących misji:', deleteError.message);
        } else {
            console.log('✅ Tabela missions wyczyszczona');
        }
        
        // Krok 2: Wgraj nowe misje
        console.log('📦 Wgrywanie nowych misji...');
        const { data, error } = await supabase
            .from('missions')
            .insert(missionsData)
            .select();
            
        if (error) {
            console.error('❌ Błąd wgrywania misji:', error.message);
            console.error('Szczegóły błędu:', error);
            process.exit(1);
        }
        
        console.log(`✅ Pomyślnie wgrano ${data.length} misji do bazy danych:`);
        data.forEach((mission, index) => {
            console.log(`   ${index + 1}. ${mission.name} (ID: ${mission.id})`);
        });
        
        console.log('🎉 Seeder misji zakończony sukcesem!');
        
    } catch (err) {
        console.error('❌ Nieoczekiwany błąd podczas seedera:', err.message);
        process.exit(1);
    }
    
    // Zakończ proces
    process.exit(0);
}

// Uruchom seedera
seedMissions();
