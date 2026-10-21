/**
 * ============================================================================
 * BITÁCORA MASAYA - LÓGICA OPERACIONAL DE NOVEDADES Y CATEGORÍAS (incidents.js)
 * ============================================================================
 * Propósito:
 *   Gestionar el flujo operativo de novedades de turno (publicación, consulta,
 *   filtrado dinámico y cambio de estados) y la administración de categorías.
 * ============================================================================
 */

/**
 * Llena el selector <select> con las categorías activas.
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
 * Consulta las novedades registradas en Supabase para la sede actual y aplica los filtros.
 */
async function loadIncidents() {
  const container = document.getElementById('incidents-timeline');
  if (!container) return;

  container.innerHTML = "Cargando novedades...";

  try {
    const { data, error } = await _supabase
      .from('incidents')
      .select('*, users(full_name, display_name)')
      .eq('hotel_id', selectedHotelId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    currentIncidents = data || [];

    // Llama a la función de filtrado para renderizar la lista
    filterIncidents();

  } catch (err) {
    container.innerHTML = `<p style="color:red; font-size:12px;">Error al cargar novedades: ${err.message}</p>`;
  }
}

/**
 * Aplica los filtros seleccionados (Estado, Prioridad y Texto) sobre currentIncidents.
 */
function filterIncidents() {
  const statusFilter = document.getElementById('filter-status')?.value || 'TODOS';
  const priorityFilter = document.getElementById('filter-priority')?.value || 'TODAS';
  const searchFilter = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

  const filtered = currentIncidents.filter(inc => {
    const incStatus = inc.status || 'PENDIENTE';
    const matchStatus = (statusFilter === 'TODOS') || (incStatus === statusFilter);
    const matchPriority = (priorityFilter === 'TODAS') || (inc.priority === priorityFilter);
    
    const titleMatch = (inc.title || '').toLowerCase().includes(searchFilter);
    const descMatch = (inc.description || '').toLowerCase().includes(searchFilter);
    const catMatch = (inc.category || '').toLowerCase().includes(searchFilter);
    const matchSearch = !searchFilter || titleMatch || descMatch || catMatch;

    return matchStatus && matchPriority && matchSearch;
  });

  renderIncidentsList(filtered);
}

/**
 * Renderiza el listado final de novedades filtradas.
 */
function renderIncidentsList(incidentsToRender) {
  const container = document.getElementById('incidents-timeline');
  if (!container) return;

  if (incidentsToRender.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#888; font-size:13px; padding:20px;">No se encontraron novedades con los filtros seleccionados.</p>';
    return;
  }

  container.innerHTML = incidentsToRender.map(inc => {
    const author = inc.users ? (inc.users.display_name || inc.users.full_name) : 'Desconocido';
    const dateStr = new Date(inc.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    const status = inc.status || 'PENDIENTE';

    return `
      <div class="incident-card">
        <div class="incident-header">
          <span class="incident-title">${inc.title}</span>
          <div>
            <span class="badge-role prio-${inc.priority}">${inc.priority}</span>
            <span class="badge-role status-${status.replace(' ', '')}">${status}</span>
          </div>
        </div>
        <div class="incident-meta">
          🏷️ <b>${inc.category}</b> | 👤 <b>${author}</b> | 🕒 ${dateStr}
        </div>
        <div class="incident-body">${inc.description}</div>
        
        <div class="incident-actions">
          <span style="font-weight:600; color:#666;">Cambiar Estado:</span>
          <button onclick="updateIncidentStatus('${inc.id}', 'PENDIENTE')" class="btn-sm btn-danger">Pendiente</button>
          <button onclick="updateIncidentStatus('${inc.id}', 'PROCESO')" class="btn-sm btn-warning">En Proceso</button>
          <button onclick="updateIncidentStatus('${inc.id}', 'RESUELTO')" class="btn-sm btn-success">Resuelto</button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Registra una nueva novedad de turno.
 */
async function createIncident(e) {
  e.preventDefault();
  hideMsgs();

  const newInc = {
    hotel_id: selectedHotelId,
    user_id: selectedUser.id,
    category: document.getElementById('inc-category').value,
    priority: document.getElementById('inc-priority').value,
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
    await loadIncidents();
  }
}

/**
 * Actualiza el estado de una novedad.
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
 * Crea o reactiva una categoría.
 */
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

/**
 * Dibuja la tabla de categorías para Administradores.
 */
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

/**
 * Cambia el estado de activación de una categoría.
 */
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

/**
 * Elimina una categoría permanentemente.
 */
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
