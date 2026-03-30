require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const newStatsMap = {
    // Podstawowe / Lekkie
    'Podstawowe Gi': { "bonus_hp": "20", "endurance": "2" },
    'Opaska Nowicjusza': { "bonus_hp": "10" },
    'Bandaże Treningowe': { "strength": "2" },
    'Wygodne Spodnie': { "speed": "3", "bonus_stamina": "10" },
    'Trampki': { "speed": "5" },
    // Sprzęt Treningowy (Ciężki)
    'Ciężka Skorupa': { "bonus_hp": "50", "endurance": "15", "speed_penalty": "10" },
    'Ciężka Opaska': { "bonus_hp": "30", "endurance": "5" },
    'Ciężkie Rękawice': { "strength": "10", "speed_penalty": "5" },
    'Ciężki Miecz': { "strength": "20", "speed_penalty": "10" },
    'Ciężkie Spodnie': { "endurance": "10", "speed_penalty": "5" },
    'Obciążone Buty': { "endurance": "10", "speed_penalty": "5" },
    // Biżuteria
    'Kolczyk Umysłu': { "intelligence": "10", "mental_strength": "5", "bonus_mp": "20" },
    'Pierścień Ducha': { "mental_strength": "10", "intelligence": "5", "bonus_mp": "30" },
    'Rzemyk Harmonii': { "mental_strength": "8", "intelligence": "8" }
};

async function updateEquipmentStats() {
    console.log('Rozpoczynanie aktualizacji statystyk sprzętu...');
    
    try {
        for (const name of Object.keys(newStatsMap)) {
            console.log(`Aktualizowanie statystyk dla: ${name}`);
            
            const { data, error } = await supabase
                .from('item_templates')
                .update({ bonuses: newStatsMap[name] })
                .eq('name', name);
            
            if (error) {
                console.error(`Błąd podczas aktualizacji ${name}:`, error);
            } else {
                console.log(`✅ Pomyślnie zaktualizowano statystyki dla: ${name}`);
            }
        }
        
        console.log('✅ Zakończono aktualizację statystyk sprzętu!');
        
    } catch (error) {
        console.error('Błąd podczas aktualizacji statystyk sprzętu:', error);
    }
}

updateEquipmentStats();
