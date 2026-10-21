/**
 * ============================================================================
 * BITÁCORA MASAYA - LÓGICA OPERACIONAL DE NOVEDADES Y CATEGORÍAS (incidents.js)
 * ============================================================================
 * Propósito:
 *   Gestionar el flujo operativo de novedades de turno (publicación, consulta,
 *   cambio de estados) y la administración en tiempo real de categorías dinámicas 
 *   (creación, activación/desactivación y eliminación).
 *
 * Funciones Principales:
 *   - loadIncidents(): Carga y renderiza la línea de tiempo de novedades por sede.
 *   - createIncident(e): Registra una nueva novedad enviándola a Supabase.
 *   - updateIncidentStatus(incId, newStatus): Actualiza el estado (PENDIENTE, PROCESO, RESUELTO).
 *   - populateCategoriesSelect(): Llena el selector desplegable con categorías activas.
 *   - createCategory(), toggleCategoryStatus(), deleteCategory(): CRUD de categorías.
 *
 * Dependencias:
 *   - Instancia _supabase iniciada en app.js
 *   - Variables globales (selectedHotelId, selectedUser, allCategories) definidas en app.js
 * ============================================================================
 */

/**
 * Llena el elemento <select> de categorías en el formulario de novedades con las categorías activas.
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
 * Consulta las novedades de la sede actual en Supabase y las dibuja aplicando filtros si existen.
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

    // Dibujar la lista con o sin filtros activos
    filterIncidents();

  } catch (err) {
    container.innerHTML = `<p style="color:red; font-size:12px;">Error al cargar novedades: ${err.message}</p>`;
  }
}

/**
 * Registra una nueva novedad de turno en Supabase.
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
 * Actualiza el estado (PENDIENTE, PROCESO, RESUELTO) de una novedad especifica.
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
 * Crea o reactiva una categoría de incidencias en Supabase.
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
 * Dibuja la tabla de administración de categorías para los usuarios Admin.
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
 * Cambia el estado de activación de una categoría (Activar/Desactivar).
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
 * Elimina una categoría permanentemente de Supabase.
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
