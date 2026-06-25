/* =========================================================================
   CORE APPLICATION STATE & CONFIGURATION
   ========================================================================= */

// Default Election Configuration (Preloaded for School Elections)
const DEFAULT_CATEGORIES = [
  {
    id: "cat-1",
    name: "Head Boy",
    candidates: [
      { id: "cand-1-1", name: "Aarav Mehta", symbol: "🦁", count: 1 },
      { id: "cand-1-2", name: "Kabir Roy", symbol: "🦅", count: 2 },
      { id: "cand-1-3", name: "Vihaan Sharma", symbol: "🐅", count: 3 }
    ]
  },
  {
    id: "cat-2",
    name: "Head Girl",
    candidates: [
      { id: "cand-2-1", name: "Ananya Iyer", symbol: "🦚", count: 1 },
      { id: "cand-2-2", name: "Diya Nair", symbol: "🦋", count: 2 },
      { id: "cand-2-3", name: "Myra Kapoor", symbol: "🦄", count: 3 }
    ]
  },
  {
    id: "cat-3",
    name: "Event Secretary",
    candidates: [
      { id: "cand-3-1", name: "Arjun Verma", symbol: "🎸", count: 1 },
      { id: "cand-3-2", name: "Sai Patel", symbol: "🎨", count: 2 }
    ]
  },
  {
    id: "cat-4",
    name: "Sports Captain (SP)",
    candidates: [
      { id: "cand-4-1", name: "Rohan Das", symbol: "⚽", count: 1 },
      { id: "cand-4-2", name: "Ishaan Sen", symbol: "🏏", count: 2 }
    ]
  }
];

const EMOJI_POOL = ["🦁", "🐯", "🐨", "🦅", "🦚", "🦋", "🦄", "🎸", "🎨", "⚽", "🏏", "🎯", "🚀", "🌟", "🍎", "🐼", "🦊", "🐬"];
const MAX_CANDIDATES_PER_POSITION = 10;

const state = {
  // Navigation Screens
  activeScreen: "welcome", // welcome, voting, transition, success, login, admin, wizard-positions, wizard-candidates
  
  // Authentication & Configuration
  isLoggedIn: false,
  organizerUsername: "admin",
  electionTitle: "School Election 2026",
  electionOrganization: "School Democratic Council",
  electionOrganizerName: "Admin",
  electionDate: "",
  electionVenue: "",
  
  // Dynamic Configuration Data (Loaded from LocalStorage or Defaults)
  categories: [],
  votes: [],
  googleScriptUrl: "",
  
  // Wizard Temporary Setup Data
  tempWizardPositions: [],
  tempWizardCandidates: {}, // keys: position names, values: candidate array
  
  // Voting Session State
  currentCategoryIndex: 0,
  temporarySessionVotes: [], // Temp votes collected during current voter session
  
  // Transition timer reference
  transitionTimer: null,
  transitionCount: 5,
  transitionNextCategoryIdx: null,
  
  // Hand Gesture AI Detector States
  isManualVote: false, // Fallback manual tap-to-vote toggle
  detectedFingers: 0,
  countdownCandidateNumber: null,
  countdownStart: null,
  countdownDurationMs: 1500, // 1.5 seconds stability lock
  lastHandProcessTime: 0,
  handDetectionInFlight: false,
  lastStableFingerCount: null,
  lastRawFingerCount: null,
  fingerStabilityFrames: 0,
  fingerStabilityRequired: 4,
  
  // MediaPipe / Webcam objects
  webcamStream: null,
  handsDetector: null,
  cameraController: null
};

/* =========================================================================
   SOUND SYNTHESIZER (WEB AUDIO API - OFFLINE COMPATIBLE)
   ========================================================================= */
function playBeep(frequency, duration) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + duration - 0.02);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn("Audio Context blocked or unsupported:", e);
  }
}

// Classic 1-second long high pitch EVM beep
function playEvmVoteBeep() {
  playBeep(1400, 1.0);
}

// Friendly chime when moving screens
function playMenuChime() {
  playBeep(523.25, 0.1); // C5
  setTimeout(() => playBeep(659.25, 0.15), 100); // E5
}

// Single second ticking beep
function playTickChime() {
  playBeep(900, 0.05); // High pitch tick
}

// Error tone
function playErrorTone() {
  playBeep(220, 0.3); // A3
}

/* =========================================================================
   LOCAL DATABASE AND SYNC ENGINE
   ========================================================================= */
function initDatabase() {
  const isConfigured = localStorage.getItem("evm_configured") === "true";
  
  const storedCategories = localStorage.getItem("evm_categories");
  if (storedCategories) {
    state.categories = JSON.parse(storedCategories);
  } else if (isConfigured) {
    state.categories = DEFAULT_CATEGORIES;
    localStorage.setItem("evm_categories", JSON.stringify(DEFAULT_CATEGORIES));
  }
  
  const storedVotes = localStorage.getItem("evm_votes");
  if (storedVotes) {
    state.votes = JSON.parse(storedVotes);
  } else {
    state.votes = [];
    localStorage.setItem("evm_votes", JSON.stringify([]));
  }
  
  const storedElectionConfig = localStorage.getItem("evm_election_config");
  if (storedElectionConfig) {
    const parsed = JSON.parse(storedElectionConfig);
    state.electionTitle = parsed.electionTitle || state.electionTitle;
    state.electionOrganization = parsed.electionOrganization || state.electionOrganization;
    state.electionOrganizerName = parsed.electionOrganizerName || state.electionOrganizerName;
    state.electionDate = parsed.electionDate || state.electionDate;
    state.electionVenue = parsed.electionVenue || state.electionVenue;
  }
  
  // Pre-configured Google Apps Script Web App URL (set by organizer)
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxvJfXzon3d59J3EUPBI-Ho1fzRuii0llZjv4FCoVHOoS0-pV7cHL-pfmD2xa9c50q6/exec";
  if (!localStorage.getItem("evm_sheets_url")) {
    localStorage.setItem("evm_sheets_url", GOOGLE_SCRIPT_URL);
  }
  state.googleScriptUrl = localStorage.getItem("evm_sheets_url") || GOOGLE_SCRIPT_URL;
  
  // Set default admin credentials if not exists
  if (!localStorage.getItem("evm_admin_username")) {
    localStorage.setItem("evm_admin_username", "admin");
  }
  if (!localStorage.getItem("evm_admin_password")) {
    localStorage.setItem("evm_admin_password", "admin");
  }

  populateElectionRegistrationFields();
  updateElectionSummary();
  updateSyncStatusUI();

  return isConfigured;
}

function updateElectionSummary() {
  const totals = {
    positions: state.categories.length,
    participants: state.categories.reduce((sum, category) => sum + category.candidates.length, 0)
  };

  const welcomeBadge = document.getElementById("welcome-election-badge");
  const welcomePositions = document.getElementById("welcome-positions-count");
  const welcomeParticipants = document.getElementById("welcome-participants-count");
  const setupPositions = document.getElementById("setup-total-positions");
  const setupParticipants = document.getElementById("setup-total-participants");

  if (welcomeBadge) {
    const safeTitle = (state.electionTitle || "School Election 2026").toUpperCase();
    welcomeBadge.textContent = `✨ ${safeTitle} ✨`;
  }

  if (welcomePositions) welcomePositions.textContent = `Positions: ${totals.positions}`;
  if (welcomeParticipants) welcomeParticipants.textContent = `Participants: ${totals.participants}`;
  if (setupPositions) setupPositions.textContent = totals.positions;
  if (setupParticipants) setupParticipants.textContent = totals.participants;
}

