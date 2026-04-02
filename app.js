// ============================================
// ⚠️  REMPLACE CES 2 VALEURS
// ============================================
const SUPABASE_URL      = 'https://mxemardtyidrhfsnxvad.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZW1hcmR0eWlkcmhmc254dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzkwMzQsImV4cCI6MjA4ODQ1NTAzNH0.u1eFWdodluIqZQ-_Cr5IzSNMNUE1H4GQU-oDYT4Z1oo';
// ============================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// INIT — vérifier session existante
// ============================================
window.addEventListener('load', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showApp(session.user.email);
  }

  // Events
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('refresh-btn').addEventListener('click', loadFiles);
  document.getElementById('planning-btn').addEventListener('click', () => uploadFile('planning'));
  document.getElementById('notes-btn').addEventListener('click', () => uploadFile('notes'));
  document.getElementById('planning-file').addEventListener('change', () => handleFileSelect('planning'));
  document.getElementById('notes-file').addEventListener('change', () => handleFileSelect('notes'));

  // Drag and drop
  setupDragDrop('planning');
  setupDragDrop('notes');
});

// ============================================
// AUTH
// ============================================
async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errDiv   = document.getElementById('login-error');

  if (!email || !password) {
    showLoginError('Veuillez remplir tous les champs.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Connexion...';
  errDiv.style.display = 'none';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    showLoginError('❌ Email ou mot de passe incorrect.');
    btn.disabled    = false;
    btn.textContent = 'Se connecter';
  } else {
    showApp(data.user.email);
  }
}

async function doLogout() {
  await sb.auth.signOut();
  document.getElementById('app-page').style.display  = 'none';
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('login-password').value     = '';
  document.getElementById('login-btn').textContent    = 'Se connecter';
  document.getElementById('login-btn').disabled       = false;
}

function showApp(email) {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-page').style.display   = 'block';
  document.getElementById('admin-email').textContent  = email;
  loadFiles();
}

function showLoginError(msg) {
  const errDiv = document.getElementById('login-error');
  errDiv.style.display = 'block';
  errDiv.textContent   = msg;
}

// ============================================
// FILE SELECT & DRAG DROP
// ============================================
function handleFileSelect(type) {
  const file = document.getElementById(`${type}-file`).files[0];
  if (!file) return;

  document.getElementById(`${type}-file-name`).textContent  = file.name;
  document.getElementById(`${type}-file-info`).style.display = 'flex';
  document.getElementById(`${type}-btn`).disabled            = false;
}

function setupDragDrop(type) {
  const zone = document.getElementById(`${type}-dropzone`);

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      document.getElementById(`${type}-file`).files = files;
      handleFileSelect(type);
    }
  });
}

// ============================================
// UPLOAD — direct vers Supabase Storage
// ============================================
async function uploadFile(type) {
  const file = document.getElementById(`${type}-file`).files[0];
  if (!file) return;

  let fileName, bucket;

  if (type === 'planning') {
    const level = document.getElementById('planning-level').value;
    const group = document.getElementById('planning-group').value;
    fileName = `${group}_${level}.xlsx`;
    bucket   = 'planning';
  } else {
    const level = document.getElementById('notes-level').value;
    fileName = `${level}.xlsx`;
    bucket   = 'notes';
  }

  // UI — début upload
  document.getElementById(`${type}-btn`).disabled              = true;
  document.getElementById(`${type}-progress`).style.display    = 'block';
  document.getElementById(`${type}-fill`).style.width          = '40%';
  document.getElementById(`${type}-progress-text`).textContent = 'Upload en cours...';

  // Upload direct vers Supabase Storage
  // Le SDK utilise automatiquement le JWT du login — pas la anon key
  const { error } = await sb.storage.from(bucket).upload(fileName, file, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true  // remplace le fichier existant
  });

  document.getElementById(`${type}-fill`).style.width = '100%';

  if (error) {
    document.getElementById(`${type}-progress-text`).textContent = '❌ Erreur upload';
    showToast(`❌ ${error.message}`, 'error');
    document.getElementById(`${type}-btn`).disabled = false;
  } else {
    document.getElementById(`${type}-progress-text`).textContent = '✅ Stocké dans Supabase !';
    showToast(`✅ ${fileName} stocké dans "${bucket}"`, 'success');

    setTimeout(() => {
      resetUploadUI(type);
    }, 2000);

    loadFiles();
  }
}

function resetUploadUI(type) {
  document.getElementById(`${type}-progress`).style.display    = 'none';
  document.getElementById(`${type}-file-info`).style.display   = 'none';
  document.getElementById(`${type}-btn`).disabled              = true;
  document.getElementById(`${type}-file`).value                = '';
  document.getElementById(`${type}-fill`).style.width          = '0%';
  document.getElementById(`${type}-progress-text`).textContent = 'Upload en cours...';
}

// ============================================
// LOAD FILES — depuis Supabase Storage
// ============================================
async function loadFiles() {
  const container = document.getElementById('files-table-container');
  container.innerHTML = '<div class="empty-state">Chargement...</div>';

  const [planningResult, notesResult] = await Promise.all([
    sb.storage.from('planning').list(),
    sb.storage.from('notes').list()
  ]);

  const planningFiles = (planningResult.data || []).map(f => ({ ...f, bucket: 'planning' }));
  const notesFiles    = (notesResult.data    || []).map(f => ({ ...f, bucket: 'notes'    }));
  const allFiles      = [...planningFiles, ...notesFiles];

  if (allFiles.length === 0) {
    container.innerHTML = '<div class="empty-state">📭 Aucun fichier trouvé</div>';
    return;
  }

  const rows = allFiles.map(f => {
    const size = f.metadata?.size
      ? (f.metadata.size / 1024).toFixed(1) + ' KB'
      : '—';

    const date = f.updated_at
      ? new Date(f.updated_at).toLocaleString('fr-FR')
      : '—';

    return `
      <tr>
        <td>📄 ${f.name}</td>
        <td><span class="tag ${f.bucket}">${f.bucket === 'planning' ? '📅 Planning' : '📊 Notes'}</span></td>
        <td>${size}</td>
        <td>${date}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fichier</th>
          <th>Bucket</th>
          <th>Taille</th>
          <th>Dernière MAJ</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type) {
  const toast = document.createElement('div');
  toast.className   = `toast ${type}`;
  toast.textContent = msg;
  document.getElementById('toasts').appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
