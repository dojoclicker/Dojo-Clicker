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

// ==========================================
// ⚙️ 1. KONFIGURACJA, BAZA DANYCH I POMOCNIKI
// ==========================================

// Funkcje pomocnicze dla BigInt
const minBigInt = (a, b) => (a < b ? a : b);
const maxBigInt = (a, b) => (a > b ? a : b);

// Globalna funkcja wyliczająca maksymalną pojemność plecaka
function calculateMaxBackpackSlots(charStats) {
  const minPhysicalStat = minBigInt(
    BigInt(charStats.strength || '0'), 
    minBigInt(BigInt(charStats.speed || '0'), BigInt(charStats.endurance || '0'))
  );
  return Math.min(50, 5 + Number(minPhysicalStat / 10000n));
}

// ==========================================
// 📊 2. SILNIK STATYSTYK I AUTORYZACJA (MIDDLEWARE)
// ==========================================
// Tu są: getFullCharacterStats(), authenticateToken()

// Reużywalna funkcja pobierająca pełne statystyki postaci z bonusami z ekwipunku
async function getFullCharacterStats(userId) {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profileError || !profile) throw new Error('Nie znaleziono profilu gracza');

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) throw new Error('Nie znaleziono postaci gracza');

    let { data: equippedItems, error: equipmentError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('character_id', character.id)
      .not('equipped_slot', 'is', null)
      .neq('equipped_slot', 'bank'); // TWARDE ZABEZPIECZENIE: Ignoruj przedmioty schowane w banku!

    if (equipmentError) {
      console.error('[Stats] Błąd pobierania ekwipunku:', equipmentError);
      equippedItems = [];
    }

    const equipBonuses = { strength: 0n, speed: 0n, endurance: 0n, technique: 0n, intelligence: 0n, mental_strength: 0n, bonus_hp: 0n, bonus_mp: 0n, bonus_coins_pct: 0n, bonus_coins: 0n };
    const equipBreakdown = { strength: [], speed: [], endurance: [], technique: [], intelligence: [], mental_strength: [], bonus_hp: [], bonus_mp: [], bonus_coins_pct: [], bonus_coins: [] };
    const trainingBonuses = { strength: 0n, speed: 0n, endurance: 0n, technique: 0n, intelligence: 0n, mental_strength: 0n, bonus_hp: 0n, bonus_mp: 0n, bonus_coins_pct: 0n };

    equippedItems.forEach(item => {
      if (item.item_templates && item.item_templates.bonuses) {
        const bonuses = item.item_templates.bonuses;
        
        if (bonuses.type === 'passive' || bonuses.type === undefined) {
          if (bonuses.strength) { equipBonuses.strength += BigInt(bonuses.strength); equipBreakdown.strength.push(`${item.item_templates.name}: +${bonuses.strength}`); }
          if (bonuses.speed) { equipBonuses.speed += BigInt(bonuses.speed); equipBreakdown.speed.push(`${item.item_templates.name}: +${bonuses.speed}`); }
          if (bonuses.endurance) { equipBonuses.endurance += BigInt(bonuses.endurance); equipBreakdown.endurance.push(`${item.item_templates.name}: +${bonuses.endurance}`); }
          if (bonuses.technique) { equipBonuses.technique += BigInt(bonuses.technique); equipBreakdown.technique.push(`${item.item_templates.name}: +${bonuses.technique}`); } // <--- NOWE
          if (bonuses.intelligence) { equipBonuses.intelligence += BigInt(bonuses.intelligence); equipBreakdown.intelligence.push(`${item.item_templates.name}: +${bonuses.intelligence}`); }
          if (bonuses.mental_strength) { equipBonuses.mental_strength += BigInt(bonuses.mental_strength); equipBreakdown.mental_strength.push(`${item.item_templates.name}: +${bonuses.mental_strength}`); }
          if (bonuses.bonus_hp) { equipBonuses.bonus_hp += BigInt(bonuses.bonus_hp); equipBreakdown.bonus_hp.push(`${item.item_templates.name}: +${bonuses.bonus_hp}`); }
          if (bonuses.bonus_mp) { equipBonuses.bonus_mp += BigInt(bonuses.bonus_mp); equipBreakdown.bonus_mp.push(`${item.item_templates.name}: +${bonuses.bonus_mp}`); }
          if (bonuses.bonus_coins_pct) { equipBonuses.bonus_coins_pct += BigInt(bonuses.bonus_coins_pct); equipBreakdown.bonus_coins_pct.push(`${item.item_templates.name}: +${bonuses.bonus_coins_pct}%`); }
          if (bonuses.bonus_coins) { equipBonuses.bonus_coins += BigInt(bonuses.bonus_coins); equipBreakdown.bonus_coins.push(`${item.item_templates.name}: +${bonuses.bonus_coins}`); } // <-- DODANO PŁASKIE MONETY
        }

        if (bonuses.type === 'training') {
          if (bonuses.strength) trainingBonuses.strength += BigInt(bonuses.strength);
          if (bonuses.speed) trainingBonuses.speed += BigInt(bonuses.speed);
          if (bonuses.endurance) trainingBonuses.endurance += BigInt(bonuses.endurance);
          if (bonuses.technique) trainingBonuses.technique += BigInt(bonuses.technique);
          if (bonuses.intelligence) trainingBonuses.intelligence += BigInt(bonuses.intelligence);
          if (bonuses.mental_strength) trainingBonuses.mental_strength += BigInt(bonuses.mental_strength);
          if (bonuses.bonus_hp) trainingBonuses.bonus_hp += BigInt(bonuses.bonus_hp);
          if (bonuses.bonus_mp) trainingBonuses.bonus_mp += BigInt(bonuses.bonus_mp);
          if (bonuses.bonus_coins_pct) trainingBonuses.bonus_coins_pct += BigInt(bonuses.bonus_coins_pct);
        }
      }
    }); 

    const baseStats = {
      strength: BigInt(character.strength || '1'),
      speed: BigInt(character.speed || '1'),
      endurance: BigInt(character.endurance || '1'),
      technique: BigInt(character.technique || '1'),
      intelligence: BigInt(character.intelligence || '1'),
      mental_strength: BigInt(character.mental_strength || '1'),
      bonus_hp: BigInt(character.bonus_hp || '0'),
      bonus_mp: BigInt(character.bonus_mp || '0'),
      bonus_stamina: BigInt(character.bonus_stamina || '0')
    };

    const totalStr = baseStats.strength + equipBonuses.strength;
    const totalInt = baseStats.intelligence + equipBonuses.intelligence;
    
    const max_hp = 100n + (totalStr / 20n) + baseStats.bonus_hp + equipBonuses.bonus_hp;
    const max_mp = 100n + (totalInt / 5n) + baseStats.bonus_mp + equipBonuses.bonus_mp;
    const max_stamina = 100n + baseStats.bonus_stamina;

    const stats_sum = baseStats.strength + baseStats.speed + baseStats.endurance + baseStats.technique + baseStats.intelligence + baseStats.mental_strength;
    const powerLevel = stats_sum + baseStats.bonus_hp + (baseStats.bonus_mp * 2n) + (baseStats.bonus_stamina * 5n);

    // Cicha aktualizacja Poziomu Mocy w bazie danych (aby Ranking był zawsze aktualny!)
    if (character.base_power_level !== powerLevel.toString()) {
        supabase.from('characters')
            .update({ base_power_level: powerLevel.toString() })
            .eq('id', character.id)
            .then();
    }

    return {
      character, profile, powerLevel, max_hp, max_mp, max_stamina,
      baseStats: {
        strength: baseStats.strength.toString(),
        speed: baseStats.speed.toString(),
        endurance: baseStats.endurance.toString(),
        technique: baseStats.technique.toString(),
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
        technique: equipBonuses.technique.toString(),
        intelligence: equipBonuses.intelligence.toString(),
        mental_strength: equipBonuses.mental_strength.toString(),
        bonus_hp: equipBonuses.bonus_hp.toString(),
        bonus_mp: equipBonuses.bonus_mp.toString(),
        bonus_coins_pct: equipBonuses.bonus_coins_pct.toString(), // <--- BRAKUJĄCA LINIJKA
        bonus_coins: equipBonuses.bonus_coins.toString(), // <--- BRAKUJĄCA LINIJKA
        breakdown: equipBreakdown
      },
      trainingStats: {
        strength: trainingBonuses.strength.toString(),
        speed: trainingBonuses.speed.toString(),
        endurance: trainingBonuses.endurance.toString(),
        technique: trainingBonuses.technique.toString(), // <--- BRAKUJĄCA LINIJKA
        intelligence: trainingBonuses.intelligence.toString(),
        mental_strength: trainingBonuses.mental_strength.toString(),
        bonus_hp: trainingBonuses.bonus_hp.toString(),
        bonus_mp: trainingBonuses.bonus_mp.toString(),
        bonus_coins_pct: trainingBonuses.bonus_coins_pct.toString()
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
app.use((req, res, next) => {
  if (!globalServerState) {
    return res.status(503).json({ error: 'Serwer się uruchamia, spróbuj ponownie za chwilę.' });
  }
  
  if (globalServerState.is_maintenance) {
    return res.status(503).json({ error: 'Trwa zmiana dnia DC (Przerwa techniczna). Gra zablokowana na chwilę.' });
  }
  
  next(); 
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    ram_buffer: globalServerState
  });
});

// ==========================================
// SYSTEM AUTORYZACJI I KONT
// ==========================================

// Przywrócona funkcja autoryzacji
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ error: 'Brak tokenu autoryzacyjnego' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(403).json({ error: 'Nieprawidłowy lub wygasły token' });

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Błąd weryfikacji tokenu:', err.message);
    return res.status(403).json({ error: 'Błąd weryfikacji tokenu' });
  }
}

// Middleware sprawdzający, czy gracz żyje (Szpital)
const requireAlive = async (req, res, next) => {
    try {
        const { data: char, error } = await supabase
            .from('characters')
            .select('hp')
            .eq('profile_id', req.user.id)
            .single();

        if (error || !char) return res.status(404).json({ error: 'Nie znaleziono postaci' });

        if (BigInt(char.hp || '0') <= 0n) {
            return res.status(400).json({ success: false, error: 'Jesteś w Szpitalu! Nie możesz wykonywać tej akcji.' });
        }
        next(); 
    } catch (err) {
        res.status(500).json({ error: 'Błąd weryfikacji zdrowia' });
    }
};

function bigIntReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

app.post('/api/auth/register', async (req, res) => {
  const { email, password, username, gender } = req.body;
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    const userId = authData.user.id;

    const { error: profileError } = await supabase.from('profiles').insert([{ id: userId, username, gender }]);
    if (profileError) throw new Error('Nie udało się utworzyć profilu. Nick może być już zajęty.');

    const { error: charError } = await supabase.from('characters').insert([{ profile_id: userId }]);
    if (charError) throw charError;

    res.json({ status: 'success', message: 'Konto utworzone pomyślnie!' });
  } catch (err) {
    console.error('[Auth] Błąd rejestracji:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    res.json({ status: 'success', token: data.session.access_token, user: data.user });
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Nieprawidłowy email lub hasło.' });
  }
});

// ==========================================
// 🧍‍♂️ 3. DANE POSTACI, EKWIPUNEK I PRZEDMIOTY
// ==========================================
// Tu są: Odczyt postaci, consume (leczenie), split, swap ekwipunku

