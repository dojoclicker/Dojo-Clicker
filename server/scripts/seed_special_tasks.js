require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Generator stałych UUID dla zadań (żeby aktualizować zamiast dublować)
// Używamy prefiksu "20000000" aby łatwo odróżnić zadania od misji i przedmiotów
const generateTaskId = (num) => `20000000-0000-0000-0000-${String(num).padStart(12, '0')}`;

const specialTasksData = [
    {
        id: generateTaskId(1),
        name: 'Wytrwały Biegacz',
        description: 'Ukończ misję "Trening w pobliskim lesie" 50 razy.',
        task_type: 'mission',
        target_id: '00000000-0000-0000-0000-000000000001', // ID Misji 1
        goal_amount: 50,
        min_dc_day: 1,
        max_dc_day: 15, // Zadanie pojawia się tylko między 1 a 15 dniem
        reward: { coins: 500, items: [{ id: "00000000-0000-0000-0000-000000000001", qty: 10 }] } // 500 monet i 10x Mięso
    },
    {
        id: generateTaskId(2),
        name: 'Pracuś (Budowa)',
        description: 'Zakończ sukcesem zmianę w "Praca na Budowie" 5 razy.',
        task_type: 'work',
        target_id: 'praca_budowa',
        goal_amount: 5,
        min_dc_day: 5,
        max_dc_day: 75,
        reward: { stats: { bonus_coins_pct: 5 } } // +5% stałego bonusu do monet
    },
    {
        id: generateTaskId(3),
        name: 'Żelazna Wola',
        description: 'Spędź 240 minut (4 godziny) na aktywnym treningu u dowolnego mentora.',
        task_type: 'training',
        target_id: 'any',
        goal_amount: 240,
        min_dc_day: 2,
        max_dc_day: 75,
        reward: { items: [{ id: "00000000-0000-0000-0000-000000000030", qty: 1 }] } // 1x Święta Woda
    },
    {
        id: generateTaskId(4),
        name: 'Powrót na Ring',
        description: 'Wygraj Lokalny Turniej Sztuk Walki 1 raz.',
        task_type: 'mission',
        target_id: '00000000-0000-0000-0000-000000000011', // ID Misji 11 (Turniej)
        goal_amount: 1,
        min_dc_day: 3,
        max_dc_day: 75,
        reward: { coins: 2500, stats: { strength: 250, speed: 250, endurance: 250, technique: 250 } }
    },
    {
        id: generateTaskId(5),
        name: 'Gladiator',
        description: 'Wygraj 3 walki na Arenie PVP.',
        task_type: 'pvp',
        target_id: 'win',
        goal_amount: 3,
        min_dc_day: 15,
        max_dc_day: 75,
        reward: { items: [{ id: "00000000-0000-0000-0000-000000000031", qty: 1 }] } // 1x Kropla Krwi Smoka
    }
];

async function seedTasks() {
    try {
        console.log('📜 Rozpoczynam aktualizację Zadań Specjalnych w bazie danych...');
        
        const { data, error } = await supabase
            .from('special_tasks_templates')
            .upsert(specialTasksData, { onConflict: 'id' });

        if (error) {
            throw error;
        }

        console.log('✅ Zakończono sukcesem! Zadania są gotowe do losowania.');
    } catch (err) {
        console.error('❌ Błąd podczas seedowania zadań:', err.message);
    }
}

seedTasks();