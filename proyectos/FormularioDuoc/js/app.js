/**
 * Cupones Duoc UC - App 100% Frontend
 * Funciona en GitHub Pages sin backend.
 * OCR via Gemini API directo desde el navegador.
 */

// --- Storage Keys ---
const STORAGE_KEYS = {
    PROVIDER: 'cupones_duoc_provider',
    API_KEY: 'cupones_duoc_api_key',
    OMNI_SERVER: 'cupones_duoc_omni_server',
    FORM_URL: 'cupones_duoc_form_url',
    QUEUE: 'cupones_duoc_queue'
};

// --- Utilidad: Resolver localhost al host real (para acceso desde móvil) ---
function resolveOmniServer(serverUrl) {
    let url = (serverUrl || 'http://localhost:20128').trim();
    url = url.replace(/\/+$/, '');
    // Si la URL usa localhost/127.0.0.1 pero la página se accedió desde otro host (ej: IP del PC),
    // reemplazar localhost con el host real desde donde se cargó la app.
    if ((url.includes('localhost') || url.includes('127.0.0.1')) && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const host = window.location.hostname;
        // Reemplazar localhost o 127.0.0.1 (con puerto opcional) por el host real
        url = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i, `$1${host}$3`);
    }
    return url;
}

// --- Estado ---
let currentImageBase64 = null;     // Imagen 1 (datos personales)
let currentImageBase64_2 = null;   // Imagen 2 (carreras)
let captureStep = 1;               // 1 = primera foto, 2 = segunda foto
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
    setupDuocMessaging();
    updateCaptureStep();
});

// --- Configuracion ---
function checkConfig() {
    // En modo auto o tesseract no obligamos a ir a configuracion
}

