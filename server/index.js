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

    // Obliczenia Max HP/MP/Stamina zgodnie z GDD
    const max_hp = 100n + (strength / 100n) * 50n + bonus_hp;
    const max_mp = 100n + (intelligence / 100n) * 50n + bonus_mp;
    const max_stamina = 100n + bonus_stamina;

    // Obliczenie całkowitego Poziomu Mocy
    const stats_sum = strength + speed + endurance + intelligence + mental_strength;
    const powerLevel = (stats_sum * 10n) + ((max_hp + max_mp) / 5n) + (max_stamina / 10n);

    // Przygotowanie obiektu odpowiedzi z poprawnymi kluczami!
    const characterData = {
      username: profile.username,
      power_level: powerLevel.toString(),
      coins: character.coins || '0',
      current_form: character.current_form || 'Stan Podstawowy',
      
      current_hp: character.hp || '100',
      current_mp: character.mp || '100',
      current_stamina: character.stamina || '100',
      
      max_hp: max_hp.toString(),
      max_mp: max_mp.toString(),
      max_stamina: max_stamina.toString(),
      
      stats: {
        strength: character.strength || '1',
        speed: character.speed || '1',
        endurance: character.endurance || '1',
        intelligence: character.intelligence || '1',
        mental_strength: character.mental_strength || '1'
      }
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

// ==========================================
// START SERWERA
// ==========================================
app.listen(port, async () => {
  console.log(`[Dojo-Clicker API] Serwer nasłuchuje na porcie ${port}...`);
  // Ładujemy stan do RAM od razu po włączeniu serwera
  await initGlobalState();
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