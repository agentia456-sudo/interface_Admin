// ============================================
// CONFIGURATION SUPABASE
// ============================================
const SUPABASE_URL      = 'https://mxemardtyidrhfsnxvad.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZW1hcmR0eWlkcmhmc254dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzkwMzQsImV4cCI6MjA4ODQ1NTAzNH0.u1eFWdodluIqZQ-_Cr5IzSNMNUE1H4GQU-oDYT4Z1oo';

// Créer le client Supabase
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ============================================
// CALCUL AUTOMATIQUE DU SEMESTRE
// ============================================

// Retourne le semestre (S1, S2, S3...) selon le niveau et le mois actuel
function getSemestre(level) {
  const now   = new Date();
  const month = now.getMonth() + 1;

  // Semestre impair : Septembre → Janvier
  // Semestre pair   : Février → Juin
  const isFirstHalf = (month >= 9 || month === 1);

  const semestreMap = {
    'L1': isFirstHalf ? 'S1' : 'S2',
    'L2': isFirstHalf ? 'S3' : 'S4',
    'L3': isFirstHalf ? 'S5' : 'S6',
    'M1': isFirstHalf ? 'S1' : 'S2',
    'M2': isFirstHalf ? 'S3' : 'S4',
  };

  return semestreMap[level] || 'S1';
}

// Retourne l'année universitaire ex: "2024-2025"
function getAnneeUniversitaire() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  return month >= 9
    ? `${year}-${year + 1}`
    : `${year - 1}-${year}`;
}


// ============================================
// INITIALISATION AU CHARGEMENT DE LA PAGE
// ============================================
window.addEventListener('load', async () => {

  // Vérifier si une session admin existe déjà (ex: page rafraîchie)
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    // Une session existe → vérifier que c'est bien un admin
    const { data: admin } = await sb
      .from('admins')
      .select('id, is_active')
      .eq('id', session.user.id)
      .single();

    if (admin && admin.is_active) {
      // ✅ Session valide + admin actif → afficher l'application
      showApp(session.user.email);
    } else {
      // ❌ Session existante mais pas admin → déconnecter
      await sb.auth.signOut();
    }
  }

  // Afficher le semestre calculé automatiquement
  updateSemestreDisplay('planning');
  updateSemestreDisplay('notes');

  // ---- Bouton Login ----
  document.getElementById('login-btn').addEventListener('click', doLogin);

  // ---- Touche Entrée sur le champ mot de passe ----
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // ---- Bouton Déconnexion ----
  document.getElementById('logout-btn').addEventListener('click', doLogout);

  // ---- Bouton Rafraîchir la liste des fichiers ----
  document.getElementById('refresh-btn').addEventListener('click', loadFiles);

  // ---- Bouton Rafraîchir les certificats ----
  document.getElementById('refresh-certs-btn').addEventListener('click', loadCertificats);

  // ---- Boutons Upload Planning et Notes ----
  document.getElementById('planning-btn').addEventListener('click', () => uploadFile('planning'));
  document.getElementById('notes-btn').addEventListener('click', () => uploadFile('notes'));

  // ---- Sélection de fichier Planning et Notes ----
  document.getElementById('planning-file').addEventListener('change', () => handleFileSelect('planning'));
  document.getElementById('notes-file').addEventListener('change', () => handleFileSelect('notes'));

  // ---- Mise à jour du semestre quand le niveau change ----
  document.getElementById('planning-level').addEventListener('change', () => updateSemestreDisplay('planning'));
  document.getElementById('notes-level').addEventListener('change', () => updateSemestreDisplay('notes'));

  // ---- Activer le drag & drop pour Planning et Notes ----
  setupDragDrop('planning');
  setupDragDrop('notes');
});


// ============================================
// AFFICHAGE DU SEMESTRE AUTOMATIQUE
// ============================================

// Met à jour le badge semestre affiché dans le formulaire upload
function updateSemestreDisplay(type) {
  const level    = document.getElementById(`${type}-level`).value;
  const semestre = getSemestre(level);
  const annee    = getAnneeUniversitaire();

  const badge = document.getElementById(`${type}-semestre-badge`);
  if (badge) {
    badge.textContent = `📅 ${annee} — ${semestre} (automatique)`;
  }
}


