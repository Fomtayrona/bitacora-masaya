/**
 * ============================================================================
 * BITÁCORA MASAYA - LÓGICA CORE Y AUTENTICACIÓN (app.js)
 * ============================================================================
 * Propósito:
 *   Administrar la conexión REST/SDK con Supabase, la inicialización del sistema,
 *   la autenticación por PIN, la gestión de sesiones y la administración de 
 *   colaboradores (creación, edición de sedes asignadas y activación/desactivación).
 *
 * Variables Globales Relevantes:
 *   - _supabase: Instancia cliente de Supabase JS.
 *   - selectedUser: Objeto del usuario con sesión activa.
 *   - selectedHotelId: UUID de la sede en la que se ha iniciado sesión.
 *   - allUsers, allHotels, allUserHotels: Cachés locales de datos compartidos.
 *
 * Dependencias:
 *   - Supabase Client SDK (cdn.jsdelivr.net/npm/@supabase/supabase-js@2)
 *   - styles.css
 * ============================================================================
 */

const SUPABASE_URL = 'https://tsxecbjacdblbxprobdi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_awz6uY_HmS1o3mf7Pgh55A_kAjbGfRQ';
let _supabase;

let currentPin = "";
let selectedUser = null;
let selectedHotelId = null;
let editingUserId = null;

let allUsers = [];
let allHotels = [];
let allUserHotels = [];
let allCategories = [];
let currentIncidents = [];

/**
 * Petición REST resiliente con timeout configurable para evitar congelamientos en UI.
 */
