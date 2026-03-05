import { MAPS, EMOTES } from "./constants.js";

const API_URL = "https://urapi.com";
let AuthToken = null;
let EditingTournamentId = null;
let PhaseCount = 1;
let SelectedEnabledEmotes = [];
let CurrentMapPhaseIndex = null;
let SelectedMapsByPhase = {}; // Memorizza le mappe selezionate per ogni fase: { phaseIndex: [mapCode1, mapCode2, ...] }

function EnsureMapModalFooter() {
  const modalContent = document.querySelector("#mapModal .modal-content");
  if (!modalContent) return;

  if (document.getElementById("selectedMapDisplay")) return;

  const display = document.createElement("div");
  display.id = "selectedMapDisplay";
  display.style.marginTop = "10px";
  display.style.padding = "12px 16px";
  display.style.background = "rgba(15, 15, 30, 0.5)";
  display.style.borderRadius = "10px";
  display.style.border = "1.5px solid rgba(34, 197, 94, 0.15)";
  display.style.fontSize = "13px";
  display.style.fontWeight = "600";
  display.style.minHeight = "38px";
  display.style.display = "flex";
  display.style.alignItems = "center";

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "btn";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", CloseMapModal);

  modalContent.appendChild(display);
  modalContent.appendChild(doneBtn);
}

function UpdateMapModalDisplay() {
  const display = document.getElementById("selectedMapDisplay");
  if (!display) return;

  if (CurrentMapPhaseIndex === null) {
    display.textContent = "Select Map";
    display.style.color = "#22c55e";
    return;
  }

  const selectedMaps = SelectedMapsByPhase[CurrentMapPhaseIndex] || [];
  const roundCount = parseInt(document.getElementById(`roundCount_${CurrentMapPhaseIndex}`)?.value) || 1;
  
  if (selectedMaps.length === 0) {
    display.textContent = `Select Map(s) (max ${roundCount})`;
    display.style.color = "#22c55e";
    return;
  }

  const mapNames = selectedMaps.map(code => {
    const mapName = Object.keys(MAPS).find((name) => MAPS[name] === code) || code;
    return mapName;
  });
  
  display.textContent = `Selected (${selectedMaps.length}/${roundCount}): ${mapNames.join(", ")}`;
  display.style.color = "#22c55e";
}

function parseMongoDate(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === "string") {
    return new Date(dateValue);
  }
  if (dateValue.$date) {
    return new Date(dateValue.$date);
  }
  return new Date(dateValue);
}

function formatMongoDate(date) {
  if (!date) return null;
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString();
}

function CheckSavedLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("mainApp").classList.remove("active");
}

function GenerateTournamentId() {
  return new Date().getTime().toString();
}

function CalculateTotalRounds(maxTeams, minPlayers, maxPlayers) {
  let rounds = 0;
  if (minPlayers === 2 && maxPlayers === 2) {
    rounds = Math.ceil(Math.log2(maxTeams));
  } else {
    let remaining = maxTeams;
    while (remaining > 1) {
      rounds++;
      const matchesNeeded = Math.ceil(remaining / maxPlayers);
      if (matchesNeeded === 1) break;
      remaining = matchesNeeded * minPlayers;
    }
  }
  return Math.max(1, rounds);
}

// Opzioni Max Players per ogni Party Size (1v1=1 ... 7v7=7)
const MAX_INVITES_BY_PARTY_SIZE = {
  1: [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
  2: [4, 8, 16, 32, 64, 128, 256, 512, 1024],
  3: [6, 12, 24, 48, 96, 192, 384, 768],
  4: [8, 16, 32, 64, 128, 256, 512, 1024],
  5: [10, 20, 40, 80, 160, 320, 640, 1280],
  6: [12, 24, 48, 96, 192, 384, 768, 1536],
  7: [14, 28, 56, 112, 224, 448, 896, 1792]
};

function UpdateMaxInvitesOptions() {
  const partySize = parseInt(document.getElementById("partySize").value) || 1;
  const options = MAX_INVITES_BY_PARTY_SIZE[partySize] || MAX_INVITES_BY_PARTY_SIZE[1];
  const select = document.getElementById("maxInvites");
  const currentValue = parseInt(select.value);
  select.innerHTML = "";
  for (const n of options) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  }
  // Mantieni valore corrente se nella nuova lista, altrimenti usa 16 se disponibile, altrimenti primo valore
  if (options.includes(currentValue)) {
    select.value = currentValue;
  } else {
    // Se 16 è disponibile, usalo come default, altrimenti usa il primo valore
    if (options.includes(16)) {
      select.value = 16;
    } else {
      select.value = options[0];
    }
  }
  // Aggiorna la disponibilità del checkbox Count on Leaderboard
  UpdateCountOnLeaderboardAvailability();
}

function UpdateCountOnLeaderboardAvailability() {
  const maxInvites = parseInt(document.getElementById("maxInvites").value) || 0;
  const countOnLeaderboardCheckbox = document.getElementById("countOnLeaderboard");
  
  if (!countOnLeaderboardCheckbox) return;
  
  if (maxInvites < 16) {
    // Se Max Players < 16, disabilita e deseleziona il checkbox
    countOnLeaderboardCheckbox.disabled = true;
    countOnLeaderboardCheckbox.checked = false;
  } else {
    // Se Max Players >= 16, abilita e auto-seleziona il checkbox
    countOnLeaderboardCheckbox.disabled = false;
    countOnLeaderboardCheckbox.checked = true;
  }
  UpdateWprizepoolAvailability();
}

function UpdateWprizepoolAvailability() {
  const maxInvites = parseInt(document.getElementById("maxInvites").value) || 0;
  const wprizepoolSelect = document.getElementById("wprizepool");
  if (!wprizepoolSelect) return;
  if (maxInvites < 32) {
    wprizepoolSelect.disabled = true;
    wprizepoolSelect.value = "";
  } else {
    wprizepoolSelect.disabled = false;
  }
}

function CalculatePhaseValues() {
  const maxInvites = parseInt(document.getElementById("maxInvites").value) || 128;
  const partySize = parseInt(document.getElementById("partySize").value) || 1;
  const minPlayers = 2;
  const maxPlayers = 2;

  const maxTeams = Math.floor(maxInvites / partySize);

  for (let i = 0; i < PhaseCount; i++) {
    const phaseType = parseInt(document.getElementById(`phaseType_${i}`).value);

    document.getElementById(`maxTeams_${i}`).value = maxTeams;

    let rounds;
    if (phaseType === 2) {
      rounds = CalculateTotalRounds(maxTeams, minPlayers, maxPlayers);
    } else if (phaseType === 3 || phaseType === 1) {
      rounds = 6;
    } else {
      rounds = CalculateTotalRounds(maxTeams, minPlayers, maxPlayers);
    }

    const oldRoundCount = parseInt(document.getElementById(`roundCount_${i}`).value) || rounds;
    document.getElementById(`roundCount_${i}`).value = rounds;
    
    // Se il numero di round è diminuito, rimuovi le mappe in eccesso
    const selectedMaps = SelectedMapsByPhase[i] || [];
    if (selectedMaps.length > rounds) {
      SelectedMapsByPhase[i] = selectedMaps.slice(0, rounds);
      UpdateMapDisplayForPhase(i);
      // Aggiorna anche l'input hidden
      const mapInput = document.getElementById(`mapSelect_${i}`);
      if (mapInput) {
        mapInput.value = SelectedMapsByPhase[i].join(", ");
      }
    }
    
    // Se il modal delle mappe è aperto per questa fase, aggiorna la griglia
    if (CurrentMapPhaseIndex === i) {
      const searchValue = document.getElementById("mapSearch")?.value || "";
      RenderMapGrid(searchValue);
    }
  }
}