// ============================================
// CONNEXION ADMIN
// ============================================
async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errDiv   = document.getElementById('login-error');

  // Vérifier que les champs ne sont pas vides
  if (!email || !password) {
    showLoginError('Veuillez remplir tous les champs.');
    return;
  }

  // Désactiver le bouton pendant la connexion
  btn.disabled         = true;
  btn.textContent      = 'Connexion...';
  errDiv.style.display = 'none';

  // Étape 1 : Connexion via Supabase Auth
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  // Si email ou mot de passe incorrect
  if (error) {
    showLoginError('❌ Email ou mot de passe incorrect.');
    btn.disabled    = false;
    btn.textContent = 'Se connecter';
    return;
  }

  // Étape 2 : Vérifier si cet utilisateur est dans la table admins
  const { data: admin, error: adminError } = await sb
    .from('admins')
    .select('id, is_active')
    .eq('id', data.user.id)
    .single();

  // Si l'utilisateur n'est pas dans la table admins → accès refusé
  if (adminError || !admin) {
    await sb.auth.signOut(); // Déconnecter immédiatement
    showLoginError('❌ Accès refusé. Réservé aux administrateurs.');
    btn.disabled    = false;
    btn.textContent = 'Se connecter';
    return;
  }

  // Si le compte admin est désactivé
  if (!admin.is_active) {
    await sb.auth.signOut(); // Déconnecter immédiatement
    showLoginError('❌ Compte désactivé. Contactez le responsable.');
    btn.disabled    = false;
    btn.textContent = 'Se connecter';
    return;
  }

  // ✅ Tout est bon → afficher l'interface admin
  showApp(data.user.email);
}


// ============================================
// DÉCONNEXION ADMIN
// ============================================
async function doLogout() {
  // Révoquer la session Supabase
  await sb.auth.signOut();

  // Cacher l'interface app et afficher la page login
  document.getElementById('app-page').style.display   = 'none';
  document.getElementById('login-page').style.display = 'flex';

  // Réinitialiser le formulaire login
  document.getElementById('login-password').value  = '';
  document.getElementById('login-btn').textContent = 'Se connecter';
  document.getElementById('login-btn').disabled    = false;
}


// ============================================
// AFFICHER L'APPLICATION APRÈS LOGIN
// ============================================
function showApp(email) {
  // Cacher la page login
  document.getElementById('login-page').style.display = 'none';

  // Afficher l'interface principale
  document.getElementById('app-page').style.display = 'block';

  // Afficher l'email de l'admin connecté
  document.getElementById('admin-email').textContent = email;

  // Charger les données
  loadFiles();
  loadCertificats();
}

// Afficher un message d'erreur sur la page login
function showLoginError(msg) {
  const errDiv = document.getElementById('login-error');
  errDiv.style.display = 'block';
  errDiv.textContent   = msg;
}


// ============================================
// SÉLECTION DE FICHIER
// ============================================

// Quand l'admin sélectionne un fichier via le bouton parcourir
function handleFileSelect(type) {
  const file = document.getElementById(`${type}-file`).files[0];
  if (!file) return;

  // Afficher le nom du fichier sélectionné
  document.getElementById(`${type}-file-name`).textContent   = file.name;
  document.getElementById(`${type}-file-info`).style.display = 'flex';

  // Activer le bouton upload
  document.getElementById(`${type}-btn`).disabled = false;
}


// ============================================
// DRAG & DROP
// ============================================

// Activer le glisser-déposer sur la zone d'upload
function setupDragDrop(type) {
  const zone = document.getElementById(`${type}-dropzone`);

  // Survol de la zone avec un fichier
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover'); // Ajouter style visuel
  });

  // Quitter la zone
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover'); // Retirer style visuel
  });

  // Déposer le fichier dans la zone
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Injecter le fichier déposé dans l'input file
      document.getElementById(`${type}-file`).files = files;
      handleFileSelect(type);
    }
  });
}