function setupSettings() {
    const btnSave = document.getElementById('btnSaveConfig');
    const btnSettings = document.getElementById('btnSettings');
    const providerSelect = document.getElementById('providerSelect');
    const apiInput = document.getElementById('apiKeyInput');
    const omniServerInput = document.getElementById('omniServerInput');
    const omniServerGroup = document.getElementById('omniServerGroup');
    const urlInput = document.getElementById('formUrlInput');
    const status = document.getElementById('configStatus');
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const apiKeyHelp = document.getElementById('apiKeyHelp');

    const updateProviderUI = () => {
        const provider = providerSelect.value;
        if (omniServerGroup) {
            omniServerGroup.style.display = (provider === 'omniroute') ? 'block' : 'none';
        }
        if (provider === 'tesseract') {
            apiKeyGroup.style.display = 'none';
        } else {
            apiKeyGroup.style.display = 'block';
            if (provider === 'auto') {
                apiKeyLabel.textContent = 'API Key Opcional (Groq / Gemini)';
                apiInput.placeholder = 'Pega tu API Key de Groq o Gemini para reintento automático...';
                apiKeyHelp.innerHTML = 'Si no tienes API Key, se usará únicamente el OCR local Tesseract.';
            } else if (provider === 'omniroute') {
                apiKeyLabel.textContent = 'OmniRoute API Key (opcional si es local)';
                apiInput.placeholder = 'sk-...';
                apiKeyHelp.innerHTML = 'Servidor por defecto: <strong>http://localhost:20128</strong> o tu servidor en la nube.';
            } else if (provider === 'groq') {
                apiKeyLabel.textContent = 'Groq API Key';
                apiInput.placeholder = 'gsk_...';
                apiKeyHelp.innerHTML = 'Obtén tu API Key gratis en <a href="https://console.groq.com/keys" target="_blank">console.groq.com</a>';
            } else {
                apiKeyLabel.textContent = 'Gemini API Key';
                apiInput.placeholder = 'Pega tu API key aquí';
                apiKeyHelp.innerHTML = 'Obtén tu API key gratis en <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a>';
            }
        }
    };

    // Cargar valores guardados
    providerSelect.value = localStorage.getItem(STORAGE_KEYS.PROVIDER) || 'auto';
    apiInput.value = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    if (omniServerInput) omniServerInput.value = localStorage.getItem(STORAGE_KEYS.OMNI_SERVER) || 'http://localhost:20128';
    urlInput.value = localStorage.getItem(STORAGE_KEYS.FORM_URL) || '';
    updateProviderUI();

    providerSelect.addEventListener('change', updateProviderUI);
    btnSettings.addEventListener('click', () => switchView('settingsView'));

    btnSave.addEventListener('click', () => {
        const provider = providerSelect.value;
        const key = apiInput.value.trim();
        const omniServer = omniServerInput ? omniServerInput.value.trim() : '';
        const url = urlInput.value.trim();

        if (provider !== 'tesseract' && provider !== 'auto' && provider !== 'omniroute' && !key) {
            status.textContent = 'Ingresa la API key del proveedor seleccionado';
            status.className = 'config-status error';
            return;
        }

        localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
        localStorage.setItem(STORAGE_KEYS.API_KEY, key);
        if (omniServer) localStorage.setItem(STORAGE_KEYS.OMNI_SERVER, omniServer);
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
            const compressedDataUrl = await compressImage(file, 1024, 0.75);
            previewImage.src = compressedDataUrl;

            if (captureStep === 1) {
                currentImageBase64 = compressedDataUrl.split(',')[1];
            } else {
                currentImageBase64_2 = compressedDataUrl.split(',')[1];
            }

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
    currentImageBase64_2 = null;
    captureStep = 1;
    updateCaptureStep();
}

function updateCaptureStep() {
    const uploadBox = document.getElementById('uploadBox');
    const stepIndicator = document.getElementById('stepIndicator');
    if (stepIndicator) {
        stepIndicator.textContent = captureStep === 1
            ? '📋 Paso 1 de 2 — Foto del frente (datos personales)'
            : '📋 Paso 2 de 2 — Foto del reverso (carreras de interés)';
        stepIndicator.style.display = 'block';
    }
    const uploadText = uploadBox.querySelector('p');
    if (uploadText) {
        uploadText.textContent = captureStep === 1
            ? 'Foto 1: Datos personales'
            : 'Foto 2: Carreras de interés';
    }
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

// --- Motor de OCR multi-proveedor con Cascada Automática y Fallbacks ---
async function processImage() {
    const provider = localStorage.getItem(STORAGE_KEYS.PROVIDER) || 'auto';
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

    if (!currentImageBase64) return;

    // Si estamos en paso 1, procesar la primera imagen y pedir la segunda
    if (captureStep === 1) {
        document.getElementById('btnProcess').style.display = 'none';
        document.getElementById('loading').style.display = 'block';

        try {
            let data1;
            if (provider === 'omniroute') {
                data1 = await withLocalFallback(currentImageBase64, () => processWithOmniRouteRaw(currentImageBase64, EXTRACTION_PROMPT), 'OmniRoute');
            } else if (provider === 'gemini') {
                if (!apiKey) throw new Error('Ingresa tu Gemini API Key en Configuración');
                data1 = await withLocalFallback(currentImageBase64, () => processWithGeminiRaw(currentImageBase64, apiKey), 'Gemini');
            } else if (provider === 'groq') {
                if (!apiKey) throw new Error('Ingresa tu Groq API Key en Configuración');
                data1 = await withLocalFallback(currentImageBase64, () => processWithGroqRaw(currentImageBase64, apiKey), 'Groq');
            } else {
                data1 = await processWithCascadeFallbackRaw(currentImageBase64, apiKey);
            }
            // Guardar datos de paso 1 y pedir foto 2
            window._step1Data = data1;
            document.getElementById('loading').style.display = 'none';
            captureStep = 2;
            // Resetear UI para segunda foto
            document.getElementById('previewContainer').style.display = 'none';
            document.getElementById('uploadBox').style.display = 'block';
            document.getElementById('imageInput').value = '';
            updateCaptureStep();
            showToast('✅ Paso 1 listo. Ahora toma la foto de las carreras.', 'success');
        } catch (err) {
            console.error('Error procesando imagen 1:', err);
            showToast(err.message || 'Error al procesar la imagen.', 'error');
            document.getElementById('loading').style.display = 'none';
            document.getElementById('btnProcess').style.display = 'block';
        }
        return;
    }

    // Paso 2: procesar segunda imagen y combinar
    document.getElementById('btnProcess').style.display = 'none';
    document.getElementById('loading').style.display = 'block';

    const CARRERAS_PROMPT = `Analiza esta imagen del reverso de un cupón Duoc UC.
Identifica las carreras marcadas con números (1, 2, 3) o checkmarks.
Devuelve SOLO este JSON:
{
    "carreras": [
        {"prioridad": 1, "escuela": "ESCUELA", "carrera": "CARRERA"},
        {"prioridad": 2, "escuela": "ESCUELA", "carrera": "CARRERA"},
        {"prioridad": 3, "escuela": "ESCUELA", "carrera": "CARRERA"}
    ]
}
Si no hay prioridad marcada claramente, usa null. Responde SOLO el JSON.`;

    try {
        let data2;
        if (provider === 'omniroute') {
            data2 = await withLocalFallback(currentImageBase64_2, () => processWithOmniRouteRaw(currentImageBase64_2, CARRERAS_PROMPT), 'OmniRoute');
        } else if (provider === 'gemini') {
            if (!apiKey) throw new Error('Ingresa tu Gemini API Key en Configuración');
            data2 = await withLocalFallback(currentImageBase64_2, () => processWithGeminiRaw(currentImageBase64_2, apiKey, CARRERAS_PROMPT), 'Gemini');
        } else if (provider === 'groq') {
            if (!apiKey) throw new Error('Ingresa tu Groq API Key en Configuración');
            data2 = await withLocalFallback(currentImageBase64_2, () => processWithGroqRaw(currentImageBase64_2, apiKey, CARRERAS_PROMPT), 'Groq');
        } else {
            data2 = await processWithCascadeFallbackRaw(currentImageBase64_2, apiKey, CARRERAS_PROMPT);
        }

        // Combinar datos de ambas fotos
        const finalData = Object.assign({}, window._step1Data, { carreras: data2.carreras || [] });
        showReviewView(finalData);
        showToast('✅ Datos extraídos de ambas fotos', 'success');
        captureStep = 1;
        window._step1Data = null;
    } catch (err) {
        console.error('Error procesando imagen 2:', err);
        showToast(err.message || 'Error al procesar la imagen.', 'error');
        document.getElementById('btnProcess').style.display = 'block';
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// Cascada Inteligente: 1. Tesseract (Local) -> Si confianza es baja/nula -> 2. Groq -> 3. Gemini
async function processWithCascadeFallback(apiKey) {
    const loadingText = document.querySelector('#loading p');
    let data = null;

    // 1. Intentar Tesseract Local (Gratis)
    try {
        if (loadingText) loadingText.textContent = 'Paso 1/3: Analizando localmente (Tesseract)...';
        const processedImageDataUrl = await preprocessImageForOCR(currentImageBase64);
        const result = await Tesseract.recognize(processedImageDataUrl, 'spa');
        const rawText = result.data.text || '';
        data = parseRawTextToStructure(rawText);

        // Si se extrajo RUT + Nombre o Celular, se considera suficiente
        if (data.confianza === 'alta' || (data.rut && data.nombres)) {
            showReviewView(data);
            showToast('Extracción local exitosa (Tesseract)', 'success');
            return;
        }
    } catch (e) {
        console.warn('Tesseract fallback...', e);
    }

    // 2. Intentar Groq Cloud Vision si hay API Key disponible o si fue ingresada
    if (apiKey) {
        try {
            if (loadingText) loadingText.textContent = 'Paso 2/3: Mejorando precisión con Groq Vision...';
            await processWithGroq(apiKey);
            return;
        } catch (e) {
            console.warn('Groq fallback...', e);
        }

        // 3. Intentar Gemini API como último recurso gratis
        try {
            if (loadingText) loadingText.textContent = 'Paso 3/3: Extrayendo con Google Gemini...';
            await processWithGemini(apiKey);
            return;
        } catch (e) {
            console.warn('Gemini fallback...', e);
        }
    }

    // Si fallan las IAs o no hay Key, mostrar lo que rescató Tesseract
    if (data) {
        showReviewView(data);
        showToast('Extracción completada con Tesseract (Revisar campos)', 'info');
    } else {
        throw new Error('No se pudo extraer información clara de la imagen');
    }
}

// --- Pre-procesamiento de Imagen para Maximizar la Precisión de Tesseract (Filtro Grayscale + Umbral de Contraste) ---
function preprocessImageForOCR(base64Image) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            // 1. Escala de grises + Aumento de Contraste Binarizado para texto manuscrito
            for (let i = 0; i < data.length; i += 4) {
                // Luminancia
                const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // Aplicar umbral de contraste alto para limpiar fondo de papel
                const threshold = avg < 140 ? (avg < 90 ? 0 : avg * 0.7) : 255;
                data[i] = threshold;     // R
                data[i + 1] = threshold; // G
                data[i + 2] = threshold; // B
            }

            ctx.putImageData(imgData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = `data:image/jpeg;base64,${base64Image}`;
    });
}

// 1. Tesseract.js Optimizado (Preprocesado de imagen + Parser Inteligente)
async function processWithTesseract() {
    const loadingText = document.querySelector('#loading p');
    if (loadingText) loadingText.textContent = 'Mejorando imagen para OCR...';

    // Preprocesamiento de imagen
    const processedImageDataUrl = await preprocessImageForOCR(currentImageBase64);

    if (loadingText) loadingText.textContent = 'Procesando OCR local con Tesseract...';

    const result = await Tesseract.recognize(processedImageDataUrl, 'spa', {
        logger: m => {
            if (m.status === 'recognizing text' && loadingText) {
                loadingText.textContent = `Analizando texto manuscrito: ${Math.round(m.progress * 100)}%`;
            }
        }
    });

    const rawText = result.data.text || '';
    console.log('--- Texto RAW detectado por Tesseract ---', rawText);

    const parsedData = parseRawTextToStructure(rawText);
    showReviewView(parsedData);
    showToast('OCR local optimizado completado', 'success');
}

// Parser inteligente especializado en Cupones Duoc UC
function parseRawTextToStructure(text) {
    const cleanText = text.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Mapeo de errores OCR comunes en dígitos
    const fixDigits = (str) => {
        if (!str) return str;
        return str.replace(/[oO]/g, '0')
                  .replace(/[sS]/g, '5')
                  .replace(/[iIl|]/g, '1')
                  .replace(/[zZ]/g, '2')
                  .replace(/[bB]/g, '8')
                  .replace(/[gG]/g, '6')
                  .replace(/[qQ]/g, '9');
    };

    // 1. RUT Chileno (Formato XX.XXX.XXX-X o XXXXXXXX-X)
    let rut = null;
    const rutRegex = /(\b\d{1,2}\.?:?\d{3}\.?:?\d{3}[-—–]?[0-9kK]\b)/i;
    const rawRutMatch = cleanText.match(rutRegex);

    if (rawRutMatch) {
        let rawR = rawRutMatch[1].replace(/[\.\s]/g, '').toUpperCase();
        if (!rawR.includes('-') && rawR.length >= 8) {
            rawR = rawR.slice(0, -1) + '-' + rawR.slice(-1);
        }
        rut = rawR;
    } else {
        // Fallback: buscar secuencias con corrección de dígitos
        const flexibleMatch = fixDigits(cleanText).match(/(\b\d{7,8}[-]?[\dK]\b)/i);
        if (flexibleMatch) {
            const rawR = flexibleMatch[1].toUpperCase();
            rut = rawR.includes('-') ? rawR : (rawR.slice(0, -1) + '-' + rawR.slice(-1));
        }
    }

    // 2. Celular Chileno (9 dígitos iniciando con 9)
    let celular = null;
    const textWithFixedDigits = fixDigits(cleanText);
    const celMatch = textWithFixedDigits.match(/\b(9\d{8})\b/);
    if (celMatch) {
        celular = celMatch[1];
    } else {
        const altCel = textWithFixedDigits.match(/(?:cel|movil|fono|tel)?\s*:?\s*(9\s*\d{4}\s*\d{4})/i);
        if (altCel) celular = altCel[1].replace(/\s+/g, '');
    }

    // 3. Email
    let email = null;
    const emailMatch = cleanText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
        email = emailMatch[1].toLowerCase();
    }

    // 4. Sede de Interés (Detección por catálogo de Sedes Duoc)
    const sedes = [
        'Plaza Oeste', 'Plaza Vespucio', 'Puente Alto', 'San Carlos de Apoquindo',
        'Maipú', 'Maipu', 'Plaza Norte', 'Antonio Varas', 'Alameda', 'Melipilla',
        'Valparaíso', 'Valparaiso', 'Viña del Mar', 'Vina del Mar', 'Concepción',
        'Concepcion', 'Villarrica', 'Puerto Montt', 'San Joaquín', 'San Joaquin', 'San Bernardo'
    ];
    let sede_interes = null;
    for (const s of sedes) {
        if (new RegExp('\\b' + s + '\\b', 'i').test(cleanText)) {
            sede_interes = s;
            break;
        }
    }

    // 5. Región
    const regiones = ['Metropolitana', 'Valparaíso', 'Valparaiso', 'Biobío', 'Biobio', 'Araucanía', 'Araucania', 'Los Lagos'];
    let region = null;
    for (const r of regiones) {
        if (new RegExp('\\b' + r + '\\b', 'i').test(cleanText)) {
            region = r;
            break;
        }
    }

    // 6. Jornada
    let jornada = null;
    if (/vespertin|vesper/i.test(cleanText)) jornada = 'Vespertina';
    else if (/diurn/i.test(cleanText)) jornada = 'Diurna';

    // 7. Actividad Actual
    let actividad_actual = null;
    if (/4|cuarto\s*medio/i.test(cleanText)) actividad_actual = '4° Medio';
    else if (/egresad/i.test(cleanText)) actividad_actual = 'Egresado';

    // 8. Escuelas / Carreras detectadas
    const carrerasFound = [];
    const escuelas = [
        'Informática y Telecomunicaciones', 'Informatica',
        'Ingeniería y Recursos Naturales', 'Ingenieria',
        'Administración y Negocios', 'Administracion',
        'Construcción', 'Construccion', 'Diseño', 'Diseno',
        'Gastronomía', 'Gastronomia', 'Salud y Bienestar', 'Salud',
        'Comunicación', 'Comunicacion', 'Turismo'
    ];

    escuelas.forEach(esc => {
        if (new RegExp('\\b' + esc + '\\b', 'i').test(cleanText)) {
            carrerasFound.push({ prioridad: carrerasFound.length + 1, escuela: esc, carrera: esc });
        }
    });

    // 9. Nombres y Apellidos (Extracción inteligente filtrando encabezados e impresos comunes)
    const filteredLines = lines.filter(l => {
        const isKeyword = /rut|email|correo|celular|fono|telefono|sede|carrera|colegio|escuela|duoc|cupon|firma|fecha|datos|personales|actividad|actual|preferencia|estudio|nacimiento|comuna|region|jornada|egresado|medio/i.test(l);
        const isMatch = (rut && l.includes(rut)) || (email && l.includes(email)) || (celular && l.includes(celular));
        return !isKeyword && !isMatch && l.length > 2;
    });

    const nombres = filteredLines.length > 0 ? filteredLines[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').trim() : null;
    const apPaterno = filteredLines.length > 1 ? filteredLines[1].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').trim() : null;
    const apMaterno = filteredLines.length > 2 ? filteredLines[2].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').trim() : null;

    // Calcular Dudosos
    const camposDudosos = [];
    if (!rut) camposDudosos.push('rut');
    if (!nombres) camposDudosos.push('nombres');
    if (!apPaterno) camposDudosos.push('apellido_paterno');
    if (!celular) camposDudosos.push('celular');
    if (!email) camposDudosos.push('email');

    return {
        rut: rut,
        nombres: nombres,
        apellido_paterno: apPaterno,
        apellido_materno: apMaterno,
        fecha_nacimiento: null,
        celular: celular,
        email: email,
        comuna_residencia: null,
        actividad_actual: actividad_actual,
        establecimiento: null,
        jornada: jornada,
        region: region,
        sede_interes: sede_interes,
        carreras: carrerasFound,
        confianza: camposDudosos.length <= 1 ? 'alta' : (camposDudosos.length <= 3 ? 'media' : 'baja'),
        campos_dudosos: camposDudosos
    };
}

// 2. Groq Cloud (Vision)
async function processWithOmniRoute() {
    const data = await processWithOmniRouteRaw(currentImageBase64, EXTRACTION_PROMPT);
    showReviewView(data);
    showToast('Extraído con OmniRoute', 'success');
}

async function processWithOmniRouteRaw(imageBase64, prompt) {
    const loadingText = document.querySelector('#loading p');
    if (loadingText) loadingText.textContent = 'Extrayendo datos con OmniRoute...';

    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || 'sk-47314da291a6397d-92aee5-c99ad6ed';
    let omniBaseServer = resolveOmniServer(localStorage.getItem(STORAGE_KEYS.OMNI_SERVER) || 'http://localhost:20128');
    
    // Asegurar endpoint /v1/chat/completions
    const OMNIROUTE_URL = omniBaseServer.endsWith('/v1/chat/completions') 
        ? omniBaseServer 
        : (omniBaseServer.endsWith('/v1') ? `${omniBaseServer}/chat/completions` : `${omniBaseServer}/v1/chat/completions`);

    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(OMNIROUTE_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: 'auto',
                    stream: false,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                            ]
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 2048
                })
            });

            if (response.status === 429) {
                const errText = await response.text();
                console.warn(`OmniRoute 429 (intento ${attempt}/${MAX_RETRIES}): ${errText}`);
                // Cuota agotada: no esperar mucho, lanzar error para que el fallback local (Tesseract) tome el control
                if (attempt === MAX_RETRIES) {
                    throw new Error('OmniRoute cuota agotada (429). Cambiando a OCR local...');
                }
                if (loadingText) loadingText.textContent = `Cuota agotada, reintentando en 5s... (${attempt}/${MAX_RETRIES})`;
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OmniRoute error ${response.status}: ${errText}`);
            }

            const result = await response.json();
            let text = result.choices[0].message.content;

            text = text.trim();
            if (text.startsWith('```json')) text = text.slice(7);
            if (text.startsWith('```')) text = text.slice(3);
            if (text.endsWith('```')) text = text.slice(0, -3);
            text = text.trim();

            return JSON.parse(text);

        } catch (err) {
            lastError = err;
            if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                throw new Error(`No se pudo conectar a OmniRoute en (${omniBaseServer}). Verifica tu servidor o URL pública en Configuración.`);
            }
            // For non-network errors on last attempt, throw
            if (attempt === MAX_RETRIES) throw err;
        }
    }
    throw lastError || new Error('OmniRoute: se agotaron los reintentos por cuota (429).');
}