app.get('/api/character', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fullStats = await getFullCharacterStats(userId);
    const { character, profile, powerLevel, max_hp, max_mp, max_stamina, baseStats, equipStats } = fullStats;

    const ensureUTC = (dateVal) => {
        if (!dateVal || dateVal === 'null' || dateVal === 'undefined') return null;
        const str = String(dateVal).trim();
        if (str.endsWith('Z') || str.includes('+') || (str.includes('T') && str.indexOf('-', str.indexOf('T')) !== -1)) return str; 
        return str + 'Z';
    };

    const lastCalcStr = ensureUTC(character.last_calculation_time);
    
    let exactHospitalEndTime = null;
    if (character.last_death_penalty && character.last_death_penalty.hospital_end_ms) {
        exactHospitalEndTime = Number(character.last_death_penalty.hospital_end_ms);
    } else if (character.hospital_until) {
        exactHospitalEndTime = new Date(ensureUTC(character.hospital_until)).getTime();
    }

    const now = Date.now();
    let effectiveLastCalcTime = now;
    
    if (lastCalcStr) {
        const parsedTime = new Date(lastCalcStr).getTime();
        if (!isNaN(parsedTime)) effectiveLastCalcTime = parsedTime;
    }
    
    let isHospitalized = false;
    let hospitalExitTime = null;
    
    if (BigInt(character.hp ?? '100') <= 0n) {
        if (exactHospitalEndTime && !isNaN(exactHospitalEndTime)) {
            if (now + 500 < exactHospitalEndTime) {
                isHospitalized = true;
                effectiveLastCalcTime = now; 
            } else {
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

    // --- TRYB SMART / PRZYJAZNY (Odnawianie staminy po zakończeniu treningu) ---
    let isTrainingActiveRightNow = false;
    if (character.active_training_id && character.training_end_time) {
        const trainingEndTimeMs = new Date(character.training_end_time).getTime();
        
        if (now < trainingEndTimeMs) {
            // Trening wciąż trwa. Cały upłynięty czas to czas treningu (0 darmowej regeneracji)
            isTrainingActiveRightNow = true;
            elapsedMs = 0; 
        } else {
            // Trening już się zakończył. 
            // Liczymy regenerację tylko od momentu zakończenia treningu (odcinamy godziny u mistrza)
            if (effectiveLastCalcTime < trainingEndTimeMs) {
                elapsedMs = now - trainingEndTimeMs;
            }
        }
    }
    // -------------------------------------------------------------------------
    
    const consumedMs = elapsedMs - (elapsedMs % 60000);
    let remainderMs = elapsedMs % 60000; 
    if (isNaN(remainderMs)) remainderMs = 0;
    
    const ticks60s = BigInt(Math.floor(consumedMs / 60000));
    const newCalcTimeUTC = new Date(now - remainderMs).toISOString(); 
    
    let current_stamina = BigInt(character.stamina ?? '100');
    let current_hp = BigInt(character.hp ?? '100');
    let current_mp = BigInt(character.mp ?? '100');
    let dbUpdateNeeded = false;

    if (hospitalExitTime && current_hp <= 0n) {
        const initialHp = (max_hp * 10n) / 100n; 
        current_hp = maxBigInt(initialHp, current_hp);
        dbUpdateNeeded = true;
    }

    if (ticks60s > 0n || !character.last_calculation_time) {
      if (isHospitalized) {
        dbUpdateNeeded = false;
      } else if (isTrainingActiveRightNow) {
        // Trening fizycznie wciąż trwa. Zamrażamy paski i przepalamy czas!
        dbUpdateNeeded = true; 
      } else {
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
          last_calculation_time: newCalcTimeUTC 
        })
        .eq('profile_id', userId);
    }

    const characterData = {
      username: profile.username,
      power_level: powerLevel.toString(),
      coins: character.coins ?? '0',
      bank_coins: character.bank_coins ?? '0',
      bank_coin_limit_level: character.bank_coin_limit_level ?? 1,
      bank_slots_unlocked: character.bank_slots_unlocked ?? 5,
      current_form: character.current_form ?? 'Stan Podstawowy',
      current_hp: current_hp.toString(),
      current_mp: current_mp.toString(),
      current_stamina: current_stamina.toString(), 
      max_hp: max_hp.toString(),
      max_mp: max_mp.toString(),
      max_stamina: max_stamina.toString(),
      stats: baseStats, 
      equip_stats: equipStats, 
      completed_missions: character.completed_missions || [],
      attempted_one_try_missions: character.attempted_one_try_missions || [],
      hospital_until: exactHospitalEndTime ? new Date(exactHospitalEndTime).toISOString() : (character.hospital_until ? String(character.hospital_until).trim() + 'Z' : null),
      hospital_reason: character.last_death_penalty ? character.last_death_penalty.source : null
    };

    // --- PATCH: ODBLOKOWANIE PRACY ---
    let features = character.unlocked_features || [];
    if (character.completed_missions && character.completed_missions.includes('10000000-0000-0000-0000-000000000006')) {
        if (!features.includes('work')) {
            features.push('work');
            supabase.from('characters').update({ unlocked_features: features }).eq('profile_id', userId).then();
        }
    }
    characterData.unlocked_features = features; // KRYTYCZNE: Teraz to faktycznie leci do frontendu!

    res.json(JSON.parse(JSON.stringify(characterData, bigIntReplacer)));
  } catch (err) {
    console.error('[Character] Błąd pobierania danych postaci:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania danych postaci' });
  }
});

app.get('/api/missions', authenticateToken, async (req, res) => {
  try {
    const { data: missions, error } = await supabase
      .from('missions')
      .select('*')
      .order('stamina_cost', { ascending: true });

    if (error) return res.status(500).json({ error: 'Błąd serwera podczas pobierania misji' });

    // 1. Pobieramy słownik przedmiotów, aby podmienić UUID na nazwy
    const { data: items } = await supabase.from('item_templates').select('id, name');
    const itemDict = {};
    if (items) items.forEach(item => itemDict[item.id] = item.name);

    // 2. Doklejamy nazwy do tabeli dropów
    const enrichedMissions = missions.map(mission => {
        if (mission.drop_table && Array.isArray(mission.drop_table)) {
            mission.drop_table = mission.drop_table.map(drop => ({
                ...drop,
                item_name: itemDict[drop.item_id] || 'Przedmiot'
            }));
        }
        return mission;
    });

    // NOWE: Twarde sortowanie po wymaganej sile (gwarantuje idealną kolejność 1-25 niezależnie od bazy)
    enrichedMissions.sort((a, b) => {
        const strA = parseInt(a.req_stats?.strength || '0', 10);
        const strB = parseInt(b.req_stats?.strength || '0', 10);
        return strA - strB;
    });

    res.json(enrichedMissions || []);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera podczas pobierania misji' });
  }
});

app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: character, error: characterError } = await supabase.from('characters').select('id').eq('profile_id', userId).single();
    if (characterError || !character) return res.status(404).json({ error: 'Nie znaleziono postaci gracza' });

    const { data: inventory, error: inventoryError } = await supabase.from('inventory').select('*, item_templates(*)').eq('character_id', character.id);
    if (inventoryError) return res.status(500).json({ error: 'Błąd serwera podczas pobierania ekwipunku' });

    res.json(inventory || []);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera podczas pobierania ekwipunku' });
  }
});

app.post('/api/inventory/swap', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id_1, slot_target, backpack_index_target, item_id_2 } = req.body;

    if (!item_id_1 || !slot_target) return res.status(400).json({ error: 'Brak parametrów' });

    const { data: character } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (!character) return res.status(404).json({ error: 'Postać nie istnieje' });

    const { data: draggedItem } = await supabase.from('inventory').select('*, item_templates(*)').eq('id', item_id_1).eq('character_id', character.id).single();
    if (!draggedItem) return res.status(404).json({ error: 'Brak przedmiotu' });

    if (draggedItem.item_templates.category === 'equipment' && draggedItem.item_templates.req_stats && slot_target !== 'backpack') {
      for (const [stat, requiredValue] of Object.entries(draggedItem.item_templates.req_stats)) {
        const playerStat = BigInt(character[stat] || '1');
        const requiredStat = BigInt(requiredValue);
        if (playerStat < requiredStat) {
          const statNames = { 'strength': 'Siła', 'speed': 'Szybkość', 'endurance': 'Wytrzymałość', 'intelligence': 'Inteligencja', 'mental_strength': 'Siła Mentalna' };
          return res.status(400).json({ error: `Nie spełniasz wymagań! Wymagana ${statNames[stat] || stat}: ${requiredValue}` });
        }
      }
    }

    let wasOccupied = false;
    let targetItem = null;
    
    if (slot_target === 'backpack' && backpack_index_target !== null && backpack_index_target !== undefined) {
      const { data: existingBackpackItem } = await supabase
        .from('inventory').select('*, item_templates(*)').eq('character_id', character.id).is('equipped_slot', null)
        .eq('backpack_index', backpack_index_target).neq('id', item_id_1).maybeSingle();
      if (existingBackpackItem) { targetItem = existingBackpackItem; wasOccupied = true; }
    } else if (slot_target !== 'backpack' && slot_target !== 'bank') {
      const { data: existingItem } = await supabase
        .from('inventory').select('id').eq('character_id', character.id).eq('equipped_slot', slot_target)
        .neq('id', item_id_1).maybeSingle();
      if (existingItem) wasOccupied = true;
    }

    // Walidacja wymagań przedmiotu zakładanego prosto z plecaka
    // Jeśli zdejmujemy przedmiot z ciała do plecaka i zamieniamy się z innym przedmiotem, 
    // musimy sprawdzić, czy gracz spełnia wymogi przedmiotu, który właśnie wyląduje na ciele!
    if (targetItem && draggedItem.equipped_slot !== null && slot_target === 'backpack') {
      if (targetItem.item_templates && targetItem.item_templates.category === 'equipment' && targetItem.item_templates.req_stats) {
        for (const [stat, requiredValue] of Object.entries(targetItem.item_templates.req_stats)) {
          const playerStat = BigInt(character[stat] || '1');
          const requiredStat = BigInt(requiredValue);
          if (playerStat < requiredStat) {
            const statNames = { 'strength': 'Siła', 'speed': 'Szybkość', 'endurance': 'Wytrzymałość', 'intelligence': 'Inteligencja', 'mental_strength': 'Siła Mentalna' };
            return res.status(400).json({ error: `Przedmiot w plecaku wymaga więcej statystyk! Wymagana ${statNames[stat] || stat}: ${requiredValue}` });
          }
        }
      }
    }
    // ===============================

    if (targetItem && draggedItem.item_template_id === targetItem.item_template_id && (draggedItem.item_templates.category === 'consumable' || draggedItem.item_templates.category === 'special_consumable')) {
      const totalQuantity = BigInt(draggedItem.quantity || '1') + BigInt(targetItem.quantity || '1');
      if (totalQuantity <= 99n) {
        await supabase.from('inventory').update({ quantity: totalQuantity.toString() }).eq('id', targetItem.id);
        await supabase.from('inventory').delete().eq('id', item_id_1);
        return res.json({ success: true, message: 'Przedmioty zostały połączone.' });
      } else {
        const overflow = totalQuantity - 99n;
        await supabase.from('inventory').update({ quantity: '99' }).eq('id', targetItem.id);
        await supabase.from('inventory').update({ quantity: overflow.toString() }).eq('id', item_id_1);
        return res.json({ success: true, message: 'Przedmioty zostały połączone (osiągnięto maksymalną ilość).' });
      }
    }

    // Zaktualizowana logika zamiany – baza danych robi teraz wszystko za nas!
    const { error: swapError } = await supabase.rpc('swap_items', {
        p_character_id: character.id, 
        p_item_id_1: item_id_1, 
        p_slot_target: slot_target,
        p_backpack_index_target: backpack_index_target || null, 
        p_item_id_2: item_id_2 || null
    });

    if (swapError) return res.status(500).json({ error: 'Błąd podczas zamiany przedmiotów' });

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

    await supabase.from('characters').update({
        hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString()
    }).eq('id', character.id);

    let responseMessage = 'Akcja wykonana pomyślnie.';
    if (slot_target === 'backpack') {
      responseMessage = wasOccupied ? 'Przedmioty zostały zamienione miejscami.' : 'Przedmiot schowany do plecaka / przeniesiony.';
    } else {
      responseMessage = wasOccupied ? 'Przedmioty zostały zamienione miejscami.' : (draggedItem.equipped_slot !== null ? 'Sprzęt zdjęty.' : 'Sprzęt założony.');
    }

    res.json({ success: true, message: responseMessage, character_updates: { hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString() }});
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera podczas zamiany przedmiotów' });
  }
});

