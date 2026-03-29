require('dotenv').config();
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Funkcje pomocnicze dla BigInt
const minBigInt = (a, b) => (a < b ? a : b);
const maxBigInt = (a, b) => (a > b ? a : b);

// ==========================================
// BUFOR RAM - GLOBALNY STAN SERWERA
// ==========================================
// Przechowujemy stan gry w pamięci Node.js, by chronić limity Supabase
let globalServerState = null;

// Funkcja pobierająca początkowy stan z bazy przy starcie serwera
async function initGlobalState() {
  try {
    const { data, error } = await supabase
      .from('global_server_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;
    globalServerState = data;
    console.log(`[Zegar DC] Stan serwera załadowany do RAM. Obecny Dzień DC: ${globalServerState.current_dc_day}`);
    
    // Uruchomienie nasłuchiwania na zmiany w bazie (WebSockets)
    subscribeToGlobalStateChanges();
  } catch (err) {
    console.error('Krytyczny błąd pobierania globalnego stanu:', err.message);
  }
}

// Funkcja nasłuchująca na zmiany w tabeli za pomocą Supabase Realtime
function subscribeToGlobalStateChanges() {
  supabase
    .channel('global_state_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'global_server_state', filter: 'id=eq.1' },
      (payload) => {
        // Aktualizacja zmiennej w pamięci RAM nowymi danymi z bazy
        globalServerState = payload.new;
        console.log(`[Zegar DC] Wykryto zmianę! Zaktualizowano bufor RAM. Nowy Dzień DC: ${globalServerState.current_dc_day}`);
        console.log(`[Zegar DC] Przerwa techniczna (Maintenance): ${globalServerState.is_maintenance}`);
      }
    )
    .subscribe();
}

// ==========================================
// ENDPOINTY API
// ==========================================

// Middleware (Bezpiecznik) sprawdzający przerwę techniczną przed każdą akcją
// Ten kod uruchomi się zanim jakiekolwiek zapytanie trafi do właściwej logiki
app.use((req, res, next) => {
  if (!globalServerState) {
    return res.status(503).json({ error: 'Serwer się uruchamia, spróbuj ponownie za chwilę.' });
  }
  
  if (globalServerState.is_maintenance) {
    // Twarda blokada akcji podczas 60-sekundowego okienka o północy DC
    return res.status(503).json({ error: 'Trwa zmiana dnia DC (Przerwa techniczna). Gra zablokowana na chwilę.' });
  }
  
  next(); // Przekaż żądanie dalej, jeśli nie ma przerwy
});

// Nasz nowy testowy endpoint sprawdzający, co serwer trzyma w RAM
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    ram_buffer: globalServerState
  });
});


// ==========================================
// SYSTEM AUTORYZACJI I KONT
// ==========================================

// Middleware do weryfikacji tokenu JWT
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ error: 'Brak tokenu autoryzacyjnego' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(403).json({ error: 'Nieprawidłowy lub wygasły token' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Błąd weryfikacji tokenu:', err.message);
    return res.status(403).json({ error: 'Błąd weryfikacji tokenu' });
  }
}

// Funkcja pomocnicza do konwersji BigInt na String dla JSON
function bigIntReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

// Rejestracja nowego gracza
app.post('/api/auth/register', async (req, res) => {
  const { email, password, username, gender } = req.body;

  try {
    // 1. Rejestracja w systemie Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    const userId = authData.user.id;

    // 2. Utworzenie trwałego profilu gracza
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{ id: userId, username, gender }]);

    if (profileError) {
      // Jeśli nick jest zajęty, Supabase wyrzuci błąd (dzięki regule UNIQUE)
      throw new Error('Nie udało się utworzyć profilu. Nick może być już zajęty.');
    }

    // 3. Utworzenie sezonowej postaci gracza (Wartości 100 HP/MP dodadzą się same przez DEFAULT z bazy)
    const { error: charError } = await supabase
      .from('characters')
      .insert([{ profile_id: userId }]);

    if (charError) throw charError;

    res.json({ status: 'success', message: 'Konto utworzone pomyślnie!' });
  } catch (err) {
    console.error('[Auth] Błąd rejestracji:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// Logowanie gracza
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Odsyłamy token sesji do klienta
    res.json({ 
      status: 'success', 
      token: data.session.access_token,
      user: data.user
    });
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Nieprawidłowy email lub hasło.' });
  }
});