function updateSyncStatusUI() {
  const dot = document.getElementById("sync-indicator-dot");
  const txt = document.getElementById("sync-indicator-text");
  
  const total = state.votes.length;
  const pending = state.votes.filter(v => v.status === "pending").length;
  const synced = total - pending;
  
  // Admin stats card elements
  const statTotal = document.getElementById("stat-total-votes");
  const statSynced = document.getElementById("stat-synced-votes");
  const statPending = document.getElementById("stat-pending-votes");
  const syncIcon = document.getElementById("stat-sync-icon");
  
  if (statTotal) statTotal.textContent = total;
  if (statSynced) statSynced.textContent = synced;
  if (statPending) statPending.textContent = pending;
  
  if (!localStorage.getItem("evm_configured") || localStorage.getItem("evm_configured") !== "true") {
    dot.className = "status-dot offline";
    txt.textContent = "EVM Unconfigured";
    if (syncIcon) syncIcon.textContent = "⚠️";
    return;
  }
  
  if (pending > 0) {
    dot.className = "status-dot offline";
    txt.textContent = `Offline Mode: ${pending} votes pending sync`;
    if (syncIcon) syncIcon.textContent = "⚠️";
  } else {
    dot.className = "status-dot online";
    txt.textContent = total > 0 ? `Cloud Synced (${total} votes)` : "Online & Ready";
    if (syncIcon) syncIcon.textContent = "☁️";
  }
}

// Background sync function
async function syncVotesWithSheets() {
  if (!navigator.onLine || !state.googleScriptUrl) {
    updateSyncStatusUI();
    return false;
  }
  
  const pendingVotes = state.votes.filter(v => v.status === "pending");
  if (pendingVotes.length === 0) {
    updateSyncStatusUI();
    return true;
  }
  
  try {
    const response = await fetch(state.googleScriptUrl, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(pendingVotes)
    });
    
    const result = await response.json();
    if (result && result.status === "success") {
      const syncedIds = pendingVotes.map(v => v.id);
      state.votes.forEach(v => {
        if (syncedIds.includes(v.id)) {
          v.status = "synced";
        }
      });
      
      localStorage.setItem("evm_votes", JSON.stringify(state.votes));
      updateSyncStatusUI();
      renderLogsTable();
      return true;
    }
  } catch (error) {
    console.warn("Sync failed. Stored locally. Error:", error);
  }
  updateSyncStatusUI();
  return false;
}

window.addEventListener("online", () => {
  syncVotesWithSheets();
});

/* =========================================================================
   SPA SCREEN NAVIGATION
   ========================================================================= */
function navigateTo(screenId) {
  playMenuChime();
  state.activeScreen = screenId;
  
  // Hide all screens
  document.querySelectorAll(".screen").forEach(scr => scr.classList.add("hide"));
  
  // Show active screen
  const activeScrEl = document.getElementById(`screen-${screenId}`);
  if (activeScrEl) {
    activeScrEl.classList.remove("hide");
  }
  
  // Update status shortcut buttons
  const adminLoginBtn = document.getElementById("admin-login-btn");
  const adminDashBtn = document.getElementById("admin-dashboard-btn");
  
  if (screenId === "admin" || screenId === "login" || screenId.startsWith("wizard")) {
    adminLoginBtn.classList.add("hide");
    adminDashBtn.classList.add("hide");
    stopWebcam();
  } else {
    if (state.isLoggedIn) {
      adminLoginBtn.classList.add("hide");
      adminDashBtn.classList.remove("hide");
    } else {
      adminLoginBtn.classList.remove("hide");
      adminDashBtn.classList.add("hide");
    }
  }
  
  // Special screen activations
  if (screenId === "welcome") {
    stopWebcam();
    state.temporarySessionVotes = [];
  } else if (screenId === "voting") {
    startVotingFlow();
  } else if (screenId === "success") {
    stopWebcam();
    triggerCelebration();
  } else if (screenId === "transition") {
    // Keep camera running if active but stop detector loops to transition smoothly
  }
}

/* =========================================================================
   ORGANIZER SECURITY PORTAL (LOGIN & REGISTRATION)
   ========================================================================= */
// Switch Tabs
document.getElementById("tab-toggle-register").addEventListener("click", () => {
  document.getElementById("tab-toggle-register").classList.add("active");
  document.getElementById("tab-toggle-login").classList.remove("active");
  document.getElementById("register-form").classList.remove("hide");
  document.getElementById("login-form").classList.add("hide");
});

document.getElementById("tab-toggle-login").addEventListener("click", () => {
  document.getElementById("tab-toggle-login").classList.add("active");
  document.getElementById("tab-toggle-register").classList.remove("active");
  document.getElementById("login-form").classList.remove("hide");
  document.getElementById("register-form").classList.add("hide");
});

// Registration Form Handler
document.getElementById("register-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  const title = document.getElementById("reg-election-title-init").value.trim();
  const org = document.getElementById("reg-election-org-init").value.trim();
  const date = document.getElementById("reg-election-date-init").value;
  const venue = document.getElementById("reg-election-venue-init").value.trim();
  
  if (!username || !password || !title || !org || !date || !venue) {
    document.getElementById("register-error").classList.remove("hide");
    return;
  }
  
  document.getElementById("register-error").classList.add("hide");
  
  // Save credentials & metadata
  state.organizerUsername = username;
  state.electionTitle = title;
  state.electionOrganization = org;
  state.electionDate = date;
  state.electionVenue = venue;
  state.isLoggedIn = true;
  document.getElementById("active-organizer-lbl").textContent = `Logged in as ${username}`;
  
  localStorage.setItem("evm_admin_username", username);
  localStorage.setItem("evm_admin_password", password);
  localStorage.setItem("evm_election_config", JSON.stringify({
    electionTitle: title,
    electionOrganization: org,
    electionOrganizerName: username,
    electionDate: date,
    electionVenue: venue
  }));
  
  // Initialize wizard positions defaults
  state.tempWizardPositions = ["Head Boy", "Head Girl", "Event Secretary", "Sports Captain"];
  
  renderWizardPositions();
  navigateTo("wizard-positions");
});

// Login Form Handler
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value;
  const savedUser = localStorage.getItem("evm_admin_username") || "admin";
  const correctPass = localStorage.getItem("evm_admin_password") || "admin";
  
  if (user === savedUser && pass === correctPass) {
    state.isLoggedIn = true;
    state.organizerUsername = user;
    document.getElementById("login-error").classList.add("hide");
    document.getElementById("active-organizer-lbl").textContent = `Logged in as ${user}`;
    
    syncVotesWithSheets();
    
    // If EVM is already configured, go straight to Admin Dashboard results, otherwise go to setup wizard
    if (localStorage.getItem("evm_configured") === "true") {
      switchAdminTab("tab-results");
      navigateTo("admin");
    } else {
      state.tempWizardPositions = ["Head Boy", "Head Girl", "Event Secretary", "Sports Captain"];
      renderWizardPositions();
      navigateTo("wizard-positions");
    }
  } else {
    playErrorTone();
    document.getElementById("login-error").classList.remove("hide");
  }
});

document.getElementById("admin-logout-btn").addEventListener("click", () => {
  state.isLoggedIn = false;
  navigateTo("welcome");
});

document.getElementById("admin-reset-btn").addEventListener("click", () => {
  if (confirm("⚠️ This will clear all stored vote data from this device. Continue?")) {
    state.votes = [];
    localStorage.setItem("evm_votes", JSON.stringify([]));
    updateSyncStatusUI();
    renderLogsTable();
    alert("Vote data reset successfully.");
  }
});

document.getElementById("admin-login-btn").addEventListener("click", () => {
  // If registered, show login tab active by default
  const hasConfig = localStorage.getItem("evm_configured") === "true";
  if (hasConfig) {
    document.getElementById("tab-toggle-login").click();
  } else {
    document.getElementById("tab-toggle-register").click();
  }
  navigateTo("login");
});