app.post('/api/inventory/consume', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id } = req.body;

    if (!inventory_id) return res.status(400).json({ error: 'Brak parametru' });

    const { data: character } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (!character) return res.status(404).json({ error: 'Nie znaleziono postaci' });

    const { data: item } = await supabase.from('inventory').select('*, item_templates(*)').eq('id', inventory_id).eq('character_id', character.id).single();
    if (!item) return res.status(404).json({ error: 'Nie znaleziono przedmiotu' });

    if (item.item_templates.category !== 'consumable' && item.item_templates.category !== 'special_consumable') {
      return res.status(400).json({ error: 'Ten przedmiot nie jest używalny!' });
    }
    if (item.equipped_slot !== null) return res.status(400).json({ error: 'Zdejmij przedmiot przed użyciem!' });

    const fullStats = await getFullCharacterStats(userId);

    let currentStr = BigInt(fullStats.baseStats.strength || '1');
    let currentTech = BigInt(fullStats.baseStats.technique || '1');
    let currentInt = BigInt(fullStats.baseStats.intelligence || '1');
    let currentEnd = BigInt(fullStats.baseStats.endurance || '1');
    let currentSpd = BigInt(fullStats.baseStats.speed || '1');
    let currentMen = BigInt(fullStats.baseStats.mental_strength || '1');
    const currentBonusStamina = BigInt(character.bonus_stamina || '0');
    
    let maxHp = BigInt(fullStats.max_hp);
    let maxMp = BigInt(fullStats.max_mp);
    const maxStamina = BigInt(fullStats.max_stamina);

    let currentHp = BigInt(character.hp ?? '100');
    let currentMp = BigInt(character.mp ?? '100');
    let currentStamina = BigInt(character.stamina ?? '100');
    let currentCoins = BigInt(character.coins ?? '0');
    let newBonusStamina = BigInt(fullStats.baseStats.bonus_stamina);

    const effects = item.item_templates.consumable_effect;
    if (!effects) return res.status(400).json({ error: 'Brak efektów!' });

    let effectMessages = [];

    for (const [effect, value] of Object.entries(effects)) {
      if (effect === 'restore_hp') {
        currentHp = minBigInt(maxHp, currentHp + BigInt(value)); effectMessages.push(`+${value} HP`);
      } else if (effect === 'restore_mp') {
        currentMp = minBigInt(maxMp, currentMp + BigInt(value)); effectMessages.push(`+${value} MP`);
      } else if (effect === 'restore_stamina') {
        currentStamina = minBigInt(maxStamina, currentStamina + BigInt(value)); effectMessages.push(`+${value} Staminy`);
      } else if (effect === 'restore_hp_pct') {
        currentHp = minBigInt(maxHp, currentHp + (maxHp * BigInt(value)) / 100n); effectMessages.push(`+${value}% HP`);
      } else if (effect === 'restore_mp_pct') {
        currentMp = minBigInt(maxMp, currentMp + (maxMp * BigInt(value)) / 100n); effectMessages.push(`+${value}% MP`);
      } else if (effect === 'add_coins') { // <--- NOWE: SAKWY Z MONETAMI
        currentCoins = currentCoins + BigInt(value); effectMessages.push(`+${value} Monet`);
      } else if (effect === 'restore_stamina_pct') {
        currentStamina = minBigInt(maxStamina, currentStamina + (maxStamina * BigInt(value)) / 100n); effectMessages.push(`+${value}% Staminy`);
      } else if (effect === 'bonus_stamina') {
        newBonusStamina = currentBonusStamina + BigInt(value);
        if (newBonusStamina > 900n) return res.status(400).json({ error: 'Osiągnięto limit (900)!' });
        effectMessages.push(`+${value} Max Staminy`);
      } else if (effect === 'hospital_exit_recovery' || effect === 'full_resurrection') {
        currentHp = maxHp; currentMp = maxMp; currentStamina = maxStamina; effectMessages.push('Odzyskano 100% zasobów');
        if (BigInt(character.hp || '0') <= 0n) {
            if (character.last_death_penalty) {
                const dp = character.last_death_penalty;
                currentStr += BigInt(dp.strength || '0'); currentSpd += BigInt(dp.speed || '0');
                currentEnd += BigInt(dp.endurance || '0'); currentInt += BigInt(dp.intelligence || '0');
                currentMen += BigInt(dp.mental_strength || '0');

                const totalStr = currentStr + BigInt(fullStats.equipStats.strength || '0');
                const totalInt = currentInt + BigInt(fullStats.equipStats.intelligence || '0');
                
                maxHp = 100n + (totalStr / 20n) + BigInt(character.bonus_hp || '0') + BigInt(fullStats.equipStats.bonus_hp || '0');
                maxMp = 100n + (totalInt / 5n) + BigInt(character.bonus_mp || '0') + BigInt(fullStats.equipStats.bonus_mp || '0');
                
                currentHp = maxHp; currentMp = maxMp;
                effectMessages.push('Przebudzenie! Zwrócono statystyki.');
            } else { effectMessages.push('Wskrzeszenie!'); }
            req.clearHospital = true;
        }
      } else if (effect === 'restore_hp' && value === 'full') {
        currentHp = maxHp; effectMessages.push('Pełne HP');
      } else if (effect === 'restore_mp' && value === 'full') {
        currentMp = maxMp; effectMessages.push('Pełne MP');
      } else if (effect === 'restore_stamina' && value === 'full') {
        currentStamina = maxStamina; effectMessages.push('Pełna Stamina');
      } else if (effect === 'permanent_bonus') {
        const updateData = {};
        for (const [stat, statValue] of Object.entries(value)) {
          updateData[stat] = (BigInt(character[stat] || '1') + BigInt(statValue)).toString();
          effectMessages.push(`+${statValue} ${stat}`);
        }
        await supabase.from('characters').update(updateData).eq('id', character.id);
      }
    }

    const originalHp = BigInt(character.hp ?? '100');
    const originalMp = BigInt(character.mp ?? '100');
    const originalStamina = BigInt(character.stamina ?? '100');
    const originalBonusStamina = BigInt(character.bonus_stamina ?? '0');
    const hasPermanentEffects = effects.permanent_bonus || effects.bonus_stamina || ((effects.hospital_exit_recovery || effects.full_resurrection) && originalHp <= 0n);
    
    if (currentHp === originalHp && currentMp === originalMp && currentStamina === originalStamina && currentCoins === BigInt(character.coins || '0') && !hasPermanentEffects) {
      return res.json({ success: false, status: 'warning', message: 'Twoje zasoby są już w pełni odnowione, szkoda marnować przedmiotu!' });
    }

    if (BigInt(item.quantity) > 1n) {
      await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - 1n).toString() }).eq('id', inventory_id);
    } else {
      await supabase.from('inventory').delete().eq('id', inventory_id);
    }

    const updateData = {
        hp: currentHp.toString(), mp: currentMp.toString(), stamina: currentStamina.toString(), coins: currentCoins.toString(),
        bonus_stamina: newBonusStamina.toString(), strength: currentStr.toString(), speed: currentSpd.toString(),
        endurance: currentEnd.toString(), technique: currentTech.toString(), intelligence: currentInt.toString(), mental_strength: currentMen.toString()
    };

    if (req.clearHospital) { updateData.hospital_until = null; updateData.last_death_penalty = null; }
    await supabase.from('characters').update(updateData).eq('id', character.id);

    res.json({ success: true, message: `Użyto ${item.item_templates.name}! ${effectMessages.join(', ')}`, effects: effectMessages, character_updates: { hp: currentHp.toString(), mp: currentMp.toString(), stamina: currentStamina.toString(), bonus_stamina: newBonusStamina.toString(), coins: (character.coins || '0').toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ==========================================
// ⚔️ 4. SYSTEM MISJI I DROPÓW
// ==========================================
app.post('/api/missions/start', authenticateToken, requireAlive, async (req, res) => {
  try {
    const { missionId } = req.body;
    const userId = req.user.id;

    const fullStats = await getFullCharacterStats(userId);
    const character = fullStats.character;

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) return res.status(404).json({ error: 'Nie znaleziono misji' });
    if (BigInt(character.stamina ?? '0') < BigInt(mission.stamina_cost)) return res.status(400).json({ status: 'error', message: 'Nie masz staminy!' });

    const completedMissions = character.completed_missions || [];
    const attemptedOneTry = character.attempted_one_try_missions || [];

    if (mission.is_repeatable === false && completedMissions.includes(missionId)) {
        return res.status(400).json({ status: 'error', message: 'Ta misja została już przez Ciebie ukończona!' });
    }
    if (mission.is_one_try === true && attemptedOneTry.includes(missionId)) {
        return res.status(400).json({ status: 'error', message: 'Wykorzystałeś już swoją jedyną szansę w tej misji!' });
    }

    const reqStats = mission.req_stats || {};
    let totalCappedRatio = 0n; // Do średniej szansy
    let reqCount = 0n;

    const effectiveStr = BigInt(fullStats.baseStats.strength) + BigInt(fullStats.equipStats.strength || '0');
    const effectiveSpd = BigInt(fullStats.baseStats.speed) + BigInt(fullStats.equipStats.speed || '0');
    const effectiveEnd = BigInt(fullStats.baseStats.endurance) + BigInt(fullStats.equipStats.endurance || '0');

    let lowestRawPlayerStat = -1n;
    let reqStatForThreshold = 1n;

    ['strength', 'speed', 'endurance', 'technique'].forEach(stat => {
      if (reqStats[stat] && reqStats[stat] > 0) {
        let playerStat = 1n;
        if (stat === 'strength') playerStat = effectiveStr;
        if (stat === 'speed') playerStat = effectiveSpd;
        if (stat === 'endurance') playerStat = effectiveEnd;
        if (stat === 'technique') playerStat = BigInt(fullStats.baseStats.technique) + BigInt(fullStats.equipStats.technique || '0');
        
        const reqStat = BigInt(reqStats[stat]);
        const rawRatio = (playerStat * 100n) / reqStat;
        
        // 1. Zabezpieczenie dla kar (Diminishing Returns) - Wyciągamy SUROWE punkty najsłabszej statystyki
        if (lowestRawPlayerStat === -1n || playerStat < lowestRawPlayerStat) {
            lowestRawPlayerStat = playerStat;
            reqStatForThreshold = reqStat;
        }
        
        // 2. Realna szansa na sukces (każda statystyka max 100% udziału)
        totalCappedRatio += minBigInt(100n, rawRatio);
        reqCount += 1n;
      }
    });
    
    // Średnia szansa na sukces
    let successChance = reqCount > 0n ? (totalCappedRatio / reqCount) : 100n;

    const currentStr = BigInt(fullStats.baseStats.strength);
    const currentSpd = BigInt(fullStats.baseStats.speed);
    const currentEnd = BigInt(fullStats.baseStats.endurance);

    // KROK 4.7.2: Kary za Potęgę (Diminishing Returns)
    let rewardMultiplier = 100n;
    let boredomInjuryChance = 20n;
    
    if (lowestRawPlayerStat !== -1n) {
        if (lowestRawPlayerStat >= (reqStatForThreshold * 8n) + 100n) {
            rewardMultiplier = 10n; // Duża kara
            boredomInjuryChance = 0n;
        } else if (lowestRawPlayerStat >= (reqStatForThreshold * 4n) + 40n) {
            rewardMultiplier = 50n; // Średnia kara
            boredomInjuryChance = 5n;
        } else if (lowestRawPlayerStat >= (reqStatForThreshold * 2n) + 15n) {
            rewardMultiplier = 75n; // Mała kara
            boredomInjuryChance = 10n;
        }
    }
    // Brak kary - pozostaje 100% i 20% szansy na rany z nudów

    const currentInt = BigInt(fullStats.baseStats.intelligence);
    const currentMen = BigInt(fullStats.baseStats.mental_strength);
    const currentTech = BigInt(fullStats.baseStats.technique);
    
    let newStamina = BigInt(character.stamina || '0') - BigInt(mission.stamina_cost);
    const roll = Math.random() * 100;

    const maxHp = BigInt(fullStats.max_hp);
    const maxMp = BigInt(fullStats.max_mp);
    const maxStamina = BigInt(fullStats.max_stamina);

    if (roll > Number(successChance)) {
      // KROK 4.7.1: Kara za Pychę (Porażka w misji < 100% szans)
      
      // Obrażenia HP/MP/Staminy: 5% + (100% - szansa_na_sukces)
      const damagePercent = 5n + (100n - successChance);

      let newHp = maxBigInt(0n, BigInt(character.hp || '100') - ((maxHp * damagePercent) / 100n));
      let newMp = maxBigInt(0n, BigInt(character.mp || '100') - ((maxMp * damagePercent) / 100n));
      newStamina = maxBigInt(0n, newStamina - ((maxStamina * damagePercent) / 100n));

      // Utrata statystyk i monet w zależności od szansy na sukces
      let penaltyMultiplier = 2n; // domyślnie 2x
      if (successChance >= 40n && successChance <= 79n) {
          penaltyMultiplier = 3n; // Średnia kara
      } else if (successChance <= 39n) {
          penaltyMultiplier = 4n; // Duża kara
      }
      
      // HYBRYDOWY PODZIAŁ KARY (50% sztywne, 50% losowe)
      const baseReward = maxBigInt(1n, BigInt(mission.reward_stats?.min || '1'));
      const totalStatLossNum = Number(baseReward * penaltyMultiplier);
      
      // Wyliczamy bezpieczną bazę (50% całości podzielone na 4 statystyki)
      let guaranteedPool = Math.floor(totalStatLossNum * 0.5); 
      let randomPool = totalStatLossNum - guaranteedPool;
      
      let guaranteedPerStat = Math.floor(guaranteedPool / 4);
      let guaranteedRemainder = guaranteedPool - (guaranteedPerStat * 4);

      // Losujemy resztę z "wirtualnego worka"
      let r1 = Math.random(); let r2 = Math.random(); let r3 = Math.random(); let r4 = Math.random();
      const sumR = r1 + r2 + r3 + r4;
      
      let randStr = Math.floor(randomPool * (r1 / sumR));
      let randSpd = Math.floor(randomPool * (r2 / sumR));
      let randEnd = Math.floor(randomPool * (r3 / sumR));
      let randTech = randomPool - randStr - randSpd - randEnd;

      // Sumujemy gwarantowane + losowe (i rzutujemy z powrotem na BigInt dla bazy)
      const strLoss = BigInt(Math.max(1, guaranteedPerStat + randStr));
      const spdLoss = BigInt(Math.max(1, guaranteedPerStat + randSpd));
      const endLoss = BigInt(Math.max(1, guaranteedPerStat + randEnd));
      const techLoss = BigInt(Math.max(1, guaranteedPerStat + guaranteedRemainder + randTech)); // <-- TECHNIKA
      
      // Utrata monet
      const baseCoinsReward = maxBigInt(1n, BigInt(mission.reward_coins_min || '1'));
      const coinsLost = maxBigInt(0n, (baseCoinsReward * penaltyMultiplier));
      const newCoins = maxBigInt(0n, BigInt(character.coins || '0') - coinsLost);

      const finalStr = maxBigInt(1n, currentStr - strLoss);
      const finalSpd = maxBigInt(1n, currentSpd - spdLoss);
      const finalEnd = maxBigInt(1n, currentEnd - endLoss);
      const finalTech = maxBigInt(1n, currentTech - techLoss); // <-- TECHNIKA
      const finalInt = currentInt; // Inteligencja nie jest tracona przy porażce
      const finalMen = currentMen; // Siła Mentalna nie jest tracona przy porażce

      const statsLostLog = {
          strength: strLoss.toString(), speed: spdLoss.toString(),
          endurance: endLoss.toString(), technique: techLoss.toString(), // <-- TECHNIKA
          intelligence: '0', mental_strength: '0'
      };

      const isDead = newHp <= 0n;

          if (isDead) {
            // Wyliczenie % kary na podstawie Poziomu Mocy (Hubris System)
            const pl = BigInt(fullStats.powerLevel);
            let deathPenaltyPct = 2n;
            if (pl > 10000000n) deathPenaltyPct = 10n;
            else if (pl > 1000000n) deathPenaltyPct = 8n;
            else if (pl > 100000n) deathPenaltyPct = 6n;
            else if (pl > 10000n) deathPenaltyPct = 4n;

            // 1. Utrata 10% obecnych Monet (min 1 moneta straty, chyba że ma 0)
            const currentCoinsBeforeLoss = BigInt(character.coins || '0');
            const deathCoinsLost = currentCoinsBeforeLoss > 0n ? maxBigInt(1n, (currentCoinsBeforeLoss * 10n) / 100n) : 0n;
            const deathNewCoins = currentCoinsBeforeLoss - deathCoinsLost;

            // 2. Utrata procentowa ze WSZYSTKICH 5 statystyk bazowych + Techniki
            const deathStrLoss = (currentStr * deathPenaltyPct) / 100n;
            const deathSpdLoss = (currentSpd * deathPenaltyPct) / 100n;
            const deathEndLoss = (currentEnd * deathPenaltyPct) / 100n;
            const deathTechLoss = (currentTech * deathPenaltyPct) / 100n; // <-- TECHNIKA
            const deathIntLoss = (currentInt * deathPenaltyPct) / 100n;
            const deathMenLoss = (currentMen * deathPenaltyPct) / 100n;

            const deathFinalStr = maxBigInt(1n, currentStr - deathStrLoss);
            const deathFinalSpd = maxBigInt(1n, currentSpd - deathSpdLoss);
            const deathFinalEnd = maxBigInt(1n, currentEnd - deathEndLoss);
            const deathFinalTech = maxBigInt(1n, currentTech - deathTechLoss); // <-- TECHNIKA
            const deathFinalInt = maxBigInt(1n, currentInt - deathIntLoss);
            const deathFinalMen = maxBigInt(1n, currentMen - deathMenLoss);

            const hospitalMinutes = Math.min(120, 5 + Math.floor(Math.pow(Number(pl), 0.25)));
            const exactEndMs = Date.now() + hospitalMinutes * 60000;
            const hospitalUntilUTC = new Date(exactEndMs).toISOString();

            const deathStatsLostLog = {
                strength: deathStrLoss.toString(),
                speed: deathSpdLoss.toString(),
                endurance: deathEndLoss.toString(),
                technique: deathTechLoss.toString(), // <-- TECHNIKA
                intelligence: deathIntLoss.toString(),
                mental_strength: deathMenLoss.toString(),
                hospital_end_ms: exactEndMs.toString(),
                source: 'mission'
            };

            await supabase.from('characters').update({
                hp: '0', mp: '0', stamina: newStamina.toString(), coins: deathNewCoins.toString(),
                strength: deathFinalStr.toString(), speed: deathFinalSpd.toString(), endurance: deathFinalEnd.toString(),
                technique: deathFinalTech.toString(), // <-- TECHNIKA
                intelligence: deathFinalInt.toString(), mental_strength: deathFinalMen.toString(),
                last_death_penalty: deathStatsLostLog, hospital_until: hospitalUntilUTC, current_form: 'Stan Podstawowy',
                attempted_one_try_missions: (mission.is_one_try === true && !attemptedOneTry.includes(missionId)) ? [...attemptedOneTry, missionId] : attemptedOneTry
            }).eq('profile_id', userId);

            return res.json({ 
              result: 'death', 
              message: `KRYTYCZNA PORAŻKA! Szpital na ${hospitalMinutes} min.`, 
              penalty: { 
                coins_lost: deathCoinsLost.toString(), 
                hospital_minutes: hospitalMinutes, 
                stats_lost: deathStatsLostLog, 
                hospital_until: hospitalUntilUTC 
              } 
            });
          } else {
        await supabase.from('characters').update({
            hp: newHp.toString(), mp: newMp.toString(), stamina: newStamina.toString(), coins: newCoins.toString(),
            strength: finalStr.toString(), speed: finalSpd.toString(), endurance: finalEnd.toString(),
            technique: finalTech.toString(), // <-- TECHNIKA
            intelligence: finalInt.toString(), mental_strength: finalMen.toString(),
            attempted_one_try_missions: (mission.is_one_try === true && !attemptedOneTry.includes(missionId)) ? [...attemptedOneTry, missionId] : attemptedOneTry
        }).eq('profile_id', userId);

        return res.json({ result: 'hurt', message: `PORAŻKA! Obrażenia: ${damagePercent}%`, damage: { hp: ((maxHp * damagePercent) / 100n).toString(), mp: ((maxMp * damagePercent) / 100n).toString(), stamina: ((maxStamina * damagePercent) / 100n).toString() }, penalty: { coins_lost: coinsLost.toString(), stats_lost: statsLostLog } });
      }
    }

    const minC = BigInt(mission.reward_coins_min || '0'); 
    const maxC = BigInt(mission.reward_coins_max || '0');
    
    // Obliczamy bazę (z uwzględnieniem ewentualnej kary za potęgę z rewardMultiplier)
    let finalCoinsBase = ((minC + BigInt(Math.floor(Math.random() * Number(maxC - minC + 1n)))) * rewardMultiplier) / 100n;

    // Pobieramy bonusy z ekwipunku do zarobków
    const equipCoinBonusFlat = BigInt(fullStats.equipStats.bonus_coins || '0'); // Płaski bonus (np. Opaska Nowicjusza)
    const trainingCoinBonusPct = BigInt(fullStats.trainingStats.bonus_coins_pct || '0'); // Bonus % (np. Ciężka Opaska)

    // Finalna kwota: (Baza + Bonus % za ciężki sprzęt) + Płaski bonus za sprzęt pasywny
    let trainingCoinBonusValue = 0n;
    if (trainingCoinBonusPct > 0n) {
        trainingCoinBonusValue = (finalCoinsBase * trainingCoinBonusPct) / 100n;
        // Gwarantujemy minimum 1 monetę bonusu, by zniwelować ucinanie przez BigInt
        if (trainingCoinBonusValue === 0n) trainingCoinBonusValue = 1n; 
    }
    
    const finalCoins = finalCoinsBase + trainingCoinBonusValue + equipCoinBonusFlat;
    const newCoins = BigInt(character.coins || '0') + finalCoins;

    const minS = BigInt(mission.reward_stats?.min || '0'); const maxS = BigInt(mission.reward_stats?.max || '0');
    const finalStats = maxBigInt(1n, (maxBigInt(1n, minS + BigInt(Math.floor(Math.random() * Number(maxS - minS + 1n)))) * rewardMultiplier) / 100n);

    let lowestStat = 'strength'; let minVal = currentStr;
    if (currentSpd < minVal) { lowestStat = 'speed'; minVal = currentSpd; }
    if (currentEnd < minVal) { lowestStat = 'endurance'; minVal = currentEnd; }
    if (currentTech < minVal) { lowestStat = 'technique'; minVal = currentTech; }

    let gainStr = 0n; let gainSpd = 0n; let gainEnd = 0n; let gainTech = 0n;
    if (finalStats < 10n) {
        const baseGain = finalStats / 4n; 
        gainStr = baseGain; gainSpd = baseGain; gainEnd = baseGain; gainTech = baseGain;
        const localRem = Number(finalStats % 4n);
        if (localRem > 0) {
            let targets = [0, 1, 2, 3].sort(() => 0.5 - Math.random());
            if (lowestStat === 'strength') targets = [0, ...targets.filter(t => t !== 0)];
            else if (lowestStat === 'speed') targets = [1, ...targets.filter(t => t !== 1)];
            else if (lowestStat === 'endurance') targets = [2, ...targets.filter(t => t !== 2)];
            else targets = [3, ...targets.filter(t => t !== 3)];
            for (let i = 0; i < localRem; i++) { 
                if (targets[i] === 0) gainStr += 1n; 
                else if (targets[i] === 1) gainSpd += 1n; 
                else if (targets[i] === 2) gainEnd += 1n; 
                else if (targets[i] === 3) gainTech += 1n; 
            }
        }
    } else {
        const sumW = BigInt((lowestStat === 'strength' ? 100 : 50) + (lowestStat === 'speed' ? 100 : 50) + (lowestStat === 'endurance' ? 100 : 50) + (lowestStat === 'technique' ? 100 : 50));
        gainStr = (finalStats * BigInt(lowestStat === 'strength' ? 100 : 50)) / sumW;
        gainSpd = (finalStats * BigInt(lowestStat === 'speed' ? 100 : 50)) / sumW;
        gainEnd = (finalStats * BigInt(lowestStat === 'endurance' ? 100 : 50)) / sumW;
        gainTech = (finalStats * BigInt(lowestStat === 'technique' ? 100 : 50)) / sumW;
        const rem = finalStats - (gainStr + gainSpd + gainEnd + gainTech);
        if (lowestStat === 'strength') gainStr += rem; 
        else if (lowestStat === 'speed') gainSpd += rem; 
        else if (lowestStat === 'endurance') gainEnd += rem;
        else gainTech += rem;
    }

    // Sprzęt treningowy nie nalicza bonusów w przypadku porażki
    let trainGainStr = 0n; let trainGainSpd = 0n; let trainGainEnd = 0n; let trainGainTech = 0n;
    let trainGainBonusHp = 0n; let trainGainBonusMp = 0n;
    
    // Tylko przy sukcesie naliczamy bonusy treningowe
    if (fullStats.trainingStats && roll <= Number(successChance)) {
        if (BigInt(fullStats.trainingStats.strength || '0') > 0n) trainGainStr = maxBigInt(1n, (BigInt(fullStats.trainingStats.strength) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.speed || '0') > 0n) trainGainSpd = maxBigInt(1n, (BigInt(fullStats.trainingStats.speed) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.endurance || '0') > 0n) trainGainEnd = maxBigInt(1n, (BigInt(fullStats.trainingStats.endurance) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.technique || '0') > 0n) trainGainTech = maxBigInt(1n, (BigInt(fullStats.trainingStats.technique) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.bonus_hp || '0') > 0n) trainGainBonusHp = maxBigInt(1n, (BigInt(fullStats.trainingStats.bonus_hp) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.bonus_mp || '0') > 0n) trainGainBonusMp = maxBigInt(1n, (BigInt(fullStats.trainingStats.bonus_mp) * rewardMultiplier) / 100n);
    }

    const newStr = currentStr + gainStr + trainGainStr;
    const newSpd = currentSpd + gainSpd + trainGainSpd;
    const newEnd = currentEnd + gainEnd + trainGainEnd;
    const newTech = currentTech + gainTech + trainGainTech;
    const newBonusHp = BigInt(character.bonus_hp || '0') + trainGainBonusHp;
    const newBonusMp = BigInt(character.bonus_mp || '0') + trainGainBonusMp;

    // KROK 4.7.2: Sprawdzenie Wydarzenia Losowego po sukcesie
    let finalHp = BigInt(character.hp || '100');
    let finalMp = BigInt(character.mp || '100');
    let finalStamina = newStamina;
    let appliedBoredomDamage = 0n;
    
    if (roll <= Number(successChance) && Math.random() * 100 < Number(boredomInjuryChance)) {
        appliedBoredomDamage = maxBigInt(1n, (maxHp * 10n) / 100n);
        finalHp = maxBigInt(1n, BigInt(character.hp || '100') - appliedBoredomDamage);
        finalStamina = newStamina;
    } else {
        finalHp = BigInt(character.hp || '100');
        finalMp = BigInt(character.mp || '100');
        finalStamina = newStamina;
    }

    // === SYSTEM DROPÓW W MISJACH (KROK 4.8) ===
    let droppedItems = [];
    let lostDrops = []; // Nowa tablica na utracone przedmioty z powodu braku miejsca
    if (mission.drop_table && mission.drop_table.length > 0 && roll <= Number(successChance)) {
        // Obliczenie dynamicznego plecaka za pomocą globalnej funkcji
        const maxBackpackSlots = calculateMaxBackpackSlots({ strength: currentStr, speed: currentSpd, endurance: currentEnd });

        // Pobranie aktualnego plecaka gracza
        const { data: currentInventory } = await supabase
            .from('inventory')
            .select('*, item_templates(*)')
            .eq('character_id', character.id)
            .is('equipped_slot', null);

        const backpackItems = currentInventory || [];

        for (const drop of mission.drop_table) {
            const dropRoll = Math.floor(Math.random() * 100) + 1;
            
            if (dropRoll <= drop.chance_pct) {
                // Pobranie danych przedmiotu
                const { data: itemTemplate } = await supabase
                    .from('item_templates')
                    .select('*')
                    .eq('id', drop.item_id)
                    .single();

                if (!itemTemplate) continue;

                // Twarda Zasada Anty-Klonowania
                if (itemTemplate.category === 'special_consumable') {
                    const hasInBackpack = backpackItems.some(i => i.item_template_id === itemTemplate.id);
                    
                    let alreadyUnlocked = false;
                    const effect = itemTemplate.consumable_effect || {};
                    const unlockedForms = character.unlocked_forms || [];
                    const unlockedSkills = character.unlocked_skills || [];

                    if (effect.unlock_form && unlockedForms.includes(effect.unlock_form)) alreadyUnlocked = true;
                    if (effect.unlock_skill && unlockedSkills.includes(effect.unlock_skill)) alreadyUnlocked = true;

                    if (hasInBackpack || alreadyUnlocked) {
                        continue; // Drop przepada na zawsze
                    }
                }

                // Logika dodawania do plecaka
                const isStackable = itemTemplate.category === 'consumable' || itemTemplate.category === 'special_consumable';
                const existingStack = backpackItems.find(i => i.item_template_id === itemTemplate.id && BigInt(i.quantity) < 99n);

                if (isStackable && existingStack) {
                    // Dodaj do istniejącego stosu
                    await supabase.from('inventory')
                        .update({ quantity: (BigInt(existingStack.quantity) + 1n).toString() })
                        .eq('id', existingStack.id);
                        
                    droppedItems.push({ name: itemTemplate.name, quantity: 1 });
                    existingStack.quantity = (BigInt(existingStack.quantity) + 1n).toString();
                } else {
                    // Szukaj wolnego slota (do wyliczonego limitu)
                    const occupiedIndexes = backpackItems.map(i => i.backpack_index);
                    let freeIdx = 1;
                    while (occupiedIndexes.includes(freeIdx)) freeIdx++;

                    if (freeIdx <= maxBackpackSlots) {
                        const newItem = {
                            character_id: character.id,
                            item_template_id: itemTemplate.id,
                            quantity: '1',
                            equipped_slot: null,
                            backpack_index: freeIdx
                        };
                        await supabase.from('inventory').insert(newItem);
                        droppedItems.push({ name: itemTemplate.name, quantity: 1 });
                        backpackItems.push(newItem); 
                    } else {
                        // Rejestrujemy utracony drop, aby wysłać info do gracza
                        lostDrops.push(itemTemplate.name);
                    }
                }
            }
        }
    }
    // ==========================================

    let newCompleted = [...completedMissions];
    let newAttempted = [...attemptedOneTry];
    let newUnlockedFeatures = character.unlocked_features || []; // Pobieramy obecne odblokowania
    
    // Każda pierwsza wygrana (nawet powtarzalna) musi trafić do completed, 
    // aby odblokować graczowi kolejną misję na liście!
    if (!newCompleted.includes(missionId)) newCompleted.push(missionId);
    
    // Zapisujemy próbę dla misji One-Try
    if (mission.is_one_try === true && !newAttempted.includes(missionId)) newAttempted.push(missionId);

    // SYSTEM ODBLOKOWAŃ GDD (Oparte o prawdziwe UUID z bazy - w 100% odporne na zmiany nazw)
    const STORY_MISSIONS_IDS = {
        TRAINING: '00000000-0000-0000-0000-000000000005', 
        WORK: '10000000-0000-0000-0000-000000000006',
        SPECIAL_TASKS: '10000000-0000-0000-0000-000000000010',
        LABORATORY: '10000000-0000-0000-0000-000000000015',
        MEDITATION: '10000000-0000-0000-0000-000000000020',
        PVP: '00000000-0000-0000-0000-000000000025'
    };

    if (missionId === STORY_MISSIONS_IDS.TRAINING && !newUnlockedFeatures.includes('training')) newUnlockedFeatures.push('training');
    if (missionId === STORY_MISSIONS_IDS.WORK && !newUnlockedFeatures.includes('work')) newUnlockedFeatures.push('work');
    if (missionId === STORY_MISSIONS_IDS.SPECIAL_TASKS && !newUnlockedFeatures.includes('special_tasks')) newUnlockedFeatures.push('special_tasks');
    if (missionId === STORY_MISSIONS_IDS.LABORATORY && !newUnlockedFeatures.includes('laboratory')) newUnlockedFeatures.push('laboratory');
    if (missionId === STORY_MISSIONS_IDS.MEDITATION && !newUnlockedFeatures.includes('meditation')) newUnlockedFeatures.push('meditation');
    if (missionId === STORY_MISSIONS_IDS.PVP && !newUnlockedFeatures.includes('pvp')) newUnlockedFeatures.push('pvp');

    await supabase.from('characters').update({
        coins: newCoins.toString(), strength: newStr.toString(), speed: newSpd.toString(), endurance: newEnd.toString(), 
        technique: newTech.toString(),
        hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString(),
        bonus_hp: newBonusHp.toString(), bonus_mp: newBonusMp.toString(),
        completed_missions: newCompleted,
        attempted_one_try_missions: newAttempted,
        unlocked_features: newUnlockedFeatures 
      }).eq('profile_id', userId);

    res.json({ 
      result: 'success', message: 'Sukces!', multiplier: Number(rewardMultiplier),
      rewards: { 
        coins: finalCoins.toString(), 
        base_coins: finalCoinsBase.toString(), 
        bonus_coins_passive: equipCoinBonusFlat.toString(), 
        bonus_coins_training: trainingCoinBonusValue.toString(), 
        stats_gained: finalStats.toString(),
        boredom_damage: appliedBoredomDamage.toString(),
        dropped_items: droppedItems, 
        lost_items: lostDrops,
        gains: { strength: gainStr.toString(), speed: gainSpd.toString(), endurance: gainEnd.toString(), technique: gainTech.toString() },
        training_gains: { 
            strength: trainGainStr.toString(), speed: trainGainSpd.toString(), endurance: trainGainEnd.toString(), technique: trainGainTech.toString(),
            bonus_hp: trainGainBonusHp.toString(), bonus_mp: trainGainBonusMp.toString()
        }
      }
    });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera podczas rozpoczynania misji' }); }
});

app.post('/api/inventory/split', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount_to_split } = req.body;

    if (!inventory_id || !amount_to_split) return res.status(400).json({ error: 'Brak parametrów' });

    const { data: character } = await supabase.from('characters').select('id').eq('profile_id', userId).single();
    if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    // [POPRAWKA] Dynamiczne sprawdzanie pojemności
    const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
    const maxSlots = calculateMaxBackpackSlots(charStats);

    const { data: backpackItems } = await supabase.from('inventory').select('id, backpack_index').eq('character_id', character.id).is('equipped_slot', null);
    if (backpackItems.length >= maxSlots) return res.status(400).json({ error: 'Brak miejsca w plecaku!' });

    const { data: item } = await supabase.from('inventory').select('*').eq('id', inventory_id).eq('character_id', character.id).single();
    if (!item) return res.status(404).json({ error: 'Nie znaleziono' });
    if (item.equipped_slot !== null) return res.status(400).json({ error: 'Nie można dzielić założonych!' });

    const splitAmount = BigInt(amount_to_split);
    if (BigInt(item.quantity) <= splitAmount || splitAmount <= 0n) return res.status(400).json({ error: 'Zła ilość!' });

    await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - splitAmount).toString() }).eq('id', inventory_id);

    const occupiedIndexes = backpackItems.map(i => i.backpack_index);
    let firstFreeIndex = 1;
    while (occupiedIndexes.includes(firstFreeIndex)) firstFreeIndex++;
    
    await supabase.from('inventory').insert({ character_id: character.id, item_template_id: item.item_template_id, quantity: splitAmount.toString(), equipped_slot: null, backpack_index: firstFreeIndex });

    res.json({ success: true, message: 'Przedmiot został podzielony!' });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// ==========================================