// Endpoint pobierający dane postaci gracza
app.get('/api/character', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Pobranie danych profilu i postaci
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Nie znaleziono profilu gracza' });
    }

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Konwersja stringów na BigInt dla obliczeń
    const strength = BigInt(character.strength || '1');
    const speed = BigInt(character.speed || '1');
    const endurance = BigInt(character.endurance || '1');
    const intelligence = BigInt(character.intelligence || '1');
    const mental_strength = BigInt(character.mental_strength || '1');
    const bonus_hp = BigInt(character.bonus_hp || '0');
    const bonus_mp = BigInt(character.bonus_mp || '0');
    const bonus_stamina = BigInt(character.bonus_stamina || '0');

    // Obliczenia Max HP/MP/Stamina (Balans: +1 Max HP za każde 20 pkt Siły)
    const max_hp = 100n + (strength / 20n) + bonus_hp;
    const max_mp = 100n + (intelligence / 5n) + bonus_mp;
    const max_stamina = 100n + bonus_stamina;

    // ==========================================
    // LENIWA EWALUACJA (LAZY EVALUATION) - ZUNIFIKOWANY TICK 60s
    // ==========================================
    // KRYTYCZNE: Inteligentny parser stref czasowych.
    const ensureUTC = (dateVal) => {
        if (!dateVal || dateVal === 'null' || dateVal === 'undefined') return null;
        const str = String(dateVal).trim();
        
        // Jeśli string z bazy ma już przypisaną strefę (np. Z, +00:00, lub -05:00 po literze T)
        if (str.endsWith('Z') || str.includes('+') || (str.includes('T') && str.indexOf('-', str.indexOf('T')) !== -1)) {
            return str; 
        }
        
        // Doklejamy Z tylko do "gołych" dat, które baza ucięła
        return str + 'Z';
    };

    const lastCalcStr = ensureUTC(character.last_calculation_time);
    
    // PANCERNY ODCZYT CZASU SZPITALNEGO (Bezpośrednio z bezpiecznego formatu JSONB)
    let exactHospitalEndTime = null;
    if (character.last_death_penalty && character.last_death_penalty.hospital_end_ms) {
        exactHospitalEndTime = Number(character.last_death_penalty.hospital_end_ms);
    } else if (character.hospital_until) {
        // Fallback dla bardzo starych zapisów
        exactHospitalEndTime = new Date(ensureUTC(character.hospital_until)).getTime();
    }

    const now = Date.now();
    let effectiveLastCalcTime = now;
    
    // Walidacja timestampu z bazy
    if (lastCalcStr) {
        const parsedTime = new Date(lastCalcStr).getTime();
        if (!isNaN(parsedTime)) {
            effectiveLastCalcTime = parsedTime;
        }
    }
    
    // ==========================================
    // POPRAWIONA LOGIKA WYJŚCIA - ZERO OPÓŹNIEŃ
    // ==========================================
    let isHospitalized = false;
    let hospitalExitTime = null;
    
    if (BigInt(character.hp ?? '100') <= 0n) {
        if (exactHospitalEndTime && !isNaN(exactHospitalEndTime)) {
            // Dodajemy 500ms marginesu, aby wyjście było płynne dla frontendu
            if (now + 500 < exactHospitalEndTime) {
                isHospitalized = true;
                effectiveLastCalcTime = now; 
            } else {
                // CZAS MINĄŁ - Wychodzisz natychmiast
                isHospitalized = false;
                hospitalExitTime = exactHospitalEndTime;
                effectiveLastCalcTime = exactHospitalEndTime; 
            }
        } else {
            isHospitalized = true;
            effectiveLastCalcTime = now;
        }
    }

    let elapsedMs = now - effectiveLastCalcTime;
    if (isNaN(elapsedMs) || elapsedMs < 0) elapsedMs = 0;
    
    const consumedMs = elapsedMs - (elapsedMs % 60000); 
    let remainderMs = elapsedMs % 60000; 
    if (isNaN(remainderMs)) remainderMs = 0;
    
    const ticks60s = BigInt(Math.floor(consumedMs / 60000));
    
    // Przesuwamy nowy punkt zapisu w przeszłość o niewykorzystane milisekundy. Samo-naprawa zepsutego konta.
    const newCalcTimeUTC = new Date(now - remainderMs).toISOString(); 
    
    let current_stamina = BigInt(character.stamina ?? '100');
    let current_hp = BigInt(character.hp ?? '100');
    let current_mp = BigInt(character.mp ?? '100');
    let dbUpdateNeeded = false;

    // ==========================================
    // 1. NATYCHMIASTOWY WYPIS ZE SZPITALA (Niezależny od 60s ticków)
    // ==========================================
    if (hospitalExitTime && current_hp <= 0n) {
        const initialHp = (max_hp * 10n) / 100n; // 10% Max HP
        current_hp = maxBigInt(initialHp, current_hp);
        dbUpdateNeeded = true;
    }

    // ==========================================
    // 2. PASYWNA REGENERACJA (Zależna od 60s ticków)
    // ==========================================
    if (ticks60s > 0n || !character.last_calculation_time) {
      if (isHospitalized) {
        // GRACZ W SZPITALU - Całkowita blokada regeneracji
        dbUpdateNeeded = false;
      } else {
        // GRACZ ZDROWY (LUB WŁAŚNIE WYSZEDŁ) - Pełna regeneracja za obliczony czas
        const staminaGain = ticks60s * 1n;
        const enduranceBonus = BigInt(Math.floor(Math.sqrt(Number(endurance)) / 10));
        const hpGain = ticks60s * (1n + enduranceBonus);
        const mentalBonus = BigInt(Math.floor(Math.sqrt(Number(mental_strength)) / 5));
        const mpGain = ticks60s * (2n + mentalBonus);

        current_stamina = minBigInt(max_stamina, current_stamina + staminaGain);
        current_hp = minBigInt(max_hp, current_hp + hpGain);
        current_mp = minBigInt(max_mp, current_mp + mpGain);
        
        dbUpdateNeeded = true;
      }
    }

    if (dbUpdateNeeded) {
      await supabase
        .from('characters')
        .update({ 
          stamina: current_stamina.toString(),
          hp: current_hp.toString(),
          mp: current_mp.toString(),
          last_calculation_time: newCalcTimeUTC // Czyste UTC
        })
        .eq('profile_id', userId);
    }

    // Obliczenie całkowitego Poziomu Mocy (Eliminacja podwójnego liczenia statystyk)
    const stats_sum = strength + speed + endurance + intelligence + mental_strength;
    
    // Zliczamy WYŁĄCZNIE trwałe bonusy z rzadkich eliksirów (ignorując bazowe zasoby i pasywny ekwipunek).
    // Wagi balansu: 1 HP = 1 PL, 1 MP = 2 PL (elitarne obrażenia), 1 Stamina = 5 PL.
    const powerLevel = stats_sum + bonus_hp + (bonus_mp * 2n) + (bonus_stamina * 5n);

    // Przygotowanie obiektu odpowiedzi z poprawnymi kluczami!
    const characterData = {
      username: profile.username,
      power_level: powerLevel.toString(),
      coins: character.coins ?? '0',
      current_form: character.current_form ?? 'Stan Podstawowy',
      
      current_hp: current_hp.toString(),
      current_mp: current_mp.toString(),
      current_stamina: current_stamina.toString(), 
      
      max_hp: max_hp.toString(),
      max_mp: max_mp.toString(),
      max_stamina: max_stamina.toString(),
      
      stats: {
        strength: character.strength || '1',
        speed: character.speed || '1',
        endurance: character.endurance || '1',
        intelligence: character.intelligence || '1',
        mental_strength: character.mental_strength || '1'
      },
      
      completed_missions: character.completed_missions || [],
      // Zawsze wysyłamy na frontend twardy i poprawny czas wygenerowany z absolutnych milisekund:
      hospital_until: exactHospitalEndTime ? new Date(exactHospitalEndTime).toISOString() : ensureUTC(character.hospital_until)
    };

    // Wysłanie odpowiedzi z konwersją BigInt na String
    res.json(JSON.parse(JSON.stringify(characterData, bigIntReplacer)));

  } catch (err) {
    console.error('[Character] Błąd pobierania danych postaci:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania danych postaci' });
  }
});

// Endpoint pobierający misje
app.get('/api/missions', authenticateToken, async (req, res) => {
  try {
    // Pobierz wszystkie misje posortowane po koszcie staminy
    const { data: missions, error } = await supabase
      .from('missions')
      .select('*')
      .order('stamina_cost', { ascending: true });

    if (error) {
      console.error('[Missions] Błąd pobierania misji:', error.message);
      return res.status(500).json({ error: 'Błąd serwera podczas pobierania misji' });
    }

    res.json(missions || []);
  } catch (err) {
    console.error('[Missions] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania misji' });
  }
});

// Endpoint pobierający ekwipunek gracza
app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Pobierz dane postaci aby uzyskać character_id
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Pobierz przedmioty z inventory z relacją do item_templates
    const { data: inventory, error: inventoryError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('character_id', character.id);

    if (inventoryError) {
      console.error('[Inventory] Błąd pobierania ekwipunku:', inventoryError.message);
      return res.status(500).json({ error: 'Błąd serwera podczas pobierania ekwipunku' });
    }

    res.json(inventory || []);
  } catch (err) {
    console.error('[Inventory] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania ekwipunku' });
  }
});

