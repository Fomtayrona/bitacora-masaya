/**
 * ============================================================================
 * BITÁCORA MASAYA - MURO OPERATIVO EXPRESS (incidents.js v3.0)
 * ============================================================================
 */

let resolvingIncidentId = null;

const AREA_LABELS = {
  'GENERAL': '📢 General / Todo el Equipo',
  'RECEPCION': 'Recepción',
  'MANTENIMIENTO': 'Mantenimiento',
  'CAMARERIA': 'Camarería (Ama de Llaves)',
  'MESAS_BAR': 'Mesas y Bar',
  'COCINA': 'Cocina',
  'ADMINISTRACION': 'Administración',
  'GERENCIA': 'Gerencia',
  'SISTEMAS': 'Sistemas'
};

async function populateAssignedUsersSelect() {
  const select = document.getElementById('inc-assigned-to');
  if (!select || !selectedHotelId) return;

  select.innerHTML = '<option value="">Cargando colaboradores...</option>';

  try {
    const { data: userHotels, error: uhError } = await _supabase
      .from('user_hotels')
      .select('user_id')
      .eq('hotel_id', selectedHotelId);

    if (uhError) throw uhError;

    const userIds = (userHotels || []).map(uh => uh.user_id);

    if (userIds.length === 0) {
      select.innerHTML = '<option value="">-- Sin asignar (Para el área) --</option>';
      return;
    }

    const { data: users, error: uError } = await _supabase
      .from('users')
      .select('id, full_name, display_name, is_active')
      .in('id', userIds)
      .order('full_name', { ascending: true });

    if (uError) throw uError;

    const activeUsers = (users || []).filter(u => u.is_active !== false);

    select.innerHTML = '<option value="">-- Sin asignar (Para el área) --</option>' +
      activeUsers.map(u => `<option value="${u.id}">${u.display_name || u.full_name}</option>`).join('');

  } catch (err) {
    console.error("Error cargando asignables:", err);
    select.innerHTML = '<option value="">-- Sin asignar (Para el área) --</option>';
  }
}

