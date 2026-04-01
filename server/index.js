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
// SILNIK STATYSTYK ZE SPRZĘTU - FAZA 1
// ==========================================

// Reużywalna funkcja pobierająca pełne statystyki postaci z bonusami z ekwipunku
async function getFullCharacterStats(userId) {
  try {
    // 1. Pobierz profil i postać gracza
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('Nie znaleziono profilu gracza');
    }

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      throw new Error('Nie znaleziono postaci gracza');
    }

    // 2. Pobierz założony ekwipunek
    const { data: equippedItems, error: equipmentError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('character_id', character.id)
      .not('equipped_slot', 'is', null);

    if (equipmentError) {
      console.error('[Stats] Błąd pobierania ekwipunku:', equipmentError);
      equippedItems = []; // Kontynuuj bez ekwipunku w przypadku błędu
    }

    // 3. Oblicz bonusy pasywne z sprzętu
    const equipBonuses = {
      strength: 0n,
      speed: 0n,
      endurance: 0n,
      intelligence: 0n,
      mental_strength: 0n,
      bonus_hp: 0n,
      bonus_mp: 0n
    };

    // Obiekt zbierający nazwy przedmiotów z bonusami
    const equipBreakdown = {
      strength: [], speed: [], endurance: [], intelligence: [], mental_strength: [], bonus_hp: [], bonus_mp: []
    };

    // Obiekt zbierający bonusy treningowe
    const trainingBonuses = {
      strength: 0n,
      speed: 0n,
      endurance: 0n,
      intelligence: 0n,
      mental_strength: 0n,
      bonus_hp: 0n,
      bonus_mp: 0n
    };

    // Iteruj przez założony sprzęt i sumuj bonusy pasywne
    equippedItems.forEach(item => {
      if (item.item_templates && item.item_templates.bonuses) {
        const bonuses = item.item_templates.bonuses;
        
        // Sprawdź czy to bonus pasywny
        if (bonuses.type === 'passive' || bonuses.type === undefined) {
          // Dodaj bonusy do statystyk (rzutowanie Stringów na BigInt)
          if (bonuses.strength) {
            equipBonuses.strength += BigInt(bonuses.strength);
            equipBreakdown.strength.push(`${item.item_templates.name}: +${bonuses.strength}`);
          }
          if (bonuses.speed) {
            equipBonuses.speed += BigInt(bonuses.speed);
            equipBreakdown.speed.push(`${item.item_templates.name}: +${bonuses.speed}`);
          }
          if (bonuses.endurance) {
            equipBonuses.endurance += BigInt(bonuses.endurance);
            equipBreakdown.endurance.push(`${item.item_templates.name}: +${bonuses.endurance}`);
          }
          if (bonuses.intelligence) {
            equipBonuses.intelligence += BigInt(bonuses.intelligence);
            equipBreakdown.intelligence.push(`${item.item_templates.name}: +${bonuses.intelligence}`);
          }
          if (bonuses.mental_strength) {
            equipBonuses.mental_strength += BigInt(bonuses.mental_strength);
            equipBreakdown.mental_strength.push(`${item.item_templates.name}: +${bonuses.mental_strength}`);
          }
          if (bonuses.bonus_hp) {
            equipBonuses.bonus_hp += BigInt(bonuses.bonus_hp);
            equipBreakdown.bonus_hp.push(`${item.item_templates.name}: +${bonuses.bonus_hp}`);
          }
          if (bonuses.bonus_mp) {
            equipBonuses.bonus_mp += BigInt(bonuses.bonus_mp);
            equipBreakdown.bonus_mp.push(`${item.item_templates.name}: +${bonuses.bonus_mp}`);
          }
        }

        if (bonuses.type === 'training') {
          if (bonuses.strength) trainingBonuses.strength += BigInt(bonuses.strength);
          if (bonuses.speed) trainingBonuses.speed += BigInt(bonuses.speed);
          if (bonuses.endurance) trainingBonuses.endurance += BigInt(bonuses.endurance);
          if (bonuses.intelligence) trainingBonuses.intelligence += BigInt(bonuses.intelligence);
          if (bonuses.mental_strength) trainingBonuses.mental_strength += BigInt(bonuses.mental_strength);
          if (bonuses.bonus_hp) trainingBonuses.bonus_hp += BigInt(bonuses.bonus_hp);
          if (bonuses.bonus_mp) trainingBonuses.bonus_mp += BigInt(bonuses.bonus_mp);
        }
      bonus_hp: BigInt(character.bonus_hp || '0'),
      bonus_mp: BigInt(character.bonus_mp || '0'),
      bonus_stamina: BigInt(character.bonus_stamina || '0')
    };

    // 5. Oblicz max_hp, max_mp, max_stamina z uwzględnieniem bonusów z ekwipunku
    // Użyj CAŁKOWITYCH statystyk (baza + sprzęt) do wyliczenia limitów
    const totalStr = baseStats.strength + equipBonuses.strength;
    const totalInt = baseStats.intelligence + equipBonuses.intelligence;
    
    const max_hp = 100n + (totalStr / 20n) + baseStats.bonus_hp + equipBonuses.bonus_hp;
    const max_mp = 100n + (totalInt / 5n) + baseStats.bonus_mp + equipBonuses.bonus_mp;
    const max_stamina = 100n + baseStats.bonus_stamina; // Stamina nie otrzymuje bonusów od sprzętu

    // 6. KRYTYCZNE: Oblicz powerLevel IGNORUJĄC equipBonuses (tylko baza + trwałe bonusy)
    const stats_sum = baseStats.strength + baseStats.speed + baseStats.endurance + baseStats.intelligence + baseStats.mental_strength;
    const powerLevel = stats_sum + baseStats.bonus_hp + (baseStats.bonus_mp * 2n) + (baseStats.bonus_stamina * 5n);

    // 7. Zwróć pełny obiekt statystyk
    return {
      character,
      profile,
      powerLevel,
      max_hp,
      max_mp,
      max_stamina,
      baseStats: {
        strength: baseStats.strength.toString(),
        speed: baseStats.speed.toString(),
        endurance: baseStats.endurance.toString(),
        intelligence: baseStats.intelligence.toString(),
        mental_strength: baseStats.mental_strength.toString(),
        bonus_hp: baseStats.bonus_hp.toString(),
        bonus_mp: baseStats.bonus_mp.toString(),
        bonus_stamina: baseStats.bonus_stamina.toString()
      },
      equipStats: {
        strength: equipBonuses.strength.toString(),
        speed: equipBonuses.speed.toString(),
        endurance: equipBonuses.endurance.toString(),
        intelligence: equipBonuses.intelligence.toString(),
        mental_strength: equipBonuses.mental_strength.toString(),
        bonus_hp: equipBonuses.bonus_hp.toString(),
        bonus_mp: equipBonuses.bonus_mp.toString(),
        breakdown: equipBreakdown
      },
      trainingStats: {
        strength: trainingBonuses.strength.toString(),
        speed: trainingBonuses.speed.toString(),
        endurance: trainingBonuses.endurance.toString(),
        intelligence: trainingBonuses.intelligence.toString(),
        mental_strength: trainingBonuses.mental_strength.toString(),
        bonus_hp: trainingBonuses.bonus_hp.toString(),
        bonus_mp: trainingBonuses.bonus_mp.toString()
      }
    };

  } catch (err) {
    console.error('[Stats] Błąd w getFullCharacterStats:', err.message);
    throw err;
  }
}

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

    // Wywołaj nową funkcję pomocniczą
    const fullStats = await getFullCharacterStats(userId);
    const { character, profile, powerLevel, max_hp, max_mp, max_stamina, baseStats, equipStats } = fullStats;

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
    // 2. PASYWNA REGENERACJA (Zależna od 60s ticków) - z wykorzystaniem finalnych statystyk
    // ==========================================
    if (ticks60s > 0n || !character.last_calculation_time) {
      if (isHospitalized) {
        // GRACZ W SZPITALU - Całkowita blokada regeneracji
        dbUpdateNeeded = false;
      } else {
        // GRACZ ZDROWY (LUB WŁAŚNIE WYSZEDŁ) - Pełna regeneracja za obliczony czas
        // Użyj finalnych statystyk uwzględniających sprzęt do obliczeń regeneracji
        const finalEndurance = BigInt(baseStats.endurance) + BigInt(equipStats.endurance || '0');
        const finalMentalStrength = BigInt(baseStats.mental_strength) + BigInt(equipStats.mental_strength || '0');
        
        const staminaGain = ticks60s * 1n;
        const enduranceBonus = BigInt(Math.floor(Math.sqrt(Number(finalEndurance)) / 10));
        const hpGain = ticks60s * (1n + enduranceBonus);
        const mentalBonus = BigInt(Math.floor(Math.sqrt(Number(finalMentalStrength)) / 5));
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

    // Przygotowanie obiektu odpowiedzi z poprawnymi kluczami i dodaniem equip_stats
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
      
      stats: baseStats, // Bazowe statystyki
      equip_stats: equipStats, // Bonusy pasywne z sprzętu
      
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

app.post('/api/inventory/swap', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id_1, slot_target, backpack_index_target, item_id_2 } = req.body;

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

    // Sprawdzenie, czy slot docelowy jest zajęty (dla odpowiedniego komunikatu)
    let wasOccupied = false;
    let targetItem = null;
    
    // Jeśli przenosimy do plecaka, sprawdź czy istnieje przedmiot docelowy
    if (slot_target === 'backpack' && backpack_index_target !== null && backpack_index_target !== undefined) {
      const { data: existingBackpackItem } = await supabase
        .from('inventory')
        .select('*, item_templates(*)')
        .eq('character_id', character.id)
        .is('equipped_slot', null)
        .eq('backpack_index', backpack_index_target)
        .neq('id', item_id_1) // Nie bierzemy pod uwagę przedmiotu, który właśnie przenosimy
        .maybeSingle();
        
      if (existingBackpackItem) {
        targetItem = existingBackpackItem;
        wasOccupied = true;
      }
    } else if (slot_target !== 'backpack') {
      // Sprawdzenie slotów ekwipunku
      const { data: existingItem } = await supabase
        .from('inventory')
        .select('id')
        .eq('character_id', character.id)
        .eq('equipped_slot', slot_target)
        .neq('id', item_id_1) // Nie bierzemy pod uwagę przedmiotu, który właśnie przenosimy
        .maybeSingle();
        
      if (existingItem) {
        wasOccupied = true;
      }
    }

    // Sprawdź warunek łączenia (stackowania) dla przedmiotów w plecaku
    if (targetItem && 
        draggedItem.item_template_id === targetItem.item_template_id &&
        (draggedItem.item_templates.category === 'consumable' || draggedItem.item_templates.category === 'special_consumable')) {
      
      // Logika łączenia przedmiotów
      const totalQuantity = BigInt(draggedItem.quantity || '1') + BigInt(targetItem.quantity || '1');
      
      if (totalQuantity <= 99n) {
        // Połącz przedmioty - zaktualizuj docelowy i usuń źródłowy
        const { error: updateError } = await supabase
          .from('inventory')
          .update({ quantity: totalQuantity.toString() })
          .eq('id', targetItem.id);
          
        if (updateError) {
          console.error('[Inventory] Błąd aktualizacji ilości docelowej:', updateError);
          return res.status(500).json({ error: 'Błąd podczas łączenia przedmiotów' });
        }
        
        // Usuń przedmiot źródłowy
        const { error: deleteError } = await supabase
          .from('inventory')
          .delete()
          .eq('id', item_id_1);
          
        if (deleteError) {
          console.error('[Inventory] Błąd usuwania przedmiotu źródłowego:', deleteError);
          return res.status(500).json({ error: 'Błąd podczas łączenia przedmiotów' });
        }
        
        return res.json({ 
          success: true, 
          message: 'Przedmioty zostały połączone.' 
        });
        
      } else {
        // Przenieś nadwyżkę do przedmiotu źródłowego
        const overflow = totalQuantity - 99n;
        
        // Zaktualizuj docelowy do maksymalnej ilości
        const { error: updateTargetError } = await supabase
          .from('inventory')
          .update({ quantity: '99' })
          .eq('id', targetItem.id);
          
        if (updateTargetError) {
          console.error('[Inventory] Błąd aktualizacji ilości docelowej:', updateTargetError);
          return res.status(500).json({ error: 'Błąd podczas łączenia przedmiotów' });
        }
        
        // Zaktualizuj źródłowy z nadwyżką
        const { error: updateSourceError } = await supabase
          .from('inventory')
          .update({ quantity: overflow.toString() })
          .eq('id', item_id_1);
          
        if (updateSourceError) {
          console.error('[Inventory] Błąd aktualizacji ilości źródłowej:', updateSourceError);
          return res.status(500).json({ error: 'Błąd podczas łączenia przedmiotów' });
        }
        
        return res.json({ 
          success: true, 
          message: 'Przedmioty zostały połączone (osiągnięto maksymalną ilość).' 
        });
      }
    }

    // Wywołaj funkcję RPC do zamiany przedmiotów
    const { data: swapResult, error: swapError } = await supabase
      .rpc('swap_items', {
        p_character_id: character.id,
        p_item_id_1: item_id_1,
        p_slot_target: slot_target,
        p_backpack_index_target: backpack_index_target || null,
        p_item_id_2: item_id_2 || null
      });

    if (swapError) {
      console.error('[Inventory] Błąd RPC swap_items:', swapError);
      return res.status(500).json({ error: 'Błąd podczas zamiany przedmiotów' });
    }

    // Przelicz maksymalne HP/MP/Staminę po zamianie używając zsumowanych statystyk (Baza + Sprzęt)
    const fullStats = await getFullCharacterStats(userId);
    
    const newMaxHp = BigInt(fullStats.max_hp);
    const newMaxMp = BigInt(fullStats.max_mp);
    const newMaxStamina = BigInt(fullStats.max_stamina);

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

    // Kontekstowe komunikaty
    let responseMessage = '';
    if (slot_target === 'backpack') {
      if (wasOccupied) {
        responseMessage = 'Przedmioty zostały zamienione miejscami.';
      } else {
        responseMessage = 'Przedmiot schowany do plecaka / przeniesiony.';
      }
    } else if (slot_target !== 'backpack') {
      if (wasOccupied) {
        responseMessage = 'Przedmioty zostały zamienione miejscami.';
      } else {
        // Sprawdź czy to zakładanie czy zdejmowanie sprzętu
        if (draggedItem.equipped_slot !== null) {
          responseMessage = 'Sprzęt zdjęty.';
        } else {
          responseMessage = 'Sprzęt założony.';
        }
      }
    } else {
      responseMessage = 'Akcja wykonana pomyślnie.';
    }

    res.json({ 
      success: true, 
      message: responseMessage,
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

    // Pobierz pełne statystyki (Baza + Sprzęt)
    const fullStats = await getFullCharacterStats(userId);

    // Oblicz obecne statystyki bazowe (BigInt)
    let currentStr = BigInt(fullStats.baseStats.strength || '1');
    let currentInt = BigInt(fullStats.baseStats.intelligence || '1');
    let currentEnd = BigInt(fullStats.baseStats.endurance || '1');
    let currentSpd = BigInt(fullStats.baseStats.speed || '1');
    let currentMen = BigInt(fullStats.baseStats.mental_strength || '1');
    const currentBonusStamina = BigInt(character.bonus_stamina || '0');
    
    // Limity z uwzględnieniem sprzętu (MUST BE let, bo Fasolka je nadpisuje!)
    let maxHp = BigInt(fullStats.max_hp);
    let maxMp = BigInt(fullStats.max_mp);
    const maxStamina = BigInt(fullStats.max_stamina);

    // Pobierz obecne zasoby
    let currentHp = BigInt(character.hp || '100');
    let currentMp = BigInt(character.mp || '100');
    let currentStamina = BigInt(character.stamina || '100');
    let newBonusStamina = BigInt(fullStats.baseStats.bonus_stamina);

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
      } else if (effect === 'hospital_exit_zenkai' || effect === 'zenkai_resurrection') {
        // Zawsze leczy do pełna (poza szpitalem i w szpitalu):
        currentHp = maxHp;
        currentMp = maxMp;
        currentStamina = maxStamina;
        effectMessages.push('Odzyskano 100% zasobów');

        // Dodatkowe efekty Szpitala:
        if (BigInt(character.hp || '0') <= 0n) {
            if (character.last_death_penalty) {
                const dp = character.last_death_penalty;
                currentStr += BigInt(dp.strength || '0');
                currentSpd += BigInt(dp.speed || '0');
                currentEnd += BigInt(dp.endurance || '0');
                currentInt += BigInt(dp.intelligence || '0');
                currentMen += BigInt(dp.mental_strength || '0');

                // Ponowne przeliczenie maksów po odzyskaniu statystyk (uwzględniające sprzęt!)
                const totalStr = currentStr + BigInt(fullStats.equipStats.strength || '0');
                const totalInt = currentInt + BigInt(fullStats.equipStats.intelligence || '0');
                
                maxHp = 100n + (totalStr / 20n) + BigInt(character.bonus_hp || '0') + BigInt(fullStats.equipStats.bonus_hp || '0');
                maxMp = 100n + (totalInt / 5n) + BigInt(character.bonus_mp || '0') + BigInt(fullStats.equipStats.bonus_mp || '0');
                
                // Leczmy jeszcze raz do nowych, wyższych limitów
                currentHp = maxHp;
                currentMp = maxMp;

                effectMessages.push('Przebudzenie! Zwrócono utracone statystyki.');
            } else {
                effectMessages.push('Wskrzeszenie z zaświatów!');
            }
            req.clearHospital = true; // Flaga pomocnicza do czyszczenia bazy
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
                               ((effects.hospital_exit_zenkai || effects.zenkai_resurrection) && originalHp <= 0n);
    
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
    if (BigInt(item.quantity) > 1n) {
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: (BigInt(item.quantity) - 1n).toString() })
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
    const updateData = {
        hp: currentHp.toString(),
        mp: currentMp.toString(),
        stamina: currentStamina.toString(),
        bonus_stamina: newBonusStamina.toString(),
        strength: currentStr.toString(),
        speed: currentSpd.toString(),
        endurance: currentEnd.toString(),
        intelligence: currentInt.toString(),
        mental_strength: currentMen.toString()
    };

    if (req.clearHospital) {
        updateData.hospital_until = null;
        updateData.last_death_penalty = null;
    }

    const { error: updateError } = await supabase
      .from('characters')
      .update(updateData)
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
        bonus_stamina: newBonusStamina.toString(),
        coins: (character.coins || '0').toString() // Add coins to character updates
      }
    });

  } catch (err) {
    console.error('[Consume] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas konsumpcji przedmiotu' });
  }
});