document.getElementById("admin-dashboard-btn").addEventListener("click", () => {
  if (state.isLoggedIn) navigateTo("admin");
});

document.getElementById("back-to-vote-btn").addEventListener("click", () => {
  if (localStorage.getItem("evm_configured") === "true") {
    navigateTo("welcome");
  } else {
    alert("Please register or set up the election configuration first!");
  }
});

/* =========================================================================
   WIZARD FLOW INTERACTION & MANAGEMENT
   ========================================================================= */
// Step 1: Positions Render
function renderWizardPositions() {
  const container = document.getElementById("wizard-positions-inputs-container");
  container.innerHTML = "";
  
  state.tempWizardPositions.forEach((pos, idx) => {
    const row = document.createElement("div");
    row.className = "wizard-position-row mt-4";
    row.innerHTML = `
      <input type="text" value="${pos}" placeholder="e.g. Head Boy" onchange="updateWizardPositionName(${idx}, this.value)">
      <button class="btn-delete-row" onclick="deleteWizardPosition(${idx})">×</button>
    `;
    container.appendChild(row);
  });
}

window.updateWizardPositionName = (idx, value) => {
  state.tempWizardPositions[idx] = value.trim();
};

window.deleteWizardPosition = (idx) => {
  state.tempWizardPositions.splice(idx, 1);
  renderWizardPositions();
};

document.getElementById("wizard-add-position-btn").addEventListener("click", () => {
  state.tempWizardPositions.push("");
  renderWizardPositions();
});

document.getElementById("wizard-positions-back-btn").addEventListener("click", () => {
  navigateTo("login");
});

// Transition Step 1 -> Step 2
document.getElementById("wizard-positions-next-btn").addEventListener("click", () => {
  // Filter empty positions
  state.tempWizardPositions = state.tempWizardPositions.filter(p => p.length > 0);
  
  if (state.tempWizardPositions.length === 0) {
    alert("Please enter at least one election position!");
    return;
  }
  
  // Seed temp candidates if not already present
  state.tempWizardPositions.forEach(pos => {
    if (!state.tempWizardCandidates[pos] || state.tempWizardCandidates[pos].length === 0) {
      state.tempWizardCandidates[pos] = [
        { name: "Candidate 1", symbol: "🦁" },
        { name: "Candidate 2", symbol: "🦅" }
      ];
    }
  });
  
  renderWizardCandidates();
  navigateTo("wizard-candidates");
});

// Step 2: Candidates Render
function renderWizardCandidates() {
  const container = document.getElementById("wizard-candidates-cards-container");
  container.innerHTML = "";
  
  state.tempWizardPositions.forEach(pos => {
    const card = document.createElement("div");
    card.className = "wizard-cat-setup-card animate-scale-up";
    
    let candsHTML = "";
    const list = state.tempWizardCandidates[pos] || [];
    
    list.forEach((cand, candIdx) => {
      candsHTML += `
        <div class="candidate-setup-row mt-4">
          <div class="candidate-number-badge">${candIdx + 1}</div>
          <div class="candidate-photo-preview ${cand.photo ? 'has-photo' : ''}">
            ${cand.photo ? `<img src="${cand.photo}" alt="${cand.name || 'Candidate'} preview">` : `<span>${cand.symbol}</span>`}
          </div>
          <input type="text" value="${cand.name}" placeholder="Name" onchange="updateWizardCandidateName('${pos}', ${candIdx}, this.value)">
          <input type="file" accept="image/*" onchange="updateWizardCandidatePhotoFile('${pos}', ${candIdx}, this)">
          <select onchange="updateWizardCandidateSymbol('${pos}', ${candIdx}, this.value)">
            ${EMOJI_POOL.map(emoji => `<option value="${emoji}" ${emoji === cand.symbol ? 'selected' : ''}>${emoji}</option>`).join('')}
          </select>
          <button class="btn-delete-row" onclick="deleteWizardCandidate('${pos}', ${candIdx})">×</button>
        </div>
      `;
    });
    
    card.innerHTML = `
      <h4>${pos}</h4>
      <div class="wizard-cands-list-setup">
        ${candsHTML}
      </div>
      <button class="btn btn-sm btn-glass mt-4" onclick="addWizardCandidate('${pos}')" ${list.length >= MAX_CANDIDATES_PER_POSITION ? 'disabled' : ''}>+ Add Candidate (Max ${MAX_CANDIDATES_PER_POSITION})</button>
    `;
    container.appendChild(card);
  });
}

window.updateWizardCandidateName = (pos, candIdx, value) => {
  if (state.tempWizardCandidates[pos]) {
    state.tempWizardCandidates[pos][candIdx].name = value.trim();
  }
};

window.updateWizardCandidateSymbol = (pos, candIdx, value) => {
  if (state.tempWizardCandidates[pos]) {
    state.tempWizardCandidates[pos][candIdx].symbol = value;
  }
};

window.updateWizardCandidatePhotoFile = (pos, candIdx, input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Please choose a valid image file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (state.tempWizardCandidates[pos]) {
      state.tempWizardCandidates[pos][candIdx].photo = reader.result;
      renderWizardCandidates();
    }
  };
  reader.readAsDataURL(file);
};

window.addWizardCandidate = (pos) => {
  if (!state.tempWizardCandidates[pos]) state.tempWizardCandidates[pos] = [];
  const list = state.tempWizardCandidates[pos];
  if (list.length >= MAX_CANDIDATES_PER_POSITION) return;
  
  const used = list.map(c => c.symbol);
  const nextSym = EMOJI_POOL.find(e => !used.includes(e)) || "👤";
  
  list.push({ name: `Candidate ${list.length + 1}`, symbol: nextSym, photo: "" });
  renderWizardCandidates();
};

window.deleteWizardCandidate = (pos, candIdx) => {
  if (state.tempWizardCandidates[pos]) {
    state.tempWizardCandidates[pos].splice(candIdx, 1);
    renderWizardCandidates();
  }
};

document.getElementById("wizard-candidates-back-btn").addEventListener("click", () => {
  renderWizardPositions();
  navigateTo("wizard-positions");
});

// Final Launch Election
document.getElementById("wizard-launch-btn").addEventListener("click", () => {
  const finalCategories = [];
  
  // Validation
  for (let i = 0; i < state.tempWizardPositions.length; i++) {
    const pos = state.tempWizardPositions[i];
    const cands = state.tempWizardCandidates[pos] || [];
    
    // Filter out candidates with empty names
    const filteredCands = cands.filter(c => c.name.length > 0);
    
    if (filteredCands.length === 0) {
      alert(`Please register at least one candidate for position: ${pos}`);
      return;
    }
    
    finalCategories.push({
      id: `cat-${Date.now()}-${i}`,
      name: pos,
      candidates: filteredCands.map((c, idx) => ({
        id: `cand-${Date.now()}-${i}-${idx}`,
        name: c.name,
        symbol: c.symbol,
        photo: c.photo || "",
        count: idx + 1
      }))
    });
  }
  
  // Save State
  state.categories = finalCategories;
  localStorage.setItem("evm_categories", JSON.stringify(finalCategories));
  localStorage.setItem("evm_configured", "true");
  
  // Trigger config save just in case
  localStorage.setItem("evm_election_config", JSON.stringify({
    electionTitle: state.electionTitle,
    electionOrganization: state.electionOrganization,
    electionOrganizerName: state.organizerUsername,
    electionDate: state.electionDate,
    electionVenue: state.electionVenue
  }));
  
  updateElectionSummary();
  updateSyncStatusUI();
  navigateTo("welcome");
});

/* =========================================================================
   ADMIN NAVIGATION TABS & DATA RENDERING
   ========================================================================= */