// Endpoint zamiany przedmiotów w ekwipunku
app.post('/api/inventory/swap', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id_1, slot_target } = req.body;

    if (!item_id_1 || !slot_target) {
      return res.status(400).json({ error: 'Brak wymaganych parametrów: item_id_1, slot_target' });
    }

    // Pobierz dane postaci
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Pobierz przeciągany przedmiot z relacją do szablonu
    const { data: draggedItem, error: draggedError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('id', item_id_1)
      .eq('character_id', character.id)
      .single();

    if (draggedError || !draggedItem) {
      return res.status(404).json({ error: 'Nie znaleziono przedmiotu' });
    }

    // Sprawdź wymagania statystyk dla sprzętu (tylko przy zakładaniu, nie przy zdejmowaniu)
    if (draggedItem.item_templates.category === 'equipment' && draggedItem.item_templates.req_stats && slot_target !== 'backpack') {
      for (const [stat, requiredValue] of Object.entries(draggedItem.item_templates.req_stats)) {
        const playerStat = BigInt(character[stat] || '1');
        const requiredStat = BigInt(requiredValue);
        
        if (playerStat < requiredStat) {
          const statNames = {
            'strength': 'Siła',
            'speed': 'Szybkość',
            'endurance': 'Wytrzymałość',
            'intelligence': 'Inteligencja',
            'mental_strength': 'Siła Mentalna'
          };
          
          return res.status(400).json({ 
            error: `Nie spełniasz wymagań! Wymagana ${statNames[stat] || stat}: ${requiredValue}` 
          });
        }
      }
    }

    // Rozpocznij transakcję
    const { data: swapResult, error: swapError } = await supabase.rpc('swap_items', {
      p_character_id: character.id,
      p_item_id_1: item_id_1,
      p_slot_target: slot_target
    });

    if (swapError) {
      console.error('[Inventory] Błąd zamiany przedmiotów:', swapError);
      return res.status(500).json({ error: 'Błąd podczas zamiany przedmiotów' });
    }

    // Po zamianie - przelicz Max HP/MP gracza (Truncation Bug fix)
    const { data: updatedInventory, error: inventoryError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('character_id', character.id)
      .eq('equipped_slot', 'IS NOT', null);

    if (inventoryError) {
      console.error('[Inventory] Błąd pobierania ekwipunku po zamianie:', inventoryError);
    }

    // Oblicz nowe bonusy z założonego sprzętu
    let newBonusHp = 0n;
    let newBonusMp = 0n;
    let newBonusStamina = 0n;

    if (updatedInventory) {
      for (const item of updatedInventory) {
        if (item.item_templates && item.item_templates.bonuses) {
          if (item.item_templates.bonuses.bonus_hp) {
            newBonusHp += BigInt(item.item_templates.bonuses.bonus_hp);
          }
          if (item.item_templates.bonuses.bonus_mp) {
            newBonusMp += BigInt(item.item_templates.bonuses.bonus_mp);
          }
          if (item.item_templates.bonuses.bonus_stamina) {
            newBonusStamina += BigInt(item.item_templates.bonuses.bonus_stamina);
          }
        }
      }
    }

    // Oblicz nowe maksymalne wartości
    const currentStr = BigInt(character.strength || '1');
    const currentInt = BigInt(character.intelligence || '1');
    const currentEnd = BigInt(character.endurance || '1');
    
    const newMaxHp = 100n + (currentStr / 20n) + newBonusHp;
    const newMaxMp = 100n + (currentInt / 5n) + newBonusMp;
    const newMaxStamina = 100n + newBonusStamina;

    // Zabezpieczenie przed Truncation Bug - obetnij aktualne wartości jeśli przekraczają nowe maksimum
    const currentHp = BigInt(character.hp || '100');
    const currentMp = BigInt(character.mp || '100');
    const currentStamina = BigInt(character.stamina || '100');

    const finalHp = currentHp > newMaxHp ? newMaxHp : currentHp;
    const finalMp = currentMp > newMaxMp ? newMaxMp : currentMp;
    const finalStamina = currentStamina > newMaxStamina ? newMaxStamina : currentStamina;

    // Zaktualizuj postać z nowymi maksymalnymi wartościami
    const { error: updateError } = await supabase
      .from('characters')
      .update({
        hp: finalHp.toString(),
        mp: finalMp.toString(),
        stamina: finalStamina.toString()
      })
      .eq('id', character.id);

    if (updateError) {
      console.error('[Inventory] Błąd aktualizacji postaci po zamianie:', updateError);
    }

    res.json({ 
      success: true, 
      message: 'Przedmioty zostały zamienione',
      character_updates: {
        hp: finalHp.toString(),
        mp: finalMp.toString(),
        stamina: finalStamina.toString()
      }
    });

  } catch (err) {
    console.error('[Inventory] Błąd endpointu swap:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas zamiany przedmiotów' });
  }
});