// Silnik Misji - Rozpoczęcie misji
app.post('/api/missions/start', authenticateToken, async (req, res) => {
  try {
    const { missionId } = req.body;
    const userId = req.user.id;

    // 1. POBRANIE DANYCH
    const fullStats = await getFullCharacterStats(userId);
    const character = fullStats.character;

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

        // Dodaj wyliczenie efektywnych statystyk
        const effectiveStr = BigInt(fullStats.baseStats.strength) + BigInt(fullStats.equipStats.strength || '0');
        const effectiveSpd = BigInt(fullStats.baseStats.speed) + BigInt(fullStats.equipStats.speed || '0');
        const effectiveEnd = BigInt(fullStats.baseStats.endurance) + BigInt(fullStats.equipStats.endurance || '0');

        ['strength', 'speed', 'endurance'].forEach(stat => {
          if (reqStats[stat] && reqStats[stat] > 0) {
            let playerStat = 1n;
            if (stat === 'strength') playerStat = effectiveStr;
            if (stat === 'speed') playerStat = effectiveSpd;
            if (stat === 'endurance') playerStat = effectiveEnd;
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
});

// Endpoint dzielenia stosów przedmiotów
app.post('/api/inventory/split', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount_to_split } = req.body;

    if (!inventory_id || !amount_to_split) {
      return res.status(400).json({ error: 'Brak wymaganych parametrów: inventory_id, amount_to_split' });
    }

    // Pobierz dane postaci
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Sprawdź limit plecaka (5 slotów)
    const { data: backpackItems, error: backpackError } = await supabase
      .from('inventory')
      .select('id, backpack_index')
      .eq('character_id', character.id)
      .is('equipped_slot', null);

    if (backpackError) {
      console.error('[Split] Błąd sprawdzania plecaka:', backpackError);
      return res.status(500).json({ error: 'Błąd podczas sprawdzania plecaka' });
    }

    if (backpackItems.length >= 5) {
      return res.status(400).json({ error: 'Brak miejsca w plecaku! Maksymalnie 5 slotów.' });
    }

    // Pobierz przedmiot do podzielenia
    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Nie znaleziono przedmiotu' });
    }

    // Walidacje
    if (item.equipped_slot !== null) {
      return res.status(400).json({ error: 'Nie można dzielić założonych przedmiotów!' });
    }

    const currentQuantity = BigInt(item.quantity);
    const splitAmount = BigInt(amount_to_split);

    if (currentQuantity <= splitAmount) {
      return res.status(400).json({ error: 'Nie można podzielić takiej ilości!' });
    }

    if (splitAmount <= 0n) {
      return res.status(400).json({ error: 'Ilość do podzielenia musi być większa od 0!' });
    }

    // Atomowe operacje: odjęcie od oryginalnego i stworzenie nowego
    const { error: updateError } = await supabase
      .from('inventory')
      .update({ quantity: (currentQuantity - splitAmount).toString() })
      .eq('id', inventory_id);

    if (updateError) {
      console.error('[Split] Błąd aktualizacji oryginalnego przedmiotu:', updateError);
      return res.status(500).json({ error: 'Błąd podczas aktualizacji oryginalnego przedmiotu' });
    }

    // Stwórz nowy rekord z podzieloną ilością
    const occupiedIndexes = backpackItems.map(i => i.backpack_index);
    let firstFreeIndex = 1;
    while (occupiedIndexes.includes(firstFreeIndex)) {
        firstFreeIndex++;
    }
    
    const { error: insertError } = await supabase
      .from('inventory')
      .insert({
        character_id: character.id,
        item_template_id: item.item_template_id,
        quantity: splitAmount.toString(),
        equipped_slot: null,
        backpack_index: firstFreeIndex
      });

    if (insertError) {
      console.error('[Split] Błąd tworzenia nowego przedmiotu:', insertError);
      // Rollback - przywróć oryginalną ilość
      await supabase
        .from('inventory')
        .update({ quantity: item.quantity })
        .eq('id', inventory_id);
      return res.status(500).json({ error: 'Błąd podczas tworzenia nowego przedmiotu' });
    }

    res.json({ 
      success: true, 
      message: 'Przedmiot został podzielony!' 
    });

  } catch (err) {
    console.error('[Split] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas dzielenia przedmiotu' });
  }
});