function switchAdminTab(tabId) {
  document.querySelectorAll(".nav-item").forEach(btn => {
    if (btn.getAttribute("data-tab") === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  
  document.querySelectorAll(".tab-content").forEach(tab => {
    if (tab.id === tabId) {
      tab.classList.remove("hide");
    } else {
      tab.classList.add("hide");
    }
  });
  
  if (tabId === "tab-results") {
    renderResults();
  } else if (tabId === "tab-setup") {
    renderSetupEditor();
  } else if (tabId === "tab-logs") {
    renderLogsTable();
  } else if (tabId === "tab-settings") {
    loadSettings();
  }
}

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", (e) => {
    switchAdminTab(e.target.getAttribute("data-tab"));
  });
});

/* =========================================================================
   TAB CONTENT 1: RESULTS DASHBOARD
   ========================================================================= */
function renderResults() {
  const container = document.getElementById("results-categories-container");
  container.innerHTML = "";
  
  if (state.categories.length === 0) {
    container.innerHTML = `<p class="muted-text">No categories configured. Setup categories in the setup tab!</p>`;
    return;
  }
  
  state.categories.forEach(category => {
    const catVotes = state.votes.filter(v => v.category === category.name);
    const totalCatVotes = catVotes.length;
    
    const candidateTallies = category.candidates.map(cand => {
      const votesCount = catVotes.filter(v => v.candidate === cand.name).length;
      return { ...cand, votes: votesCount };
    });
    
    let winner = null;
    let isTie = false;
    if (totalCatVotes > 0) {
      candidateTallies.sort((a, b) => b.votes - a.votes);
      if (candidateTallies.length > 1 && candidateTallies[0].votes === candidateTallies[1].votes) {
        isTie = true;
      }
      winner = candidateTallies[0];
    }
    
    const card = document.createElement("div");
    card.className = "results-category-card";
    
    let headerBadgeHTML = "";
    if (winner && !isTie) {
      headerBadgeHTML = `<span class="winner-badge">🏆 Winner: ${winner.name} (${winner.votes} votes)</span>`;
    } else if (winner && isTie) {
      headerBadgeHTML = `<span class="winner-badge">🤝 Tie Leader: ${winner.name}</span>`;
    } else {
      headerBadgeHTML = `<span class="winner-badge" style="background:#cbd5e1;color:#475569;border-color:#94a3b8;">No Votes Cast</span>`;
    }
    
    card.innerHTML = `
      <div class="category-card-header">
        <h3>${category.name}</h3>
        ${headerBadgeHTML}
      </div>
      <div class="chart-bars-list">
        ${category.candidates.map(cand => {
          const tally = catVotes.filter(v => v.candidate === cand.name).length;
          const pct = totalCatVotes > 0 ? Math.round((tally / totalCatVotes) * 100) : 0;
          const isCandWinner = winner && !isTie && winner.id === cand.id;
          
          return `
            <div class="chart-row">
              <div class="candidate-result-info">
                <div class="candidate-result-avatar ${cand.photo ? 'has-photo' : ''}">
                  ${cand.photo ? `<img src="${cand.photo}" alt="${cand.name}">` : `<span>${cand.symbol}</span>`}
                </div>
                <span class="candidate-name-label">${cand.name}</span>
              </div>
              <div class="bar-wrapper">
                <div class="bar-fill ${isCandWinner ? 'winner' : ''}" style="width: ${pct}%"></div>
              </div>
              <span class="bar-value-label">${tally} (${pct}%)</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.appendChild(card);
  });
  
  updateSyncStatusUI();
}

/* =========================================================================
   TAB CONTENT 2: SETUP EDITOR (ADMIN VIEW)
   ========================================================================= */
function renderSetupEditor() {
  const container = document.getElementById("categories-editor-container");
  container.innerHTML = "";
  
  updateElectionSummary();

  state.categories.forEach((category, catIdx) => {
    const card = document.createElement("div");
    card.className = "setup-category-card animate-scale-up";
    
    card.innerHTML = `
      <div class="setup-category-header">
        <input type="text" class="category-name-input" value="${category.name}" data-idx="${catIdx}" placeholder="Category Name">
        <button class="btn btn-sm btn-danger btn-outline" onclick="deleteCategory(${catIdx})">🗑️ Delete Category</button>
      </div>
      <div class="candidates-list-setup" id="cand-list-setup-${catIdx}"></div>
      <button class="btn btn-sm btn-glass" onclick="addCandidateToCategory(${catIdx})" ${category.candidates.length >= MAX_CANDIDATES_PER_POSITION ? 'disabled' : ''}>+ Add Participant (Max ${MAX_CANDIDATES_PER_POSITION})</button>
    `;
    container.appendChild(card);
    renderCandidatesSetupRows(catIdx);
  });
  
  document.querySelectorAll(".category-name-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const idx = parseInt(e.target.getAttribute("data-idx"));
      state.categories[idx].name = e.target.value.trim() || `Category ${idx+1}`;
      saveCategoriesState();
    });
  });
}

function renderCandidatesSetupRows(catIdx) {
  const container = document.getElementById(`cand-list-setup-${catIdx}`);
  container.innerHTML = "";
  
  const category = state.categories[catIdx];
  category.candidates.forEach((cand, candIdx) => {
    const row = document.createElement("div");
    row.className = "candidate-setup-row";
    cand.count = candIdx + 1;
    
    row.innerHTML = `
      <div class="candidate-number-badge">${cand.count}</div>
      <div class="candidate-photo-preview ${cand.photo ? 'has-photo' : ''}">
        ${cand.photo ? `<img src="${cand.photo}" alt="${cand.name || 'Participant'} preview">` : `<span>${cand.symbol}</span>`}
      </div>
      <input type="text" value="${cand.name}" placeholder="Participant Name" onchange="updateCandidateName(${catIdx}, ${candIdx}, this.value)">
      <input type="file" accept="image/*" onchange="updateCandidatePhotoFile(${catIdx}, ${candIdx}, this)">
      <select onchange="updateCandidateSymbol(${catIdx}, ${candIdx}, this.value)">
        ${EMOJI_POOL.map(emoji => `<option value="${emoji}" ${emoji === cand.symbol ? 'selected' : ''}>${emoji}</option>`).join('')}
      </select>
      <button class="btn-delete-row" onclick="deleteCandidate(${catIdx}, ${candIdx})">×</button>
    `;
    container.appendChild(row);
  });
}

window.updateCandidateName = (catIdx, candIdx, value) => {
  state.categories[catIdx].candidates[candIdx].name = value.trim() || `Candidate ${candIdx+1}`;
  saveCategoriesState();
};

window.updateCandidateSymbol = (catIdx, candIdx, value) => {
  state.categories[catIdx].candidates[candIdx].symbol = value;
  saveCategoriesState();
};

window.updateCandidatePhotoFile = (catIdx, candIdx, input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Please choose a valid image file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.categories[catIdx].candidates[candIdx].photo = reader.result;
    saveCategoriesState();
    renderSetupEditor();
  };
  reader.readAsDataURL(file);
};

