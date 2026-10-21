/**
 * ============================================================================
 * BITÁCORA MASAYA - LÓGICA OPERACIONAL Y ASIGNACIÓN DE TAREAS (incidents.js)
 * ============================================================================
 */

let resolvingIncidentId = null;

const AREA_LABELS = {
  'RECEPCION': 'Recepción',
  'MANTENIMIENTO': 'Mantenimiento',
  'CAMARERIA': 'Camarería (Ama de Llaves)',
  'MESAS_BAR': 'Mesas y Bar',
  'COCINA': 'Cocina',
  'ADMINISTRACION': 'Administración',
  'GERENCIA': 'Gerencia',
  'SISTEMAS': 'Sistemas'
};

/**
 * Carga el selector con los colaboradores activos asignados a la sede actual.
 */
function populateAssignedUsersSelect() {
  const select = document.getElementById('inc-assigned-to');
  if (!select) return;

  const assignedUserIds = allUserHotels
    .filter(uh => uh.hotel_id === selectedHotelId)
    .map(uh => uh.user_id);

  const activeHotelUsers = allUsers.filter(u => assignedUserIds.includes(u.id) && u.is_active !== false);

  select.innerHTML = '<option value="">-- Sin asignar (Para el área) --</option>' +
    activeHotelUsers.map(u => `<option value="${u.id}">${u.display_name || u.full_name}</option>`).join('');
}

/**
 * Llena el selector de categorías dinámicas activas.
 */
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

/**
 * Carga las novedades de la sede con autores, asignados y resolvedores desde Supabase.
 */
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

    populateAssignedUsersSelect();
    updateMyTasksBanner();
    filterIncidents();

  } catch (err) {
    container.innerHTML = `<p style="color:red; font-size:12px;">Error al cargar novedades: ${err.message}</p>`;
  }
}

/**
 * Muestra el banner superior si el usuario en sesión tiene tareas pendientes asignadas.
 */
