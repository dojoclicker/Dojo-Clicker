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
// SILNIK STATYSTYK ZE SPRZĘTU (FAZA 1 & 2)
// ==========================================

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
      .not('equipped_slot', 'is', null);

    if (equipmentError) {
      console.error('[Stats] Błąd pobierania ekwipunku:', equipmentError);
      equippedItems = [];
    }

    const equipBonuses = { strength: 0n, speed: 0n, endurance: 0n, intelligence: 0n, mental_strength: 0n, bonus_hp: 0n, bonus_mp: 0n };
    const equipBreakdown = { strength: [], speed: [], endurance: [], intelligence: [], mental_strength: [], bonus_hp: [], bonus_mp: [] };
    const trainingBonuses = { strength: 0n, speed: 0n, endurance: 0n, intelligence: 0n, mental_strength: 0n, bonus_hp: 0n, bonus_mp: 0n };

    equippedItems.forEach(item => {
      if (item.item_templates && item.item_templates.bonuses) {
        const bonuses = item.item_templates.bonuses;
        
        if (bonuses.type === 'passive' || bonuses.type === undefined) {
          if (bonuses.strength) { equipBonuses.strength += BigInt(bonuses.strength); equipBreakdown.strength.push(`${item.item_templates.name}: +${bonuses.strength}`); }
          if (bonuses.speed) { equipBonuses.speed += BigInt(bonuses.speed); equipBreakdown.speed.push(`${item.item_templates.name}: +${bonuses.speed}`); }
          if (bonuses.endurance) { equipBonuses.endurance += BigInt(bonuses.endurance); equipBreakdown.endurance.push(`${item.item_templates.name}: +${bonuses.endurance}`); }
          if (bonuses.intelligence) { equipBonuses.intelligence += BigInt(bonuses.intelligence); equipBreakdown.intelligence.push(`${item.item_templates.name}: +${bonuses.intelligence}`); }
          if (bonuses.mental_strength) { equipBonuses.mental_strength += BigInt(bonuses.mental_strength); equipBreakdown.mental_strength.push(`${item.item_templates.name}: +${bonuses.mental_strength}`); }
          if (bonuses.bonus_hp) { equipBonuses.bonus_hp += BigInt(bonuses.bonus_hp); equipBreakdown.bonus_hp.push(`${item.item_templates.name}: +${bonuses.bonus_hp}`); }
          if (bonuses.bonus_mp) { equipBonuses.bonus_mp += BigInt(bonuses.bonus_mp); equipBreakdown.bonus_mp.push(`${item.item_templates.name}: +${bonuses.bonus_mp}`); }
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
      }
    }); // <-- TO TUTAJ WINDSURF ZEPSUŁ NAWIASY

    const baseStats = {
      strength: BigInt(character.strength || '1'),
      speed: BigInt(character.speed || '1'),
      endurance: BigInt(character.endurance || '1'),
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

    const stats_sum = baseStats.strength + baseStats.speed + baseStats.endurance + baseStats.intelligence + baseStats.mental_strength;
    const powerLevel = stats_sum + baseStats.bonus_hp + (baseStats.bonus_mp * 2n) + (baseStats.bonus_stamina * 5n);

    return {
      character, profile, powerLevel, max_hp, max_mp, max_stamina,
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
      hospital_until: exactHospitalEndTime ? new Date(exactHospitalEndTime).toISOString() : ensureUTC(character.hospital_until)
    };

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
    } else if (slot_target !== 'backpack') {
      const { data: existingItem } = await supabase
        .from('inventory').select('id').eq('character_id', character.id).eq('equipped_slot', slot_target)
        .neq('id', item_id_1).maybeSingle();
      if (existingItem) wasOccupied = true;
    }

    // === REVERSE SWAP BYPASS FIX ===
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

    const { error: swapError } = await supabase.rpc('swap_items', {
        p_character_id: character.id, p_item_id_1: item_id_1, p_slot_target: slot_target,
        p_backpack_index_target: backpack_index_target || null, p_item_id_2: item_id_2 || null
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
    
    if (currentHp === originalHp && currentMp === originalMp && currentStamina === originalStamina && newBonusStamina === originalBonusStamina && !hasPermanentEffects) {
      return res.status(400).json({ status: 'warning', message: 'Zasoby są pełne.' });
    }

    if (BigInt(item.quantity) > 1n) {
      await supabase.from('inventory').update({ quantity: (BigInt(item.quantity) - 1n).toString() }).eq('id', inventory_id);
    } else {
      await supabase.from('inventory').delete().eq('id', inventory_id);
    }

    const updateData = {
        hp: currentHp.toString(), mp: currentMp.toString(), stamina: currentStamina.toString(),
        bonus_stamina: newBonusStamina.toString(), strength: currentStr.toString(), speed: currentSpd.toString(),
        endurance: currentEnd.toString(), intelligence: currentInt.toString(), mental_strength: currentMen.toString()
    };

    if (req.clearHospital) { updateData.hospital_until = null; updateData.last_death_penalty = null; }
    await supabase.from('characters').update(updateData).eq('id', character.id);

    res.json({ success: true, message: `Użyto ${item.item_templates.name}! ${effectMessages.join(', ')}`, effects: effectMessages, character_updates: { hp: currentHp.toString(), mp: currentMp.toString(), stamina: currentStamina.toString(), bonus_stamina: newBonusStamina.toString(), coins: (character.coins || '0').toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ==========================================
// SILNIK MISJI
// ==========================================
app.post('/api/missions/start', authenticateToken, async (req, res) => {
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
    if (BigInt(character.hp || '0') <= 0n) return res.status(400).json({ status: 'error', message: 'Jesteś w Szpitalu! Nie możesz podjąć misji.' });
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

    ['strength', 'speed', 'endurance'].forEach(stat => {
      if (reqStats[stat] && reqStats[stat] > 0) {
        let playerStat = 1n;
        if (stat === 'strength') playerStat = effectiveStr;
        if (stat === 'speed') playerStat = effectiveSpd;
        if (stat === 'endurance') playerStat = effectiveEnd;
        
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
      
      // Obliczanie utraty statystyk fizycznych (dzielone równo na 3)
      const baseReward = maxBigInt(1n, BigInt(mission.reward_stats?.min || '1'));
      const totalStatLoss = baseReward * penaltyMultiplier;
      const lossPerStat = maxBigInt(1n, totalStatLoss / 3n);
      
      const strLoss = lossPerStat;
      const spdLoss = lossPerStat;
      const endLoss = lossPerStat;
      
      // Utrata monet
      const baseCoinsReward = maxBigInt(1n, BigInt(mission.reward_coins_min || '1'));
      const coinsLost = maxBigInt(0n, (baseCoinsReward * penaltyMultiplier));
      const newCoins = maxBigInt(0n, BigInt(character.coins || '0') - coinsLost);

      const finalStr = maxBigInt(1n, currentStr - strLoss);
      const finalSpd = maxBigInt(1n, currentSpd - spdLoss);
      const finalEnd = maxBigInt(1n, currentEnd - endLoss);
      const finalInt = currentInt; // Inteligencja nie jest tracona przy porażce
      const finalMen = currentMen; // Siła Mentalna nie jest tracona przy porażce

      const statsLostLog = {
          strength: strLoss.toString(), speed: spdLoss.toString(),
          endurance: endLoss.toString(), intelligence: '0',
          mental_strength: '0'
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

            // 2. Utrata procentowa ze WSZYSTKICH 5 statystyk bazowych
            const deathStrLoss = (currentStr * deathPenaltyPct) / 100n;
            const deathSpdLoss = (currentSpd * deathPenaltyPct) / 100n;
            const deathEndLoss = (currentEnd * deathPenaltyPct) / 100n;
            const deathIntLoss = (currentInt * deathPenaltyPct) / 100n;
            const deathMenLoss = (currentMen * deathPenaltyPct) / 100n;

            const deathFinalStr = maxBigInt(1n, currentStr - deathStrLoss);
            const deathFinalSpd = maxBigInt(1n, currentSpd - deathSpdLoss);
            const deathFinalEnd = maxBigInt(1n, currentEnd - deathEndLoss);
            const deathFinalInt = maxBigInt(1n, currentInt - deathIntLoss);
            const deathFinalMen = maxBigInt(1n, currentMen - deathMenLoss);

            const hospitalMinutes = Math.min(120, 5 + Math.floor(Math.pow(Number(pl), 0.25)));
            const exactEndMs = Date.now() + hospitalMinutes * 60000;
            const hospitalUntilUTC = new Date(exactEndMs).toISOString();

            const deathStatsLostLog = {
                strength: deathStrLoss.toString(),
                speed: deathSpdLoss.toString(),
                endurance: deathEndLoss.toString(),
                intelligence: deathIntLoss.toString(),
                mental_strength: deathMenLoss.toString(),
                hospital_end_ms: exactEndMs.toString()
            };

            await supabase.from('characters').update({
                hp: '0', mp: '0', stamina: newStamina.toString(), coins: deathNewCoins.toString(),
                strength: deathFinalStr.toString(), speed: deathFinalSpd.toString(), endurance: deathFinalEnd.toString(),
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
            intelligence: finalInt.toString(), mental_strength: finalMen.toString(),
            attempted_one_try_missions: (mission.is_one_try === true && !attemptedOneTry.includes(missionId)) ? [...attemptedOneTry, missionId] : attemptedOneTry
        }).eq('profile_id', userId);

        return res.json({ result: 'hurt', message: `PORAŻKA! Obrażenia: ${damagePercent}%`, damage: { hp: ((maxHp * damagePercent) / 100n).toString(), mp: ((maxMp * damagePercent) / 100n).toString(), stamina: ((maxStamina * damagePercent) / 100n).toString() }, penalty: { coins_lost: coinsLost.toString(), stats_lost: statsLostLog } });
      }
    }

    const minC = BigInt(mission.reward_coins_min || '0'); const maxC = BigInt(mission.reward_coins_max || '0');
    const finalCoins = ((minC + BigInt(Math.floor(Math.random() * Number(maxC - minC + 1n)))) * rewardMultiplier) / 100n;
    const newCoins = BigInt(character.coins || '0') + finalCoins;

    const minS = BigInt(mission.reward_stats?.min || '0'); const maxS = BigInt(mission.reward_stats?.max || '0');
    const finalStats = maxBigInt(1n, (maxBigInt(1n, minS + BigInt(Math.floor(Math.random() * Number(maxS - minS + 1n)))) * rewardMultiplier) / 100n);

    let lowestStat = 'strength'; let minVal = currentStr;
    if (currentSpd < minVal) { lowestStat = 'speed'; minVal = currentSpd; }
    if (currentEnd < minVal) { lowestStat = 'endurance'; minVal = currentEnd; }

    let gainStr = 0n; let gainSpd = 0n; let gainEnd = 0n;
    if (finalStats < 10n) {
        const baseGain = finalStats / 3n; gainStr = baseGain; gainSpd = baseGain; gainEnd = baseGain;
        const localRem = Number(finalStats % 3n);
        if (localRem > 0) {
            let targets = [0, 1, 2].sort(() => 0.5 - Math.random());
            if (lowestStat === 'strength') targets = [0, ...targets.filter(t => t !== 0)];
            else if (lowestStat === 'speed') targets = [1, ...targets.filter(t => t !== 1)];
            else targets = [2, ...targets.filter(t => t !== 2)];
            for (let i = 0; i < localRem; i++) { if (targets[i] === 0) gainStr += 1n; else if (targets[i] === 1) gainSpd += 1n; else if (targets[i] === 2) gainEnd += 1n; }
        }
    } else {
        const sumW = BigInt((lowestStat === 'strength' ? 100 : 50) + (lowestStat === 'speed' ? 100 : 50) + (lowestStat === 'endurance' ? 100 : 50));
        gainStr = (finalStats * BigInt(lowestStat === 'strength' ? 100 : 50)) / sumW;
        gainSpd = (finalStats * BigInt(lowestStat === 'speed' ? 100 : 50)) / sumW;
        gainEnd = (finalStats * BigInt(lowestStat === 'endurance' ? 100 : 50)) / sumW;
        const rem = finalStats - (gainStr + gainSpd + gainEnd);
        if (lowestStat === 'strength') gainStr += rem; else if (lowestStat === 'speed') gainSpd += rem; else gainEnd += rem;
    }

    // Sprzęt treningowy nie nalicza bonusów w przypadku porażki
    let trainGainStr = 0n; let trainGainSpd = 0n; let trainGainEnd = 0n;
    let trainGainBonusHp = 0n; let trainGainBonusMp = 0n;
    
    // Tylko przy sukcesie naliczamy bonusy treningowe
    if (fullStats.trainingStats && roll <= Number(successChance)) {
        if (BigInt(fullStats.trainingStats.strength || '0') > 0n) trainGainStr = maxBigInt(1n, (BigInt(fullStats.trainingStats.strength) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.speed || '0') > 0n) trainGainSpd = maxBigInt(1n, (BigInt(fullStats.trainingStats.speed) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.endurance || '0') > 0n) trainGainEnd = maxBigInt(1n, (BigInt(fullStats.trainingStats.endurance) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.bonus_hp || '0') > 0n) trainGainBonusHp = maxBigInt(1n, (BigInt(fullStats.trainingStats.bonus_hp) * rewardMultiplier) / 100n);
        if (BigInt(fullStats.trainingStats.bonus_mp || '0') > 0n) trainGainBonusMp = maxBigInt(1n, (BigInt(fullStats.trainingStats.bonus_mp) * rewardMultiplier) / 100n);
    }

    const newStr = currentStr + gainStr + trainGainStr;
    const newSpd = currentSpd + gainSpd + trainGainSpd;
    const newEnd = currentEnd + gainEnd + trainGainEnd;
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
        // Obliczenie dynamicznego plecaka wg wzoru z GDD
        const minPhysicalStat = minBigInt(currentStr, minBigInt(currentSpd, currentEnd));
        let maxBackpackSlots = 5 + Number(minPhysicalStat / 10000n);
        if (maxBackpackSlots > 50) maxBackpackSlots = 50;

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
    
    // Każda pierwsza wygrana (nawet powtarzalna) musi trafić do completed, 
    // aby odblokować graczowi kolejną misję na liście!
    if (!newCompleted.includes(missionId)) newCompleted.push(missionId);
    
    // Zapisujemy próbę dla misji One-Try
    if (mission.is_one_try === true && !newAttempted.includes(missionId)) newAttempted.push(missionId);

    await supabase.from('characters').update({
        coins: newCoins.toString(), strength: newStr.toString(), speed: newSpd.toString(), endurance: newEnd.toString(), 
        hp: finalHp.toString(), mp: finalMp.toString(), stamina: finalStamina.toString(),
        bonus_hp: newBonusHp.toString(), bonus_mp: newBonusMp.toString(),
        completed_missions: newCompleted,
        attempted_one_try_missions: newAttempted
      }).eq('profile_id', userId);

    res.json({ 
      result: 'success', message: 'Sukces!', multiplier: Number(rewardMultiplier),
      rewards: { 
        coins: finalCoins.toString(), stats_gained: finalStats.toString(),
        boredom_damage: appliedBoredomDamage.toString(),
        dropped_items: droppedItems, 
        lost_items: lostDrops,
        gains: { strength: gainStr.toString(), speed: gainSpd.toString(), endurance: gainEnd.toString() },
        training_gains: { 
            strength: trainGainStr.toString(), speed: trainGainSpd.toString(), endurance: trainGainEnd.toString(),
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

    const { data: backpackItems } = await supabase.from('inventory').select('id, backpack_index').eq('character_id', character.id).is('equipped_slot', null);
    if (backpackItems.length >= 5) return res.status(400).json({ error: 'Brak miejsca w plecaku!' });

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

app.get('/api/shop/items', authenticateToken, async (req, res) => {
  try {
    const { data } = await supabase.from('item_templates').select('*').not('buy_price_coins', 'is', null).order('buy_price_coins', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

app.post('/api/shop/buy', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { template_id, quantity = 1 } = req.body;

    const { data: character } = await supabase.from('characters').select('id, coins').eq('profile_id', userId).single();
    const { data: itemTemplate } = await supabase.from('item_templates').select('*, buy_price_coins').eq('id', template_id).single();

    if (!character || !itemTemplate || itemTemplate.buy_price_coins === null) return res.status(400).json({ error: 'Błąd zakupu' });

    const totalCost = BigInt(itemTemplate.buy_price_coins) * BigInt(quantity);
    if (BigInt(character.coins || '0') < totalCost) return res.status(400).json({ error: 'Nie masz monet!' });

    const { data: backpackItems } = await supabase.from('inventory').select('id, item_template_id, quantity, backpack_index').eq('character_id', character.id).is('equipped_slot', null);
    
    const existingItem = backpackItems.find(item => item.item_template_id === template_id);
    const isStackable = itemTemplate.category === 'consumable' || itemTemplate.category === 'special_consumable';
    if (!existingItem || !isStackable) { if (backpackItems.length >= 5) return res.status(400).json({ error: 'Pełny plecak!' }); }

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

app.post('/api/shop/sell', authenticateToken, async (req, res) => {
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
    await supabase.from('global_server_state').update({ current_dc_day: globalServerState.current_dc_day + 1 }).eq('id', 1);
    await delay(30000);
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
  } catch (error) {
    await supabase.from('global_server_state').update({ is_maintenance: false }).eq('id', 1);
  }
});