window.addCandidateToCategory = (catIdx) => {
  const cat = state.categories[catIdx];
  if (cat.candidates.length >= MAX_CANDIDATES_PER_POSITION) return;
  
  const usedSymbols = cat.candidates.map(c => c.symbol);
  const nextSymbol = EMOJI_POOL.find(emoji => !usedSymbols.includes(emoji)) || "👤";
  
  cat.candidates.push({
    id: `cand-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    name: `New Participant`,
    symbol: nextSymbol,
    photo: "",
    count: cat.candidates.length + 1
  });
  
  saveCategoriesState();
  renderSetupEditor();
};

window.deleteCandidate = (catIdx, candIdx) => {
  state.categories[catIdx].candidates.splice(candIdx, 1);
  state.categories[catIdx].candidates.forEach((c, i) => c.count = i + 1);
  saveCategoriesState();
  renderSetupEditor();
};

window.deleteCategory = (catIdx) => {
  if (confirm("Are you sure you want to delete this category? All configuration will be lost.")) {
    state.categories.splice(catIdx, 1);
    saveCategoriesState();
    renderSetupEditor();
  }
};

document.getElementById("add-category-btn").addEventListener("click", () => {
  state.categories.push({
    id: `cat-${Date.now()}`,
    name: `New Category`,
    candidates: [
      { id: `cand-${Date.now()}-1`, name: "Participant 1", symbol: "🦁", count: 1 }
    ]
  });
  saveCategoriesState();
  renderSetupEditor();
});

function saveCategoriesState() {
  localStorage.setItem("evm_categories", JSON.stringify(state.categories));
  updateElectionSummary();
}

function populateElectionRegistrationFields() {
  const title = document.getElementById("reg-election-title");
  const org = document.getElementById("reg-election-organization");
  const organizer = document.getElementById("reg-election-organizer");
  const date = document.getElementById("reg-election-date");
  const venue = document.getElementById("reg-election-venue");

  if (title) title.value = state.electionTitle || "";
  if (org) org.value = state.electionOrganization || "";
  if (organizer) organizer.value = state.electionOrganizerName || "";
  if (date) date.value = state.electionDate || "";
  if (venue) venue.value = state.electionVenue || "";
}

function saveElectionRegistration() {
  const title = document.getElementById("reg-election-title");
  const org = document.getElementById("reg-election-organization");
  const organizer = document.getElementById("reg-election-organizer");
  const date = document.getElementById("reg-election-date");
  const venue = document.getElementById("reg-election-venue");

  state.electionTitle = title && title.value.trim() ? title.value.trim() : state.electionTitle;
  state.electionOrganization = org && org.value.trim() ? org.value.trim() : state.electionOrganization;
  state.electionOrganizerName = organizer && organizer.value.trim() ? organizer.value.trim() : state.electionOrganizerName;
  state.electionDate = date ? date.value : state.electionDate;
  state.electionVenue = venue && venue.value.trim() ? venue.value.trim() : state.electionVenue;

  state.organizerUsername = state.electionOrganizerName || state.organizerUsername;

  localStorage.setItem("evm_election_config", JSON.stringify({
    electionTitle: state.electionTitle,
    electionOrganization: state.electionOrganization,
    electionOrganizerName: state.electionOrganizerName,
    electionDate: state.electionDate,
    electionVenue: state.electionVenue
  }));

  populateElectionRegistrationFields();
  updateElectionSummary();
}

document.getElementById("save-election-registration-btn").addEventListener("click", saveElectionRegistration);

/* =========================================================================
   TAB CONTENT 3: LOGS & SYNCHRONIZATION
   ========================================================================= */
function renderLogsTable() {
  const tbody = document.getElementById("votes-log-table-body");
  tbody.innerHTML = "";
  
  const sortedVotes = [...state.votes].reverse();
  
  if (sortedVotes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;">No vote records found. Start voting to collect records!</td></tr>`;
    return;
  }
  
  sortedVotes.forEach(vote => {
    const row = document.createElement("tr");
    
    const shortId = vote.id ? vote.id.substring(0, 8) + "..." : "N/A";
    const statusBadge = vote.status === "synced" 
      ? `<span class="badge-status synced">Cloud Synced</span>`
      : `<span class="badge-status pending">Offline Pending</span>`;
    
    const formattedDate = new Date(vote.timestamp).toLocaleString();
    
    row.innerHTML = `
      <td style="font-family:monospace;font-size:0.85rem;">${shortId}</td>
      <td>${formattedDate}</td>
      <td>${vote.category}</td>
      <td>${vote.candidate}</td>
      <td>${vote.electionOrganizerName || vote.organizer || "Admin"}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(row);
  });
}

document.getElementById("clear-database-btn").addEventListener("click", () => {
  if (confirm("⚠️ WARNING: This will permanently delete ALL recorded votes from this local machine. This action cannot be undone. Are you sure?")) {
    state.votes = [];
    localStorage.setItem("evm_votes", JSON.stringify([]));
    updateSyncStatusUI();
    renderLogsTable();
    alert("Database wiped successfully.");
  }
});

document.getElementById("sync-now-btn").addEventListener("click", async () => {
  const syncBtn = document.getElementById("sync-now-btn");
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing...";
  
  if (!state.googleScriptUrl) {
    playErrorTone();
    alert("Please set a Google Apps Script Web App URL in settings before syncing.");
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync Now";
    return;
  }
  
  const success = await syncVotesWithSheets();
  syncBtn.disabled = false;
  syncBtn.textContent = "Sync Now";
  
  if (success) {
    alert("Sync complete! Stored votes have been pushed to Google Sheet.");
  } else {
    playErrorTone();
    alert("Sync failed. Check network connection or Google Apps Script Web App URL.");
  }
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
  if (state.votes.length === 0) {
    alert("No records to export.");
    return;
  }
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Vote ID,Date & Time,Election Title,Organization,Organizer,Election Date,Venue,Election Category,Candidate Voted,Sync Status\n";
  
  state.votes.forEach(vote => {
    const row = [
      `"${vote.id}"`,
      `"${new Date(vote.timestamp).toLocaleString()}"`,
      `"${vote.electionTitle || ""}"`,
      `"${vote.electionOrganization || ""}"`,
      `"${vote.electionOrganizerName || vote.organizer || "System"}"`,
      `"${vote.electionDate || ""}"`,
      `"${vote.electionVenue || ""}"`,
      `"${vote.category}"`,
      `"${vote.candidate}"`,
      `"${vote.status}"`
    ].join(",");
    csvContent += row + "\n";
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `EVM_Votes_Backup_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/* =========================================================================
   TAB CONTENT 4: SYSTEM SETTINGS
   ========================================================================= */
function loadSettings() {
  document.getElementById("settings-sheets-url").value = state.googleScriptUrl;
  document.getElementById("settings-current-password").value = "";
  document.getElementById("settings-new-password").value = "";
  document.getElementById("test-connection-status").textContent = "";
  document.getElementById("save-password-status").textContent = "";
}

document.getElementById("save-sheets-url-btn").addEventListener("click", () => {
  const url = document.getElementById("settings-sheets-url").value.trim();
  state.googleScriptUrl = url;
  localStorage.setItem("evm_sheets_url", url);
  alert("Google Sheets Integration URL saved!");
  updateSyncStatusUI();
});

document.getElementById("test-sheets-connection-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("test-connection-status");
  const url = document.getElementById("settings-sheets-url").value.trim();
  
  if (!url) {
    statusEl.className = "test-status error";
    statusEl.textContent = "Error: Paste URL first";
    return;
  }
  
  statusEl.className = "test-status";
  statusEl.textContent = "Testing...";
  
  try {
    const res = await fetch(url, { method: "GET", mode: "cors" });
    const text = await res.text();
    if (text.includes("Web App") || text.includes("active") || res.ok) {
      statusEl.className = "test-status success";
      statusEl.textContent = "Success: Endpoint reachable!";
    } else {
      statusEl.className = "test-status error";
      statusEl.textContent = "Error: Invalid endpoint response";
    }
  } catch (err) {
    try {
      const testPost = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify([{ id: "test-conn", timestamp: new Date().toISOString(), category: "TEST", candidate: "TEST", organizer: "TEST" }])
      });
      const result = await testPost.json();
      if (result && result.status === "success") {
        statusEl.className = "test-status success";
        statusEl.textContent = "Success: Verified via Test Post!";
        return;
      }
    } catch (postErr) {
      console.warn("POST test error:", postErr);
    }
    statusEl.className = "test-status error";
    statusEl.textContent = "Error: Connection failed";
  }
});

document.getElementById("save-password-btn").addEventListener("click", () => {
  const currentPass = document.getElementById("settings-current-password").value;
  const newPass = document.getElementById("settings-new-password").value;
  const statusEl = document.getElementById("save-password-status");
  
  const savedPass = localStorage.getItem("evm_admin_password") || "admin";
  
  if (currentPass !== savedPass) {
    playErrorTone();
    statusEl.className = "test-status error";
    statusEl.textContent = "Current password incorrect.";
    return;
  }
  
  if (newPass.length < 4) {
    playErrorTone();
    statusEl.className = "test-status error";
    statusEl.textContent = "Password must be at least 4 characters.";
    return;
  }
  
  localStorage.setItem("evm_admin_password", newPass);
  statusEl.className = "test-status success";
  statusEl.textContent = "Password updated successfully!";
  document.getElementById("settings-current-password").value = "";
  document.getElementById("settings-new-password").value = "";
});

document.getElementById("start-voting-mode-btn").addEventListener("click", () => {
  navigateTo("welcome");
});

/* =========================================================================
   VOTER WELCOME & STEP SEQUENCE
   ========================================================================= */
document.getElementById("begin-voting-btn").addEventListener("click", () => {
  if (state.categories.length === 0) {
    alert("No positions configured! Logging in to Setup.");
    navigateTo("login");
    return;
  }
  state.currentCategoryIndex = 0;
  state.temporarySessionVotes = [];
  navigateTo("voting");
});

function startVotingFlow() {
  renderActiveCategoryScreen();
  if (!state.isManualVote) {
    initWebcamAndHandTracking();
  }
}

function renderActiveCategoryScreen() {
  const category = state.categories[state.currentCategoryIndex];
  
  document.getElementById("voting-category-name").textContent = category.name.toUpperCase();
  document.getElementById("voting-progress-fraction").textContent = `Category ${state.currentCategoryIndex + 1} of ${state.categories.length}`;
  
  const grid = document.getElementById("voting-candidates-grid");
  grid.innerHTML = "";
  
  category.candidates.forEach((cand) => {
    const card = document.createElement("div");
    card.className = "candidate-vote-card animate-scale-up";
    card.setAttribute("id", `cand-card-${cand.count}`);
    card.setAttribute("data-cand-name", cand.name);
    card.setAttribute("data-count", cand.count);
    
    const initials = cand.name
      .split(" ")
      .map(part => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const photoUrl = cand.photo || "";
    
    card.innerHTML = `
      <span class="hand-guide-badge">� Vote with ${cand.count} ${cand.count === 1 ? 'finger' : 'fingers'}</span>
      <div class="candidate-photo-box ${photoUrl ? '' : 'placeholder'}">
        ${photoUrl
          ? `<img src="${photoUrl}" alt="${cand.name}" loading="lazy">`
          : `<span>${initials || "ST"}</span>`}
      </div>
      <h3>${cand.name}</h3>
      <span class="finger-num">${cand.count} ${cand.count === 1 ? 'Finger' : 'Fingers'}</span>
      
      <div class="card-progress-overlay">
        <svg class="card-progress-circle" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" class="bg"></circle>
          <circle cx="50" cy="50" r="42" class="fg" id="card-progress-ring-${cand.count}"></circle>
        </svg>
      </div>
    `;
    
    card.addEventListener("click", () => {
      if (state.isManualVote) {
        castVote(cand.name);
      }
    });
    
    grid.appendChild(card);
  });
  
  resetCountdownState();
}

/* =========================================================================
   AI CAMERA & MEDIAPIPE HAND GESTURE RECOGNITION
   ========================================================================= */
async function initWebcamAndHandTracking() {
  const video = document.getElementById("webcam-video");
  const canvas = document.getElementById("camera-overlay-canvas");
  const statusLabel = document.getElementById("camera-status-label");
  const indicator = document.getElementById("camera-status-indicator");
  
  statusLabel.textContent = "Requesting camera permissions...";
  indicator.querySelector("span").className = "pulse-red-dot";
  
  try {
    state.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 480 },
        height: { ideal: 360 }
      }
    });
    video.srcObject = state.webcamStream;
    
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
    
    statusLabel.textContent = "Loading hand models...";
    
    if (typeof Hands === "undefined") {
      throw new Error("MediaPipe Hands library is offline or failed to load.");
    }
    
    state.handsDetector = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    
    state.handsDetector.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      runningMode: "VIDEO"
    });
    
    state.handsDetector.onResults(onHandDetections);
    
    state.cameraController = new Camera(video, {
      onFrame: async () => {
        if (state.activeScreen !== "voting" || state.isManualVote) return;

        const now = performance.now();
        const minGapMs = 80;

        if (state.handDetectionInFlight || now - state.lastHandProcessTime < minGapMs) {
          return;
        }

        state.lastHandProcessTime = now;
        state.handDetectionInFlight = true;

        try {
          await state.handsDetector.send({ image: video });
        } finally {
          state.handDetectionInFlight = false;
        }
      },
      width: 480,
      height: 360
    });
    
    state.cameraController.start();
    statusLabel.textContent = "AI Hand Voting Active";
    indicator.querySelector("span").className = "status-dot online";
    
  } catch (error) {
    console.error("Camera/Model initialization failed:", error);
    statusLabel.textContent = "AI Failed. Switched to Manual Mode.";
    indicator.querySelector("span").className = "status-dot offline";
    switchToManualMode();
  }
}