// 🛒 5. SYSTEM SKLEPU (KUPOWANIE I SPRZEDAWANIE)
// ==========================================
app.get('/api/shop/items', authenticateToken, async (req, res) => {
  try {
    const { data } = await supabase.from('item_templates').select('*').not('buy_price_coins', 'is', null).order('buy_price_coins', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

app.post('/api/shop/buy', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { template_id, quantity = 1 } = req.body;

    const { data: character } = await supabase.from('characters').select('id, coins').eq('profile_id', userId).single();
    const { data: itemTemplate } = await supabase.from('item_templates').select('*, buy_price_coins').eq('id', template_id).single();

    if (!character || !itemTemplate || itemTemplate.buy_price_coins === null) return res.status(400).json({ error: 'Błąd zakupu' });

    const totalCost = BigInt(itemTemplate.buy_price_coins) * BigInt(quantity);
    if (BigInt(character.coins || '0') < totalCost) return res.status(400).json({ error: 'Nie masz monet!' });

    const { data: backpackItems } = await supabase.from('inventory').select('id, item_template_id, quantity, backpack_index').eq('character_id', character.id).is('equipped_slot', null);
    
    // [POPRAWKA] Dynamiczne sprawdzanie pojemności
    const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
    const maxSlots = calculateMaxBackpackSlots(charStats);

    const existingItem = backpackItems.find(item => item.item_template_id === template_id);
    const isStackable = itemTemplate.category === 'consumable' || itemTemplate.category === 'special_consumable';
    if (!existingItem || !isStackable) { if (backpackItems.length >= maxSlots) return res.status(400).json({ error: 'Pełny plecak!' }); }

    await supabase.from('characters').update({ coins: (BigInt(character.coins || '0') - totalCost).toString() }).eq('id', character.id);

    if (existingItem && isStackable) {
      await supabase.from('inventory').update({ quantity: (BigInt(existingItem.quantity) + BigInt(quantity)).toString() }).eq('id', existingItem.id);
    } else {
      const occupied = backpackItems.map(i => i.backpack_index); let freeIdx = 1; while (occupied.includes(freeIdx)) freeIdx++;
      await supabase.from('inventory').insert({ character_id: character.id, item_template_id: template_id, quantity: quantity, equipped_slot: null, backpack_index: freeIdx });
    }
    res.json({ success: true, message: `Kupiono x${quantity}!`, item: { name: itemTemplate.name, quantity: quantity, total_cost: totalCost.toString() }});
  } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

app.post('/api/shop/sell', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount } = req.body;

    const { data: character } = await supabase.from('characters').select('id, coins').eq('profile_id', userId).single();
    const { data: item } = await supabase.from('inventory').select('*, item_templates(*)').eq('id', inventory_id).eq('character_id', character.id).is('equipped_slot', null).single();

    if (!item || item.item_templates.buy_price_coins === null) return res.status(400).json({ error: 'Nie można sprzedać' });

    const sellQuantity = (!amount || amount === 'all') ? BigInt(item.quantity) : minBigInt(BigInt(amount), BigInt(item.quantity));
    const totalSellPrice = (BigInt(item.item_templates.buy_price_coins) / 2n) * sellQuantity;

    await supabase.from('characters').update({ coins: (BigInt(character.coins || '0') + totalSellPrice).toString() }).eq('id', character.id);

    if (sellQuantity === BigInt(item.quantity)) await supabase.from('inventory').delete().eq('id', inventory_id);
    else await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - sellQuantity).toString() }).eq('id', inventory_id);

    res.json({ success: true, message: `Sprzedano za ${totalSellPrice}!`, item: { name: item.item_templates.name, quantity: sellQuantity.toString(), total_sell_price: totalSellPrice.toString() }});
  } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

