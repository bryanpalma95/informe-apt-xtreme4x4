/**
 * Cupones Duoc UC - App 100% Frontend
 * Funciona en GitHub Pages sin backend.
 * OCR via Gemini API directo desde el navegador.
 */

// --- Storage Keys ---
const STORAGE_KEYS = {
    API_KEY: 'cupones_duoc_api_key',
    FORM_URL: 'cupones_duoc_form_url',
    QUEUE: 'cupones_duoc_queue'
};

// --- Estado ---
let currentImageBase64 = null;
let queue = JSON.parse(localStorage.getItem(STORAGE_KEYS.QUEUE) || '[]');

// --- Prompt para Gemini ---
const EXTRACTION_PROMPT = `Analiza esta imagen de un cupon fisico de Duoc UC llenado a mano.
Extrae TODOS los datos que puedas leer y devuelvelos en formato JSON con esta estructura:

{
    "rut": "12345678-9",
    "nombres": "NOMBRE",
    "apellido_paterno": "APELLIDO1",
    "apellido_materno": "APELLIDO2",
    "fecha_nacimiento": "DD-MM-AAAA",
    "celular": "912345678",
    "email": "correo@ejemplo.com",
    "comuna_residencia": "COMUNA",
    "actividad_actual": "4 Medio | Egresado | Otro",
    "establecimiento": "NOMBRE COLEGIO",
    "jornada": "Diurna | Vespertina",
    "region": "Metropolitana | Valparaiso | Biobio | Araucania | Los Lagos",
    "sede_interes": "NOMBRE SEDE",
    "carreras": [
        {"prioridad": 1, "escuela": "ESCUELA", "carrera": "CARRERA"},
        {"prioridad": 2, "escuela": "ESCUELA", "carrera": "CARRERA"},
        {"prioridad": 3, "escuela": "ESCUELA", "carrera": "CARRERA"}
    ],
    "confianza": "alta | media | baja",
    "campos_dudosos": ["campo1", "campo2"]
}

REGLAS:
- RUT chileno: XX.XXX.XXX-X. Incluye digito verificador.
- Celular: 9 digitos, empieza con 9 (sin +56).
- Si no puedes leer un campo, ponlo como null y agregalo a campos_dudosos.
- Sedes: Plaza Oeste, Plaza Vespucio, Puente Alto, San Carlos de Apoquindo, Maipu, Plaza Norte, Antonio Varas, Alameda, Melipilla, Valparaiso, Vina del Mar, Concepcion, Villarrica, Puerto Montt, San Joaquin, San Bernardo.
- Escuelas: Administracion y Negocios, Comunicacion, Construccion, Diseno, Gastronomia, Informatica y Telecomunicaciones, Ingenieria y Recursos Naturales, Salud y Bienestar, Turismo y Hospitalidad.

Responde SOLO con el JSON, sin markdown ni explicaciones.`;

// --- Inicializacion ---
document.addEventListener('DOMContentLoaded', () => {
    updateQueueBadge();
    checkConfig();
    setupNavigation();
    setupCapture();
    setupReview();
    setupQueue();
    setupSettings();
    setupFillSection();
    generateBookmarklet();
});

// --- Configuracion ---
function checkConfig() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        switchView('settingsView');
    }
}

function setupSettings() {
    const btnSave = document.getElementById('btnSaveConfig');
    const btnSettings = document.getElementById('btnSettings');
    const apiInput = document.getElementById('apiKeyInput');
    const urlInput = document.getElementById('formUrlInput');
    const status = document.getElementById('configStatus');

    // Cargar valores guardados
    apiInput.value = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    urlInput.value = localStorage.getItem(STORAGE_KEYS.FORM_URL) || '';

    btnSettings.addEventListener('click', () => switchView('settingsView'));

    btnSave.addEventListener('click', () => {
        const key = apiInput.value.trim();
        const url = urlInput.value.trim();

        if (!key) {
            status.textContent = 'Ingresa la API key';
            status.className = 'config-status error';
            return;
        }

        localStorage.setItem(STORAGE_KEYS.API_KEY, key);
        if (url) localStorage.setItem(STORAGE_KEYS.FORM_URL, url);

        status.textContent = 'Configuracion guardada!';
        status.className = 'config-status ok';

        setTimeout(() => switchView('captureView'), 1000);
    });
}