function stopWebcam() {
  if (state.cameraController) {
    try { state.cameraController.stop(); } catch (e) {}
    state.cameraController = null;
  }
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(track => track.stop());
    state.webcamStream = null;
  }
  const video = document.getElementById("webcam-video");
  if (video) video.srcObject = null;
}

function switchToManualMode() {
  state.isManualVote = true;
  stopWebcam();
  
  const toggleBtn = document.getElementById("toggle-manual-vote-btn");
  toggleBtn.textContent = "📷 Switch to Camera AI Voting";
  
  const statusLabel = document.getElementById("camera-status-label");
  const indicator = document.getElementById("camera-status-indicator");
  statusLabel.textContent = "Manual Tap-To-Vote Mode Active";
  indicator.querySelector("span").className = "status-dot online";
  
  document.getElementById("countdown-hud").classList.add("hide");
}

document.getElementById("toggle-manual-vote-btn").addEventListener("click", () => {
  if (state.isManualVote) {
    state.isManualVote = false;
    document.getElementById("toggle-manual-vote-btn").textContent = "👋 Use Manual Tap Instead";
    initWebcamAndHandTracking();
  } else {
    switchToManualMode();
  }
});

/* =========================================================================
   FINGER COUNT MATHEMATICS & DETECTION PIPELINE
   ========================================================================= */
function countOpenFingers(landmarks) {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const thumbTip = landmarks[4];
  const thumbIP = landmarks[3];
  const thumbBase = landmarks[2];
  const thumbOpen =
    distance(thumbTip, thumbIP) > 0.06 &&
    (thumbTip.x < thumbBase.x - 0.04 || thumbTip.x > thumbBase.x + 0.06 || thumbTip.y < thumbBase.y - 0.04);

  const indexOpen =
    landmarks[8].y < landmarks[6].y - 0.04 &&
    distance(landmarks[8], landmarks[5]) > 0.08;
  const middleOpen =
    landmarks[12].y < landmarks[10].y - 0.04 &&
    distance(landmarks[12], landmarks[9]) > 0.08;
  const ringOpen =
    landmarks[16].y < landmarks[14].y - 0.04 &&
    distance(landmarks[16], landmarks[13]) > 0.08;
  const pinkyOpen =
    landmarks[20].y < landmarks[18].y - 0.04 &&
    distance(landmarks[20], landmarks[17]) > 0.08;

  let count = 0;
  if (thumbOpen) count++;
  if (indexOpen) count++;
  if (middleOpen) count++;
  if (ringOpen) count++;
  if (pinkyOpen) count++;

  return Math.max(0, Math.min(5, count));
}