// 2. Groq API
async function processWithGroqRaw(imageBase64, apiKey, prompt = EXTRACTION_PROMPT) {
    const models = ['llama-3.2-11b-vision-instruct'];
    let lastError = null;
    for (const model of models) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                    ]}],
                    temperature: 0.1
                })
            });
            if (!response.ok) { lastError = new Error(`Groq ${response.status}`); continue; }
            const result = await response.json();
            let text = result.choices[0].message.content.trim();
            if (text.startsWith('```json')) text = text.slice(7);
            if (text.startsWith('```')) text = text.slice(3);
            if (text.endsWith('```')) text = text.slice(0, -3);
            return JSON.parse(text.trim());
        } catch (err) { lastError = err; }
    }
    throw lastError || new Error('Error Groq');
}

async function processWithGeminiRaw(imageBase64, apiKey, prompt = EXTRACTION_PROMPT) {
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-latest'];
    let lastError = null;
    let quotaExceeded = false;
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: prompt },
                        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                    ]}],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
                })
            });
            if (!response.ok) {
                if (response.status === 429) { quotaExceeded = true; continue; }
                lastError = new Error(`Gemini ${response.status}`); continue;
            }
            const result = await response.json();
            let text = result.candidates[0].content.parts[0].text.trim();
            if (text.startsWith('```json')) text = text.slice(7);
            if (text.startsWith('```')) text = text.slice(3);
            if (text.endsWith('```')) text = text.slice(0, -3);
            return JSON.parse(text.trim());
        } catch (err) { lastError = err; }
    }
    if (quotaExceeded) throw new Error('Cuota agotada en tu API Key de Gemini');
    throw lastError || new Error('Error Gemini');
}