// --- Navegacion ---
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const viewId = btn.dataset.view;
            switchView(viewId);
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (viewId === 'queueView') renderQueue();
}

// --- Captura ---
function setupCapture() {
    const imageInput = document.getElementById('imageInput');
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const uploadBox = document.getElementById('uploadBox');
    const btnProcess = document.getElementById('btnProcess');
    const btnRetake = document.getElementById('btnRetake');

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Comprimir la imagen antes de guardarla en memoria para ahorrar tokens
            const compressedDataUrl = await compressImage(file, 1024, 0.75);
            previewImage.src = compressedDataUrl;
            currentImageBase64 = compressedDataUrl.split(',')[1];
            previewContainer.style.display = 'block';
            uploadBox.style.display = 'none';
            btnProcess.style.display = 'block';
        } catch (err) {
            console.error('Error al comprimir imagen:', err);
            showToast('Error al procesar la imagen seleccionada', 'error');
        }
    });

    btnRetake.addEventListener('click', resetCapture);
    btnProcess.addEventListener('click', processImage);
}

function resetCapture() {
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('uploadBox').style.display = 'block';
    document.getElementById('btnProcess').style.display = 'none';
    document.getElementById('imageInput').value = '';
    document.getElementById('loading').style.display = 'none';
    currentImageBase64 = null;
}

// --- Utilidad para comprimir imágenes mediante Canvas ---
function compressImage(file, maxDimension = 1024, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- OCR con Gemini (Con fallback de modelos) ---
async function processImage() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        showToast('Configura tu API key primero', 'error');
        switchView('settingsView');
        return;
    }

    if (!currentImageBase64) return;

    document.getElementById('btnProcess').style.display = 'none';
    document.getElementById('loading').style.display = 'block';

    const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    let lastError = null;
    let success = false;

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{
                parts: [
                    { text: EXTRACTION_PROMPT },
                    { inline_data: { mime_type: 'image/jpeg', data: currentImageBase64 } }
                ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                // Si es error de cuota (429), probamos el siguiente modelo
                if (response.status === 429) {
                    console.warn(`Cuota agotada en modelo ${model}, probando el siguiente...`);
                    lastError = new Error(`Cuota excedida en ${model}`);
                    continue;
                }
                throw new Error(`Error ${response.status}: ${errText}`);
            }

            const result = await response.json();
            let text = result.candidates[0].content.parts[0].text;

            // Limpiar markdown
            text = text.trim();
            if (text.startsWith('```json')) text = text.slice(7);
            if (text.startsWith('```')) text = text.slice(3);
            if (text.endsWith('```')) text = text.slice(0, -3);
            text = text.trim();

            const data = JSON.parse(text);
            showReviewView(data);
            showToast(`Datos extraídos exitosamente (${model})`, 'success');
            success = true;
            break;

        } catch (err) {
            console.error(`Error con modelo ${model}:`, err);
            lastError = err;
        }
    }

    if (!success) {
        showToast(lastError?.message || 'Error al procesar la imagen con Gemini. Intenta nuevamente en 1 minuto.', 'error');
        resetCapture();
    }

    document.getElementById('loading').style.display = 'none';
}

// --- Vista de revision ---
function showReviewView(data) {
    switchView('reviewView');

    setField('f_rut', data.rut);
    setField('f_nombres', data.nombres);
    setField('f_apellido_paterno', data.apellido_paterno);
    setField('f_apellido_materno', data.apellido_materno);
    setField('f_fecha_nacimiento', data.fecha_nacimiento);
    setField('f_celular', data.celular);
    setField('f_email', data.email);
    setField('f_comuna_residencia', data.comuna_residencia);
    setField('f_establecimiento', data.establecimiento);

    setSelect('f_region', data.region);
    setSelect('f_actividad_actual', data.actividad_actual);
    setSelect('f_jornada', data.jornada);
    setSelect('f_sede_interes', data.sede_interes);

    if (data.carreras && data.carreras.length > 0) {
        setField('f_carrera1', data.carreras[0] ? `${data.carreras[0].escuela} - ${data.carreras[0].carrera}` : '');
        setField('f_carrera2', data.carreras[1] ? `${data.carreras[1].escuela} - ${data.carreras[1].carrera}` : '');
        setField('f_carrera3', data.carreras[2] ? `${data.carreras[2].escuela} - ${data.carreras[2].carrera}` : '');
    }

    // Marcar dudosos
    document.querySelectorAll('.field-warning').forEach(el => el.classList.remove('field-warning'));
    if (data.campos_dudosos) {
        data.campos_dudosos.forEach(campo => {
            const el = document.getElementById(`f_${campo}`);
            if (el) el.classList.add('field-warning');
        });
    }

    const conf = data.confianza || 'media';
    const bar = document.getElementById('confidenceBar');
    bar.className = `confidence-bar ${conf}`;
    bar.textContent = `Confianza: ${conf.toUpperCase()}` +
        (data.campos_dudosos && data.campos_dudosos.length > 0 ? ` | Revisar: ${data.campos_dudosos.join(', ')}` : '');
}