// ============================================
// UPLOAD FICHIER VERS SUPABASE STORAGE
// ============================================
async function uploadFile(type) {
  const file = document.getElementById(`${type}-file`).files[0];
  if (!file) return;

  let fileName, bucket;

  if (type === 'planning') {
    // Construire le nom du fichier planning : ex L1_INFO_G1_S1.xlsx
    const level    = document.getElementById('planning-level').value;
    const group    = document.getElementById('planning-group').value;
    const semestre = getSemestre(level);
    fileName = `${level}_INFO_${group}_${semestre}.xlsx`;
    bucket   = 'planning';
  } else {
    // Construire le nom du fichier notes : ex L1_INFO_S1.xlsx
    const level    = document.getElementById('notes-level').value;
    const semestre = getSemestre(level);
    fileName = `${level}_INFO_${semestre}.xlsx`;
    bucket   = 'notes';
  }

  // Désactiver le bouton et afficher la barre de progression
  document.getElementById(`${type}-btn`).disabled              = true;
  document.getElementById(`${type}-progress`).style.display    = 'block';
  document.getElementById(`${type}-fill`).style.width          = '40%';
  document.getElementById(`${type}-progress-text`).textContent = `Upload → ${fileName}...`;

  // Envoyer le fichier vers Supabase Storage
  // upsert: true → remplace le fichier s'il existe déjà
  const { error } = await sb.storage.from(bucket).upload(fileName, file, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true
  });

  // Compléter la barre de progression
  document.getElementById(`${type}-fill`).style.width = '100%';

  if (error) {
    // ❌ Erreur pendant l'upload
    document.getElementById(`${type}-progress-text`).textContent = '❌ Erreur upload';
    showToast(`❌ ${error.message}`, 'error');
    document.getElementById(`${type}-btn`).disabled = false;
  } else {
    // ✅ Upload réussi
    document.getElementById(`${type}-progress-text`).textContent = `✅ ${fileName} stocké !`;
    showToast(`✅ ${fileName} → bucket "${bucket}"`, 'success');

    // Réinitialiser l'interface après 2 secondes
    setTimeout(() => resetUploadUI(type), 2000);

    // Rafraîchir la liste des fichiers
    loadFiles();
  }
}

// Réinitialiser l'interface d'upload après envoi
function resetUploadUI(type) {
  document.getElementById(`${type}-progress`).style.display    = 'none';
  document.getElementById(`${type}-file-info`).style.display   = 'none';
  document.getElementById(`${type}-btn`).disabled              = true;
  document.getElementById(`${type}-file`).value                = '';
  document.getElementById(`${type}-fill`).style.width          = '0%';
  document.getElementById(`${type}-progress-text`).textContent = 'Upload en cours...';
}