async function HandleLogin(username, password) {
  try {
    const response = await fetch(`${API_URL}/Auth/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username, Password: password }),
    });

    if (!response.ok) {
      let errorMessage = "Invalid credentials";
      try {
        const errorData = await response.json();
        errorMessage = errorData.Message || errorData.message || `Error ${response.status}`;
      } catch (e) {
        errorMessage = `Error ${response.status}: ${response.statusText}`;
      }
      ShowError(errorMessage);
      return;
    }

    const data = await response.json();

    if (data.Token) {
      AuthToken = data.Token;

      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("mainApp").classList.add("active");
      
      if (document.getElementById("createPanel").classList.contains("active")) {
        SetDefaultTimes();
      }
      
      // Imposta il Type predefinito su Generic (value "0")
      const tournamentTypeSelect = document.getElementById("tournamentType");
      if (tournamentTypeSelect) {
        tournamentTypeSelect.value = "0";
      }
      
      LoadTournaments();
    } else {
      ShowError(data.Message || "Login failed: No token received");
    }
  } catch (error) {
    ShowError(`Connection error: ${error.message}. Please check if the API is running.`);
  }
}

function HandleLogout() {
  AuthToken = null;

  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("mainApp").classList.remove("active");
}

function ShowError(message) {
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = message;
  errorEl.classList.add("visible");
  setTimeout(() => errorEl.classList.remove("visible"), 4000);
}

function ShowMessage(message, isError = false) {
  const msgEl = document.getElementById("createMessage");
  msgEl.textContent = message;
  msgEl.className = isError ? "message-box error" : "message-box success";
  setTimeout(() => (msgEl.className = "message-box"), 8000);
}

function SwitchTab(tab, evt) {
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelectorAll(".content-panel").forEach((panel) => panel.classList.remove("active"));

  if (evt && evt.target) {
    evt.target.classList.add("active");
  } else {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      if (btn.textContent.toLowerCase().includes(tab)) {
        btn.classList.add("active");
      }
    });
  }

  document.getElementById(`${tab}Panel`).classList.add("active");

  if (tab === "view") {
    LoadTournaments();
    if (EditingTournamentId) {
      EditingTournamentId = null;
      window.currentTournamentData = null;
      document.querySelector("#createPanel .section-title").textContent = "Make new tournament";
    }
  } else if (tab === "create") {
    if (!EditingTournamentId) {
      ResetCreateForm();
    }
  }
}

function ResetCreateForm() {
  EditingTournamentId = null;
  window.currentTournamentData = null;
  document.getElementById("tournamentForm").reset();
  // Imposta il Type predefinito su Generic (value "0") quando si resetta il form
  const tournamentTypeSelect = document.getElementById("tournamentType");
  if (tournamentTypeSelect) {
    tournamentTypeSelect.value = "0";
  }
  SetDefaultTimes();
  // Aggiorna la disponibilità del checkbox Count on Leaderboard dopo aver impostato i valori di default
  UpdateCountOnLeaderboardAvailability();
  SelectedEnabledEmotes = [];
  SelectedMapsByPhase = {};
  PhaseCount = 1;
  RenderPhases();
  UpdateEmoteDisplay();
  UpdateColorDisplay();
  CalculatePhaseValues();
  document.querySelector("#createPanel .section-title").textContent = "Create New Tournament";
  document.getElementById("invitedIds").value = "";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function LoadTournaments() {
  const listEl = document.getElementById("tournamentList");
  listEl.innerHTML = '<div class="loading">Loading tournaments...</div>';

  try {
    const response = await fetch(`${API_URL}/Tournaments`, {
      headers: { Authorization: `Bearer ${AuthToken}` },
    });

    const data = await response.json();
    const tournaments = data.Tournaments || [];

    if (tournaments.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state"><h3>No tournaments yet</h3><p>Create your first tournament to get started</p></div>';
      return;
    }

    listEl.innerHTML = tournaments
      .map(
        (t) => {
          const startTime = parseMongoDate(t.StartTime);
          const tournamentColor = t.TournamentColor || "#22c55e";
          const borderColor = tournamentColor.startsWith("#") ? tournamentColor : `#${tournamentColor}`;
          return `
      <div class="tournament-item" data-status="${t.Status}" data-id="${escapeHtml(t.TournamentId)}" style="border-left-color: ${escapeHtml(borderColor)};">
        <span class="tournament-region-badge">${escapeHtml(t.Region.toUpperCase())}</span>
        <img src="${escapeHtml(t.TournamentImage || "https://i.imgur.com/BbqF8LO.png")}" alt="${escapeHtml(
          t.TournamentName
        )}" class="tournament-thumbnail" />
        <div class="tournament-info">
          <div class="tournament-title">${escapeHtml(t.TournamentName)}</div>
          <div class="tournament-id">#${escapeHtml(t.TournamentId)}</div>
          <div class="tournament-meta">${startTime ? startTime.toLocaleDateString() + " at " + startTime.toLocaleTimeString() : "N/A"}</div>
        </div>
        <div class="tournament-stats">
          <div class="tournament-stat">
            <span class="stat-label">Players</span>
            <span class="stat-value">${t.CurrentInvites || 0}/${t.MaxInvites}</span>
          </div>
        </div>
        <div class="tournament-status">
          ${GetStatusBadge(t.Status)}
        </div>
        <div class="tournament-actions">
          <button class="btn-edit" onclick="EditTournament('${escapeHtml(t.TournamentId)}')">Edit</button>
          <button class="btn-delete" onclick="DeleteTournament('${escapeHtml(t.TournamentId)}')">Delete</button>
        </div>
      </div>
    `;
        }
      )
      .join("");
  } catch (error) {
    listEl.innerHTML = '<div class="empty-state"><h3>Error loading tournaments</h3><p>Please try again later</p></div>';
  }
}

