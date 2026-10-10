/* =========================================================
   1. STATE & PERSISTENCE  — kriteria tetap (bobot dinamis), destinasi dinamis
   2. PERHITUNGAN TOPSIS   — X -> R -> Y -> A+/A- -> D+/D- -> V -> ranking
   3. RENDER               — bobot, tabel destinasi, 5 tabel proses, hasil akhir
   4. INTERAKSI            — slider bobot, modal CRUD destinasi, toast

   Keterangan: Codingan dibantu susun oleh Claude AI sebagai panduan pembelajaran.
========================================================= */

(function () {
  "use strict";

  /* =========================================================
     1. STATE & PERSISTENCE
  ========================================================= */

  const STORAGE_KEY_DEST = "topsis_wisata_destinasi";
  const STORAGE_KEY_WEIGHTS = "topsis_wisata_bobot";

  // Empat kriteria tetap sesuai permintaan — hanya bobotnya yang bisa diubah.
  const CRITERIA = [
    { id: "c1", name: "Biaya Tiket Masuk", type: "cost", unit: "Rp", defaultWeight: 5 },
    { id: "c2", name: "Fasilitas", type: "benefit", unit: "skor 0\u2013100", defaultWeight: 4 },
    { id: "c3", name: "Aksesibilitas Jalan", type: "benefit", unit: "skor 0\u2013100", defaultWeight: 3 },
    { id: "c4", name: "Rating/Popularitas", type: "benefit", unit: "0\u20135", defaultWeight: 4 },
  ];

  const DEFAULT_DESTINATIONS = [
    { id: "d1", name: "Pantai Kuta, Bali", vals: { c1: 20000, c2: 88, c3: 95, c4: 4.5 } },
    { id: "d2", name: "Kawah Putih, Bandung", vals: { c1: 30000, c2: 75, c3: 80, c4: 4.4 } },
    { id: "d3", name: "Raja Ampat, Papua Barat", vals: { c1: 500000, c2: 60, c3: 40, c4: 4.8 } },
    { id: "d4", name: "Danau Toba, Sumatera Utara", vals: { c1: 15000, c2: 65, c3: 70, c4: 4.5 } },
    { id: "d5", name: "Gili Trawangan, Lombok", vals: { c1: 25000, c2: 80, c3: 75, c4: 4.6 } },
    { id: "d6", name: "Labuan Bajo, NTT", vals: { c1: 250000, c2: 70, c3: 55, c4: 4.7 } },
  ];

  let state = {
    destinations: [],
    weights: {}, // { c1: 5, c2: 4, c3: 3, c4: 4 }
  };

  function loadState() {
    try {
      const rawDest = localStorage.getItem(STORAGE_KEY_DEST);
      const rawWeights = localStorage.getItem(STORAGE_KEY_WEIGHTS);
      state.destinations = rawDest ? JSON.parse(rawDest) : deepClone(DEFAULT_DESTINATIONS);
      state.weights = rawWeights ? JSON.parse(rawWeights) : Object.fromEntries(CRITERIA.map((c) => [c.id, c.defaultWeight]));
    } catch (err) {
      console.error("Gagal memuat data lokal, memakai data bawaan.", err);
      state.destinations = deepClone(DEFAULT_DESTINATIONS);
      state.weights = Object.fromEntries(CRITERIA.map((c) => [c.id, c.defaultWeight]));
    }
    CRITERIA.forEach((c) => { if (state.weights[c.id] === undefined) state.weights[c.id] = c.defaultWeight; });
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY_DEST, JSON.stringify(state.destinations));
    localStorage.setItem(STORAGE_KEY_WEIGHTS, JSON.stringify(state.weights));
  }

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* =========================================================
     2. PERHITUNGAN TOPSIS
  ========================================================= */

  function computeTopsis() {
    const dests = state.destinations;
    const n = dests.length;
    const m = CRITERIA.length;

    if (n === 0) {
      return { X: [], R: [], w: CRITERIA.map(() => 0), Y: [], Aplus: [], Aminus: [], Dplus: [], Dminus: [], V: [], ranked: [] };
    }

    // Matriks keputusan X
    const X = dests.map((d) => CRITERIA.map((c) => Number(d.vals[c.id]) || 0));

    // Normalisasi bobot mentah agar berjumlah 1
    const rawSum = CRITERIA.reduce((s, c) => s + (Number(state.weights[c.id]) || 0), 0) || 1;
    const w = CRITERIA.map((c) => (Number(state.weights[c.id]) || 0) / rawSum);

    // Matriks ternormalisasi R (normalisasi vektor per kolom)
    const denom = [];
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[i][j] * X[i][j];
      denom[j] = Math.sqrt(s);
    }
    const R = X.map((row) => row.map((v, j) => (denom[j] > 0 ? v / denom[j] : 0)));

    // Matriks ternormalisasi terbobot Y
    const Y = R.map((row) => row.map((v, j) => v * w[j]));

    // Solusi ideal positif (A+) & negatif (A-)
    const Aplus = [], Aminus = [];
    for (let j = 0; j < m; j++) {
      const col = Y.map((row) => row[j]);
      if (CRITERIA[j].type === "benefit") {
        Aplus[j] = Math.max(...col);
        Aminus[j] = Math.min(...col);
      } else {
        Aplus[j] = Math.min(...col);
        Aminus[j] = Math.max(...col);
      }
    }

    // Jarak ke solusi ideal
    const Dplus = Y.map((row) => Math.sqrt(row.reduce((s, v, j) => s + (v - Aplus[j]) ** 2, 0)));
    const Dminus = Y.map((row) => Math.sqrt(row.reduce((s, v, j) => s + (v - Aminus[j]) ** 2, 0)));

    // Nilai preferensi V
    const V = Dplus.map((dp, i) => {
      const total = dp + Dminus[i];
      return total > 0 ? Dminus[i] / total : 0;
    });

    const ranked = dests
      .map((d, i) => ({ dest: d, Dplus: Dplus[i], Dminus: Dminus[i], V: V[i] }))
      .sort((a, b) => b.V - a.V);

    return { X, R, w, Y, Aplus, Aminus, Dplus, Dminus, V, ranked };
  }

  function fmt(num, decimals) {
    if (!isFinite(num)) return "0";
    return num.toFixed(decimals == null ? 4 : decimals);
  }
  function pct(num, decimals) { return fmt(num * 100, decimals == null ? 1 : decimals) + "%"; }
  function idr(num) { return "Rp " + Math.round(num).toLocaleString("id-ID"); }

  /* =========================================================
     3. RENDER
  ========================================================= */

  const els = {};
  function cacheEls() {
    [
      "weight-grid", "weight-total-note",
      "tbody-destinasi", "empty-destinasi",
      "tbl-x", "tbl-r", "tbl-y", "tbl-ideal", "tbl-jarak",
      "chart-hasil", "tbody-ranking",
      "modal-backdrop", "modal-title", "form-destinasi",
      "f-id", "f-nama", "f-tiket", "f-fasilitas", "f-akses", "f-rating", "form-error",
      "modal-close", "modal-cancel", "modal-save", "btn-add-dest",
      "toast",
    ].forEach((id) => (els[id] = document.getElementById(id)));
  }

  function renderAll() {
    const res = computeTopsis();
    renderWeightGrid();
    renderDestinasiTable();
    renderMatrixX(res);
    renderMatrixR(res);
    renderMatrixY(res);
    renderIdeal(res);
    renderJarak(res);
    renderHasil(res);
  }

  /* ---------- Bobot Kriteria ---------- */
  function renderWeightGrid() {
    const rawSum = CRITERIA.reduce((s, c) => s + (Number(state.weights[c.id]) || 0), 0) || 1;
    els["weight-grid"].innerHTML = CRITERIA
      .map((c) => {
        const val = Number(state.weights[c.id]) || 0;
        const w = val / rawSum;
        const badge = c.type === "benefit" ? `<span class="badge badge-benefit">Benefit</span>` : `<span class="badge badge-cost">Cost</span>`;
        return `
          <div class="weight-row" data-crit="${c.id}">
            <span class="weight-row-name">${escapeHtml(c.name)} ${badge}</span>
            <span class="weight-row-value" data-role="value">${val}</span>
            <div class="weight-row-slider">
              <input type="range" min="1" max="5" step="1" value="${val}" data-crit="${c.id}">
              <span class="weight-row-pct" data-role="pct">${pct(w, 1)} dari total</span>
            </div>
          </div>`;
      })
      .join("");
    els["weight-total-note"].innerHTML = `Total bobot mentah: <strong>${rawSum}</strong> &mdash; otomatis dinormalisasi menjadi 100% sebelum dipakai menghitung Matriks Y.`;
  }

  /* ---------- Data Destinasi ---------- */
  function renderDestinasiTable() {
    const tbody = els["tbody-destinasi"];
    els["empty-destinasi"].hidden = state.destinations.length > 0;
    tbody.innerHTML = state.destinations
      .map((d) => `
        <tr>
          <td class="cell-name">${escapeHtml(d.name)}</td>
          <td>${idr(d.vals.c1)}</td>
          <td>${fmt(d.vals.c2, 0)}</td>
          <td>${fmt(d.vals.c3, 0)}</td>
          <td>${fmt(d.vals.c4, 1)}</td>
          <td class="td-actions">
            <span class="row-actions">
              <button class="row-btn edit" data-id="${d.id}" aria-label="Edit ${escapeHtml(d.name)}">
                <svg viewBox="0 0 16 16"><path d="M11.5 2.5l2 2L5 13l-2.7.7.7-2.7L11.5 2.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
              </button>
              <button class="row-btn delete" data-id="${d.id}" aria-label="Hapus ${escapeHtml(d.name)}">
                <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M6 7.5v4M10 7.5v4M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </span>
          </td>
        </tr>`)
      .join("");
  }

  /* ---------- Tabel proses ---------- */
  function critHeaderCells(extra) {
    return CRITERIA.map((c) => `<th>${escapeHtml(c.name)}${extra ? extra(c) : ""}</th>`).join("");
  }

  function renderMatrixX(res) {
    const table = els["tbl-x"];
    table.querySelector("thead tr").innerHTML = "<th>Destinasi</th>" + critHeaderCells((c) => ` <span class="badge ${c.type === "benefit" ? "badge-benefit" : "badge-cost"}">${c.type === "benefit" ? "Benefit" : "Cost"}</span>`);
    table.querySelector("tbody").innerHTML = state.destinations
      .map((d, i) => `<tr><td class="cell-name">${escapeHtml(d.name)}</td>${res.X[i].map((v, j) => `<td>${j === 0 ? idr(v) : fmt(v, j === 3 ? 1 : 0)}</td>`).join("")}</tr>`)
      .join("") || emptyRow();
  }

  function renderMatrixR(res) {
    const table = els["tbl-r"];
    table.querySelector("thead tr").innerHTML = "<th>Destinasi</th>" + critHeaderCells();
    table.querySelector("tbody").innerHTML = state.destinations
      .map((d, i) => `<tr><td class="cell-name">${escapeHtml(d.name)}</td>${res.R[i].map((v) => `<td>${fmt(v, 4)}</td>`).join("")}</tr>`)
      .join("") || emptyRow();
  }

  function renderMatrixY(res) {
    const table = els["tbl-y"];
    table.querySelector("thead tr").innerHTML = "<th>Destinasi</th>" + critHeaderCells((c) => ` <span class="mono-weight">(w=${fmt(res.w[CRITERIA.indexOf(c)], 3)})</span>`);
    table.querySelector("tbody").innerHTML = state.destinations
      .map((d, i) => `<tr><td class="cell-name">${escapeHtml(d.name)}</td>${res.Y[i].map((v) => `<td>${fmt(v, 4)}</td>`).join("")}</tr>`)
      .join("") || emptyRow();
  }

  function renderIdeal(res) {
    const table = els["tbl-ideal"];
    table.querySelector("thead tr").innerHTML = "<th>Solusi</th>" + critHeaderCells();
    const rows = state.destinations.length
      ? `<tr><td class="cell-name">A+ (Ideal Positif)</td>${res.Aplus.map((v) => `<td>${fmt(v, 4)}</td>`).join("")}</tr>
         <tr><td class="cell-name">A&minus; (Ideal Negatif)</td>${res.Aminus.map((v) => `<td>${fmt(v, 4)}</td>`).join("")}</tr>`
      : emptyRow();
    table.querySelector("tbody").innerHTML = rows;
  }

  function renderJarak(res) {
    const table = els["tbl-jarak"];
    table.querySelector("tbody").innerHTML = state.destinations
      .map((d, i) => `<tr><td class="cell-name">${escapeHtml(d.name)}</td><td>${fmt(res.Dplus[i], 4)}</td><td>${fmt(res.Dminus[i], 4)}</td></tr>`)
      .join("") || emptyRow(3);
  }

  function emptyRow(cols) {
    return `<tr><td colspan="${cols || CRITERIA.length + 1}" style="text-align:center;color:var(--ink-faint);">Belum ada data destinasi.</td></tr>`;
  }

  /* ---------- Hasil akhir ---------- */
  function renderHasil(res) {
    renderBarChart(els["chart-hasil"], res.ranked.map((r) => ({ label: r.dest.name, value: r.V })));

    const tbody = els["tbody-ranking"];
    if (res.ranked.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);">Belum ada destinasi untuk diperingkat.</td></tr>`;
      return;
    }
    tbody.innerHTML = res.ranked
      .map((r, i) => `
        <tr class="${i === 0 ? "row-best" : ""}">
          <td>#${i + 1}</td>
          <td class="cell-name">${escapeHtml(r.dest.name)}</td>
          <td>${fmt(r.Dplus, 4)}</td>
          <td>${fmt(r.Dminus, 4)}</td>
          <td><strong>${fmt(r.V, 4)}</strong></td>
        </tr>`)
      .join("");
  }

  function renderBarChart(container, items) {
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = `<p class="chart-empty">Belum ada data untuk ditampilkan.</p>`;
      return;
    }
    const maxV = items[0].value || 1;
    container.innerHTML = items
      .map((it, i) => {
        const p = maxV > 0 ? (it.value / maxV) * 100 : 0;
        return `
          <div class="chart-bar-row${i === 0 ? " first" : ""}">
            <span class="chart-bar-label" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</span>
            <span class="chart-bar-track"><span class="chart-bar-fill" style="width:0%" data-width="${fmt(p, 1)}"></span></span>
            <span class="chart-bar-value">${fmt(it.value, 4)}</span>
          </div>`;
      })
      .join("");
    requestAnimationFrame(() => {
      container.querySelectorAll(".chart-bar-fill").forEach((el) => { el.style.width = el.dataset.width + "%"; });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  /* =========================================================
     4. INTERAKSI
  ========================================================= */

  function initWeightSliders() {
    els["weight-grid"].addEventListener("input", (e) => {
      const slider = e.target.closest('input[type="range"]');
      if (!slider) return;
      state.weights[slider.dataset.crit] = Number(slider.value);
      saveState();
      renderAll();
      // fokus tetap pada slider yang sedang digeser setelah re-render
      const fresh = els["weight-grid"].querySelector(`input[data-crit="${slider.dataset.crit}"]`);
      if (fresh) fresh.focus();
    });
  }

  /* ---------- Modal tambah / edit destinasi ---------- */
  function openModal(dest) {
    els["form-error"].hidden = true;
    if (dest) {
      els["modal-title"].textContent = "Edit Destinasi";
      els["f-id"].value = dest.id;
      els["f-nama"].value = dest.name;
      els["f-tiket"].value = dest.vals.c1;
      els["f-fasilitas"].value = dest.vals.c2;
      els["f-akses"].value = dest.vals.c3;
      els["f-rating"].value = dest.vals.c4;
    } else {
      els["modal-title"].textContent = "Tambah Destinasi";
      els["f-id"].value = "";
      els["form-destinasi"].reset();
    }
    els["modal-backdrop"].hidden = false;
    els["f-nama"].focus();
  }

  function closeModal() { els["modal-backdrop"].hidden = true; }

  function showFormError(msg) {
    els["form-error"].textContent = msg;
    els["form-error"].hidden = false;
  }

  function handleSaveDestinasi() {
    const id = els["f-id"].value;
    const name = els["f-nama"].value.trim();
    const tiket = Number(els["f-tiket"].value);
    const fasilitas = Number(els["f-fasilitas"].value);
    const akses = Number(els["f-akses"].value);
    const rating = Number(els["f-rating"].value);

    if (!name) return showFormError("Nama destinasi tidak boleh kosong.");
    if (els["f-tiket"].value === "" || tiket < 0) return showFormError("Biaya tiket masuk harus diisi angka \u2265 0.");
    if (els["f-fasilitas"].value === "" || fasilitas < 0 || fasilitas > 100) return showFormError("Fasilitas harus diisi angka 0\u2013100.");
    if (els["f-akses"].value === "" || akses < 0 || akses > 100) return showFormError("Aksesibilitas jalan harus diisi angka 0\u2013100.");
    if (els["f-rating"].value === "" || rating < 0 || rating > 5) return showFormError("Rating/popularitas harus diisi angka 0\u20135.");

    const duplicate = state.destinations.some((d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== id);
    if (duplicate) return showFormError("Nama destinasi tersebut sudah ada. Gunakan nama lain.");

    const vals = { c1: tiket, c2: fasilitas, c3: akses, c4: rating };
    if (id) {
      const d = state.destinations.find((d) => d.id === id);
      d.name = name;
      d.vals = vals;
      showToast("Data destinasi diperbarui.");
    } else {
      state.destinations.push({ id: uid("d"), name, vals });
      showToast("Destinasi baru ditambahkan.");
    }
    saveState();
    renderAll();
    closeModal();
  }

  function handleDeleteDestinasi(id) {
    const d = state.destinations.find((d) => d.id === id);
    if (!d) return;
    const ok = window.confirm(`Hapus "${d.name}" dari daftar destinasi?`);
    if (!ok) return;
    state.destinations = state.destinations.filter((d) => d.id !== id);
    saveState();
    renderAll();
    showToast("Destinasi dihapus.");
  }

  function initDestinasiPage() {
    els["btn-add-dest"].addEventListener("click", () => openModal(null));
    els["modal-close"].addEventListener("click", closeModal);
    els["modal-cancel"].addEventListener("click", closeModal);
    els["modal-backdrop"].addEventListener("click", (e) => { if (e.target === els["modal-backdrop"]) closeModal(); });
    els["modal-save"].addEventListener("click", handleSaveDestinasi);
    els["form-destinasi"].addEventListener("submit", (e) => { e.preventDefault(); handleSaveDestinasi(); });

    els["tbody-destinasi"].addEventListener("click", (e) => {
      const editBtn = e.target.closest(".row-btn.edit");
      const delBtn = e.target.closest(".row-btn.delete");
      if (editBtn) {
        const d = state.destinations.find((d) => d.id === editBtn.dataset.id);
        if (d) openModal(d);
      } else if (delBtn) {
        handleDeleteDestinasi(delBtn.dataset.id);
      }
    });
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function showToast(msg) {
    els["toast"].textContent = msg;
    els["toast"].hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els["toast"].hidden = true), 2400);
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    loadState();
    initWeightSliders();
    initDestinasiPage();
    renderAll();
  });
})();
