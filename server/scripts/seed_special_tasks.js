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
        target_id: '00000000-0000-0000-0000-000000000001',
        goal_amount: 50,
        min_dc_day: 1,
        max_dc_day: 15,
        // DODANO: icon oraz name dla przedmiotu
        reward: { icon: '🏃‍♂️', coins: 500, items: [{ id: "00000000-0000-0000-0000-000000000001", qty: 10, name: "Kawałek Mięsa" }] } 
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
        reward: { icon: '🏗️', items: [{ id: "00000000-0000-0000-0000-000000000020", qty: 2, name: "Mała Sakiewka" }] } 
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
        reward: { icon: '🏋️‍♂️', items: [{ id: "00000000-0000-0000-0000-000000000030", qty: 1, name: "Kropla Wigoru" }] } 
    },
    {
        id: generateTaskId(4),
        name: 'Powrót na Ring',
        description: 'Wygraj Lokalny Turniej Sztuk Walki 1 raz.',
        task_type: 'mission',
        target_id: '00000000-0000-0000-0000-000000000011',
        goal_amount: 1,
        min_dc_day: 3,
        max_dc_day: 75,
        reward: { icon: '🏆', coins: 2500, stats: { strength: 250, speed: 250, endurance: 250, technique: 250 }, items: [{ id: "00000000-0000-0000-0000-000000000032", qty: 1, name: "Esencja Wigoru" }] }
    },
    {
        id: generateTaskId(5),
        name: 'Bywalec Sklepów',
        description: 'Kup 5 dowolnych przedmiotów w Sklepie (dowolny poziom).',
        task_type: 'shop',
        target_id: 'buy',
        goal_amount: 5,
        min_dc_day: 15,
        max_dc_day: 75,
        reward: { icon: '🛍️', items: [{ id: "00000000-0000-0000-0000-000000000031", qty: 1, name: "Nektar Wigoru" }] } 
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