// ==========================================
// 🏦 6. SYSTEM BANKU I SKRYTKI
// ==========================================

// Cenniki i limity Banku
const BANK_COIN_LIMITS = {
  1: { limit: 10000, cost: 0 },
  2: { limit: 50000, cost: 5000 },
  3: { limit: 250000, cost: 25000 },
  4: { limit: 1000000, cost: 100000 },
  5: { limit: 5000000, cost: 500000 },
  6: { limit: 25000000, cost: 2500000 },
  7: { limit: 100000000, cost: 10000000 },
  8: { limit: 500000000, cost: 50000000 },
  9: { limit: 2000000000, cost: 200000000 },
  10: { limit: 9007199254740991, cost: 1000000000 }
};

const BANK_SLOT_COSTS = {
  '6-10': 5000,
  '11-15': 25000,
  '16-20': 100000,
  '21-25': 500000
};

// Endpoint 1: Transfer monet
app.post('/api/bank/transfer_coins', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action, amount } = req.body;

    if (!action || !amount) return res.status(400).json({ error: 'Brak parametrów' });
    if (!['deposit', 'withdraw'].includes(action)) return res.status(400).json({ error: 'Nieprawidłowa akcja' });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, coins, bank_coins, bank_coin_limit_level')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    const transferAmount = BigInt(amount);
    if (transferAmount <= 0n) return res.status(400).json({ error: 'Kwota musi być dodatnia' });

    const currentCoins = BigInt(character.coins || '0');
    const currentBankCoins = BigInt(character.bank_coins || '0');
    const currentLimitLevel = parseInt(character.bank_coin_limit_level || '1');
    const bankLimit = BigInt(BANK_COIN_LIMITS[currentLimitLevel].limit);

    if (action === 'deposit') {
      if (currentCoins < transferAmount) return res.status(400).json({ error: 'Nie masz tyle monet!' });
      if (currentBankCoins + transferAmount > bankLimit) {
        return res.status(400).json({ error: `Przekroczysz limit banku (${bankLimit})!` });
      }
      
      await supabase.from('characters').update({
        coins: (currentCoins - transferAmount).toString(),
        bank_coins: (currentBankCoins + transferAmount).toString()
      }).eq('id', character.id);

      res.json({ success: true, message: `Wpłacono ${amount} monet do banku!` });
    } else {
      if (currentBankCoins < transferAmount) return res.status(400).json({ error: 'Nie masz tyle monet w banku!' });
      
      await supabase.from('characters').update({
        coins: (currentCoins + transferAmount).toString(),
        bank_coins: (currentBankCoins - transferAmount).toString()
      }).eq('id', character.id);

      res.json({ success: true, message: `Wypłacono ${amount} monet z banku!` });
    }
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// Endpoint 2: Ulepszenia Banku
app.post('/api/bank/upgrade', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { upgrade_type } = req.body;

    if (!upgrade_type || !['coin_limit', 'slot'].includes(upgrade_type)) {
      return res.status(400).json({ error: 'Nieprawidłowy typ ulepszenia' });
    }

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, coins, bank_coin_limit_level, bank_slots_unlocked')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    // Zabezpieczenie Szpitala
    if (BigInt(character.hp || '0') <= 0n) {
      return res.status(400).json({ error: 'Jesteś w Szpitalu! Bank jest niedostępny.' });
    }

    const currentCoins = BigInt(character.coins || '0');

    if (upgrade_type === 'coin_limit') {
      const currentLevel = parseInt(character.bank_coin_limit_level || '1');
      if (currentLevel >= 10) return res.status(400).json({ error: 'Osiągnięto maksymalny poziom!' });
      
      const nextLevel = currentLevel + 1;
      const upgradeCost = BigInt(BANK_COIN_LIMITS[nextLevel].cost);
      
      if (currentCoins < upgradeCost) return res.status(400).json({ error: 'Nie masz tyle monet na ulepszenie!' });
      
      await supabase.from('characters').update({
        coins: (currentCoins - upgradeCost).toString(),
        bank_coin_limit_level: nextLevel
      }).eq('id', character.id);

      res.json({ success: true, message: `Limit banku ulepszony do poziomu ${nextLevel}!` });
    } else {
      const currentSlots = parseInt(character.bank_slots_unlocked || '5');
      if (currentSlots >= 25) return res.status(400).json({ error: 'Osiągnięto maksymalną liczbę slotów!' });
      
      const nextSlot = currentSlots + 1;
      let upgradeCost;
      
      if (nextSlot >= 6 && nextSlot <= 10) upgradeCost = BigInt(BANK_SLOT_COSTS['6-10']);
      else if (nextSlot >= 11 && nextSlot <= 15) upgradeCost = BigInt(BANK_SLOT_COSTS['11-15']);
      else if (nextSlot >= 16 && nextSlot <= 20) upgradeCost = BigInt(BANK_SLOT_COSTS['16-20']);
      else if (nextSlot >= 21 && nextSlot <= 25) upgradeCost = BigInt(BANK_SLOT_COSTS['21-25']);
      
      if (currentCoins < upgradeCost) return res.status(400).json({ error: 'Nie masz tyle monet na ulepszenie!' });
      
      await supabase.from('characters').update({
        coins: (currentCoins - upgradeCost).toString(),
        bank_slots_unlocked: nextSlot
      }).eq('id', character.id);

      res.json({ success: true, message: `Odblokowano ${nextSlot} slotów w banku!` });
    }
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// Endpoint 3: Transfer przedmiotów
app.post('/api/bank/transfer_item', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, target_panel, amount, target_index } = req.body;

    if (!inventory_id || !target_panel || !amount) return res.status(400).json({ error: 'Brak parametrów' });
    if (!['bank', 'backpack'].includes(target_panel)) return res.status(400).json({ error: 'Nieprawidłowy panel docelowy' });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, bank_slots_unlocked')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    // Zabezpieczenie Szpitala
    if (BigInt(character.hp || '0') <= 0n) {
      return res.status(400).json({ error: 'Jesteś w Szpitalu! Bank jest niedostępny.' });
    }

    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*, item_templates(*)')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .single();

    if (itemError || !item) return res.status(404).json({ error: 'Przedmiot nie znaleziony' });

    const isConsumable = item.item_templates.type === 'consumable';
    const maxStack = isConsumable ? 99 : 999999999;
    const transferAmount = amount === 'all' ? BigInt(item.quantity) : BigInt(amount);

    if (transferAmount <= 0n || transferAmount > BigInt(item.quantity)) {
      return res.status(400).json({ error: 'Nieprawidłowa ilość' });
    }

    // 1. Sprawdzenie możliwości stackowania (łączenia)
    let targetStackItem = null;
    const isStackable = item.item_templates.category === 'consumable' || item.item_templates.category === 'special_consumable';

    if (isStackable) {
            let query = supabase.from('inventory').select('id, quantity, backpack_index')
                .eq('character_id', character.id)
                .eq('item_template_id', item.item_template_id)
                .neq('id', inventory_id); 
                
            if (target_panel === 'bank') query = query.eq('equipped_slot', 'bank');
            else query = query.is('equipped_slot', null);
            
            const { data: targetItems } = await query;

        // Szukamy stosu, który ma miejsce (do max 99)
        if (targetItems && targetItems.length > 0) {
            if (target_index !== undefined && target_index !== null) {
                // Drag & Drop: Łączymy w stos TYLKO jeśli upuściłeś prosto na inny stos
                targetStackItem = targetItems.find(t => t.backpack_index === parseInt(target_index) && BigInt(t.quantity) + transferAmount <= 99n);
            } else {
                // Szybkie przenoszenie (dwuklik): Łączymy z pierwszym z brzegu
                targetStackItem = targetItems.find(t => BigInt(t.quantity) + transferAmount <= 99n);
            }
        }
    }

    // 2. Walidacja pojemności (jeśli brak stosu do połączenia)
    if (!targetStackItem) {
        let isSwap = false;
        
        // ZABEZPIECZENIE: Sprawdzamy, czy przesuwamy item wewnątrz tego samego panelu (np. z banku na inną kratkę banku)
        const isInternalMove = (item.equipped_slot === 'bank' && target_panel === 'bank') || (item.equipped_slot === null && target_panel === 'backpack');

        // ZABEZPIECZENIE: Sprawdzamy, czy to podmiana (SWAP) przedmiotu z zajętą kratką
        if (target_index !== undefined && target_index !== null && transferAmount === BigInt(item.quantity)) {
            let query = supabase.from('inventory').select('id').eq('character_id', character.id).eq('backpack_index', parseInt(target_index));
            if (target_panel === 'bank') query = query.eq('equipped_slot', 'bank');
            else query = query.is('equipped_slot', null);
            
            const { data: existItem } = await query;
            if (existItem && existItem.length > 0) isSwap = true;
        }

        // WYJĄTEK: Jeśli to SWAP lub ruch wewnątrz jednej skrzyni, omijamy blokadę "Brak miejsca"! (Ilość przedmiotów nie rośnie)
        if (!isSwap && !isInternalMove) {
            if (target_panel === 'bank') {
                const bankSlots = parseInt(character.bank_slots_unlocked || '5');
                const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('character_id', character.id).eq('equipped_slot', 'bank');
                if (count >= bankSlots) return res.status(400).json({ error: 'Brak miejsca w banku!' });
            } else {
                // Obliczanie plecaka
                const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
                const maxSlots = calculateMaxBackpackSlots(charStats);
                const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('character_id', character.id).is('equipped_slot', null);
                if (count >= maxSlots) return res.status(400).json({ error: 'Brak miejsca w plecaku!' });
            }
        }
    }

    // 3. Wykonanie akcji w bazie danych
    if (targetStackItem) {
        // SCENARIUSZ A: Łączenie stosów
        await supabase.from('inventory').update({ 
            quantity: (BigInt(targetStackItem.quantity) + transferAmount).toString() 
        }).eq('id', targetStackItem.id);

        if (transferAmount === BigInt(item.quantity)) {
            await supabase.from('inventory').delete().eq('id', inventory_id); // Przeniesiono całość
        } else {
            await supabase.from('inventory').update({ 
                quantity: (BigInt(item.quantity) - transferAmount).toString() 
            }).eq('id', inventory_id); // Odkrojono część
        }
    } else {
          // SCENARIUSZ B: Szukamy wolnej kratki i wkładamy
          let idxQuery = supabase.from('inventory').select('id, backpack_index')
              .eq('character_id', character.id);
            
        if (target_panel === 'bank') {
            idxQuery = idxQuery.eq('equipped_slot', 'bank');
        } else {
            idxQuery = idxQuery.is('equipped_slot', null);
        }
        
        const { data: existingItems } = await idxQuery;
            
        const occupiedIndexes = existingItems.map(i => i.backpack_index).filter(i => i !== null);
        let firstFreeIndex = 1;
        while (occupiedIndexes.includes(firstFreeIndex)) firstFreeIndex++;

        let finalIndex = firstFreeIndex;
        let swapTargetItem = null;

        if (target_index !== undefined && target_index !== null) {
            let parsedIdx = parseInt(target_index);
            if (!occupiedIndexes.includes(parsedIdx)) {
                finalIndex = parsedIdx;
            } else if (transferAmount === BigInt(item.quantity)) {
                // Kratka jest zajęta! Pobieramy przedmiot, który tam leży, aby go zamienić (SWAP)
                finalIndex = parsedIdx;
                swapTargetItem = existingItems.find(i => i.backpack_index === parsedIdx);
            }
        }

        if (transferAmount === BigInt(item.quantity)) {
            if (swapTargetItem) {
                // Zabezpieczenie: blokujemy zamianę ze skrytki z przedmiotem założonym na ciało postaci
                if (item.equipped_slot !== 'bank' && item.equipped_slot !== null) {
                    return res.status(400).json({ error: 'Nie możesz podmienić przedmiotu w banku bezpośrednio na założony ekwipunek!' });
                }
                
                // SWAP: Kładziemy przedmiot z docelowej kratki na stare miejsce przeciągniętego przedmiotu
                await supabase.from('inventory').update({
                    equipped_slot: item.equipped_slot,
                    backpack_index: item.backpack_index
                }).eq('id', swapTargetItem.id);
            }

            // Przenosimy przeciągnięty przedmiot na jego nowe miejsce
            await supabase.from('inventory').update({ 
                equipped_slot: target_panel === 'bank' ? 'bank' : null, 
                backpack_index: finalIndex 
            }).eq('id', inventory_id);
        } else {
            await supabase.from('inventory').update({ 
                quantity: (BigInt(item.quantity) - transferAmount).toString() 
            }).eq('id', inventory_id);

            await supabase.from('inventory').insert({
                character_id: character.id,
                item_template_id: item.item_template_id,
                quantity: transferAmount.toString(),
                equipped_slot: target_panel === 'bank' ? 'bank' : null,
                backpack_index: finalIndex
            });
        }
    }

    res.json({ success: true, message: `Przeniesiono ${amount === 'all' ? 'całość' : amount + ' szt.'} pomyślnie!` });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// Endpoint 4: Kaskadowy Split w Banku
app.post('/api/bank/split', authenticateToken, requireAlive, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, amount_to_split } = req.body;

    if (!inventory_id || !amount_to_split) return res.status(400).json({ error: 'Brak parametrów' });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id, hp, bank_slots_unlocked')
      .eq('profile_id', userId)
      .single();

    if (characterError || !character) return res.status(404).json({ error: 'Postać nie znaleziona' });

    // Zabezpieczenie Szpitala
    if (BigInt(character.hp || '0') <= 0n) {
      return res.status(400).json({ error: 'Jesteś w Szpitalu! Bank jest niedostępny.' });
    }

    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', inventory_id)
      .eq('character_id', character.id)
      .single();

    if (itemError || !item) return res.status(404).json({ error: 'Przedmiot nie znaleziony' });

    const splitAmount = BigInt(amount_to_split);
    if (BigInt(item.quantity) <= splitAmount || splitAmount <= 0n) {
      return res.status(400).json({ error: 'Zła ilość do podziału!' });
    }

    // Zmniejszenie głównego stacka
    await supabase.from('inventory').update({ 
      quantity: (BigInt(item.quantity) - splitAmount).toString() 
    }).eq('id', inventory_id);

    const isFromBank = item.equipped_slot === 'bank';
    const targetPanel = isFromBank ? 'bank' : null;
    
    // Szukamy wolnego miejsca w obecnym panelu
    let panelQuery = supabase.from('inventory').select('backpack_index').eq('character_id', character.id);
    if (isFromBank) panelQuery = panelQuery.eq('equipped_slot', 'bank');
    else panelQuery = panelQuery.is('equipped_slot', null);
    
    const { data: panelItems } = await panelQuery;
    const occupied = panelItems.map(i => i.backpack_index).filter(i => i !== null);
    
    // Walidacja limitów miejsca
    let hasSpace = false;
    if (isFromBank) {
        const bankSlots = parseInt(character.bank_slots_unlocked || '5');
        hasSpace = panelItems.length < bankSlots;
    } else {
        const { data: charStats } = await supabase.from('characters').select('strength, speed, endurance').eq('id', character.id).single();
        const maxSlots = calculateMaxBackpackSlots(charStats);
        hasSpace = panelItems.length < maxSlots;
    }

    if (hasSpace) {
        let freeIdx = 1;
        while (occupied.includes(freeIdx)) freeIdx++;
        
        await supabase.from('inventory').insert({
            character_id: character.id,
            item_template_id: item.item_template_id,
            quantity: splitAmount.toString(),
            equipped_slot: targetPanel,
            backpack_index: freeIdx 
        });
        return res.json({ success: true, message: `Podzielono stos i umieszczono w nowym slocie!` });
    } else {
        // Brak miejsca na podział, cofamy potrącenie z początku!
        await supabase.from('inventory').update({ quantity: item.quantity }).eq('id', inventory_id);
        return res.status(400).json({ error: `Brak wolnych miejsc w ${isFromBank ? 'banku' : 'plecaku'} na wydzielenie stosu!` });
    }
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// ==========================================
// 💬 7. CZAT, RANKING I DASHBOARD
// ==========================================

// Cache dla rankingu (odświeżany co 1 minutę)
let rankingCache = null;
let rankingCacheTime = 0;
const RANKING_CACHE_TTL = 1 * 60 * 1000; // 1 minuta

// Rate-limiting dla czatu (1 wiadomość na 3 sekundy na profil)
const chatRateLimitMap = new Map();
const CHAT_RATE_LIMIT_TTL = 3000; // 3 sekundy

// Pobranie rankingu z cache lub bazy
async function getRanking() {
  const now = Date.now();
  
  if (rankingCache && (now - rankingCacheTime) < RANKING_CACHE_TTL) {
    return rankingCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('characters')
      .select(`
        id,
        base_power_level,
        profiles!inner(username)
      `)
      .order('base_power_level', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    rankingCache = data;
    rankingCacheTime = now;
    
    return data;
  } catch (err) {
    console.error('[Ranking] Błąd pobierania rankingu:', err.message);
    return [];
  }
}

// Endpoint GET /api/ranking - Top 10 graczy
app.get('/api/ranking', async (req, res) => {
  try {
    const ranking = await getRanking();
    
    const formattedRanking = ranking.map((player, index) => ({
      position: index + 1,
      username: player.profiles.username,
      power_level: BigInt(player.base_power_level || '1').toString()
    }));
    
    res.json(formattedRanking);
  } catch (err) {
    console.error('[Ranking] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania rankingu' });
  }
});

// Endpoint POST /api/chat/send - Wysyłanie wiadomości globalnych
app.post('/api/chat/send', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Wiadomość nie może być pusta' });
    }
    
    if (message.length > 200) {
      return res.status(400).json({ error: 'Wiadomość może mieć maksymalnie 200 znaków' });
    }
    
    // Rate-limiting check
    const now = Date.now();
    const lastMessageTime = chatRateLimitMap.get(userId) || 0;
    if (now - lastMessageTime < CHAT_RATE_LIMIT_TTL) {
      return res.status(429).json({ error: 'Możesz wysłać tylko 1 wiadomość na 3 sekundy' });
    }
    
    // Pobierz dane postaci
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('hp, profiles!inner(username)')
      .eq('profile_id', userId)
      .single();
    
    if (characterError || !character) {
      return res.status(404).json({ error: 'Nie znaleziono postaci' });
    }
    
    // Sprawdź czy gracz jest duchem (hp <= 0)
    const isGhost = BigInt(character.hp || '0') <= 0n;
    
    // Wstaw wiadomość do bazy
    const { error: insertError } = await supabase
      .from('global_messages')
      .insert({
        profile_id: userId,
        username: character.profiles.username, // [DODANE] Przekazanie nicku!
        content: message.trim(),               // [POPRAWIONE] Z 'message' na 'content'
        is_ghost: isGhost
      });
    
    if (insertError) {
      console.error('[Chat] Błąd zapisu wiadomości:', insertError);
      return res.status(500).json({ error: 'Błąd serwera podczas wysyłania wiadomości' });
    }
    
    // Aktualizuj rate-limiting
    chatRateLimitMap.set(userId, now);
    
    res.json({ 
      success: true, 
      message: isGhost ? 'Wiadomość wysłana jako duch 👻' : 'Wiadomość wysłana',
      is_ghost: isGhost
    });
    
  } catch (err) {
    console.error('[Chat] Błąd endpointu:', err.message);
    res.status(500).json({ error: 'Błąd serwera podczas wysyłania wiadomości' });
  }
});