// Endpoint konsumpcji przedmiotów
app.post('/api/inventory/consume', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id } = req.body;

    if (!inventory_id) {
      return res.status(400).json({ error: 'Brak wymaganego parametru: inventory_id' });
    }

    // Pobierz dane postaci
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Pobierz przedmiot z relacją do szablonu
    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Nie znaleziono przedmiotu' });
    }

    // Sprawdź czy przedmiot jest używalny
    if (item.item_templates.category !== 'consumable' && item.item_templates.category !== 'special_consumable') {
      return res.status(400).json({ error: 'Ten przedmiot nie jest używalny!' });
    }

    // Sprawdź czy przedmiot nie jest założony
    if (item.equipped_slot !== null) {
      return res.status(400).json({ error: 'Zdejmij przedmiot przed użyciem!' });
    }

    // Oblicz obecne maksymalne zasoby
    const currentStr = BigInt(character.strength || '1');
    const currentInt = BigInt(character.intelligence || '1');
    const currentEnd = BigInt(character.endurance || '1');
    const currentBonusStamina = BigInt(character.bonus_stamina || '0');
    
    const maxHp = 100n + (currentStr / 20n);
    const maxMp = 100n + (currentInt / 5n);
    const maxStamina = 100n + currentBonusStamina;

    // Pobierz obecne zasoby
    let currentHp = BigInt(character.hp || '100');
    let currentMp = BigInt(character.mp || '100');
    let currentStamina = BigInt(character.stamina || '100');
    let newBonusStamina = currentBonusStamina;

    // Przetwarzaj efekty konsumpcji
    const effects = item.item_templates.consumable_effect;
    if (!effects) {
      return res.status(400).json({ error: 'Przedmiot nie ma zdefiniowanych efektów!' });
    }

    let effectMessages = [];

    for (const [effect, value] of Object.entries(effects)) {
      if (effect === 'restore_hp') {
        const healAmount = BigInt(value);
        currentHp = minBigInt(maxHp, currentHp + healAmount);
        effectMessages.push(`+${value} HP`);
      } else if (effect === 'restore_mp') {
        const manaAmount = BigInt(value);
        currentMp = minBigInt(maxMp, currentMp + manaAmount);
        effectMessages.push(`+${value} MP`);
      } else if (effect === 'restore_stamina') {
        const staminaAmount = BigInt(value);
        currentStamina = minBigInt(maxStamina, currentStamina + staminaAmount);
        effectMessages.push(`+${value} Staminy`);
      } else if (effect === 'restore_hp_pct') {
        const healPercent = BigInt(value);
        const healAmount = (maxHp * healPercent) / 100n;
        currentHp = minBigInt(maxHp, currentHp + healAmount);
        effectMessages.push(`+${value}% HP`);
      } else if (effect === 'restore_mp_pct') {
        const manaPercent = BigInt(value);
        const manaAmount = (maxMp * manaPercent) / 100n;
        currentMp = minBigInt(maxMp, currentMp + manaAmount);
        effectMessages.push(`+${value}% MP`);
      } else if (effect === 'restore_stamina_pct') {
        const staminaPercent = BigInt(value);
        const staminaAmount = (maxStamina * staminaPercent) / 100n;
        currentStamina = minBigInt(maxStamina, currentStamina + staminaAmount);
        effectMessages.push(`+${value}% Staminy`);
      } else if (effect === 'bonus_stamina') {
        const bonusAmount = BigInt(value);
        newBonusStamina = currentBonusStamina + bonusAmount;
        
        // Twarda blokada: Limit 900 na bonus_stamina
        if (newBonusStamina > 900n) {
          return res.status(400).json({ error: 'Osiągnięto maksymalny limit bonusu staminy (900)!' });
        }
        effectMessages.push(`+${value} Max Staminy`);
      } else if (effect === 'zenkai_resurrection' && value === 'true') {
        // Logika wskrzeszenia z szpitala
        if (BigInt(character.hp || '0') <= 0n) {
          const initialHp = (maxHp * 10n) / 100n; // 10% Max HP
          currentHp = maxBigInt(initialHp, currentHp);
          effectMessages.push('Wskrzeszenie Zenkai!');
        } else {
          return res.status(400).json({ error: 'Fasolka Zenkai działa tylko w szpitalu!' });
        }
      } else if (effect === 'restore_hp' && value === 'full') {
        currentHp = maxHp;
        effectMessages.push('Pełne odzyskanie HP');
      } else if (effect === 'restore_mp' && value === 'full') {
        currentMp = maxMp;
        effectMessages.push('Pełne odzyskanie MP');
      } else if (effect === 'restore_stamina' && value === 'full') {
        currentStamina = maxStamina;
        effectMessages.push('Pełne odzyskanie Staminy');
      } else if (effect === 'permanent_bonus') {
        // Trwały bonus statystyk - specjalne przedmioty
        const updateData = {};
        for (const [stat, statValue] of Object.entries(value)) {
          const currentStat = BigInt(character[stat] || '1');
          const newStat = currentStat + BigInt(statValue);
          updateData[stat] = newStat.toString();
          effectMessages.push(`+${statValue} ${stat}`);
        }
        
        const { error: statUpdateError } = await supabase
          .from('characters')
          .update(updateData)
          .eq('id', character.id);

        if (statUpdateError) {
          console.error('[Consume] Błąd aktualizacji statystyk:', statUpdateError);
          return res.status(500).json({ error: 'Błąd podczas aktualizacji statystyk' });
        }
      } else if (effect === 'temporary_buff') {
        // Tymczasowe buffy - na razie tylko logowanie
        effectMessages.push('Tymczasowy błogosławieństwo');
      } else if (effect === 'unlock_transformation') {
        // Odblokowanie transformacji - na razie tylko logowanie
        effectMessages.push('Odblokowano transformację');
      }
    }

    // Ochrona "Overheal" - sprawdź czy przedmiot cokolwiek zmieni
    const originalHp = BigInt(character.hp || '100');
    const originalMp = BigInt(character.mp || '100');
    const originalStamina = BigInt(character.stamina || '100');
    const originalBonusStamina = BigInt(character.bonus_stamina || '0');
    
    // Sprawdź czy przedmiot ma jakiekolwiek trwałe efekty (bonusy statystyk)
    const hasPermanentEffects = effects.permanent_bonus || effects.bonus_stamina || 
                               (effects.zenkai_resurrection === 'true' && originalHp <= 0n);
    
    // Jeśli zasoby nie zmieniły się i nie ma trwałych efektów, zablokuj akcję
    if (currentHp === originalHp && 
        currentMp === originalMp && 
        currentStamina === originalStamina && 
        newBonusStamina === originalBonusStamina && 
        !hasPermanentEffects) {
      return res.status(400).json({ 
        status: 'warning', 
        message: 'Twoje zasoby są już pełne! Szkoda marnować przedmiotu.' 
      });
    }

    // Atomowe usuwanie/zmniejszanie ilości przedmiotu
    if (Number(item.quantity) > 1) {
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: item.quantity - 1 })
        .eq('id', inventory_id);

      if (updateError) {
        console.error('[Consume] Błąd aktualizacji ilości:', updateError);
        return res.status(500).json({ error: 'Błąd podczas aktualizacji ilości przedmiotu' });
      }
    } else {
      const { error: deleteError } = await supabase
        .from('inventory')
        .delete()
        .eq('id', inventory_id);

      if (deleteError) {
        console.error('[Consume] Błąd usuwania przedmiotu:', deleteError);
        return res.status(500).json({ error: 'Błąd podczas usuwania przedmiotu' });
      }
    }

    // Zaktualizuj postać z nowymi wartościami
    const { error: updateError } = await supabase
      .from('characters')
      .update({
        hp: currentHp.toString(),
        mp: currentMp.toString(),
        stamina: currentStamina.toString(),
        bonus_stamina: newBonusStamina.toString()
      })
      .eq('id', character.id);

    if (updateError) {
      console.error('[Consume] Błąd aktualizacji postaci:', updateError);
      return res.status(500).json({ error: 'Błąd podczas aktualizacji postaci' });
    }

    res.json({ 
      success: true, 
      message: `Użyto ${item.item_templates.name}! ${effectMessages.join(', ')}`,
      effects: effectMessages,
      character_updates: {
        hp: currentHp.toString(),
        mp: currentMp.toString(),
        stamina: currentStamina.toString(),
        bonus_stamina: newBonusStamina.toString()
      }
    });

  } catch (err) {
app.post('/api/debug/give-items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Pobierz dane postaci aby uzyskać character_id
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Pobierz wszystkie przedmioty z bazy
    const { data: allItems, error: itemsError } = await supabase
      .from('item_templates')
      .select('*');

    if (itemsError || !allItems) {
      return res.status(500).json({ error: 'Błąd pobierania przedmiotów z bazy' });
    }

    // Podziel przedmioty na 3 pule
    const usableItems = allItems.filter(item => 
      item.category === 'consumable' || item.category === 'special_consumable'
    );

    const trainingItems = allItems.filter(item => 
      item.category === 'equipment' && 
      (item.name.includes('Ciężk') || item.name.includes('Obciążon'))
    );

    const passiveItems = allItems.filter(item => 
      item.category === 'equipment' && 
      !item.name.includes('Ciężk') && 
      !item.name.includes('Obciążon')
    );

    // Wylosuj po 1 przedmiocie z każdej puli
    const getRandomItem = (array) => {
      if (array.length === 0) return null;
      return array[Math.floor(Math.random() * array.length)];
    };

    const selectedItems = [];
    
    const usableItem = getRandomItem(usableItems);
    const trainingItem = getRandomItem(trainingItems);
    const passiveItem = getRandomItem(passiveItems);

    if (usableItem) {
      selectedItems.push({
        template: usableItem,
        quantity: Math.floor(Math.random() * 5) + 1 // 1-5 sztuk
      });
    }

    if (trainingItem) {
      selectedItems.push({
        template: trainingItem,
        quantity: 1 // Sprzęt zawsze 1 sztuka
      });
    }

    if (passiveItem) {
      selectedItems.push({
        template: passiveItem,
        quantity: 1 // Sprzęt zawsze 1 sztuka
      });
    }

    // Dodaj wylosowane przedmioty do ekwipunku gracza
    for (const { template, quantity } of selectedItems) {
      // Sprawdź czy gracz już ma taki przedmiot (dla stackowania)
      const { data: existingItem, error: existingError } = await supabase
        .from('inventory')
        .select('*')
        .eq('character_id', character.id)
        .eq('item_template_id', template.id)
        .eq('equipped_slot', null) // Tylko przedmioty w plecaku mogą się stackować
        .single();

      if (existingError && existingError.code !== 'PGRST116') { // PGRST116 = nie znaleziono
        console.error(`[Debug] Błąd sprawdzania istniejącego przedmiotu:`, existingError);
        continue;
      }

      if (existingItem && (template.category === 'consumable' || template.category === 'special_consumable')) {
        // Gracz już ma ten przedmiot używalny - zaktualizuj ilość
        const newQuantity = Number(existingItem.quantity) + quantity;
        const { error: updateError } = await supabase
          .from('inventory')
          .update({ quantity: newQuantity })
          .eq('id', existingItem.id);

        if (updateError) {
          console.error(`[Debug] Błąd aktualizacji ilości przedmiotu ${template.name}:`, updateError);
        } else {
          console.log(`[Debug] Zaktualizowano ilość ${template.name}: ${existingItem.quantity} → ${newQuantity}`);
        }
      } else {
        // Nowy przedmiot - dodaj do bazy
        const { error: insertError } = await supabase
          .from('inventory')
          .insert({
            character_id: character.id,
            item_template_id: template.id,
            quantity: quantity,
            equipped_slot: null
          });

        if (insertError) {
          console.error(`[Debug] Błąd dodawania przedmiotu ${template.name}:`, insertError);
        } else {
          console.log(`[Debug] Dodano nowy przedmiot: ${template.name} (ID: ${template.id})`);
        }
      }
    }

    const itemNames = selectedItems.map(({ template, quantity }) => 
      `${template.name} x${quantity}`
    ).join(', ');

    res.json({ 
      status: 'success', 
      message: `Otrzymano losowe przedmioty: ${itemNames}`,
      items_given: selectedItems.length,
      items: selectedItems.map(({ template, quantity }) => ({
        name: template.name,
        category: template.category,
        quantity: quantity
      }))
    });

  } catch (err) {
    console.error('[Debug] Błąd losowania przedmiotów:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas losowania przedmiotów testowych' });
  }
});
    const { missionId } = req.body;
    const userId = req.user.id;

    // 1. POBRANIE DANYCH
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: 'Nie znaleziono misji' });
    }

    // Walidacje
    if (BigInt(character.hp || '0') <= 0n) {
      // Status 400 zapobiega wylogowaniu przez mechanizmy Auth na frontendzie
      return res.status(400).json({ status: 'error', message: 'KRYTYCZNE: Jesteś w Szpitalu! Nie możesz podjąć misji.' });
    }

    if (BigInt(character.stamina ?? '0') < BigInt(mission.stamina_cost)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Brak Staminy! Odpocznij lub użyj odpowiedniego przedmiotu.' 
      });
    }

    // 2. WYLICZENIE SZANSY I KARY (DIMINISHING RETURNS)
    let lowestRatioPercent = 500n;
    const reqStats = mission.req_stats ? mission.req_stats : {};

    ['strength', 'speed', 'endurance'].forEach(stat => {
      if (reqStats[stat] && reqStats[stat] > 0) {
        const playerStat = BigInt(character[stat] || '1');
        const reqStat = BigInt(reqStats[stat]);
        const ratio = (playerStat * 100n) / reqStat;
        lowestRatioPercent = minBigInt(lowestRatioPercent, ratio);
      }
    });

    const successChance = minBigInt(100n, lowestRatioPercent);

    // Modyfikator nagród
    let rewardMultiplier = 100n;
    if (lowestRatioPercent >= 400n && lowestRatioPercent < 800n) rewardMultiplier = 50n;
    if (lowestRatioPercent >= 800n) rewardMultiplier = 10n;

    // --- Ochrona Początkujących (Newbie Protection) ---
    // Jeśli jakakolwiek z bazowych statystyk gracza jest niższa niż 15 (wymóg Misji 2), 
    // całkowicie ignorujemy system kar, aby pozwolić mu płynnie dobić do kolejnego etapu.
    const currentStr = BigInt(character.strength || '1');
    const currentSpd = BigInt(character.speed || '1');
    const currentEnd = BigInt(character.endurance || '1');
    if (currentStr < 15n || currentSpd < 15n || currentEnd < 15n) {
        rewardMultiplier = 100n;
    }

    // Pobranie WSZYSTKICH statystyk i bonusów niezbędnych do wyliczenia Max HP/MP/Staminy w razie porażki
    const currentInt = BigInt(character.intelligence || '1');
    const currentMen = BigInt(character.mental_strength || '1');
    
    const bonusHp = BigInt(character.bonus_hp || '0');
    const bonusMp = BigInt(character.bonus_mp || '0');
    const bonusStamina = BigInt(character.bonus_stamina || '0');

    // 3. RZUT KOSTKĘ I KOSZT STAMINY
    let newStamina = BigInt(character.stamina || '0') - BigInt(mission.stamina_cost);
    const roll = Math.random() * 100;

    if (roll > Number(successChance)) {
      // ==========================================
      // FAZA 4.2: PORAŻKA, KARA ZA PYCHĘ I SZPITAL
      // ==========================================
      const maxHp = 100n + (currentStr / 20n) + bonusHp;
      const maxMp = 100n + (currentInt / 5n) + bonusMp;
      const maxStamina = 100n + bonusStamina;

      // Wzór na obrażenia: 5% + (100% - Szansa na Sukces)
      const damagePercent = 5n + (100n - successChance);

      // Obliczenie obrażeń (BigInt ucina ułamki, co jest tu pożądane)
      const hpDamage = (maxHp * damagePercent) / 100n;
      const mpDamage = (maxMp * damagePercent) / 100n;
      const staminaDamage = (maxStamina * damagePercent) / 100n;

      let newHp = BigInt(character.hp || '100') - hpDamage;
      let newMp = BigInt(character.mp || '100') - mpDamage;
      newStamina = newStamina - staminaDamage; // Dodatkowe obrażenia do staminy poza kosztem wejścia

      // Zabezpieczenie przed ujemnymi wartościami
      newHp = maxBigInt(0n, newHp);
      newMp = maxBigInt(0n, newMp);
      newStamina = maxBigInt(0n, newStamina);

      // CZY GRACZ ZGINĄŁ? (HP <= 0)
      if (newHp <= 0n) {
        // 1. Utrata 10% monet
        const currentCoins = BigInt(character.coins || '0');
        const coinsLost = (currentCoins * 10n) / 100n;
        const newCoins = currentCoins - coinsLost;

        // 2. Kara 2% do głównych statystyk
        const calcStatLoss = (stat, percent) => {
            if (stat <= 10n) return 0n; // Próg Minimalny: brak kar dla statystyk <= 10
            
            let loss = (stat * BigInt(percent)) / 100n;
            
            if (loss === 0n) return 1n; // Gwarantowane Minimum: jeśli > 10, ucina minimum 1 pkt
            return loss;
        };

        const strLoss = calcStatLoss(currentStr, 2);
        const spdLoss = calcStatLoss(currentSpd, 2);
        const endLoss = calcStatLoss(currentEnd, 2);
        const intLoss = calcStatLoss(currentInt, 2);
        const menLoss = calcStatLoss(currentMen, 2);

        const finalStr = maxBigInt(1n, currentStr - strLoss);
        const finalSpd = maxBigInt(1n, currentSpd - spdLoss);
        const finalEnd = maxBigInt(1n, currentEnd - endLoss);
        const finalInt = maxBigInt(1n, currentInt - intLoss);
        const finalMen = maxBigInt(1n, currentMen - menLoss);

        // 3. Wyliczenie Czasu Kary Szpitalnej z Bazowego Poziomu Mocy
        const statsSum = finalStr + finalSpd + finalEnd + finalInt + finalMen;
        const basePowerLevel = statsSum + bonusHp + (bonusMp * 2n) + (bonusStamina * 5n);
        
        // NOWY WZÓR NA SZPITAL: Czas kary w minutach RL
        const hospitalMinutes = Math.min(120, 5 + Math.floor(Math.pow(Number(basePowerLevel), 0.25)));
        
        // PANCERNY ZAPIS CZASU (Bypass dla bazy danych): Zapisujemy absolutne milisekundy
        const exactEndMs = Date.now() + hospitalMinutes * 60000;
        const hospitalUntilUTC = new Date(exactEndMs).toISOString();

        // Zapis utraconych statystyk jako STRING w JSONB, z dodaniem twardego czasu wyjścia
        const deathPenalty = {
            strength: strLoss.toString(),
            speed: spdLoss.toString(),
            endurance: endLoss.toString(),
            intelligence: intLoss.toString(),
            mental_strength: menLoss.toString(),
            hospital_end_ms: exactEndMs.toString() 
        };

        // 4. Zapis śmierci do Bazy Danych (Z Twardą Obsługą Błędów)
        const { error: deathUpdateError } = await supabase.from('characters').update({
            hp: '0',
            mp: '0', 
            stamina: newStamina.toString(),
            coins: newCoins.toString(),
            strength: finalStr.toString(),
            speed: finalSpd.toString(),
            endurance: finalEnd.toString(),
            intelligence: finalInt.toString(),
            mental_strength: finalMen.toString(),
            last_death_penalty: deathPenalty,
            hospital_until: hospitalUntilUTC, 
            current_form: 'Stan Podstawowy' 
        }).eq('profile_id', userId);

        // KRYTYCZNE: Jeśli baza odrzuci zapis (np. brak kolumny), wywalamy błąd na frontend!
        if (deathUpdateError) {
            console.error('[CRITICAL] Błąd zapisu śmierci do bazy:', deathUpdateError);
            return res.status(500).json({ 
                status: 'error', 
                message: `CICHY BŁĄD BAZY DANYCH: ${deathUpdateError.message}. Sprawdź, czy w tabeli 'characters' nie brakuje kolumn (np. last_death_penalty, current_form)!` 
            });
        }

        return res.json({
            result: 'death',
            message: `KRYTYCZNA PORAŻKA! Straciłeś przytomność! Trafiasz do Szpitala na ${hospitalMinutes} minut. Tracisz 10% Złotych Monet i 2% statystyk!`,
            penalty: {
                coins_lost: coinsLost.toString(),
                hospital_minutes: hospitalMinutes,
                stats_lost: deathPenalty,
                hospital_until: hospitalUntilUTC 
            }
        });

      } else {
        // ZWYKŁA PORAŻKA (Rany, ale gracz przeżył)
        
        // 1. Utrata 5% monet
        const currentCoins = BigInt(character.coins || '0');
        const coinsLost = (currentCoins * 5n) / 100n;
        const newCoins = currentCoins - coinsLost;
        
        // 2. Kara 1% do głównych statystyk
        const calcStatLoss = (stat, percent) => {
            if (stat <= 10n) return 0n; // Próg Minimalny: brak kar dla statystyk <= 10
            
            let loss = (stat * BigInt(percent)) / 100n;
            
            if (loss === 0n) return 1n; // Gwarantowane Minimum: jeśli > 10, ucina minimum 1 pkt
            return loss;
        };

        const strLoss = calcStatLoss(currentStr, 1);
        const spdLoss = calcStatLoss(currentSpd, 1);
        const endLoss = calcStatLoss(currentEnd, 1);
        const intLoss = calcStatLoss(currentInt, 1);
        const menLoss = calcStatLoss(currentMen, 1);

        const finalStr = maxBigInt(1n, currentStr - strLoss);
        const finalSpd = maxBigInt(1n, currentSpd - spdLoss);
        const finalEnd = maxBigInt(1n, currentEnd - endLoss);
        const finalInt = maxBigInt(1n, currentInt - intLoss);
        const finalMen = maxBigInt(1n, currentMen - menLoss);

        await supabase.from('characters').update({
            hp: newHp.toString(),
            mp: newMp.toString(),
            stamina: newStamina.toString(),
            coins: newCoins.toString(),
            strength: finalStr.toString(),
            speed: finalSpd.toString(),
            endurance: finalEnd.toString(),
            intelligence: finalInt.toString(),
            mental_strength: finalMen.toString()
        }).eq('profile_id', userId);

        return res.json({
            result: 'hurt',
            message: `PORAŻKA! Misja się nie powiodła. Otrzymałeś ${damagePercent}% obrażeń z Max zasobów (Kara za pychę).`,
            damage: {
                hp: hpDamage.toString(),
                mp: mpDamage.toString(),
                stamina: staminaDamage.toString()
            },
            penalty: {
                coins_lost: coinsLost.toString(),
                stats_lost: {
                    strength: strLoss.toString(),
                    speed: spdLoss.toString(),
                    endurance: endLoss.toString(),
                    intelligence: intLoss.toString(),
                    mental_strength: menLoss.toString()
                }
            }
        });
      }
    }

    // 4. JEŚLI SUKCES - NAGRODY
    // A) MONETY
    const minC = BigInt(mission.reward_coins_min || '0');
    const maxC = BigInt(mission.reward_coins_max || '0');
    const rolledC = minC + BigInt(Math.floor(Math.random() * Number(maxC - minC + 1n)));
    const finalCoins = (rolledC * rewardMultiplier) / 100n;
    const newCoins = BigInt(character.coins || '0') + finalCoins;

    // B) STATYSTYKI (ZASADA MODULO)
    const minS = BigInt(mission.reward_stats?.min || '0');
    const maxS = BigInt(mission.reward_stats?.max || '0');
    const rolledS = maxBigInt(1n, minS + BigInt(Math.floor(Math.random() * Number(maxS - minS + 1n))));
    const finalStats = maxBigInt(1n, (rolledS * rewardMultiplier) / 100n);

    // --- NOWY SYSTEM WYRÓWNYWANIA (RUBBERBAND / CATCH-UP) ---
    // 1. Zmienne currentStr, currentSpd, currentEnd zostały już zadeklarowane wyżej w sekcji pobierania.

    let lowestStat = 'strength';
    let minVal = currentStr;
    if (currentSpd < minVal) { lowestStat = 'speed'; minVal = currentSpd; }
    if (currentEnd < minVal) { lowestStat = 'endurance'; minVal = currentEnd; }

    let gainStr = 0n;
    let gainSpd = 0n;
    let gainEnd = 0n;

    if (finalStats < 10n) {
        // EARLY GAME FALLBACK: Wyrównywanie małych nagród
        const baseGain = finalStats / 3n;
        gainStr = baseGain;
        gainSpd = baseGain;
        gainEnd = baseGain;
        
        const localRem = Number(finalStats % 3n);
        if (localRem > 0) {
            let targets = [0, 1, 2].sort(() => 0.5 - Math.random());
            // Wymuś, by najsłabsza statystyka była ZAWSZE pierwsza w kolejce do nagrody
            if (lowestStat === 'strength') targets = [0, ...targets.filter(t => t !== 0)];
            else if (lowestStat === 'speed') targets = [1, ...targets.filter(t => t !== 1)];
            else targets = [2, ...targets.filter(t => t !== 2)];

            for (let i = 0; i < localRem; i++) {
                if (targets[i] === 0) gainStr += 1n;
                else if (targets[i] === 1) gainSpd += 1n;
                else if (targets[i] === 2) gainEnd += 1n;
            }
        }
    } else {
        // LATE GAME: Oszukana waga dla słabeusza
        // Najsłabsza statystyka dostaje sztywną wagę 100, reszta losuje 50-100
        const w1 = lowestStat === 'strength' ? 100 : Math.floor(Math.random() * 51) + 50;
        const w2 = lowestStat === 'speed' ? 100 : Math.floor(Math.random() * 51) + 50;
        const w3 = lowestStat === 'endurance' ? 100 : Math.floor(Math.random() * 51) + 50;
        const sumW = BigInt(w1 + w2 + w3);

        gainStr = (finalStats * BigInt(w1)) / sumW;
        gainSpd = (finalStats * BigInt(w2)) / sumW;
        gainEnd = (finalStats * BigInt(w3)) / sumW;
        
        const remainder = finalStats - (gainStr + gainSpd + gainEnd);
        // Reszta z uciętych ułamków BigInt ZAWSZE leci w najsłabszą statystykę
        if (lowestStat === 'strength') gainStr += remainder;
        else if (lowestStat === 'speed') gainSpd += remainder;
        else gainEnd += remainder;
    }

    // Aktualizacja statystyk
    const newStr = BigInt(character.strength || '1') + gainStr;
    const newSpd = BigInt(character.speed || '1') + gainSpd;
    const newEnd = BigInt(character.endurance || '1') + gainEnd;

    // 4.5. ZAPIS PROGRESU MISJI
    let completedMissions = character.completed_missions || [];
    if (!completedMissions.includes(missionId)) {
      completedMissions.push(missionId);
    }

    // 5. ZAPIS DO BAZY
    await supabase
      .from('characters')
      .update({
        coins: newCoins.toString(),
        strength: newStr.toString(),
        speed: newSpd.toString(),
        endurance: newEnd.toString(),
        stamina: newStamina.toString(),
        completed_missions: completedMissions
      })
      .eq('profile_id', userId);

    res.json({ 
      result: 'success', 
      message: 'Sukces!', 
      multiplier: Number(rewardMultiplier),
      rewards: { 
        coins: finalCoins.toString(), 
        stats_gained: finalStats.toString(),
        gains: {
          strength: gainStr.toString(),
          speed: gainSpd.toString(),
          endurance: gainEnd.toString()
        }
      }
    });

  } catch (err) {
    console.error('[Mission] Błąd podczas rozpoczynania misji:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas rozpoczynania misji' });
  }
}); // <--- DODAJ TĘ LINIJKĘ (ZAMKNIĘCIE ENDPOINTU)