function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function setSelect(id, value) {
    const el = document.getElementById(id);
    if (!el || !value) return;
    for (let i = 0; i < el.options.length; i++) {
        if (el.options[i].value.toLowerCase().includes(value.toLowerCase()) ||
            el.options[i].text.toLowerCase().includes(value.toLowerCase())) {
            el.selectedIndex = i;
            return;
        }
    }
}

// --- Review actions ---
function setupReview() {
    document.getElementById('btnConfirm').addEventListener('click', () => {
        const record = {
            rut: document.getElementById('f_rut').value,
            nombres: document.getElementById('f_nombres').value,
            apellido_paterno: document.getElementById('f_apellido_paterno').value,
            apellido_materno: document.getElementById('f_apellido_materno').value,
            fecha_nacimiento: document.getElementById('f_fecha_nacimiento').value,
            celular: document.getElementById('f_celular').value,
            email: document.getElementById('f_email').value,
            comuna_residencia: document.getElementById('f_comuna_residencia').value,
            region: document.getElementById('f_region').value,
            actividad_actual: document.getElementById('f_actividad_actual').value,
            establecimiento: document.getElementById('f_establecimiento').value,
            jornada: document.getElementById('f_jornada').value,
            sede_interes: document.getElementById('f_sede_interes').value,
            carrera1: document.getElementById('f_carrera1').value,
            carrera2: document.getElementById('f_carrera2').value,
            carrera3: document.getElementById('f_carrera3').value,
            timestamp: Date.now()
        };

        queue.push(record);
        saveQueue();
        updateQueueBadge();
        showToast(`Agregado! Cola: ${queue.length}`, 'success');
        resetCapture();
        switchView('captureView');
        activateNavBtn('captureView');
    });

    document.getElementById('btnDiscard').addEventListener('click', () => {
        resetCapture();
        switchView('captureView');
        activateNavBtn('captureView');
    });
}

function activateNavBtn(viewId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
}

// --- Cola ---
function setupQueue() {
    document.getElementById('btnClearQueue').addEventListener('click', () => {
        if (!confirm('Limpiar toda la cola?')) return;
        queue = [];
        saveQueue();
        updateQueueBadge();
        renderQueue();
        showToast('Cola limpiada', 'info');
    });

    document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
}

function renderQueue() {
    const list = document.getElementById('queueList');
    const fillSection = document.getElementById('fillSection');
    list.innerHTML = '';

    if (queue.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">No hay registros en cola</p>';
        fillSection.style.display = 'none';
        return;
    }

    fillSection.style.display = 'block';

    queue.forEach((record, i) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
            <div class="name">${i + 1}. ${record.nombres || 'Sin nombre'} ${record.apellido_paterno || ''}</div>
            <div class="details">RUT: ${record.rut || 'N/A'} | ${record.comuna_residencia || ''} | ${record.sede_interes || ''}</div>
        `;
        list.appendChild(item);
    });
}

function exportJSON() {
    if (queue.length === 0) {
        showToast('No hay registros para exportar', 'error');
        return;
    }

    const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupones_duoc_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exportados ${queue.length} registros`, 'success');
}

// --- Utilidades ---
function saveQueue() {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
}