// Czyszczenie mapy anty-spamowej czatu co 1 godzinę (Zabezpieczenie RAM)
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of chatRateLimitMap.entries()) {
    if (now - timestamp > CHAT_RATE_LIMIT_TTL) {
      chatRateLimitMap.delete(userId);
    }
  }
}, 60 * 60 * 1000);

// ==========================================
// 🧘‍♂️ 8. SYSTEM TRENINGU (SALA CZASU I MISTRZOWIE)
// ==========================================

const TRAINING_MENTORS = {
  // Prawdziwe, dokładne ID pobrane z seed_missions.js
  'old_master': { name: 'Stary Mistrz', emoji: '🐢', cost: 10, multiplier: 2, reqMission: '00000000-0000-0000-0000-000000000005' },
  'cat_hermit': { name: 'Koci Pustelnik', emoji: '🐈', cost: 25, multiplier: 6, reqMission: '10000000-0000-0000-0000-000000000015' },
  'celestial': { name: 'Pan Niebiańskiego Pałacu', emoji: '☁️', cost: 50, multiplier: 15, reqMission: '10000000-0000-0000-0000-000000000020' },
  'time_chamber': { name: 'Sala Czasu', emoji: '⏳', cost: 100, multiplier: 40, reqMission: '00000000-0000-0000-0000-000000000024' }
};