function updateMyTasksBanner() {
  const banner = document.getElementById('my-tasks-banner');
  const countSpan = document.getElementById('my-tasks-count');
  if (!banner || !countSpan || !selectedUser) return;

  const myPendingTasks = currentIncidents.filter(inc => 
    inc.assigned_to_user_id === selectedUser.id && (inc.status || 'PENDIENTE') !== 'RESUELTO'
  );

  if (myPendingTasks.length > 0) {
    countSpan.innerText = `👤 Tienes ${myPendingTasks.length} tarea(s) pendiente(s) asignada(s) directamente a ti.`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function filterMyTasks() {
  const searchInput = document.getElementById('filter-search');
  if (searchInput && selectedUser) {
    const userName = selectedUser.display_name || selectedUser.full_name;
    searchInput.value = userName;
    document.getElementById('filter-status').value = 'TODOS';
    filterIncidents();
  }
}

/**
 * Aplica los criterios multidimensionales de filtrado.
 */
function filterIncidents() {
  const statusFilter = document.getElementById('filter-status')?.value || 'TODOS';
  const areaFilter = document.getElementById('filter-area')?.value || 'TODAS';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'TODAS';
  const searchFilter = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

  const filtered = currentIncidents.filter(inc => {
    const incStatus = inc.status || 'PENDIENTE';
    const matchStatus = (statusFilter === 'TODOS') || (incStatus === statusFilter);
    const matchArea = (areaFilter === 'TODAS') || ((inc.target_area || 'RECEPCION') === areaFilter);
    const matchPriority = (priorityFilter === 'TODAS') || (inc.priority === priorityFilter);
    
    const authorName = inc.author ? (inc.author.display_name || inc.author.full_name) : '';
    const assignedName = inc.assigned ? (inc.assigned.display_name || inc.assigned.full_name) : '';
    const areaText = AREA_LABELS[inc.target_area] || inc.target_area || '';

    const titleMatch = (inc.title || '').toLowerCase().includes(searchFilter);
    const descMatch = (inc.description || '').toLowerCase().includes(searchFilter);
    const catMatch = (inc.category || '').toLowerCase().includes(searchFilter);
    const authorMatch = authorName.toLowerCase().includes(searchFilter);
    const assignedMatch = assignedName.toLowerCase().includes(searchFilter);
    const areaMatch = areaText.toLowerCase().includes(searchFilter);

    const matchSearch = !searchFilter || titleMatch || descMatch || catMatch || authorMatch || assignedMatch || areaMatch;

    return matchStatus && matchArea && matchPriority && matchSearch;
  });

  renderIncidentsList(filtered);
}

/**
 * Renderiza el muro de novedades con etiquetas de área, asignados y comentarios de cierre.
 */
function renderIncidentsList(incidentsToRender) {
  const container = document.getElementById('incidents-timeline');
  if (!container) return;

  if (incidentsToRender.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#888; font-size:13px; padding:20px;">No se encontraron novedades con los filtros seleccionados.</p>';
    return;
  }

  container.innerHTML = incidentsToRender.map(inc => {
    const author = inc.author ? (inc.author.display_name || inc.author.full_name) : 'Desconocido';
    const assignedTo = inc.assigned ? (inc.assigned.display_name || inc.assigned.full_name) : 'Sin asignar (Área)';
    const resolver = inc.resolver ? (inc.resolver.display_name || inc.resolver.full_name) : 'Desconocido';
    const areaLabel = AREA_LABELS[inc.target_area] || inc.target_area || 'Recepción';
    
    const dateStr = new Date(inc.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    const resolvedDateStr = inc.resolved_at ? new Date(inc.resolved_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const status = inc.status || 'PENDIENTE';

    return `
      <div class="incident-card">
        <div class="incident-header">
          <span class="incident-title">${inc.title}</span>
          <div>
            ${inc.is_room_blocked ? '<span class="badge-room-blocked">🚨 HABITACIÓN BLOQUEADA</span>' : ''}
            <span class="badge-role prio-${inc.priority}">${inc.priority}</span>
            <span class="badge-role status-${status.replace(' ', '')}">${status}</span>
          </div>
        </div>
        
        <div class="incident-meta">
          📍 <b>Área:</b> ${areaLabel} | 🏷️ <b>Categoría:</b> ${inc.category}<br>
          👤 <b>Reportó:</b> ${author} | 🎯 <b>Asignado a:</b> ${assignedTo} | 🕒 ${dateStr}
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
          <button onclick="openResolveModal('${inc.id}')" class="btn-sm btn-success">✓ Resolver con Comentario</button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Registra una nueva novedad con área destino, asignado y estado de habitación.
 */
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
    showSuccess("¡Novedad registrada y asignada exitosamente!");
    e.target.reset();
    await loadIncidents();
  }
}

/**
 * Cambia el estado directo a PENDIENTE o EN PROCESO.
 */
async function updateIncidentStatus(incId, newStatus) {
  hideMsgs();
  const { error } = await _supabase
    .from('incidents')
    .update({ status: newStatus })
    .eq('id', incId);

  if (!error) {
    showSuccess("¡Estado actualizado!");
    await loadIncidents();
  } else {
    showError("Error al actualizar estado: " + error.message);
  }
}

/**
 * Abre el modal para capturar las observaciones al resolver.
 */
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

/**
 * Guarda la solución con comentario explicativo y usuario que resolvió.
 */
async function confirmResolveIncident() {
  if (!resolvingIncidentId) return;

  const notes = document.getElementById('resolve-notes').value.trim();
  if (!notes) {
    alert("Por favor escribe un comentario o explicación de la solución.");
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
    showSuccess("¡Novedad resuelta con observación guardada!");
    await loadIncidents();
  } else {
    alert("Error al resolver novedad: " + error.message);
  }
}

/* Funciones CRUD de Categorías */
async function createCategory(e) {
  e.preventDefault();
  hideMsgs();
  const catName = document.getElementById('new-category-name').value.trim();

  const existingCat = allCategories.find(c => c.name.toLowerCase() === catName.toLowerCase());

  if (existingCat) {
    if (existingCat.is_active !== false) {
      showError("⚠️ La categoría '" + catName + "' ya se encuentra activa.");
      return;
    } else {
      const { error: updateErr } = await _supabase
        .from('incident_categories')
        .update({ is_active: true })
        .eq('id', existingCat.id);

      if (updateErr) {
        showError("Error al reactivar categoría: " + updateErr.message);
      } else {
        showSuccess("¡Categoría reactivada exitosamente!");
        e.target.reset();
        await refreshData();
        renderCategoriesTable();
        populateCategoriesSelect();
      }
      return;
    }
  }

  const { error } = await _supabase.from('incident_categories').insert([{ name: catName, is_active: true }]);

  if (error) {
    showError("Error al crear categoría: " + error.message);
  } else {
    showSuccess("¡Categoría creada!");
    e.target.reset();
    await refreshData();
    renderCategoriesTable();
    populateCategoriesSelect();
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categories-table-body');
  if (!tbody) return;

  if (allCategories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">No hay categorías creadas.</td></tr>';
    return;
  }

  tbody.innerHTML = allCategories.map(c => `
    <tr>
      <td><b>${c.name}</b></td>
      <td>
        <span class="badge-role ${c.is_active !== false ? 'badge-op' : 'badge-inactive'}">
          ${c.is_active !== false ? 'Activa' : 'Inactiva'}
        </span>
      </td>
      <td>
        <button onclick="toggleCategoryStatus('${c.id}', ${c.is_active !== false})" class="btn-sm ${c.is_active !== false ? 'btn-warning' : 'btn-success'}">
          ${c.is_active !== false ? 'Desactivar' : 'Activar'}
        </button>
        <button onclick="deleteCategory('${c.id}', '${c.name}')" class="btn-sm btn-danger">Borrar</button>
      </td>
    </tr>
  `).join('');
}

async function toggleCategoryStatus(catId, currentActive) {
  hideMsgs();
  const { error } = await _supabase
    .from('incident_categories')
    .update({ is_active: !currentActive })
    .eq('id', catId);

  if (!error) {
    showSuccess("Estado de categoría actualizado.");
    await refreshData();
    renderCategoriesTable();
    populateCategoriesSelect();
  } else {
    showError("Error al cambiar estado: " + error.message);
  }
}

async function deleteCategory(catId, catName) {
  if (!confirm(`¿Estás seguro de eliminar permanentemente la categoría "${catName}"?`)) return;

  hideMsgs();
  const { error } = await _supabase
    .from('incident_categories')
    .delete()
    .eq('id', catId);

  if (!error) {
    showSuccess("Categoría eliminada permanentemente.");
    await refreshData();
    renderCategoriesTable();
    populateCategoriesSelect();
  } else {
    showError("Error al eliminar categoría: " + error.message);
  }
}