// Endpoint pobierający asortyment sklepu
app.get('/api/shop/items', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('item_templates')
      .select('*')
      .not('buy_price_coins', 'is', null)
      .order('buy_price_coins', { ascending: true });

    if (error) {
      console.error('[Shop] Błąd bazy danych przy pobieraniu szablonów:', error);
      return res.status(500).json({ error: 'Błąd bazy danych' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('[Shop] Błąd endpointu /api/shop/items:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas ładowania asortymentu' });
  }
});

// Endpoint kupowania przedmiotów ze sklepu
app.post('/api/shop/buy', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { template_id, quantity = 1 } = req.body;

    if (!template_id) {
      return res.status(400).json({ error: 'Brak wymaganego parametru: template_id' });
    }

    // Pobierz dane postaci
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, coins')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Pobierz szablon przedmiotu z ceną
    const { data: itemTemplate, error: templateError } = await supabase
      .from('item_templates')
      .select('*, buy_price_coins')
      .eq('id', template_id)
      .single();

    if (templateError || !itemTemplate) {
      return res.status(404).json({ error: 'Nie znaleziono przedmiotu w sklepie' });
    }

    if (itemTemplate.buy_price_coins === null) {
      return res.status(400).json({ error: 'Ten przedmiot nie jest dostępny w sklepie' });
    }

    // Sprawdź, czy gracz ma wystarczająco monet
    const itemPrice = BigInt(itemTemplate.buy_price_coins);
    const totalCost = itemPrice * BigInt(quantity);
    const playerCoins = BigInt(character.coins || '0');

    if (playerCoins < totalCost) {
      return res.status(400).json({ error: 'Nie masz wystarczająco monet!' });
    }

    // Sprawdź pojemność plecaka
    const { data: backpackItems, error: backpackError } = await supabase
      .from('inventory')
      .select('id, item_template_id, quantity, backpack_index')
      .eq('character_id', character.id)
      .is('equipped_slot', null);

    if (backpackError) {
      console.error('[Shop] Błąd sprawdzania plecaka:', backpackError);
      return res.status(500).json({ error: 'Błąd podczas sprawdzania plecaka' });
    }

    // Sprawdź, czy przedmiot jest stackowalny i już istnieje
    const existingItem = backpackItems.find(item => item.item_template_id === template_id);
    const isStackable = itemTemplate.category === 'consumable' || itemTemplate.category === 'special_consumable';
    
    let currentBackpackSlots = backpackItems.length;
    if (existingItem && isStackable) {
      // Stackowanie nie zwiększa liczby slotów (zmieści się do 99)
    } else {
      // Zawsze wymaga nowego slotu (całkiem nowy przedmiot LUB kolejny nieskładalny sprzęt)
      currentBackpackSlots++;
    }

    if (currentBackpackSlots > 5) {
      return res.status(400).json({ error: 'Brak miejsca w plecaku! Maksymalnie 5 slotów.' });
    }

    // Atomowe operacje: odjęcie monet i dodanie przedmiotu
    const { error: coinError } = await supabase
      .from('characters')
      .update({ coins: (playerCoins - totalCost).toString() })
      .eq('id', character.id);

    if (coinError) {
      console.error('[Shop] Błąd aktualizacji monet:', coinError);
      return res.status(500).json({ error: 'Błąd podczas aktualizacji monet' });
    }

    if (existingItem && isStackable) {
      // Stackowanie - aktualizuj ilość
      const newQuantity = BigInt(existingItem.quantity) + BigInt(quantity);
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: newQuantity.toString() })
        .eq('id', existingItem.id);

      if (updateError) {
        console.error('[Shop] Błąd stackowania przedmiotu:', updateError);
        return res.status(500).json({ error: 'Błąd podczas stackowania przedmiotu' });
      }
    } else {
      // Nowy przedmiot
      const occupiedIndexes = backpackItems.map(i => i.backpack_index);
      let firstFreeIndex = 1;
      while (occupiedIndexes.includes(firstFreeIndex)) {
        firstFreeIndex++;
      }
      
      const { error: insertError } = await supabase
        .from('inventory')
        .insert({
          character_id: character.id,
          item_template_id: template_id,
          quantity: quantity,
          equipped_slot: null,
          backpack_index: firstFreeIndex
        });

      if (insertError) {
        console.error('[Shop] Błąd dodawania przedmiotu:', insertError);
        return res.status(500).json({ error: 'Błąd podczas dodawania przedmiotu' });
      }
    }

    res.json({ 
      success: true, 
      message: `Kupiono ${itemTemplate.name} x${quantity}!`,
      item: {
        name: itemTemplate.name,
        quantity: quantity,
        total_cost: totalCost.toString()
      }
    });

  } catch (err) {
    console.error('[Shop] Błąd endpointu buy:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas kupowania' });
  }
});