async function EditTournament(tournamentId) {
  try {
    const response = await fetch(`${API_URL}/Tournaments/${encodeURIComponent(tournamentId)}`, {
      headers: { Authorization: `Bearer ${AuthToken}` },
    });

    if (!response.ok) {
      ShowMessage("Tournament not found", true);
      return;
    }

    const tournament = await response.json();

    window.currentTournamentData = tournament;

    EditingTournamentId = tournamentId;
    document.getElementById("tournamentName").value = tournament.TournamentName || "";
    document.getElementById("tournamentImage").value = tournament.TournamentImage || "https://i.imgur.com/BbqF8LO.png";
    document.getElementById("tournamentColor").value = (tournament.TournamentColor || "#22c55e").substring(0, 7);
    UpdateColorDisplay();
    
    const startTime = parseMongoDate(tournament.StartTime);
    const signupStart = parseMongoDate(tournament.SignupStart);
    document.getElementById("startTime").value = startTime ? formatLocalDateTime(startTime) : "";
    document.getElementById("signupStart").value = signupStart ? formatLocalDateTime(signupStart) : "";
    
    document.getElementById("partySize").value = tournament.PartySize || 1;
    UpdateMaxInvitesOptions();
    const maxInvitesVal = tournament.MaxInvites || 128;
    const partySizeNum = parseInt(document.getElementById("partySize").value) || 1;
    const allowedMax = MAX_INVITES_BY_PARTY_SIZE[partySizeNum] || MAX_INVITES_BY_PARTY_SIZE[1];
    document.getElementById("maxInvites").value = allowedMax.includes(maxInvitesVal) ? maxInvitesVal : allowedMax[0];
    document.getElementById("entryFee").value = tournament.EntryFee || 0;
    document.getElementById("prizeType").value = tournament.PrizeType || "gems";
    document.getElementById("wprizepool").value = tournament.Wprizepool || "";
    const prizes = tournament.Prizes || [];
    const el = document.getElementById(`prizePos1`);
    if (el) {
      const p = prizes.find((pr) => pr.position === 1);
      el.value = p && typeof p.amount === "number" ? p.amount : 0;
    }
    document.getElementById("region").value = tournament.Region || "eu";
    document.getElementById("tournamentType").value = tournament.TournamentType || 0;
    
    // Aggiorna prima la disponibilità del checkbox basandosi su Max Players
    UpdateCountOnLeaderboardAvailability();
    
    // Poi imposta il valore del checkbox solo se è abilitato
    const countOnLeaderboardCheckbox = document.getElementById("countOnLeaderboard");
    if (countOnLeaderboardCheckbox && !countOnLeaderboardCheckbox.disabled) {
      const value = tournament.CountOnLeaderBoard;
      countOnLeaderboardCheckbox.checked = value === 1 || value === true || value === "1";
    }
    document.getElementById("isInviteOnly").checked = tournament.Properties?.IsInvitationOnly || false;
    
    const streamUrlArray = tournament.Properties?.StreamURL || [];
    document.getElementById("streamUrl").value = Array.isArray(streamUrlArray) ? (streamUrlArray[0] || "") : streamUrlArray;

    const invitedIds = tournament.Properties?.InvitedIds || [];
    document.getElementById("invitedIds").value = invitedIds.join(", ");

    const disabledEmotes = tournament.Properties?.DisabledEmotes || [-1];
    
    // Leggi le emote speciali selezionate dal campo dedicato (se esiste)
    const selectedSpecialEmotesFromDB = tournament.Properties?.SelectedSpecialEmotes || [];
    
    // Emote speciali che NON vengono salvate nel database quando selezionate
    const specialEmoteIds = [
      EMOTES["Invisibility"],      // 174
      EMOTES["Punch"],             // 9
      EMOTES["Fire Punch"],        // 85
      EMOTES["Banana"],            // 55
      EMOTES["Golden Banana"],     // 122
      EMOTES["MrBeast Case"],      // 155
      EMOTES["Ball"],              // 156
      EMOTES["Hug"],               // 8
      EMOTES["Charged Hug"],       // 124
      EMOTES["Kick"],              // 13
      EMOTES["Wet Kick"]           // 123
    ].filter(id => id !== undefined); // Filtra eventuali emote non più presenti
    
    // Ottieni tutte le emote normali (escludendo quelle con "only" nel nome)
    const normalEmoteIds = Object.entries(EMOTES)
      .filter(([name, id]) => id > 0 && !name.toLowerCase().includes("only"))
      .map(([, id]) => id);
    
    // Filtra le emote "only" dal database
    const enabledOnlyEmotes = disabledEmotes.filter(id => id < 0 && id !== -1 && !(id < -1000 && id >= -2000));
    
    // Rimuovi le emote "only" e -1 da DisabledEmotes per il calcolo
    const disabledEmotesWithoutOnly = disabledEmotes.filter(id => id !== -1 && !(id < 0 && id !== -1 && !(id < -1000 && id >= -2000)));
    
    // Ottieni tutte le emote (normali + speciali, escludendo le "only")
    const allEmoteIdsExceptOnly = [...normalEmoteIds, ...specialEmoteIds];
    
    // CASO 1: Se DisabledEmotes è vuoto o contiene solo [-1], significa "all emote" (tutte le emote consentite)
    // In questo caso, SelectedEnabledEmotes deve essere vuoto per mostrare "All Enabled"
    // Controlla se disabledEmotes è vuoto, contiene solo [-1], o disabledEmotesWithoutOnly è vuoto senza emote "only"
    const isEmptyOrOnlyMinusOne = disabledEmotes.length === 0 || 
                                   (disabledEmotes.length === 1 && disabledEmotes[0] === -1) ||
                                   (disabledEmotesWithoutOnly.length === 0 && enabledOnlyEmotes.length === 0);
    
    if (isEmptyOrOnlyMinusOne) {
      SelectedEnabledEmotes = [];
    }
    // CASO 2: Se DisabledEmotes contiene SOLO emote "only" (nessuna emote normale o speciale)
    // In questo caso, SelectedEnabledEmotes deve contenere SOLO quelle emote "only"
    else if (disabledEmotesWithoutOnly.length === 0 && enabledOnlyEmotes.length > 0) {
      SelectedEnabledEmotes = [...enabledOnlyEmotes];
    } else {
      // Controlla se DisabledEmotes contiene tutte le emote (nessuna emote selezionata)
      const allEmotesDisabled = disabledEmotesWithoutOnly.length > 0 && 
                                 disabledEmotesWithoutOnly.length >= allEmoteIdsExceptOnly.length &&
                                 allEmoteIdsExceptOnly.every(id => disabledEmotesWithoutOnly.includes(id));
      
      // Controlla se DisabledEmotes è vuoto (tutte le emote selezionate)
      const allEmotesEnabled = disabledEmotesWithoutOnly.length === 0;
      
      // Emote speciali disabilitate nel database (quelle NON selezionate)
      const disabledSpecialEmotes = disabledEmotes.filter(id => specialEmoteIds.includes(id));
      
      // Se tutte le emote sono disabilitate (nessuna selezionata), SelectedEnabledEmotes deve essere vuoto
      if (allEmotesDisabled) {
        SelectedEnabledEmotes = [];
        // Aggiungi le emote "only" se presenti
        if (enabledOnlyEmotes.length > 0) {
          SelectedEnabledEmotes.push(...enabledOnlyEmotes);
        }
      }
      // Se tutte le emote sono abilitate (DisabledEmotes vuoto), controlla se tutte le emote speciali sono selezionate
      else if (allEmotesEnabled) {
        // Se SelectedSpecialEmotes contiene tutte le emote speciali, allora tutte le emote sono selezionate
        const allSpecialInSelected = selectedSpecialEmotesFromDB.length > 0 && 
                                     selectedSpecialEmotesFromDB.length === specialEmoteIds.length &&
                                     specialEmoteIds.every(id => selectedSpecialEmotesFromDB.includes(id));
        
        if (allSpecialInSelected) {
          // Tutte le emote normali + tutte le emote speciali sono selezionate
          SelectedEnabledEmotes = [...normalEmoteIds, ...specialEmoteIds];
        } else {
          // Solo tutte le emote normali sono selezionate (No Special Emotes)
          SelectedEnabledEmotes = [...normalEmoteIds];
        }
        // Aggiungi le emote "only" se presenti
        if (enabledOnlyEmotes.length > 0) {
          SelectedEnabledEmotes.push(...enabledOnlyEmotes);
        }
      }
      // Se il campo SelectedSpecialEmotes esiste e ha valori, usalo (per tour nuovi)
      else if (selectedSpecialEmotesFromDB.length > 0) {
        SelectedEnabledEmotes = [...selectedSpecialEmotesFromDB];
        
        // Aggiungi le emote "only" se presenti
        if (enabledOnlyEmotes.length > 0) {
          SelectedEnabledEmotes.push(...enabledOnlyEmotes);
        }
      } 
      // Le emote speciali selezionate sono quelle che NON sono in DisabledEmotes
      // (in DisabledEmotes ci sono solo le emote speciali NON selezionate e le emote "only")
      else {
        // Le emote speciali selezionate sono quelle che NON sono in disabledEmotes
        const selectedSpecialEmotes = specialEmoteIds.filter(id => !disabledEmotes.includes(id));
        
        // Se tutte le emote speciali sono disabilitate (nessuna selezionata), significa "No Special Emotes"
        // In questo caso, aggiungi tutte le emote normali
        if (selectedSpecialEmotes.length === 0) {
          // Tutte le emote speciali sono disabilitate -> aggiungi tutte le emote normali
          SelectedEnabledEmotes = [...normalEmoteIds];
        } else {
          // Ci sono emote speciali selezionate -> aggiungi solo quelle
          SelectedEnabledEmotes = [...selectedSpecialEmotes];
        }
        
        // Aggiungi le emote "only" se presenti
        if (enabledOnlyEmotes.length > 0) {
          SelectedEnabledEmotes.push(...enabledOnlyEmotes);
        }
      }
    }
    
    UpdateEmoteDisplay();
    
    PhaseCount = tournament.Phases && tournament.Phases.length > 0 ? tournament.Phases.length : 1;

    RenderPhases();

    if (tournament.Phases && tournament.Phases.length > 0) {
      tournament.Phases.forEach((phase, index) => {
        if (document.getElementById(`phaseType_${index}`)) {
          const phaseType = phase.PhaseType ? (typeof phase.PhaseType === "string" ? parseInt(phase.PhaseType) : phase.PhaseType) : 2;
          document.getElementById(`phaseType_${index}`).value = phaseType;
          
          // Gestisci le mappe: possono essere array o stringa con virgola e spazio
          let mapsArray = [];
          if (Array.isArray(phase.Maps)) {
            mapsArray = phase.Maps;
          } else if (typeof phase.Maps === "string" && phase.Maps.trim()) {
            // Se è una stringa, dividi per virgola e spazio
            mapsArray = phase.Maps.split(", ").filter(m => m.trim());
          } else if (phase.Maps) {
            // Fallback per retrocompatibilità
            mapsArray = [phase.Maps];
          }
          
          // Salva le mappe nell'array globale
          SelectedMapsByPhase[index] = mapsArray;
          
          // Aggiorna l'input hidden
          const mapInput = document.getElementById(`mapSelect_${index}`);
          if (mapInput) {
            mapInput.value = mapsArray.join(", ");
          }
          
          // Aggiorna il display
          UpdateMapDisplayForPhase(index);
          
          document.getElementById(`isPhase_${index}`).checked = phase.IsPhase || false;
          document.getElementById(`groupCount_${index}`).value = phase.GroupCount || 1;
          document.getElementById(`roundCount_${index}`).value = phase.RoundCount || 1;
          document.getElementById(`maxTeams_${index}`).value = phase.MaxTeams || 128;
        }
      });
    }

    UpdateEmoteDisplay();
    CalculatePhaseValues();

    document.querySelector("#createPanel .section-title").textContent = "Edit Tournament";

    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".content-panel").forEach((panel) => panel.classList.remove("active"));

    document.querySelectorAll(".tab-btn")[0].classList.add("active");
    document.getElementById("createPanel").classList.add("active");
  } catch (error) {
    ShowMessage("Error loading tournament", true);
  }
}

