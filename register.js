// ============================================================
// BLENDING BEATZ — register.js
// ============================================================

/* ------------------------------------------------------------
   CONFIG — Updated Google Apps Script Web App URL
   ------------------------------------------------------------ */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbycHd8-uoWqMDTcvOExUj8IL1kyoZI7326ZEasNePm_d424G66MLPKU5ntoL9iJsAPiYQ/exec";

const MEMBER_COUNT = 20;

/* ---------- Nav scroll state ---------- */
const nav = document.getElementById('siteNav');
if (nav) {
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
}

/* ---------- Generate 20 member cards ---------- */
const membersContainer = document.getElementById('membersContainer');
if (membersContainer) {
  for (let i = 1; i <= MEMBER_COUNT; i++) {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.innerHTML = `
      <div class="member-card-head">
        <div class="member-num">${i}</div>
        <h4>Warrior ${i}</h4>
      </div>
      <div class="member-fields">
        <div class="field">
          <label>Full Name <span class="req">*</span></label>
          <input type="text" name="member${i}_name" required placeholder="Full name">
        </div>
        <div class="field">
          <label>Instrument <span class="req">*</span></label>
          <input type="text" name="member${i}_instrument" required placeholder="e.g. Trumpet">
        </div>
        <div class="field">
          <label>Grade</label>
          <input type="text" name="member${i}_grade" placeholder="e.g. Grade 10">
        </div>
        <div class="field">
          <label>Contact No.</label>
          <input type="tel" name="member${i}_contact" placeholder="Optional">
        </div>
      </div>
    `;
    membersContainer.appendChild(card);
  }
}

/* ---------- Photo upload handling ---------- */
let captainPhotoData = null; // { base64, mimeType, filename }
let groupPhotoData = null;

function setupPhotoUpload(uploadId, inputId, previewId, statusId, onLoaded) {
  const upload = document.getElementById(uploadId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const status = document.getElementById(statusId);

  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('Please choose an image under 8MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result; // "data:image/jpeg;base64,...."
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="Preview">`;
      if (upload) upload.classList.add('filled');
      if (status) status.textContent = 'Uploaded';

      onLoaded({ base64, mimeType, filename: file.name });
      updateProgress();
      checkSubmitEnabled();
    };
    reader.readAsDataURL(file);
  });
}

setupPhotoUpload('captainUpload', 'captainPhoto', 'captainPreview', 'captainStatus', (data) => { captainPhotoData = data; });
setupPhotoUpload('groupUpload', 'groupPhoto', 'groupPreview', 'groupStatus', (data) => { groupPhotoData = data; });

/* ---------- Progress bar ---------- */
const form = document.getElementById('regForm') || document.getElementById('bandForm');
const progressFill = document.getElementById('progressFill') || document.getElementById('uploadProgress');
const progressPct = document.getElementById('progressPct') || document.getElementById('progressText');

function updateProgress() {
  if (!form) return;
  const requiredFields = Array.from(form.querySelectorAll('[required]'));
  let filled = 0;
  requiredFields.forEach(f => {
    if (f.type === 'checkbox') { if (f.checked) filled++; }
    else if (f.value && f.value.trim() !== '') filled++;
  });

  const totalPhotos = 2;
  let photosFilled = (captainPhotoData ? 1 : 0) + (groupPhotoData ? 1 : 0);

  const total = requiredFields.length + totalPhotos;
  const done = filled + photosFilled;
  const pct = Math.min(100, Math.round((done / total) * 100));

  if (progressFill) progressFill.style.width = pct + '%';
  if (progressPct) progressPct.textContent = pct + '%';
}

if (form) {
  form.addEventListener('input', updateProgress);
  form.addEventListener('change', updateProgress);
  updateProgress();
}

/* ---------- Enable submit only once required photos are uploaded ---------- */
const submitBtn = document.getElementById('submitBtn');
const submitNote = document.getElementById('submitNote');

function checkSubmitEnabled() {
  const ready = !!captainPhotoData && !!groupPhotoData;
  if (submitBtn) submitBtn.disabled = !ready;
  if (submitNote) {
    submitNote.textContent = ready
      ? 'Photos uploaded — review your details and submit'
      : 'Upload both photos to enable submission';
  }
}
checkSubmitEnabled();

/* ---------- Submit ---------- */
const formError = document.getElementById('formError');
const regSuccess = document.getElementById('regSuccess');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formError) formError.classList.remove('show');

    if (!form.checkValidity() || !captainPhotoData || !groupPhotoData) {
      if (formError) {
        formError.classList.add('show');
        formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert('Please complete all required fields and upload both photos.');
      }
      return;
    }

    const fd = new FormData(form);
    const members = [];
    for (let i = 1; i <= MEMBER_COUNT; i++) {
      members.push({
        name: fd.get(`member${i}_name`) || form.querySelector(`[name="member${i}_name"]`)?.value || '',
        instrument: fd.get(`member${i}_instrument`) || form.querySelector(`[name="member${i}_instrument"]`)?.value || '',
        grade: fd.get(`member${i}_grade`) || form.querySelector(`[name="member${i}_grade"]`)?.value || '',
        contact: fd.get(`member${i}_contact`) || form.querySelector(`[name="member${i}_contact"]`)?.value || ''
      });
    }

    const payload = {
      schoolName: fd.get('schoolName') || document.getElementById('schoolName')?.value || '',
      bandName: fd.get('bandName') || document.getElementById('schoolName')?.value || '',
      captainName: fd.get('captainName') || '',
      captainRole: fd.get('captainRole') || '',
      captainPhone: fd.get('captainPhone') || '',
      captainEmail: fd.get('captainEmail') || document.getElementById('captainEmail')?.value || '',
      members: members,
      captainPhoto: captainPhotoData,
      groupPhoto: groupPhotoData,
      submittedAt: new Date().toISOString()
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' } // avoids CORS preflight on Apps Script
      });
      const result = await res.json();

      if (!result.success) throw new Error(result.message || 'Submission failed.');

      form.style.display = 'none';
      const progressShell = document.querySelector('.progress-shell');
      if (progressShell) progressShell.style.display = 'none';
      if (regSuccess) {
        regSuccess.classList.add('show');
      } else {
        alert('Registration successful!');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      if (formError) {
        formError.textContent = err.message || 'Something went wrong. Please try again.';
        formError.classList.add('show');
        formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert(err.message || 'Something went wrong. Please try again.');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Registration';
      }
    }
  });
}