// Endpoint sprzedawania przedmiotów
app.post('/api/shop/sell', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount } = req.body;

    if (!inventory_id) {
      return res.status(400).json({ error: 'Brak wymaganego parametru: inventory_id' });
    }

    // Pobierz dane postaci
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, coins')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });
    }

    // Pobierz przedmiot z plecaka
    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .is('equipped_slot', null)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Nie znaleziono przedmiotu w plecaku' });
    }

    // Sprawdź cenę sprzedaży (50% ceny zakupu)
    if (item.item_templates.buy_price_coins === null) {
      return res.status(400).json({ error: 'Ten przedmiot nie ma wartości sprzedaży' });
    }

    const sellPrice = BigInt(item.item_templates.buy_price_coins) / 2n;
    
    // Oblicz ilość do sprzedaży
    const sellQuantity = (amount === 'all' || !amount) 
      ? BigInt(item.quantity) 
      : minBigInt(BigInt(amount), BigInt(item.quantity));
    
    const totalSellPrice = sellPrice * sellQuantity;
    const playerCoins = BigInt(character.coins || '0');

    // Atomowe operacje: dodanie monet i usunięcie przedmiotu
    const { error: coinError } = await supabase
      .from('characters')
      .update({ coins: (playerCoins + totalSellPrice).toString() })
      .eq('id', character.id);

    if (coinError) {
      console.error('[Shop] Błąd aktualizacji monet przy sprzedaży:', coinError);
      return res.status(500).json({ error: 'Błąd podczas aktualizacji monet' });
    }

    // Aktualizacja bazy: usuń całość lub zaktualizuj ilość
    let updateError;
    if (sellQuantity === BigInt(item.quantity)) {
      // Usuń cały stack
      ({ error: updateError } = await supabase
        .from('inventory')
        .delete()
        .eq('id', inventory_id));
    } else {
      // Aktualizuj ilość
      ({ error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: (BigInt(item.quantity) - sellQuantity).toString() })
        .eq('id', inventory_id));
    }

    if (updateError) {
      console.error('[Shop] Błąd aktualizacji przedmiotu:', updateError);
      return res.status(500).json({ error: 'Błąd podczas aktualizacji przedmiotu' });
    }

    res.json({ 
      success: true, 
      message: `Sprzedano ${item.item_templates.name} x${sellQuantity} za ${totalSellPrice} monet!`,
      item: {
        name: item.item_templates.name,
        quantity: sellQuantity.toString(),
        total_sell_price: totalSellPrice.toString()
      }
    });

  } catch (err) {
    console.error('[Shop] Błąd endpointu sell:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas sprzedaży' });
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