// OCR Local (Tesseract) -> retorna estructura de datos
async function processWithTesseractRaw(imageBase64, prompt = EXTRACTION_PROMPT) {
    const loadingText = document.querySelector('#loading p');
    if (loadingText) loadingText.textContent = 'Usando OCR local (Tesseract)...';
    const processedImageDataUrl = await preprocessImageForOCR(imageBase64);
    const result = await Tesseract.recognize(processedImageDataUrl, 'spa');
    const rawText = result.data.text || '';
    const data = parseRawTextToStructure(rawText);
    if (!data.rut && !data.nombres && !data.celular && !data.email) {
        throw new Error('Tesseract no pudo extraer datos confiables de la imagen');
    }
    return data;
}

// Fallback automático: si el proveedor usado se queda sin cuota, usar Tesseract local (gratis)
async function withLocalFallback(imageBase64, apiCallFn, providerLabel) {
    try {
        return await apiCallFn();
    } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('cuota') || msg.includes('429') || msg.includes('reintentos') || msg.includes('quota')) {
            showToast(`${providerLabel} sin cuota → usando OCR local (Tesseract)...`, 'info');
            return await processWithTesseractRaw(imageBase64);
        }
        throw err;
    }
}

async function processWithCascadeFallbackRaw(imageBase64, apiKey, prompt = EXTRACTION_PROMPT) {
    // Intentar primero Groq si hay key, luego Gemini
    if (apiKey) {
        try { return await processWithGroqRaw(imageBase64, apiKey, prompt); } catch(e) { console.warn('Groq falló en cascada:', e); }
        try { return await processWithGeminiRaw(imageBase64, apiKey, prompt); } catch(e) { console.warn('Gemini falló en cascada:', e); }
    }
    // Fallback: Tesseract local (gratis, sin límites de cuota)
    try {
        return await processWithTesseractRaw(imageBase64);
    } catch (e) {
        console.warn('Tesseract falló en cascada:', e);
    }
    throw new Error('No se pudo procesar la imagen. Las IAs están sin cuota y el OCR local no logró leer datos.');
}