function populateCategoriesSelect() {
  const select = document.getElementById('inc-category');
  if (!select) return;

  const activeCategories = allCategories.filter(c => c.is_active !== false);
  if (activeCategories.length === 0) {
    select.innerHTML = '<option value="General">General</option>';
    return;
  }
  select.innerHTML = activeCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

async function loadIncidents() {
  const container = document.getElementById('incidents-timeline');
  if (!container) return;

  container.innerHTML = "Cargando novedades...";

  try {
    const { data, error } = await _supabase
      .from('incidents')
      .select(`
        *,
        author:user_id(full_name, display_name),
        assigned:assigned_to_user_id(full_name, display_name),
        resolver:resolved_by_user_id(full_name, display_name)
      `)
      .eq('hotel_id', selectedHotelId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    currentIncidents = data || [];

    await populateAssignedUsersSelect();
    updateMyTasksBanner();
    filterIncidents();

  } catch (err) {
    container.innerHTML = `<p style="color:red; font-size:12px;">Error al cargar novedades: ${err.message}</p>`;
  }
}

function updateMyTasksBanner() {
  const banner = document.getElementById('my-tasks-banner');
  const countSpan = document.getElementById('my-tasks-count');
  if (!banner || !countSpan || !selectedUser) return;

  const myPendingTasks = currentIncidents.filter(inc => {
    const assignedId = inc.assigned_to_user_id || (inc.assigned ? inc.assigned.id : null);
    return assignedId === selectedUser.id && (inc.status || 'PENDIENTE') !== 'RESUELTO';
  });

  if (myPendingTasks.length > 0) {
    countSpan.innerText = `👤 Tienes ${myPendingTasks.length} tarea(s) pendiente(s) asignada(s) directamente a ti.`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function filterMyTasks() {
  if (!selectedUser) return;
  const myTasks = currentIncidents.filter(inc => {
    const assignedId = inc.assigned_to_user_id || (inc.assigned ? inc.assigned.id : null);
    return assignedId === selectedUser.id;
  });
  renderIncidentsList(myTasks);
}

function clearTaskFilters() {
  const statusSelect = document.getElementById('filter-status');
  const areaSelect = document.getElementById('filter-area');
  const searchInput = document.getElementById('filter-search');

  if (statusSelect) statusSelect.value = 'TODOS';
  if (areaSelect) areaSelect.value = 'TODAS';
  if (searchInput) searchInput.value = '';

  renderIncidentsList(currentIncidents);
}

function filterIncidents() {
  const statusFilter = document.getElementById('filter-status')?.value || 'TODOS';
  const areaFilter = document.getElementById('filter-area')?.value || 'TODAS';
  const searchFilter = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

  const filtered = currentIncidents.filter(inc => {
    const incStatus = inc.status || 'PENDIENTE';
    const matchStatus = (statusFilter === 'TODOS') || (incStatus === statusFilter);
    const matchArea = (areaFilter === 'TODAS') || ((inc.target_area || 'GENERAL') === areaFilter);
    
    const authorName = inc.author ? (inc.author.display_name || inc.author.full_name) : '';
    const assignedName = inc.assigned ? (inc.assigned.display_name || inc.assigned.full_name) : '';
    const areaText = AREA_LABELS[inc.target_area] || inc.target_area || '';

    const titleMatch = (inc.title || '').toLowerCase().includes(searchFilter);
    const descMatch = (inc.description || '').toLowerCase().includes(searchFilter);
    const authorMatch = authorName.toLowerCase().includes(searchFilter);
    const assignedMatch = assignedName.toLowerCase().includes(searchFilter);
    const areaMatch = areaText.toLowerCase().includes(searchFilter);

    const matchSearch = !searchFilter || titleMatch || descMatch || authorMatch || assignedMatch || areaMatch;

    return matchStatus && matchArea && matchSearch;
  });

  renderIncidentsList(filtered);
}

function renderIncidentsList(incidentsToRender) {
  const container = document.getElementById('incidents-timeline');
  if (!container) return;

  if (incidentsToRender.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#888; font-size:13px; padding:20px;">No hay novedades para mostrar.</p>';
    return;
  }

  container.innerHTML = incidentsToRender.map(inc => {
    const author = inc.author ? (inc.author.display_name || inc.author.full_name) : 'Desconocido';
    const assignedTo = inc.assigned ? (inc.assigned.display_name || inc.assigned.full_name) : 'Sin asignar (Área)';
    const resolver = inc.resolver ? (inc.resolver.display_name || inc.resolver.full_name) : 'Desconocido';
    const areaLabel = AREA_LABELS[inc.target_area] || inc.target_area || 'General';
    
    const dateStr = new Date(inc.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    const resolvedDateStr = inc.resolved_at ? new Date(inc.resolved_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const status = inc.status || 'PENDIENTE';

    const isAdmin = selectedUser && selectedUser.role && selectedUser.role.toUpperCase().includes('ADMIN');

    return `
      <div class="incident-card">
        <div class="incident-header">
          <span class="incident-title">${inc.title}</span>
          <div>
            ${inc.is_room_blocked ? '<span class="badge-room-blocked">🚨 BLOQUEA HAB.</span>' : ''}
            <span class="badge-role prio-${inc.priority}">${inc.priority}</span>
            <span class="badge-role status-${status.replace(' ', '')}">${status}</span>
          </div>
        </div>
        
        <div class="incident-meta">
          📍 <b>Área:</b> ${areaLabel} | 🏷️ <b>Categoría:</b> ${inc.category}<br>
          👤 <b>Reportó:</b> ${author} | 🎯 <b>Asignado:</b> ${assignedTo} | 🕒 ${dateStr}
        </div>
        
        <div class="incident-body">${inc.description}</div>

        ${status === 'RESUELTO' && inc.resolution_notes ? `
          <div class="resolution-box">
            <b>✅ Solución por ${resolver} (${resolvedDateStr}):</b><br>${inc.resolution_notes}
          </div>
        ` : ''}
        
        <div class="incident-actions">
          <span style="font-weight:600; color:#666;">Cambiar Estado:</span>
          <button onclick="updateIncidentStatus('${inc.id}', 'PENDIENTE')" class="btn-sm btn-danger">Pendiente</button>
          <button onclick="updateIncidentStatus('${inc.id}', 'PROCESO')" class="btn-sm btn-warning">En Proceso</button>
          <button onclick="openResolveModal('${inc.id}')" class="btn-sm btn-success">✓ Resolver</button>
          
          ${isAdmin ? `
            <button onclick="deleteIncident('${inc.id}')" class="btn-sm btn-danger" style="margin-left: auto; background: #991b1b; color: white;">🗑️ Eliminar</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function createIncident(e) {
  e.preventDefault();
  hideMsgs();

  const assignedVal = document.getElementById('inc-assigned-to').value;

  const newInc = {
    hotel_id: selectedHotelId,
    user_id: selectedUser.id,
    category: document.getElementById('inc-category').value,
    target_area: document.getElementById('inc-target-area').value,
    assigned_to_user_id: assignedVal ? assignedVal : null,
    priority: document.getElementById('inc-priority').value,
    is_room_blocked: document.getElementById('inc-room-blocked').checked,
    title: document.getElementById('inc-title').value,
    description: document.getElementById('inc-description').value,
    status: 'PENDIENTE'
  };

  const { error } = await _supabase.from('incidents').insert([newInc]);

  if (error) {
    showError("Error al guardar novedad: " + error.message);
  } else {
    showSuccess("¡Novedad registrada exitosamente!");
    e.target.reset();
    toggleNewIncidentForm();
    await loadIncidents();
  }
}

async function updateIncidentStatus(incId, newStatus) {
  hideMsgs();
  const { error } = await _supabase.from('incidents').update({ status: newStatus }).eq('id', incId);

  if (!error) {
    showSuccess("¡Estado actualizado!");
    await loadIncidents();
  } else {
    showError("Error al actualizar estado: " + error.message);
  }
}

function openResolveModal(incId) {
  resolvingIncidentId = incId;
  const inc = currentIncidents.find(i => i.id === incId);
  if (!inc) return;

  document.getElementById('resolve-incident-title').innerText = inc.title;
  document.getElementById('resolve-notes').value = '';
  document.getElementById('resolve-modal').style.display = 'flex';
}

function closeResolveModal() {
  document.getElementById('resolve-modal').style.display = 'none';
  resolvingIncidentId = null;
}

async function confirmResolveIncident() {
  if (!resolvingIncidentId) return;

  const notes = document.getElementById('resolve-notes').value.trim();
  if (!notes) {
    alert("Escribe brevemente cómo se resolvió la novedad.");
    return;
  }

  hideMsgs();
  const { error } = await _supabase
    .from('incidents')
    .update({
      status: 'RESUELTO',
      resolution_notes: notes,
      resolved_by_user_id: selectedUser.id,
      resolved_at: new Date().toISOString()
    })
    .eq('id', resolvingIncidentId);

  if (!error) {
    closeResolveModal();
    showSuccess("¡Novedad resuelta!");
    await loadIncidents();
  } else {
    alert("Error al resolver novedad: " + error.message);
  }
}

async function deleteIncident(incId) {
  const isAdmin = selectedUser && selectedUser.role && selectedUser.role.toUpperCase().includes('ADMIN');
  if (!isAdmin) {
    alert("No tienes permisos suficientes.");
    return;
  }

  const incident = currentIncidents.find(i => i.id === incId);
  const title = incident ? incident.title : 'esta novedad';

  if (!confirm(`⚠️ ¿Deseas eliminar permanentemente:\n"${title}"?`)) return;

  hideMsgs();
  try {
    const { error } = await _supabase.from('incidents').delete().eq('id', incId);
    if (error) throw error;

    showSuccess("¡Novedad eliminada!");
    await loadIncidents();
  } catch (err) {
    alert("Error al eliminar: " + err.message);
  }
}