// ENDPOINT TESTOWY: Magiczna Fasolka (Zenkai)
// ==========================================
app.post('/api/debug/zenkai', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: char, error: fetchError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (fetchError || !char) throw new Error('Nie znaleziono postaci');

    // Pobranie bieżących wartości
    const currentHp = BigInt(char.hp || '100');
    const currentMp = BigInt(char.mp || '100');
    const currentStamina = BigInt(char.stamina || '100');
    
    // Pobranie do obliczeń Maksów
    const currentStr = BigInt(char.strength || '1');
    const currentInt = BigInt(char.intelligence || '1');
    const bonusHp = BigInt(char.bonus_hp || '0');
    const bonusMp = BigInt(char.bonus_mp || '0');
    const bonusStamina = BigInt(char.bonus_stamina || '0');

    // Kalkulacja obecnych Maksów (przed ewentualnym dodaniem odzyskanych statystyk)
    const currentMaxHp = 100n + (currentStr / 20n) + bonusHp;
    const currentMaxMp = 100n + (currentInt / 5n) + bonusMp;
    const currentMaxStamina = 100n + bonusStamina;

    // Detekcja statusu kar i szpitala
    const deathPenaltyObj = char.last_death_penalty;
    const isHospitalized = char.hospital_until || (deathPenaltyObj && deathPenaltyObj.hospital_end_ms);

    // KRYTYCZNE ZABEZPIECZENIE: Zablokowanie fasolki, gdy jest bezużyteczna
    if (currentHp >= currentMaxHp && currentMp >= currentMaxMp && currentStamina >= currentMaxStamina && !isHospitalized && !deathPenaltyObj) {
        return res.status(400).json({ 
            status: 'warning', 
            message: 'Masz 100% zasobów i brak kar. Użycie Fasolki nic nie zmieni!' 
        });
    }

    if (!deathPenaltyObj) {
      // Przypadek: Gracz jest po prostu ranny lub zmęczony (brak kar za śmierć)
      // Odnawiamy tylko zasoby
      const { error: updateError } = await supabase
        .from('characters')
        .update({
          hp: currentMaxHp.toString(),
          mp: currentMaxMp.toString(),
          stamina: currentMaxStamina.toString(),
          hospital_until: null,
          last_calculation_time: new Date().toISOString()
        })
        .eq('profile_id', userId);

      if (updateError) throw updateError;
      return res.json({ 
        status: 'success', 
        message: 'Odnawiasz siły! Zasoby zregenerowane do 100%.' 
      });
    }

    // Przypadek: Gracz ma kary do odzyskania
    const strRecovery = BigInt(deathPenaltyObj.strength || '0');
    const spdRecovery = BigInt(deathPenaltyObj.speed || '0');
    const endRecovery = BigInt(deathPenaltyObj.endurance || '0');
    const intRecovery = BigInt(deathPenaltyObj.intelligence || '0');
    const menRecovery = BigInt(deathPenaltyObj.mental_strength || '0');

    // Dodaj odzyskane statystyki do aktualnych
    const currentSpd = BigInt(char.speed || '1');
    const currentEnd = BigInt(char.endurance || '1');
    const currentMen = BigInt(char.mental_strength || '1');

    const newStr = currentStr + strRecovery;
    const newSpd = currentSpd + spdRecovery;
    const newEnd = currentEnd + endRecovery;
    const newInt = currentInt + intRecovery;
    const newMen = currentMen + menRecovery;

    // Przelicz max_hp i max_mp na podstawie nowych statystyk
    const max_hp = 100n + (newStr / 20n) + bonusHp;
    const max_mp = 100n + (newInt / 5n) + bonusMp;
    const max_stamina = 100n + bonusStamina;

    // Zapisz do bazy
    const { error: finalUpdateError } = await supabase
      .from('characters')
      .update({
        hp: max_hp.toString(),
        mp: max_mp.toString(),
        stamina: max_stamina.toString(),
        strength: newStr.toString(),
        speed: newSpd.toString(),
        endurance: newEnd.toString(),
        intelligence: newInt.toString(),
        mental_strength: newMen.toString(),
        hospital_until: null,
        last_calculation_time: new Date().toISOString(),
        last_death_penalty: null
      })
      .eq('profile_id', userId);

    if (finalUpdateError) throw finalUpdateError;
    res.json({ 
      status: 'success', 
      message: 'Odzyskano utracone statystyki i odnowiono zasoby do 100%.',
      recovered: {
        strength: strRecovery.toString(),
        speed: spdRecovery.toString(),
        endurance: endRecovery.toString(),
        intelligence: intRecovery.toString(),
        mental_strength: menRecovery.toString(),
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// START SERWERA
// ==========================================
app.listen(port, async () => {
  console.log(`[Dojo-Clicker API] Serwer nasłuchuje na porcie ${port}...`);
  // Ładujemy stan do RAM od razu po włączeniu serwera
  await initGlobalState();
  // Tutaj dodajemy nowy kod
  console.log('[Dojo-Clicker API] Serwer wystartował pomyślnie!');
});

// ==========================================
// ZEGAR DC - AUTOMATYCZNA ZMIANA DNIA (CRON)
// ==========================================

// Funkcja symulująca opóźnienie (do Grace Period i Maintenance)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Skrypt uruchamia się równo co 8 godzin RL (o 00:00, 08:00 i 16:00)
cron.schedule('0 0,8,16 * * *', async () => {
  console.log('[Zegar DC] Wybiła Północ DC! Inicjacja procedury zmiany dnia...');

  try {
    // 1. Aktywacja Przerwy Technicznej w bazie (Zablokowanie API dla nowych akcji)
    await supabase.from('global_server_state').update({ is_maintenance: true }).eq('id', 1);
    console.log('[Zegar DC] Przerwa techniczna AKTYWNA. Nowe akcje są odrzucane.');

    // 2. Okienko tolerancji - Grace Period (30 sekund)
    // Pozwala na dokończenie akcji (np. Pracy), które gracze rozpoczęli tuż przed północą
    console.log('[Zegar DC] Oczekiwanie 30s (Grace Period)...');
    await delay(30000); 

    // 3. WŁAŚCIWY RESET (Podbicie dnia)
    const newDay = globalServerState.current_dc_day + 1;
    
    // Tutaj w przyszłości dodamy kod losujący Zadania Specjalne i rozdający Kapsułki Energii

    // Zapisujemy nowy dzień w bazie
    await supabase.from('global_server_state').update({ 
      current_dc_day: newDay 
    }).eq('id', 1);
    
    console.log(`[Zegar DC] Dzień zaktualizowany na: ${newDay}. Oczekiwanie na koniec okienka maintenance...`);

    // 4. Dopełnienie 60-sekundowego okienka maintenance (pozostało 30 sekund)
    await delay(30000);

    // 5. Zdjęcie Przerwy Technicznej (Odblokowanie gry)
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
    console.log('[Zegar DC] Przerwa techniczna ZAKOŃCZONA. Gra odblokowana!');

  } catch (error) {
    console.error('[Zegar DC] KRYTYCZNY BŁĄD podczas zmiany dnia:', error.message);
    // W razie błędu awaryjnie zdejmujemy blokadę, żeby nie popsuć gry na stałe
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
  }
});