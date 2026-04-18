require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const generateTaskId = (num) => `20000000-0000-0000-0000-${String(num).padStart(12, '0')}`;
const generateItemId = (num) => `00000000-0000-0000-0000-${String(num).padStart(12, '0')}`;
const generateMissionId = (num) => `10000000-0000-0000-0000-${String(num).padStart(12, '0')}`;

const specialTasksData = [];
let tid = 1;

function addTask(type, target, name, desc, goal, minD, maxD, icon, coins, items, stats) {
    let rewardObj = { icon, coins };
    if (items && items.length > 0) rewardObj.items = items.map(i => ({ id: generateItemId(i.id), qty: i.qty }));
    if (stats) rewardObj.stats = stats;

    specialTasksData.push({
        id: generateTaskId(tid++), name, description: desc, task_type: type,
        target_id: target, goal_amount: goal, min_dc_day: minD, max_dc_day: maxD,
        reward: rewardObj
    });
}

// ==========================================
// 1. PRACA & 2. TRENING
// ==========================================
const works = [
    { id: 'praca_mleko', name: 'Roznoszenie Mleka', icon: '🥛', goals: [3, 5, 10], days: [[1,5], [1,10], [1,25]], items: [7, 7, 7], qtys: [3, 5, 10], coins: [200, 400, 800] },
    { id: 'praca_budowa', name: 'Praca na Budowie', icon: '🧱', goals: [3, 5, 10], days: [[2,6], [5,15], [15,35]], items: [20, 20, 20], qtys: [1, 2, 3], coins: [200, 400, 900] },
    { id: 'praca_pole', name: 'Praca na Polu', icon: '🌱', goals: [3, 5, 8], days: [[10,30], [15,35], [20,50]], items: [48, 48, 48], qtys: [1, 2, 3], coins: [500, 1000, 2000] },
    { id: 'praca_drwal', name: 'Drwal', icon: '🪓', goals: [3, 5, 8], days: [[20,40], [25,50], [30,60]], items: [40, 40, 40], qtys: [1, 2, 3], coins: [1000, 2000, 4000] },
    { id: 'praca_kurier', name: 'Ekstremalny Kurier', icon: '📦', goals: [3, 5, 8], days: [[30,50], [35,60], [40,70]], items: [42, 42, 42], qtys: [1, 2, 3], coins: [2000, 4000, 8000] },
    { id: 'praca_rosa', name: 'Zbiór Magicznej Rosy', icon: '💧', goals: [3, 5, 8], days: [[40,60], [45,70], [50,75]], items: [16, 17, 18], qtys: [2, 2, 2], coins: [4000, 8000, 15000] },
    { id: 'praca_ogrody', name: 'Boskie Ogrody', icon: '🌳', goals: [3, 5, 8], days: [[50,75], [60,75], [65,75]], items: [24, 24, 24], qtys: [1, 2, 3], coins: [10000, 20000, 40000] }
];

works.forEach(w => w.goals.forEach((goal, idx) => addTask('work', w.id, `${w.name} (Poziom ${idx+1})`, `Zakończ sukcesem zmianę "${w.name}" ${goal} razy.`, goal, w.days[idx][0], w.days[idx][1], w.icon, w.coins[idx], [{ id: w.items[idx], qty: w.qtys[idx] }])));

const mentors = [ { id: 'any', name: 'Dowolny Trening', icon: '🏋️‍♂️', minD: 1 }, { id: 'mentor_1', name: 'Trening u Mistrza Lasu', icon: '🌲', minD: 5 }, { id: 'mentor_2', name: 'Trening w Dojo', icon: '🥋', minD: 20 }, { id: 'mentor_3', name: 'Trening u Pustelnika', icon: '☁️', minD: 35 }, { id: 'mentor_4', name: 'Boski Trening', icon: '✨', minD: 50 } ];
const trainGoals = [60, 180, 360]; const trainCoins = [500, 1500, 3500]; const trainItems = [16, 17, 33]; 

mentors.forEach(m => trainGoals.forEach((goal, idx) => addTask('training', m.id, `${m.name} (Poziom ${idx+1})`, `Spędź ${goal} minut na treningu.`, goal, m.minD, 75, m.icon, trainCoins[idx], [{ id: trainItems[idx], qty: idx+1 }])));
[5, 15, 30].forEach((g, idx) => addTask('training', 'time_chamber', `Nagięcie Czasu (Poziom ${idx+1})`, `Spędź ${g} minut realnego czasu w Sali Czasu.`, g, 20, 75, '⏳', 1000 * (idx+1), [{ id: 59, qty: 1 }]));

// ==========================================
// KATEGORIA 3 & 4: SKLEP KUP / SPRZEDAJ (ZMODYFIKOWANE!)
// ==========================================
const shopLevels = ['any', 'shop_1', 'shop_2', 'shop_3', 'shop_4'];
shopLevels.forEach((level, l_idx) => {
    [5, 15, 30].forEach((g, idx) => addTask('shop_buy', level, `Klient: ${level === 'any' ? 'Gdziekolwiek' : `Poziom ${l_idx}`} (Poz ${idx+1})`, `Kup ${g} przedmiotów (${level === 'any' ? 'dowolny poziom' : `sklep poziom ${l_idx}`}).`, g, l_idx*10 + 1, 75, '🛒', g*100, [{ id: 20 + l_idx, qty: 1 }]));
});