// 1. Pobranie statusu z bazy danych
app.get('/api/training/status', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const { data, error } = await supabase
      .from('characters')
      .select('active_training_id, training_end_time, unlocked_features, completed_missions, daily_time_chamber_used')
      .eq('profile_id', userId).single();

    if (error) throw error;
    
    // Odczyt tablic JSONB z bazy danych
    const unlockedFeatures = data.unlocked_features || [];
    const completedMissions = data.completed_missions || [];

    const mentorsList = Object.entries(TRAINING_MENTORS).map(([id, m]) => ({
        id, name: m.name, emoji: m.emoji, cost: m.cost, multiplier: m.multiplier,
        isLocked: m.reqMission ? !completedMissions.includes(m.reqMission) : false,
        reqMission: m.reqMission
    }));

    const isDojoUnlocked = unlockedFeatures.includes('training') || completedMissions.includes(TRAINING_MENTORS['old_master'].reqMission);

    res.json({ 
        isUnlocked: isDojoUnlocked,
        activeTraining: data.active_training_id, 
        endTime: data.training_end_time,
        dailyTimeChamberUsed: data.daily_time_chamber_used,
        mentors: mentorsList
    });
  } catch (err) { res.status(500).json({ error: 'Błąd statusu' }); }
});

// 2. Start
app.post('/api/training/start', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { mentorId, hours, targetStat } = req.body; 
  try {
    const { data: char, error: charErr } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (charErr || !char) return res.status(404).json({ error: 'Postać nie znaleziona' });

    const mentor = TRAINING_MENTORS[mentorId];
    if (!mentor) return res.status(400).json({ error: 'Zły mentor' });

    const completedMissions = char.completed_missions || [];

    if (mentor.reqMission && !completedMissions.includes(mentor.reqMission)) {
        return res.status(403).json({ error: 'Ukończ wymaganą misję!' });
    }

    if (mentorId === 'time_chamber' && char.daily_time_chamber_used) {
        return res.status(400).json({ error: 'Sala Czasu raz na dobę DC!' });
    }

    // Koszt staminy zaokrąglamy w górę
    const totalStaminaCost = Math.ceil(mentor.cost * parseFloat(hours));
    if (BigInt(char.stamina) < BigInt(totalStaminaCost)) return res.status(400).json({ error: 'Za mało staminy!' });

    const validStat = ['strength', 'speed', 'endurance', 'technique', 'balanced'].includes(targetStat) ? targetStat : 'balanced';
    
    // LOGIKA CZASU:
    // Jeśli to Sala Czasu, to każda przesłana "godzina" (hours) trwa w rzeczywistości tylko 5 minut.
    let realDurationMinutes;
    if (mentorId === 'time_chamber') {
        realDurationMinutes = parseFloat(hours) * 5; // 12h efektywne -> 60 min rzeczywiste
    } else {
        realDurationMinutes = parseFloat(hours) * 60; // Standardowo 1h -> 60 min
    }

    const endTime = new Date(Date.now() + realDurationMinutes * 60 * 1000).toISOString();
    
    let updates = {
      stamina: (BigInt(char.stamina) - BigInt(totalStaminaCost)).toString(),
      active_training_id: `${mentorId}:${hours}:${validStat}`, // Zapisujemy Godziny Efektywne
      training_end_time: endTime
    };
    if (mentorId === 'time_chamber') updates.daily_time_chamber_used = true;

    const { error: upErr } = await supabase.from('characters').update(updates).eq('profile_id', userId);
    if (upErr) throw upErr;

    res.json({ success: true, endTime });
  } catch (err) { res.status(500).json({ error: 'Błąd startu' }); }
});

// 3. Stop
app.post('/api/training/stop', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const { data: char, error: charErr } = await supabase.from('characters').select('*').eq('profile_id', userId).single();
    if (charErr || !char) return res.status(404).json({ error: 'Postać nie znaleziona' });

    if (!char.active_training_id || !char.training_end_time) return res.status(400).json({ error: 'Brak aktywnego treningu' });

    const now = new Date();
    const endTime = new Date(char.training_end_time);
    const [mentorId, hoursStr, targetStat] = char.active_training_id.split(':');
    const action = now < endTime ? 'interrupted' : 'completed';
    const mentor = TRAINING_MENTORS[mentorId];

    let updates = { active_training_id: null, training_end_time: null };
    let rewardMsg = "Trening przerwany. Straciłeś staminę.";

    if (action === 'completed' && mentor) {
      const effectivePower = Math.max(1000, parseInt(char.base_power_level || '0'));
      const trainingHours = parseFloat(hoursStr);
      
      const statGain = BigInt(Math.floor((400 + Math.pow(effectivePower, 0.55)) * mentor.multiplier * trainingHours));

      if (targetStat === 'balanced') {
        const perStat = statGain / 4n; // Dzielimy na 4 statystyki: Siła, Szybk, Wytrz, Technika
        updates.strength = (BigInt(char.strength || '1') + perStat).toString();
        updates.speed = (BigInt(char.speed || '1') + perStat).toString();
        updates.endurance = (BigInt(char.endurance || '1') + perStat).toString();
        updates.technique = (BigInt(char.technique || '1') + perStat).toString(); // <--- DODANO TECHNIKĘ
        rewardMsg = `Zyskano po +${perStat} do Siły, Szybk., Wytrz. i Techniki!`;
      } else {
        const safeStat = ['strength', 'speed', 'endurance', 'technique'].includes(targetStat) ? targetStat : 'strength';
        updates[safeStat] = (BigInt(char[safeStat] || '1') + statGain).toString();
        let namePL = safeStat === 'strength' ? 'Siły' : (safeStat === 'speed' ? 'Szybkości' : (safeStat === 'endurance' ? 'Wytrzymałości' : 'Techniki'));
        rewardMsg = `Twoja cecha (${namePL}) wzrosła o +${statGain}!`;
      }
    }

    const { error: updateErr } = await supabase.from('characters').update(updates).eq('profile_id', userId);
    if (updateErr) throw updateErr;
    
    res.json({ success: true, message: rewardMsg, action });
  } catch (err) { res.status(500).json({ error: 'Błąd stopu' }); }
});

// ==========================================
// 🛠️ 8.5. TRYB PRACA (MINIGRA)
// ==========================================

// Nowy zaktualizowany słownik - łączy pracę z tabelą `missions` przez ID (aby zaciągnąć req_stats automatycznie) i definiuje rosnące kary procentowe (Game Over)
const WORK_MODES = {
  praca_mleko:  { req_mission: '10000000-0000-0000-0000-000000000006', duration_sec: 15, cost_stamina: 10n, cost_hp_pct: 2n, reward_coins: 2n, penalty_pct: 10n },
  praca_budowa: { req_mission: '10000000-0000-0000-0000-000000000007', duration_sec: 20, cost_stamina: 10n, cost_hp_pct: 5n, reward_coins: 5n, penalty_pct: 12n },
  praca_pole:   { req_mission: '10000000-0000-0000-0000-000000000008', duration_sec: 25, cost_stamina: 15n, cost_hp_pct: 8n, reward_coins: 12n, penalty_pct: 15n },
  praca_drwal:  { req_mission: '10000000-0000-0000-0000-000000000009', duration_sec: 30, cost_stamina: 15n, cost_hp_pct: 15n, reward_coins: 25n, penalty_pct: 18n },
  praca_kurier: { req_mission: '10000000-0000-0000-0000-000000000010', duration_sec: 40, cost_stamina: 20n, cost_hp_pct: 25n, reward_coins: 60n, penalty_pct: 22n },
  praca_rosa:   { req_mission: '10000000-0000-0000-0000-000000000015', duration_sec: 50, cost_stamina: 25n, cost_hp_pct: 10n, reward_coins: 150n, penalty_pct: 25n, drop_woda: true },
  praca_ogrody: { req_mission: '10000000-0000-0000-0000-000000000020', duration_sec: 60, cost_stamina: 40n, cost_hp_pct: 30n, reward_coins: 500n, penalty_pct: 30n }
};