function updateFingerStability(rawCount) {
  if (rawCount === 0) {
    state.lastRawFingerCount = null;
    state.lastStableFingerCount = null;
    state.fingerStabilityFrames = 0;
    return null;
  }

  if (state.lastRawFingerCount !== rawCount) {
    state.lastRawFingerCount = rawCount;
    state.fingerStabilityFrames = 1;
    return null;
  }

  state.fingerStabilityFrames += 1;

  if (state.fingerStabilityFrames >= state.fingerStabilityRequired) {
    state.lastStableFingerCount = rawCount;
    return rawCount;
  }

  return null;
}

function onHandDetections(results) {
  if (state.activeScreen !== "voting" || state.isManualVote) return;

  const video = document.getElementById("webcam-video");
  const canvas = document.getElementById("camera-overlay-canvas");
  const ctx = canvas.getContext("2d");

  if (video && canvas) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let rawDetectedFingers = 0;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    results.multiHandLandmarks.forEach((landmarks) => {
      drawHandSkeleton(ctx, landmarks);
      rawDetectedFingers += countOpenFingers(landmarks);
    });
  }

  rawDetectedFingers = Math.min(rawDetectedFingers, 5);

  const stableDetectedFingers = updateFingerStability(rawDetectedFingers);
  const displayCount = stableDetectedFingers !== null ? stableDetectedFingers : rawDetectedFingers;

  state.detectedFingers = displayCount;
  document.getElementById("detected-fingers-value").textContent = displayCount;

  if (stableDetectedFingers !== null) {
    processGestureStability(stableDetectedFingers);
  }
}

/* =========================================================================
   STABILITY COUNTDOWN & PROGRESS RING CONTROL
   ========================================================================= */
function processGestureStability(fingersCount) {
  const category = state.categories[state.currentCategoryIndex];
  const totalCandidates = category.candidates.length;
  
  if (fingersCount >= 1 && fingersCount <= totalCandidates) {
    const candidate = category.candidates.find(c => c.count === fingersCount);
    
    if (state.countdownCandidateNumber === fingersCount) {
      const elapsed = Date.now() - state.countdownStart;
      const progressPct = Math.min((elapsed / state.countdownDurationMs) * 100, 100);
      
      updateProgressCircles(fingersCount, progressPct, candidate.name);
      
      if (elapsed >= state.countdownDurationMs) {
        castVote(candidate.name);
      }
    } else {
      resetAllCardProgressIndicators();
      state.countdownCandidateNumber = fingersCount;
      state.countdownStart = Date.now();
      showCountdownHUD(fingersCount, candidate.name);
    }
  } else {
    resetCountdownState();
  }
}

function updateProgressCircles(candCount, pct, name) {
  const circle = document.getElementById(`card-progress-ring-${candCount}`);
  if (circle) {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pct / 100);
    circle.style.strokeDashoffset = offset;
  }
  
  document.querySelectorAll(".candidate-vote-card").forEach(card => {
    if (parseInt(card.getAttribute("data-count")) === candCount) {
      card.classList.add("highlighted");
    } else {
      card.classList.remove("highlighted");
    }
  });
  
  const hudCircle = document.getElementById("countdown-progress-ring");
  if (hudCircle) {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pct / 100);
    hudCircle.style.strokeDashoffset = offset;
  }
  
  const hudNumber = document.getElementById("countdown-hud-number");
  if (hudNumber) {
    const remainingSecs = Math.ceil((state.countdownDurationMs - (Date.now() - state.countdownStart)) / 1000);
    hudNumber.textContent = Math.max(remainingSecs, 0);
  }
}

function showCountdownHUD(candCount, name) {
  const hud = document.getElementById("countdown-hud");
  const label = document.getElementById("countdown-hud-label");
  
  label.textContent = `Registering vote for ${name}... Hold Still!`;
  hud.classList.remove("hide");
}

function resetCountdownState() {
  state.countdownCandidateNumber = null;
  state.countdownStart = null;
  
  const hud = document.getElementById("countdown-hud");
  if (hud) hud.classList.add("hide");
  
  resetAllCardProgressIndicators();
}

function resetAllCardProgressIndicators() {
  document.querySelectorAll(".candidate-vote-card").forEach(card => {
    card.classList.remove("highlighted");
  });
  
  const category = state.categories[state.currentCategoryIndex];
  if (category) {
    category.candidates.forEach(cand => {
      const circle = document.getElementById(`card-progress-ring-${cand.count}`);
      if (circle) {
        circle.style.strokeDashoffset = 264;
      }
    });
  }
  
  const hudCircle = document.getElementById("countdown-progress-ring");
  if (hudCircle) {
    hudCircle.style.strokeDashoffset = 283;
  }
}

/* =========================================================================
   VOTE CAST ENGINE & 5-SECOND TRANSITION SCREEN
   ========================================================================= */
function castVote(candidateName) {
  const category = state.categories[state.currentCategoryIndex];
  
  // Record vote
  state.temporarySessionVotes.push({
    id: `vote-${Date.now()}-${Math.floor(Math.random()*10000)}`,
    timestamp: new Date().toISOString(),
    electionTitle: state.electionTitle,
    electionOrganization: state.electionOrganization,
    electionOrganizerName: state.electionOrganizerName || state.organizerUsername,
    electionDate: state.electionDate,
    electionVenue: state.electionVenue,
    category: category.name,
    candidate: candidateName,
    status: "pending"
  });
  
  // Play vote chimes
  playMenuChime();
  resetCountdownState();
  
  const nextIdx = state.currentCategoryIndex + 1;
  
  if (nextIdx < state.categories.length) {
    // Show 5-second transition delay screen
    startTransitionScreen(nextIdx);
  } else {
    // Finalize all categories
    finalizeVoterSession();
  }
}

function startTransitionScreen(nextCategoryIndex) {
  if (state.transitionTimer) clearInterval(state.transitionTimer);
  
  state.transitionNextCategoryIdx = nextCategoryIndex;
  state.transitionCount = 5;
  
  const nextCategory = state.categories[nextCategoryIndex];
  document.getElementById("transition-next-label").textContent = `Preparing ballot for position: ${nextCategory.name}`;
  document.getElementById("transition-timer-lbl").textContent = "5";
  
  const progressFill = document.getElementById("transition-progress-fill");
  if (progressFill) progressFill.style.strokeDashoffset = "0"; // Start full
  
  navigateTo("transition");
  playTickChime(); // First second tick
  
  state.transitionTimer = setInterval(() => {
    state.transitionCount--;
    
    // Update label
    document.getElementById("transition-timer-lbl").textContent = state.transitionCount;
    
    // Drain ring from full (offset=0) to empty (offset=276.46) over 5 seconds
    if (progressFill) {
      const pct = (5 - state.transitionCount) / 5; // grows 0→1 as time passes
      progressFill.style.strokeDashoffset = 276.46 * pct;
    }
    
    if (state.transitionCount > 0) {
      playTickChime();
    } else {
      clearInterval(state.transitionTimer);
      state.transitionTimer = null;
      
      // Load next category
      state.currentCategoryIndex = state.transitionNextCategoryIdx;
      navigateTo("voting");
    }
  }, 1000);
}

function finalizeVoterSession() {
  state.votes.push(...state.temporarySessionVotes);
  localStorage.setItem("evm_votes", JSON.stringify(state.votes));
  
  // Trigger long EVM electronic beep
  playEvmVoteBeep();
  navigateTo("success");
  
  syncVotesWithSheets();
}

