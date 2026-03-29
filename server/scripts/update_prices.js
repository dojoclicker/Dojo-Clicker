require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Mapa cen przedmiotów w monetach
const priceMap = {
    // Używalne
    'Mięso': 50,
    'Jagody': 50,
    'Pieczony Dinozaur': 2500,
    'Magiczny Nektar': 2500,
    'Magiczna Fasolka': 50000,
    // Ekwipunek Zwykły
    'Podstawowe Gi': 1500,
    'Opaska Nowicjusza': 500,
    'Wygodne Spodnie': 1000,
    'Trampki': 800,
    'Rzemyk Harmonii': 20000,
    // Sprzęt Treningowy
    'Ciężka Skorupa': 5000,
    'Ciężka Opaska': 8000,
    'Bandaże Treningowe': 800,
    'Ciężkie Rękawice': 12000,
    'Ciężki Miecz': 20000,
    'Ciężkie Spodnie': 15000,
    'Obciążone Buty': 10000,
    // Biżuteria / End-game
    'Kolczyk Umysłu': 25000,
    'Pierścień Ducha': 30000,
    // Special Consumables
    'Święta Woda': 10000,
    'Kropla Krwi Smoka': 100000,
    'Łza Bogów': 250000,
    'Ziarno Formy Super': 500000,
    'Zwój Mocy Ki': 50000,
    'Zwój Szybkości': 50000
};

// Uwaga: Przedmioty takie jak 'Napój Sportowy' czy 'Kapsułka Energii' 
// celowo nie są tutaj wycenione (NULL), by można było je tylko zdobyć w grze.

async function updatePrices() {
    console.log('Rozpoczynanie aktualizacji cen przedmiotów...');
    
    try {
        for (const name of Object.keys(priceMap)) {
            const price = priceMap[name];
            
            console.log(`Aktualizowanie ceny dla: ${name} -> ${price} monet`);
            
            const { data, error } = await supabase
                .from('item_templates')
                .update({ buy_price_coins: price })
                .eq('name', name);
            
            if (error) {
                console.error(`Błąd podczas aktualizacji ${name}:`, error);
            } else {
                console.log(`✅ Pomyślnie zaktualizowano cenę dla: ${name}`);
            }
        }
        
        console.log('✅ Zakończono aktualizację cen wszystkich przedmiotów!');
        
    } catch (error) {
        console.error('Błąd podczas aktualizacji cen:', error);
    }
}

// Uruchomienie funkcji
updatePrices();