async function fetchRest(table, ms = 2500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Inicialización principal de la app y carga resiliente de sedes.
 */
async function initApp() {
  const hotelSelect = document.getElementById('hotel-select');
  hideMsgs();
  if (hotelSelect) hotelSelect.innerHTML = '<option value="">Cargando hoteles...</option>';

  try {
    if (window.supabase) {
      _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    try {
      allHotels = await fetchRest('hotels', 2500);
    } catch (e1) {
      console.warn("Reintentando carga inicial de sedes...");
      allHotels = await fetchRest('hotels', 3000);
    }

    if (!allHotels || allHotels.length === 0) {
      if (hotelSelect) hotelSelect.innerHTML = '<option value="">No hay hoteles disponibles</option>';
      return;
    }

    if (hotelSelect) {
      hotelSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + 
        allHotels.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
    }

    renderHotelCheckboxes();
    refreshData();

  } catch (err) {
    showError("⚠️ No se pudo conectar con las sedes. <br><button class=\"btn-retry\" onclick=\"initApp()\">↻ Cargar Sedes Ahora</button>");
    if (hotelSelect) hotelSelect.innerHTML = '<option value="">Error de conexión</option>';
  }
}

/**
 * Refresca los arrays en memoria desde Supabase en segundo plano.
 */
async function refreshData() {
  try {
    const [users, userHotels, cats] = await Promise.all([
      fetchRest('users'),
      fetchRest('user_hotels'),
      fetchRest('incident_categories')
    ]);
    allUsers = users || [];
    allUserHotels = userHotels || [];
    allCategories = cats || [];
  } catch (e) {
    console.warn("Carga diferida:", e.message);
  }
}

/**
 * Renderiza los checkboxes de sedes en el formulario de creación de colaboradores.
 */
function renderHotelCheckboxes() {
  const container = document.getElementById('hotels-checkboxes');
  if (!container) return;
  container.innerHTML = allHotels.map(h => `
    <label class="checkbox-item">
      <input type="checkbox" name="user-hotels" value="${h.id}">
      ${h.name}
    </label>
  `).join('');
}

/**
 * Carga el selector de usuarios según la sede elegida.
 */
async function loadUsersForHotel() {
  selectedHotelId = document.getElementById('hotel-select').value;
  const userSelect = document.getElementById('user-select');
  
  if (!selectedHotelId) {
    userSelect.innerHTML = '<option value="">Primero selecciona hotel</option>';
    userSelect.disabled = true;
    return;
  }

  await refreshData();

  const assignedUserIds = allUserHotels
    .filter(uh => uh.hotel_id === selectedHotelId)
    .map(uh => uh.user_id);

  const filteredUsers = allUsers.filter(u => assignedUserIds.includes(u.id) && u.is_active !== false);

  if (filteredUsers.length === 0) {
    userSelect.innerHTML = '<option value="">Sin usuarios en esta sede</option>';
    userSelect.disabled = true;
    return;
  }

  userSelect.innerHTML = '<option value="">-- Seleccionar Usuario --</option>' +
    filteredUsers.map(u => `<option value="${u.id}">${u.display_name || u.full_name}</option>`).join('');
  
  userSelect.disabled = false;
  userSelect.onchange = selectUser;
}

/**
 * Prepara la pantalla para ingresar PIN una vez seleccionado el usuario.
 */
function selectUser() {
  const userId = document.getElementById('user-select').value;
  if (!userId) return;

  selectedUser = allUsers.find(u => u.id === userId);
  document.getElementById('selected-user-name').innerText = `👤 ${selectedUser.display_name || selectedUser.full_name}`;
  
  document.getElementById('step-select').style.display = 'none';
  document.getElementById('step-pin').style.display = 'block';
  clearPin();
}

/* Lógica del Teclado PIN */
function pressKey(num) {
  if (currentPin.length < 4) {
    currentPin += num;
    updatePinDots();
    if (currentPin.length === 4) validatePin();
  }
}

function deleteLastPin() {
  currentPin = currentPin.slice(0, -1);
  updatePinDots();
}

function clearPin() {
  currentPin = "";
  updatePinDots();
  hideMsgs();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      if (i < currentPin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

function validatePin() {
  if (currentPin === selectedUser.pin) {
    openSession();
  } else {
    showError("❌ PIN Incorrecto");
    setTimeout(() => clearPin(), 800);
  }
}

/**
 * Abre la sesión de trabajo y renderiza paneles según el rol.
 */
async function openSession() {
  document.getElementById('step-pin').style.display = 'none';
  document.getElementById('step-session').style.display = 'block';
  document.getElementById('main-card').classList.add('wide');

  const currentHotel = allHotels.find(h => h.id === selectedHotelId);
  document.getElementById('session-user').innerText = selectedUser.display_name || selectedUser.full_name;
  document.getElementById('session-hotel-name').innerText = currentHotel ? `🏨 ${currentHotel.name}` : '';
  
  const roleBadge = document.getElementById('session-role');
  roleBadge.innerText = selectedUser.role;
  roleBadge.className = `badge-role ${selectedUser.role === 'ADMIN' ? 'badge-admin' : 'badge-op'}`;

  // Inicializa módulo de novedades (si la función existe en incidents.js)
  if (typeof populateCategoriesSelect === 'function') populateCategoriesSelect();
  if (typeof loadIncidents === 'function') await loadIncidents();

  const adminNav = document.getElementById('admin-nav');
  if (selectedUser.role === 'ADMIN') {
    if (adminNav) adminNav.style.display = 'flex';
    document.getElementById('tab-users').style.display = 'none';
    document.getElementById('tab-categories').style.display = 'none';
    document.getElementById('incidents-section').style.display = 'block';
    await refreshData();
    renderUsersTable();
    if (typeof renderCategoriesTable === 'function') renderCategoriesTable();
  } else {
    if (adminNav) adminNav.style.display = 'none';
    document.getElementById('incidents-section').style.display = 'block';
  }
}

/**
 * Control del menú de pestañas para administradores.
 */
function switchAdminTab(tabName) {
  document.querySelectorAll('#admin-nav .tab-btn').forEach(b => b.classList.remove('active'));
  
  document.getElementById('incidents-section').style.display = 'none';
  document.getElementById('tab-users').style.display = 'none';
  document.getElementById('tab-categories').style.display = 'none';

  if (tabName === 'incidents') {
    document.getElementById('incidents-section').style.display = 'block';
  } else if (tabName === 'users') {
    document.getElementById('tab-users').style.display = 'block';
  } else if (tabName === 'categories') {
    document.getElementById('tab-categories').style.display = 'block';
  }
  
  if (event && event.target) event.target.classList.add('active');
}

/**
 * Gestión de Colaboradores (Admin)
 */
async function createUser(e) {
  e.preventDefault();
  hideMsgs();

  const selectedHotels = Array.from(document.querySelectorAll('input[name="user-hotels"]:checked')).map(cb => cb.value);

  if (selectedHotels.length === 0) {
    showError("⚠️ Debes seleccionar al menos una sede/hotel.");
    return;
  }

  const newUser = {
    hotel_id: selectedHotels[0],
    full_name: document.getElementById('new-user-fullname').value,
    display_name: document.getElementById('new-user-display').value,
    email: document.getElementById('new-user-email').value,
    role: document.getElementById('new-user-role').value,
    pin: document.getElementById('new-user-pin').value,
    pin_hash: document.getElementById('new-user-pin').value,
    pin_salt: 'default_salt',
    area: 'GENERAL',
    is_active: true
  };

  const { data: userCreated, error: uErr } = await _supabase.from('users').insert([newUser]).select();

  if (uErr) {
    if (uErr.message.includes('users_email_key')) {
      showError("⚠️ Este correo ya está registrado. Usa el botón 'Sedes' en la lista de abajo para añadirle nuevas sedes.");
    } else {
      showError("Error al guardar usuario: " + uErr.message);
    }
    return;
  }

  const createdId = userCreated[0].id;

  const userHotelRows = selectedHotels.map(hId => ({
    user_id: createdId,
    hotel_id: hId
  }));

  const { error: uhErr } = await _supabase.from('user_hotels').insert(userHotelRows);

  if (uhErr) {
    showError("Usuario creado, pero hubo un error asignando sedes: " + uhErr.message);
  } else {
    showSuccess("¡Usuario registrado y asignado a sus sedes exitosamente!");
    e.target.reset();
    document.querySelectorAll('input[name="user-hotels"]').forEach(cb => cb.checked = false);
    await refreshData();
    renderUsersTable();
  }
}

function getUserHotelsBadges(userId) {
  const hotelIds = allUserHotels
    .filter(uh => uh.user_id === userId)
    .map(uh => uh.hotel_id);

  if (hotelIds.length === 0) return '<span style="color:#999; font-size:11px;">Sin sedes</span>';

  return hotelIds.map(hId => {
    const hotel = allHotels.find(h => h.id === hId);
    return hotel ? `<span class="badge-hotel">🏨 ${hotel.name}</span>` : '';
  }).join('');
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = allUsers.map(u => `
    <tr>
      <td><b>${u.display_name || u.full_name}</b><br><small style="color:#666">${u.email || ''}</small></td>
      <td>${getUserHotelsBadges(u.id)}</td>
      <td><span class="badge-role ${u.role === 'ADMIN' ? 'badge-admin' : 'badge-op'}">${u.role}</span></td>
      <td><code>${u.pin || '****'}</code></td>
      <td>
        <button onclick="openEditModal('${u.id}')" class="btn-sm btn-edit">Sedes</button>
        <button onclick="toggleUserStatus('${u.id}', ${u.is_active !== false})" class="btn-sm btn-danger">
          ${u.is_active !== false ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    </tr>
  `).join('');
}

function openEditModal(userId) {
  editingUserId = userId;
  const user = allUsers.find(u => u.id === userId);
  document.getElementById('edit-user-name').innerText = user.full_name + " (" + user.email + ")";

  const currentHotelIds = allUserHotels
    .filter(uh => uh.user_id === userId)
    .map(uh => uh.hotel_id);

  const container = document.getElementById('edit-hotels-checkboxes');
  container.innerHTML = allHotels.map(h => `
    <label class="checkbox-item">
      <input type="checkbox" name="edit-user-hotels" value="${h.id}" ${currentHotelIds.includes(h.id) ? 'checked' : ''}>
      ${h.name}
    </label>
  `).join('');

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  editingUserId = null;
}

async function saveUserHotels() {
  if (!editingUserId) return;

  const selectedHotels = Array.from(document.querySelectorAll('input[name="edit-user-hotels"]:checked')).map(cb => cb.value);

  if (selectedHotels.length === 0) {
    alert("El colaborador debe tener al menos una sede asignada.");
    return;
  }

  await _supabase.from('user_hotels').delete().eq('user_id', editingUserId);

  const rows = selectedHotels.map(hId => ({
    user_id: editingUserId,
    hotel_id: hId
  }));

  const { error } = await _supabase.from('user_hotels').insert(rows);

  if (!error) {
    closeEditModal();
    await refreshData();
    renderUsersTable();
    showSuccess("¡Sedes del usuario actualizadas exitosamente!");
  } else {
    alert("Error al actualizar sedes: " + error.message);
  }
}

async function toggleUserStatus(userId, currentActive) {
  const { error } = await _supabase.from('users').update({ is_active: !currentActive }).eq('id', userId);
  if (!error) {
    await refreshData();
    renderUsersTable();
  }
}

/**
 * Cierra la sesión activa y restaura el estado de login.
 */
function resetFlow() {
  currentPin = "";
  selectedUser = null;
  selectedHotelId = null;
  document.getElementById('main-card').classList.remove('wide');
  document.getElementById('hotel-select').value = "";
  document.getElementById('user-select').value = "";
  document.getElementById('user-select').disabled = true;
  document.getElementById('step-pin').style.display = 'none';
  document.getElementById('step-session').style.display = 'none';
  document.getElementById('step-select').style.display = 'block';
  hideMsgs();
}

/* Helpers para mensajes en pantalla */
function showError(msg) {
  const errDiv = document.getElementById('error-msg');
  if (errDiv) {
    errDiv.innerHTML = msg;
    errDiv.style.display = 'block';
  }
}

function showSuccess(msg) {
  const succDiv = document.getElementById('success-msg');
  if (succDiv) {
    succDiv.innerText = msg;
    succDiv.style.display = 'block';
    setTimeout(() => succDiv.style.display = 'none', 3000);
  }
}

function hideMsgs() {
  const errDiv = document.getElementById('error-msg');
  const succDiv = document.getElementById('success-msg');
  if (errDiv) errDiv.style.display = 'none';
  if (succDiv) succDiv.style.display = 'none';
}

/* Ejecución inicial al cargar la página */
initApp();