function updateQueueBadge() {
    document.getElementById('queueBadge').textContent = queue.length;
    document.getElementById('navQueueCount').textContent = queue.length;
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- Bookmarklet y carga al formulario ---
let currentFillIndex = 0;

function setupFillSection() {
    const btnCopyNext = document.getElementById('btnCopyNext');

    btnCopyNext.addEventListener('click', () => {
        if (queue.length === 0) {
            showToast('No hay registros en cola', 'error');
            return;
        }

        if (currentFillIndex >= queue.length) {
            showToast('Todos los registros fueron copiados!', 'success');
            currentFillIndex = 0;
            return;
        }

        const record = queue[currentFillIndex];
        // Guardar en localStorage para que el bookmarklet lo lea
        localStorage.setItem('cupones_duoc_current', JSON.stringify(record));

        const info = document.getElementById('currentRecordInfo');
        info.textContent = `Copiado #${currentFillIndex + 1}: ${record.nombres} ${record.apellido_paterno} (${record.rut})`;

        currentFillIndex++;
        showToast(`Registro ${currentFillIndex}/${queue.length} listo. Ve al formulario y usa el bookmarklet.`, 'info');
    });

    // Generar bookmarklet
    generateBookmarklet();
}

function generateBookmarklet() {
    // Este código se ejecuta en el contexto del formulario de Duoc
    const bookmarkletCode = `
(function(){
    try {
        var d = JSON.parse(localStorage.getItem('cupones_duoc_current'));
        if (!d) { alert('No hay registro copiado. Ve a la app de Cupones y toca Copiar siguiente.'); return; }

        function setVal(sel, val) {
            if (!val) return;
            var els = document.querySelectorAll(sel);
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.value = val;
                    el.dispatchEvent(new Event('input', {bubbles:true}));
                    el.dispatchEvent(new Event('change', {bubbles:true}));
                }
            }
        }

        function setSelect(sel, val) {
            if (!val) return;
            var els = document.querySelectorAll(sel);
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el.tagName === 'SELECT') {
                    for (var j = 0; j < el.options.length; j++) {
                        if (el.options[j].text.toLowerCase().indexOf(val.toLowerCase()) >= 0) {
                            el.selectedIndex = j;
                            el.dispatchEvent(new Event('change', {bubbles:true}));
                            break;
                        }
                    }
                }
            }
        }

        // Campos de texto - intentar por placeholder, name o posicion
        var inputs = document.querySelectorAll('input[type=text], input[type=email], input[type=tel], input:not([type])');
        var selects = document.querySelectorAll('select');

        // Mapear por posicion (basado en el orden del formulario Duoc)
        if (inputs.length >= 1 && d.nombres) { inputs[0].value = d.nombres; inputs[0].dispatchEvent(new Event('input',{bubbles:true})); }
        if (inputs.length >= 2) { var ap = (d.apellido_paterno||'') + ' ' + (d.apellido_materno||''); inputs[1].value = ap.trim(); inputs[1].dispatchEvent(new Event('input',{bubbles:true})); }
        if (inputs.length >= 3 && d.fecha_nacimiento) { inputs[2].value = d.fecha_nacimiento; inputs[2].dispatchEvent(new Event('input',{bubbles:true})); }

        // RUT - buscar por placeholder que contenga xxx
        var rutInput = document.querySelector('input[placeholder*="xxx"], input[placeholder*="Rut"], input[placeholder*="rut"]');
        if (rutInput && d.rut) { rutInput.value = d.rut; rutInput.dispatchEvent(new Event('input',{bubbles:true})); }

        // Email
        var emailInput = document.querySelector('input[type=email], input[placeholder*="mail"], input[placeholder*="email"]');
        if (emailInput && d.email) { emailInput.value = d.email; emailInput.dispatchEvent(new Event('input',{bubbles:true})); }

        // Telefono
        var telInput = document.querySelector('input[type=tel], input[placeholder*="1234"], input[placeholder*="fono"]');
        if (telInput && d.celular) { telInput.value = d.celular; telInput.dispatchEvent(new Event('input',{bubbles:true})); }

        // Selects - por orden
        if (selects.length >= 1 && d.region) setSelect('select', d.region);

        alert('Datos pegados! Revisa y completa los dropdowns que falten antes de enviar.');
    } catch(e) { alert('Error: ' + e.message); }
})();`;

    const encoded = 'javascript:' + encodeURIComponent(bookmarkletCode.replace(/\n/g, ' ').replace(/\s+/g, ' '));
    document.getElementById('bookmarkletLink').href = encoded;
}

// Agregar setupFillSection al init (ya llamado en DOMContentLoaded)
