require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixConsumables() {
    console.log('Rozpoczynanie poprawy efektów konsumpcji...');
    
    try {
        // Popraw efekt dla Mięso
        console.log('Aktualizowanie efektu dla: Mięso -> restore_hp: "50"');
        const { data: meatResult, error: meatError } = await supabase
            .from('item_templates')
            .update({ consumable_effect: { restore_hp: "50" } })
            .eq('name', 'Mięso');
        
        if (meatError) {
            console.error('Błąd podczas aktualizacji Mięso:', meatError);
        } else {
            console.log('✅ Pomyślnie zaktualizowano efekt dla: Mięso');
        }
        
        // Popraw efekt dla Jagody
        console.log('Aktualizowanie efektu dla: Jagody -> restore_mp: "30"');
        const { data: berriesResult, error: berriesError } = await supabase
            .from('item_templates')
            .update({ consumable_effect: { restore_mp: "30" } })
            .eq('name', 'Jagody');
        
        if (berriesError) {
            console.error('Błąd podczas aktualizacji Jagody:', berriesError);
        } else {
            console.log('✅ Pomyślnie zaktualizowano efekt dla: Jagody');
        }
        
        console.log('✅ Zakończono poprawę efektów konsumpcji!');
        
    } catch (error) {
        console.error('Błąd podczas poprawy efektów konsumpcji:', error);
    }
}

// Uruchomienie funkcji
fixConsumables();