// ============================================
// CHARGER LA LISTE DES FICHIERS
// ============================================
async function loadFiles() {
  const container = document.getElementById('files-table-container');
  container.innerHTML = '<div class="empty-state">Chargement...</div>';

  // Récupérer les fichiers des 2 buckets en parallèle
  const [planningResult, notesResult] = await Promise.all([
    sb.storage.from('planning').list(),
    sb.storage.from('notes').list()
  ]);

  // Fusionner les deux listes avec le nom du bucket
  const planningFiles = (planningResult.data || []).map(f => ({ ...f, bucket: 'planning' }));
  const notesFiles    = (notesResult.data    || []).map(f => ({ ...f, bucket: 'notes'    }));
  const allFiles      = [...planningFiles, ...notesFiles];

  // Aucun fichier trouvé
  if (allFiles.length === 0) {
    container.innerHTML = '<div class="empty-state">📭 Aucun fichier trouvé</div>';
    return;
  }

  // Construire les lignes du tableau
  const rows = allFiles.map(f => {
    // Taille en KB
    const size = f.metadata?.size
      ? (f.metadata.size / 1024).toFixed(1) + ' KB'
      : '—';

    // Date de dernière modification
    const date = f.updated_at
      ? new Date(f.updated_at).toLocaleString('fr-FR')
      : '—';

    // Extraire le semestre depuis le nom du fichier ex: L1_INFO_G1_S2.xlsx → S2
    const semestreMatch = f.name.match(/_(S\d)\.xlsx$/);
    const semestreTag   = semestreMatch
      ? `<span class="tag-semestre">${semestreMatch[1]}</span>`
      : '';

    return `
      <tr>
        <td>📄 ${f.name} ${semestreTag}</td>
        <td><span class="tag ${f.bucket}">${f.bucket === 'planning' ? '📅 Planning' : '📊 Notes'}</span></td>
        <td>${size}</td>
        <td>${date}</td>
      </tr>
    `;
  }).join('');

  // Afficher le tableau
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
      <tbody>${rows}</tbody>
    </table>
  `;
}


// ============================================
// NOTIFICATIONS TOAST
// ============================================

// Afficher une notification temporaire en bas de l'écran
function showToast(msg, type) {
  const toast = document.createElement('div');
  toast.className   = `toast ${type}`;
  toast.textContent = msg;
  document.getElementById('toasts').appendChild(toast);

  // Supprimer le toast après 4 secondes
  setTimeout(() => toast.remove(), 4000);
}


// ============================================
// CHARGER LES DEMANDES DE CERTIFICATS
// ============================================
async function loadCertificats() {
  const container  = document.getElementById('certs-table-container');
  const countBadge = document.getElementById('cert-count');
  container.innerHTML = '<div class="empty-state">Chargement...</div>';

  // Récupérer toutes les demandes depuis la table demandes_certificats
  const { data, error } = await sb
    .from('demandes_certificats')
    .select(`
      student_id,
      statut,
      created_at,
      traite_at
    `)
    .order('created_at', { ascending: false }); // Les plus récentes en premier

  // Erreur de récupération
  if (error) {
    container.innerHTML = `<div class="empty-state" style="color:var(--error)">❌ ${error.message}</div>`;
    return;
  }

  // Aucune demande
  if (!data || data.length === 0) {
    container.innerHTML    = '<div class="empty-state">✅ Aucune demande en attente</div>';
    countBadge.textContent = '0 en attente';
    return;
  }

  // Compter les demandes encore en attente
  const pending = data.filter(d => d.statut !== 'pret').length;

  // Mettre à jour le badge compteur
  countBadge.textContent    = `${pending} en attente`;
  countBadge.style.background  = pending > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)';
  countBadge.style.color       = pending > 0 ? 'var(--error)'  : 'var(--success)';
  countBadge.style.borderColor = pending > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)';

  // Construire les lignes du tableau
  const rows = data.map(d => {
    const student = d.student;

    // Afficher nom complet ou ID si pas de données étudiant
    const nom    = student ? `${student.first_name} ${student.last_name}` : `ID: ${d.student_id}`;
    const email  = student?.email || '—';
    const niveau = student ? `${student.level} — ${student.specialty || ''}` : '—';

    const dateD  = new Date(d.created_at).toLocaleString('fr-FR');
    const dateT  = d.traite_at ? new Date(d.traite_at).toLocaleString('fr-FR') : '—';
    const isPret = d.statut === 'pret';

    // Badge statut
    const statutBadge = isPret
      ? `<span class="cert-badge pret">✅ Prêt</span>`
      : `<span class="cert-badge attente">⏳ En attente</span>`;

    // Bouton action
    const actionBtn = isPret
      ? `<button class="cert-btn done" disabled>Déjà traité</button>`
      : `<button class="cert-btn action" onclick="markCertificatPret('${d.student_id}', this)">
           🎓 Marquer Prêt
         </button>`;

    return `
      <tr>
        <td>
          <div class="cert-name">${nom}</div>
          <div class="cert-email">${email}</div>
        </td>
        <td>${niveau}</td>
        <td>${statutBadge}</td>
        <td style="font-size:11px;color:var(--text-muted)">${dateD}</td>
        <td style="font-size:11px;color:var(--text-muted)">${dateT}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');

  // Afficher le tableau
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Étudiant</th>
          <th>Niveau</th>
          <th>Statut</th>
          <th>Demandé le</th>
          <th>Traité le</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}


// ============================================
// MARQUER UN CERTIFICAT COMME PRÊT
// ============================================
async function markCertificatPret(studentId, btn) {
  // Désactiver le bouton pendant le traitement
  btn.disabled    = true;
  btn.textContent = '⏳ Traitement...';

  try {
    // Appeler le webhook n8n qui va :
    // 1. Mettre à jour le statut dans Supabase
    // 2. Envoyer un email à l'étudiant
    const webhookUrl = `https://n8n-mcda.onrender.com/webhook/certificat?student_id=${studentId}`;
    const res = await fetch(webhookUrl);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // ✅ Webhook appelé avec succès
    btn.textContent = '✅ Notifié !';
    btn.classList.remove('action');
    btn.classList.add('done');
    showToast(`✅ Certificat de ${studentId} marqué prêt — email envoyé`, 'success');

    // Rafraîchir la liste après 1.5 secondes
    setTimeout(() => loadCertificats(), 1500);

  } catch (err) {
    // ❌ Erreur webhook → réactiver le bouton
    btn.disabled    = false;
    btn.textContent = '🎓 Marquer Prêt';
    showToast(`❌ Erreur: ${err.message}`, 'error');
  }
}