app.post('/api/work/start', authenticateToken, requireAlive, async (req, res) => {
  const userId = req.user.id;
  const { workId } = req.body;
  const work = WORK_MODES[workId];
  if (!work) return res.status(400).json({ error: 'Nieprawidłowa praca.' });

  try {
    const fullStats = await getFullCharacterStats(userId);
    const char = fullStats.character;

    // POBRANIE WYMAGAŃ Z MISJI
    const { data: mission } = await supabase.from('missions').select('req_stats').eq('id', work.req_mission).single();
    if (mission && mission.req_stats) {
        const sReq = BigInt(mission.req_stats.strength || 0);
        const spReq = BigInt(mission.req_stats.speed || 0);
        const eReq = BigInt(mission.req_stats.endurance || 0);
        
        if (BigInt(char.strength) < sReq || BigInt(char.speed) < spReq || BigInt(char.endurance) < eReq) {
            return res.status(400).json({ error: `Twoje statystyki są zbyt niskie, by podjąć tę pracę!` });
        }
    }

    const hpCost = (BigInt(fullStats.max_hp) * work.cost_hp_pct) / 100n;
    const currentHp = BigInt(char.hp || '100');
    const currentStamina = BigInt(char.stamina || '100');

    if (currentHp <= hpCost) return res.status(400).json({ error: `Jesteś zbyt wyczerpany. Wymagane HP: ${hpCost}` });
    if (currentStamina < work.cost_stamina) return res.status(400).json({ error: `Brak Staminy. Wymagane: ${work.cost_stamina}` });

    await supabase.from('characters').update({ hp: (currentHp - hpCost).toString(), stamina: (currentStamina - work.cost_stamina).toString() }).eq('id', char.id);
    res.json({ success: true, duration: work.duration_sec, hpCost: hpCost.toString() });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

app.post('/api/work/finish', authenticateToken, requireAlive, async (req, res) => {
  const userId = req.user.id;
  const { workId, goodObjectsCaught, obstaclesCaught, failed } = req.body;
  const work = WORK_MODES[workId];
  if (!work) return res.status(400).json({ error: 'Nieprawidłowa praca.' });

  try {
    const fullStats = await getFullCharacterStats(userId);
    const char = fullStats.character;
    
    // Pobranie danych misji w celu wyliczenia kary wzorem z misji
    const { data: mission } = await supabase.from('missions').select('req_stats, reward_stats').eq('id', work.req_mission).single();
    
    let reqStat = 1n;
    if (mission && mission.req_stats) {
        reqStat = BigInt(mission.req_stats.strength || mission.req_stats.speed || mission.req_stats.endurance || 1);
    }

    if (failed) {
        const pct = work.penalty_pct;
        
        // 1. WIRTUALNA KOSTKA (Całkowita pula kary)
        let totalLoss = 50n; 
        if (mission && mission.reward_stats && mission.reward_stats.min && mission.reward_stats.max) {
            const minR = Number(mission.reward_stats.min);
            const maxR = Number(mission.reward_stats.max);
            const randomBase = Math.floor(Math.random() * (maxR - minR + 1)) + minR;
            totalLoss = maxBigInt(1n, BigInt(randomBase) * 3n); 
        } else if (mission && mission.reward_stats && mission.reward_stats.min) {
            totalLoss = maxBigInt(1n, BigInt(mission.reward_stats.min) * 3n);
        } else {
            totalLoss = maxBigInt(1n, reqStat / 10n); 
        }
        
        // 2. HYBRYDOWY PODZIAŁ KARY (50% sztywne, 50% losowe)
        let totalLossNum = Number(totalLoss);
        
        let guaranteedPool = Math.floor(totalLossNum * 0.5); 
        let randomPool = totalLossNum - guaranteedPool;
        
        let guaranteedPerStat = Math.floor(guaranteedPool / 4);
        let guaranteedRemainder = guaranteedPool - (guaranteedPerStat * 4); 

        let r1 = Math.random(); let r2 = Math.random(); let r3 = Math.random(); let r4 = Math.random();
        const sumR = r1 + r2 + r3 + r4;
        
        let randStr = Math.floor(randomPool * (r1 / sumR));
        let randSpd = Math.floor(randomPool * (r2 / sumR));
        let randEnd = Math.floor(randomPool * (r3 / sumR));
        let randTech = randomPool - randStr - randSpd - randEnd;

        let sLossStr = BigInt(Math.max(1, guaranteedPerStat + randStr));
        let sLossSpd = BigInt(Math.max(1, guaranteedPerStat + randSpd));
        let sLossEnd = BigInt(Math.max(1, guaranteedPerStat + randEnd));
        let sLossTech = BigInt(Math.max(1, guaranteedPerStat + guaranteedRemainder + randTech));

        // 3. OBLICZAMY NOWE ZASOBY I SPRAWDZAMY CZY GRACZ PRZEŻYŁ
        const extraHpPct = BigInt(req.body.extraHpPenaltyPct || 0); 
        let newHp = maxBigInt(0n, BigInt(char.hp) - (BigInt(fullStats.max_hp) * pct / 100n));
        newHp = maxBigInt(0n, newHp - (BigInt(fullStats.max_hp) * extraHpPct / 100n));
        
        let newMp = maxBigInt(0n, BigInt(char.mp) - (BigInt(fullStats.max_mp) * pct / 100n));
        let newStamina = maxBigInt(0n, BigInt(char.stamina) - (BigInt(fullStats.max_stamina) * pct / 100n));
        
        let isDead = newHp <= 0n;
        
        let updateData = {
            hp: newHp.toString(),
            mp: newMp.toString(),
            stamina: newStamina.toString(),
            strength: maxBigInt(1n, BigInt(char.strength) - sLossStr).toString(),
            speed: maxBigInt(1n, BigInt(char.speed) - sLossSpd).toString(),
            endurance: maxBigInt(1n, BigInt(char.endurance) - sLossEnd).toString(),
            technique: maxBigInt(1n, BigInt(char.technique || '1') - sLossTech).toString()
        };

        if (isDead) {
            const pl = BigInt(fullStats.powerLevel);
            const hospitalMinutes = Math.min(120, 5 + Math.floor(Math.pow(Number(pl), 0.25)));
            const exactEndMs = Date.now() + hospitalMinutes * 60000;
            
            updateData.hospital_until = new Date(exactEndMs).toISOString();
            updateData.current_form = 'Stan Podstawowy';
            updateData.last_death_penalty = {
                strength: sLossStr.toString(),
                speed: sLossSpd.toString(),
                endurance: sLossEnd.toString(),
                technique: sLossTech.toString(),
                intelligence: '0',
                mental_strength: '0',
                hospital_end_ms: exactEndMs.toString(),
                source: 'work'
            };
        }

        await supabase.from('characters').update(updateData).eq('id', char.id);
        
        return res.json({ success: true, failed: true, isDead: isDead, penalty: { resources_pct: pct.toString(), loss_str: sLossStr.toString(), loss_spd: sLossSpd.toString(), loss_end: sLossEnd.toString(), loss_tech: sLossTech.toString() } });
    }

    // --- BLOK SUKCESU PRACY ---
    const netScore = maxBigInt(0n, BigInt(goodObjectsCaught) - BigInt(obstaclesCaught));
    
    const extraHpPct = BigInt(req.body.extraHpPenaltyPct || 0);
    let newHp = BigInt(char.hp);
    let isDead = false;
    let exactEndMs = null;

    if (extraHpPct > 0n) {
        newHp = maxBigInt(0n, newHp - (BigInt(fullStats.max_hp) * extraHpPct / 100n));
        isDead = newHp <= 0n;
    }

    let activeStr = BigInt(fullStats.baseStats.strength || 0) + BigInt(fullStats.equipStats.strength || 0);
    let activeSpd = BigInt(fullStats.baseStats.speed || 0) + BigInt(fullStats.equipStats.speed || 0);
    let activeEnd = BigInt(fullStats.baseStats.endurance || 0) + BigInt(fullStats.equipStats.endurance || 0);
    
    // KROK 3: Pobieramy aktywną Technikę
    let activeTech = BigInt(fullStats.baseStats.technique || 0) + BigInt(fullStats.equipStats.technique || 0);

    let penaltyMultiplier = 1.0;
    // KROK 3: Dorzucamy activeTech do poszukiwań najsłabszej statystyki (weakest)
    const weakest = minBigInt(activeTech, minBigInt(activeStr, minBigInt(activeSpd, activeEnd)));
    
    let serverWarningText = null; 

    if (weakest >= (reqStat * 8n) + 100n) { penaltyMultiplier = 0.10; serverWarningText = 'Zyski obniżone o 90% (Duża kara za potęgę)'; } 
    else if (weakest >= (reqStat * 4n) + 40n) { penaltyMultiplier = 0.50; serverWarningText = 'Zyski obniżone o 50% (Średnia kara za potęgę)'; } 
    else if (weakest >= (reqStat * 2n) + 15n) { penaltyMultiplier = 0.75; serverWarningText = 'Zyski obniżone o 25% (Mała kara za potęgę)'; }

    // WYLICZANIE MONET Z EKWIPUNKU
    let finalCoinsBase = BigInt(Math.floor(Number(netScore * work.reward_coins) * penaltyMultiplier));
    const equipCoinBonusFlat = BigInt(fullStats.equipStats.bonus_coins || '0');
    const trainingCoinBonusPct = BigInt(fullStats.trainingStats.bonus_coins_pct || '0');
    
    let trainingCoinBonusValue = 0n;
    if (trainingCoinBonusPct > 0n && finalCoinsBase > 0n) {
        trainingCoinBonusValue = (finalCoinsBase * trainingCoinBonusPct) / 100n;
        // Zabezpieczenie przed ucinaniem ułamków (wymusza minimum +1 zysku)
        if (trainingCoinBonusValue === 0n) trainingCoinBonusValue = 1n; 
    }
    
    const finalCoins = finalCoinsBase + trainingCoinBonusValue + equipCoinBonusFlat;

    const applyPenalty = (val) => BigInt(Math.floor(Number(netScore * val) * penaltyMultiplier));

    const gStr = applyPenalty(BigInt(fullStats.trainingStats.strength || 0));
    const gSpd = applyPenalty(BigInt(fullStats.trainingStats.speed || 0));
    const gEnd = applyPenalty(BigInt(fullStats.trainingStats.endurance || 0));
    const gTech = applyPenalty(BigInt(fullStats.trainingStats.technique || 0)); 
    const gHp = applyPenalty(BigInt(fullStats.trainingStats.bonus_hp || 0));
    const gMp = applyPenalty(BigInt(fullStats.trainingStats.bonus_mp || 0));

    let dropIds = [];
    if (work.drop_woda && netScore > 10n && Math.floor(Math.random() * 100) < 1) {
        dropIds.push("00000000-0000-0000-0000-000000000008"); 
        const { data: invData } = await supabase.from('inventory').select('backpack_index').eq('character_id', char.id).is('equipped_slot', null);
        const usedIndexes = invData ? invData.map(i => i.backpack_index) : [];
        let freeIndex = 1; while(usedIndexes.includes(freeIndex)) freeIndex++;
        await supabase.from('inventory').insert({ character_id: char.id, item_template_id: "00000000-0000-0000-0000-000000000008", quantity: 1, backpack_index: freeIndex });
    }

    let updateData = {
        coins: (BigInt(char.coins) + finalCoins).toString(),
        strength: (BigInt(char.strength) + gStr).toString(),
        speed: (BigInt(char.speed) + gSpd).toString(),
        endurance: (BigInt(char.endurance) + gEnd).toString(),
        technique: (BigInt(char.technique) + gTech).toString(), 
        bonus_hp: (BigInt(char.bonus_hp) + gHp).toString(),
        bonus_mp: (BigInt(char.bonus_mp) + gMp).toString(),
        hp: newHp.toString()
    };

    if (isDead) {
        const pl = BigInt(fullStats.powerLevel);
        const hospitalMinutes = Math.min(120, 5 + Math.floor(Math.pow(Number(pl), 0.25)));
        exactEndMs = Date.now() + hospitalMinutes * 60000;
        
        updateData.hospital_until = new Date(exactEndMs).toISOString();
        updateData.current_form = 'Stan Podstawowy';
        updateData.last_death_penalty = {
            strength: '0', speed: '0', endurance: '0', intelligence: '0', mental_strength: '0',
            hospital_end_ms: exactEndMs.toString(),
            source: 'work'
        };
    }

    await supabase.from('characters').update(updateData).eq('id', char.id);

    res.json({ 
        success: true, 
        isDead: isDead, 
        finalCoins: finalCoins.toString(), 
        baseCoins: finalCoinsBase.toString(), 
        bonusCoinsFlat: equipCoinBonusFlat.toString(),
        bonusCoinsPct: trainingCoinBonusValue.toString(),
        gains: { str: gStr.toString(), spd: gSpd.toString(), end: gEnd.toString(), tech: gTech.toString(), hp: gHp.toString(), mp: gMp.toString() }, 
        drops: dropIds, 
        server_warning: serverWarningText 
    });
  } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

// ==========================================
// ⏰ 9. CRON JOBS I START SERWERA
// ==========================================
app.listen(port, async () => {
  console.log(`[Dojo-Clicker API] Serwer nasłuchuje na porcie ${port}...`);
  await initGlobalState();
  console.log('[Dojo-Clicker API] Serwer wystartował pomyślnie!');
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
cron.schedule('0 0,8,16 * * *', async () => {
  console.log('[Zegar DC] Wybiła Północ DC!');
  try {
    await supabase.from('global_server_state').update({ is_maintenance: true }).eq('id', 1);
    await delay(30000); 
    
    // Reset limitu Sali Czasu dla wszystkich postaci
    await supabase.from('characters').update({ daily_time_chamber_used: false }).neq('profile_id', '00000000-0000-0000-0000-000000000000');
    
    await supabase.from('global_server_state').update({ current_dc_day: globalServerState.current_dc_day + 1 }).eq('id', 1);
    await delay(30000);
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
  } catch (error) {
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
  }
});