async function DeleteTournament(tournamentId) {
  if (!confirm(`Are you sure you want to delete tournament ${tournamentId}?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/Tournaments/${encodeURIComponent(tournamentId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${AuthToken}` },
    });

    const data = await response.json();

    if (response.ok) {
      ShowMessage("Tournament deleted successfully!");
      LoadTournaments();
    } else {
      ShowMessage(data.Message || "Error deleting tournament", true);
    }
  } catch (error) {
    ShowMessage("Connection error. Please try again.", true);
  }
}

function GetStatusBadge(status) {
  const statusMap = {
    0: { class: "", text: "Not Started" },
    1: { class: "status-open", text: "Open" },
    2: { class: "status-closed", text: "Closed" },
    3: { class: "status-finished", text: "Finished" },
    4: { class: "status-finished", text: "Canceled" },
    5: { class: "status-running", text: "Running" },
  };

  const badge = statusMap[status] || statusMap[0];
  return `<span class="status-badge ${badge.class}">${escapeHtml(badge.text)}</span>`;
}

function RenderPhases() {
  const container = document.getElementById("phasesContainer");
  container.innerHTML = "";

  for (let i = 0; i < PhaseCount; i++) {
    const phaseHtml = `
      <div class="phase-section" id="phase_${i}">
        <div class="phase-header">
          <h3>Phase ${i + 1}</h3>
          ${
            i > 0
              ? `<button type="button" class="btn-remove-phase" onclick="RemovePhase(${i})">Remove Phase</button>`
              : ""
          }
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="phaseType_${i}">Tournament Type</label>
            <select id="phaseType_${i}" onchange="CalculatePhaseValues()">
              <option value="2">Single Elimination</option>
              <option value="3">Round Robin</option>
              <option value="1">Arena</option>
              <option value="4">Double Elimination</option>
            </select>
          </div>
          <div class="form-group">
            <label for="mapSelect_${i}">Map Selection</label>
            <button type="button" class="btn btn-secondary" onclick="OpenMapSelector(${i})">Select Map</button>
            <input type="hidden" id="mapSelect_${i}" />
            <div id="mapDisplay_${i}" class="map-display-text"></div>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="roundCount_${i}">Total Rounds</label>
            <input type="number" id="roundCount_${i}" value="7" min="1" required readonly />
          </div>
          <div class="form-group">
            <label for="maxTeams_${i}">Maximum Teams</label>
            <input type="number" id="maxTeams_${i}" value="128" min="2" readonly />
          </div>
        </div>
        
        <div class="form-row">
          <div class="checkbox-group">
            <input type="checkbox" id="isPhase_${i}" />
            <label for="isPhase_${i}">Enable Phase Groups</label>
          </div>
          <div class="form-group">
            <label for="groupCount_${i}">Number of Groups</label>
            <input type="number" id="groupCount_${i}" value="1" min="1" />
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", phaseHtml);
  }

  for (let i = 0; i < PhaseCount; i++) {
    UpdateMapDisplayForPhase(i);
  }

  if (PhaseCount < 5) {
    const addButton = `<button type="button" class="btn-add-phase" onclick="AddPhase()">+ Add New Phase</button>`;
    container.insertAdjacentHTML("beforeend", addButton);
  }
}

function UpdateMapDisplayForPhase(phaseIndex) {
  const display = document.getElementById(`mapDisplay_${phaseIndex}`);
  const input = document.getElementById(`mapSelect_${phaseIndex}`);
  if (!display || !input) return;

  display.style.marginTop = "10px";
  display.style.padding = "12px 16px";
  display.style.background = "rgba(15, 15, 30, 0.5)";
  display.style.borderRadius = "10px";
  display.style.border = "1.5px solid rgba(34, 197, 94, 0.15)";
  display.style.fontSize = "13px";
  display.style.fontWeight = "600";
  display.style.minHeight = "38px";
  display.style.display = "flex";
  display.style.alignItems = "center";
  display.style.color = "#22c55e";

  const selectedMaps = SelectedMapsByPhase[phaseIndex] || [];
  if (selectedMaps.length === 0) {
    display.textContent = "Select Map(s)";
    return;
  }

  // Mostra tutte le mappe selezionate
  const mapNames = selectedMaps.map(code => {
    const mapName = Object.keys(MAPS).find((name) => MAPS[name] === code) || code;
    return mapName;
  });
  
  display.textContent = `Selected: ${mapNames.join(", ")}`;
  
  // Aggiorna anche l'input hidden
  input.value = selectedMaps.join(", ");
}

function AddPhase() {
  if (PhaseCount < 5) {
    PhaseCount++;
    RenderPhases();
    CalculatePhaseValues();
  }
}

function RemovePhase(index) {
  PhaseCount--;
  RenderPhases();
  CalculatePhaseValues();
}

function OpenEmoteSelector() {
  const modal = document.getElementById("emoteModal");
  modal.classList.add("active");
  RenderEmoteGrid();
  UpdateAllEmotesButton();
}

function CloseEmoteModal() {
  const modal = document.getElementById("emoteModal");
  modal.classList.remove("active");
}

function RenderEmoteGrid(filter = "") {
  const grid = document.getElementById("emoteGrid");
  const filteredEmotes = Object.entries(EMOTES).filter(([name, id]) =>
    name.toLowerCase().includes(filter.toLowerCase()) && id !== -1
  );

  grid.innerHTML = filteredEmotes
    .map(
      ([name, id]) => `
    <div class="emote-item ${SelectedEnabledEmotes.includes(id) ? "selected" : ""}" 
         onclick="ToggleEmote(${id})">
      ${escapeHtml(name)}
    </div>
  `
    )
    .join("");
}

function ToggleEmote(emoteId) {
  const parsedId = parseInt(emoteId);
  const index = SelectedEnabledEmotes.indexOf(parsedId);

  if (index > -1) {
    SelectedEnabledEmotes.splice(index, 1);
  } else {
    const onlyIds = Object.entries(EMOTES)
      .filter(([name]) => name.toLowerCase().includes("only"))
      .map(([, id]) => id);
    
    const emoteName = Object.keys(EMOTES).find(name => EMOTES[name] === parsedId);
    const isOnlyEmote = emoteName && emoteName.toLowerCase().includes("only");
    
    if (isOnlyEmote) {
      const normalEmoteIds = Object.entries(EMOTES)
        .filter(([name, id]) => !name.toLowerCase().includes("only") && id !== -1)
        .map(([, id]) => id);
      SelectedEnabledEmotes = SelectedEnabledEmotes.filter((id) => !onlyIds.includes(id) && !normalEmoteIds.includes(id));
      SelectedEnabledEmotes.push(parsedId);
    } else {
      SelectedEnabledEmotes = SelectedEnabledEmotes.filter((id) => !onlyIds.includes(id));
      SelectedEnabledEmotes.push(parsedId);
    }
  }

  const searchValue = document.getElementById("emoteSearch").value;
  RenderEmoteGrid(searchValue);
  UpdateEmoteDisplay();
  UpdateAllEmotesButton();
}

function UpdateEmoteDisplay() {
  const display = document.getElementById("selectedEmotesDisplay");
  const allEmoteIds = Object.entries(EMOTES)
    .filter(([name, id]) => id !== -1 && !name.toLowerCase().includes("only"))
    .map(([, id]) => id);
  
  // Emote speciali che NON vengono salvate nel database quando selezionate
  const specialEmoteIds = [
    EMOTES["Invisibility"],      // 174
    EMOTES["Punch"],             // 9
    EMOTES["Fire Punch"],        // 85
    EMOTES["Banana"],            // 55
    EMOTES["Golden Banana"],     // 122
    EMOTES["MrBeast Case"],      // 155
    EMOTES["Ball"],              // 156
    EMOTES["Hug"],               // 8
    EMOTES["Charged Hug"],       // 124
    EMOTES["Kick"],              // 13
    EMOTES["Wet Kick"]           // 123
  ].filter(id => id !== undefined); // Filtra eventuali emote non più presenti
  
  // Filtra solo le emote speciali selezionate (escludi le emote "only")
  const selectedSpecialEmotes = SelectedEnabledEmotes.filter(id => specialEmoteIds.includes(id));
  
  // Filtra le emote "only" selezionate
  const onlyIds = Object.entries(EMOTES)
    .filter(([name]) => name.toLowerCase().includes("only"))
    .map(([, id]) => id);
  const selectedOnlyEmotes = SelectedEnabledEmotes.filter(id => onlyIds.includes(id));
  
  // Filtra le emote normali selezionate (escludi speciali e "only")
  const selectedNormalEmotes = SelectedEnabledEmotes.filter(id => 
    !specialEmoteIds.includes(id) && !onlyIds.includes(id) && id > 0
  );
  
  // Controlla se tutte le emote normali sono selezionate
  const allNormalEmotesSelected = allEmoteIds.length > 0 && 
    allEmoteIds.every(id => SelectedEnabledEmotes.includes(id));
  
  // Controlla se tutte le emote speciali sono selezionate
  const allSpecialEmotesSelected = specialEmoteIds.length > 0 && 
    specialEmoteIds.every(id => SelectedEnabledEmotes.includes(id));
  
  // Controlla se tutte le emote (normali + speciali) sono selezionate
  const allEmotesSelected = allNormalEmotesSelected && allSpecialEmotesSelected;
  
  // Controlla se tutte le emote normali sono selezionate E nessuna emote speciale è selezionata
  const noSpecialEmotesSelected = selectedSpecialEmotes.length === 0;
  const isNoSpecialEmotes = allNormalEmotesSelected && noSpecialEmotesSelected;
  
  // Controlla se ci sono solo emote "only" selezionate
  const onlyOnlySelected = selectedOnlyEmotes.length > 0 && 
    SelectedEnabledEmotes.length === selectedOnlyEmotes.length;
  
  if (SelectedEnabledEmotes.length === 0) {
    // Nessuna emote selezionata (nemmeno le "only") -> All Enabled
    display.textContent = "All Enabled";
    display.style.color = "#22c55e";
  } else if (allEmotesSelected && selectedOnlyEmotes.length === 0) {
    // Tutte le emote (normali + speciali) selezionate ma nessuna "only" -> No Special Emotes in rosso
    display.textContent = "No Special Emotes";
    display.style.color = "#ef4444";
  } else if (isNoSpecialEmotes && selectedOnlyEmotes.length === 0) {
    // Tutte le emote normali selezionate, nessuna speciale, nessuna "only" -> No Special Emotes in rosso
    display.textContent = "No Special Emotes";
    display.style.color = "#ef4444";
  } else if (allSpecialEmotesSelected && !allNormalEmotesSelected && selectedOnlyEmotes.length === 0) {
    // Tutte le emote speciali selezionate ma non tutte le normali -> No Special Emotes
    display.textContent = "No Special Emotes";
    display.style.color = "#ef4444";
  } else if (selectedSpecialEmotes.length > 0 && selectedNormalEmotes.length === 0 && selectedOnlyEmotes.length === 0) {
    // Solo emote speciali selezionate (ma non tutte) -> mostra i nomi
    const names = SelectedEnabledEmotes
      .map((id) => {
        const emoteName = Object.keys(EMOTES).find(name => EMOTES[name] === id);
        return emoteName;
      })
      .filter(name => name !== undefined && name !== null)
      .join(", ");
    if (names) {
      display.textContent = `Enabled: ${names}`;
      display.style.color = "#22c55e";
    } else {
      display.textContent = "No Special Emotes";
      display.style.color = "#ef4444";
    }
  } else {
    // Mostra tutte le emote selezionate (incluse le "only" che hanno ID negativi)
    const names = SelectedEnabledEmotes
      .map((id) => {
        const emoteName = Object.keys(EMOTES).find(name => EMOTES[name] === id);
        return emoteName;
      })
      .filter(name => name !== undefined && name !== null)
      .join(", ");
    if (names) {
      display.textContent = `Enabled: ${names}`;
      display.style.color = "#22c55e";
    } else {
      display.textContent = "No Special Emotes";
      display.style.color = "#ef4444";
    }
  }
}

function SelectAllEmotes() {
  const allEmoteIds = Object.entries(EMOTES)
    .filter(([name, id]) => id !== -1 && !name.toLowerCase().includes("only"))
    .map(([, id]) => id);
  
  const allSelected = allEmoteIds.length === SelectedEnabledEmotes.length && 
                      allEmoteIds.every(id => SelectedEnabledEmotes.includes(id));
  
  if (allSelected) {
    SelectedEnabledEmotes = [];
  } else {
    SelectedEnabledEmotes = [...allEmoteIds];
  }
  
  const searchValue = document.getElementById("emoteSearch").value;
  RenderEmoteGrid(searchValue);
  UpdateEmoteDisplay();
  UpdateAllEmotesButton();
}

function UpdateAllEmotesButton() {
  const button = document.querySelector('#emoteModal button[onclick="SelectAllEmotes()"]');
  if (!button) return;
  
  const allEmoteIds = Object.entries(EMOTES)
    .filter(([name, id]) => id !== -1 && !name.toLowerCase().includes("only"))
    .map(([, id]) => id);
  const allSelected = allEmoteIds.length === SelectedEnabledEmotes.length && 
                      allEmoteIds.every(id => SelectedEnabledEmotes.includes(id));
  
  if (allSelected) {
    button.textContent = "Deselect No Emote";
    button.style.backgroundColor = "#ef4444";
    button.style.color = "#ffffff";
  } else {
    button.textContent = "No Emote";
    button.style.backgroundColor = "";
    button.style.color = "";
  }
}

function EnsureColorDisplay() {
  const colorInput = document.getElementById("tournamentColor");
  if (!colorInput) return;

  if (document.getElementById("selectedColorDisplay")) return;

  const display = document.createElement("div");
  display.id = "selectedColorDisplay";
  
  colorInput.parentNode.insertBefore(display, colorInput.nextSibling);
}

function UpdateColorDisplay() {
  EnsureColorDisplay();
  
  const display = document.getElementById("selectedColorDisplay");
  const colorInput = document.getElementById("tournamentColor");
  if (!display || !colorInput) return;

  display.style.marginTop = "10px";
  display.style.padding = "12px 16px";
  display.style.background = "rgba(15, 15, 30, 0.5)";
  display.style.borderRadius = "10px";
  display.style.border = "1.5px solid rgba(34, 197, 94, 0.15)";
  display.style.fontSize = "13px";
  display.style.fontWeight = "600";
  display.style.minHeight = "38px";
  display.style.display = "flex";
  display.style.alignItems = "center";
  display.style.color = "#22c55e";

  const colorValue = colorInput.value || "#22c55e";
  display.textContent = `Selected: ${colorValue.toUpperCase()}`;
  display.style.borderLeft = `4px solid ${colorValue}`;
}

function BuildEmotesTextForWebhook() {
  const allEmoteIds = Object.values(EMOTES).filter((id) => id !== -1);
  if (SelectedEnabledEmotes.length === 0) return "All emotes disabled";
  if (SelectedEnabledEmotes.length === allEmoteIds.length) return "All emotes enabled";

  const names = SelectedEnabledEmotes
    .map((id) => Object.keys(EMOTES).find((name) => EMOTES[name] === id) || id)
    .join(", ");
  return names || "N/A";
}

async function SendWebhookViaPhp(tournament) {
  try {
    const response = await fetch("index.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tournament),
    });
    const result = await response.json();
  } catch (e) {
  }
}

function OpenMapSelector(phaseIndex) {
  CurrentMapPhaseIndex = phaseIndex;
  const modal = document.getElementById("mapModal");
  modal.classList.add("active");
  EnsureMapModalFooter();
  RenderMapGrid();
  UpdateMapModalDisplay();
}

function CloseMapModal() {
  const modal = document.getElementById("mapModal");
  modal.classList.remove("active");
  CurrentMapPhaseIndex = null;
}

function RenderMapGrid(filter = "") {
  const grid = document.getElementById("mapGrid");
  const selectedMaps = SelectedMapsByPhase[CurrentMapPhaseIndex] || [];
  const roundCount = parseInt(document.getElementById(`roundCount_${CurrentMapPhaseIndex}`)?.value) || 1;
  const isMaxReached = selectedMaps.length >= roundCount;

  const filteredMaps = Object.entries(MAPS).filter(([name, code]) => 
    name.toLowerCase().includes(filter.toLowerCase())
  );

  grid.innerHTML = filteredMaps
    .map(
      ([name, code]) => {
        const isSelected = selectedMaps.includes(code);
        const isDisabled = !isSelected && isMaxReached;
        return `
    <div class="map-item ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}" 
         onclick='${isDisabled ? "" : `SelectMap(${JSON.stringify(code)}, ${JSON.stringify(name)})`}'
         style="${isDisabled ? "opacity: 0.5; cursor: not-allowed; pointer-events: none;" : ""}">
      ${escapeHtml(name)}
    </div>
  `;
      }
    )
    .join("");

  UpdateMapModalDisplay();
}

function SelectMap(mapKey, mapName) {
  if (CurrentMapPhaseIndex !== null) {
    const roundCount = parseInt(document.getElementById(`roundCount_${CurrentMapPhaseIndex}`).value) || 1;
    const selectedMaps = SelectedMapsByPhase[CurrentMapPhaseIndex] || [];
    
    // Controlla se la mappa è già selezionata
    const mapIndex = selectedMaps.indexOf(mapKey);
    
    if (mapIndex > -1) {
      // Rimuovi la mappa se già selezionata
      selectedMaps.splice(mapIndex, 1);
    } else {
      // Controlla se si può aggiungere una nuova mappa (non superare il limite dei round)
      if (selectedMaps.length >= roundCount) {
        // Mostra un messaggio di errore se si supera il limite
        ShowMessage(`You can select a maximum of ${roundCount} map(s) for this phase (based on round count)`, true);
        return;
      }
      // Aggiungi la mappa
      selectedMaps.push(mapKey);
    }
    
    SelectedMapsByPhase[CurrentMapPhaseIndex] = selectedMaps;
    
    // Aggiorna l'input hidden con tutte le mappe separate da virgola e spazio
    const input = document.getElementById(`mapSelect_${CurrentMapPhaseIndex}`);
    if (input) {
      input.value = selectedMaps.join(", ");
    }

    UpdateMapDisplayForPhase(CurrentMapPhaseIndex);

    const searchValue = document.getElementById("mapSearch").value;
    RenderMapGrid(searchValue);
  }
}

window.HandleLogout = HandleLogout;
window.SwitchTab = SwitchTab;
window.EditTournament = EditTournament;
window.DeleteTournament = DeleteTournament;
window.OpenEmoteSelector = OpenEmoteSelector;
window.CloseEmoteModal = CloseEmoteModal;
window.ToggleEmote = ToggleEmote;
window.SelectAllEmotes = SelectAllEmotes;
window.OpenMapSelector = OpenMapSelector;
window.CloseMapModal = CloseMapModal;
window.SelectMap = SelectMap;
window.CalculatePhaseValues = CalculatePhaseValues;
window.AddPhase = AddPhase;
window.RemovePhase = RemovePhase;
window.RefreshTournaments = LoadTournaments;

document.getElementById("emoteSearch").addEventListener("input", (e) => {
  RenderEmoteGrid(e.target.value);
});

document.getElementById("mapSearch").addEventListener("input", (e) => {
  RenderMapGrid(e.target.value);
});

document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("usernameInput").value;
  const password = document.getElementById("passwordInput").value;
  HandleLogin(username, password);
});

document.getElementById("tournamentForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const maxInvites = parseInt(document.getElementById("maxInvites").value);
  const partySize = parseInt(document.getElementById("partySize").value);
  const minPlayers = 2;
  const maxPlayers = 2;

  const phases = [];
  let totalRounds = 0;

  for (let i = 0; i < PhaseCount; i++) {
    const phaseType = parseInt(document.getElementById(`phaseType_${i}`).value);
    const maxTeams = Math.floor(maxInvites / partySize);

    let roundCount;
    if (phaseType === 2) {
      roundCount = CalculateTotalRounds(maxTeams, minPlayers, maxPlayers);
    } else if (phaseType === 3 || phaseType === 1) {
      roundCount = 6;
    } else {
      roundCount = CalculateTotalRounds(maxTeams, minPlayers, maxPlayers);
    }

    totalRounds += roundCount;

    const selectedMaps = SelectedMapsByPhase[i] || [];
    const mapInput = document.getElementById(`mapSelect_${i}`).value;
    
    // Se ci sono mappe selezionate nell'array, usale, altrimenti usa l'input (per retrocompatibilità)
    let mapsArray = selectedMaps.length > 0 ? selectedMaps : (mapInput ? mapInput.split(", ").filter(m => m.trim()) : []);
    
    phases.push({
      PhaseType: phaseType,
      Maps: mapsArray,
      IsPhase: document.getElementById(`isPhase_${i}`).checked,
      GroupCount: parseInt(document.getElementById(`groupCount_${i}`).value),
      RoundCount: roundCount,
      MaxTeams: maxTeams,
    });
  }

  const hasAtLeastOneMap = phases.some(phase => {
    if (Array.isArray(phase.Maps)) {
      return phase.Maps.length > 0 && phase.Maps.some(m => m && m.trim() !== "");
    }
    if (typeof phase.Maps === "string") {
      return phase.Maps.trim() !== "";
    }
    return false;
  });
  if (!hasAtLeastOneMap) {
    ShowMessage("At least one map must be selected for tournament creation", true);
    return;
  }

  const prizePos1El = document.getElementById("prizePos1");
  const gemAmount = prizePos1El ? parseInt(prizePos1El.value, 10) : 0;
  if (!isNaN(gemAmount) && gemAmount > 5000) {
    ShowMessage("Il massimo di gemme consentito è 5000.", true);
    return;
  }

  const wprizepoolVal = document.getElementById("wprizepool")?.value?.trim();
  if (wprizepoolVal && wprizepoolVal !== "" && maxInvites < 32) {
    ShowMessage("Per usare il prizepool W sono richiesti almeno 32 giocatori (Max Players ≥ 32).", true);
    return;
  }

  const invitedIdsInput = document.getElementById("invitedIds").value.trim();
  const invitedIds = invitedIdsInput
    ? invitedIdsInput
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id && /^\d+$/.test(id))
    : [];

  const tournamentId = EditingTournamentId || GenerateTournamentId();
  let colorValue = document.getElementById("tournamentColor").value;
  if (!colorValue || !/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
    colorValue = '#22c55e';
  }
  const colorWithAlpha = colorValue.length === 7 ? colorValue + "ff" : colorValue;

  const streamUrlValue = document.getElementById("streamUrl").value.trim();
  const streamUrlArray = streamUrlValue ? [streamUrlValue] : [""];
  const countOnLeaderboardCheckbox = document.getElementById("countOnLeaderboard");
  // Se il checkbox è disabilitato (Max Players < 16), imposta sempre 0
  const countOnLeaderBoard = (countOnLeaderboardCheckbox && !countOnLeaderboardCheckbox.disabled && countOnLeaderboardCheckbox.checked) ? 1 : 0;

  const phasesForDB = phases.map(phase => {
    // Converti l'array di mappe in una stringa con virgola e spazio per il database
    let mapsValue = "";
    if (Array.isArray(phase.Maps) && phase.Maps.length > 0) {
      mapsValue = phase.Maps.join(", ");
    } else if (typeof phase.Maps === "string" && phase.Maps.trim()) {
      mapsValue = phase.Maps;
    }
    
    const phaseObj = {
      PhaseType: phase.PhaseType.toString(),
      Maps: mapsValue, // Salva come stringa con formato "mappa1, mappa2"
      IsPhase: phase.IsPhase,
      RoundCount: phase.RoundCount,
      MaxTeams: phase.MaxTeams,
    };
    if (phase.GroupCount && phase.GroupCount > 1) {
      phaseObj.GroupCount = phase.GroupCount;
    }
    return phaseObj;
  });

  let tournamentImage = document.getElementById("tournamentImage").value.trim();
  if (!tournamentImage) {
    tournamentImage = "https://i.imgur.com/BbqF8LO.png";
  }
  
  const formData = {
    TournamentId: tournamentId,
    TournamentName: document.getElementById("tournamentName").value.trim(),
    TournamentImage: tournamentImage,
    TournamentColor: colorWithAlpha,
    StartTime: formatMongoDate(document.getElementById("startTime").value),
    SignupStart: formatMongoDate(document.getElementById("signupStart").value),
    MaxInvites: maxInvites,
    PartySize: partySize,
    MinPlayersPerMatch: 2,
    MaxPlayersPerMatch: 2,
    EntryFee: parseInt(document.getElementById("entryFee").value),
    PrizeType: document.getElementById("prizeType")?.value?.trim() || "gems",
    Wprizepool: (() => {
      const value = document.getElementById("wprizepool")?.value?.trim();
      return value && value !== "" ? value : undefined;
    })(),
    Prizes: (() => {
      const list = [];
      const el = document.getElementById(`prizePos1`);
      const amount = el ? parseInt(el.value, 10) : 0;
      if (!isNaN(amount) && amount >= 0) {
        const cappedAmount = Math.min(amount, 5000);
        list.push({ position: 1, amount: cappedAmount, delivered: false });
      }
      return list;
    })(),
    Region: document.getElementById("region").value,
    TournamentType: parseInt(document.getElementById("tournamentType").value),
    CountOnLeaderBoard: countOnLeaderBoard,
    Status: 1,
    CurrentPhaseId: EditingTournamentId ? (window.currentTournamentData?.CurrentPhaseId || 0) : 0,
    RoundCount: totalRounds,
    Phases: phasesForDB,
    Properties: {
      IsInvitationOnly: document.getElementById("isInviteOnly").checked,
      InvitedIds: invitedIds,
      AdminIds: (() => {
        const existing =
          EditingTournamentId ? (window.currentTournamentData?.Properties?.AdminIds || []) : [];
        return Array.from(new Set([...(existing || []), 301935]));
      })(),
      DisabledEmotes: (() => {
        // Emote speciali che NON devono essere inviate al database quando selezionate
        const specialEmoteIds = [
          EMOTES["Invisibility"],      // 174
          EMOTES["Punch"],             // 9
          EMOTES["Fire Punch"],        // 85
          EMOTES["Banana"],            // 55
          EMOTES["Golden Banana"],     // 122
          EMOTES["MrBeast Case"],      // 155
          EMOTES["Ball"],              // 156
          EMOTES["Hug"],               // 8
          EMOTES["Charged Hug"],       // 124
          EMOTES["Kick"],              // 13
          EMOTES["Wet Kick"]           // 123
        ].filter(id => id !== undefined); // Filtra eventuali emote non più presenti
        
        // Ottieni tutte le emote normali (escludendo quelle con "only" nel nome)
        const normalEmoteIds = Object.entries(EMOTES)
          .filter(([name, id]) => id > 0 && !name.toLowerCase().includes("only"))
          .map(([, id]) => id);
        
        const onlyIds = Object.entries(EMOTES)
          .filter(([name]) => name.toLowerCase().includes("only"))
          .map(([, id]) => id);
        
        // Ottieni tutte le emote (normali + speciali, escludendo le "only")
        const allEmoteIdsExceptOnly = [...normalEmoteIds, ...specialEmoteIds];
        
        const selectedOnlyEmotes = SelectedEnabledEmotes.filter(id => onlyIds.includes(id));
        const selectedSpecialEmotes = SelectedEnabledEmotes.filter(id => specialEmoteIds.includes(id));
        const selectedNormalEmotes = SelectedEnabledEmotes.filter(id => 
          !specialEmoteIds.includes(id) && !onlyIds.includes(id) && id > 0
        );
        
        // Controlla se tutte le emote normali sono selezionate
        const allNormalEmotesSelected = normalEmoteIds.length > 0 && 
          normalEmoteIds.every(id => selectedNormalEmotes.includes(id));
        
        // Controlla se tutte le emote speciali sono selezionate
        const allSpecialEmotesSelected = specialEmoteIds.length > 0 && 
          specialEmoteIds.every(id => selectedSpecialEmotes.includes(id));
        
        // Se tutte le emote (normali e speciali) sono selezionate, non disabilitare nessuna emote
        const allEmotesSelected = allNormalEmotesSelected && allSpecialEmotesSelected;
        
        const result = [];
        
        // Caso 1: Se non seleziona nulla (nemmeno le "only"), significa che tutte le emote sono consentite
        // NON inviare alcun valore al database (array vuoto)
        if (SelectedEnabledEmotes.length === 0) {
          // Non aggiungere nulla - tutte le emote sono consentite
          return [];
        }
        
        // Caso 2: Se seleziona "no emote" (tutte le emote normali, con o senza emote speciali)
        // Questo caso si verifica quando tutte le emote normali sono selezionate
        // In questo caso, invia tutte le emote normali e speciali in DisabledEmotes
        // Questo caso deve essere controllato PRIMA del caso "tutte le emote selezionate"
        // Controlla esplicitamente se tutte le emote normali sono selezionate
        const allNormalSelected = normalEmoteIds.length > 0 && 
          normalEmoteIds.every(id => SelectedEnabledEmotes.includes(id));
        
        if (allNormalSelected && selectedOnlyEmotes.length === 0) {
          // Invia tutte le emote normali e speciali (tutte tranne le "only")
          result.push(...allEmoteIdsExceptOnly);
          return Array.from(new Set(result));
        }
        
        // Caso 4: Se ha selezionato solo emote "only" (senza normali o speciali)
        if (selectedOnlyEmotes.length > 0 && selectedNormalEmotes.length === 0 && selectedSpecialEmotes.length === 0) {
          // Invia SOLO le emote "only" selezionate (come valori negativi)
          result.push(...selectedOnlyEmotes);
          return Array.from(new Set(result));
        }
        
        // Caso 5: Se ha selezionato emote "only" insieme ad altre emote
        if (selectedOnlyEmotes.length > 0) {
          // Aggiungi tutte le emote tranne quelle selezionate (normali, speciali)
          const disabledEmotes = allEmoteIdsExceptOnly.filter(id => 
            !selectedNormalEmotes.includes(id) && !selectedSpecialEmotes.includes(id)
          );
          result.push(...disabledEmotes);
          // Aggiungi le emote "only" selezionate come valori negativi
          result.push(...selectedOnlyEmotes);
          return Array.from(new Set(result));
        }
        
        // Caso 6: Se ha selezionato alcune emote speciali (ma non tutte le normali)
        if (selectedSpecialEmotes.length > 0) {
          // Aggiungi tutte le emote tranne le "only" e quelle selezionate
          const disabledEmotes = allEmoteIdsExceptOnly.filter(id => 
            !selectedSpecialEmotes.includes(id) && !selectedNormalEmotes.includes(id)
          );
          result.push(...disabledEmotes);
          return Array.from(new Set(result));
        }
        
        // Caso 7: Se ha selezionato solo emote normali (ma non tutte)
        if (selectedNormalEmotes.length > 0 && !allNormalEmotesSelected) {
          // Aggiungi tutte le emote tranne le "only" e quelle normali selezionate
          const disabledEmotes = allEmoteIdsExceptOnly.filter(id => 
            !selectedNormalEmotes.includes(id)
          );
          result.push(...disabledEmotes);
          return Array.from(new Set(result));
        }
        
        return Array.from(new Set(result));
      })(),
      SelectedSpecialEmotes: (() => {
        // Salva le emote speciali selezionate in un campo separato per poterle recuperare
        const specialEmoteIds = [
          EMOTES["Invisibility"],      // 174
          EMOTES["Punch"],             // 9
          EMOTES["Fire Punch"],        // 85
          EMOTES["Banana"],            // 55
          EMOTES["Golden Banana"],     // 122
          EMOTES["MrBeast Case"],      // 155
          EMOTES["Ball"],              // 156
          EMOTES["Hug"],               // 8
          EMOTES["Charged Hug"],       // 124
          EMOTES["Kick"],              // 13
          EMOTES["Wet Kick"]           // 123
        ].filter(id => id !== undefined); // Filtra eventuali emote non più presenti
        
        // Ottieni tutte le emote normali (escludendo quelle con "only" nel nome)
        const normalEmoteIds = Object.entries(EMOTES)
          .filter(([name, id]) => id > 0 && !name.toLowerCase().includes("only"))
          .map(([, id]) => id);
        
        const onlyIds = Object.entries(EMOTES)
          .filter(([name]) => name.toLowerCase().includes("only"))
          .map(([, id]) => id);
        
        const selectedSpecialEmotes = SelectedEnabledEmotes.filter(id => specialEmoteIds.includes(id));
        const selectedNormalEmotes = SelectedEnabledEmotes.filter(id => 
          !specialEmoteIds.includes(id) && !onlyIds.includes(id) && id > 0
        );
        
        // Controlla se tutte le emote normali sono selezionate
        const allNormalEmotesSelected = normalEmoteIds.length > 0 && 
          normalEmoteIds.every(id => selectedNormalEmotes.includes(id));
        
        // Controlla se tutte le emote speciali sono selezionate
        const allSpecialEmotesSelected = specialEmoteIds.length > 0 && 
          specialEmoteIds.every(id => selectedSpecialEmotes.includes(id));
        
        // Se tutte le emote (normali e speciali) sono selezionate, salva tutte le emote speciali
        const allEmotesSelected = allNormalEmotesSelected && allSpecialEmotesSelected;
        
        if (allEmotesSelected) {
          // Tutte le emote sono selezionate -> salva tutte le emote speciali
          return Array.from(new Set(specialEmoteIds));
        } else {
          // Salva solo le emote speciali effettivamente selezionate
          return selectedSpecialEmotes.length > 0 ? Array.from(new Set(selectedSpecialEmotes)) : [];
        }
      })(),
      StreamURL: streamUrlArray,
    },
    // Prizes and PrizeType are built above from form inputs
    Winners: EditingTournamentId ? (window.currentTournamentData?.Winners || []) : [],
  };

  if (!EditingTournamentId) {
    formData.CurrentInvites = 0;
  } else {
    if (window.currentTournamentData?.CurrentInvites !== undefined) {
      formData.CurrentInvites = window.currentTournamentData.CurrentInvites;
    }
  }

  try {
    const url = EditingTournamentId
      ? `${API_URL}/Tournaments/${encodeURIComponent(EditingTournamentId)}`
      : `${API_URL}/Tournaments`;
    const method = EditingTournamentId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AuthToken}`,
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (response.ok) {
      ShowMessage(EditingTournamentId ? "Tournament updated successfully!" : "Tournament created successfully!");

      if (!EditingTournamentId) {
        await SendWebhookViaPhp(formData);
      }

      const notification = document.createElement("div");
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(34, 197, 94, 0.95);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 700;
        z-index: 9999;
        animation: slideUp 0.3s ease;
        box-shadow: 0 8px 32px rgba(34, 197, 94, 0.4);
      `;
      notification.textContent = EditingTournamentId ? "✓ Tournament Updated" : "✓ Tournament Created";
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);

      ResetCreateForm();
      setTimeout(() => {
        SwitchTab("view", { target: document.querySelectorAll(".tab-btn")[1] });
      }, 1000);
    } else {
      ShowMessage(data.Message || "Error saving tournament", true);
    }
  } catch (error) {
    ShowMessage("Connection error. Please try again.", true);
  }
});

document.getElementById("searchInput").addEventListener("input", FilterTournaments);
document.getElementById("statusFilter").addEventListener("change", FilterTournaments);

function FilterTournaments() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;
  const items = document.querySelectorAll(".tournament-item");

  items.forEach((item) => {
    const titleEl = item.querySelector(".tournament-title");
    const idEl = item.querySelector(".tournament-id");
    const text = (titleEl?.textContent || "") + " " + (idEl?.textContent || "");
    const status = item.getAttribute("data-status");
    const matchesSearch = text.toLowerCase().includes(searchTerm);
    const matchesStatus = !statusFilter || status === statusFilter;
    item.style.display = matchesSearch && matchesStatus ? "grid" : "none";
  });
}

function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function SetDefaultTimes() {
  const now = new Date();
  
  const signupTime = new Date(now);
  signupTime.setMinutes(signupTime.getMinutes() + 7);
  document.getElementById("signupStart").value = formatLocalDateTime(signupTime);
  
  const startTime = new Date(now);
  startTime.setMinutes(startTime.getMinutes() + 10);
  document.getElementById("startTime").value = formatLocalDateTime(startTime);
}

function StartTimeUpdateTimer() {
  SetDefaultTimes();
}


document.getElementById("maxInvites").addEventListener("change", () => {
  CalculatePhaseValues();
  UpdateCountOnLeaderboardAvailability();
  UpdateWprizepoolAvailability();
});
document.getElementById("partySize").addEventListener("change", () => {
  UpdateMaxInvitesOptions();
  CalculatePhaseValues();
});
const colorInput = document.getElementById("tournamentColor");
if (colorInput) {
  colorInput.addEventListener("input", UpdateColorDisplay);
  colorInput.addEventListener("change", UpdateColorDisplay);
}

const prizePos1Input = document.getElementById("prizePos1");
if (prizePos1Input) {
  prizePos1Input.addEventListener("blur", () => {
    const val = parseInt(prizePos1Input.value, 10);
    if (!isNaN(val) && val > 5000) {
      prizePos1Input.value = "5000";
    }
  });
}

UpdateMaxInvitesOptions();
RenderPhases();
UpdateEmoteDisplay();
UpdateColorDisplay();
CalculatePhaseValues();
CheckSavedLogin();