// Nowe cele sprzedaży (Niezależne od poziomów sklepu!)
const sellAnyGoals = [10, 25, 50, 100];
sellAnyGoals.forEach((g, idx) => {
    addTask('shop_sell', 'any', `Wielka Wyprzedaż (Poziom ${idx+1})`, `Sprzedaj ze swojego plecaka łącznie ${g} dowolnych przedmiotów.`, g, idx*15 + 1, 75, '⚖️', g*100, [{ id: 20, qty: idx+1 }]);
});

const sellEquipGoals = [2, 5, 10, 20];
sellEquipGoals.forEach((g, idx) => {
    addTask('shop_sell', 'equipment', `Handlarz Sprzętem (Poziom ${idx+1})`, `Sprzedaj w sklepie łącznie ${g} sztuk Ekwipunku.`, g, idx*15 + 5, 75, '🛡️', g*300, [{ id: 21, qty: idx+1 }]);
});

const sellSpecific = [
    { id: 1, name: 'Kawałek Mięsa', goal: 5, rewardId: 2, rewardQty: 1, minD: 1 },
    { id: 7, name: 'Magiczne Ziele', goal: 10, rewardId: 8, rewardQty: 1, minD: 10 },
    { id: 13, name: 'Mały Napój Sportowy', goal: 15, rewardId: 14, rewardQty: 1, minD: 20 },
];
sellSpecific.forEach((s, idx) => {
    addTask('shop_sell', generateItemId(s.id), `Dostawca: ${s.name}`, `Sprzedaj w sklepie dokładnie ${s.goal} sztuk przedmiotu: ${s.name}.`, s.goal, s.minD, 75, '📦', s.goal * 150, [{ id: s.rewardId, qty: s.rewardQty }]);
});

// ==========================================
// KATEGORIA 6: MISJE
// ==========================================
for(let m = 1; m <= 25; m++) {
    const minDay = Math.min(1 + (m * 2), 70); 
    const goal = m <= 5 ? 10 : (m <= 10 ? 8 : (m <= 15 ? 5 : (m <= 20 ? 3 : 1))); 
    addTask('mission', generateMissionId(m), `Zlecenie Bojowe #${m}`, `Ukończ pomyślnie misję numer ${m} dokładnie ${goal} razy.`, goal, minDay, 75, '⚔️', m * 300, [{ id: (m % 5) + 16, qty: m <= 15 ? 2 : 1 }]);
}

// ==========================================
// KATEGORIA 7: UŻYJ PRZEDMIOTU (NAPRAWIONE ID)
// ==========================================
const consumeItems = [
    { id: 1, name: 'Kawałek Mięsa' }, { id: 2, name: 'Solidna Pieczeń' },
    { id: 4, name: 'Mała Kapsułka Med.' }, { id: 7, name: 'Magiczne Ziele' },
    { id: 10, name: 'Mała Kapsułka Many' }, { id: 13, name: 'Mały Napój Sportowy' }
];

consumeItems.forEach(ci => {
    [5, 15, 30].forEach((g, idx) => addTask('consume', generateItemId(ci.id), `Koneser: ${ci.name} (Poziom ${idx+1})`, `Użyj przedmiotu: ${ci.name} dokładnie ${g} razy.`, g, 1, 75, '🧪', g * 50, [{ id: 21, qty: 1 }]));
});

// ==========================================
// KATEGORIA 8: BONUS TRENINGOWY
// ==========================================
const singleStats = ['strength', 'speed', 'endurance', 'technique'];
singleStats.forEach(stat => {
    [100, 500, 1500, 5000, 15000, 50000].forEach((g, idx) => {
        const statPl = stat === 'strength' ? 'Siły' : (stat === 'speed' ? 'Szybkości' : (stat === 'endurance' ? 'Wytrzymałości' : 'Techniki'));
        const statKey = {}; statKey[stat] = g / 10; 
        addTask('training_stats', stat, `Trening Specjalistyczny (Poziom ${idx+1})`, `Zdobądź łącznie ${g} pkt ${statPl} jako bonus z przedmiotów.`, g, idx * 10 + 1, 75, '🔥', g/2, [{ id: 40, qty: 1 }], statKey);
    });
});

[200, 1000, 4000, 12000, 40000].forEach((g, idx) => {
    addTask('training_stats', 'all', `Perfekcyjna Harmonia (Poziom ${idx+1})`, `Zdobądź łącznie ${g} punktów WE WSZYSTKICH 4 statystykach jako bonus z przedmiotów.`, g, idx * 12 + 5, 75, '🌟', g, [{ id: 59, qty: 1 }], { strength: g/5, speed: g/5, endurance: g/5, technique: g/5 });
});

// ==========================================
// FUNKCJA SEEDUJĄCA
// ==========================================
async function seedSpecialTasks() {
    try {
        console.log('📜 Rozpoczynam generowanie i aktualizację Zadań Specjalnych...');
        const chunkSize = 50;
        for (let i = 0; i < specialTasksData.length; i += chunkSize) {
            const chunk = specialTasksData.slice(i, i + chunkSize);
            const { error } = await supabase.from('special_tasks_templates').upsert(chunk, { onConflict: 'id' });
            if (error) throw error;
        }
        console.log(`🎉 SUKCES! Zaktualizowano wszystkie ${specialTasksData.length} zadań w bazie!`);
    } catch (err) { console.error('❌ Błąd podczas wgrywania zadań:', err); }
}
seedSpecialTasks();