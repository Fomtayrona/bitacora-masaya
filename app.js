/**
 * ============================================================================
 * BITÁCORA MASAYA - LÓGICA DE AUTENTICACIÓN Y NAVEGACIÓN (app.js v3.0)
 * ============================================================================
 */

const SUPABASE_URL = 'https://cbqilujgqscscryxszhh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicWlsdWpncXNjc2NyeXhzemhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzODU0NDMsImV4cCI6MjA1NTk2MTQ0M30.6iG_5A_V4Z3b6Z9-gK6R4nQ3bO_9x2G6Y7U3P4_1_0k';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allHotels = [];
let allUsers = [];
let allCategories = [];
let currentIncidents = [];

let selectedHotelId = null;
let selectedUserId = null;
let selectedUser = null;
let enteredPin = '';

document.addEventListener('DOMContentLoaded', async () => {
  await initLogin();
});

async function initLogin() {
  clearPin();
  hideMsgs();
  
  try {
    const { data: hotels, error: hError } = await _supabase
      .from('hotels')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (hError) throw hError;
    allHotels = hotels || [];

    const hotelSelect = document.getElementById('login-hotel-select');
    if (hotelSelect) {
      hotelSelect.innerHTML = allHotels.length === 0 
        ? '<option value="">Sin sedes disponibles</option>'
        : allHotels.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
    }

    if (allHotels.length > 0) {
      selectedHotelId = allHotels[0].id;
      await onHotelChange();
    }
  } catch (err) {
    showLoginError("Error al iniciar la app: " + err.message);
  }
}

async function onHotelChange() {
  const hotelSelect = document.getElementById('login-hotel-select');
  if (hotelSelect) selectedHotelId = hotelSelect.value;
  
  clearPin();
  if (!selectedHotelId) return;

  try {
    const { data: userHotels, error: uhError } = await _supabase
      .from('user_hotels')
      .select('user_id')
      .eq('hotel_id', selectedHotelId);

    if (uhError) throw uhError;
    const userIds = (userHotels || []).map(uh => uh.user_id);

    if (userIds.length === 0) {
      document.getElementById('login-user-select').innerHTML = '<option value="">Sin colaboradores en esta sede</option>';
      allUsers = [];
      return;
    }

    const { data: users, error: uError } = await _supabase
      .from('users')
      .select('*')
      .in('id', userIds)
      .eq('is_active', true)
      .order('full_name');

    if (uError) throw uError;
    allUsers = users || [];

    const userSelect = document.getElementById('login-user-select');
    if (userSelect) {
      userSelect.innerHTML = allUsers.map(u => 
        `<option value="${u.id}">${u.display_name || u.full_name}</option>`
      ).join('');
      
      if (allUsers.length > 0) {
        selectedUserId = allUsers[0].id;
      }
    }
  } catch (err) {
    showLoginError("Error cargando usuarios: " + err.message);
  }
}

function appendPin(digit) {
  if (enteredPin.length < 4) {
    enteredPin += digit;
    updatePinDisplay();
  }
}

function clearPin() {
  enteredPin = '';
  updatePinDisplay();
}

function updatePinDisplay() {
  const display = document.getElementById('pin-display');
  if (display) {
    display.innerText = '•'.repeat(enteredPin.length) || '••••';
  }
}

async function submitPin() {
  hideMsgs();
  const userSelect = document.getElementById('login-user-select');
  if (!userSelect || !userSelect.value) {
    showLoginError("Por favor selecciona un usuario.");
    return;
  }

  if (enteredPin.length !== 4) {
    showLoginError("Ingresa tu PIN de 4 dígitos.");
    return;
  }

  selectedUserId = userSelect.value;
  selectedUser = allUsers.find(u => u.id === selectedUserId);

  if (!selectedUser) {
    showLoginError("Usuario no encontrado.");
    return;
  }

  if (selectedUser.pin_code !== enteredPin) {
    showLoginError("PIN incorrecto. Intenta de nuevo.");
    clearPin();
    return;
  }

  // Éxito en Autenticación
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';

  const hotelObj = allHotels.find(h => h.id === selectedHotelId);
  document.getElementById('current-hotel-name').innerText = hotelObj ? hotelObj.name : 'Sede';
  document.getElementById('current-user-name').innerText = selectedUser.display_name || selectedUser.full_name;

  // Control de Roles para Pestañas Admin
  const isAdmin = selectedUser.role && selectedUser.role.toUpperCase().includes('ADMIN');
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'inline-block' : 'none';
  });

  await refreshData();
}

function logout() {
  selectedUser = null;
  enteredPin = '';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  initLogin();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));

  const activeTab = document.getElementById(`tab-${tabName}`);
  const activeBtn = document.getElementById(`tab-${tabName}-btn`);

  if (activeTab) activeTab.classList.add('active');
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'users') renderUsersTable();
  if (tabName === 'categories') renderCategoriesTable();
}

async function refreshData() {
  try {
    const { data: categories } = await _supabase.from('incident_categories').select('*').order('name');
    allCategories = categories || [];
    
    if (typeof populateCategoriesSelect === 'function') populateCategoriesSelect();
    if (typeof loadIncidents === 'function') await loadIncidents();

  } catch (err) {
    console.error("Error al refrescar datos:", err);
  }
}

function toggleNewIncidentForm() {
  const form = document.getElementById('new-incident-form-container');
  if (form) {
    form.style.display = (form.style.display === 'none' || form.style.display === '') ? 'block' : 'none';
  }
}

/* Gestión de Mensajes de Interfaz */
function showLoginError(msg) {
  const box = document.getElementById('login-msg');
  if (box) {
    box.innerText = msg;
    box.className = 'msg-box msg-error';
    box.style.display = 'block';
  }
}

function showError(msg) {
  const box = document.getElementById('global-msg');
  if (box) {
    box.innerText = msg;
    box.className = 'msg-box msg-error';
    box.style.display = 'block';
  }
}

function showSuccess(msg) {
  const box = document.getElementById('global-msg');
  if (box) {
    box.innerText = msg;
    box.className = 'msg-box msg-success';
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 4000);
  }
}

function hideMsgs() {
  const loginBox = document.getElementById('login-msg');
  const globalBox = document.getElementById('global-msg');
  if (loginBox) loginBox.style.display = 'none';
  if (globalBox) globalBox.style.display = 'none';
}
