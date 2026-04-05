require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Słownik ID Przedmiotów
const ITEMS = {
    MIESO: "00000000-0000-0000-0000-000000000001",
    JAGODY: "00000000-0000-0000-0000-000000000002",
    NAPOJ: "00000000-0000-0000-0000-000000000005",
    FASOLKA: "00000000-0000-0000-0000-000000000006",
    KAPSULKA: "00000000-0000-0000-0000-000000000007",
    WODA: "00000000-0000-0000-0000-000000000008",
    KROPLA: "00000000-0000-0000-0000-000000000009",
    ZWOJ_MOCY_KI: "00000000-0000-0000-0000-000000000012",
    ZWOJ_SZYBKOSCI: "00000000-0000-0000-0000-000000000013",
    CIEZKA_SKORUPA: "00000000-0000-0000-0000-000000000015",
    OPASKA_NOWICJUSZA: "00000000-0000-0000-0000-000000000016",
    CIEZKI_MIECZ: "00000000-0000-0000-0000-000000000020"
};

const missionsData = [
    {
        id: "00000000-0000-0000-0000-000000000001", name: "Trening w pobliskim lesie",
        description: "Wzmocnij swoje statystyki, trenując rąbanie drewna i bieganie.",
        stamina_cost: 2, req_stats: { "strength": "1", "speed": "1", "endurance": "1" },
        reward_coins_min: 0, reward_coins_max: 1, reward_stats: { "min": "2", "max": "3" },
        drop_table: [{ "item_id": ITEMS.JAGODY, "chance_pct": 20 }], 
        is_repeatable: true, is_one_try: false
    },
    {
        id: "00000000-0000-0000-0000-000000000002", name: "Bestia z Nieba",
        description: "Z nieba niespodziewanie pikuje na ciebie gigantyczna, wygłodniała bestia. Odeprzyj atak!",
        stamina_cost: 3, req_stats: { "strength": "15", "speed": "15", "endurance": "15" },
        reward_coins_min: 0, reward_coins_max: 2, reward_stats: { "min": "3", "max": "5" },
        drop_table: [{ "item_id": ITEMS.MIESO, "chance_pct": 20 }], 
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000003", name: "Misja 3: Żółw",
        description: "Znajdujesz ogromnego, morskiego żółwia, który zgubił drogę. Eskortuj go do oceanu.",
        stamina_cost: 4, req_stats: { "strength": "40", "speed": "40", "endurance": "40" },
        reward_coins_min: 0, reward_coins_max: 2, reward_stats: { "min": "4", "max": "6" },
        drop_table: [],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000004", name: "Misja 4: Bandyta z Mieczem",
        description: "Tuż przed celem drogę zachodzi wam potężny rabuś dzierżący wielki miecz. Pokaż mu siłę swoich pięści.",
        stamina_cost: 5, req_stats: { "strength": "100", "speed": "100", "endurance": "100" },
        reward_coins_min: 1, reward_coins_max: 4, reward_stats: { "min": "10", "max": "15" },
        drop_table: [{ "item_id": ITEMS.CIEZKI_MIECZ, "chance_pct": 15 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "00000000-0000-0000-0000-000000000005", name: "Test Starego Mistrza (Jednorazowa)",
        description: "Mistrz zgadza się wziąć cię pod swoje skrzydła. Udowodnij swój potencjał w sparingu.",
        stamina_cost: 10, req_stats: { "strength": "250", "speed": "250", "endurance": "250" },
        reward_coins_min: 2, reward_coins_max: 6, reward_stats: { "min": "15", "max": "25" },
        drop_table: [{ "item_id": ITEMS.CIEZKA_SKORUPA, "chance_pct": 100 }, { "item_id": ITEMS.NAPOJ, "chance_pct": 10 }],
        is_repeatable: false, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000006", name: "Misja 6: Mleko",
        description: "Mistrz zmusza cię do biegania z ciężkimi skrzynkami pełnymi mleka na wschód słońca.",
        stamina_cost: 10, req_stats: { "strength": "500", "speed": "500", "endurance": "500" },
        reward_coins_min: 3, reward_coins_max: 7, reward_stats: { "min": "20", "max": "35" },
        drop_table: [{ "item_id": ITEMS.NAPOJ, "chance_pct": 1 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000007", name: "Misja 7: Budowa",
        description: "Mistrz wysyła cię na wielki plac budowy. Przenoszenie betonu gołymi rękami hartuje ciało.",
        stamina_cost: 10, req_stats: { "strength": "1000", "speed": "1000", "endurance": "1000" },
        reward_coins_min: 4, reward_coins_max: 8, reward_stats: { "min": "30", "max": "50" },
        drop_table: [{ "item_id": ITEMS.NAPOJ, "chance_pct": 1 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000008", name: "Misja 8: Pole",
        description: "Czas pomóc rolnikom. Musisz zaorać ogromne pole używając tylko własnych rąk!",
        stamina_cost: 15, req_stats: { "strength": "2500", "speed": "2500", "endurance": "2500" },
        reward_coins_min: 10, reward_coins_max: 12, reward_stats: { "min": "50", "max": "80" },
        drop_table: [{ "item_id": ITEMS.NAPOJ, "chance_pct": 2 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000009", name: "Misja 9: Drwal",
        description: "Czas pomóc drwalom. Musisz wycinać ogromne drzewa używając tylko własnych rąk!",
        stamina_cost: 15, req_stats: { "strength": "5000", "speed": "5000", "endurance": "5000" },
        reward_coins_min: 15, reward_coins_max: 20, reward_stats: { "min": "60", "max": "100" },
        drop_table: [{ "item_id": ITEMS.NAPOJ, "chance_pct": 5 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000010", name: "Misja 10: Kurier",
        description: "Czas pomóc kurierom. Musisz przynieść paczki w czasie używając tylko własnych rąk!",
        stamina_cost: 20, req_stats: { "strength": "10000", "speed": "10000", "endurance": "10000" },
        reward_coins_min: 20, reward_coins_max: 25, reward_stats: { "min": "100", "max": "150" },
        drop_table: [{ "item_id": ITEMS.NAPOJ, "chance_pct": 10 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "00000000-0000-0000-0000-000000000011", name: "Lokalny Turniej Sztuk Walki (Jednorazowa)",
        description: "Masz tylko jedną szansę! W finale czeka na ciebie dziwny starzec w peruce.",
        stamina_cost: 25, req_stats: { "strength": "15000", "speed": "15000", "endurance": "15000" },
        reward_coins_min: 500, reward_coins_max: 1500, reward_stats: { "min": "1500", "max": "2000" },
        drop_table: [{ "item_id": ITEMS.KROPLA, "chance_pct": 100 }],
        is_repeatable: false, is_one_try: true
    },
    {
        id: "10000000-0000-0000-0000-000000000012", name: "Misja 12: Srebrny Oficer",
        description: "Natrafiasz na oddział zbrojny. Ich bezwzględny oficer niszczy twój transport. Czas dać mu nauczkę!",
        stamina_cost: 30, req_stats: { "strength": "20000", "speed": "20000", "endurance": "20000" },
        reward_coins_min: 25, reward_coins_max: 50, reward_stats: { "min": "400", "max": "600" },
        drop_table: [{ "item_id": ITEMS.KAPSULKA, "chance_pct": 5 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000013", name: "Misja 13: Zimowa Wieża",
        description: "Docierasz do ufortyfikowanej wieży Armii. Przebij się przez strażników i wielkiego cyborga na szczycie!",
        stamina_cost: 35, req_stats: { "strength": "35000", "speed": "35000", "endurance": "35000" },
        reward_coins_min: 40, reward_coins_max: 80, reward_stats: { "min": "800", "max": "1200" },
        drop_table: [{ "item_id": ITEMS.OPASKA_NOWICJUSZA, "chance_pct": 3 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "00000000-0000-0000-0000-000000000014", name: "Płatny Morderca Tao",
        description: "Przeciwnik przyleciał na kamiennym filarze. Jego technika to śmiercionośny promień z palca!",
        stamina_cost: 40, req_stats: { "strength": "55000", "speed": "55000", "endurance": "55000" },
        reward_coins_min: 80, reward_coins_max: 100, reward_stats: { "min": "1500", "max": "2500" },
        drop_table: [{ "item_id": ITEMS.ZWOJ_MOCY_KI, "chance_pct": 2 }, { "item_id": ITEMS.KAPSULKA, "chance_pct": 5 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000015", name: "Misja 15: Święta Wieża",
        description: "Wspinasz się na legendarną wieżę sięgającą chmur do Kociego Pustelnika, by zdobyć magiczną wodę.",
        stamina_cost: 50, req_stats: { "strength": "80000", "speed": "80000", "endurance": "80000" },
        reward_coins_min: 90, reward_coins_max: 150, reward_stats: { "min": "3000", "max": "5000" },
        drop_table: [{ "item_id": ITEMS.FASOLKA, "chance_pct": 5 }, { "item_id": ITEMS.WODA, "chance_pct": 1 }],
        is_repeatable: false, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000016", name: "Misja 16: Pancerz Mecha",
        description: "Główna baza zbrodniarzy. Ich dowódca założył potężny pancerz bojowy. Zakończ ich terror!",
        stamina_cost: 55, req_stats: { "strength": "120000", "speed": "120000", "endurance": "120000" },
        reward_coins_min: 150, reward_coins_max: 200, reward_stats: { "min": "4000", "max": "6000" },
        drop_table: [],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000017", name: "Misja 17: Demony",
        description: "Starożytny Król Demonów został uwolniony. Jego skrzydlate sługi atakują miasta.",
        stamina_cost: 60, req_stats: { "strength": "180000", "speed": "180000", "endurance": "180000" },
        reward_coins_min: 200, reward_coins_max: 300, reward_stats: { "min": "7000", "max": "10000" },
        drop_table: [],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000018", name: "Misja 18: Zmutowany Demon",
        description: "Drogę do zamku zagradza zmutowany wojownik stworzony, by zabijać mistrzów.",
        stamina_cost: 65, req_stats: { "strength": "280000", "speed": "280000", "endurance": "280000" },
        reward_coins_min: 300, reward_coins_max: 400, reward_stats: { "min": "12000", "max": "18000" },
        drop_table: [{ "item_id": ITEMS.KAPSULKA, "chance_pct": 15 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000019", name: "Misja 19: Król Demon",
        description: "Król Demonów powrócił do szczytowej formy. Zbierz moc i przebij go w locie!",
        stamina_cost: 70, req_stats: { "strength": "450000", "speed": "450000", "endurance": "450000" },
        reward_coins_min: 400, reward_coins_max: 500, reward_stats: { "min": "20000", "max": "30000" },
        drop_table: [],
        is_repeatable: false, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000020", name: "Misja 20: Niebiański Pałac",
        description: "Używając magicznego kija docierasz do latającego Pałacu Wszechmogącego. Pokonaj Strażnika!",
        stamina_cost: 75, req_stats: { "strength": "700000", "speed": "700000", "endurance": "700000" },
        reward_coins_min: 500, reward_coins_max: 600, reward_stats: { "min": "35000", "max": "50000" },
        drop_table: [{ "item_id": ITEMS.WODA, "chance_pct": 100 }],
        is_repeatable: false, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000021", name: "Misja 21: Sala Czasu",
        description: "Reinkarnacja Króla Demonów rośnie w siłę. Wejdź do Sali Czasu, gdzie jeden dzień to cały rok.",
        stamina_cost: 80, req_stats: { "strength": "1000000", "speed": "1000000", "endurance": "1000000" },
        reward_coins_min: 600, reward_coins_max: 800, reward_stats: { "min": "70000", "max": "100000" },
        drop_table: [],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000022", name: "Misja 22: Własny Cień",
        description: "Fizyczna siła to nie wszystko. Musisz stoczyć najtrudniejszą walkę ze swoim mrocznym sobowtórem.",
        stamina_cost: 85, req_stats: { "strength": "1500000", "speed": "1500000", "endurance": "1500000" },
        reward_coins_min: 800, reward_coins_max: 1200, reward_stats: { "min": "150000", "max": "200000" },
        drop_table: [],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000023", name: "Misja 23: Eliminacje",
        description: "Zapisujesz się na Wielki Turniej Sztuk Walki. Przebij się przez gąszcz zawodników do głównej drabinki.",
        stamina_cost: 90, req_stats: { "strength": "2500000", "speed": "2500000", "endurance": "2500000" },
        reward_coins_min: 1000, reward_coins_max: 1800, reward_stats: { "min": "250000", "max": "350000" },
        drop_table: [],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "10000000-0000-0000-0000-000000000024", name: "Misja 24: Półfinały",
        description: "Główna arena! Twój przeciwnik używa nieczystych zagrań. Udowodnij, co znaczy harmonia ciała i umysłu.",
        stamina_cost: 95, req_stats: { "strength": "4000000", "speed": "4000000", "endurance": "4000000" },
        reward_coins_min: 2000, reward_coins_max: 3000, reward_stats: { "min": "500000", "max": "750000" },
        drop_table: [{ "item_id": ITEMS.KAPSULKA, "chance_pct": 3 }],
        is_repeatable: true, is_one_try: false
    },
    {
        id: "00000000-0000-0000-0000-000000000025", name: "Finał Turnieju (Jednorazowa)",
        description: "Finał! Przed tobą staje reinkarnacja Króla Demonów. Stawką jest los całego świata.",
        stamina_cost: 100, req_stats: { "strength": "6000000", "speed": "6000000", "endurance": "6000000" },
        reward_coins_min: 5000, reward_coins_max: 8000, reward_stats: { "min": "1500000", "max": "2500000" },
        drop_table: [{ "item_id": ITEMS.KROPLA, "chance_pct": 100 }],
        is_repeatable: false, is_one_try: true
    }
];

async function seedMissions() {
    try {
        console.log('🌱 Rozpoczynam aktualizację misji...');
        
        console.log('🧹 Czyszczenie starych misji...');
        const { error: deleteError } = await supabase.from('missions').delete().not('id', 'is', null);
        if (deleteError) throw deleteError;

    //    console.log('🔄 Resetowanie starych postępów graczy...');
    //    const { error: resetError } = await supabase.from('characters').update({ completed_missions: [] }).not('profile_id', 'is', null);
    //    if (resetError) throw resetError;
        
        console.log('📦 Wgrywanie nowych misji (upsert)...');
        const { data, error } = await supabase.from('missions').upsert(missionsData, { onConflict: 'id' }).select();
            
        if (error) throw error;
        
        console.log(`✅ Pomyślnie wgrano ${data.length} misji!`);
    } catch (err) {
        console.error('❌ Błąd podczas seedera:', err.message);
    }
    process.exit(0);
}

seedMissions();