async function processWithGroq(apiKey) {
    const data = await processWithGroqRaw(currentImageBase64, apiKey);
    showReviewView(data);
    showToast('Extraído con Groq', 'success');
}

// 3. Gemini API
async function processWithGemini(apiKey) {
    const loadingText = document.querySelector('#loading p');
    if (loadingText) loadingText.textContent = 'Extrayendo datos con Google Gemini IA...';

    const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-latest'
    ];
    let lastError = null;
    let quotaExceededCount = 0;

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
                if (response.status === 429) {
                    console.warn(`Cuota agotada en modelo ${model}, probando el siguiente...`);
                    quotaExceededCount++;
                    lastError = new Error(`Cuota agotada en tu API Key de Gemini`);
                    continue;
                }
                if (response.status === 404) {
                    console.warn(`Modelo ${model} no encontrado (404), probando siguiente...`);
                    continue;
                }
                throw new Error(`Gemini ${response.status}: ${errText}`);
            }

            const result = await response.json();
            let text = result.candidates[0].content.parts[0].text;

            text = text.trim();
            if (text.startsWith('```json')) text = text.slice(7);
            if (text.startsWith('```')) text = text.slice(3);
            if (text.endsWith('```')) text = text.slice(0, -3);
            text = text.trim();

            const data = JSON.parse(text);
            showReviewView(data);
            showToast(`Extraído con Gemini (${model})`, 'success');
            return;

        } catch (err) {
            console.error(`Error con modelo ${model}:`, err);
            lastError = err;
        }
    }

    if (quotaExceededCount > 0) {
        throw new Error('Cuota agotada en tu API Key de Gemini. Cambia al proveedor "Tesseract OCR (Local)" o "Groq Cloud" en Configuración.');
    }
    throw lastError || new Error('Error al procesar con Gemini');
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
    document.getElementById('btnExportTXT').addEventListener('click', exportTXT);
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

// Exportar TXT con formato: "campo : "valor""
function exportTXT() {
    if (queue.length === 0) {
        showToast('No hay registros para exportar', 'error');
        return;
    }

    const fieldLabels = {
        rut: 'RUT',
        nombres: 'Nombres',
        apellido_paterno: 'Apellido Paterno',
        apellido_materno: 'Apellido Materno',
        fecha_nacimiento: 'Fecha Nacimiento',
        celular: 'Celular',
        email: 'Email',
        comuna_residencia: 'Comuna Residencia',
        region: 'Region',
        actividad_actual: 'Actividad Actual',
        establecimiento: 'Establecimiento',
        jornada: 'Jornada',
        sede_interes: 'Sede de Interes',
        carrera1: '1era Preferencia',
        carrera2: '2da Preferencia',
        carrera3: '3era Preferencia'
    };

    const lines = [];
    queue.forEach((record, i) => {
        lines.push(`=== Registro ${i + 1} ===`);
        for (const [key, label] of Object.entries(fieldLabels)) {
            const value = record[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                lines.push(`${label} : "${value}"`);
            }
        }
        lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupones_duoc_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exportados ${queue.length} registros a TXT`, 'success');
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

// --- Comunicación con el formulario Duoc vía postMessage (funciona entre dominios) ---
function setupDuocMessaging() {
    window.addEventListener('message', (e) => {
        if (!e.data || e.data !== 'DUOC_GET_DATA') return;
        const rec = window._duocRecord;
        const targetWindow = window._duocWindow;
        if (rec && (e.source === targetWindow || !targetWindow)) {
            try { e.source.postMessage({ type: 'DUOC_DATA', data: rec }, '*'); } catch (err) {}
        } else {
            try { e.source.postMessage({ type: 'DUOC_NO_DATA' }, '*'); } catch (err) {}
        }
    });
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
        // Guardar en localStorage (solo funciona si la app y el formulario estan en el mismo dominio)
        localStorage.setItem('cupones_duoc_current', JSON.stringify(record));

        // Copiar el registro al portapapeles como respaldo universal
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(JSON.stringify(record));
            }
        } catch (err) {}

        const info = document.getElementById('currentRecordInfo');
        info.textContent = `Copiado #${currentFillIndex + 1}: ${record.nombres} ${record.apellido_paterno} (${record.rut})`;

        currentFillIndex++;
        showToast(`Registro ${currentFillIndex}/${queue.length}: ${record.nombres}. Abriendo formulario...`, 'info');

        // Abrir automaticamente el formulario de Duoc en una pestana nueva (si esta configurado)
        // Se abre SIN setTimeout para que el navegador no lo bloquee como popup
        // y se registra la ventana para responder a las peticiones del bookmarklet (postMessage).
        const formUrl = localStorage.getItem(STORAGE_KEYS.FORM_URL);
        if (formUrl) {
            const win = window.open(formUrl, '_blank');
            if (win) {
                window._duocWindow = win;
                window._duocRecord = record;
                // Metodo mas robusto: window.name persiste entre dominios y redirecciones
                try {
                    win.name = 'duoc=' + encodeURIComponent(JSON.stringify(record));
                } catch (err) {}
            }
        } else {
            showToast('Configura la URL del formulario para que se abra solo', 'info');
        }
    });

    // Generar bookmarklet
    generateBookmarklet();
}

