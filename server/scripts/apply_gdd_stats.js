require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const gddItems = {
    // Klatka
    'Podstawowe Gi': { req: { strength: "50", endurance: "50" }, bonuses: { type: "passive", bonus_hp: "100" } },
    'Ciężka Skorupa': { req: { endurance: "200", strength: "200" }, bonuses: { type: "training", bonus_hp: "1" } },
    // Głowa
    'Opaska Nowicjusza': { req: { strength: "50", endurance: "50" }, bonuses: { type: "passive", bonus_mp: "100" } },
    'Ciężka Opaska': { req: { endurance: "200", strength: "200" }, bonuses: { type: "training", bonus_mp: "1" } },
    // Dłonie
    'Bandaże Treningowe': { req: { strength: "50" }, bonuses: { type: "passive", strength: "50" } },
    'Ciężkie Rękawice': { req: { strength: "150" }, bonuses: { type: "training", strength: "10" } },
    'Ciężki Miecz': { req: { strength: "100" }, bonuses: { type: "training", strength: "20" } },
    // Nogi
    'Wygodne Spodnie': { req: { endurance: "50" }, bonuses: { type: "passive", endurance: "50" } },
    'Ciężkie Spodnie': { req: { endurance: "150" }, bonuses: { type: "training", endurance: "10" } },
    // Stopy
    'Trampki': { req: { speed: "40" }, bonuses: { type: "passive", speed: "40" } },
    'Obciążone Buty': { req: { speed: "150" }, bonuses: { type: "training", speed: "10" } },
    // Biżuteria
    'Kolczyk Umysłu': { req: { intelligence: "400" }, bonuses: { type: "passive", intelligence: "400" } },
    'Pierścień Ducha': { req: { mental_strength: "400" }, bonuses: { type: "passive", mental_strength: "400" } },
    'Rzemyk Harmonii': { req: { intelligence: "400", mental_strength: "400" }, bonuses: { type: "passive", intelligence: "400", mental_strength: "400" } }
};

async function applyGDD() {
    console.log('Rozpoczynam synchronizację z GDD...');
    for (const [name, data] of Object.entries(gddItems)) {
        const { error } = await supabase.from('item_templates')
            .update({ req_stats: data.req, bonuses: data.bonuses }).eq('name', name);
        if (error) console.error(`Błąd dla ${name}:`, error.message);
        else console.log(`✅ Zaktualizowano: ${name}`);
    }
    console.log('Zakończono synchronizację!');
}
applyGDD();