/* =========================================================================
   SUCCESS / CELEBRATION TIMERS
   ========================================================================= */
function triggerCelebration() {
  if (typeof confetti !== "undefined") {
    confetti({ particleCount: 100, spread: 70, origin: { x: 0.1, y: 0.8 } });
    confetti({ particleCount: 100, spread: 70, origin: { x: 0.9, y: 0.8 } });
    
    let end = Date.now() + 2000;
    (function frame() {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
      
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }

  const redirectDelayMs = 5000;
  const progressEl = document.getElementById("success-redirect-progress");
  const hintEl = document.querySelector(".redirect-hint");

  let remainingMs = redirectDelayMs;

  const updateCountdown = () => {
    const progressPct = Math.max(0, Math.min(100, (remainingMs / redirectDelayMs) * 100));
    if (progressEl) progressEl.style.width = `${progressPct}%`;

    const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));
    if (hintEl) hintEl.textContent = `Next voter starting in ${secondsLeft} second${secondsLeft === 1 ? "" : "s"}...`;
  };

  updateCountdown();

  const countdownInterval = setInterval(() => {
    remainingMs -= 1000;
    if (remainingMs <= 0) {
      clearInterval(countdownInterval);
      if (state.activeScreen === "success") {
        navigateTo("welcome");
      }
      return;
    }
    updateCountdown();
  }, 1000);
}

/* =========================================================================
   SHARING, PRINTING, AND EMAIL ACTIONS
   ========================================================================= */
document.getElementById("share-results-btn").addEventListener("click", async () => {
  const textSummary = getResultsTextSummary();
  if (navigator.share) {
    try {
      await navigator.share({
        title: "School Election Results 2026",
        text: textSummary,
        url: window.location.href
      });
    } catch (e) {
      console.warn("Share sheet cancelled or failed:", e);
    }
  } else {
    try {
      await navigator.clipboard.writeText(textSummary);
      alert("Results summary copied to clipboard!");
    } catch (e) {
      alert("Failed to copy results.");
    }
  }
});

document.getElementById("email-results-btn").addEventListener("click", () => {
  const textSummary = getResultsTextSummary();
  const subject = encodeURIComponent("School Election Results 2026");
  const body = encodeURIComponent(textSummary);
  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
});

document.getElementById("print-results-btn").addEventListener("click", () => {
  generatePrintLayout();
  window.print();
});

function getResultsTextSummary() {
  let summary = `🗳️ ${state.electionTitle.toUpperCase()} - RESULTS SUMMARY\n`;
  summary += `Organization: ${state.electionOrganization}\n`;
  summary += `Date: ${state.electionDate} | Venue: ${state.electionVenue}\n`;
  summary += `Generated: ${new Date().toLocaleString()}\n`;
  summary += `Total Votes Cast: ${state.votes.length}\n`;
  summary += `========================================\n\n`;
  
  state.categories.forEach(category => {
    summary += `👉 CATEGORY: ${category.name.toUpperCase()}\n`;
    const catVotes = state.votes.filter(v => v.category === category.name);
    
    const tallied = category.candidates.map(cand => {
      const votes = catVotes.filter(v => v.candidate === cand.name).length;
      return { ...cand, votes };
    }).sort((a,b) => b.votes - a.votes);
    
    tallied.forEach(c => {
      const pct = catVotes.length > 0 ? Math.round((c.votes / catVotes.length) * 100) : 0;
      summary += ` - ${c.symbol} ${c.name}: ${c.votes} votes (${pct}%)\n`;
    });
    
    if (catVotes.length > 0 && tallied[0].votes > (tallied[1]?.votes || 0)) {
      summary += `🏆 Winner: ${tallied[0].name}\n`;
    } else if (catVotes.length > 0) {
      summary += `🤝 Result: Tie Lead between candidates\n`;
    } else {
      summary += `No votes cast for this category.\n`;
    }
    summary += `----------------------------------------\n`;
  });
  
  return summary;
}

function generatePrintLayout() {
  const printArea = document.getElementById("print-results-area");
  printArea.innerHTML = "";
  
  state.categories.forEach(category => {
    const catVotes = state.votes.filter(v => v.category === category.name);
    const totalCatVotes = catVotes.length;
    
    const tallied = category.candidates.map(cand => {
      const count = catVotes.filter(v => v.candidate === cand.name).length;
      return { ...cand, count };
    }).sort((a,b) => b.count - a.count);
    
    const hasWinner = totalCatVotes > 0 && (tallied.length === 1 || tallied[0].count > tallied[1].count);
    const winner = hasWinner ? tallied[0] : null;
    
    const frame = document.createElement("div");
    frame.className = "certificate-frame";
    
    frame.innerHTML = `
      <div class="certificate-header">
        <h1>Official Certificate of Election</h1>
        <p>${state.electionOrganization} • ${state.electionTitle}</p>
      </div>
      
      <div class="certificate-title">
        Category: ${category.name.toUpperCase()}
      </div>
      
      <div class="winner-announce-box">
        ${winner ? `
          <div class="winner-avatar">${winner.symbol}</div>
          <div class="winner-name">${winner.name}</div>
          <div class="winner-category-tag">Elected Winner</div>
          <div class="winner-meta">With a mandate of ${winner.count} votes (${Math.round((winner.count / totalCatVotes)*100)}% of total votes cast)</div>
        ` : `
          <div class="winner-avatar">🤝</div>
          <div class="winner-name">TIE / NO WINNER</div>
          <div class="winner-category-tag">Undecided Outcome</div>
          <div class="winner-meta">Total votes cast: ${totalCatVotes}</div>
        `}
      </div>
      
      <h3>Full Candidate Tallies:</h3>
      <table class="results-table-print">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Candidate</th>
            <th>Icon</th>
            <th>Votes Received</th>
            <th>Vote Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${tallied.map((cand, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-weight:bold;">${cand.name}</td>
              <td style="font-size:1.5rem;">${cand.symbol}</td>
              <td>${cand.count}</td>
              <td>${totalCatVotes > 0 ? Math.round((cand.count / totalCatVotes)*100) : 0}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="print-footer">
        <div>Date of Election: ${state.electionDate || new Date().toLocaleDateString()}</div>
        <div>Venue: ${state.electionVenue || "School Grounds"}</div>
      </div>
      
      <div style="display:flex; justify-content:space-between; margin-top:20px;">
        <div class="signature-line">Organizer: ${state.electionOrganizerName || "Coordinator"}</div>
        <div class="signature-line">School Authority</div>
      </div>
    `;
    printArea.appendChild(frame);
  });
}

/* =========================================================================
   VISUAL HUD DRAWING UTILITY (CANVAS SKELETON OVERLAY)
   ========================================================================= */
function drawHandSkeleton(ctx, landmarks) {
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 4;
  ctx.fillStyle = "#f59e0b";
  
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [9, 10], [10, 11], [11, 12],
    [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
  ];
  
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  
  connections.forEach(([startIdx, endIdx]) => {
    const ptA = landmarks[startIdx];
    const ptB = landmarks[endIdx];
    
    ctx.beginPath();
    ctx.moveTo(ptA.x * width, ptA.y * height);
    ctx.lineTo(ptB.x * width, ptB.y * height);
    ctx.stroke();
  });
  
  landmarks.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x * width, pt.y * height, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pt.x * width, pt.y * height, 7, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 4;
  });
}

/* =========================================================================
   INITIALIZATION
   ========================================================================= */
window.addEventListener("DOMContentLoaded", () => {
  const isConfigured = initDatabase();
  if (isConfigured) {
    navigateTo("welcome");
  } else {
    // Force setup wizard login/register on startup
    document.getElementById("tab-toggle-register").click();
    navigateTo("login");
  }
});