function generateBookmarklet() {
    // Este código se ejecuta en el contexto del formulario de Duoc
    const bookmarkletCode = `
(function(){
    function fill(d) {
    try {
        if (!d) { alert('No hay registro copiado. Ve a la app de Cupones y toca Copiar siguiente.'); return; }

        // === SETTER NATIVO: compatible con Angular/React (el.value=x directo NO funciona en SPAs) ===
        function setInputValue(el, val) {
            if (!el || val === undefined || val === null) return;
            try {
                var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                         : (el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype);
                var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                setter.call(el, val);
            } catch (err) {
                el.value = val;
            }
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));
        }

        function setChecked(el, val) {
            if (!el) return;
            try {
                var proto = window.HTMLInputElement.prototype;
                var setter = Object.getOwnPropertyDescriptor(proto, 'checked').set;
                setter.call(el, val);
            } catch (err) {
                el.checked = val;
            }
            el.dispatchEvent(new Event('change', {bubbles:true}));
        }

        // Rellenar por atributo name/formcontrolname/id/formcontrolname
        function setByAttr(attrVals, val, tag) {
            if (!val) return;
            tag = tag || 'INPUT';
            for (var i = 0; i < attrVals.length; i++) {
                var name = attrVals[i];
                var el = document.querySelector(tag + '[name="' + name + '"]') ||
                         document.querySelector(tag + '[id="' + name + '"]') ||
                         document.querySelector(tag + '[formcontrolname="' + name + '"]') ||
                         document.querySelector(tag + '[formControlName="' + name + '"]');
                if (el) { setInputValue(el, val); return; }
            }
        }

        // Rellenar select buscando por texto de opcion
        function setSelectByText(sel, val) {
            if (!val) return;
            var els = document.querySelectorAll(sel);
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el.tagName !== 'SELECT') continue;
                for (var j = 0; j < el.options.length; j++) {
                    var txt = el.options[j].text.toLowerCase();
                    if (txt.indexOf(val.toLowerCase()) >= 0 || val.toLowerCase().indexOf(txt.trim().toLowerCase()) >= 0) {
                        try {
                            var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
                            setter.call(el, el.options[j].value);
                        } catch (err) {
                            el.selectedIndex = j;
                        }
                        el.dispatchEvent(new Event('change', {bubbles:true}));
                        el.dispatchEvent(new Event('input', {bubbles:true}));
                        return;
                    }
                }
            }
        }

        // === Busqueda por XPath (case/acento-insensible) y por label estructural (Angular Material) ===
        var XP_SRC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúüñÁÉÍÓÚÜÑ';
        var XP_DST = 'abcdefghijklmnopqrstuvwxyzaeiouunaeiouun';
        function xfind(xp, cn) {
            try { return document.evaluate(xp, cn || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }
            catch (e) { return null; }
        }
        function xall(xp, cn) {
            var out = [];
            try {
                var r = document.evaluate(xp, cn || document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                for (var i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
            } catch (e) {}
            return out;
        }
        function asciiLower(s) {
            return (s || '').toLowerCase().replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n').trim();
        }
        function canon(expr) {
            return "translate(normalize-space(" + expr + "),'" + XP_SRC + "','" + XP_DST + "')";
        }
        function byLabel(texts, tag) {
            tag = tag || 'input';
            outer:
            for (var i = 0; i < texts.length; i++) {
                var q = asciiLower(texts[i]);
                if (!q) continue;
                var found = null;
                // Angular Material: mat-form-field con mat-label
                var ffs = xall('//mat-form-field');
                for (var f = 0; f < ffs.length; f++) {
                    var ml = ffs[f].querySelector('mat-label, label');
                    if (ml && asciiLower(ml.textContent).indexOf(q) >= 0) {
                        found = ffs[f].querySelector(tag);
                        if (found) return found;
                    }
                }
                // label comun: for=, envuelve, hermano siguiente o mismo contenedor
                var labs = xall('//label');
                for (var li = 0; li < labs.length; li++) {
                    var l = labs[li];
                    if (asciiLower(l.textContent).indexOf(q) < 0) continue;
                    if (l.htmlFor) found = document.getElementById(l.htmlFor);
                    if (!found) found = l.querySelector(tag);
                    if (!found && l.nextElementSibling && l.nextElementSibling.tagName === tag.toUpperCase()) found = l.nextElementSibling;
                    if (!found && l.parentElement) found = l.parentElement.querySelector(tag);
                    if (found) return found;
                }
                // div contenedor cuyo texto concuerde (estructuras row)
                var div = xfind("//div[.//" + tag + " and .//text()[" + canon('.') + " = '" + q + "' or contains(" + canon('.') + ", '" + q + "')]]");
                if (div) { found = div.querySelector(tag); if (found) return found; }
            }
            return null;
        }
        function byLabelsAll(texts, tag) {
            tag = tag || 'input';
            var out = [];
            var labs = xall('//label | //mat-label');
            for (var li = 0; li < labs.length; li++) {
                var l = labs[li], a = null;
                for (var i = 0; i < texts.length; i++) {
                    if (asciiLower(l.textContent).indexOf(asciiLower(texts[i])) >= 0) {
                        if (l.htmlFor) a = document.getElementById(l.htmlFor);
                        if (!a) a = l.querySelector(tag);
                        if (!a && l.nextElementSibling && l.nextElementSibling.tagName === tag.toUpperCase()) a = l.nextElementSibling;
                        if (!a && l.parentElement) a = l.parentElement.querySelector(tag);
                        if (a && out.indexOf(a) === -1) out.push(a);
                        break;
                    }
                }
            }
            return out;
        }
        function findInputByHint(hints, tag) {
            tag = tag || 'input';
            for (var h = 0; h < hints.length; h++) {
                var q = asciiLower(hints[h]);
                if (!q) continue;
                var el = xfind("//" + tag + "[" +
                    "translate(@name,'" + XP_SRC + "','" + XP_DST + "') = '" + q + "' or " +
                    "translate(@id,'" + XP_SRC + "','" + XP_DST + "') = '" + q + "' or " +
                    "translate(@formcontrolname,'" + XP_SRC + "','" + XP_DST + "') = '" + q + "' or " +
                    "contains(translate(@name,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "') or " +
                    "contains(translate(@placeholder,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "') or " +
                    "contains(translate(@id,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "') or " +
                    "contains(translate(@formcontrolname,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "')]");
                if (el) return el;
            }
            return byLabel(hints, tag) || null;
        }

        function findAllInputsByHint(hints, tag) {
            tag = tag || 'input';
            var out = byLabelsAll(hints, tag);
            if (out.length > 0) return out;
            for (var h = 0; h < hints.length; h++) {
                var q = asciiLower(hints[h]);
                if (!q) continue;
                var els = xall("//" + tag + "[contains(translate(@name,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "') or contains(translate(@id,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "') or contains(translate(@formcontrolname,'" + XP_SRC + "','" + XP_DST + "'),'" + q + "')]");
                for (var j = 0; j < els.length; j++) if (out.indexOf(els[j]) === -1) out.push(els[j]);
            }
            return out;
        }

        // === Obtener TODOS los inputs visibles (en orden de aparicion) ===
        function visibleInputs(tag) {
            var all = Array.prototype.slice.call(document.querySelectorAll(tag));
            return all.filter(function(el){ return el.offsetParent !== null; });
        }

        // 1. RUT
        setByAttr(['rut', 'run', 'RUT', 'RUN', 'rut_', 'txtrut', 'txtRut'], d.rut);
        if (!document.querySelector('input[value="' + d.rut + '"]')) {
            var rutEl = findInputByHint(['rut', 'run', 'RUT', 'RUN', 'xxx.xxx', '123']);
            if (rutEl) setInputValue(rutEl, d.rut);
        }

        // 2. Nombres y Apellidos (por hint o por posicion)
        var nombreEl = findInputByHint(['nombre', 'nombres', 'name', 'Name', 'Nombres']);

        // Caso importante: campos SEPARADOS "Apellido Paterno" y "Apellido Materno" (como el formulario Duoc real)
        var apellidoPaternoEl = null, apellidoMaternoEl = null;
        var apPt = byLabelsAll(['apellido paterno', 'paterno'], 'input');
        var apMt = byLabelsAll(['apellido materno', 'materno'], 'input');
        var apellidoCandidates = findAllInputsByHint(['apellido paterno', 'apellido materno', 'apellido', 'apellidos', 'surname']);
        if (apPt.length > 0) apellidoPaternoEl = apPt[0];
        if (apMt.length > 0) apellidoMaternoEl = apMt[0];
        // Si NO se encontraron campos separados, usar el primero como "apellido unico"
        var apellidoEl = apellidoPaternoEl || (apellidoCandidates.length > 0 ? apellidoCandidates[0] : null);

        if (apellidoPaternoEl && apellidoMaternoEl) {
            // Campos separados
            if (d.apellido_paterno) setInputValue(apellidoPaternoEl, d.apellido_paterno);
            if (d.apellido_materno) setInputValue(apellidoMaternoEl, d.apellido_materno);
        } else {
            var singleAp = apellidoPaternoEl || apellidoMaternoEl || apellidoEl;
            if (singleAp) {
                var apellidos = ((d.apellido_paterno||'') + ' ' + (d.apellido_materno||'')).trim();
                setInputValue(singleAp, apellidos);
            }
        }
        if (nombreEl) setInputValue(nombreEl, d.nombres);

        // Fallback por posicion si no hay hints: supone orden [nombre, paterno, materno] o [nombre, paterno+materno]
        if (!nombreEl || (!apellidoPaternoEl && !apellidoMaternoEl && !apellidoEl)) {
            var inputs = visibleInputs('input');
            var idx = 0;
            if (!nombreEl && inputs.length > idx && d.nombres) { setInputValue(inputs[idx], d.nombres); }
            idx++;
            if (!apellidoPaternoEl && !apellidoMaternoEl && !apellidoEl) {
                var apellidos2 = ((d.apellido_paterno||'') + ' ' + (d.apellido_materno||'')).trim();
                if (inputs.length > idx) setInputValue(inputs[idx], apellidos2);
                idx++;
                // Si hay 3er input y apellidos separados, poner solo materno
                if (d.apellido_materno && inputs.length > idx && window.getComputedStyle(inputs[idx]).display !== 'none') {
                    setInputValue(inputs[idx], d.apellido_materno);
                }
            }
        }

        // 3. Fecha nacimiento (convertir DD-MM-AAAA a formato angular si es input date)
        var fechaEl = findInputByHint(['nacimiento', 'Nacimiento', 'birth', 'fecha', 'Nac', 'naci']);
        if (fechaEl && d.fecha_nacimiento) {
            var fVal = d.fecha_nacimiento;
            if (fechaEl.type === 'date') {
                var parts = fVal.split('-');
                if (parts.length === 3) fVal = parts[2] + '-' + parts[1] + '-' + parts[0];
            }
            setInputValue(fechaEl, fVal);
            // Disparar blur despues de un delay para que Angular valide
            setTimeout(function(){ fechaEl.dispatchEvent(new Event('blur', {bubbles:true})); }, 300);
        }

        // 4. Email
        setByAttr(['email', 'correo', 'mail', 'email_', 'txtEmail'], d.email);
        var emailEl = findInputByHint(['correo', 'mail', 'email', 'Email']);
        if (emailEl) setInputValue(emailEl, d.email);
        else {
            var emailInput = document.querySelector('input[type=email]');
            if (emailInput) setInputValue(emailInput, d.email);
        }

        // 5. Telefono / Celular
        setByAttr(['celular', 'telefono', 'fono', 'movil', 'phone', 'cel', 'txtCelular'], d.celular);
        var telEl = findInputByHint(['celular', 'telefono', 'fono', 'movil', 'phone']);
        if (telEl) setInputValue(telEl, d.celular);
        else {
            var telInput = document.querySelector('input[type=tel]');
            if (telInput) setInputValue(telInput, d.celular);
        }

        // 6. Comuna
        setByAttr(['comuna', 'comuna_residencia', 'txtComuna'], d.comuna_residencia);
        var comunaEl = findInputByHint(['comuna', 'Comuna']);
        if (comunaEl) setInputValue(comunaEl, d.comuna_residencia);

        // 7. Establecimiento / Colegio
        setByAttr(['establecimiento', 'colegio', 'institucion', 'txtEstablecimiento'], d.establecimiento);
        var estEl = findInputByHint(['establecimiento', 'colegio', 'institucion']);
        if (estEl) setInputValue(estEl, d.establecimiento);

        // 8. Selects: Region, Actividad, Jornada, Sede -- Angular Material (mat-select) y nativos
        function setMatSelect(sel, val) {
            if (!sel) return;
            try {
                sel.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
                sel.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
                window.setTimeout(function () {
                    try {
                        var opts = xall('//mat-option');
                        for (var i = 0; i < opts.length; i++) {
                            if (asciiLower(opts[i].textContent).indexOf(asciiLower(val)) >= 0) {
                                opts[i].click();
                                opts[i].dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
                                try { opts[i].setAttribute('data-clicked', '1'); } catch (e) {}
                                break;
                            }
                        }
                    } catch (e) {}
                }, 150);
            } catch (e) {}
        }
        function pickNative(sel, val) {
            if (!sel || !val) return;
            for (var j = 0; j < sel.options.length; j++) {
                if (asciiLower(sel.options[j].text).indexOf(asciiLower(val)) >= 0) {
                    try { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, sel.options[j].value); }
                    catch (e) { sel.selectedIndex = j; }
                    sel.dispatchEvent(new Event('change', {bubbles: true}));
                    return;
                }
            }
        }
        var selectMap = [
            [['region', 'región de residencia', 'region de residencia'], d.region],
            [['actividad actual', 'actividad', 'situacion actual'], d.actividad_actual],
            [['jornada'], d.jornada],
            [['sede', 'sede de interes', 'sede de interés'], d.sede_interes]
        ];
        for (var si = 0; si < selectMap.length; si++) {
            var sm = selectMap[si];
            if (!sm[1]) continue;
            var matS = byLabel(sm[0], 'mat-select');
            if (matS) { setMatSelect(matS, sm[1]); }
            else {
                var natS = byLabel(sm[0], 'select');
                if (natS) pickNative(natS, sm[1]);
                else setSelectByText('select', sm[1]);
            }
        }

        // 9. Carreras de interes (inputs text normalmente; podrian ser selects autocompletados)
        if (d.carrera1) setByAttr(['carrera1', 'carrera_1', 'preferencia1', 'carrera'], d.carrera1);
        if (d.carrera2) setByAttr(['carrera2', 'carrera_2', 'preferencia2'], d.carrera2);
        if (d.carrera3) setByAttr(['carrera3', 'carrera_3', 'preferencia3'], d.carrera3);

        // Si no se rellenaron las carreras por atributo, intentar por posicion al final
        var inputs2 = visibleInputs('input');
        var carreras = [d.carrera1, d.carrera2, d.carrera3].filter(function(c){ return c; });
        if (carreras.length > 0) {
            var startIdx = 0;
            if (inputs2.length > 8) startIdx = inputs2.length - carreras.length;
            for (var k = 0; k < carreras.length; k++) {
                var target = inputs2[startIdx + k];
                if (target && !target.value) setInputValue(target, carreras[k]);
            }
        }

        alert('Datos pegados! Revisa y completa los dropdowns que falten antes de enviar.');
    } catch(e) { alert('Error: ' + e.message); }
    }
    function tryLocal() {
        try {
            var r = JSON.parse(localStorage.getItem('cupones_duoc_current'));
            if (r) { fill(r); return true; }
        } catch(e) {}
        return false;
    }
    function tryWindowName() {
        try {
            if (window.name && window.name.indexOf('duoc=') === 0) {
                var r = JSON.parse(decodeURIComponent(window.name.substring(5)));
                if (r) { fill(r); return true; }
            }
        } catch(e) {}
        return false;
    }
    function tryClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(t){
                try { fill(JSON.parse(t)); }
                catch(e) { alert('No se encontraron datos en el portapapeles. Vuelve a la app y toca "Copiar siguiente registro", luego intenta de nuevo.'); }
            }).catch(function(){
                alert('No se pudo leer el portapapeles. Mantén la app abierta en otra pestaña, toca "Copiar siguiente registro" y vuelve aquí.');
            });
        } else {
            alert('Para pegar: en la app toca "Copiar siguiente registro" (abrirá esta página). Mantén la app abierta y toca este marcador de nuevo.');
        }
    }
    if (tryLocal()) return;
    if (tryWindowName()) return;
    if (window.opener) {
        var done2 = false;
        var t2 = setTimeout(function(){ if (!done2) { tryClipboard(); } }, 1500);
        var h2 = function(e) {
            if (e.data && e.data.type === 'DUOC_DATA') {
                done2 = true;
                window.removeEventListener('message', h2);
                clearTimeout(t2);
                fill(e.data.data);
            }
        };
        window.addEventListener('message', h2);
        try { window.opener.postMessage('DUOC_GET_DATA', '*'); }
        catch(e) { tryClipboard(); }
    } else {
        tryClipboard();
    }
})();`;

    const encoded = 'javascript:' + encodeURIComponent(bookmarkletCode.replace(/\n/g, ' ').replace(/\s+/g, ' '));
    document.getElementById('bookmarkletLink').href = encoded;
}

// Agregar setupFillSection al init (ya llamado en DOMContentLoaded)
