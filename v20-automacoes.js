/**
 * =============================================================================
 * FICHA V20 — MÓDULO DE REGRAS, AUTOMAÇÕES E FERRAMENTAS ESTENDIDAS
 * =============================================================================
 * Carregado ANTES do app.js. Tudo aqui é global, mas só é executado depois do
 * DOMContentLoaded, quando AppState, UIRenderer e LinkCableSystem já existem.
 *
 * Conteúdo:
 *   0. Armazenamento seguro (fallback em memória)
 *   1. Utilitários
 *   2. Presets de Clãs e Linhagens (Disciplinas + Fraqueza)
 *   3. Regras derivadas: ferimentos, Força de Vontade, Sangue, bônus físicos
 *   4. Motor de dados D10 (V20) + formatos de comando externos
 *   5. Desfazer / Refazer (UndoManager)
 *   6. Diálogos góticos (substituem prompt/confirm)
 *   7. Seletor de Clã, estatísticas derivadas e medidor de sangue
 *   8. Arsenal de combate (ataque, dano, absorção)
 *   9. Qualidades & Defeitos com calculadora de pontos de bônus
 *  10. Markdown leve para anotações
 *  12. Efeito ambiente de brasas e névoa (Canvas)
 *  13. Renderização e eventos estendidos
 * =============================================================================
 */

'use strict';

// =============================================================================
// 0. ARMAZENAMENTO SEGURO
// Se o navegador bloquear o localStorage (modo privado estrito, iframe), a ficha
// continua funcionando com um armazenamento em memória durante a sessão.
// =============================================================================
(function ensureStorage() {
  try {
    const probe = '__v20_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch (e) {
    const mem = {};
    const shim = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
      clear: () => { Object.keys(mem).forEach(k => delete mem[k]); },
      key: (i) => Object.keys(mem)[i] || null,
      get length() { return Object.keys(mem).length; }
    };
    try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch (_) { /* sem saída */ }
    window.__V20_MEMORY_STORAGE__ = true;
  }
})();

// =============================================================================
// 1. UTILITÁRIOS
// =============================================================================
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clampInt(val, min, max, fallback = min) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function safeStorageGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignora */ }
}

/** Copia texto para a área de transferência com fallback para execCommand. */
function copyTextToClipboard(text, successMsg) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    ta.style.fontSize = '16px'; // evita zoom no iOS
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length); // iOS ignora select()
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    showToast(ok ? successMsg : 'Não foi possível copiar. Selecione o texto e copie manualmente.', ok ? 'success' : 'danger');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg, 'success')).catch(fallback);
  } else {
    fallback();
  }
}

// =============================================================================
// 2. PRESETS DE CLÃS E LINHAGENS
// Textos de fraqueza são resumos para consulta rápida na mesa.
// =============================================================================
const CLAN_PRESETS = [
  // --- 13 Clãs principais ---
  { key: 'assamita', name: 'Assamita', group: 'clan', disciplines: ['Celeridade', 'Ofuscação', 'Quietus'],
    weakness: 'Maldição Tremere: ingerir vitae de outro vampiro causa 1 nível de dano agravado por ponto de sangue consumido. Diablerie é uma tentação perigosa e vigiada pelo Clã.' },
  { key: 'brujah', name: 'Brujah', group: 'clan', disciplines: ['Celeridade', 'Potência', 'Presença'],
    weakness: 'Fúria à flor da pele: a dificuldade para resistir ao Frenesi é +2. Um Brujah não pode gastar Força de Vontade para evitar o Frenesi (mas pode gastá-la para encerrar um já iniciado).' },
  { key: 'gangrel', name: 'Gangrel', group: 'clan', disciplines: ['Animalismo', 'Fortitude', 'Metamorfose'],
    weakness: 'A Besta marca o corpo: cada Frenesi deixa uma característica animal (olhos, pelagem, garras). O acúmulo dessas marcas reduz permanentemente Atributos Sociais.' },
  { key: 'giovanni', name: 'Giovanni', group: 'clan', disciplines: ['Dominação', 'Necromancia', 'Potência'],
    weakness: 'O Beijo dos Giovanni é doloroso: ao se alimentar de mortais, causa o dobro de dano (2 níveis por ponto de sangue retirado).' },
  { key: 'lasombra', name: 'Lasombra', group: 'clan', disciplines: ['Dominação', 'Tenebrosidade', 'Potência'],
    weakness: 'Não possuem reflexo em espelhos, água ou superfícies polidas, e não aparecem em fotos e vídeos com nitidez. A luz do sol lhes causa um nível extra de dano.' },
  { key: 'malkaviano', name: 'Malkaviano', group: 'clan', disciplines: ['Auspícios', 'Demência', 'Ofuscação'],
    weakness: 'Todo Malkaviano possui ao menos uma perturbação permanente. Ela pode ser contida temporariamente com Força de Vontade, mas nunca curada.' },
  { key: 'nosferatu', name: 'Nosferatu', group: 'clan', disciplines: ['Animalismo', 'Ofuscação', 'Potência'],
    weakness: 'Aparência 0, que nunca pode ser aumentada. Falham automaticamente na maioria dos testes que envolvem Aparência e primeiras impressões.' },
  { key: 'ravnos', name: 'Ravnos', group: 'clan', disciplines: ['Animalismo', 'Fortitude', 'Quimerismo'],
    weakness: 'Cada Ravnos tem um vício ou compulsão (mentir, roubar, trapacear...). Diante da oportunidade, precisa passar em um teste de Autocontrole/Instinto (dif. 6) para resistir.' },
  { key: 'setita', name: 'Seguidores de Set', group: 'clan', disciplines: ['Ofuscação', 'Presença', 'Serpentis'],
    weakness: 'Sensíveis à luz: sofrem 2 níveis extras de dano sob o sol e perdem 1 dado nas paradas quando expostos a luz intensa.' },
  { key: 'toreador', name: 'Toreador', group: 'clan', disciplines: ['Celeridade', 'Auspícios', 'Presença'],
    weakness: 'Arrebatamento: diante de algo de beleza incomum, o Toreador precisa passar em um teste de Autocontrole/Instinto (dif. 6) ou fica fascinado pela cena.' },
  { key: 'tremere', name: 'Tremere', group: 'clan', disciplines: ['Auspícios', 'Dominação', 'Taumaturgia'],
    weakness: 'Todo Tremere já carrega o primeiro estágio de um Laço de Sangue com os anciões do Clã; basta menos vitae para completá-lo.' },
  { key: 'tzimisce', name: 'Tzimisce', group: 'clan', disciplines: ['Animalismo', 'Auspícios', 'Vicissitude'],
    weakness: 'Precisa repousar com ao menos dois punhados de terra de um lugar importante da vida mortal. Sem ela, as paradas de dados caem pela metade a cada 24 horas (mínimo de 1 dado).' },
  { key: 'ventrue', name: 'Ventrue', group: 'clan', disciplines: ['Dominação', 'Fortitude', 'Presença'],
    weakness: 'Paladar exigente: só consegue se alimentar de um tipo específico de mortal (definido na criação). Outro sangue é vomitado e não nutre.' },
  // --- Sem clã ---
  { key: 'caitiff', name: 'Caitiff', group: 'other', disciplines: [],
    weakness: 'Sem fraqueza mística de clã e sem Disciplinas de clã definidas. Em compensação, carrega o desprezo da sociedade Cainita — o Narrador pode dificultar interações sociais com outros Membros.' },
  // --- Linhagens ---
  { key: 'baali', name: 'Baali', group: 'bloodline', disciplines: ['Daimoinon', 'Ofuscação', 'Presença'],
    weakness: 'Símbolos sagrados e a fé verdadeira os repelem e ferem. A presença de relíquias e locais consagrados os deixa vulneráveis e inquietos.' },
  { key: 'cacofonia', name: 'Filhas da Cacofonia', group: 'bloodline', disciplines: ['Fortitude', 'Melpominee', 'Presença'],
    weakness: 'Ouvem música o tempo todo dentro da cabeça, o que dificulta testes de Percepção e de concentração.' },
  { key: 'gargula', name: 'Gárgulas', group: 'bloodline', disciplines: ['Fortitude', 'Potência', 'Visceratika'],
    weakness: 'Aparência 0 (como os Nosferatu) e mente condicionada: resistem pior à Dominação e a outras formas de controle mental.' },
  { key: 'kiasyd', name: 'Kiasyd', group: 'bloodline', disciplines: ['Dominação', 'Mytherceria', 'Tenebrosidade'],
    weakness: 'Ferro frio causa dano agravado, e o simples contato com ele os perturba. A aparência feérica também os torna chamativos.' },
  { key: 'nagaraja', name: 'Nagaraja', group: 'bloodline', disciplines: ['Auspícios', 'Dominação', 'Necromancia'],
    weakness: 'Precisam consumir carne além de sangue para se sustentar, o que torna a Máscara ainda mais difícil de manter.' },
  { key: 'salubri', name: 'Salubri', group: 'bloodline', disciplines: ['Auspícios', 'Fortitude', 'Obeah'],
    weakness: 'Só podem se alimentar de sangue oferecido de livre vontade; tomá-lo à força custa Força de Vontade. O terceiro olho se abre ao usar poderes, denunciando a linhagem.' },
  { key: 'samedi', name: 'Samedi', group: 'bloodline', disciplines: ['Fortitude', 'Ofuscação', 'Tanatose'],
    weakness: 'Aparência de cadáver em decomposição: Aparência 0, como os Nosferatu.' }
];

function findClanPreset(name) {
  if (!name) return null;
  const clean = name.toString().trim().toLowerCase();
  return CLAN_PRESETS.find(c => c.name.toLowerCase() === clean || c.key === clean) || null;
}

// =============================================================================
// 3. REGRAS DERIVADAS
// =============================================================================

/** Penalidade em dados por nível de Vitalidade (mesma ordem de HEALTH_LEVELS). */
const WOUND_PENALTIES = [0, 1, 1, 2, 2, 5, null];

/** Estado de ferimento atual: o nível mais profundo marcado define a penalidade. */
function getWoundState(char) {
  const health = (char && char.health) || {};
  let deepest = -1;
  HEALTH_LEVELS.forEach((lvl, i) => { if (health[lvl.key]) deepest = i; });
  if (deepest < 0) return { penalty: 0, label: 'Ileso', incapacitated: false, index: -1 };
  const incapacitated = deepest === HEALTH_LEVELS.length - 1;
  return {
    penalty: incapacitated ? 0 : WOUND_PENALTIES[deepest],
    label: HEALTH_LEVELS[deepest].label,
    incapacitated,
    index: deepest
  };
}

/** Força de Vontade disponível = Permanente − caixas marcadas como gastas. */
function getWillpowerAvailable(char) {
  if (!char || !char.status) return 0;
  const perm = parseInt(char.status.willpower_perm, 10) || 0;
  const spent = Array.isArray(char.status.willpower_temp) ? char.status.willpower_temp.filter(Boolean).length : 0;
  return Math.max(0, perm - spent);
}

/** Marca 1 ponto de FV temporária como gasto. Retorna false se não houver pontos. */
function spendWillpower(char, reasonLabel) {
  if (getWillpowerAvailable(char) <= 0) {
    showToast('Força de Vontade temporária esgotada (0). Recupere pontos antes de usar este recurso.', 'danger');
    return false;
  }
  if (!Array.isArray(char.status.willpower_temp) || char.status.willpower_temp.length !== 10) {
    char.status.willpower_temp = Array(10).fill(false);
  }
  const idx = char.status.willpower_temp.findIndex(v => !v);
  if (idx < 0) {
    showToast('Todas as caixas de Força de Vontade já estão marcadas.', 'danger');
    return false;
  }
  char.status.willpower_temp[idx] = true;
  AppState.saveToStorage();
  UIRenderer.renderWillpowerTemp(char);
  LinkCableSystem.refreshNodeValues();
  showToast(`−1 Força de Vontade (${reasonLabel}). Restam ${getWillpowerAvailable(char)}.`, 'info');
  return true;
}

function getBloodCount(char) {
  return (char && char.status && Array.isArray(char.status.blood_pool))
    ? char.status.blood_pool.filter(Boolean).length
    : 0;
}

function ensureTurnState(char) {
  if (!char.status) char.status = {};
  if (typeof char.status.turn_blood_spent !== 'number') char.status.turn_blood_spent = 0;
  if (!char.status.physical_boosts) char.status.physical_boosts = { strength: 0, dexterity: 0, stamina: 0 };
  if (typeof char.status.celerity_actions !== 'number') char.status.celerity_actions = 0;
  if (typeof char.status.potence_active !== 'boolean') char.status.potence_active = false;
  if (typeof char.status.fortitude_active !== 'boolean') char.status.fortitude_active = false;
  return char.status;
}

/**
 * Gasta pontos de sangue respeitando a reserva e o limite por turno da Geração.
 * ignoreTurnLimit é usado para cura agravada (ocorre ao longo de um dia de descanso).
 */
function spendBlood(char, amount, { ignoreTurnLimit = false } = {}) {
  ensureTurnState(char);
  const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
  const available = getBloodCount(char);
  if (available < amount) {
    return { ok: false, reason: `Sangue insuficiente: você tem ${available} e precisa de ${amount}.` };
  }
  if (!ignoreTurnLimit && char.status.turn_blood_spent + amount > rule.bloodPerTurn) {
    return { ok: false, reason: `Limite da ${rule.label}: ${rule.bloodPerTurn} ponto(s) por turno. Clique em "Novo turno" para continuar gastando.` };
  }
  let remaining = amount;
  for (let i = char.status.blood_pool.length - 1; i >= 0 && remaining > 0; i--) {
    if (char.status.blood_pool[i]) { char.status.blood_pool[i] = false; remaining--; }
  }
  if (!ignoreTurnLimit) char.status.turn_blood_spent += amount;
  return { ok: true };
}

/** Confere se o gasto é possível sem gastar nada ainda. */
function canSpendBlood(char, amount, { ignoreTurnLimit = false } = {}) {
  ensureTurnState(char);
  const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
  const available = getBloodCount(char);
  if (available < amount) return { ok: false, reason: `Sangue insuficiente: você tem ${available} e precisa de ${amount}.` };
  if (!ignoreTurnLimit && char.status.turn_blood_spent + amount > rule.bloodPerTurn) {
    const left = Math.max(0, rule.bloodPerTurn - char.status.turn_blood_spent);
    return { ok: false, reason: `Limite da ${rule.label}: restam ${left} ponto(s) neste turno. Clique em "Novo turno" para continuar.` };
  }
  return { ok: true };
}

function getPhysicalBoost(char, key) {
  const boosts = char && char.status && char.status.physical_boosts;
  return boosts ? (parseInt(boosts[key], 10) || 0) : 0;
}

const PHYSICAL_KEYS = { strength: 'Força', dexterity: 'Destreza', stamina: 'Vigor' };

/** Valor de um traço pelo caminho, somando bônus de sangue nos Atributos Físicos. */
function getTraitValue(char, path) {
  if (!char || !path) return 0;
  const base = parseInt(getNestedValue(char, path), 10) || 0;
  const m = path.match(/^attributes\.physical\.(strength|dexterity|stamina)$/);
  return m ? base + getPhysicalBoost(char, m[1]) : base;
}

/** Nome exibido de um traço, lido direto das linhas da ficha. */
function getTraitLabel(path) {
  const row = document.querySelector(`.trait-row[data-trait="${path}"]`);
  return row ? (row.getAttribute('data-label') || path) : path;
}

function findDisciplineLevel(char, regex) {
  if (!char || !Array.isArray(char.disciplines)) return 0;
  const found = char.disciplines.find(d => d && d.name && regex.test(d.name));
  return found ? (parseInt(found.level, 10) || 0) : 0;
}

/** Ações rápidas de sangue: cura, bônus físico, turnos e cenas. */
const BloodActions = {
  healOne({ ignoreTurnLimit = false } = {}) {
    const char = AppState.activeCharacter;
    if (!char) return;
    ensureTurnState(char);
    const states = HEALTH_LEVELS.map(l => char.health[l.key] || '').filter(Boolean);
    if (states.length === 0) {
      showToast('Nenhum ferimento para curar.', 'info');
      return;
    }

    const healableIdx = states.lastIndexOf('lethal') >= 0 ? states.lastIndexOf('lethal') : states.lastIndexOf('bashing');

    const finish = (removeIdx, msg) => {
      states.splice(removeIdx, 1);
      this.compactHealth(char, states);
      AppState.saveToStorage();
      UIRenderer.renderHealthTrack(char);
      UIRenderer.renderBloodPool(char);
      showToast(msg, 'success');
    };

    if (healableIdx >= 0) {
      const kind = states[healableIdx] === 'lethal' ? 'letal' : 'contusivo';
      const res = spendBlood(char, 1, { ignoreTurnLimit });
      if (!res.ok) { showToast(res.reason, 'danger'); return; }
      FX.bloodToHealth(1);
      AmbientAudio.heal();
      finish(healableIdx, `1 nível de dano ${kind} curado (−1 ponto de sangue).`);
      return;
    }

    // Só resta dano agravado: 5 pontos de sangue + 1 dia de descanso por nível (fila de cura)
    const q = AggHealing.queue(char);
    const missing = q.length ? AGG_BLOOD_COST - q[0].blood : 0;
    if (missing > 0) {
      AggHealing.payButton(0, missing);
    } else if (!AggHealing.completeIfReady(char)) {
      showToast('O sangue deste agravado já foi pago. Falta 1 dia de descanso: use 🛌 Dormir.', 'info');
    } else {
      AggHealing.afterChange(char);
      showToast('✨ 1 nível agravado curado.', 'success');
    }
  },

  /** Reorganiza a trilha de Vitalidade: agravado no topo, depois letal, depois contusivo. */
  compactHealth(char, states) {
    const order = { aggravated: 0, lethal: 1, bashing: 2 };
    const sorted = [...states].sort((a, b) => order[a] - order[b]);
    HEALTH_LEVELS.forEach((lvl, i) => { char.health[lvl.key] = sorted[i] || ''; });
  },

  boostPhysical(key) {
    const char = AppState.activeCharacter;
    if (!char || !PHYSICAL_KEYS[key]) return;
    ensureTurnState(char);
    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
    const base = parseInt(char.attributes.physical[key], 10) || 0;
    const current = base + getPhysicalBoost(char, key);
    if (current + 1 > rule.maxTrait) {
      showToast(`${PHYSICAL_KEYS[key]} já está no limite da ${rule.label} (${rule.maxTrait}).`, 'danger');
      return;
    }
    const res = spendBlood(char, 1);
    if (!res.ok) { showToast(res.reason, 'danger'); return; }
    char.status.physical_boosts[key] = getPhysicalBoost(char, key) + 1;
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    UIRenderer.renderAllDots(char);
    LinkCableSystem.refreshNodeValues();
    CombatManager.render(char);
    showToast(`${PHYSICAL_KEYS[key]} +1 até o fim da cena (agora ${current + 1}).`, 'success');
  },

  newTurn() {
    const char = AppState.activeCharacter;
    if (!char) return;
    ensureTurnState(char);
    char.status.turn_blood_spent = 0;
    PhysicalDisciplines.resetTurn(char);
    AmbientAudio.drums(2);
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    PhysicalDisciplines.refreshAll(char);
    showToast('Novo turno: limite de gasto de sangue e ações de Celeridade renovados.', 'info');
  },

  endScene() {
    const char = AppState.activeCharacter;
    if (!char) return;
    ensureTurnState(char);
    char.status.turn_blood_spent = 0;
    char.status.physical_boosts = { strength: 0, dexterity: 0, stamina: 0 };
    PhysicalDisciplines.resetTurn(char);
    AmbientAudio.drums(3);
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    UIRenderer.renderAllDots(char);
    LinkCableSystem.refreshNodeValues();
    PhysicalDisciplines.refreshAll(char);
    showToast('Fim da cena: bônus físicos de sangue e ações de Celeridade encerrados.', 'info');
  }
};

// =============================================================================
// 4. MOTOR DE DADOS D10 (V20) E COMANDOS EXTERNOS
// =============================================================================
const COMMAND_FORMAT_KEY = 'v20_command_format';
const SPECIALTY_KEY = 'v20_roll_specialty_default';

/** Opções do rolador (dock). Vivem na sessão; o formato de comando é persistido. */
const RollOptions = {
  modifier: 0,
  // "10 = 2 sucessos" vem ligado; a escolha fica salva como padrão
  specialty: safeStorageGet(SPECIALTY_KEY, 'on') !== 'off',
  required: clampInt(safeStorageGet('v20_roll_required', '1'), 1, 20, 1),
  autoSuccess: false,
  guaranteed: 0,      // sucessos garantidos (ex.: Potência), não canceláveis por '1'
  applyWounds: true,
  commandFormat: safeStorageGet(COMMAND_FORMAT_KEY, 'vr'),

  reset() {
    this.modifier = 0;
    this.autoSuccess = false;
    this.applyWounds = true;
    this.specialty = safeStorageGet(SPECIALTY_KEY, 'on') !== 'off';
  }
};

/**
 * Probabilidade exata (distribuição de sucessos e de '1's) para uma parada V20.
 * Segue as mesmas regras do DiceEngine.evaluate.
 */
const RollProbability = {
  compute(dice, difficulty, { specialty = true, fixed = 0, required = 1 } = {}) {
    const n = Math.max(0, Math.min(60, dice | 0));
    const d = Math.max(2, Math.min(10, difficulty | 0));
    const pOne = 0.1;
    const pTen = 0.1;
    const pHit = (11 - d) / 10;          // inclui o 10
    const pHitNot10 = pHit - pTen;
    const pBlank = 1 - pOne - pHit;
    const tenValue = specialty ? 2 : 1;
    const maxS = n * tenValue;
    // dp[s][o] = probabilidade de s sucessos brutos e o '1's
    let dp = Array.from({ length: maxS + 1 }, () => new Float64Array(n + 1));
    dp[0][0] = 1;
    for (let k = 0; k < n; k++) {
      const next = Array.from({ length: maxS + 1 }, () => new Float64Array(n + 1));
      for (let s = 0; s <= k * tenValue; s++) {
        const row = dp[s];
        for (let o = 0; o <= k; o++) {
          const p = row[o];
          if (!p) continue;
          if (pBlank > 0) next[s][o] += p * pBlank;
          next[s][o + 1] += p * pOne;
          if (pHitNot10 > 0) next[s + 1][o] += p * pHitNot10;
          next[s + tenValue][o] += p * pTen;
        }
      }
      dp = next;
    }
    let success = 0;
    let botch = 0;
    for (let s = 0; s <= maxS; s++) {
      for (let o = 0; o <= n; o++) {
        const p = dp[s][o];
        if (!p) continue;
        const raw = s - o;
        const net = fixed > 0 ? Math.max(0, raw) + fixed : raw;
        if (net >= required) success += p;
        if (fixed === 0 && s === 0 && o > 0) botch += p;
      }
    }
    return { success, botch };
  },

  pct(p) {
    if (p >= 0.9995) return '100%';
    if (p > 0 && p < 0.005) return '<1%';
    return `${Math.round(p * 100)}%`;
  },

  level(p) {
    if (p >= 0.75) return 'is-good';
    if (p >= 0.4) return 'is-mid';
    return 'is-bad';
  },

  setRequired(value) {
    RollOptions.required = clampInt(value, 1, 20, 1);
    safeStorageSet('v20_roll_required', String(RollOptions.required));
  }
};

const DiceEngine = {
  rollD10() {
    // crypto.getRandomValues quando disponível, com descarte para distribuição uniforme
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint8Array(1);
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= 250);
      return (buf[0] % 10) + 1;
    }
    return Math.floor(Math.random() * 10) + 1;
  },

  rollMany(n) {
    return Array.from({ length: n }, () => this.rollD10());
  },

  /**
   * Avalia uma rolagem V20.
   *  - cada dado >= dificuldade = 1 sucesso (10 vale 2 com especialização)
   *  - cada '1' cancela 1 sucesso
   *  - Falha crítica: nenhum sucesso bruto e ao menos um '1'
   *  - Sucesso automático da FV não é cancelado por '1' e impede a falha crítica
   *  - "Garantidos" funcionam do mesmo jeito (somam sucessos que os '1' não cancelam)
   */
  evaluate(rolls, difficulty, { specialty = false, autoSuccess = false, guaranteed = 0 } = {}) {
    let successes = 0;
    let tenCount = 0;
    let botchCount = 0;
    rolls.forEach(d => {
      if (d === 10) tenCount++;
      if (d === 1) botchCount++;
      if (d >= difficulty) successes += (d === 10 && specialty) ? 2 : 1;
    });

    const rawNet = successes - botchCount;
    const fixed = (autoSuccess ? 1 : 0) + Math.max(0, guaranteed | 0);
    const netSuccesses = fixed > 0 ? Math.max(0, rawNet) + fixed : rawNet;
    const isBotch = fixed === 0 && successes === 0 && botchCount > 0;

    let outcomeBadgeText;
    if (netSuccesses > 0) {
      outcomeBadgeText = `${netSuccesses} Sucesso${netSuccesses > 1 ? 's' : ''}!`;
    } else if (isBotch) {
      outcomeBadgeText = `💥 FALHA CRÍTICA! (${botchCount}x '1')`;
    } else if (rawNet < 0) {
      outcomeBadgeText = 'Falha (sucessos cancelados por 1s)';
    } else {
      outcomeBadgeText = 'Falha Simples (0 sucessos)';
    }

    return { successes, tenCount, botchCount, netSuccesses, isBotch, outcomeBadgeText };
  }
};

const COMMAND_FORMATS = {
  vr:         { label: 'Bot (!vr)' },
  dicemaiden: { label: 'Dice Maiden' },
  roll20:     { label: 'Roll20' },
  foundry:    { label: 'Foundry VTT' }
};

/** Monta o comando de rolagem no formato escolhido. */
function buildRollCommand(format, total, difficulty, label) {
  const n = Math.max(0, total);
  const d = difficulty || 6;
  const note = label ? String(label).replace(/[\r\n]+/g, ' ').trim() : '';
  switch (format) {
    case 'dicemaiden': return `!roll ${n}d10 t${d} f1${note ? ` ! ${note}` : ''}`;
    case 'roll20':     return note ? `&{template:default} {{name=${note}}} {{Resultado=[[${n}d10>${d}f1]]}}` : `/roll ${n}d10>${d}f1`;
    case 'foundry':    return `/r ${n}d10cs>=${d}df=1${note ? ` # ${note}` : ''}`;
    default:           return `!vr ${n}`;
  }
}

// =============================================================================
// 5. DESFAZER / REFAZER
// Snapshots por personagem, agrupando digitação rápida (debounce).
// Histórico de rolagens, avatar e configurações não entram no snapshot.
// =============================================================================
const UndoManager = {
  stacks: {},
  pendingTimer: null,
  applying: false,
  LIMIT: 80,
  DEBOUNCE_MS: 450,

  serialize(char) {
    if (!char) return '';
    return JSON.stringify(char, (key, value) => {
      if (key === 'roll_history' || key === 'settings' || key === 'theme' || key === 'avatar' || key === 'avatarUrl') return undefined;
      return value;
    });
  },

  stackFor(id) {
    if (!this.stacks[id]) this.stacks[id] = { past: [], future: [], last: null };
    return this.stacks[id];
  },

  ensureBaseline() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const s = this.stackFor(char.id);
    if (s.last === null) s.last = this.serialize(char);
    this.updateButtons();
  },

  /** Chamado a cada salvamento. */
  capture() {
    if (this.applying) return;
    clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => this.commit(), this.DEBOUNCE_MS);
    AutosaveIndicator.mark();
  },

  commit() {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    const char = AppState.activeCharacter;
    if (!char) return;
    const s = this.stackFor(char.id);
    const snap = this.serialize(char);
    if (s.last === null) { s.last = snap; this.updateButtons(); return; }
    if (snap === s.last) return;
    s.past.push(s.last);
    if (s.past.length > this.LIMIT) s.past.shift();
    s.last = snap;
    s.future = [];
    this.updateButtons();
  },

  undo() {
    if (this.pendingTimer) this.commit();
    const char = AppState.activeCharacter;
    if (!char) return;
    const s = this.stackFor(char.id);
    if (s.past.length === 0) { showToast('Nada para desfazer.', 'info'); return; }
    s.future.push(s.last);
    s.last = s.past.pop();
    this.apply(s.last);
    showToast('Alteração desfeita.', 'info');
  },

  redo() {
    if (this.pendingTimer) this.commit();
    const char = AppState.activeCharacter;
    if (!char) return;
    const s = this.stackFor(char.id);
    if (s.future.length === 0) { showToast('Nada para refazer.', 'info'); return; }
    s.past.push(s.last);
    s.last = s.future.pop();
    this.apply(s.last);
    showToast('Alteração refeita.', 'info');
  },

  apply(snapshot) {
    const current = AppState.activeCharacter;
    const restored = JSON.parse(snapshot);
    // Preserva o que fica fora do histórico
    restored.roll_history = current.roll_history || [];
    restored.settings = current.settings;
    restored.theme = current.theme;
    restored.header = restored.header || {};
    restored.header.avatar = current.header ? current.header.avatar : '';
    restored.header.avatarUrl = current.header ? current.header.avatarUrl : '';

    const idx = AppState.characters.findIndex(c => c.id === current.id);
    this.applying = true;
    try {
      if (idx >= 0) AppState.characters[idx] = restored;
      AppState.activeCharacter = restored;
      LinkCableSystem.clear();
      AppState.saveToStorage();
      UIRenderer.renderAll();
    } finally {
      this.applying = false;
    }
    this.updateButtons();
  },

  updateButtons() {
    const char = AppState.activeCharacter;
    const s = char ? this.stackFor(char.id) : { past: [], future: [] };
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = s.past.length === 0 && !this.pendingTimer;
    if (redoBtn) redoBtn.disabled = s.future.length === 0;
  }
};

/** Indicador discreto de salvamento automático. */
const AutosaveIndicator = {
  timer: null,
  mark() {
    const el = document.getElementById('autosave-status');
    if (!el) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      el.textContent = window.__V20_MEMORY_STORAGE__ ? `Salvo nesta sessão às ${t}` : `Salvo às ${t}`;
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
    }, 250);
  }
};

// =============================================================================
// 6. DIÁLOGOS GÓTICOS (Promise) — substituem prompt() e confirm()
// =============================================================================
const GothicDialog = {
  open({ title, message = '', input = null, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
    return new Promise(resolve => {
      const overlay = document.getElementById('gothic-dialog');
      const titleEl = document.getElementById('gothic-dialog-title');
      const msgEl = document.getElementById('gothic-dialog-message');
      const inputEl = document.getElementById('gothic-dialog-input');
      const okBtn = document.getElementById('gothic-dialog-ok');
      const cancelBtn = document.getElementById('gothic-dialog-cancel');
      if (!overlay) { resolve(input ? null : false); return; }

      const previousFocus = document.activeElement;
      titleEl.textContent = title || '';
      msgEl.textContent = message;
      msgEl.classList.toggle('hidden', !message);
      okBtn.textContent = confirmLabel;
      cancelBtn.textContent = cancelLabel;
      okBtn.classList.toggle('btn-danger', danger);
      okBtn.classList.toggle('btn-primary', !danger);

      if (input) {
        inputEl.classList.remove('hidden');
        inputEl.value = input.value || '';
        inputEl.placeholder = input.placeholder || '';
        inputEl.type = input.type || 'text';
      } else {
        inputEl.classList.add('hidden');
      }

      const close = (result) => {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey, true);
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        resolve(result);
      };
      const onOk = () => close(input ? inputEl.value : true);
      const onCancel = () => close(input ? null : false);
      const onBackdrop = (e) => { if (e.target === overlay) onCancel(); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
        else if (e.key === 'Enter' && (input || document.activeElement !== cancelBtn)) { e.preventDefault(); onOk(); }
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey, true);

      overlay.classList.remove('hidden');
      setTimeout(() => (input ? inputEl : okBtn).focus(), 30);
      if (input) setTimeout(() => inputEl.select(), 40);
    });
  },

  confirm(opts) { return this.open(opts); },
  prompt(opts) { return this.open({ ...opts, input: { value: opts.value, placeholder: opts.placeholder, type: opts.type } }); }
};

// =============================================================================
// 7. SELETOR DE CLÃ, ESTATÍSTICAS DERIVADAS E MEDIDOR DE SANGUE
// =============================================================================
const ClanManager = {
  populate() {
    const select = document.getElementById('char-clan-select');
    if (!select || select.options.length > 1) return;
    const groups = [
      { label: 'Clãs', key: 'clan' },
      { label: 'Linhagens', key: 'bloodline' },
      { label: 'Sem clã', key: 'other' }
    ];
    select.innerHTML = '<option value="">Escolha um clã…</option>';
    groups.forEach(g => {
      const og = document.createElement('optgroup');
      og.label = g.label;
      CLAN_PRESETS.filter(c => c.group === g.key).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.key;
        opt.textContent = c.name;
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'Outro (digitar)…';
    select.appendChild(custom);
  },

  sync(char) {
    this.populate();
    const select = document.getElementById('char-clan-select');
    const customInput = document.getElementById('char-clan');
    if (!select || !customInput) return;
    const clanName = (char.header && char.header.clan) ? char.header.clan.trim() : '';
    const preset = findClanPreset(clanName);
    if (!clanName) {
      select.value = '';
      customInput.classList.add('hidden');
    } else if (preset) {
      select.value = preset.key;
      customInput.classList.add('hidden');
    } else {
      select.value = '__custom__';
      customInput.classList.remove('hidden');
    }
  },

  onSelect(value) {
    const char = AppState.activeCharacter;
    const customInput = document.getElementById('char-clan');
    if (!char) return;

    if (value === '__custom__') {
      customInput.classList.remove('hidden');
      customInput.focus();
      return;
    }
    customInput.classList.add('hidden');

    if (!value) {
      char.header.clan = '';
      AppState.saveToStorage();
      UIRenderer.updateDropdown();
      return;
    }

    const preset = CLAN_PRESETS.find(c => c.key === value);
    if (preset) this.apply(char, preset);
  },

  apply(char, preset) {
    char.header.clan = preset.name;
    customInputValue(preset.name);

    if (!Array.isArray(char.disciplines)) char.disciplines = [];
    // Remove disciplinas de clã anteriores que ficaram sem nenhum ponto
    char.disciplines = char.disciplines.filter(d => !(d.inClan && !(parseInt(d.level, 10) > 0)));
    char.disciplines.forEach(d => { d.inClan = false; });

    const added = [];
    preset.disciplines.forEach(name => {
      const existing = char.disciplines.find(d => d.name && sameDiscipline(d.name, name));
      if (existing) {
        existing.inClan = true;
      } else {
        char.disciplines.push({ id: generateUniqueId(), name, level: 1, inClan: true });
        added.push(name);
      }
    });

    if (!char.notes) char.notes = {};
    char.notes.weakness = preset.weakness;

    AppState.saveToStorage();
    UIRenderer.renderAll();
    const addedMsg = added.length ? ` Disciplinas adicionadas: ${added.join(', ')}.` : '';
    showToast(`Clã ${preset.name} aplicado.${addedMsg} Use Desfazer (Ctrl+Z) para voltar.`, 'success');

    function customInputValue(v) {
      const el = document.getElementById('char-clan');
      if (el) el.value = v;
    }
  }
};

const DerivedStats = {
  isAuto(char) {
    return !!(char && char.settings && char.settings.autoDerived);
  },

  compute(char) {
    const v = char.virtues || {};
    return {
      willpower: parseInt(v.courage, 10) || 0,
      humanity: (parseInt(v.conscience, 10) || 0) + (parseInt(v.self_control, 10) || 0)
    };
  },

  /** Aplica FV = Coragem e Humanidade = Consciência + Autocontrole quando a automação está ligada. */
  applyIfAuto(char) {
    if (!this.isAuto(char)) return false;
    const d = this.compute(char);
    char.status.willpower_perm = Math.min(10, d.willpower);
    char.status.humanity = Math.min(10, d.humanity);
    return true;
  },

  renderHint(char) {
    const hint = document.getElementById('derived-stats-hint');
    const toggle = document.getElementById('toggle-auto-derived');
    if (!hint || !char) return;
    const d = this.compute(char);
    if (toggle) toggle.checked = this.isAuto(char);
    hint.textContent = `Pelas Virtudes: Força de Vontade ${d.willpower} · ${char.status.path_name || 'Humanidade'} ${d.humanity}`;
  }
};

const BloodMeter = {
  render(char) {
    const meter = document.getElementById('blood-liquid-meter');
    const fill = document.getElementById('blood-liquid-fill');
    const turnInfo = document.getElementById('blood-turn-info');
    if (!meter || !fill || !char) return;
    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
    const count = getBloodCount(char);
    const pct = rule.maxBlood ? Math.round((count / rule.maxBlood) * 100) : 0;
    fill.style.setProperty('--fill', `${pct}%`);
    meter.setAttribute('aria-valuenow', String(count));
    meter.setAttribute('aria-valuemax', String(rule.maxBlood));
    meter.setAttribute('aria-valuetext', `${count} de ${rule.maxBlood} pontos de sangue`);
    meter.classList.toggle('is-hungry', count > 0 && count < 5);
    meter.classList.toggle('is-empty', count === 0);

    ensureTurnState(char);
    if (turnInfo) {
      const spent = char.status.turn_blood_spent;
      turnInfo.textContent = `Gasto neste turno: ${spent} de ${rule.bloodPerTurn}`;
      turnInfo.classList.toggle('is-maxed', spent >= rule.bloodPerTurn);
    }

    const warn = document.getElementById('blood-hunger-warning');
    if (warn) warn.classList.toggle('hidden', !(count < 5));
    if (warn) warn.textContent = count === 0
      ? 'Reserva vazia: risco extremo de frenesi de fome e torpor ao sofrer dano.'
      : 'Reserva abaixo de 5: vulnerável ao frenesi de fome diante de sangue.';
  }
};

// =============================================================================
// 8. ARSENAL DE COMBATE
// =============================================================================
const DAMAGE_TYPES = {
  bashing: { label: 'Contusivo', symbol: '/' },
  lethal: { label: 'Letal', symbol: '✕' },
  aggravated: { label: 'Agravado', symbol: '✶' }
};

const ATTRIBUTE_PATHS = [
  'attributes.physical.strength', 'attributes.physical.dexterity', 'attributes.physical.stamina',
  'attributes.social.charisma', 'attributes.social.manipulation', 'attributes.social.appearance',
  'attributes.mental.perception', 'attributes.mental.intelligence', 'attributes.mental.wits'
];

function defaultWeapons() {
  return [
    { id: generateUniqueId(), name: 'Soco', difficulty: 6, attackAttr: 'attributes.physical.dexterity', attackAbility: 'abilities.talents.brawl', damageAttr: 'attributes.physical.strength', damageBonus: 0, damageType: 'bashing' },
    { id: generateUniqueId(), name: 'Mordida (após agarrar)', difficulty: 6, attackAttr: 'attributes.physical.dexterity', attackAbility: 'abilities.talents.brawl', damageAttr: 'attributes.physical.strength', damageBonus: 1, damageType: 'aggravated' }
  ];
}

/**
 * Marca dano na Vitalidade seguindo o V20:
 * agravado fica no topo, depois letal, depois contusivo.
 * Com a trilha cheia, cada nível a mais transforma um contusivo em letal;
 * sem contusivos para transformar, o dano excedente leva a torpor (letal)
 * ou à Morte Final (agravado).
 */
const DAMAGE_ORDER = { aggravated: 3, lethal: 2, bashing: 1 };
const HealthManager = {
  addDamage(char, type, amount) {
    if (!char.health) char.health = {};
    const list = HEALTH_LEVELS.map(l => char.health[l.key]).filter(v => DAMAGE_ORDER[v]);
    for (let i = 0; i < amount; i++) list.push(type);
    list.sort((a, b) => DAMAGE_ORDER[b] - DAMAGE_ORDER[a]);

    const cap = HEALTH_LEVELS.length;
    let converted = 0;
    let overflow = null;
    while (list.length > cap) {
      const extra = list.pop();
      const idx = list.lastIndexOf('bashing');
      if (idx >= 0) {
        list[idx] = 'lethal';
        converted++;
        list.sort((a, b) => DAMAGE_ORDER[b] - DAMAGE_ORDER[a]);
      } else {
        overflow = extra === 'aggravated' || list.every(v => v === 'aggravated') ? 'final-death' : 'torpor';
      }
    }
    HEALTH_LEVELS.forEach((l, i) => { char.health[l.key] = list[i] || ''; });
    return { converted, overflow };
  }
};

const CombatManager = {
  lastAttack: null, // { weaponId, extra }
  soakBlood: 0,     // pontos de sangue que viram sucessos de Fortitude na próxima absorção
  potenceBlood: 0,  // pontos de sangue que viram sucessos de Potência no próximo dano

  fortitudeLevel(char) { return findDisciplineLevel(char, /fortitude/i); },
  potenceLevel(char) { return findDisciplineLevel(char, /pot[eê]ncia|potence/i); },

  /** Fortitude: cada ponto de sangue troca 1 dado por 1 sucesso automático (sem limite por turno). */
  soakBloodMax(char) {
    return Math.max(0, Math.min(this.fortitudeLevel(char), getBloodCount(char)));
  },

  /** Potência: igual, mas respeita o limite de gasto por turno da Geração. */
  potenceBloodMax(char) {
    ensureTurnState(char);
    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
    const turnLeft = Math.max(0, rule.bloodPerTurn - char.status.turn_blood_spent);
    return Math.max(0, Math.min(this.potenceLevel(char), getBloodCount(char), turnLeft));
  },

  usesStrength(w) { return w && w.damageAttr === 'attributes.physical.strength'; },

  abilityPaths() {
    return Array.from(document.querySelectorAll('.trait-row[data-trait^="abilities."]')).map(r => r.getAttribute('data-trait'));
  },

  buildSelect(options, value, className) {
    const sel = document.createElement('select');
    sel.className = className;
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === value) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  },

  render(char) {
    const list = document.getElementById('weapons-list');
    if (!list || !char) return;
    if (!Array.isArray(char.weapons)) char.weapons = [];
    list.innerHTML = '';

    if (char.weapons.length === 0) {
      list.innerHTML = '<p class="empty-hint">Nenhuma arma cadastrada. Use “Adicionar arma” para registrar ataques.</p>';
    }

    const attrOptions = ATTRIBUTE_PATHS.map(p => ({ value: p, label: getTraitLabel(p) }));
    const abilityOptions = [{ value: '', label: '— sem habilidade —' }].concat(this.abilityPaths().map(p => ({ value: p, label: getTraitLabel(p) })));
    const dmgAttrOptions = [{ value: '', label: 'Nenhum' }, { value: 'attributes.physical.strength', label: 'Força' }];
    const diffOptions = Array.from({ length: 9 }, (_, i) => ({ value: String(i + 2), label: `Dif ${i + 2}` }));
    const typeOptions = Object.entries(DAMAGE_TYPES).map(([k, v]) => ({ value: k, label: `${v.symbol} ${v.label}` }));

    char.weapons.forEach((w, index) => {
      const row = document.createElement('div');
      row.className = `weapon-row dmg-${w.damageType || 'lethal'}`;
      row.dataset.presetId = w.id;

      const save = () => { AppState.saveToStorage(); this.updateRowSummary(row, w); };

      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'collapse-arrow weapon-collapse';
      arrow.dataset.lockExempt = '';
      const syncArrow = () => {
        arrow.textContent = w.collapsed ? '▸' : '▾';
        arrow.setAttribute('aria-expanded', String(!w.collapsed));
        arrow.title = w.collapsed ? 'Expandir arma' : 'Minimizar arma (só cabeçalho e botões)';
        row.classList.toggle('is-collapsed', !!w.collapsed);
      };
      syncArrow();
      arrow.addEventListener('click', () => {
        w.collapsed = !w.collapsed;
        syncArrow();
        AppState.saveToStorage();
        this.renderCollapseAll(char);
      });

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'dynamic-input weapon-name';
      name.placeholder = 'Nome da arma';
      name.value = w.name || '';
      name.setAttribute('aria-label', 'Nome da arma');
      name.addEventListener('input', e => { w.name = e.target.value; save(); });

      const diff = this.buildSelect(diffOptions, String(w.difficulty || 6), 'weapon-select weapon-diff');
      diff.setAttribute('aria-label', 'Dificuldade do ataque');
      diff.addEventListener('change', e => { w.difficulty = clampInt(e.target.value, 2, 10, 6); save(); });

      const atkAttr = this.buildSelect(attrOptions, w.attackAttr, 'weapon-select');
      atkAttr.setAttribute('aria-label', 'Atributo de ataque');
      atkAttr.addEventListener('change', e => { w.attackAttr = e.target.value; save(); });

      const atkAbil = this.buildSelect(abilityOptions, w.attackAbility || '', 'weapon-select');
      atkAbil.setAttribute('aria-label', 'Habilidade de ataque');
      atkAbil.addEventListener('change', e => { w.attackAbility = e.target.value; save(); });

      const dmgAttr = this.buildSelect(dmgAttrOptions, w.damageAttr || '', 'weapon-select weapon-dmg-attr');
      dmgAttr.setAttribute('aria-label', 'Atributo de dano');
      dmgAttr.addEventListener('change', e => { w.damageAttr = e.target.value; save(); });

      const dmgBonus = document.createElement('input');
      dmgBonus.type = 'number';
      dmgBonus.min = '-5';
      dmgBonus.max = '20';
      dmgBonus.className = 'weapon-bonus';
      dmgBonus.value = w.damageBonus || 0;
      dmgBonus.setAttribute('aria-label', 'Bônus de dano');
      dmgBonus.addEventListener('input', e => { w.damageBonus = clampInt(e.target.value, -5, 20, 0); save(); });

      const dmgType = this.buildSelect(typeOptions, w.damageType || 'lethal', 'weapon-select weapon-type');
      dmgType.setAttribute('aria-label', 'Tipo de dano');
      dmgType.addEventListener('change', e => {
        w.damageType = e.target.value;
        row.className = `weapon-row dmg-${w.damageType}`;
        SpellManager.markActive();
        save();
      });

      const summary = document.createElement('div');
      summary.className = 'weapon-summary';

      const actions = document.createElement('div');
      actions.className = 'weapon-actions';

      const atkBtn = document.createElement('button');
      atkBtn.type = 'button';
      atkBtn.className = 'btn-weapon btn-weapon-attack';
      atkBtn.textContent = 'Atacar';
      atkBtn.addEventListener('click', () => this.attack(w));

      const dmgBtn = document.createElement('button');
      dmgBtn.type = 'button';
      dmgBtn.className = 'btn-weapon btn-weapon-damage';
      dmgBtn.textContent = 'Rolar dano';
      dmgBtn.addEventListener('click', () => this.damage(w));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-remove-trait weapon-remove';
      remove.title = 'Remover arma';
      remove.setAttribute('aria-label', `Remover ${w.name || 'arma'}`);
      remove.textContent = '✕';
      remove.addEventListener('click', () => {
        char.weapons.splice(index, 1);
        AppState.saveToStorage();
        this.render(char);
      });

      actions.append(atkBtn, dmgBtn, remove);

      const line1 = document.createElement('div');
      line1.className = 'weapon-line';
      line1.append(arrow, name, diff, dmgType);

      const line2 = document.createElement('div');
      line2.className = 'weapon-line weapon-line-formula';
      const plus1 = document.createElement('span'); plus1.className = 'weapon-op'; plus1.textContent = '+';
      const dmgLabel = document.createElement('span'); dmgLabel.className = 'weapon-op weapon-op-label'; dmgLabel.textContent = 'Dano:';
      const plus2 = document.createElement('span'); plus2.className = 'weapon-op'; plus2.textContent = '+';
      line2.append(atkAttr, plus1, atkAbil, dmgLabel, dmgAttr, plus2, dmgBonus);

      row.append(line1, line2, summary, actions);
      list.appendChild(row);
      this.updateRowSummary(row, w);
    });

    this.renderSoak(char);
    this.renderCollapseAll(char);
  },

  renderCollapseAll(char) {
    const btn = document.getElementById('btn-weapons-collapse-all');
    if (!btn || !char) return;
    const weapons = char.weapons || [];
    const anyOpen = weapons.some(w => !w.collapsed);
    btn.disabled = !weapons.length;
    btn.textContent = anyOpen ? '▾' : '▸';
    btn.title = anyOpen ? 'Minimizar todas as armas' : 'Expandir todas as armas';
    btn.setAttribute('aria-label', btn.title);
  },

  toggleAllWeapons() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const weapons = char.weapons || [];
    const collapse = weapons.some(w => !w.collapsed);
    weapons.forEach(w => { w.collapsed = collapse; });
    AppState.saveToStorage();
    this.render(char);
  },

  attackPool(char, w) {
    const a = getTraitValue(char, w.attackAttr);
    const b = w.attackAbility ? getTraitValue(char, w.attackAbility) : 0;
    const extra = PhysicalDisciplines.bonusTotal(char, [w.attackAttr, w.attackAbility]);
    return { a, b, extra, total: a + b + extra };
  },

  damagePool(char, w) {
    const base = w.damageAttr ? getTraitValue(char, w.damageAttr) : 0;
    const potence = this.usesStrength(w) && PhysicalDisciplines.enabled() ? this.potenceLevel(char) : 0;
    const bonus = parseInt(w.damageBonus, 10) || 0;
    return { base, bonus, potence, total: Math.max(0, base + bonus + potence) };
  },

  /** Parada de dano: Força + arma + extras + Potência (dados de Potência viram automáticos com sangue). */
  damageParts(char, w) {
    const parts = [];
    if (w.damageAttr) parts.push({ label: getTraitLabel(w.damageAttr), value: getTraitValue(char, w.damageAttr), ref: w.damageAttr });
    if (w.damageBonus) parts.push({ label: 'Arma', value: parseInt(w.damageBonus, 10) || 0 });
    if (this.lastAttack && this.lastAttack.weaponId === w.id && this.lastAttack.extra > 0) {
      parts.push({ label: 'Sucessos extras', value: this.lastAttack.extra });
    }
    let used = 0;
    const pot = this.usesStrength(w) && PhysicalDisciplines.enabled() ? this.potenceLevel(char) : 0;
    if (pot > 0) {
      used = PhysicalDisciplines.activeLevel(char, 'potence');
      parts.push({
        label: used ? `Potência ${pot} 🩸 (sucessos automáticos)` : 'Potência',
        value: used ? 0 : pot,
        bonus: 'potence'
      });
    }
    return { parts, used };
  },

  /** Recalcula presets de absorção e dano com o sangue escolhido agora. */
  refreshPreset(preset, char) {
    if (!preset || !char) return;
    if (preset.kind === 'soak') {
      const aggravated = !!(preset.meta && preset.meta.aggravated);
      const fort = PhysicalDisciplines.activeLevel(char, 'fortitude');
      preset.parts = this.soakParts(char, aggravated);
      preset.autoSuccesses = fort;
      preset.blood = null;
      preset.note = fort
        ? `🩸 Fortitude ativa: ${fort} sucesso(s) automático(s) neste turno. Rola ${preset.parts.reduce((a, p) => a + p.value, 0)} dado(s).`
        : '';
    } else if (preset.kind === 'damage') {
      const w = (char.weapons || []).find(x => x.id === (preset.meta && preset.meta.weaponId));
      if (!w) return;
      const { parts, used } = this.damageParts(char, w);
      preset.parts = parts;
      preset.autoSuccesses = used;
      preset.blood = null;
      preset.note = used ? `🩸 Potência ativa: ${used} sucesso(s) automático(s) de dano neste turno.` : '';
    }
  },

  updateRowSummary(row, w) {
    const char = AppState.activeCharacter;
    const summary = row.querySelector('.weapon-summary');
    if (!summary || !char) return;
    const atk = this.attackPool(char, w);
    const dmg = this.damagePool(char, w);
    const type = DAMAGE_TYPES[w.damageType] || DAMAGE_TYPES.lethal;
    const extra = (this.lastAttack && this.lastAttack.weaponId === w.id) ? this.lastAttack.extra : 0;
    const potUsed = dmg.potence ? PhysicalDisciplines.activeLevel(char, 'potence') : 0;
    const potTxt = dmg.potence ? ` <span class="weapon-potence">(inclui Potência ${dmg.potence}${potUsed ? `, ${potUsed} automático${potUsed > 1 ? 's' : ''}` : ''})</span>` : '';
    const atkExtra = atk.extra ? ` <span class="weapon-potence">(inclui ${atk.extra} de ${w.attackAttr === DEX_REF ? 'Celeridade' : 'Potência'})</span>` : '';
    const wound = getWoundState(char);
    const atkDice = Math.max(0, atk.total - wound.penalty);
    const odds = RollProbability.compute(atkDice, w.difficulty || 6, { specialty: RollOptions.specialty, required: RollOptions.required });
    const oddsTxt = ` · <span class="odds-inline ${RollProbability.level(odds.success)}" title="Chance de ${RollOptions.required}+ sucesso(s)${wound.penalty ? `, já com −${wound.penalty} de ferimentos` : ''}">${RollProbability.pct(odds.success)}</span>`;
    summary.innerHTML = `Ataque <strong>${atk.total}</strong> dados${atkExtra} vs Dif ${w.difficulty || 6}${oddsTxt} · Dano <strong>${dmg.total}${extra ? ` +${extra}` : ''}</strong> ${escapeHtml(type.label.toLowerCase())}${potTxt}`;
  },

  attack(w) {
    const char = AppState.activeCharacter;
    const parts = [{ label: getTraitLabel(w.attackAttr), value: getTraitValue(char, w.attackAttr), ref: w.attackAttr }];
    if (w.attackAbility) parts.push({ label: getTraitLabel(w.attackAbility), value: getTraitValue(char, w.attackAbility), ref: w.attackAbility });
    LinkCableSystem.setPreset({
      kind: 'attack',
      title: `Ataque: ${w.name || 'Arma'}`,
      parts,
      difficulty: w.difficulty || 6,
      applyWounds: true,
      meta: { weaponId: w.id }
    });
  },

  damage(w) {
    const char = AppState.activeCharacter;
    const type = DAMAGE_TYPES[w.damageType] || DAMAGE_TYPES.lethal;
    const preset = {
      kind: 'damage',
      title: `Dano (${type.label}): ${w.name || 'Arma'}`,
      parts: [],
      difficulty: 6,
      applyWounds: false,
      meta: { weaponId: w.id }
    };
    this.refreshPreset(preset, char);
    LinkCableSystem.setPreset(preset);
  },

  /** Chamado após qualquer rolagem finalizada. */
  afterRoll(preset, rollState) {
    if (!preset) return;
    if (preset.kind === 'attack') {
      this.lastAttack = { weaponId: preset.meta.weaponId, extra: Math.max(0, rollState.netSuccesses - 1) };
      if (rollState.netSuccesses > 0) {
        const extraMsg = this.lastAttack.extra ? ` (+${this.lastAttack.extra} dado(s) de dano)` : '';
        showToast(`Ataque acertou${extraMsg}. Clique em “Rolar dano” na arma.`, 'success');
      }
      this.render(AppState.activeCharacter);
    } else if (preset.kind === 'damage') {
      this.lastAttack = null;
      this.render(AppState.activeCharacter);
    } else if (preset.kind === 'soak') {
      if (preset.meta && preset.meta.incoming > 0) this.applyIncoming(rollState);
      this.renderSoak(AppState.activeCharacter);
    }
  },

  /** Dano residual = dano do inimigo − sucessos de absorção (contusivo: metade, arredonda para baixo). */
  applyIncoming(state) {
    const char = AppState.activeCharacter;
    if (!state.damageApp) {
      state.damageApp = { snapshot: { ...(char.health || {}) }, meta: { ...state.preset.meta } };
      // O rolador continua aberto só para absorver: rolar de novo não repete o dano
      const live = LinkCableSystem.preset;
      if (live && live.kind === 'soak') {
        live.meta = { ...live.meta, incoming: 0 };
        live.title = live.meta.aggravated ? 'Absorção (agravado)' : 'Absorção (Vigor + Fortitude)';
      }
    } else {
      char.health = { ...state.damageApp.snapshot };
    }
    const meta = state.damageApp.meta;

    const soaked = Math.max(0, state.netSuccesses);
    const afterSoak = Math.max(0, meta.incoming - soaked);
    const levels = meta.damageType === 'bashing' ? Math.floor(afterSoak / 2) : afterSoak;
    FX.shield(levels > 0);
    const res = HealthManager.addDamage(char, meta.damageType, levels);
    AppState.saveToStorage();
    UIRenderer.renderHealthTrack(char);
    LinkCableSystem.updateDock();
    this.render(char);
    SpellManager.scheduleRefresh();

    const type = DAMAGE_TYPES[meta.damageType].label.toLowerCase();
    const wound = getWoundState(char);
    let text = `${meta.incoming} de dano ${type} − ${soaked} absorvido(s) = ${afterSoak}`;
    if (meta.damageType === 'bashing') text += ` → metade (vampiro) = ${levels}`;
    text += levels ? ` nível(is) aplicado(s). Agora: ${wound.label}${wound.penalty ? ` (−${wound.penalty})` : ''}.` : '. Nenhum ferimento!';
    if (res.converted) text += ` ${res.converted} contusivo(s) viraram letal por falta de espaço.`;
    const out = document.getElementById('damage-result');
    if (out) {
      out.textContent = text;
      out.className = `damage-result ${levels ? 'is-hurt' : 'is-safe'}`;
    }
    state.damageApp.text = text;
    if (levels > 0) AmbientAudio.hurt(levels);
    this.offerHeal(meta.damageType, levels);
    showToast(`🛡️ ${text}`, levels ? 'danger' : 'success');
    if (res.overflow === 'torpor') {
      PortraitState.setTorpor(char, true);
      showToast('Dano letal além de Incapacitado: o vampiro cai em torpor.', 'danger');
    }
    if (res.overflow === 'final-death') showToast('Dano agravado além de Incapacitado: Morte Final.', 'danger');
  },

  /**
   * Dano que passou pela absorção: oferece gastar sangue para curar na hora.
   * Agravado não entra: precisa de 5 pontos e um dia inteiro de descanso.
   */
  offerHeal(damageType, levels) {
    const box = document.getElementById('damage-heal');
    if (!box) return;
    const char = AppState.activeCharacter;
    const canHeal = levels > 0 && damageType !== 'aggravated';
    box.hidden = !canHeal;
    this.pendingHeal = canHeal ? levels : 0;
    if (!canHeal) return;
    const text = document.getElementById('damage-heal-text');
    const blood = getBloodCount(char);
    if (text) {
      text.textContent = `Sobrou ${levels} nível(is) de dano ${DAMAGE_TYPES[damageType].label.toLowerCase()}. `
        + `Curar custa 1 ponto de sangue por nível (1 por turno, pela regra). Você tem ${blood}.`;
    }
    const one = document.getElementById('btn-damage-heal-one');
    const all = document.getElementById('btn-damage-heal-all');
    if (all) {
      all.textContent = `🩸 Curar tudo (${Math.min(levels, blood)} PS)`;
      all.disabled = blood < 1;
    }
    if (one) one.disabled = blood < 1;
  },

  healFromDamage(count) {
    const char = AppState.activeCharacter;
    if (!char) return;
    let healed = 0;
    for (let i = 0; i < count; i++) {
      const before = HEALTH_LEVELS.filter(l => char.health[l.key]).length;
      BloodActions.healOne({ ignoreTurnLimit: true });
      const after = HEALTH_LEVELS.filter(l => char.health[l.key]).length;
      if (after >= before) break;
      healed++;
    }
    this.pendingHeal = Math.max(0, (this.pendingHeal || 0) - healed);
    if (healed) FX.bloodToHealth(healed);
    this.offerHeal('lethal', this.pendingHeal);
    if (!this.pendingHeal) {
      const box = document.getElementById('damage-heal');
      if (box) box.hidden = true;
    }
  },

  /** Rerolagem ou +1 sucesso depois de absorver: refaz o dano com o novo resultado. */
  afterReroll(state) {
    if (state && state.damageApp) this.applyIncoming(state);
  },

  soakParts(char, aggravated) {
    const fort = this.fortitudeLevel(char);
    const active = PhysicalDisciplines.isActive(char, 'fortitude');
    const parts = [];
    if (!aggravated) parts.push({ label: 'Vigor', value: getTraitValue(char, 'attributes.physical.stamina') });
    parts.push({
      label: active ? `Fortitude ${fort} 🩸 (sucessos automáticos)` : 'Fortitude',
      value: active ? 0 : fort
    });
    return parts;
  },

  /** Preenche um seletor 0..max e mantém a escolha dentro do limite. */
  fillBloodSelect(select, max, current, unit) {
    if (!select) return current;
    const value = Math.min(current, max);
    select.innerHTML = '';
    for (let i = 0; i <= max; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = i === 0 ? 'Nenhum' : `${i} PS → ${i} ${unit}`;
      if (i === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.disabled = max === 0;
    return value;
  },

  renderSoak(char) {
    const info = document.getElementById('soak-info');
    if (!info || !char) return;
    const fort = this.fortitudeLevel(char);
    const fortOn = PhysicalDisciplines.isActive(char, 'fortitude');
    const normal = this.soakParts(char, false).reduce((a, p) => a + p.value, 0);
    const agg = this.soakParts(char, true).reduce((a, p) => a + p.value, 0);
    const auto = fortOn ? ` + ${fort} automático(s)` : '';
    info.textContent = `Contusivo/Letal: ${normal} dado${normal === 1 ? '' : 's'}${auto} · Agravado: ${agg} dado${agg === 1 ? '' : 's'}${auto} (só Fortitude)`;

    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
    const blood = getBloodCount(char);

    // Fortitude: 1 ponto de sangue converte a Disciplina inteira em sucessos, pelo turno
    const soakBox = document.getElementById('soak-blood-box');
    if (soakBox) soakBox.hidden = fort === 0;
    const soakBtn = document.getElementById('btn-fortitude-blood');
    if (soakBtn && fort) {
      soakBtn.textContent = fortOn ? `🩸 Fortitude ativa (${fort} sucessos)` : `🩸 Ativar Fortitude (1 PS)`;
      soakBtn.classList.toggle('is-on', fortOn);
      soakBtn.setAttribute('aria-pressed', String(fortOn));
      soakBtn.disabled = !fortOn && blood < 1;
    }
    const soakHint = document.getElementById('soak-blood-hint');
    if (soakHint) {
      soakHint.textContent = fort
        ? (fortOn
          ? `Fortitude ${fort}: todos os dados já valem como sucessos automáticos até o fim do turno. Clique de novo para cancelar e recuperar o ponto.`
          : `Fortitude ${fort}: 1 ponto de sangue transforma os ${fort} dados em ${fort} sucessos automáticos pelo turno inteiro.`)
        : '';
    }

    // Potência: mesma regra, valendo para tudo que usa Força
    const pot = PhysicalDisciplines.enabled() ? this.potenceLevel(char) : 0;
    const potOn = PhysicalDisciplines.isActive(char, 'potence');
    const potBox = document.getElementById('potence-box');
    if (potBox) potBox.hidden = pot === 0;
    const potBtn = document.getElementById('btn-potence-blood');
    if (potBtn && pot) {
      potBtn.textContent = potOn ? `🩸 Potência ativa (${pot} sucessos)` : `🩸 Ativar Potência (1 PS)`;
      potBtn.classList.toggle('is-on', potOn);
      potBtn.setAttribute('aria-pressed', String(potOn));
      potBtn.disabled = !potOn && blood < 1;
    }
    const potHint = document.getElementById('potence-blood-hint');
    if (potHint && pot) {
      potHint.textContent = potOn
        ? `Potência ${pot}: rolagens de Força e dano já começam com ${pot} sucessos até o fim do turno. Clique de novo para cancelar.`
        : `Potência ${pot}: 1 ponto de sangue vira ${pot} sucessos automáticos em tudo que usa Força (limite de ${rule.bloodPerTurn} PS por turno na ${rule.label}).`;
    }
  },

  bindBloodSelects() {
    const bindToggle = (id, kind) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => PhysicalDisciplines.toggleDiscipline(kind));
    };
    bindToggle('btn-fortitude-blood', 'fortitude');
    bindToggle('btn-potence-blood', 'potence');
  },

  /** Tipo de dano escolhido no card (valores antigos "normal" contam como letal). */
  incomingType() {
    const sel = document.getElementById('soak-type');
    const v = sel ? sel.value : 'lethal';
    return DAMAGE_ORDER[v] ? v : 'lethal';
  },

  soak({ apply = false } = {}) {
    const char = AppState.activeCharacter;
    const damageType = this.incomingType();
    const aggravated = damageType === 'aggravated';
    const incomingEl = document.getElementById('incoming-damage');
    const incoming = apply ? clampInt(incomingEl && incomingEl.value, 0, 50, 0) : 0;
    if (apply && incoming <= 0) {
      showToast('Informe quantos sucessos de dano o inimigo tirou.', 'danger');
      if (incomingEl) incomingEl.focus();
      return;
    }
    if (aggravated && this.fortitudeLevel(char) === 0) {
      showToast('Sem Fortitude, dano agravado não pode ser absorvido.', 'danger');
    }
    const typeLabel = DAMAGE_TYPES[damageType].label.toLowerCase();
    const preset = {
      kind: 'soak',
      title: incoming
        ? `Absorver ${incoming} de dano ${typeLabel}`
        : (aggravated ? 'Absorção (agravado)' : 'Absorção (Vigor + Fortitude)'),
      parts: [],
      difficulty: 6,
      applyWounds: false,
      meta: { aggravated, damageType, incoming }
    };
    this.refreshPreset(preset, char);
    LinkCableSystem.setPreset(preset);
    if (apply) executeDiceRoll();
  },

  addWeapon() {
    const char = AppState.activeCharacter;
    if (!char) return;
    if (!Array.isArray(char.weapons)) char.weapons = [];
    char.weapons.push({
      id: generateUniqueId(), name: '', difficulty: 6,
      attackAttr: 'attributes.physical.dexterity', attackAbility: 'abilities.skills.melee',
      damageAttr: 'attributes.physical.strength', damageBonus: 1, damageType: 'lethal'
    });
    AppState.saveToStorage();
    this.render(char);
    const inputs = document.querySelectorAll('#weapons-list .weapon-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }
};

// =============================================================================
// 8b. GRIMÓRIO DE FEITIÇOS CUSTOMIZADOS (Página 2)
// Cada ritual/feitiço guarda sua parada, custo, dificuldade e efeito.
// Os dados ficam em char.rituals_list (mesmo array dos rituais antigos),
// então fichas exportadas antes continuam abrindo normalmente.
// =============================================================================
const SPELL_EFFECTS = {
  utility:    { label: 'Efeito utilitário', short: 'Utilitário', symbol: '✧' },
  bashing:    { label: 'Dano contusivo',    short: 'Contusivo',  symbol: '/' },
  lethal:     { label: 'Dano letal',        short: 'Letal',      symbol: '✕' },
  aggravated: { label: 'Dano agravado',     short: 'Agravado',   symbol: '✶' }
};

const SPELL_COST_TYPES = {
  none:      'Sem custo',
  blood:     'Sangue',
  willpower: 'Força de Vontade',
  both:      'Sangue + FV'
};

const SPELL_TRADITIONS = {
  taumaturgia: { label: 'Taumatúrgico', color: 0xb3122e },
  necromancia: { label: 'Necromântico', color: 0x6d28d9 },
  outro:       { label: 'Outro',        color: 0x8b5cf6 }
};

/** Rituais e Feitiços ficam no mesmo array, separados pelo campo "kind". */
const GRIMOIRE_KINDS = {
  ritual: {
    label: 'Ritual', plural: 'Rituais', icon: '📜', listId: 'rituals-list', diffCap: 9,
    defaults: { primary: 'attributes.mental.intelligence', secondary: 'abilities.knowledges.occult', costType: 'none' },
    empty: 'Nenhum ritual no grimório. Use ＋ para criar um e definir parada, custo e dificuldade.',
    placeholder: 'Nome do ritual'
  },
  spell: {
    label: 'Feitiço', plural: 'Feitiços', icon: '🔮', listId: 'spells-list', diffCap: 10,
    defaults: { primary: 'status.willpower_perm', secondary: 'none', costType: 'blood' },
    empty: 'Nenhum feitiço ainda. Use ＋ para criar um poder de Trilha ou feitiço próprio.',
    placeholder: 'Nome do feitiço ou poder'
  },
  power: {
    label: 'Poder', plural: 'Poderes', icon: '✴️', listId: 'powers-list', diffCap: 10,
    defaults: { primary: 'attributes.mental.perception', secondary: 'abilities.talents.alertness', costType: 'none' },
    empty: 'Nenhum poder ainda. Use ＋ para registrar um poder de Disciplina (ex.: Auspícios 1 · Sentidos Aguçados).',
    placeholder: 'Nome do poder'
  }
};
const GRIMOIRE_ORDER = ['ritual', 'spell', 'power'];
const GRIMOIRE_TAB_KEY = 'v20_grimoire_tab';

const SPELL_PRIMARY_EXTRA = [
  { value: 'status.willpower_perm', label: 'Força de Vontade (permanente)' },
  { value: 'none', label: 'Nenhum' }
];

/** Remove sufixos como "(171 xp)" para comparar nomes de Disciplinas e Caminhos. */
function baseTraitName(name) {
  return String(name || '').replace(/\s*\(.*$/, '').trim().toLowerCase();
}

const SpellManager = {
  open: new Set(),
  activeTab: GRIMOIRE_KINDS[safeStorageGet(GRIMOIRE_TAB_KEY, 'ritual')] ? safeStorageGet(GRIMOIRE_TAB_KEY, 'ritual') : 'ritual',

  /** Garante todos os campos novos sem apagar os antigos (level, name, tradition, description). */
  normalize(sp) {
    if (!sp.id) sp.id = generateUniqueId();
    // Itens antigos (sem "kind") eram rituais
    if (!GRIMOIRE_KINDS[sp.kind]) sp.kind = 'ritual';
    const defs = GRIMOIRE_KINDS[sp.kind].defaults;
    if (typeof sp.primary !== 'string') sp.primary = defs.primary;
    if (typeof sp.secondary !== 'string') sp.secondary = defs.secondary;
    if (!SPELL_COST_TYPES[sp.costType]) sp.costType = defs.costType;
    sp.level = clampInt(sp.level, 1, 9, 1);
    if (typeof sp.name !== 'string') sp.name = '';
    if (typeof sp.description !== 'string') sp.description = '';
    if (!SPELL_TRADITIONS[sp.tradition]) sp.tradition = 'taumaturgia';
    sp.costBlood = clampInt(sp.costBlood, 1, 20, 1);
    sp.costWillpower = clampInt(sp.costWillpower, 1, 10, 1);
    sp.fixedValue = clampInt(sp.fixedValue, 0, 20, 0);
    if (sp.diffMode !== 'fixed') sp.diffMode = 'auto';
    sp.difficulty = clampInt(sp.difficulty, 2, 10, 6);
    if (!SPELL_EFFECTS[sp.effect]) sp.effect = 'utility';
    if (typeof sp.collapsed !== 'boolean') sp.collapsed = false;
    return sp;
  },

  list(char) {
    if (!Array.isArray(char.rituals_list)) char.rituals_list = [];
    char.rituals_list.forEach(sp => this.normalize(sp));
    return char.rituals_list;
  },

  ofKind(char, kind) {
    return this.list(char).filter(sp => sp.kind === kind);
  },

  kindOf(sp) {
    return GRIMOIRE_KINDS[sp.kind] || GRIMOIRE_KINDS.ritual;
  },

  /** Texto da tradição (rituais/feitiços) ou da Disciplina (poderes). */
  sourceLabel(sp) {
    if (sp.kind === 'power') return sp.discipline ? `de ${sp.discipline}` : 'de Disciplina';
    return (SPELL_TRADITIONS[sp.tradition] || SPELL_TRADITIONS.outro).label;
  },

  find(char, id) {
    return char ? this.list(char).find(sp => sp.id === id) || null : null;
  },

  /** V20: nível + 3 (rituais com teto 9; poderes de Trilha até 10). */
  autoDifficulty(sp) {
    return Math.min(sp.level + 3, this.kindOf(sp).diffCap);
  },

  difficultyOf(sp) {
    return sp.diffMode === 'fixed' ? sp.difficulty : this.autoDifficulty(sp);
  },

  costOf(sp) {
    const blood = (sp.costType === 'blood' || sp.costType === 'both') ? sp.costBlood : 0;
    const willpower = (sp.costType === 'willpower' || sp.costType === 'both') ? sp.costWillpower : 0;
    return { blood, willpower };
  },

  costText(sp) {
    const { blood, willpower } = this.costOf(sp);
    const parts = [];
    if (blood) parts.push(`${blood} PS`);
    if (willpower) parts.push(`${willpower} FV`);
    return parts.length ? parts.join(' + ') : 'sem custo';
  },

  /** Opções do segundo seletor: Habilidades, Disciplinas e Caminhos atuais, valor fixo. */
  secondaryOptions(char) {
    const groups = [];
    groups.push({
      label: 'Habilidades',
      options: CombatManager.abilityPaths().map(p => ({ value: p, label: getTraitLabel(p) }))
    });
    const discs = (char.disciplines || []).filter(d => d && d.name && d.name.trim());
    if (discs.length) {
      groups.push({ label: 'Disciplinas', options: discs.map(d => ({ value: `disc:${d.name.trim()}`, label: d.name.trim() })) });
    }
    const paths = (char.paths || []).filter(p => p && p.name && p.name.trim());
    if (paths.length) {
      groups.push({ label: 'Caminhos', options: paths.map(p => ({ value: `path:${p.name.trim()}`, label: p.name.trim() })) });
    }
    groups.push({
      label: 'Outros',
      options: [{ value: 'fixed', label: 'Valor fixo' }, { value: 'none', label: 'Nenhum' }]
    });
    return groups;
  },

  /** Acha Disciplina/Caminho pelo nome salvo; aceita renomear o sufixo "(xp)". */
  findNamed(items, savedName) {
    const list = (items || []).filter(i => i && i.name);
    const exact = list.find(i => i.name.trim() === savedName);
    if (exact) return exact;
    const base = baseTraitName(savedName);
    return list.find(i => baseTraitName(i.name) === base) || null;
  },

  resolvePart(char, key, sp) {
    if (!key || key === 'none') return null;
    if (key === 'fixed') return { label: 'Valor fixo', value: sp.fixedValue };
    if (key === 'status.willpower_perm') {
      return { label: 'Força de Vontade', value: parseInt(char.status.willpower_perm, 10) || 0 };
    }
    if (key.startsWith('disc:') || key.startsWith('path:')) {
      const isDisc = key.startsWith('disc:');
      const saved = key.slice(5);
      const item = this.findNamed(isDisc ? char.disciplines : char.paths, saved);
      return item
        ? { label: item.name.replace(/\s*\(.*$/, '').trim() || item.name, value: parseInt(item.level, 10) || 0 }
        : { label: `${saved} (removido)`, value: 0, missing: true };
    }
    return { label: getTraitLabel(key), value: getTraitValue(char, key), ref: key };
  },

  poolParts(char, sp) {
    return [this.resolvePart(char, sp.primary, sp), this.resolvePart(char, sp.secondary, sp)].filter(Boolean);
  },

  presetNote(sp) {
    const effect = SPELL_EFFECTS[sp.effect];
    const diffLabel = sp.diffMode === 'fixed' ? `Dif ${sp.difficulty} fixa` : `Dif ${this.difficultyOf(sp)} (nível + 3)`;
    return `${this.kindOf(sp).label} ${this.sourceLabel(sp).toLowerCase()} nível ${sp.level} · Custo: ${this.costText(sp)} · ${effect.symbol} ${effect.label} · ${diffLabel}`;
  },

  // ---------------------------------------------------------------------------
  // Rolagem
  // ---------------------------------------------------------------------------

  /** Confere se há recursos para o custo (+ FV extra de outras opções da rolagem). */
  canPay(char, sp, extraWillpower = 0) {
    const { blood, willpower } = this.costOf(sp);
    const bloodHave = getBloodCount(char);
    const wpHave = getWillpowerAvailable(char);
    if (blood > bloodHave) return { ok: false, reason: `“${sp.name || 'Feitiço'}” custa ${blood} ponto(s) de sangue e você tem ${bloodHave}.` };
    if (willpower + extraWillpower > wpHave) {
      const extra = extraWillpower ? ` (mais ${extraWillpower} do sucesso automático)` : '';
      return { ok: false, reason: `“${sp.name || 'Feitiço'}” custa ${willpower} ponto(s) de Força de Vontade${extra} e você tem ${wpHave}.` };
    }
    return { ok: true };
  },

  /** Desconta o custo da ficha. Chamado pela rolagem, depois das validações da parada. */
  payCost(char, sp, extraWillpower = 0) {
    const check = this.canPay(char, sp, extraWillpower);
    if (!check.ok) { showToast(check.reason, 'danger'); return null; }
    const { blood, willpower } = this.costOf(sp);
    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');

    if (blood) {
      // Rituais levam vários turnos: custos acima do limite por turno são pagos ao longo do ritual
      const spread = blood > rule.bloodPerTurn;
      let res = spendBlood(char, blood, { ignoreTurnLimit: spread });
      if (!res.ok) { showToast(res.reason, 'danger'); return null; }
      if (spread) showToast(`${blood} PS pagos ao longo do ritual (limite da ${rule.label}: ${rule.bloodPerTurn}/turno).`, 'info');
    }
    for (let i = 0; i < willpower; i++) {
      if (!spendWillpower(char, sp.name || 'feitiço')) return null;
    }
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    UIRenderer.renderWillpowerTemp(char);
    ExtRenderer.renderWillpowerBadge(char);
    return { blood, willpower, text: this.costText(sp) };
  },

  /** Botão "Rolar feitiço": leva a parada, a dificuldade e o custo para o dock. */
  cast(sp) {
    const char = AppState.activeCharacter;
    if (!char || !sp) return;
    const check = this.canPay(char, sp);
    if (!check.ok) { showToast(check.reason, 'danger'); return; }
    const kind = this.kindOf(sp);
    const parts = this.poolParts(char, sp);
    if (parts.some(p => p.missing)) {
      showToast(`Um traço deste ${kind.label.toLowerCase()} não existe mais na ficha. Escolha outro na parada.`, 'danger');
    }
    AmbientAudio.spell();
    LinkCableSystem.setPreset({
      kind: 'spell',
      title: `${kind.icon} ${sp.name || `${kind.label} sem nome`}`,
      parts,
      difficulty: this.difficultyOf(sp),
      applyWounds: true,
      note: this.presetNote(sp),
      meta: { spellId: sp.id }
    });
    const rollBtn = document.getElementById('btn-roll-dice');
    if (rollBtn) rollBtn.focus({ preventScroll: true });
  },

  /** Dados do feitiço gravados no resultado (histórico e Discord). */
  rollInfo(sp, paid) {
    const kind = this.kindOf(sp);
    return {
      name: sp.name || `${kind.label} sem nome`,
      kind: sp.kind,
      kindLabel: kind.label,
      icon: kind.icon,
      level: sp.level,
      tradition: sp.kind === 'power' ? 'outro' : sp.tradition,
      traditionLabel: this.sourceLabel(sp),
      effect: SPELL_EFFECTS[sp.effect].label,
      effectKey: sp.effect,
      costPaid: paid ? paid.text : 'sem custo'
    };
  },

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  add(kind = this.activeTab) {
    const char = AppState.activeCharacter;
    if (!char) return;
    if (this.activeTab !== kind) this.setTab(kind);
    const sp = this.normalize(kind === 'power'
      ? { kind, name: '', level: 1, description: '', diffMode: 'fixed', difficulty: 6 }
      : { kind, name: '', level: 1, description: '' });
    if (kind === 'ritual' && XPManager.enabled(char)) {
      const ok = XPManager.chargeItem(char, { ref: `rit:${sp.id}`, type: 'ritual', label: 'Novo ritual nível 1', amount: 2, rule: 'nível × 2' });
      if (!ok) return;
    }
    this.list(char).push(sp);
    this.open.add(sp.id);
    AppState.saveToStorage();
    this.render(char);
    const input = document.querySelector(`.spell-card[data-preset-id="${sp.id}"] .spell-name`);
    if (input) input.focus();
  },

  select(options, value, className, ariaLabel) {
    const sel = document.createElement('select');
    sel.className = className;
    if (ariaLabel) sel.setAttribute('aria-label', ariaLabel);
    const addOpt = (parent, o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (String(o.value) === String(value)) opt.selected = true;
      parent.appendChild(opt);
    };
    options.forEach(o => {
      if (o.options) {
        const g = document.createElement('optgroup');
        g.label = o.label;
        o.options.forEach(x => addOpt(g, x));
        sel.appendChild(g);
      } else {
        addOpt(sel, o);
      }
    });
    // Valor salvo que não existe mais na lista (Disciplina removida): mantém visível
    if (value && !Array.from(sel.options).some(o => o.value === String(value))) {
      addOpt(sel, { value, label: `${String(value).replace(/^(disc|path):/, '')} (removido)` });
    }
    return sel;
  },

  /** Botão da aba: minimiza ou expande todos os itens da aba atual. */
  renderCollapseAll(char) {
    const btn = document.getElementById('btn-grimoire-collapse-all');
    if (!btn || !char) return;
    const items = this.ofKind(char, this.activeTab);
    const anyOpen = items.some(sp => !sp.collapsed);
    btn.disabled = !items.length;
    btn.textContent = anyOpen ? '▾ Minimizar todos' : '▸ Expandir todos';
    btn.setAttribute('aria-label', `${anyOpen ? 'Minimizar' : 'Expandir'} todos os ${GRIMOIRE_KINDS[this.activeTab].plural.toLowerCase()}`);
  },

  toggleAll() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const items = this.ofKind(char, this.activeTab);
    const collapse = items.some(sp => !sp.collapsed);
    items.forEach(sp => { sp.collapsed = collapse; });
    AppState.saveToStorage();
    this.render(char);
  },

  /** Troca a aba visível do grimório (Rituais / Feitiços). */
  setTab(kind, { focus = false } = {}) {
    if (!GRIMOIRE_KINDS[kind]) return;
    this.activeTab = kind;
    safeStorageSet(GRIMOIRE_TAB_KEY, kind);
    const info = GRIMOIRE_KINDS[kind];
    document.querySelectorAll('[data-grimoire-tab]').forEach(tab => {
      const on = tab.dataset.grimoireTab === kind;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle('is-active', on);
      if (on && focus) tab.focus();
    });
    document.querySelectorAll('[data-grimoire-panel]').forEach(panel => {
      panel.hidden = panel.dataset.grimoirePanel !== kind;
    });
    document.querySelectorAll('[data-grimoire-only]').forEach(el => {
      el.hidden = el.dataset.grimoireOnly !== kind;
    });
    if (AppState.activeCharacter) this.renderCollapseAll(AppState.activeCharacter);
    const addBtn = document.getElementById('btn-add-ritual');
    if (addBtn) {
      addBtn.title = `Criar ${info.label.toLowerCase()}`;
      addBtn.setAttribute('aria-label', addBtn.title);
    }
  },

  bindTabs() {
    const tabs = Array.from(document.querySelectorAll('[data-grimoire-tab]'));
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => this.setTab(tab.dataset.grimoireTab));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        this.setTab(next.dataset.grimoireTab, { focus: true });
      });
    });
    this.setTab(this.activeTab);
    const all = document.getElementById('btn-grimoire-collapse-all');
    if (all) all.addEventListener('click', () => this.toggleAll());
  },

  /** Move um item entre Rituais e Feitiços, mantendo parada, custo e descrição. */
  moveKind(sp) {
    const char = AppState.activeCharacter;
    const target = GRIMOIRE_ORDER[(GRIMOIRE_ORDER.indexOf(sp.kind) + 1) % GRIMOIRE_ORDER.length];
    sp.kind = target;
    AppState.saveToStorage();
    this.render(char);
    showToast(`“${sp.name || 'Item'}” agora está em ${GRIMOIRE_KINDS[target].plural}.`, 'success');
  },

  field(labelText, control, extraClass = '') {
    const wrap = document.createElement('label');
    wrap.className = `spell-field ${extraClass}`.trim();
    const span = document.createElement('span');
    span.className = 'spell-field-label';
    span.textContent = labelText;
    wrap.append(span, control);
    return wrap;
  },

  render(char) {
    if (!char) return;
    const all = this.list(char);
    Object.keys(GRIMOIRE_KINDS).forEach(kind => {
      const items = all.filter(sp => sp.kind === kind);
      document.querySelectorAll(`[data-grimoire-count="${kind}"]`).forEach(el => { el.textContent = items.length; });
      this.renderKind(char, kind, items, all);
    });
    this.renderCollapseAll(char);
    this.markActive();
  },

  renderKind(char, kind, spells, all) {
    const info = GRIMOIRE_KINDS[kind];
    const listEl = document.getElementById(info.listId);
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!spells.length) {
      const empty = document.createElement('p');
      empty.className = 'spell-empty';
      empty.textContent = info.empty;
      listEl.appendChild(empty);
      return;
    }

    const attrOptions = [
      { label: 'Atributos', options: ATTRIBUTE_PATHS.map(p => ({ value: p, label: getTraitLabel(p) })) },
      { label: 'Outros', options: SPELL_PRIMARY_EXTRA }
    ];
    const secondaryOptions = this.secondaryOptions(char);
    const save = () => AppState.saveToStorage();

    spells.forEach((sp) => {
      const card = document.createElement('article');
      card.className = `spell-card kind-${sp.kind} effect-${sp.effect}`;
      card.dataset.tradition = sp.kind === 'power' ? 'power' : sp.tradition;
      card.dataset.presetId = sp.id;
      const isOpen = this.open.has(sp.id);

      // --- Linha 1: expandir, nível, nome, tradição, remover
      const head = document.createElement('div');
      head.className = 'spell-head';

      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'ritual-expand-btn collapse-arrow';
      const syncArrow = () => {
        expandBtn.textContent = sp.collapsed ? '▸' : '▾';
        expandBtn.setAttribute('aria-expanded', String(!sp.collapsed));
        expandBtn.title = sp.collapsed ? `Expandir ${info.label.toLowerCase()}` : `Minimizar ${info.label.toLowerCase()} (só o cabeçalho)`;
        card.classList.toggle('is-collapsed', sp.collapsed);
      };
      syncArrow();

      const level = this.select(
        Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: `Nível ${i + 1}` })),
        sp.level, 'spell-select spell-level', 'Nível do feitiço'
      );

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'spell-name';
      name.placeholder = info.placeholder;
      name.value = sp.name;
      name.setAttribute('aria-label', `Nome do ${info.label.toLowerCase()}`);

      const tradition = sp.kind === 'power'
        ? this.select(
          [{ value: '', label: 'Disciplina…' }].concat((char.disciplines || [])
            .filter(d => d && d.name && d.name.trim())
            .map(d => { const n = d.name.replace(/\s*\(.*$/, '').trim() || d.name.trim(); return { value: n, label: `${n} ${d.level || 0}` }; })),
          sp.discipline || '', 'spell-select spell-tradition', 'Disciplina do poder')
        : this.select(
          Object.entries(SPELL_TRADITIONS).map(([value, t]) => ({ value, label: t.label })),
          sp.tradition, 'spell-select spell-tradition', 'Tradição'
        );

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-remove-trait';
      remove.textContent = '✕';
      remove.title = `Remover ${info.label.toLowerCase()}`;
      remove.setAttribute('aria-label', `Remover ${sp.name || info.label.toLowerCase()}`);

      const other = GRIMOIRE_KINDS[GRIMOIRE_ORDER[(GRIMOIRE_ORDER.indexOf(kind) + 1) % GRIMOIRE_ORDER.length]];
      const move = document.createElement('button');
      move.type = 'button';
      move.className = 'spell-move';
      move.dataset.lockEdit = '';
      move.textContent = `${other.icon} ⇄`;
      move.title = `Mover para ${other.plural}`;
      move.setAttribute('aria-label', `Mover ${sp.name || info.label.toLowerCase()} para ${other.plural}`);

      head.append(expandBtn, level, name, tradition, move, remove);

      // --- Linha 2: parada de dados
      const primary = this.select(attrOptions, sp.primary, 'spell-select spell-pool-select', 'Atributo principal');
      const secondary = this.select(secondaryOptions, sp.secondary, 'spell-select spell-pool-select', 'Segundo traço');
      const fixed = document.createElement('input');
      fixed.type = 'number';
      fixed.min = '0';
      fixed.max = '20';
      fixed.value = sp.fixedValue;
      fixed.className = 'spell-number spell-fixed';
      fixed.setAttribute('aria-label', 'Valor fixo de dados');
      fixed.hidden = sp.secondary !== 'fixed';

      const poolRow = document.createElement('div');
      poolRow.className = 'spell-row spell-pool-row';
      const plus = document.createElement('span');
      plus.className = 'spell-plus';
      plus.textContent = '+';
      plus.setAttribute('aria-hidden', 'true');
      poolRow.append(
        this.field('Atributo', primary),
        plus,
        this.field('Habilidade / Disciplina', secondary),
        this.field('Dados', fixed, 'spell-fixed-field')
      );
      poolRow.querySelector('.spell-fixed-field').hidden = sp.secondary !== 'fixed';

      // --- Linha 3: dificuldade, custo, efeito
      const diff = this.select(
        [{ value: 'auto', label: `Auto (${this.autoDifficulty(sp)})` }]
          .concat(Array.from({ length: 9 }, (_, i) => ({ value: String(i + 2), label: `Fixa ${i + 2}` }))),
        sp.diffMode === 'auto' ? 'auto' : String(sp.difficulty),
        'spell-select spell-diff', 'Dificuldade'
      );
      const costType = this.select(
        Object.entries(SPELL_COST_TYPES).map(([value, label]) => ({ value, label })),
        sp.costType, 'spell-select spell-cost-type', 'Tipo de custo'
      );
      const costBlood = document.createElement('input');
      costBlood.type = 'number'; costBlood.min = '1'; costBlood.max = '20';
      costBlood.value = sp.costBlood;
      costBlood.className = 'spell-number';
      costBlood.setAttribute('aria-label', 'Pontos de sangue');
      const costWp = document.createElement('input');
      costWp.type = 'number'; costWp.min = '1'; costWp.max = '10';
      costWp.value = sp.costWillpower;
      costWp.className = 'spell-number';
      costWp.setAttribute('aria-label', 'Pontos de Força de Vontade');

      const bloodField = this.field('PS', costBlood, 'spell-cost-amount');
      const wpField = this.field('FV', costWp, 'spell-cost-amount');
      const syncCostFields = () => {
        const { blood, willpower } = this.costOf(sp);
        bloodField.hidden = !blood;
        wpField.hidden = !willpower;
      };
      syncCostFields();

      const effect = this.select(
        Object.entries(SPELL_EFFECTS).map(([value, e]) => ({ value, label: `${e.symbol} ${e.short}` })),
        sp.effect, 'spell-select spell-effect', 'Tipo de efeito'
      );

      const rulesRow = document.createElement('div');
      rulesRow.className = 'spell-row spell-rules-row';
      const costGroup = document.createElement('div');
      costGroup.className = 'spell-cost-group';
      costGroup.append(this.field('Custo', costType), bloodField, wpField);
      rulesRow.append(this.field('Dificuldade', diff), costGroup, this.field('Efeito', effect));

      // --- Linha 4: resumo + rolar
      const footer = document.createElement('div');
      footer.className = 'spell-footer';
      const summary = document.createElement('p');
      summary.className = 'spell-summary';
      summary.setAttribute('aria-live', 'polite');
      const castBtn = document.createElement('button');
      castBtn.type = 'button';
      castBtn.className = 'btn-cast-spell';
      castBtn.innerHTML = `<span aria-hidden="true">${info.icon}</span> Rolar ${info.label.toLowerCase()}`;
      const descBtn = document.createElement('button');
      descBtn.type = 'button';
      descBtn.className = 'btn-tiny spell-desc-toggle ritual-expand-btn';
      const syncDesc = () => {
        descBtn.textContent = desc.hidden ? '📝 Descrição' : '📝 Ocultar descrição';
        descBtn.setAttribute('aria-expanded', String(!desc.hidden));
      };

      if (sp.kind === 'ritual') {
        const xpChip = XPManager.itemChip(char, {
          ref: `rit:${sp.id}`, type: 'ritual', label: `${sp.name || 'Ritual'} (nível ${sp.level})`,
          amount: sp.level * 2, rule: 'nível × 2'
        }, () => this.render(char));
        const actions = document.createElement('div');
        actions.className = 'spell-footer-actions';
        actions.append(descBtn, xpChip, castBtn);
        footer.append(summary, actions);
      } else {
        const actions = document.createElement('div');
        actions.className = 'spell-footer-actions';
        actions.append(descBtn, castBtn);
        footer.append(summary, actions);
      }

      // --- Descrição colapsável
      const desc = document.createElement('textarea');
      desc.className = 'ritual-desc-textarea spell-desc';
      desc.rows = 3;
      desc.placeholder = 'Ingredientes, tempo de conjuração, sistema e efeito...';
      desc.value = sp.description;
      desc.hidden = !isOpen;
      syncDesc();
      desc.setAttribute('aria-label', `Descrição do ${info.label.toLowerCase()}`);

      const updateSummary = () => {
        const parts = PhysicalDisciplines.apply(char, this.poolParts(char, sp));
        const total = parts.reduce((a, p) => a + p.value, 0);
        const formula = parts.length ? parts.map(p => `${p.label} ${p.value}`).join(' + ') : 'sem traços';
        const dice = Math.max(0, total - getWoundState(char).penalty);
        const odds = RollProbability.compute(dice, this.difficultyOf(sp), { specialty: RollOptions.specialty, required: RollOptions.required });
        summary.innerHTML = `${escapeHtml(formula)} = <strong>${total} dado${total === 1 ? '' : 's'}</strong> · Dif <strong>${this.difficultyOf(sp)}</strong> · ${escapeHtml(this.costText(sp))} · <span class="odds-inline ${RollProbability.level(odds.success)}" title="Chance de ${RollOptions.required}+ sucesso(s)">${RollProbability.pct(odds.success)}</span>`;
        const pay = this.canPay(char, sp);
        castBtn.disabled = !pay.ok;
        castBtn.title = pay.ok ? `Leva ${total} dados para o rolador` : pay.reason;
        card.classList.toggle('cannot-pay', !pay.ok);
      };
      updateSummary();

      // --- Eventos
      const refreshPreset = () => {
        if (LinkCableSystem.preset && LinkCableSystem.preset.kind === 'spell' && LinkCableSystem.preset.meta.spellId === sp.id) {
          LinkCableSystem.preset.title = `${info.icon} ${sp.name || `${info.label} sem nome`}`;
          LinkCableSystem.preset.note = this.presetNote(sp);
          const diffSelect = document.getElementById('dock-difficulty');
          if (diffSelect) diffSelect.value = String(this.difficultyOf(sp));
          LinkCableSystem.updateDock();
        }
      };
      const changed = () => { save(); updateSummary(); refreshPreset(); };

      expandBtn.addEventListener('click', () => {
        sp.collapsed = !sp.collapsed;
        syncArrow();
        save();
        this.renderCollapseAll(char);
      });
      descBtn.addEventListener('click', () => {
        desc.hidden = !desc.hidden;
        syncDesc();
        desc.hidden ? this.open.delete(sp.id) : this.open.add(sp.id);
        if (!desc.hidden) desc.focus();
      });
      level.addEventListener('change', e => {
        const newLevel = clampInt(e.target.value, 1, 9, 1);
        if (sp.kind === 'ritual' && !XPManager.adjustItem(char, `rit:${sp.id}`, newLevel * 2, `${sp.name || 'Ritual'} nível ${newLevel}`)) {
          e.target.value = String(sp.level);
          return;
        }
        sp.level = newLevel;
        diff.options[0].textContent = `Auto (${this.autoDifficulty(sp)})`;
        changed();
      });
      name.addEventListener('input', e => { sp.name = e.target.value; changed(); });
      tradition.addEventListener('change', e => {
        if (sp.kind === 'power') { sp.discipline = e.target.value; }
        else { sp.tradition = e.target.value; card.dataset.tradition = sp.tradition; }
        changed();
      });
      move.addEventListener('click', () => this.moveKind(sp));
      remove.addEventListener('click', () => {
        XPManager.onRemove(char, `rit:${sp.id}`);
        const idx = all.indexOf(sp);
        if (idx >= 0) all.splice(idx, 1);
        this.open.delete(sp.id);
        if (LinkCableSystem.preset && LinkCableSystem.preset.meta && LinkCableSystem.preset.meta.spellId === sp.id) LinkCableSystem.clear();
        save();
        this.render(char);
      });
      primary.addEventListener('change', e => { sp.primary = e.target.value; changed(); });
      secondary.addEventListener('change', e => {
        sp.secondary = e.target.value;
        poolRow.querySelector('.spell-fixed-field').hidden = sp.secondary !== 'fixed';
        changed();
      });
      fixed.addEventListener('input', e => { sp.fixedValue = clampInt(e.target.value, 0, 20, 0); changed(); });
      diff.addEventListener('change', e => {
        if (e.target.value === 'auto') { sp.diffMode = 'auto'; }
        else { sp.diffMode = 'fixed'; sp.difficulty = clampInt(e.target.value, 2, 10, 6); }
        changed();
      });
      costType.addEventListener('change', e => { sp.costType = e.target.value; syncCostFields(); changed(); });
      costBlood.addEventListener('input', e => { sp.costBlood = clampInt(e.target.value, 1, 20, 1); changed(); });
      costWp.addEventListener('input', e => { sp.costWillpower = clampInt(e.target.value, 1, 10, 1); changed(); });
      effect.addEventListener('change', e => {
        sp.effect = e.target.value;
        card.className = card.className.replace(/effect-\w+/, `effect-${sp.effect}`);
        changed();
      });
      desc.addEventListener('input', e => { sp.description = e.target.value; save(); });
      castBtn.addEventListener('click', () => this.cast(sp));

      card.append(head, poolRow, rulesRow, footer, desc);
      listEl.appendChild(card);
    });
  },

  _refreshTimer: null,

  /** Agrupa várias mudanças seguidas (cliques em pontos, sangue, FV) em um único redesenho. */
  scheduleRefresh() {
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this.refresh(AppState.activeCharacter), 120);
  },

  /** Atualiza os resumos (valores de traços, sangue e FV mudaram). */
  refresh(char) {
    const card = document.querySelector('.grimoire-card');
    if (!card || !char) return;
    // Evita recriar os campos enquanto o usuário digita neles
    const active = document.activeElement;
    if (active && card.contains(active) && active.matches('input, textarea, select')) return;
    this.render(char);
  },

  /** Destaca o card (feitiço ou arma) que está no rolador. */
  markActive() {
    const preset = LinkCableSystem.preset;
    const activeId = preset && preset.meta ? (preset.meta.spellId || preset.meta.weaponId) : null;
    document.querySelectorAll('[data-preset-id]').forEach(el => {
      el.classList.toggle('is-active-preset', !!activeId && el.dataset.presetId === activeId);
    });
  }
};

// =============================================================================
// 8c. MODO EDITÁVEL XP (V20)
// Com o modo ligado, cada ponto comprado registra o custo no histórico de XP.
// XP Total/Gasto Automáticos = saldo inicial + histórico. Os campos manuais
// de Total e Gasto continuam livres para conferência.
// =============================================================================
const DISCIPLINE_ALIASES = {
  thaumaturgy: 'taumaturgia', auspex: 'auspicios', dominate: 'dominacao', potence: 'potencia',
  presence: 'presenca', celerity: 'celeridade', obfuscate: 'ofuscacao', animalism: 'animalismo',
  protean: 'metamorfose', obtenebration: 'tenebrosidade', necromancy: 'necromancia',
  chimerstry: 'quimerismo', dementation: 'demencia', thanatosis: 'tanatose'
};

/** Disciplinas conhecidas, oferecidas na caixa de sugestões (dá para digitar outra). */
const DISCIPLINE_CATALOG = [
  'Animalismo', 'Auspícios', 'Celeridade', 'Dominação', 'Fortitude', 'Metamorfose', 'Ofuscação', 'Potência', 'Presença',
  'Taumaturgia', 'Necromancia', 'Tenebrosidade', 'Quimerismo', 'Demência', 'Vicissitude', 'Serpentis', 'Tanatose',
  'Quietus', 'Obeah', 'Valeren', 'Melpominee', 'Mytherceria', 'Daimoinon', 'Visceratika', 'Sanguinus', 'Temporis',
  'Feitiçaria Koldúnica', 'Mortis', 'Ogham', 'Striga', 'Bardo', 'Deimos', 'Kai', 'Nihilistics', 'Flight of the Hawk'
];

/**
 * Caminhos (Trilhas) de magia de sangue, separados por Disciplina.
 * A ficha oferece só os da Disciplina que o personagem tem.
 */
const PATH_CATALOG = [
  {
    key: 'taumaturgia', label: 'Taumaturgia', match: /taumaturgia|thaumaturgy/i,
    paths: [
      'Trilha do Sangue', 'Mãos da Destruição', 'Sedução das Chamas', 'Movimento da Mente',
      'Domínio Elemental', 'Senhorio de Netuno', 'Senda da Conjuração', 'Senda das Maldições',
      'Senda da Corrupção', 'Senda de Marte', 'Vingança do Pai', 'Controle do Clima',
      'Senda do Raio', 'Caminho Verde', 'Manipulação Espiritual', 'Dádiva de Morfeu',
      'Tecnomancia', 'Senda dos Elementos Alquímicos', 'Senda do Focus', 'Senda da Poeira do Tempo',
      'Senda do Gelo', 'Senda do Vento', 'Senda da Transmutação'
    ]
  },
  {
    key: 'necromancia', label: 'Necromancia', match: /necromancia|necromancy/i,
    paths: [
      'Trilha do Sepulcro', 'Trilha dos Ossos', 'Trilha das Cinzas', 'Trilha do Cenotáfio',
      'Trilha do Cadáver no Monstro', 'Apodrecimento do Túmulo', 'Trilha Vítrea',
      'Trilha dos Quatro Humores', 'Trilha da Assombração', 'Trilha do Jardim do Crepúsculo',
      'Trilha da Aflição', 'Trilha das Sombras Mortas', 'Trilha do Nigromante'
    ]
  },
  {
    key: 'koldunica', label: 'Feitiçaria Koldúnica', match: /kold[uú]n|koldunic/i,
    paths: ['Via da Terra', 'Via do Fogo', 'Via da Água', 'Via do Vento', 'Via do Espírito']
  },
  {
    key: 'assamita', label: 'Feitiçaria Assamita', match: /assamita|assamite|dur-an-ki/i,
    paths: [
      'Senda do Sangue Fervente', 'Despertar do Aço', 'Senda das Chamas Internas',
      'Senda do Vento Musical', 'Hearth Path', 'Senda dos Espíritos', 'Senda do Véu'
    ]
  },
  {
    key: 'akhu', label: 'Akhu (Feitiçaria Setita)', match: /akhu|setita|setite/i,
    paths: ['Senda de Duat', 'Senda dos Sonhos de Ísis', 'Senda dos Ventos do Deserto', 'Senda da Serpente']
  },
  {
    key: 'mortis', label: 'Mortis (Dark Ages)', match: /mortis/i,
    paths: ['Senda das Cinzas', 'Senda dos Ossos', 'Senda do Sepulcro']
  }
];

/** Antecedentes conhecidos (V20 e Dark Ages). */
const BACKGROUND_CATALOG = [
  'Aliados', 'Contatos', 'Criadagem', 'Domínio', 'Fama', 'Geração', 'Influência', 'Lacaios', 'Mentor',
  'Rebanho', 'Recursos', 'Status', 'Cavalo de Guerra', 'Feudo', 'Refúgio', 'Biblioteca', 'Rituais',
  'Contatos na Igreja', 'Império Mercantil', 'Aliados Mortais'
];

/** Especializações comuns, por traço: a ficha sugere as do traço que você escrever. */
const SPECIALIZATION_CATALOG = {
  'Força': ['Empurrões', 'Golpes Esmagadores', 'Levantar Peso', 'Quebrar Objetos'],
  'Destreza': ['Esquiva', 'Mãos Rápidas', 'Precisão', 'Movimentos Felinos'],
  'Vigor': ['Resistir à Dor', 'Fôlego', 'Absorver Golpes'],
  'Carisma': ['Eloquência', 'Comandar Multidões', 'Simpatia'],
  'Manipulação': ['Mentiras', 'Sedução', 'Intriga', 'Barganha'],
  'Aparência': ['Presença Marcante', 'Elegância', 'Ar Aristocrático'],
  'Percepção': ['Detalhes', 'Emboscadas', 'Farejar Mentiras'],
  'Inteligência': ['Memória', 'Dedução', 'Erudição'],
  'Raciocínio': ['Reagir Rápido', 'Improviso', 'Iniciativa'],
  'Prontidão': ['Emboscadas', 'Multidões', 'Sons Estranhos'],
  'Esportes': ['Corrida', 'Escalada', 'Natação', 'Acrobacia'],
  'Briga': ['Socos', 'Agarrões', 'Luta Suja', 'Presas'],
  'Empatia': ['Emoções', 'Mentiras', 'Animais'],
  'Expressão': ['Discursos', 'Poesia', 'Escrita'],
  'Intimidação': ['Ameaças Veladas', 'Violência', 'Olhar'],
  'Liderança': ['Coterie', 'Batalha', 'Oratória'],
  'Manha': ['Boatos', 'Mercado Negro', 'Gangues'],
  'Lábia': ['Disfarces', 'Meias Verdades', 'Fugir do Assunto'],
  'Armas Brancas': ['Espadas', 'Adagas', 'Machados', 'Lanças'],
  'Armas de Fogo': ['Pistolas', 'Rifles', 'Tiro Rápido'],
  'Arquearia': ['Arco Longo', 'Besta', 'Tiro Montado'],
  'Furtividade': ['Sombras', 'Multidões', 'Silêncio'],
  'Furto': ['Fechaduras', 'Batedor de Carteiras', 'Arrombamento'],
  'Sobrevivência': ['Rastreamento', 'Florestas', 'Cidades'],
  'Condução': ['Perseguições', 'Terreno Ruim'],
  'Cavalgar': ['Combate Montado', 'Longas Viagens'],
  'Etiqueta': ['Corte', 'Elysium', 'Alta Sociedade'],
  'Ofícios': ['Ferraria', 'Costura', 'Carpintaria'],
  'Performance': ['Canto', 'Dança', 'Instrumentos'],
  'Empatia c/ Animais': ['Cães', 'Cavalos', 'Ratos', 'Lobos'],
  'Acadêmicos': ['História', 'Filosofia', 'Línguas Mortas'],
  'Ocultismo': ['Taumaturgia', 'Rituais', 'Lendas Cainitas', 'Demonologia'],
  'Investigação': ['Interrogatório', 'Pistas', 'Vigilância'],
  'Direito': ['Tradições', 'Contratos', 'Criminal'],
  'Medicina': ['Ferimentos', 'Venenos', 'Anatomia'],
  'Política': ['Camarilla', 'Sabbat', 'Corte Local'],
  'Ciência': ['Química', 'Astronomia', 'Alquimia'],
  'Teologia': ['Heresias', 'Rituais da Igreja', 'Escrituras'],
  'Senescal': ['Administração', 'Tesouraria', 'Rede de Servos'],
  'Enigmas': ['Charadas', 'Presságios', 'Códigos'],
  'Sabedoria Popular': ['Ervas', 'Superstições', 'Folclore']
};

const SpecializationCatalog = {
  /** Sugestões no formato "Traço: Especialização", priorizando o traço já digitado. */
  names(char, typed = '') {
    const out = [];
    const base = String(typed || '').split(':')[0].trim();
    const matches = (trait) => base && stripAccents(trait.toLowerCase()).startsWith(stripAccents(base.toLowerCase()));
    const push = (trait) => SPECIALIZATION_CATALOG[trait].forEach(sp => out.push(`${trait}: ${sp}`));
    Object.keys(SPECIALIZATION_CATALOG).filter(matches).forEach(push);
    Object.keys(SPECIALIZATION_CATALOG).filter(t => !matches(t)).forEach(push);
    return out;
  },

  render(char, typed = '') {
    let dl = document.getElementById('specialization-names');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'specialization-names';
      document.body.appendChild(dl);
    }
    dl.innerHTML = '';
    this.names(char, typed).slice(0, 160).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
  }
};

const BackgroundCatalog = {
  names(char) {
    const out = [];
    const add = (name) => {
      const clean = String(name || '').trim();
      if (clean && !out.some(x => stripAccents(x.toLowerCase()) === stripAccents(clean.toLowerCase()))) out.push(clean);
    };
    BACKGROUND_CATALOG.forEach(add);
    (AppState.characters || []).forEach(c => (c.backgrounds || []).forEach(b => add(b.name)));
    return out;
  },

  render(char) {
    let dl = document.getElementById('background-names');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'background-names';
      document.body.appendChild(dl);
    }
    dl.innerHTML = '';
    this.names(char).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
  }
};

const PathCatalog = {
  /** Só os Caminhos das Disciplinas que a ficha tem; sem nenhuma delas, mostra tudo. */
  groups(char) {
    const discs = (char && char.disciplines) || [];
    const owned = PATH_CATALOG.filter(g => discs.some(d => g.match.test(d.name || '')));
    return owned.length ? owned : PATH_CATALOG;
  },

  names(char) {
    const out = [];
    const add = (name) => {
      const clean = String(name || '').replace(/\s*\(.*$/, '').trim();
      if (clean && !out.some(x => stripAccents(x.toLowerCase()) === stripAccents(clean.toLowerCase()))) out.push(clean);
    };
    this.groups(char).forEach(g => g.paths.forEach(add));
    (char && char.paths ? char.paths : []).forEach(p => add(p.name));
    return out;
  },

  render(char) {
    let dl = document.getElementById('path-names');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'path-names';
      document.body.appendChild(dl);
    }
    dl.innerHTML = '';
    this.names(char).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
    const hint = document.getElementById('paths-hint');
    if (hint) {
      const gs = this.groups(char);
      const owned = (char.disciplines || []).some(d => PATH_CATALOG.some(g => g.match.test(d.name || '')));
      hint.textContent = owned
        ? `Sugestões de ${gs.map(g => g.label).join(' e ')}. Dá para escrever qualquer outro nome.`
        : 'Sem Disciplina de magia de sangue na ficha: a lista mostra todos os Caminhos conhecidos.';
    }
  }
};

const DisciplineCatalog = {
  /** Sugestões: primeiro as do clã, depois as já usadas nas fichas, depois o catálogo. */
  names(char) {
    const out = [];
    const add = (name) => {
      const clean = String(name || '').replace(/\s*\(.*$/, '').trim();
      if (clean && !out.some(x => sameDiscipline(x, clean))) out.push(clean);
    };
    const preset = char && char.header ? findClanPreset(char.header.clan) : null;
    if (preset) preset.disciplines.forEach(add);
    (AppState.characters || []).forEach(c => (c.disciplines || []).forEach(d => add(d.name)));
    DISCIPLINE_CATALOG.forEach(add);
    return out;
  },

  render(char) {
    let dl = document.getElementById('discipline-names');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'discipline-names';
      document.body.appendChild(dl);
    }
    dl.innerHTML = '';
    this.names(char).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
  }
};

function stripAccents(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Nome canônico de Disciplina: sem sufixo "(xp)", sem acento e com apelidos em inglês. */
function canonicalDiscipline(name) {
  const base = stripAccents(baseTraitName(name));
  return DISCIPLINE_ALIASES[base] || base;
}

function sameDiscipline(a, b) {
  const ca = canonicalDiscipline(a);
  return !!ca && ca === canonicalDiscipline(b);
}

/** Tabela de custos (V20, cap. 6) usada no painel de referência. */
const XP_COST_TABLE = [
  ['Atributo', 'nível atual × 4', 'Ex.: 2 → 3 custa 8 XP.'],
  ['Nova Habilidade', '3', 'Primeiro ponto numa Habilidade não treinada.'],
  ['Habilidade', 'nível atual × 2', 'Ex.: 3 → 4 custa 6 XP.'],
  ['Especialização', '3', 'Além da gratuita no nível 4 (marque como gratuita).'],
  ['Nova Disciplina', '10', 'Primeiro ponto de uma Disciplina que você não tem.'],
  ['Disciplina de Clã', 'nível atual × 5', 'As 3 Disciplinas do clã ou linhagem.'],
  ['Disciplina fora do Clã', 'nível atual × 7', 'Exige vitae ou tutor.'],
  ['Disciplina de Caitiff', 'nível atual × 6', 'Caitiff não tem Disciplinas de clã.'],
  ['Nova Trilha (Taumaturgia/Necromancia)', '7', 'Trilha secundária.'],
  ['Trilha secundária', 'nível atual × 4', 'A Trilha principal sobe junto com a Disciplina (grátis).'],
  ['Ritual', 'nível × 2', 'Marque como gratuito os recebidos na criação.'],
  ['Virtude', 'nível atual × 2', 'Não aumenta Humanidade nem Força de Vontade.'],
  ['Humanidade / Trilha', 'nível atual × 2', ''],
  ['Força de Vontade', 'nível atual × 1', 'A característica mais barata.'],
  ['Antecedente (regra da casa)', 'novo: 3 · depois nível × 3', 'Só com a opção ligada; no V20 depende do Narrador.'],
  ['Feitiços (poderes de Trilha)', 'grátis', 'Vêm com o nível da Trilha.']
];

const XPManager = {
  _lastFreeNote: 0,

  state(char) {
    if (!char.xp_auto || typeof char.xp_auto !== 'object') char.xp_auto = {};
    const st = char.xp_auto;
    if (typeof st.enabled !== 'boolean') st.enabled = false;
    if (typeof st.initialized !== 'boolean') st.initialized = false;
    st.baseTotal = clampInt(st.baseTotal, 0, 99999, 0);
    st.baseSpent = clampInt(st.baseSpent, 0, 99999, 0);
    if (typeof st.allowNegative !== 'boolean') st.allowNegative = false;
    if (typeof st.backgroundRule !== 'boolean') st.backgroundRule = false;
    if (!Array.isArray(st.log)) st.log = [];
    return st;
  },

  enabled(char = AppState.activeCharacter) {
    return !!(char && this.state(char).enabled);
  },

  totals(char) {
    const st = this.state(char);
    let gains = 0;
    let spends = 0;
    st.log.forEach(e => {
      const n = parseInt(e.amount, 10) || 0;
      if (e.kind === 'gain') gains += n; else spends += n;
    });
    const total = st.baseTotal + gains;
    const spent = st.baseSpent + spends;
    return { gains, spends, total, spent, available: total - spent };
  },

  manual(char) {
    const total = parseInt(char.xp && char.xp.total, 10) || 0;
    const spent = parseInt(char.xp && char.xp.spent, 10) || 0;
    return { total, spent, available: total - spent };
  },

  // ---------------------------------------------------------------------------
  // Regras de custo
  // ---------------------------------------------------------------------------
  disciplineCategory(char, disc) {
    const clanName = (char.header && char.header.clan) || '';
    const preset = findClanPreset(clanName);
    const caitiff = (preset && preset.key === 'caitiff') || /caitiff/i.test(clanName);
    if (caitiff) return { key: 'caitiff', label: 'Caitiff', mult: 6 };
    let clan;
    if (disc.xpCategory === 'clan') clan = true;
    else if (disc.xpCategory === 'out') clan = false;
    else clan = disc.inClan === true || !!(preset && preset.disciplines.some(n => sameDiscipline(n, disc.name)));
    return clan ? { key: 'clan', label: 'Clã', mult: 5 } : { key: 'out', label: 'Fora do clã', mult: 7 };
  },

  isPrimaryPath(pth) {
    if (typeof pth.xpPrimary === 'boolean') return pth.xpPrimary;
    return /principal|prim[aá]ria|primary/i.test(pth.name || '');
  },

  findById(list, id) {
    return (list || []).find(x => x && x.id === id) || null;
  },

  /** Descreve um traço comprável a partir da referência gravada no grupo de pontos. */
  describe(char, ref) {
    if (!ref) return null;
    if (ref.startsWith('attributes.')) {
      return { type: 'attribute', label: getTraitLabel(ref), rule: 'nível atual × 4', step: lvl => lvl * 4 };
    }
    if (ref.startsWith('abilities.')) {
      return { type: 'ability', label: getTraitLabel(ref), rule: 'nova 3 · nível atual × 2', step: lvl => (lvl === 0 ? 3 : lvl * 2) };
    }
    if (ref.startsWith('virtues.')) {
      return {
        type: 'virtue', label: getTraitLabel(ref), rule: 'nível atual × 2',
        note: 'não altera Humanidade nem Força de Vontade', step: lvl => Math.max(lvl, 1) * 2
      };
    }
    if (ref === 'status.humanity') {
      const name = (char.status && char.status.path_name && char.status.path_name.trim()) || 'Humanidade';
      return { type: 'humanity', label: name, rule: 'nível atual × 2', step: lvl => Math.max(lvl, 1) * 2 };
    }
    if (ref === 'status.willpower_perm') {
      return { type: 'willpower', label: 'Força de Vontade', rule: 'nível atual × 1', step: lvl => Math.max(lvl, 1) };
    }
    const [prefix, id] = ref.split(':');
    if (prefix === 'disc') {
      const disc = this.findById(char.disciplines, id);
      if (!disc) return null;
      const cat = this.disciplineCategory(char, disc);
      return {
        type: 'discipline', label: (disc.name || 'Disciplina').trim(),
        rule: `nova 10 · ${cat.label.toLowerCase()} × ${cat.mult}`,
        step: lvl => (lvl === 0 ? 10 : lvl * cat.mult)
      };
    }
    if (prefix === 'path') {
      const pth = this.findById(char.paths, id);
      if (!pth) return null;
      if (this.isPrimaryPath(pth)) {
        return { type: 'path', label: (pth.name || 'Trilha').trim(), free: true, freeNote: 'A Trilha principal sobe junto com a Disciplina, sem custo extra.' };
      }
      return { type: 'path', label: (pth.name || 'Trilha').trim(), rule: 'nova 7 · nível atual × 4', step: lvl => (lvl === 0 ? 7 : lvl * 4) };
    }
    if (prefix === 'bg') {
      const bg = this.findById(char.backgrounds, id);
      if (!bg) return null;
      const label = (bg.name || 'Antecedente').trim();
      if (!this.state(char).backgroundRule) {
        return { type: 'background', label, free: true, freeNote: 'Antecedentes não custam XP no V20. Ligue a regra da casa no histórico de XP se a mesa usar.' };
      }
      return { type: 'background', label, rule: 'novo 3 · nível atual × 3', step: lvl => (lvl === 0 ? 3 : lvl * 3) };
    }
    return null;
  },

  /** Nível atual de uma referência de XP (sem bônus temporários de sangue). */
  currentLevel(char, ref) {
    const [prefix, id] = String(ref || '').split(':');
    const lists = { disc: char.disciplines, path: char.paths, bg: char.backgrounds };
    if (lists[prefix]) {
      const item = this.findById(lists[prefix], id);
      return item ? (parseInt(item.level, 10) || 0) : 0;
    }
    return parseInt(getNestedValue(char, ref), 10) || 0;
  },

  setLevel(char, ref, value) {
    const [prefix, id] = String(ref || '').split(':');
    const lists = { disc: char.disciplines, path: char.paths, bg: char.backgrounds };
    if (lists[prefix]) {
      const item = this.findById(lists[prefix], id);
      if (item) item.level = value;
      return;
    }
    setNestedValue(char, ref, value);
  },

  /** Máximo de pontos de cada tipo de traço na ficha. */
  maxFor(ref) {
    if (String(ref).startsWith('virtues.')) return 5;
    if (ref === 'status.humanity' || ref === 'status.willpower_perm') return 10;
    return 9;
  },

  /** Na primeira vez, o saldo automático começa dos campos Total e Gasto. */
  ensureBaseline(char) {
    const st = this.state(char);
    if (st.initialized) return false;
    const m = this.manual(char);
    st.baseTotal = Math.max(0, m.total);
    st.baseSpent = Math.max(0, m.spent);
    st.initialized = true;
    showToast(`Saldo inicial importado dos campos manuais: total ${st.baseTotal}, gasto ${st.baseSpent}. Ajuste no histórico se precisar.`, 'info');
    return true;
  },

  /** Nome atual do item (o histórico mostra o nome mesmo após renomear). */
  refName(char, entry) {
    const [prefix, id] = String(entry.ref || '').split(':');
    const lists = { disc: char.disciplines, path: char.paths, bg: char.backgrounds, spec: char.specializations, rit: char.rituals_list };
    if (prefix === 'session') {
      const sessions = char.sessions || [];
      const sIdx = sessions.findIndex(x => x.id === id);
      return sIdx >= 0 ? `📖 ${SessionJournal.label(sessions[sIdx], sIdx)}` : entry.label;
    }
    const item = lists[prefix] ? this.findById(lists[prefix], id) : null;
    if (!item) return entry.label;
    const name = item.name && item.name.trim();
    if (prefix === 'rit') return `Ritual ${name ? `“${name}”` : 'sem nome'} (nível ${item.level})`;
    if (prefix === 'spec') return `Especialização ${name ? `“${name}”` : 'sem nome'}`;
    return name || entry.label;
  },

  addEntry(char, entry) {
    const st = this.state(char);
    st.log.push({ id: generateUniqueId(), ts: Date.now(), ...entry });
    if (entry.kind === 'gain') AmbientAudio.xp();
  },

  canAfford(char, cost) {
    const st = this.state(char);
    const t = this.totals(char);
    return { ok: st.allowNegative || cost <= t.available, available: t.available };
  },

  insufficientMsg(label, cost, available) {
    return `${label} custa ${cost} XP e o saldo automático é ${available}. Registre o XP ganho no histórico (＋ XP ganho) ou permita saldo negativo.`;
  },

  // ---------------------------------------------------------------------------
  // Pontos (chamado por buildDotsHtml antes de alterar o valor)
  // ---------------------------------------------------------------------------
  beforeChange(container, oldVal, newVal) {
    const char = AppState.activeCharacter;
    if (!char || !this.enabled(char) || oldVal === newVal) return true;
    const ref = container.dataset.xpRef;
    const d = this.describe(char, ref);
    if (!d) return true;
    if (d.free) {
      const now = Date.now();
      if (now - this._lastFreeNote > 4000) { this._lastFreeNote = now; showToast(d.freeNote, 'info'); }
      return true;
    }
    const st = this.state(char);

    if (newVal > oldVal) {
      const steps = [];
      for (let lvl = oldVal; lvl < newVal; lvl++) steps.push({ from: lvl, to: lvl + 1, cost: d.step(lvl) });
      const cost = steps.reduce((a, s) => a + s.cost, 0);
      const afford = this.canAfford(char, cost);
      if (!afford.ok) {
        showToast(this.insufficientMsg(`${d.label} ${oldVal} → ${newVal}`, cost, afford.available), 'danger');
        return false;
      }
      steps.forEach(s => this.addEntry(char, {
        kind: 'spend', ref, type: d.type, label: d.label, from: s.from, to: s.to, amount: s.cost, rule: d.rule
      }));
      const left = this.totals(char).available;
      showToast(`${d.label} ${oldVal} → ${newVal}: −${cost} XP (saldo ${left})${d.note ? ` · ${d.note}` : ''}`, 'success');
      this.renderPanel(char);
      return true;
    }

    // Reduzir: estorna as compras registradas, do nível atual para baixo
    const remove = [];
    for (let lvl = oldVal; lvl > newVal; lvl--) {
      let found = null;
      for (let i = st.log.length - 1; i >= 0; i--) {
        const e = st.log[i];
        if (e.kind === 'spend' && e.ref === ref && e.to === lvl && !remove.includes(e)) { found = e; break; }
      }
      if (!found) {
        showToast(`${d.label} ${lvl} não foi comprado no Modo XP, então não há o que estornar. Para corrigir sem mexer no XP, desligue o Modo XP.`, 'danger');
        return false;
      }
      remove.push(found);
    }
    const refund = remove.reduce((a, e) => a + (parseInt(e.amount, 10) || 0), 0);
    st.log = st.log.filter(e => !remove.includes(e));
    showToast(`${d.label} ${oldVal} → ${newVal}: +${refund} XP estornados (saldo ${this.totals(char).available}).`, 'info');
    this.renderPanel(char);
    return true;
  },

  /** Texto do tooltip de cada ponto no Modo XP. */
  previewTitle(container, currentVal, target) {
    const char = AppState.activeCharacter;
    const d = this.describe(char, container.dataset.xpRef);
    if (!d) return `${target}`;
    if (d.free) return `${target} · sem custo de XP`;
    if (target <= currentVal) return target === currentVal ? `Estornar o ponto ${target}` : `Estornar até ${target - 1}`;
    let cost = 0;
    for (let lvl = currentVal; lvl < target; lvl++) cost += d.step(lvl);
    return `Comprar até ${target}: ${cost} XP (saldo ${this.totals(char).available}) · ${d.rule}`;
  },

  // ---------------------------------------------------------------------------
  // Itens com custo fixo (especializações e rituais)
  // ---------------------------------------------------------------------------
  entryFor(char, ref) {
    const log = this.state(char).log;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].kind === 'spend' && log[i].ref === ref) return log[i];
    }
    return null;
  },

  chargeItem(char, { ref, type, label, amount, rule }) {
    const afford = this.canAfford(char, amount);
    if (!afford.ok) { showToast(this.insufficientMsg(label, amount, afford.available), 'danger'); return false; }
    this.addEntry(char, { kind: 'spend', ref, type, label, amount, rule });
    showToast(`${label}: −${amount} XP (saldo ${this.totals(char).available}).`, 'success');
    this.renderPanel(char);
    return true;
  },

  /** Estorna todas as compras de um item (remoção ou marcar como gratuito). */
  refundRef(char, ref, silent = false) {
    const st = this.state(char);
    const entries = st.log.filter(e => e.kind === 'spend' && e.ref === ref);
    if (!entries.length) return 0;
    const refund = entries.reduce((a, e) => a + (parseInt(e.amount, 10) || 0), 0);
    st.log = st.log.filter(e => !entries.includes(e));
    if (!silent) showToast(`+${refund} XP estornados (saldo ${this.totals(char).available}).`, 'info');
    this.renderPanel(char);
    return refund;
  },

  /** Ao remover uma linha no Modo XP, devolve o XP gasto nela. */
  onRemove(char, ref) {
    if (this.enabled(char)) this.refundRef(char, ref);
  },

  /** Ajusta o custo de um ritual pago quando o nível muda. */
  adjustItem(char, ref, newAmount, label) {
    const entry = this.entryFor(char, ref);
    if (!entry || !this.enabled(char)) return true;
    const diff = newAmount - (parseInt(entry.amount, 10) || 0);
    if (diff > 0) {
      const afford = this.canAfford(char, diff);
      if (!afford.ok) { showToast(this.insufficientMsg(`${label} (diferença)`, diff, afford.available), 'danger'); return false; }
    }
    entry.amount = newAmount;
    if (diff) showToast(`${label}: ${diff > 0 ? '−' : '+'}${Math.abs(diff)} XP (saldo ${this.totals(char).available}).`, diff > 0 ? 'success' : 'info');
    this.renderPanel(char);
    return true;
  },

  chip(text, title, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `xp-chip ${extraClass}`.trim();
    b.dataset.lockEdit = '';
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  },

  /** Selo "Pago / Comprar" para especializações e rituais. */
  itemChip(char, { ref, type, label, amount, rule, compact = false }, onChange) {
    const entry = this.entryFor(char, ref);
    const b = entry
      ? this.chip(`✓ ${entry.amount} XP`, `${label}: pago com ${entry.amount} XP. Clique para marcar como gratuito e estornar.`, 'is-paid')
      : this.chip(compact ? 'Grátis' : `Grátis · pagar ${amount} XP`, `${label}: sem custo registrado. Clique para pagar ${amount} XP (${rule}).`);
    b.addEventListener('click', () => {
      if (!this.enabled(char)) { showToast('Ligue o Modo Editável XP para pagar ou estornar.', 'info'); return; }
      if (entry) this.refundRef(char, ref);
      else if (!this.chargeItem(char, { ref, type, label, amount, rule })) return;
      AppState.saveToStorage();
      onChange();
    });
    return b;
  },

  /** Selo de categoria da Disciplina (Clã ×5 / Fora ×7 / Caitiff ×6). */
  disciplineChip(char, disc, onChange) {
    const cat = this.disciplineCategory(char, disc);
    const lvl = parseInt(disc.level, 10) || 0;
    const next = lvl === 0 ? 10 : lvl * cat.mult;
    const b = this.chip(
      `${cat.key === 'out' ? 'Fora' : cat.label} ×${cat.mult}`,
      `Próximo ponto: ${next} XP. ${cat.key === 'caitiff' ? 'Caitiff paga ×6 em todas.' : 'Clique para alternar entre Clã e Fora do clã.'}`,
      `cat-${cat.key}`
    );
    b.addEventListener('click', () => {
      if (cat.key === 'caitiff') { showToast('Caitiff não tem Disciplinas de clã: todas custam nível atual × 6.', 'info'); return; }
      disc.xpCategory = cat.key === 'clan' ? 'out' : 'clan';
      AppState.saveToStorage();
      onChange();
    });
    return b;
  },

  /** Selo de Trilha principal (grátis) ou secundária (×4). */
  pathChip(char, pth, onChange) {
    const primary = this.isPrimaryPath(pth);
    const lvl = parseInt(pth.level, 10) || 0;
    const b = primary
      ? this.chip('Principal', 'Trilha principal: sobe com a Disciplina, sem custo. Clique para tratar como secundária.', 'is-primary')
      : this.chip('Sec. ×4', `Próximo ponto: ${lvl === 0 ? 7 : lvl * 4} XP. Clique para marcar como principal.`);
    b.addEventListener('click', () => {
      pth.xpPrimary = !primary;
      AppState.saveToStorage();
      onChange();
    });
    return b;
  },

  // ---------------------------------------------------------------------------
  // Modo e painel
  // ---------------------------------------------------------------------------
  toggle() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const st = this.state(char);
    if (!st.enabled) this.ensureBaseline(char);
    st.enabled = !st.enabled;
    AppState.saveToStorage();
    this.apply(char);
    showToast(st.enabled
      ? '✦ Modo Editável XP ligado: cada ponto comprado desconta XP automaticamente.'
      : 'Modo Editável XP desligado: os pontos voltam a mudar sem custo.', st.enabled ? 'success' : 'info');
  },

  apply(char) {
    if (!char) return;
    const on = this.enabled(char);
    document.body.classList.toggle('xp-mode', on);
    document.querySelectorAll('[data-xp-toggle]').forEach(btn => {
      btn.setAttribute('aria-checked', String(on));
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
    });
    this.renderPanel(char);
  },

  renderPanel(char) {
    if (typeof FX !== 'undefined') FX.xpBar(char);
    if (!char) return;
    const t = this.totals(char);
    const m = this.manual(char);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('xp-auto-total', t.total);
    set('xp-auto-spent', t.spent);
    set('xp-auto-available', t.available);
    set('xp-mode-pill-balance', t.available);
    const avail = document.getElementById('xp-auto-available');
    if (avail) avail.classList.toggle('is-negative', t.available < 0);

    const diff = document.getElementById('xp-auto-diff');
    if (diff) {
      const st = this.state(char);
      if (!st.initialized) {
        diff.textContent = 'Ligue o modo para começar: o saldo inicial vem dos campos Total e Gasto.';
        diff.className = 'xp-auto-diff';
      } else if (m.total === t.total && m.spent === t.spent) {
        diff.textContent = '✓ Manual e automático conferem.';
        diff.className = 'xp-auto-diff is-ok';
      } else {
        const parts = [];
        if (m.total !== t.total) parts.push(`total ${m.total} × ${t.total}`);
        if (m.spent !== t.spent) parts.push(`gasto ${m.spent} × ${t.spent}`);
        diff.textContent = `Manual × automático: ${parts.join(' · ')}`;
        diff.className = 'xp-auto-diff is-warn';
      }
    }
    const count = document.getElementById('xp-ledger-count');
    if (count) count.textContent = this.state(char).log.length;
    GoalPlanner.renderSummary(char);
    if (!document.getElementById('xp-ledger-modal')?.classList.contains('hidden')) this.renderLedger(char);
  },

  syncManual() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const t = this.totals(char);
    GothicDialog.confirm({
      title: 'Copiar XP automático',
      message: `Os campos manuais passam a Total ${t.total} e Gasto ${t.spent}.`,
      confirmLabel: 'Copiar valores'
    }).then(ok => { if (ok) this._doSync(char, t); });
  },

  _doSync(char, t) {
    if (!char.xp) char.xp = {};
    char.xp.total = t.total;
    char.xp.spent = t.spent;
    ['field-xp-total', 'field-xp-spent'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.value = i === 0 ? t.total : t.spent;
    });
    AppState.saveToStorage();
    UIRenderer.updateXPCalculation(char);
    showToast('Total e Gasto manuais atualizados com os valores automáticos.', 'success');
  },

  // ---------------------------------------------------------------------------
  // Histórico de XP (modal)
  // ---------------------------------------------------------------------------
  openLedger(focusGain = false) {
    const char = AppState.activeCharacter;
    const modal = document.getElementById('xp-ledger-modal');
    if (!char || !modal) return;
    this.renderCostTable();
    this.renderLedger(char);
    if (focusGain) {
      const gain = document.querySelector('input[name="xp-entry-kind"][value="gain"]');
      if (gain) gain.checked = true;
    }
    this.syncEntryForm();
    modal.classList.remove('hidden');
    const target = document.getElementById(focusGain ? 'xp-gain-amount' : 'btn-close-xp-ledger');
    if (target) setTimeout(() => target.focus(), 30);
  },

  closeLedger() {
    const modal = document.getElementById('xp-ledger-modal');
    if (modal) modal.classList.add('hidden');
  },

  renderCostTable() {
    const body = document.getElementById('xp-cost-table-body');
    if (!body || body.children.length) return;
    body.innerHTML = XP_COST_TABLE.map(([a, b, c]) =>
      `<tr><td>${escapeHtml(a)}</td><td><strong>${escapeHtml(b)}</strong></td><td>${escapeHtml(c)}</td></tr>`).join('');
  },

  renderLedger(char) {
    const st = this.state(char);
    const t = this.totals(char);
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    setVal('xp-base-total', st.baseTotal);
    setVal('xp-base-spent', st.baseSpent);
    const neg = document.getElementById('xp-allow-negative');
    if (neg) neg.checked = st.allowNegative;
    const bgRule = document.getElementById('xp-background-rule');
    if (bgRule) bgRule.checked = st.backgroundRule;
    const summary = document.getElementById('xp-ledger-summary');
    if (summary) {
      summary.innerHTML = `Total <strong>${t.total}</strong> (inicial ${st.baseTotal} + ganhos ${t.gains}) · Gasto <strong>${t.spent}</strong> (inicial ${st.baseSpent} + compras ${t.spends}) · Saldo <strong class="${t.available < 0 ? 'is-negative' : ''}">${t.available}</strong>`;
    }

    const list = document.getElementById('xp-ledger-list');
    if (!list) return;
    list.innerHTML = '';
    if (!st.log.length) {
      list.innerHTML = '<li class="xp-ledger-empty">Nenhum registro ainda. Ligue o Modo XP e clique nos pontos para comprar.</li>';
      return;
    }
    const fmt = ts => {
      try { return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
      catch (e) { return ''; }
    };
    [...st.log].reverse().forEach(e => {
      const li = document.createElement('li');
      li.className = `xp-ledger-item is-${e.kind}`;
      const name = this.refName(char, e);
      const change = (e.from !== undefined && e.to !== undefined) ? ` ${e.from} → ${e.to}` : '';
      const what = e.kind === 'gain' ? (e.label || 'XP ganho') : `${name}${change}${e.viaGoal ? ' 🎯' : ''}`;
      li.innerHTML = `
        <span class="xp-ledger-date">${escapeHtml(fmt(e.ts))}</span>
        <span class="xp-ledger-what">${escapeHtml(what)}${e.rule ? `<small>${escapeHtml(e.rule)}</small>` : ''}</span>
        <span class="xp-ledger-amount">${e.kind === 'gain' ? '+' : '−'}${parseInt(e.amount, 10) || 0}</span>`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-remove-trait';
      del.textContent = '✕';
      del.title = e.kind === 'gain' ? 'Remover este ganho' : 'Apagar este registro (o traço não muda)';
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => {
        st.log = st.log.filter(x => x !== e);
        AppState.saveToStorage();
        this.renderPanel(char);
        this.renderLedger(char);
      });
      li.appendChild(del);
      list.appendChild(li);
    });
  },

  entryKind() {
    const checked = document.querySelector('input[name="xp-entry-kind"]:checked');
    return checked ? checked.value : 'gain';
  },

  /** Mostra os campos certos para ganho, gasto personalizado ou ritual. */
  syncEntryForm() {
    const kind = this.entryKind();
    const category = (document.getElementById('xp-spend-category') || {}).value || 'custom';
    const isRitual = kind === 'spend' && category === 'ritual';
    const extra = document.getElementById('xp-spend-extra');
    if (extra) extra.hidden = kind !== 'spend';
    const ritual = document.getElementById('xp-ritual-extra');
    if (ritual) ritual.hidden = !isRitual;
    const reason = document.getElementById('xp-gain-reason');
    if (reason) {
      reason.placeholder = kind === 'gain'
        ? 'Motivo (ex.: Sessão 12)'
        : isRitual ? 'Nome do ritual' : 'Descrição (ex.: Aprender latim)';
    }
    const amount = document.getElementById('xp-gain-amount');
    if (amount && isRitual && (amount.dataset.auto === '1' || !amount.value)) {
      const lvl = clampInt((document.getElementById('xp-ritual-level') || {}).value, 1, 9, 1);
      amount.value = lvl * 2;
      amount.dataset.auto = '1';
    }
    const btn = document.getElementById('btn-xp-add-gain');
    if (btn) btn.textContent = kind === 'gain' ? 'Registrar ganho' : isRitual ? 'Registrar ritual' : 'Registrar gasto';
    document.querySelectorAll('.xp-entry-kind label').forEach(l => {
      const input = l.querySelector('input');
      l.classList.toggle('is-selected', !!(input && input.checked));
    });
  },

  addGain() {
    const char = AppState.activeCharacter;
    const amountEl = document.getElementById('xp-gain-amount');
    const reasonEl = document.getElementById('xp-gain-reason');
    if (!char || !amountEl) return;
    this.ensureBaseline(char);
    const kind = this.entryKind();
    const amount = clampInt(amountEl.value, 0, 9999, 0);
    if (amount <= 0) { showToast('Informe a quantidade de XP (maior que 0).', 'danger'); amountEl.focus(); return; }
    const text = (reasonEl && reasonEl.value.trim()) || '';

    if (kind === 'gain') {
      const label = text || 'XP ganho';
      this.addEntry(char, { kind: 'gain', label, amount });
      showToast(`+${amount} XP registrados (${label}). Saldo ${this.totals(char).available}.`, 'success');
    } else {
      const category = document.getElementById('xp-spend-category').value;
      const afford = this.canAfford(char, amount);
      if (!afford.ok) { showToast(this.insufficientMsg(text || 'Este gasto', amount, afford.available), 'danger'); return; }
      if (category === 'ritual') {
        if (!text) { showToast('Escreva o nome do ritual.', 'danger'); reasonEl.focus(); return; }
        const level = clampInt(document.getElementById('xp-ritual-level').value, 1, 9, 1);
        const tradition = document.getElementById('xp-ritual-tradition').value;
        const addToGrimoire = document.getElementById('xp-ritual-add').checked;
        let ref = `custom:${generateUniqueId()}`;
        if (addToGrimoire) {
          const sp = SpellManager.normalize({ kind: 'ritual', name: text, level, tradition, description: '' });
          SpellManager.list(char).push(sp);
          ref = `rit:${sp.id}`;
          SpellManager.render(char);
        }
        this.addEntry(char, { kind: 'spend', ref, type: 'ritual', label: `Ritual “${text}” (nível ${level})`, amount, rule: amount === level * 2 ? 'nível × 2' : 'custo personalizado' });
        showToast(`Ritual “${text}”: −${amount} XP${addToGrimoire ? ', adicionado ao Grimório' : ''}. Saldo ${this.totals(char).available}.`, 'success');
      } else {
        const label = text || 'Gasto personalizado';
        this.addEntry(char, { kind: 'spend', ref: `custom:${generateUniqueId()}`, type: 'custom', label, amount, rule: 'custo personalizado' });
        showToast(`${label}: −${amount} XP. Saldo ${this.totals(char).available}.`, 'success');
      }
    }

    AppState.saveToStorage();
    amountEl.value = '';
    delete amountEl.dataset.auto;
    if (reasonEl) reasonEl.value = '';
    this.syncEntryForm();
    this.renderPanel(char);
    this.renderLedger(char);
    if (kind === 'gain') GoalPlanner.onGain(char);
  },

  bind() {
    document.querySelectorAll('[data-xp-toggle]').forEach(btn => btn.addEventListener('click', () => this.toggle()));
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('btn-xp-ledger', 'click', () => this.openLedger());
    document.querySelectorAll('[data-xp-ledger-open]').forEach(b => b.addEventListener('click', () => this.openLedger()));
    on('btn-xp-gain', 'click', () => this.openLedger(true));
    on('btn-xp-sync-manual', 'click', () => this.syncManual());
    on('btn-close-xp-ledger', 'click', () => this.closeLedger());
    on('btn-xp-add-gain', 'click', () => this.addGain());
    document.querySelectorAll('input[name="xp-entry-kind"]').forEach(r => r.addEventListener('change', () => this.syncEntryForm()));
    on('xp-spend-category', 'change', () => this.syncEntryForm());
    on('xp-ritual-level', 'change', () => this.syncEntryForm());
    on('xp-gain-amount', 'input', e => { delete e.target.dataset.auto; });
    on('xp-gain-amount', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.addGain(); } });
    on('xp-gain-reason', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.addGain(); } });
    const baseInput = (id, key) => on(id, 'input', e => {
      const char = AppState.activeCharacter;
      this.state(char)[key] = clampInt(e.target.value, 0, 99999, 0);
      this.state(char).initialized = true;
      AppState.saveToStorage();
      this.renderPanel(char);
      this.renderLedger(char);
    });
    baseInput('xp-base-total', 'baseTotal');
    baseInput('xp-base-spent', 'baseSpent');
    on('xp-allow-negative', 'change', e => {
      const char = AppState.activeCharacter;
      this.state(char).allowNegative = e.target.checked;
      AppState.saveToStorage();
    });
    on('xp-background-rule', 'change', e => {
      const char = AppState.activeCharacter;
      this.state(char).backgroundRule = e.target.checked;
      AppState.saveToStorage();
      UIRenderer.renderDynamicBackgrounds(char);
    });
    on('btn-xp-clear-log', 'click', async () => {
      const char = AppState.activeCharacter;
      const ok = await GothicDialog.confirm({
        title: 'Limpar histórico de XP',
        message: 'Todos os ganhos e compras registrados serão apagados. Os traços da ficha não mudam. Use Desfazer (Ctrl+Z) se mudar de ideia.',
        confirmLabel: 'Limpar histórico',
        danger: true
      });
      if (!ok) return;
      this.state(char).log = [];
      AppState.saveToStorage();
      this.renderPanel(char);
      this.renderLedger(char);
    });
    const modal = document.getElementById('xp-ledger-modal');
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) this.closeLedger(); });
      modal.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeLedger(); });
    }
  }
};

// =============================================================================
// 8d. OBJETIVOS DE BUILD (planejamento de compras com XP)
// No modo Planejamento, tocar nos pontos marca o nível desejado em vez de
// alterar a ficha. Ao registrar XP ganho, as metas podem ser compradas
// automaticamente, na ordem de prioridade da lista.
// =============================================================================
const GOAL_KIND_LABELS = {
  trait: 'Traço',
  ritual: 'Ritual',
  specialty: 'Especialização',
  custom: 'Custo personalizado'
};

const GoalPlanner = {
  state(char) {
    const st = XPManager.state(char);
    if (!Array.isArray(st.goals)) st.goals = [];
    if (typeof st.planMode !== 'boolean') st.planMode = false;
    if (typeof st.autoBuy !== 'boolean') st.autoBuy = true;
    if (st.goalOrder !== 'wait' && st.goalOrder !== 'skip') st.goalOrder = 'wait';
    st.goals.forEach(g => {
      if (!g.id) g.id = generateUniqueId();
      if (!GOAL_KIND_LABELS[g.kind]) g.kind = 'trait';
    });
    return st;
  },

  goals(char) { return this.state(char).goals; },

  active(char = AppState.activeCharacter) {
    return !!(char && this.state(char).planMode);
  },

  findGoal(char, ref) {
    return this.goals(char).find(g => g.kind === 'trait' && g.ref === ref && !this.isDone(char, g)) || null;
  },

  // ---------------------------------------------------------------------------
  // Cálculos
  // ---------------------------------------------------------------------------
  isDone(char, g) {
    if (g.kind === 'trait') return XPManager.currentLevel(char, g.ref) >= g.target;
    return !!g.done;
  },

  label(char, g) {
    if (g.kind === 'trait') {
      const d = XPManager.describe(char, g.ref);
      return d ? d.label : (g.label || 'Traço removido');
    }
    if (g.kind === 'ritual') return `Ritual “${g.name || 'sem nome'}” (nível ${g.level})`;
    if (g.kind === 'specialty') return `Especialização “${g.name || 'sem nome'}”`;
    return g.label || 'Custo personalizado';
  },

  /** Custo do próximo passo (null = não dá para comprar este objetivo). */
  nextCost(char, g) {
    if (this.isDone(char, g)) return 0;
    if (g.kind === 'trait') {
      const d = XPManager.describe(char, g.ref);
      if (!d || d.free) return null;
      return d.step(XPManager.currentLevel(char, g.ref));
    }
    if (g.kind === 'ritual') return g.level * 2;
    if (g.kind === 'specialty') return 3;
    return clampInt(g.amount, 0, 9999, 0);
  },

  remainingCost(char, g) {
    if (this.isDone(char, g)) return 0;
    if (g.kind !== 'trait') return this.nextCost(char, g) || 0;
    const d = XPManager.describe(char, g.ref);
    if (!d || d.free) return 0;
    let total = 0;
    for (let lvl = XPManager.currentLevel(char, g.ref); lvl < g.target; lvl++) total += d.step(lvl);
    return total;
  },

  totals(char) {
    const pending = this.goals(char).filter(g => !this.isDone(char, g));
    const remaining = pending.reduce((a, g) => a + this.remainingCost(char, g), 0);
    const available = XPManager.totals(char).available;
    return { pending: pending.length, done: this.goals(char).length - pending.length, remaining, available, missing: Math.max(0, remaining - available) };
  },

  // ---------------------------------------------------------------------------
  // Marcar metas pelos pontos da ficha
  // ---------------------------------------------------------------------------
  /** Nível planejado para o grupo de pontos (desenha os pontos-meta). */
  plannedTarget(container) {
    const char = AppState.activeCharacter;
    const ref = container && container.dataset.xpRef;
    if (!char || !ref) return null;
    const g = this.findGoal(char, ref);
    return g ? g.target : null;
  },

  /** Clique num ponto durante o planejamento. Retorna true se o clique foi usado aqui. */
  handleDot(container, currentVal, index) {
    const char = AppState.activeCharacter;
    if (!this.active(char)) return false;
    const ref = container.dataset.xpRef;
    const d = ref ? XPManager.describe(char, ref) : null;
    if (!d) { showToast('Este item não é comprado com XP, então não entra nos objetivos.', 'info'); return true; }
    if (d.free) { showToast(d.freeNote, 'info'); return true; }

    const goals = this.goals(char);
    const existing = this.findGoal(char, ref);
    if (index <= currentVal || (existing && existing.target === index)) {
      if (existing) {
        goals.splice(goals.indexOf(existing), 1);
        showToast(`🎯 Objetivo removido: ${d.label}.`, 'info');
      } else {
        showToast(`${d.label} já está no nível ${currentVal}. Toque num ponto vazio para marcar a meta.`, 'info');
        return true;
      }
    } else {
      const target = Math.min(index, XPManager.maxFor(ref));
      if (existing) existing.target = target;
      else goals.push({ id: generateUniqueId(), kind: 'trait', ref, label: d.label, start: currentVal, target, createdAt: Date.now() });
      let cost = 0;
      for (let lvl = currentVal; lvl < target; lvl++) cost += d.step(lvl);
      showToast(`🎯 ${d.label}: ${currentVal} → ${target} · ${cost} XP (${d.rule})`, 'success');
    }
    AppState.saveToStorage();
    this.refreshSheet(char);
    return true;
  },

  /** Setas do teclado no planejamento: sobe ou desce a meta. */
  handleKey(container, currentVal, delta) {
    const char = AppState.activeCharacter;
    const g = this.findGoal(char, container.dataset.xpRef);
    const base = g ? g.target : currentVal;
    const next = base + delta;
    if (next <= currentVal) {
      if (g) this.handleDot(container, currentVal, g.target);
      return;
    }
    this.handleDot(container, currentVal, next);
  },

  previewTitle(container, currentVal, index) {
    const char = AppState.activeCharacter;
    const d = XPManager.describe(char, container.dataset.xpRef);
    if (!d) return 'Não é comprado com XP';
    if (d.free) return 'Sem custo de XP';
    if (index <= currentVal) return 'Remover a meta deste traço';
    let cost = 0;
    for (let lvl = currentVal; lvl < index; lvl++) cost += d.step(lvl);
    return `Meta: nível ${index} · ${cost} XP a partir do nível atual`;
  },

  refreshSheet(char) {
    UIRenderer.renderAllDots(char);
    UIRenderer.renderDynamicDisciplines(char);
    UIRenderer.renderDynamicBackgrounds(char);
    UIRenderer.renderDynamicPaths(char);
    this.renderSummary(char);
    if (this.isModalOpen()) this.renderModal(char);
  },

  togglePlan(force) {
    const char = AppState.activeCharacter;
    if (!char) return;
    XPManager.ensureBaseline(char);
    const st = this.state(char);
    st.planMode = typeof force === 'boolean' ? force : !st.planMode;
    AppState.saveToStorage();
    this.apply(char);
    showToast(st.planMode
      ? '🎯 Planejamento ligado: toque nos pontos para marcar o nível desejado. A ficha não muda até a compra.'
      : '🎯 Planejamento desligado.', 'info');
  },

  apply(char) {
    if (!char) return;
    const on = this.active(char);
    document.body.classList.toggle('plan-mode', on);
    document.querySelectorAll('[data-plan-toggle]').forEach(btn => {
      btn.setAttribute('aria-checked', String(on));
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
    });
    const auto = document.getElementById('goal-auto-buy');
    if (auto) auto.checked = this.state(char).autoBuy;
    const order = document.getElementById('goal-order');
    if (order) order.value = this.state(char).goalOrder;
    this.renderSummary(char);
  },

  // ---------------------------------------------------------------------------
  // Compras
  // ---------------------------------------------------------------------------
  /** Compra o próximo passo de um objetivo. Nunca deixa o saldo negativo. */
  buyNext(char, g) {
    if (this.isDone(char, g)) return { ok: false, done: true };
    const cost = this.nextCost(char, g);
    if (cost === null) return { ok: false, reason: 'Este objetivo não tem custo de XP.' };
    const available = XPManager.totals(char).available;
    if (cost > available) return { ok: false, cost, short: cost - available };

    if (g.kind === 'trait') {
      const d = XPManager.describe(char, g.ref);
      const cur = XPManager.currentLevel(char, g.ref);
      XPManager.setLevel(char, g.ref, cur + 1);
      XPManager.addEntry(char, { kind: 'spend', ref: g.ref, type: d.type, label: d.label, from: cur, to: cur + 1, amount: cost, rule: d.rule, viaGoal: true });
      return { ok: true, cost, text: `${d.label} ${cur}→${cur + 1}` };
    }
    if (g.kind === 'ritual') {
      const sp = SpellManager.normalize({ kind: 'ritual', name: g.name || '', level: g.level, tradition: g.tradition, description: g.note || '' });
      SpellManager.list(char).push(sp);
      XPManager.addEntry(char, { kind: 'spend', ref: `rit:${sp.id}`, type: 'ritual', label: `Ritual “${sp.name}”`, amount: cost, rule: 'nível × 2', viaGoal: true });
      g.done = true;
      return { ok: true, cost, text: `Ritual ${sp.name || 'sem nome'}` };
    }
    if (g.kind === 'specialty') {
      if (!Array.isArray(char.specializations)) char.specializations = [];
      const spec = { id: generateUniqueId(), name: g.name || '', level: 1 };
      char.specializations.push(spec);
      XPManager.addEntry(char, { kind: 'spend', ref: `spec:${spec.id}`, type: 'specialty', label: `Especialização ${spec.name}`.trim(), amount: cost, rule: '3 (fixo)', viaGoal: true });
      g.done = true;
      return { ok: true, cost, text: `Especialização ${spec.name}` };
    }
    XPManager.addEntry(char, { kind: 'spend', ref: `custom:${g.id}`, type: 'custom', label: g.label || 'Custo personalizado', amount: cost, rule: 'custo personalizado', viaGoal: true });
    g.done = true;
    return { ok: true, cost, text: g.label || 'Custo personalizado' };
  },

  /** Compra tudo que o saldo permite, seguindo a ordem da lista. */
  autoBuy(char, { trigger = 'manual' } = {}) {
    if (!char) return [];
    const order = this.state(char).goalOrder;
    const bought = [];
    let blocked = null;
    for (const g of this.goals(char)) {
      if (this.isDone(char, g)) continue;
      let stalled = false;
      let guard = 0;
      while (!this.isDone(char, g) && guard++ < 20) {
        const r = this.buyNext(char, g);
        if (r.ok) { bought.push(r); continue; }
        if (r.short && !blocked) blocked = { goal: g, short: r.short };
        stalled = true;
        break;
      }
      // "Guardar XP": para no primeiro objetivo sem saldo; "Pular": tenta os seguintes
      if (stalled && order === 'wait') break;
    }
    if (bought.length) {
      AppState.saveToStorage();
      UIRenderer.renderAll();
      LinkCableSystem.refreshNodeValues();
    }
    const spent = bought.reduce((a, r) => a + r.cost, 0);
    const left = XPManager.totals(char).available;
    if (bought.length) {
      const list = bought.map(r => r.text).join(', ');
      showToast(`🎯 Compras automáticas (−${spent} XP): ${list}. Saldo ${left}.`, 'success');
    } else if (trigger === 'manual') {
      showToast(blocked
        ? `Faltam ${blocked.short} XP para “${this.label(char, blocked.goal)}”.`
        : 'Nenhum objetivo pendente para comprar.', 'info');
    }
    if (blocked && bought.length && order === 'wait') {
      showToast(`Guardando XP para “${this.label(char, blocked.goal)}” (faltam ${blocked.short}).`, 'info');
    }
    this.renderSummary(char);
    if (this.isModalOpen()) this.renderModal(char);
    return bought;
  },

  /** Chamado depois de registrar XP ganho. */
  onGain(char) {
    const st = this.state(char);
    if (!st.autoBuy || !st.goals.some(g => !this.isDone(char, g))) return;
    this.autoBuy(char, { trigger: 'gain' });
  },

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  renderSummary(char) {
    if (!char) return;
    const t = this.totals(char);
    document.querySelectorAll('[data-goal-count]').forEach(el => { el.textContent = t.pending; });
    const line = document.getElementById('goals-summary');
    if (line) {
      if (!t.pending) {
        line.textContent = t.done ? `🎯 Todos os ${t.done} objetivos concluídos.` : '🎯 Nenhum objetivo de build ainda.';
        line.className = 'goals-summary';
      } else if (t.missing > 0) {
        line.textContent = `🎯 ${t.pending} objetivo(s) · custam ${t.remaining} XP · faltam ${t.missing}`;
        line.className = 'goals-summary is-waiting';
      } else {
        line.textContent = `🎯 ${t.pending} objetivo(s) · ${t.remaining} XP · o saldo já cobre tudo`;
        line.className = 'goals-summary is-ready';
      }
    }
    const pill = document.getElementById('plan-pill-text');
    if (pill) pill.textContent = t.pending ? `${t.pending} meta(s) · ${t.remaining} XP` : 'toque nos pontos para marcar metas';
  },

  isModalOpen() {
    const m = document.getElementById('goals-modal');
    return !!(m && !m.classList.contains('hidden'));
  },

  openModal() {
    const char = AppState.activeCharacter;
    const modal = document.getElementById('goals-modal');
    if (!char || !modal) return;
    XPManager.ensureBaseline(char);
    this.apply(char);
    this.renderModal(char);
    this.syncGoalForm();
    modal.classList.remove('hidden');
    const close = document.getElementById('btn-close-goals');
    if (close) setTimeout(() => close.focus(), 30);
  },

  closeModal() {
    const modal = document.getElementById('goals-modal');
    if (modal) modal.classList.add('hidden');
  },

  renderModal(char) {
    const t = this.totals(char);
    const head = document.getElementById('goals-modal-summary');
    if (head) {
      head.innerHTML = t.pending
        ? `Metas pendentes: <strong>${t.pending}</strong> · Custo restante: <strong>${t.remaining} XP</strong> · Saldo: <strong class="${t.available < 0 ? 'is-negative' : ''}">${t.available}</strong>${t.missing ? ` · Faltam <strong class="is-negative">${t.missing}</strong>` : ' · <span class="is-ready">dá para comprar tudo</span>'}`
        : 'Nenhuma meta pendente. Ligue o planejamento e toque nos pontos da ficha, ou adicione um ritual, especialização ou custo abaixo.';
    }
    const list = document.getElementById('goals-list');
    if (!list) return;
    list.innerHTML = '';
    const goals = this.goals(char);
    if (!goals.length) {
      list.innerHTML = '<li class="goal-empty">Sua lista de objetivos está vazia.</li>';
      return;
    }
    goals.forEach((g, idx) => {
      const done = this.isDone(char, g);
      const li = document.createElement('li');
      li.className = `goal-item${done ? ' is-done' : ''}`;

      const order = document.createElement('div');
      order.className = 'goal-order';
      const up = this.iconBtn('↑', 'Subir prioridade', () => this.move(char, idx, -1));
      const down = this.iconBtn('↓', 'Descer prioridade', () => this.move(char, idx, 1));
      up.disabled = idx === 0;
      down.disabled = idx === goals.length - 1;
      const num = document.createElement('span');
      num.className = 'goal-num';
      num.textContent = done ? '✓' : `#${idx + 1}`;
      order.append(up, num, down);

      const main = document.createElement('div');
      main.className = 'goal-main';
      const title = document.createElement('strong');
      title.textContent = this.label(char, g);
      const meta = document.createElement('small');
      let pct = done ? 100 : 0;
      if (g.kind === 'trait') {
        const cur = XPManager.currentLevel(char, g.ref);
        const start = Math.min(clampInt(g.start, 0, 10, cur), cur);
        pct = done ? 100 : Math.round(((cur - start) / Math.max(1, g.target - start)) * 100);
        const d = XPManager.describe(char, g.ref);
        meta.textContent = `${GOAL_KIND_LABELS[g.kind]} · atual ${cur} → meta ${g.target}${d && d.rule ? ` · ${d.rule}` : ''}`;
      } else {
        meta.textContent = `${GOAL_KIND_LABELS[g.kind]}${g.kind === 'ritual' ? ` · ${SPELL_TRADITIONS[g.tradition] ? SPELL_TRADITIONS[g.tradition].label : ''} · nível × 2` : ''}${done ? ' · comprado' : ''}`;
      }
      const bar = document.createElement('div');
      bar.className = 'goal-progress';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      bar.appendChild(fill);
      main.append(title, meta, bar);

      const cost = document.createElement('div');
      cost.className = 'goal-cost';
      const next = this.nextCost(char, g);
      cost.innerHTML = done
        ? '<span class="is-ready">concluído</span>'
        : `<span>próximo <strong>${next === null ? '—' : next}</strong></span><span>total <strong>${this.remainingCost(char, g)}</strong></span>`;

      const actions = document.createElement('div');
      actions.className = 'goal-actions';
      if (!done) {
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'btn-tiny goal-buy';
        buy.textContent = 'Comprar';
        const available = XPManager.totals(char).available;
        buy.disabled = next === null || next > available;
        buy.title = buy.disabled ? `Faltam ${Math.max(0, (next || 0) - available)} XP` : `Compra o próximo passo por ${next} XP`;
        buy.addEventListener('click', () => {
          const r = this.buyNext(char, g);
          if (r.ok) {
            AppState.saveToStorage();
            UIRenderer.renderAll();
            LinkCableSystem.refreshNodeValues();
            showToast(`🎯 ${r.text}: −${r.cost} XP (saldo ${XPManager.totals(char).available}).`, 'success');
          } else if (r.short) {
            showToast(`Faltam ${r.short} XP.`, 'danger');
          }
          this.renderSummary(char);
          this.renderModal(char);
        });
        actions.appendChild(buy);
      }
      actions.appendChild(this.iconBtn('✕', 'Remover objetivo', () => {
        goals.splice(goals.indexOf(g), 1);
        AppState.saveToStorage();
        this.refreshSheet(char);
      }, 'btn-remove-trait'));

      li.append(order, main, cost, actions);
      list.appendChild(li);
    });
  },

  iconBtn(text, title, onClick, extra = 'goal-icon-btn') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = extra;
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  },

  move(char, idx, dir) {
    const goals = this.goals(char);
    const j = idx + dir;
    if (j < 0 || j >= goals.length) return;
    [goals[idx], goals[j]] = [goals[j], goals[idx]];
    AppState.saveToStorage();
    this.renderModal(char);
  },

  clearDone() {
    const char = AppState.activeCharacter;
    const st = this.state(char);
    const before = st.goals.length;
    st.goals = st.goals.filter(g => !this.isDone(char, g));
    AppState.saveToStorage();
    this.refreshSheet(char);
    showToast(`${before - st.goals.length} objetivo(s) concluído(s) removido(s) da lista.`, 'info');
  },

  /** Mostra só os campos do tipo de objetivo escolhido. */
  syncGoalForm() {
    const kind = (document.getElementById('goal-new-kind') || {}).value || 'ritual';
    document.querySelectorAll('[data-goal-field]').forEach(el => {
      el.hidden = !el.dataset.goalField.split(' ').includes(kind);
    });
    const name = document.getElementById('goal-new-name');
    if (name) {
      name.placeholder = { ritual: 'Nome do ritual', specialty: 'Especialização (ex.: Ocultismo: Sangue)', custom: 'Descrição (ex.: Aprender latim com o mentor)' }[kind];
    }
    const cost = document.getElementById('goal-new-cost-preview');
    if (cost) {
      const lvl = clampInt((document.getElementById('goal-new-level') || {}).value, 1, 9, 1);
      cost.textContent = kind === 'ritual' ? `${lvl * 2} XP` : kind === 'specialty' ? '3 XP' : '';
    }
  },

  addFromForm() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const kind = document.getElementById('goal-new-kind').value;
    const nameEl = document.getElementById('goal-new-name');
    const name = nameEl.value.trim();
    if (!name) { showToast('Dê um nome ao objetivo.', 'danger'); nameEl.focus(); return; }
    const g = { id: generateUniqueId(), kind, createdAt: Date.now() };
    if (kind === 'ritual') {
      g.name = name;
      g.level = clampInt(document.getElementById('goal-new-level').value, 1, 9, 1);
      g.tradition = document.getElementById('goal-new-tradition').value;
    } else if (kind === 'specialty') {
      g.name = name;
    } else {
      const amountEl = document.getElementById('goal-new-amount');
      g.label = name;
      g.amount = clampInt(amountEl.value, 0, 9999, 0);
      if (g.amount <= 0) { showToast('Informe o custo em XP (maior que 0).', 'danger'); amountEl.focus(); return; }
    }
    this.goals(char).push(g);
    AppState.saveToStorage();
    nameEl.value = '';
    const amountEl = document.getElementById('goal-new-amount');
    if (amountEl) amountEl.value = '';
    this.renderSummary(char);
    this.renderModal(char);
    showToast(`🎯 Objetivo adicionado: ${this.label(char, g)} (${this.remainingCost(char, g)} XP).`, 'success');
  },

  bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    document.querySelectorAll('[data-plan-toggle]').forEach(b => b.addEventListener('click', () => this.togglePlan()));
    document.querySelectorAll('[data-goals-open]').forEach(b => b.addEventListener('click', () => this.openModal()));
    on('btn-close-goals', 'click', () => this.closeModal());
    on('btn-goals-mark', 'click', () => { this.closeModal(); this.togglePlan(true); });
    on('btn-goals-buy-all', 'click', () => this.autoBuy(AppState.activeCharacter, { trigger: 'manual' }));
    on('btn-goals-clear-done', 'click', () => this.clearDone());
    on('btn-goal-add', 'click', () => this.addFromForm());
    on('goal-new-name', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.addFromForm(); } });
    on('goal-new-kind', 'change', () => this.syncGoalForm());
    on('goal-new-level', 'change', () => this.syncGoalForm());
    on('goal-auto-buy', 'change', e => {
      const char = AppState.activeCharacter;
      this.state(char).autoBuy = e.target.checked;
      AppState.saveToStorage();
    });
    on('goal-order', 'change', e => {
      const char = AppState.activeCharacter;
      this.state(char).goalOrder = e.target.value === 'skip' ? 'skip' : 'wait';
      AppState.saveToStorage();
    });
    const modal = document.getElementById('goals-modal');
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) this.closeModal(); });
      modal.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeModal(); });
    }
  }
};

// =============================================================================
// 9. QUALIDADES & DEFEITOS
// =============================================================================
const MERIT_CATEGORY_LABELS = { fisica: 'Física', mental: 'Mental', social: 'Social', sobrenatural: 'Sobrenatural' };
const FLAW_BONUS_CAP = 7;

const MeritsFlawsManager = {
  catalog() {
    return (typeof MERITS_FLAWS_DATA !== 'undefined' && Array.isArray(MERITS_FLAWS_DATA)) ? MERITS_FLAWS_DATA : [];
  },

  parsePoints(str) {
    const m = String(str || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 1;
  },

  totals(char) {
    const list = Array.isArray(char.merits_flaws_list) ? char.merits_flaws_list : [];
    const merits = list.filter(i => i.type === 'qualidade').reduce((a, i) => a + (parseInt(i.points, 10) || 0), 0);
    const flaws = list.filter(i => i.type === 'defeito').reduce((a, i) => a + (parseInt(i.points, 10) || 0), 0);
    const counted = Math.min(flaws, FLAW_BONUS_CAP);
    return { merits, flaws, counted, balance: counted - merits };
  },

  render(char) {
    const list = document.getElementById('merits-flaws-list');
    const totalsEl = document.getElementById('merits-flaws-totals');
    if (!list || !char) return;
    if (!Array.isArray(char.merits_flaws_list)) char.merits_flaws_list = [];
    list.innerHTML = '';

    if (char.merits_flaws_list.length === 0) {
      list.innerHTML = '<p class="empty-hint">Nenhuma Qualidade ou Defeito. Abra o catálogo para escolher.</p>';
    }

    char.merits_flaws_list.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `mf-row mf-${item.type}`;

      const tag = document.createElement('span');
      tag.className = 'mf-tag';
      tag.textContent = item.type === 'qualidade' ? 'Q' : 'D';
      tag.title = item.type === 'qualidade' ? 'Qualidade (custa pontos)' : 'Defeito (concede pontos)';

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'dynamic-input mf-name';
      name.value = item.name || '';
      name.setAttribute('aria-label', 'Nome');
      name.addEventListener('input', e => { item.name = e.target.value; AppState.saveToStorage(); });

      const pts = document.createElement('input');
      pts.type = 'number';
      pts.min = '0';
      pts.max = '10';
      pts.className = 'mf-points';
      pts.value = item.points;
      pts.title = item.range ? `Custo no livro: ${item.range}` : 'Pontos';
      pts.setAttribute('aria-label', 'Pontos');
      pts.addEventListener('input', e => {
        item.points = clampInt(e.target.value, 0, 10, 0);
        AppState.saveToStorage();
        this.renderTotals(char);
      });

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'mf-info';
      info.textContent = '?';
      info.title = 'Ver descrição';
      info.setAttribute('aria-expanded', 'false');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-remove-trait';
      remove.textContent = '✕';
      remove.title = 'Remover';
      remove.addEventListener('click', () => {
        char.merits_flaws_list.splice(index, 1);
        AppState.saveToStorage();
        this.render(char);
      });

      const desc = document.createElement('div');
      desc.className = 'mf-desc hidden';
      const catLabel = MERIT_CATEGORY_LABELS[item.category] || '';
      desc.innerHTML = `${escapeHtml(item.desc || 'Sem descrição.')}${item.source ? `<span class="mf-source">${escapeHtml(catLabel)}${catLabel ? ' · ' : ''}${escapeHtml(item.source)}</span>` : ''}`;
      info.addEventListener('click', () => {
        const open = desc.classList.toggle('hidden') === false;
        info.setAttribute('aria-expanded', String(open));
      });

      const line = document.createElement('div');
      line.className = 'mf-line';
      line.append(tag, name, pts, info, remove);
      row.append(line, desc);
      list.appendChild(row);
    });

    this.renderTotals(char);
    if (totalsEl) totalsEl.classList.remove('hidden');
  },

  renderTotals(char) {
    const el = document.getElementById('merits-flaws-totals');
    if (!el) return;
    const t = this.totals(char);
    const over = t.flaws > FLAW_BONUS_CAP;
    const sign = t.balance > 0 ? '+' : '';
    el.innerHTML = `
      <span>Qualidades <strong>${t.merits}</strong></span>
      <span>Defeitos <strong>${t.flaws}</strong>${over ? ` <em class="mf-cap">(só ${FLAW_BONUS_CAP} contam)</em>` : ''}</span>
      <span class="mf-balance ${t.balance < 0 ? 'is-negative' : ''}">Saldo em pontos de bônus <strong>${sign}${t.balance}</strong></span>
    `;
  },

  add(entry) {
    const char = AppState.activeCharacter;
    if (!char) return;
    if (!Array.isArray(char.merits_flaws_list)) char.merits_flaws_list = [];
    char.merits_flaws_list.push({
      id: generateUniqueId(),
      type: entry.type,
      category: entry.category,
      name: entry.name,
      points: this.parsePoints(entry.points),
      range: entry.points,
      desc: entry.desc,
      source: entry.source
    });
    AppState.saveToStorage();
    this.render(char);
    showToast(`${entry.type === 'qualidade' ? 'Qualidade' : 'Defeito'} “${entry.name}” adicionado.`, 'success');
  },

  addCustom(type) {
    this.add({ type, category: '', name: type === 'qualidade' ? 'Nova qualidade' : 'Novo defeito', points: '1', desc: '', source: '' });
  },

  // ----- Catálogo -----
  openCatalog() {
    const modal = document.getElementById('merits-catalog-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.renderCatalog();
    const search = document.getElementById('mf-search');
    if (search) setTimeout(() => search.focus(), 40);
  },

  closeCatalog() {
    const modal = document.getElementById('merits-catalog-modal');
    if (modal) modal.classList.add('hidden');
  },

  renderCatalog() {
    const listEl = document.getElementById('mf-catalog-list');
    const countEl = document.getElementById('mf-catalog-count');
    if (!listEl) return;
    const q = (document.getElementById('mf-search')?.value || '').toLowerCase().trim();
    const type = document.getElementById('mf-filter-type')?.value || '';
    const cat = document.getElementById('mf-filter-cat')?.value || '';

    const data = this.catalog().filter(e =>
      (!type || e.type === type) &&
      (!cat || e.category === cat) &&
      (!q || `${e.name} ${e.desc} ${e.points}`.toLowerCase().includes(q))
    );

    if (countEl) countEl.textContent = `${data.length} resultado${data.length === 1 ? '' : 's'}`;

    if (this.catalog().length === 0) {
      listEl.innerHTML = '<p class="empty-hint">O catálogo não foi carregado. Verifique se o arquivo qualidades-defeitos-data.js está junto do index.html.</p>';
      return;
    }
    if (data.length === 0) {
      listEl.innerHTML = '<p class="empty-hint">Nada encontrado. Tente outro termo ou limpe os filtros.</p>';
      return;
    }

    const frag = document.createDocumentFragment();
    data.slice(0, 200).forEach(entry => {
      const item = document.createElement('article');
      item.className = `mf-catalog-item mf-${entry.type}`;
      item.innerHTML = `
        <header class="mf-catalog-head">
          <span class="mf-catalog-name">${escapeHtml(entry.name)}</span>
          <span class="mf-catalog-pts">${escapeHtml(entry.points)} pt${entry.points === '1' ? '' : 's'}</span>
        </header>
        <p class="mf-catalog-desc">${escapeHtml(entry.desc)}</p>
        <footer class="mf-catalog-foot">
          <span>${entry.type === 'qualidade' ? 'Qualidade' : 'Defeito'} ${escapeHtml(MERIT_CATEGORY_LABELS[entry.category] || '').toLowerCase()} · ${escapeHtml(entry.source || '')}</span>
        </footer>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-tiny mf-catalog-add';
      btn.textContent = 'Adicionar';
      btn.addEventListener('click', () => this.add(entry));
      item.querySelector('.mf-catalog-foot').appendChild(btn);
      frag.appendChild(item);
    });
    listEl.innerHTML = '';
    listEl.appendChild(frag);
    if (data.length > 200) {
      const more = document.createElement('p');
      more.className = 'empty-hint';
      more.textContent = `Mostrando 200 de ${data.length}. Refine a busca para ver o restante.`;
      listEl.appendChild(more);
    }
  }
};

// =============================================================================
// 10. MARKDOWN LEVE (seguro: escapa HTML antes de formatar)
// =============================================================================
const MarkdownLite = {
  inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  },

  render(src) {
    const lines = escapeHtml(src || '').split(/\r?\n/);
    const out = [];
    let listType = null;
    const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

    lines.forEach(raw => {
      const line = raw.trimEnd();
      let m;
      if (/^\s*$/.test(line)) { closeList(); return; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        closeList();
        const lvl = Math.min(6, m[1].length + 2);
        out.push(`<h${lvl}>${this.inline(m[2])}</h${lvl}>`);
      } else if (/^(-{3,}|\*{3,})$/.test(line)) {
        closeList();
        out.push('<hr>');
      } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
        closeList();
        out.push(`<blockquote>${this.inline(m[1])}</blockquote>`);
      } else if ((m = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i))) {
        if (listType !== 'ul') { closeList(); out.push('<ul class="md-tasks">'); listType = 'ul'; }
        out.push(`<li class="${m[1].toLowerCase() === 'x' ? 'is-done' : ''}">${this.inline(m[2])}</li>`);
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${this.inline(m[1])}</li>`);
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${this.inline(m[1])}</li>`);
      } else {
        closeList();
        out.push(`<p>${this.inline(line)}</p>`);
      }
    });
    closeList();
    return out.join('\n') || '<p class="empty-hint">Nada escrito ainda.</p>';
  }
};

const NotesManager = {
  previewMode: false,

  render(char) {
    const preview = document.getElementById('markdown-preview');
    const textarea = document.getElementById('field-markdown');
    const btn = document.getElementById('btn-toggle-markdown');
    if (!preview || !textarea || !char) return;
    if (this.previewMode) preview.innerHTML = MarkdownLite.render(char.notes ? char.notes.markdown : '');
    preview.classList.toggle('hidden', !this.previewMode);
    textarea.classList.toggle('hidden', this.previewMode);
    if (btn) {
      btn.textContent = this.previewMode ? 'Editar' : 'Visualizar';
      btn.setAttribute('aria-pressed', String(this.previewMode));
    }
  },

  toggle() {
    this.previewMode = !this.previewMode;
    this.render(AppState.activeCharacter);
  }
};

// =============================================================================
// 12. EFEITO AMBIENTE: BRASAS E NÉVOA (Canvas)
// =============================================================================
const AMBIENT_FX_KEY = 'v20_ambient_fx';

const AmbientFX = {
  canvas: null,
  ctx: null,
  particles: [],
  mists: [],
  raf: null,
  running: false,
  lastTime: 0,

  enabled() {
    return safeStorageGet(AMBIENT_FX_KEY, 'on') !== 'off' && safeStorageGet(FX_LITE_KEY, 'off') !== 'on'
      && !document.body.classList.contains('theme-parchment');
  },

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  init() {
    this.canvas = document.getElementById('ambient-canvas');
    if (!this.canvas || !this.canvas.getContext) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    const toggle = document.getElementById('toggle-ambient-fx');
    if (toggle) {
      toggle.checked = this.enabled();
      toggle.addEventListener('change', () => {
        safeStorageSet(AMBIENT_FX_KEY, toggle.checked ? 'on' : 'off');
        toggle.checked ? this.start() : this.stop(true);
      });
    }
    this.start();
  },

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(46, (this.w * this.h) / 38000));
    this.particles = Array.from({ length: count }, () => this.spawn(true));
    this.mists = Array.from({ length: 4 }, (_, i) => ({
      x: Math.random() * this.w,
      y: this.h * (0.55 + i * 0.12),
      r: 220 + Math.random() * 220,
      vx: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6)
    }));
  },

  spawn(anywhere) {
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 10,
      r: 0.6 + Math.random() * 1.8,
      vy: 8 + Math.random() * 22,
      sway: Math.random() * Math.PI * 2,
      life: 0.35 + Math.random() * 0.65,
      gold: Math.random() < 0.22
    };
  },

  start() {
    if (this.running || !this.ctx || !this.enabled() || this.reducedMotion() || document.hidden) {
      if (this.ctx && this.enabled() && this.reducedMotion()) this.drawFrame(0); // quadro estático
      return;
    }
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.drawFrame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },

  stop(clear = false) {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (clear && this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  },

  drawFrame(dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Névoa rasteira
    this.mists.forEach(m => {
      m.x += m.vx * dt;
      if (m.x - m.r > this.w) m.x = -m.r;
      if (m.x + m.r < 0) m.x = this.w + m.r;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, 'rgba(120, 20, 24, 0.06)');
      g.addColorStop(1, 'rgba(120, 20, 24, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Brasas subindo
    this.particles.forEach((p, i) => {
      p.y -= p.vy * dt;
      p.sway += dt * 0.8;
      const x = p.x + Math.sin(p.sway) * 6;
      const fade = Math.max(0, Math.min(1, p.y / this.h)) * p.life;
      if (p.y < -10) { this.particles[i] = this.spawn(false); return; }
      const color = p.gold ? '229, 193, 88' : '255, 60, 40';
      ctx.fillStyle = `rgba(${color}, ${0.55 * fade})`;
      ctx.shadowColor = `rgba(${color}, ${0.8 * fade})`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }
};

// =============================================================================
// 12b. TRAVA DE SEÇÕES (🔓/🔒) E AVISO DE BOAS-VINDAS
// =============================================================================
const SECTION_LOCK_LABELS = {
  attributes: 'Atributos',
  abilities: 'Habilidades',
  advantages: 'Vantagens',
  combat: 'Arsenal & Combate',
  grimoire: 'Caminhos & Rituais',
  notes: 'Qualidades & Características'
};

/**
 * Trava a edição permanente de uma seção: pontos, nomes, textos, adicionar/remover
 * e arrastar janelas. Vitalidade, sangue, FV temporária e botões de rolagem
 * continuam livres, porque são usados durante o jogo.
 */
const SectionLock = {
  _lastWarn: 0,

  locks(char) {
    if (!char.settings) char.settings = {};
    if (!char.settings.lockedSections || typeof char.settings.lockedSections !== 'object') char.settings.lockedSections = {};
    return char.settings.lockedSections;
  },

  isLocked(el) { return !!(el && el.closest && el.closest('.section-locked')); },

  apply(char) {
    if (!char) return;
    const locks = this.locks(char);
    document.querySelectorAll('[data-lock-section]').forEach(sec => {
      const key = sec.getAttribute('data-lock-section');
      const locked = !!locks[key];
      sec.classList.toggle('section-locked', locked);
      const btn = sec.querySelector(`[data-lock-toggle="${key}"]`);
      if (btn) {
        btn.setAttribute('aria-pressed', String(locked));
        btn.classList.toggle('is-locked', locked);
        btn.textContent = locked ? '🔒' : '🔓';
        const name = SECTION_LOCK_LABELS[key] || key;
        btn.title = locked
          ? `${name} travada — clique para liberar a edição`
          : `Travar ${name} (evita cliques acidentais; vitalidade, sangue e rolagens continuam livres)`;
        btn.setAttribute('aria-label', btn.title);
      }
    });
  },

  toggle(key) {
    const char = AppState.activeCharacter;
    if (!char) return;
    const locks = this.locks(char);
    locks[key] = !locks[key];
    AppState.saveToStorage();
    this.apply(char);
    const name = SECTION_LOCK_LABELS[key] || key;
    showToast(locks[key] ? `🔒 ${name} travada.` : `🔓 ${name} liberada para edição.`, 'info');
  },

  warn(el) {
    const now = Date.now();
    if (now - this._lastWarn < 2500) return;
    this._lastWarn = now;
    const sec = el && el.closest ? el.closest('[data-lock-section]') : null;
    const name = sec ? (SECTION_LOCK_LABELS[sec.getAttribute('data-lock-section')] || 'Esta seção') : 'Esta seção';
    showToast(`🔒 ${name} está travada. Clique no cadeado do título para editar.`, 'info');
  },

  /** Controles que continuam livres mesmo com a seção travada. */
  isExempt(el) {
    return !!el.closest([
      '.trait-link-node', '.health-box', '.health-row', '#health-track-list', '#btn-health-clear-all',
      '.blood-point', '#blood-pool-grid', '.blood-actions-row', '.btn-blood-action', '#blood-boost-attr',
      '#btn-blood-fill-all', '#btn-blood-clear-all', '#willpower-temp-boxes', '.blood-adjust', '#blood-liquid-meter',
      '.btn-weapon', '.btn-cast-spell', '#btn-quick-willpower', '#btn-soak-roll', '#soak-type', '.ritual-expand-btn', '#btn-toggle-markdown',
      '[data-gen-step]', '[data-lock-exempt]', '.card-badge-link', 'a'
    ].join(', '));
  },

  bindGuards() {
    // Cliques de edição (adicionar/remover, selects, checkboxes) — fase de captura
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!this.isLocked(t) || this.isExempt(t)) return;
      if (t.closest('[data-lock-toggle]')) return;
      if (t.closest('.btn-add-trait, .btn-remove-trait, .dot, [data-lock-edit], input[type="checkbox"], .mf-custom-actions button, .weapon-row button, #btn-add-weapon')) {
        e.preventDefault();
        e.stopPropagation();
        this.warn(t);
      }
    }, true);

    // Digitação, colagem e arrastar-soltar em campos de texto
    document.addEventListener('beforeinput', (e) => {
      if (this.isLocked(e.target) && !this.isExempt(e.target)) {
        e.preventDefault();
        this.warn(e.target);
      }
    }, true);

    // Selects e checkboxes pelo teclado
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!this.isLocked(t) || this.isExempt(t)) return;
      if (t.matches('select, input[type="checkbox"], input[type="number"]') && !['Tab', 'Escape'].includes(e.key)) {
        e.preventDefault();
        this.warn(t);
      }
    }, true);
    document.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (this.isLocked(t) && !this.isExempt(t) && t.matches('select')) {
        e.preventDefault();
        this.warn(t);
      }
    }, true);
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t.matches && t.matches('select') && this.isLocked(t) && !this.isExempt(t)) {
        t.blur();
        this.warn(t);
      }
    }, true);
  }
};

const WELCOME_KEY = 'v20_welcome_dismissed';

/** Aviso de primeiro acesso sobre salvamento local, backups e webhook (como no site publicado). */
const WelcomeNotice = {
  init() {
    const modal = document.getElementById('welcome-modal');
    if (!modal) return;
    const close = () => {
      const chk = document.getElementById('welcome-dont-show');
      if (chk && chk.checked) safeStorageSet(WELCOME_KEY, '1');
      modal.classList.add('hidden');
    };
    const btn = document.getElementById('btn-welcome-continue');
    if (btn) btn.addEventListener('click', close);
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    if (safeStorageGet(WELCOME_KEY, '') !== '1') {
      modal.classList.remove('hidden');
      if (btn) setTimeout(() => btn.focus(), 50);
    }
  }
};

// =============================================================================
// 12c. iPHONE / iPAD / SAFARI E APP INSTALÁVEL (PWA)
// - Detecta iOS e o modo "app" (aberto pelo ícone da Tela de Início)
// - Registra o service worker (funciona offline) e avisa quando há versão nova
// - Botão "Instalar app": no iOS mostra o passo a passo do Safari
// - Salvar arquivos pela folha de compartilhamento do iOS ("Salvar em Arquivos")
// =============================================================================
const Platform = {
  deferredPrompt: null,
  updateAccepted: false,

  get isIOS() {
    const ua = navigator.userAgent || '';
    // iPadOS se identifica como Mac: diferencia pelo toque
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  },

  get isSafari() {
    const ua = navigator.userAgent || '';
    return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Android/.test(ua);
  },

  get isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  },

  get canUseServiceWorker() {
    return 'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  },

  init() {
    const body = document.body;
    body.classList.toggle('is-ios', this.isIOS);
    body.classList.toggle('is-standalone', this.isStandalone);
    body.classList.toggle('is-touch', 'ontouchstart' in window || navigator.maxTouchPoints > 0);

    this.registerServiceWorker();
    this.setupInstallButton();

    // App instalado: pede para o navegador não apagar os dados por falta de uso
    if (this.isStandalone && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Altura real da tela no iOS (a barra do Safari muda o 100vh)
    const setVh = () => document.documentElement.style.setProperty('--app-vh', `${window.innerHeight * 0.01}px`);
    setVh();
    window.addEventListener('resize', setVh, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(setVh, 250), { passive: true });
  },

  registerServiceWorker() {
    if (!this.canUseServiceWorker) return;
    const start = async () => {
      try {
        const reg = await navigator.serviceWorker.register('./service-worker.js');
        const offerUpdate = (worker) => {
          if (!worker || !navigator.serviceWorker.controller) return;
          GothicDialog.confirm({
            title: 'Nova versão da ficha',
            message: 'Há uma atualização pronta. Suas fichas continuam salvas neste aparelho.',
            confirmLabel: 'Atualizar agora',
            cancelLabel: 'Depois'
          }).then(ok => {
            if (!ok) return;
            this.updateAccepted = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
          });
        };
        if (reg.waiting) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed') offerUpdate(w); });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Só recarrega quando a pessoa aceitou a atualização (não na primeira instalação)
          if (this.updateAccepted) window.location.reload();
        });
        // Procura atualização quando o app volta ao primeiro plano
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      } catch (err) {
        console.warn('Service worker não registrado:', err);
      }
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  },

  setupInstallButton() {
    const btn = document.getElementById('btn-install-app');
    if (!btn) return;
    const show = (on) => btn.classList.toggle('hidden', !on);

    // Android / Chrome / Edge: prompt nativo
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      show(!this.isStandalone);
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      show(false);
      showToast('Ficha V20 instalada. Abra pelo ícone na tela inicial.', 'success');
    });

    // iOS não tem prompt: mostra o botão com o passo a passo
    show(this.isIOS && !this.isStandalone);
    btn.addEventListener('click', () => this.install());
  },

  async install() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice.catch(() => null);
      this.deferredPrompt = null;
      return;
    }
    if (location.protocol === 'file:') {
      GothicDialog.confirm({
        title: 'Publique a ficha para instalar',
        message: 'Aberta direto do arquivo, a ficha não pode virar app.\n\nEnvie os arquivos para um site com https (por exemplo, o seu GitHub Pages) e abra o endereço no Safari do iPhone.',
        confirmLabel: 'Entendi',
        cancelLabel: 'Fechar'
      });
      return;
    }
    const browserStep = this.isSafari
      ? '1. Toque em Compartilhar (quadrado com a seta para cima) na barra do Safari.'
      : '1. Abra o menu Compartilhar do navegador (no iOS 16.4 ou mais novo) ou abra este endereço no Safari.';
    GothicDialog.confirm({
      title: 'Instalar a Ficha V20 no iPhone ou iPad',
      message: [
        browserStep,
        '2. Escolha "Adicionar à Tela de Início".',
        '3. Toque em Adicionar e abra a Ficha V20 pelo ícone novo.',
        '',
        'O app abre em tela cheia e funciona sem internet (o Discord continua precisando de conexão).',
        '',
        'Importante: o app instalado guarda as fichas separado do Safari. Antes de instalar, use 📥 Exportar aqui e depois 📤 Importar dentro do app.'
      ].join('\n'),
      confirmLabel: 'Exportar esta ficha agora',
      cancelLabel: 'Fechar'
    }).then(ok => { if (ok) exportCharacterToJson(); });
  }
};

/**
 * Salva um arquivo de texto.
 * No iPhone/iPad usa a folha de compartilhamento (Salvar em Arquivos, AirDrop, Drive...);
 * nos demais navegadores faz o download normal.
 * Retorna 'shared', 'cancelled' ou 'downloaded'.
 */
async function saveTextFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  if (Platform.isIOS && typeof File === 'function' && navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // outros erros: tenta o download comum
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // O Safari precisa do endereço por alguns instantes depois do clique
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

/**
 * Reduz fotos grandes (câmera do iPhone) antes de salvar.
 * Evita estourar o limite de ~5 MB do armazenamento do navegador.
 * Retorna { dataUrl, blob } em JPEG, ou null se o formato não puder ser lido.
 */
function resizeImageFile(file, maxSide = 512, quality = 0.86) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0a0d'; // fundo para PNG transparente
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (canvas.toBlob) canvas.toBlob(blob => resolve({ dataUrl, blob }), 'image/jpeg', quality);
      else resolve({ dataUrl, blob: null });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// =============================================================================
// 13. RENDERIZAÇÃO E EVENTOS ESTENDIDOS
// =============================================================================
/** Rolagem rápida de Força de Vontade (permanente, dif. 6) a partir do cabeçalho de Vantagens. */
const VIRTUE_ROLLS = {
  frenzy: {
    title: '🐺 Resistir ao Frenesi', trait: 'virtues.self_control', difficulty: 6, fx: 'frenzy',
    note: 'Autocontrole/Instinto. A dificuldade depende da provocação (fome, insulto, sangue à vista). Os sucessos podem ser acumulados turno a turno.'
  },
  rotschreck: {
    title: '🔥 Resistir ao Rötschreck', trait: 'virtues.courage', difficulty: 6, fx: 'fear',
    note: 'Coragem contra fogo ou sol. Vela 3, tocha 5, fogueira 7, prédio em chamas 9; luz do sol 8 a 10.'
  }
};

const QuickRolls = {
  /** Frenesi e Rötschreck: clarão, tremor, som e a rolagem da Virtude. */
  virtue(key) {
    const char = AppState.activeCharacter;
    const cfg = VIRTUE_ROLLS[key];
    if (!char || !cfg) return;
    FX.fear(cfg.fx);
    const value = parseInt(getNestedValue(char, cfg.trait), 10) || 0;
    LinkCableSystem.setPreset({
      kind: 'virtue',
      title: cfg.title,
      parts: [{ label: getTraitLabel(cfg.trait), value }],
      difficulty: cfg.difficulty,
      applyWounds: false,
      note: cfg.note,
      meta: {}
    });
    setTimeout(() => executeDiceRoll(), 320);
  },

  willpower() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const perm = parseInt(char.status.willpower_perm, 10) || 0;
    if (perm <= 0) {
      showToast('Força de Vontade permanente está em 0. Marque os pontos antes de rolar.', 'danger');
      return;
    }
    LinkCableSystem.setPreset({
      kind: 'willpower',
      title: 'Teste de Força de Vontade',
      parts: [{ label: 'Força de Vontade', value: perm }],
      difficulty: 6,
      applyWounds: true,
      note: 'Parada = Força de Vontade permanente. Ajuste a dificuldade e role de novo se o Narrador pedir outra.',
      meta: {}
    });
    executeDiceRoll();
  }
};

// =============================================================================
// 8e. MELHORIAS DE JOGO
// Edição Dark Ages, Iniciativa configurável, Despertar, resumo para o
// Narrador, backup geral e modo de efeitos leves.
// =============================================================================

/**
 * Dark Ages 20: as Habilidades modernas trocam de nome, mantendo as mesmas
 * chaves no arquivo (Exportar/Importar continuam compatíveis).
 */
const DARK_AGES_LABELS = {
  'abilities.talents.streetwise': 'Prestidigitação',
  'abilities.skills.drive': 'Cavalgar',
  'abilities.skills.firearms': 'Arquearia',
  'abilities.skills.larceny': 'Comércio',
  'abilities.knowledges.computer': 'Enigmas',
  'abilities.knowledges.finance': 'Senescal',
  'abilities.knowledges.science': 'Sabedoria Popular',
  'abilities.knowledges.technology': 'Teologia'
};

const EDITION_INFO = {
  v20: {
    label: 'V20', title: 'VAMPIRE: THE MASQUERADE', subtitle: '20th ANNIVERSARY EDITION',
    humanityLabel: 'HUMANIDADE / TRILHA:', summaryLabel: 'Humanidade/Trilha', pathPlaceholder: 'Humanidade ou Trilha da Iluminação'
  },
  da: {
    label: 'Dark Ages 20', title: 'VAMPIRE: THE DARK AGES', subtitle: 'DARK AGES • 20th ANNIVERSARY EDITION',
    humanityLabel: 'ESTRADA:', summaryLabel: 'Estrada', pathPlaceholder: 'Estrada da Humanidade, do Céu, dos Reis, da Besta...'
  }
};

/** Tema pergaminho: automático no Dark Ages, sempre ou nunca (por personagem). */
const PARCHMENT_MODES = {
  auto: '📜 Pergaminho: automático',
  on: '📜 Pergaminho: sempre',
  off: '📜 Pergaminho: nunca'
};
const ParchmentTheme = {
  mode(char) {
    const m = char && char.settings && char.settings.parchment;
    return PARCHMENT_MODES[m] ? m : 'auto';
  },

  active(char) {
    const m = this.mode(char);
    return m === 'on' || (m === 'auto' && EditionManager.edition(char) === 'da');
  },

  apply(char) {
    if (!char) return;
    const on = this.active(char);
    const was = document.body.classList.contains('theme-parchment');
    document.body.classList.toggle('theme-parchment', on);
    const btn = document.getElementById('btn-parchment-toggle');
    if (btn) {
      btn.textContent = PARCHMENT_MODES[this.mode(char)];
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      if (!meta.dataset.dark) meta.dataset.dark = meta.getAttribute('content') || '#0a0a0d';
      meta.setAttribute('content', on ? '#b1955f' : meta.dataset.dark);
    }
    if (on !== was) {
      if (on) { AmbientFX.stop(true); AmbientAudio.stop({ remember: false }); } else AmbientFX.start();
    }
  },

  cycle() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const order = ['auto', 'on', 'off'];
    const next = order[(order.indexOf(this.mode(char)) + 1) % order.length];
    if (!char.settings) char.settings = {};
    char.settings.parchment = next;
    AppState.saveToStorage();
    this.apply(char);
    showToast({
      auto: 'Pergaminho automático: liga no Dark Ages e desliga no V20.',
      on: 'Pergaminho sempre ligado nesta ficha.',
      off: 'Pergaminho desligado nesta ficha: visual gótico escuro.'
    }[next], 'info');
  }
};

const EditionManager = {
  _original: null,

  edition(char = AppState.activeCharacter) {
    const e = char && char.settings && char.settings.edition;
    return EDITION_INFO[e] ? e : 'v20';
  },

  info(char) { return EDITION_INFO[this.edition(char)]; },

  /** Guarda os rótulos originais (V20) na primeira vez. */
  captureOriginal() {
    if (this._original) return;
    this._original = {};
    Object.keys(DARK_AGES_LABELS).forEach(path => {
      const row = document.querySelector(`.trait-row[data-trait="${path}"]`);
      if (row) this._original[path] = row.getAttribute('data-label');
    });
    const h2 = document.querySelector('#page-1 .ornament-center h2');
    const sub = document.querySelector('#page-1 .sheet-subtitle');
    this._original.title = h2 ? h2.textContent : '';
    this._original.subtitle = sub ? sub.textContent : '';
  },

  apply(char) {
    if (!char) return;
    this.captureOriginal();
    const ed = this.edition(char);
    const info = EDITION_INFO[ed];
    document.body.classList.toggle('edition-da', ed === 'da');

    Object.keys(DARK_AGES_LABELS).forEach(path => {
      const row = document.querySelector(`.trait-row[data-trait="${path}"]`);
      if (!row) return;
      const label = ed === 'da' ? DARK_AGES_LABELS[path] : this._original[path];
      row.setAttribute('data-label', label);
      const name = row.querySelector('.trait-name');
      if (name) name.textContent = label;
    });

    document.querySelectorAll('.ornament-center h2').forEach(h2 => { h2.textContent = info.title; });
    const brand = document.querySelector('.toolbar-brand h1');
    if (brand) brand.textContent = ed === 'da' ? 'VAMPIRO: IDADE DAS TREVAS' : 'VAMPIRO: A MÁSCARA';
    const badge = document.querySelector('.toolbar-brand .edition-badge');
    if (badge) badge.textContent = ed === 'da'
      ? 'Dark Ages 20º Aniversário (V20) • Ficha NÃO OFICIAL FEITA POR FÃS'
      : 'Edição 20º Aniversário (V20) • Ficha NÃO OFICIAL FEITA POR FÃS';
    const sub = document.querySelector('#page-1 .sheet-subtitle');
    if (sub && this._original.subtitle) {
      sub.textContent = this._original.subtitle.replace('20th ANNIVERSARY EDITION', info.subtitle);
    }
    const hl = document.querySelector('label[for="field-path-name"]');
    if (hl) hl.textContent = info.humanityLabel;
    const pathInput = document.getElementById('field-path-name');
    if (pathInput) pathInput.placeholder = info.pathPlaceholder;
    document.title = ed === 'da'
      ? 'Vampiro: Idade das Trevas (V20 Dark Ages) - Ficha de Personagem'
      : 'Vampiro: A Máscara (V20) - Ficha de Personagem';

    document.querySelectorAll('[data-edition]').forEach(btn => {
      const on = btn.dataset.edition === ed;
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('is-active', on);
    });
    ParchmentTheme.apply(char);
  },

  set(ed) {
    const char = AppState.activeCharacter;
    if (!char || !EDITION_INFO[ed] || this.edition(char) === ed) return;
    if (!char.settings) char.settings = {};
    char.settings.edition = ed;
    // Relógio ainda intocado: Dark Ages começa em 1346
    const clock = char.chronicle_clock;
    if (ed === 'da' && clock && !clock.nights && clock.year === new Date().getFullYear()) clock.year = 1346;
    AppState.saveToStorage();
    this.apply(char);
    // Rótulos novos aparecem nas armas, feitiços, objetivos e no rolador
    CombatManager.render(char);
    SpellManager.render(char);
    ChronicleClock.render(char);
    LinkCableSystem.updateDock();
    showToast(ed === 'da'
      ? '🏰 Dark Ages 20: Habilidades medievais e Estradas. Seus pontos continuam nos mesmos lugares.'
      : '🌆 V20: Habilidades modernas restauradas.', 'info');
  },

  bind() {
    document.querySelectorAll('[data-edition]').forEach(btn => {
      btn.addEventListener('click', () => this.set(btn.dataset.edition));
    });
    const parch = document.getElementById('btn-parchment-toggle');
    if (parch) parch.addEventListener('click', () => ParchmentTheme.cycle());
  }
};

/**
 * Iniciativa configurável por personagem.
 * Padrão V20: 1d10 + Destreza + Raciocínio − ferimentos.
 * Dá para mudar a quantidade de d10, os traços somados e um bônus fixo.
 */
const INITIATIVE_DEFAULT = {
  dice: 1,
  traits: ['attributes.physical.dexterity', 'attributes.mental.wits'],
  bonus: 0,
  wounds: true
};

const Initiative = {
  config(char) {
    if (!char.settings) char.settings = {};
    let c = char.settings.initiative;
    if (!c || typeof c !== 'object') {
      c = char.settings.initiative = JSON.parse(JSON.stringify(INITIATIVE_DEFAULT));
    }
    c.dice = clampInt(c.dice, 0, 10, 1);
    if (!Array.isArray(c.traits)) c.traits = [...INITIATIVE_DEFAULT.traits];
    c.traits = c.traits.filter(t => typeof t === 'string' && t);
    c.bonus = clampInt(c.bonus, -20, 50, 0);
    if (typeof c.wounds !== 'boolean') c.wounds = true;
    return c;
  },

  /** Valor e rótulo de um traço (Atributo, Habilidade, Disciplina ou Força de Vontade). */
  traitInfo(char, ref) {
    if (ref.startsWith('disc:')) {
      const disc = XPManager.findById(char.disciplines, ref.slice(5));
      if (!disc) return { label: 'Disciplina removida', value: 0, missing: true };
      return { label: (disc.name || 'Disciplina').replace(/\s*\(.*$/, '').trim() || 'Disciplina', value: parseInt(disc.level, 10) || 0 };
    }
    if (ref === 'status.willpower_perm') {
      return { label: 'Força de Vontade', value: parseInt(char.status.willpower_perm, 10) || 0 };
    }
    return { label: getTraitLabel(ref), value: getTraitValue(char, ref) };
  },

  shortLabel(label) {
    return label.length > 12 ? `${label.slice(0, 3)}.` : label;
  },

  roll() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const c = this.config(char);
    const wound = getWoundState(char);
    if (c.wounds && wound.incapacitated) { showToast('Incapacitado: não age neste turno.', 'danger'); return; }

    const dice = DiceEngine.rollMany(c.dice);
    const diceSum = dice.reduce((a, d) => a + d, 0);
    const traits = this.partsWithBonus(char, c);
    const traitSum = traits.reduce((a, t) => a + t.value, 0);
    const penalty = c.wounds ? wound.penalty : 0;
    const total = Math.max(0, diceSum + traitSum + c.bonus - penalty);

    const pieces = [];
    if (dice.length) pieces.push(`${dice.length}d10 (${dice.join(', ')})`);
    traits.forEach(t => pieces.push(`${t.label} ${t.value}`));
    if (c.bonus) pieces.push(`${c.bonus > 0 ? '+' : '−'}${Math.abs(c.bonus)} fixo`);
    let breakdown = pieces.join(' + ').replace(/\+ −/g, '− ').replace(/\+ \+/g, '+ ');
    if (penalty) breakdown += ` − ferimentos ${penalty}`;

    const out = document.getElementById('initiative-result');
    if (out) {
      out.innerHTML = `<strong>${total}</strong><span>${escapeHtml(breakdown || 'sem dados nem traços')}</span>`;
      out.classList.remove('flash');
      void out.offsetWidth;
      out.classList.add('flash');
      FX.impact(out.querySelector('strong'));
    }
    const text = `⚡ Iniciativa ${total} = ${breakdown}`;
    showToast(text, 'success');
    sendDiscordText(text);
  },

  /** Traços da fórmula + Celeridade/Potência automáticas (sem duplicar se já estiverem na lista). */
  partsWithBonus(char, c) {
    const parts = c.traits.map(ref => {
      const info = this.traitInfo(char, ref);
      const part = { label: info.label, value: info.value, ref };
      if (ref.startsWith('disc:')) {
        const kind = PhysicalDisciplines.bonusKindOfDiscipline(XPManager.findById(char.disciplines, ref.slice(5)));
        if (kind) part.bonus = kind;
      }
      return part;
    });
    return PhysicalDisciplines.apply(char, parts);
  },

  /** Opções do seletor de traços: Atributos, Habilidades, Disciplinas e Força de Vontade. */
  traitOptions(char) {
    const groups = [
      { label: 'Atributos', options: ATTRIBUTE_PATHS.map(p => ({ value: p, label: getTraitLabel(p) })) },
      { label: 'Habilidades', options: CombatManager.abilityPaths().map(p => ({ value: p, label: getTraitLabel(p) })) }
    ];
    const discs = (char.disciplines || []).filter(d => d && d.id && d.name && d.name.trim());
    if (discs.length) groups.push({ label: 'Disciplinas', options: discs.map(d => ({ value: `disc:${d.id}`, label: d.name.trim() })) });
    groups.push({ label: 'Outros', options: [{ value: 'status.willpower_perm', label: 'Força de Vontade' }] });
    return groups;
  },

  render(char) {
    if (!char) return;
    const c = this.config(char);
    const formula = document.getElementById('initiative-formula');
    if (formula) {
      const parts = [];
      if (c.dice) parts.push(`${c.dice}d10`);
      this.partsWithBonus(char, c).forEach(p => parts.push(p.auto ? `${p.label} ${p.value} (auto)` : p.label));
      if (c.bonus) parts.push(`${c.bonus > 0 ? '+' : '−'}${Math.abs(c.bonus)}`);
      let txt = parts.join(' + ').replace(/\+ −/g, '− ').replace(/\+ \+/g, '+ ') || 'nada configurado';
      if (c.wounds) txt += ' − ferimentos';
      formula.textContent = txt;
    }

    const dice = document.getElementById('initiative-dice');
    if (dice && document.activeElement !== dice) dice.value = c.dice;
    const bonus = document.getElementById('initiative-bonus');
    if (bonus && document.activeElement !== bonus) bonus.value = c.bonus;
    const wounds = document.getElementById('initiative-wounds');
    if (wounds) wounds.checked = c.wounds;

    const chips = document.getElementById('initiative-traits');
    if (chips) {
      chips.innerHTML = '';
      if (!c.traits.length) {
        const empty = document.createElement('span');
        empty.className = 'init-empty';
        empty.textContent = 'Nenhum traço: só dados e bônus.';
        chips.appendChild(empty);
      }
      c.traits.forEach((ref, idx) => {
        const info = this.traitInfo(char, ref);
        const chip = document.createElement('span');
        chip.className = `init-chip${info.missing ? ' is-missing' : ''}`;
        chip.textContent = `${info.label} ${info.value}`;
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '✕';
        x.title = `Tirar ${info.label} da iniciativa`;
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', () => {
          c.traits.splice(idx, 1);
          AppState.saveToStorage();
          this.render(char);
        });
        chip.appendChild(x);
        chips.appendChild(chip);
      });
    }

    const add = document.getElementById('initiative-add-trait');
    if (add) {
      add.innerHTML = '<option value="">＋ somar traço…</option>';
      this.traitOptions(char).forEach(g => {
        const og = document.createElement('optgroup');
        og.label = g.label;
        g.options.forEach(o => {
          if (c.traits.includes(o.value)) return;
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          og.appendChild(opt);
        });
        if (og.children.length) add.appendChild(og);
      });
    }
  },

  bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    const withChar = fn => e => { const char = AppState.activeCharacter; if (char) fn(char, this.config(char), e); };
    on('btn-initiative', 'click', () => this.roll());
    on('btn-initiative-config', 'click', () => {
      const panel = document.getElementById('initiative-config');
      const btn = document.getElementById('btn-initiative-config');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (btn) btn.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) this.render(AppState.activeCharacter);
    });
    on('initiative-dice', 'input', withChar((char, c, e) => {
      c.dice = clampInt(e.target.value, 0, 10, 1);
      AppState.saveToStorage();
      this.render(char);
    }));
    on('initiative-bonus', 'input', withChar((char, c, e) => {
      c.bonus = clampInt(e.target.value, -20, 50, 0);
      AppState.saveToStorage();
      this.render(char);
    }));
    on('initiative-wounds', 'change', withChar((char, c, e) => {
      c.wounds = e.target.checked;
      AppState.saveToStorage();
      this.render(char);
    }));
    on('initiative-add-trait', 'change', withChar((char, c, e) => {
      const ref = e.target.value;
      if (!ref || c.traits.includes(ref)) return;
      c.traits.push(ref);
      AppState.saveToStorage();
      this.render(char);
    }));
    on('btn-initiative-reset', 'click', withChar(char => {
      char.settings.initiative = JSON.parse(JSON.stringify(INITIATIVE_DEFAULT));
      AppState.saveToStorage();
      this.render(char);
      showToast('Iniciativa restaurada: 1d10 + Destreza + Raciocínio − ferimentos.', 'info');
    }));
  }
};

/**
 * Disciplinas físicas automáticas:
 * - Potência soma seus pontos em dados a toda rolagem com Força;
 * - Celeridade soma seus pontos a toda rolagem com Destreza.
 * Cada ação extra de Celeridade custa 1 ponto de sangue e tira 1 dado de
 * Celeridade das rolagens de Destreza até o fim do turno.
 */
const STR_REF = 'attributes.physical.strength';
const DEX_REF = 'attributes.physical.dexterity';
const PHYS_DISC_KEY = 'v20_physical_disciplines';

const PhysicalDisciplines = {
  enabled() { return safeStorageGet(PHYS_DISC_KEY, 'on') !== 'off'; },

  celerityLevel(char) { return findDisciplineLevel(char, /celeridade|celerity/i); },

  celerityUsed(char) {
    ensureTurnState(char);
    return Math.max(0, Math.min(char.status.celerity_actions, this.celerityLevel(char)));
  },

  celerityFree(char) { return Math.max(0, this.celerityLevel(char) - this.celerityUsed(char)); },

  /** Uma Disciplina marcada como traço já soma seus dados: não duplica. */
  bonusKindOfDiscipline(disc) {
    const name = disc && disc.name ? disc.name : '';
    if (/celeridade|celerity/i.test(name)) return 'celerity';
    if (/pot[eê]ncia|potence/i.test(name)) return 'potence';
    return null;
  },

  /** Recebe as partes da parada (com "ref" do traço) e devolve com os bônus das Disciplinas. */
  apply(char, parts) {
    if (!char || !Array.isArray(parts) || !parts.length || !this.enabled()) return parts;
    const out = parts.slice();
    const has = ref => parts.some(p => p.ref === ref);
    const already = kind => parts.some(p => p.bonus === kind);

    if (has(STR_REF) && !already('potence')) {
      const pot = CombatManager.potenceLevel(char);
      if (pot > 0) {
        const active = this.isActive(char, 'potence');
        out.push({
          label: active ? `Potência ${pot} 🩸 (sucessos automáticos)` : 'Potência',
          value: active ? 0 : pot,
          bonus: 'potence',
          auto: true
        });
      }
    }
    if (has(DEX_REF) && !already('celerity')) {
      const lvl = this.celerityLevel(char);
      if (lvl > 0) {
        const used = this.celerityUsed(char);
        out.push({
          label: used ? `Celeridade (${lvl} − ${used} em ações)` : 'Celeridade',
          value: lvl - used,
          bonus: 'celerity',
          auto: true
        });
      }
    }
    return out;
  },

  /** Quanto a Disciplina soma a uma parada só com os traços informados. */
  bonusTotal(char, refs) {
    const parts = refs.filter(Boolean).map(ref => ({ label: ref, value: 0, ref }));
    return this.apply(char, parts).filter(p => p.auto).reduce((a, p) => a + p.value, 0);
  },

  extraAction() {
    const char = AppState.activeCharacter;
    if (!char) return;
    FX.markCelerity(this.celerityUsed(char));
    const lvl = this.celerityLevel(char);
    if (!lvl) { showToast('A ficha não tem Celeridade.', 'info'); return; }
    const used = this.celerityUsed(char);
    if (used >= lvl) {
      showToast(`As ${lvl} ações extras de Celeridade deste turno já foram usadas. Clique em “Novo turno”.`, 'danger');
      return;
    }
    const res = spendBlood(char, 1, { ignoreTurnLimit: true });
    if (!res.ok) { showToast(res.reason, 'danger'); return; }
    char.status.celerity_actions = used + 1;
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    this.refreshAll(char);
    const free = this.celerityFree(char);
    showToast(`⚡ Ação extra ${used + 1}/${lvl}: −1 ponto de sangue. Rolagens de Destreza agora somam ${free} dado(s) de Celeridade neste turno.`, 'success');
  },

  resetTurn(char) {
    ensureTurnState(char);
    char.status.celerity_actions = 0;
    char.status.potence_active = false;
    char.status.fortitude_active = false;
  },

  /** Potência e Fortitude ativas: 1 ponto de sangue converte a Disciplina inteira em sucessos. */
  isActive(char, kind) {
    ensureTurnState(char);
    return !!char.status[kind === 'potence' ? 'potence_active' : 'fortitude_active'];
  },

  activeLevel(char, kind) {
    if (!this.isActive(char, kind)) return 0;
    return kind === 'potence' ? CombatManager.potenceLevel(char) : CombatManager.fortitudeLevel(char);
  },

  toggleDiscipline(kind) {
    const char = AppState.activeCharacter;
    if (!char) return;
    const field = kind === 'potence' ? 'potence_active' : 'fortitude_active';
    const label = kind === 'potence' ? 'Potência' : 'Fortitude';
    const level = kind === 'potence' ? CombatManager.potenceLevel(char) : CombatManager.fortitudeLevel(char);
    if (!level) { showToast(`A ficha não tem ${label}.`, 'info'); return; }
    ensureTurnState(char);

    if (char.status[field]) {
      // Cancelar no mesmo turno devolve o ponto gasto
      char.status[field] = false;
      char.status.blood_pool = char.status.blood_pool || [];
      const idx = char.status.blood_pool.findIndex(v => !v);
      if (idx >= 0) char.status.blood_pool[idx] = true;
      char.status.turn_blood_spent = Math.max(0, char.status.turn_blood_spent - 1);
      AmbientAudio.bloodGain(1);
      showToast(`${label} desativada: o ponto de sangue voltou para a reserva.`, 'info');
    } else {
      const res = spendBlood(char, 1, {});
      if (!res.ok) { showToast(res.reason, 'danger'); return; }
      char.status[field] = true;
      AmbientAudio.might();
      showToast(`🩸 ${label} ativada por 1 ponto de sangue: ${level} sucesso(s) automático(s) neste turno.`, 'success');
    }
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    this.refreshAll(char);
    LinkCableSystem.updateDock();
  },

  /** Sucessos automáticos que a Disciplina ativa dá a esta parada. */
  autoFrom(char, parts) {
    if (!char || !this.enabled() || !Array.isArray(parts)) return 0;
    const hasStrength = parts.some(p => p.ref === STR_REF);
    return hasStrength ? this.activeLevel(char, 'potence') : 0;
  },

  refreshAll(char) {
    this.render(char);
    CombatManager.render(char);
    Initiative.render(char);
    if (LinkCableSystem.preset || LinkCableSystem.selectedNodes.length) LinkCableSystem.updateDock();
    SpellManager.scheduleRefresh();
  },

  render(char) {
    if (!char) return;
    const box = document.getElementById('celerity-box');
    const lvl = this.celerityLevel(char);
    if (box) box.hidden = lvl === 0;

    const chip = document.getElementById('toggle-physical-disciplines');
    if (chip) {
      const pot = CombatManager.potenceLevel(char);
      chip.hidden = !lvl && !pot;
      const on = this.enabled();
      chip.setAttribute('aria-pressed', String(on));
      chip.classList.toggle('is-on', on);
      const names = [pot ? `Potência ${pot}` : '', lvl ? `Celeridade ${this.celerityFree(char)}` : ''].filter(Boolean).join(' · ');
      const text = chip.querySelector('.chip-text');
      if (text) text.textContent = on ? `⚡ ${names}` : '⚡ Disciplinas desligadas';
    }
    if (!lvl) return;

    const used = this.celerityUsed(char);
    const free = lvl - used;
    const level = document.getElementById('celerity-level');
    if (level) level.textContent = lvl;
    const pips = document.getElementById('celerity-pips');
    if (pips) {
      pips.innerHTML = '';
      for (let i = 0; i < lvl; i++) {
        const pip = document.createElement('span');
        pip.className = `celerity-pip${i < used ? ' is-used' : ''}`;
        FX.decorateCelerity(pip, i);
        pip.title = i < used ? `Ação extra ${i + 1} usada` : `Ação extra ${i + 1} disponível`;
        pips.appendChild(pip);
      }
    }
    const status = document.getElementById('celerity-status');
    if (status) {
      status.textContent = `Ações neste turno: 1 normal + ${used} extra(s) de ${lvl}. `
        + (this.enabled()
          ? `Rolagens de Destreza somam ${free} dado(s) de Celeridade.`
          : 'Bônus automático das Disciplinas desligado no rolador.');
    }
    const btn = document.getElementById('btn-celerity-action');
    if (btn) {
      const blood = getBloodCount(char);
      btn.disabled = used >= lvl || blood < 1;
      btn.textContent = used >= lvl ? '⚡ Ações extras esgotadas' : `⚡ Ação extra ${used + 1}/${lvl} (−1 PS)`;
      btn.title = blood < 1 ? 'Sem sangue na reserva' : 'Gasta 1 ponto de sangue e tira 1 dado de Celeridade das rolagens de Destreza até o fim do turno';
    }
  },

  bind() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-celerity-action', () => this.extraAction());
    on('btn-celerity-new-turn', () => BloodActions.newTurn());
    on('toggle-physical-disciplines', () => {
      safeStorageSet(PHYS_DISC_KEY, this.enabled() ? 'off' : 'on');
      const char = AppState.activeCharacter;
      this.refreshAll(char);
      showToast(this.enabled()
        ? 'Potência e Celeridade voltam a somar dados automaticamente.'
        : 'Potência e Celeridade não somam mais dados automaticamente.', 'info');
    });
  }
};

/**
 * Diário de sessões: data na crônica, XP ganho e anotações.
 * O XP de cada sessão vira um lançamento no histórico automático
 * (e dispara a compra dos Objetivos de Build, se ligada).
 */
const SessionJournal = {
  list(char) {
    if (!Array.isArray(char.sessions)) char.sessions = [];
    char.sessions.forEach(s => {
      if (!s.id) s.id = generateUniqueId();
      if (typeof s.title !== 'string') s.title = '';
      if (typeof s.chronicleDate !== 'string') s.chronicleDate = '';
      if (typeof s.notes !== 'string') s.notes = '';
      s.xp = clampInt(s.xp, 0, 9999, 0);
      if (typeof s.open !== 'boolean') s.open = false;
    });
    return char.sessions;
  },

  label(s, index) {
    const title = s.title.trim() || `Sessão ${index + 1}`;
    return s.chronicleDate.trim() ? `${title} — ${s.chronicleDate.trim()}` : title;
  },

  ref(s) { return `session:${s.id}`; },

  /** Mantém o lançamento de XP da sessão igual ao valor digitado. */
  syncXp(char, s, index, { allowAutoBuy = true } = {}) {
    const st = XPManager.state(char);
    XPManager.ensureBaseline(char);
    const ref = this.ref(s);
    const entry = st.log.find(e => e.kind === 'gain' && e.ref === ref);
    const before = entry ? (parseInt(entry.amount, 10) || 0) : 0;
    if (s.xp <= 0) {
      if (entry) st.log = st.log.filter(e => e !== entry);
    } else if (entry) {
      entry.amount = s.xp;
      entry.label = this.label(s, index);
    } else {
      XPManager.addEntry(char, { kind: 'gain', ref, label: this.label(s, index), amount: s.xp });
    }
    XPManager.renderPanel(char);
    if (allowAutoBuy && s.xp > before) GoalPlanner.onGain(char);
  },

  add() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const dateEl = document.getElementById('session-new-date');
    const xpEl = document.getElementById('session-new-xp');
    const sessions = this.list(char);
    const s = {
      id: generateUniqueId(),
      title: `Sessão ${sessions.length + 1}`,
      chronicleDate: (dateEl && dateEl.value.trim()) || (sessions.length ? sessions[sessions.length - 1].chronicleDate : ''),
      realDate: new Date().toISOString(),
      xp: clampInt(xpEl && xpEl.value, 0, 9999, 0),
      notes: '',
      open: false
    };
    sessions.push(s);
    if (dateEl) dateEl.value = '';
    if (xpEl) xpEl.value = '';
    this.syncXp(char, s, sessions.length - 1, { allowAutoBuy: false });
    AppState.saveToStorage();
    this.render(char);
    showToast(`📖 ${this.label(s, sessions.length - 1)} registrada${s.xp ? ` com +${s.xp} XP (saldo ${XPManager.totals(char).available})` : ''}.`, 'success');
    if (s.xp) GoalPlanner.onGain(char);
  },

  async remove(char, s) {
    const idx = this.list(char).indexOf(s);
    const ok = await GothicDialog.confirm({
      title: 'Apagar sessão',
      message: `“${this.label(s, idx)}” será apagada${s.xp ? ` e os ${s.xp} XP dela saem do histórico` : ''}. Use Desfazer (Ctrl+Z) se mudar de ideia.`,
      confirmLabel: 'Apagar',
      danger: true
    });
    if (!ok) return;
    const st = XPManager.state(char);
    st.log = st.log.filter(e => e.ref !== this.ref(s));
    char.sessions = char.sessions.filter(x => x !== s);
    AppState.saveToStorage();
    XPManager.renderPanel(char);
    this.render(char);
  },

  render(char) {
    const listEl = document.getElementById('sessions-list');
    if (!listEl || !char) return;
    const sessions = this.list(char);
    const total = sessions.reduce((a, s) => a + s.xp, 0);
    const summary = document.getElementById('sessions-summary');
    if (summary) summary.textContent = sessions.length ? `${sessions.length} sessão(ões) · ${total} XP registrados` : 'Nenhuma sessão ainda.';
    listEl.innerHTML = '';

    // Mais recentes primeiro
    [...sessions].reverse().forEach(s => {
      const index = sessions.indexOf(s);
      const item = document.createElement('li');
      item.className = `session-item${s.open ? ' is-open' : ''}`;

      const head = document.createElement('div');
      head.className = 'session-head';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'collapse-arrow';
      toggle.textContent = s.open ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(s.open));
      toggle.title = s.open ? 'Recolher' : 'Ver anotações';
      const title = document.createElement('span');
      title.className = 'session-title';
      title.textContent = this.label(s, index);
      const xp = document.createElement('span');
      xp.className = `session-xp${s.xp ? '' : ' is-zero'}`;
      xp.textContent = `+${s.xp} XP`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-remove-trait';
      del.textContent = '✕';
      del.title = 'Apagar sessão';
      del.setAttribute('aria-label', `Apagar ${this.label(s, index)}`);
      head.append(toggle, title, xp, del);

      const body = document.createElement('div');
      body.className = 'session-body';
      body.hidden = !s.open;
      const mk = (labelText, el) => {
        const w = document.createElement('label');
        w.className = 'session-field';
        const sp = document.createElement('span');
        sp.textContent = labelText;
        w.append(sp, el);
        return w;
      };
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = s.title;
      titleInput.placeholder = `Sessão ${index + 1}`;
      const dateInput = document.createElement('input');
      dateInput.type = 'text';
      dateInput.value = s.chronicleDate;
      dateInput.placeholder = 'ex.: outubro de 1346';
      const xpInput = document.createElement('input');
      xpInput.type = 'number';
      xpInput.min = '0';
      xpInput.max = '9999';
      xpInput.inputMode = 'numeric';
      xpInput.value = s.xp;
      const notes = document.createElement('textarea');
      notes.rows = 3;
      notes.value = s.notes;
      notes.placeholder = 'O que aconteceu, NPCs, pistas, promessas...';
      const real = document.createElement('p');
      real.className = 'session-real-date';
      if (s.realDate) {
        try { real.textContent = `Registrada em ${new Date(s.realDate).toLocaleDateString('pt-BR')}`; } catch (e) { real.textContent = ''; }
      }
      const row = document.createElement('div');
      row.className = 'session-row';
      row.append(mk('Título', titleInput), mk('Data na crônica', dateInput), mk('XP ganho', xpInput));
      body.append(row, mk('Anotações', notes), real);

      toggle.addEventListener('click', () => {
        s.open = !s.open;
        AppState.saveToStorage();
        this.render(char);
      });
      del.addEventListener('click', () => this.remove(char, s));
      const relabel = () => {
        title.textContent = this.label(s, index);
        const entry = XPManager.state(char).log.find(e => e.ref === this.ref(s));
        if (entry) entry.label = this.label(s, index);
      };
      titleInput.addEventListener('input', e => { s.title = e.target.value; relabel(); AppState.saveToStorage(); });
      dateInput.addEventListener('input', e => { s.chronicleDate = e.target.value; relabel(); AppState.saveToStorage(); });
      notes.addEventListener('input', e => { s.notes = e.target.value; AppState.saveToStorage(); });
      xpInput.addEventListener('input', e => {
        s.xp = clampInt(e.target.value, 0, 9999, 0);
        xp.textContent = `+${s.xp} XP`;
        xp.classList.toggle('is-zero', !s.xp);
        this.syncXp(char, s, index, { allowAutoBuy: false });
        AppState.saveToStorage();
      });
      // Compra automática só quando o usuário termina de digitar o XP
      xpInput.addEventListener('change', () => { GoalPlanner.onGain(char); });

      item.append(head, body);
      listEl.appendChild(item);
    });
  },

  bind() {
    const btn = document.getElementById('btn-session-add');
    if (btn) btn.addEventListener('click', () => this.add());
    ['session-new-date', 'session-new-xp'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.add(); } });
    });
  }
};

/**
 * Layout por personagem: minimizar seções e cards, ocultar cards e salvar
 * presets (inclui as posições das janelas arrastadas) para usar em outras fichas.
 */
const LAYOUT_PRESETS_KEY = 'v20_layout_presets';
const SECTION_TITLES = {
  attributes: 'Atributos', abilities: 'Habilidades', advantages: 'Vantagens',
  combat: 'Arsenal & Combate', grimoire: 'Caminhos & Rituais', notes: 'Qualidades & Características'
};

/**
 * Layouts de fábrica. Cada um mostra só o que costuma ser usado naquele tipo de cena.
 * (Não mexem na posição das janelas.)
 */
const LAYOUT_QUICK_KEY = 'v20_layout_quick';
const BUILTIN_LAYOUTS = [
  {
    id: 'builtin-geral', icon: '📖', name: 'Geral',
    hint: 'Tudo aberto',
    layout: { sections: {}, cards: {}, hidden: {} }
  },
  {
    id: 'builtin-combate', icon: '⚔️', name: 'Combate',
    hint: 'Físicos, Vitalidade, sangue, armas, absorção e feitiços',
    layout: {
      sections: { notes: true },
      cards: { 'win-attr-social': true, 'win-knowledges': true, 'win-specializations': true, 'win-humanity': true, 'win-virtues': true, 'win-paths': true },
      hidden: { 'win-xp': true, 'win-sessions': true, 'win-extended': true, 'win-backgrounds': true, 'win-weakness': true }
    }
  },
  {
    id: 'builtin-social', icon: '🎭', name: 'Social',
    hint: 'Sociais e Mentais, Habilidades, Antecedentes, Virtudes e anotações',
    layout: {
      sections: { combat: true, grimoire: true },
      cards: { 'win-attr-physical': true, 'win-health': true, 'win-blood': true },
      hidden: { 'win-xp': true, 'win-sessions': true, 'win-extended': true }
    }
  },
  {
    id: 'builtin-rituais', icon: '📜', name: 'Rituais & Estudo',
    hint: 'Mentais, Conhecimentos, Disciplinas, relógio, ações prolongadas e grimório',
    layout: {
      sections: { combat: true, notes: true },
      cards: { 'win-attr-physical': true, 'win-attr-social': true, 'win-talents': true, 'win-skills': true, 'win-health': true, 'win-virtues': true, 'win-backgrounds': true, 'win-weakness': true, 'win-humanity': true },
      hidden: {}
    }
  },
  {
    id: 'builtin-enxuto', icon: '📱', name: 'Mesa enxuta',
    hint: 'Para o celular durante o jogo: só recursos, combate e grimório',
    layout: {
      sections: { attributes: true, abilities: true, notes: true },
      cards: { 'win-humanity': true, 'win-virtues': true, 'win-paths': true },
      hidden: { 'win-xp': true, 'win-specializations': true, 'win-backgrounds': true, 'win-weakness': true, 'win-sessions': true }
    }
  }
];

const LayoutManager = {
  state(char) {
    if (!char.settings) char.settings = {};
    const L = char.settings.layout && typeof char.settings.layout === 'object' ? char.settings.layout : {};
    ['sections', 'cards', 'hidden'].forEach(k => { if (!L[k] || typeof L[k] !== 'object') L[k] = {}; });
    char.settings.layout = L;
    return L;
  },

  cardLabel(card) {
    if (card.dataset.cardLabel) return card.dataset.cardLabel;
    const handle = card.querySelector(':scope > .draggable-handle');
    const heading = handle ? (handle.querySelector('.category-heading, h4, label') || handle) : card;
    const text = (heading.textContent || card.dataset.windowId)
      .replace(/[✥▾▸👁]/g, '').replace(/\s+/g, ' ').replace(/:$/, '').trim();
    card.dataset.cardLabel = text || card.dataset.windowId;
    return card.dataset.cardLabel;
  },

  /** Coloca os botões de minimizar/ocultar em cada card e seção (uma vez). */
  injectControls() {
    document.querySelectorAll('[data-window-id]').forEach(card => {
      const handle = card.querySelector(':scope > .draggable-handle');
      if (!handle || handle.querySelector('.card-tools')) return;
      const id = card.dataset.windowId;
      const label = this.cardLabel(card);
      const tools = document.createElement('span');
      tools.className = 'card-tools no-print';
      tools.dataset.lockExempt = '';
      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'card-tool-btn';
      collapse.dataset.cardCollapse = id;
      const hide = document.createElement('button');
      hide.type = 'button';
      hide.className = 'card-tool-btn card-tool-hide';
      hide.dataset.cardHide = id;
      hide.textContent = '👁';
      hide.title = `Ocultar “${label}” (reexiba em 🧩 Layout)`;
      hide.setAttribute('aria-label', hide.title);
      tools.append(collapse, hide);
      handle.appendChild(tools);
    });

    document.querySelectorAll('[data-lock-section]').forEach(sec => {
      const banner = sec.querySelector(':scope > .section-banner');
      if (!banner || banner.querySelector('[data-section-collapse]')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-section-lock btn-section-collapse no-print';
      btn.dataset.sectionCollapse = sec.dataset.lockSection;
      btn.dataset.lockExempt = '';
      banner.appendChild(btn);
    });
  },

  apply(char) {
    if (!char) return;
    this.injectControls();
    const L = this.state(char);
    document.querySelectorAll('[data-lock-section]').forEach(sec => {
      const key = sec.dataset.lockSection;
      const collapsed = !!L.sections[key];
      sec.classList.toggle('is-section-collapsed', collapsed);
      const btn = sec.querySelector('[data-section-collapse]');
      if (btn) {
        btn.textContent = collapsed ? '▸' : '▾';
        btn.title = `${collapsed ? 'Expandir' : 'Minimizar'} ${SECTION_TITLES[key] || 'seção'}`;
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-expanded', String(!collapsed));
      }
    });
    document.querySelectorAll('[data-window-id]').forEach(card => {
      const id = card.dataset.windowId;
      const collapsed = !!L.cards[id];
      card.classList.toggle('is-card-collapsed', collapsed);
      card.classList.toggle('is-card-hidden', !!L.hidden[id]);
      const btn = card.querySelector(`[data-card-collapse="${id}"]`);
      if (btn) {
        btn.textContent = collapsed ? '▸' : '▾';
        btn.title = `${collapsed ? 'Expandir' : 'Minimizar'} “${this.cardLabel(card)}”`;
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-expanded', String(!collapsed));
      }
    });
    const hiddenCount = Object.values(L.hidden).filter(Boolean).length;
    const badge = document.getElementById('layout-hidden-count');
    if (badge) {
      badge.textContent = hiddenCount;
      badge.hidden = !hiddenCount;
    }
    if (typeof LinkCableSystem !== 'undefined') LinkCableSystem.updateWebLines && LinkCableSystem.updateWebLines();
    this.renderQuickbar(char);
    if (this.isOpen()) this.renderModal(char);
  },

  set(kind, id, value) {
    const char = AppState.activeCharacter;
    if (!char) return;
    const L = this.state(char);
    if (value) L[kind][id] = true; else delete L[kind][id];
    char.settings.layoutActive = null;
    AppState.saveToStorage();
    this.apply(char);
    CardBalancer.schedule({ force: true });
  },

  toggle(kind, id) {
    const char = AppState.activeCharacter;
    if (!char) return;
    this.set(kind, id, !this.state(char)[kind][id]);
  },

  hideCard(id) {
    const card = document.querySelector(`[data-window-id="${id}"]`);
    this.set('hidden', id, true);
    showToast(`“${card ? this.cardLabel(card) : id}” oculto. Para mostrar de novo, use 🧩 Layout.`, 'info');
  },

  resetAll() {
    const char = AppState.activeCharacter;
    if (!char) return;
    char.settings.layout = { sections: {}, cards: {}, hidden: {} };
    char.settings.layoutActive = 'builtin-geral';
    AppState.saveToStorage();
    this.apply(char);
    showToast('Layout desta ficha restaurado: tudo visível e expandido.', 'info');
  },

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------
  userPresets() {
    try {
      const raw = JSON.parse(safeStorageGet(LAYOUT_PRESETS_KEY, '[]'));
      return Array.isArray(raw) ? raw.filter(p => p && p.name && p.layout) : [];
    } catch (e) { return []; }
  },

  presets() {
    return [...BUILTIN_LAYOUTS.map(p => ({ ...p, builtin: true })), ...this.userPresets()];
  },

  /** Quais presets aparecem na barra de um toque (vale para todas as fichas deste aparelho). */
  quickIds() {
    try {
      const raw = JSON.parse(safeStorageGet(LAYOUT_QUICK_KEY, 'null'));
      if (Array.isArray(raw)) return raw;
    } catch (e) { /* padrão abaixo */ }
    return BUILTIN_LAYOUTS.map(p => p.id);
  },

  setQuick(id, on) {
    const ids = this.quickIds().filter(x => x !== id);
    if (on) ids.push(id);
    const order = this.presets().map(p => p.id);
    ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    safeStorageSet(LAYOUT_QUICK_KEY, JSON.stringify(ids));
    this.renderQuickbar(AppState.activeCharacter);
  },

  renderQuickbar(char) {
    const bar = document.getElementById('layout-quickbar');
    if (!bar || !char) return;
    const quick = this.quickIds();
    const presets = this.presets().filter(p => quick.includes(p.id));
    bar.innerHTML = '';
    bar.hidden = !presets.length;
    const label = document.createElement('span');
    label.className = 'layout-quick-label';
    label.textContent = '🧩';
    label.title = 'Layouts rápidos';
    bar.appendChild(label);
    const active = char.settings && char.settings.layoutActive;
    presets.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `layout-quick-btn${active === p.id ? ' is-active' : ''}`;
      b.textContent = `${p.icon || '⭐'} ${p.name}`;
      b.title = p.hint || `Aplicar o layout “${p.name}”`;
      b.setAttribute('aria-pressed', String(active === p.id));
      b.addEventListener('click', () => this.applyPreset(p.id));
      bar.appendChild(b);
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'layout-quick-btn layout-quick-edit';
    edit.textContent = '✎';
    edit.title = 'Editar layouts e a barra rápida';
    edit.setAttribute('aria-label', edit.title);
    edit.addEventListener('click', () => this.open());
    bar.appendChild(edit);
  },

  savePresets(list) { safeStorageSet(LAYOUT_PRESETS_KEY, JSON.stringify(list)); },

  savePreset() {
    const char = AppState.activeCharacter;
    const input = document.getElementById('layout-preset-name');
    const name = input ? input.value.trim() : '';
    if (!char) return;
    if (!name) { showToast('Dê um nome ao preset.', 'danger'); if (input) input.focus(); return; }
    const L = this.state(char);
    const preset = {
      id: generateUniqueId(),
      name,
      createdAt: new Date().toISOString(),
      layout: JSON.parse(JSON.stringify(L)),
      positions: JSON.parse(JSON.stringify(DraggableWindowManager.positions || {}))
    };
    const list = this.userPresets().filter(p => p.name.toLowerCase() !== name.toLowerCase());
    list.push(preset);
    this.savePresets(list);
    this.setQuick(preset.id, true);
    if (input) input.value = '';
    this.renderModal(char);
    showToast(`Preset “${name}” salvo. Ele aparece em todas as fichas deste aparelho.`, 'success');
  },

  applyPreset(id) {
    const char = AppState.activeCharacter;
    const preset = this.presets().find(p => p.id === id);
    if (!char || !preset) return;
    char.settings.layout = JSON.parse(JSON.stringify(preset.layout));
    char.settings.layoutActive = preset.id;
    if (preset.positions && typeof DraggableWindowManager !== 'undefined') {
      DraggableWindowManager.positions = JSON.parse(JSON.stringify(preset.positions));
      DraggableWindowManager.savePositions && DraggableWindowManager.savePositions();
      DraggableWindowManager.applyAllPositions();
    }
    AppState.saveToStorage();
    this.apply(char);
    CardBalancer.schedule({ force: true });
    showToast(`Preset “${preset.name}” aplicado nesta ficha.`, 'success');
  },

  deletePreset(id) {
    this.savePresets(this.userPresets().filter(p => p.id !== id));
    this.setQuick(id, false);
    this.renderModal(AppState.activeCharacter);
  },

  // ---------------------------------------------------------------------------
  // Janela 🧩 Layout
  // ---------------------------------------------------------------------------
  isOpen() {
    const m = document.getElementById('layout-modal');
    return !!(m && !m.classList.contains('hidden'));
  },

  open() {
    const char = AppState.activeCharacter;
    const m = document.getElementById('layout-modal');
    if (!char || !m) return;
    this.injectControls();
    this.renderModal(char);
    m.classList.remove('hidden');
    const close = document.getElementById('btn-close-layout');
    if (close) setTimeout(() => close.focus(), 30);
  },

  close() {
    const m = document.getElementById('layout-modal');
    if (m) m.classList.add('hidden');
  },

  renderModal(char) {
    const box = document.getElementById('layout-sections');
    if (!box || !char) return;
    const L = this.state(char);
    box.innerHTML = '';
    document.querySelectorAll('[data-lock-section]').forEach(sec => {
      const key = sec.dataset.lockSection;
      const group = document.createElement('fieldset');
      group.className = 'layout-group';
      const legend = document.createElement('legend');
      const secToggle = document.createElement('label');
      secToggle.className = 'layout-check';
      const secInput = document.createElement('input');
      secInput.type = 'checkbox';
      secInput.checked = !!L.sections[key];
      secInput.addEventListener('change', () => this.set('sections', key, secInput.checked));
      secToggle.append(secInput, document.createTextNode(' minimizada'));
      legend.append(document.createTextNode(`${SECTION_TITLES[key] || key} `), secToggle);
      group.appendChild(legend);

      sec.querySelectorAll('[data-window-id]').forEach(card => {
        const id = card.dataset.windowId;
        const row = document.createElement('div');
        row.className = 'layout-row';
        const name = document.createElement('span');
        name.className = 'layout-name';
        name.textContent = this.cardLabel(card);
        const vis = document.createElement('label');
        vis.className = 'layout-check';
        const visInput = document.createElement('input');
        visInput.type = 'checkbox';
        visInput.checked = !L.hidden[id];
        visInput.addEventListener('change', () => this.set('hidden', id, !visInput.checked));
        vis.append(visInput, document.createTextNode(' visível'));
        const min = document.createElement('label');
        min.className = 'layout-check';
        const minInput = document.createElement('input');
        minInput.type = 'checkbox';
        minInput.checked = !!L.cards[id];
        minInput.addEventListener('change', () => this.set('cards', id, minInput.checked));
        min.append(minInput, document.createTextNode(' minimizado'));
        row.classList.toggle('is-hidden', !!L.hidden[id]);
        row.append(name, vis, min);
        group.appendChild(row);
      });
      box.appendChild(group);
    });

    const list = document.getElementById('layout-presets');
    if (list) {
      const presets = this.presets();
      const quick = this.quickIds();
      const active = char.settings && char.settings.layoutActive;
      list.innerHTML = '';
      presets.forEach(p => {
        const li = document.createElement('li');
        li.className = `layout-preset${active === p.id ? ' is-active' : ''}`;
        const name = document.createElement('span');
        name.className = 'layout-name';
        const hiddenN = Object.values(p.layout.hidden || {}).filter(Boolean).length;
        const minN = Object.values(p.layout.cards || {}).filter(Boolean).length + Object.values(p.layout.sections || {}).filter(Boolean).length;
        name.textContent = `${p.icon || '⭐'} ${p.name}${p.builtin ? ' (de fábrica)' : ''} · ${p.hint || `${hiddenN} oculto(s), ${minN} minimizado(s)`}`;
        name.title = name.textContent;
        const qLabel = document.createElement('label');
        qLabel.className = 'layout-check';
        const q = document.createElement('input');
        q.type = 'checkbox';
        q.checked = quick.includes(p.id);
        q.addEventListener('change', () => this.setQuick(p.id, q.checked));
        qLabel.append(q, document.createTextNode(' barra rápida'));
        li.append(name, qLabel);
        const use = document.createElement('button');
        use.type = 'button';
        use.className = 'btn-tiny';
        use.textContent = 'Aplicar';
        use.addEventListener('click', () => this.applyPreset(p.id));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-remove-trait';
        del.textContent = '✕';
        del.title = `Apagar preset ${p.name}`;
        del.setAttribute('aria-label', del.title);
        del.addEventListener('click', () => this.deletePreset(p.id));
        li.append(use);
        if (!p.builtin) li.append(del);
        list.appendChild(li);
      });
    }
  },

  bind() {
    this.injectControls();
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-card-collapse]');
      if (c) { e.preventDefault(); this.toggle('cards', c.dataset.cardCollapse); return; }
      const h = e.target.closest('[data-card-hide]');
      if (h) { e.preventDefault(); this.hideCard(h.dataset.cardHide); return; }
      const s = e.target.closest('[data-section-collapse]');
      if (s) { e.preventDefault(); this.toggle('sections', s.dataset.sectionCollapse); }
    });
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-open-layout', () => this.open());
    on('btn-close-layout', () => this.close());
    on('btn-layout-save', () => this.savePreset());
    on('btn-layout-reset', () => this.resetAll());
    const name = document.getElementById('layout-preset-name');
    if (name) name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.savePreset(); } });
    const m = document.getElementById('layout-modal');
    if (m) {
      m.addEventListener('click', e => { if (e.target === m) this.close(); });
      m.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    }
  }
};

// =============================================================================
// 8g. TEMPO DA CRÔNICA, DESCANSO, CURA DE AGRAVADOS E RETRATO
// =============================================================================
const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Relógio da crônica (calendário juliano antes de 1582, gregoriano depois). */
const ChronicleClock = {
  state(char) {
    const da = EditionManager.edition(char) === 'da';
    if (!char.chronicle_clock || typeof char.chronicle_clock !== 'object') {
      char.chronicle_clock = { year: da ? 1346 : new Date().getFullYear(), month: 10, day: 1, minutes: 20 * 60, dusk: 18 * 60, dawn: 6 * 60, nights: 0 };
    }
    const c = char.chronicle_clock;
    c.year = clampInt(c.year, 1, 9999, 1346);
    c.month = clampInt(c.month, 1, 12, 1);
    c.day = clampInt(c.day, 1, this.daysInMonth(c.year, c.month), 1);
    c.minutes = clampInt(c.minutes, 0, 24 * 60 - 1, 20 * 60);
    c.dusk = clampInt(c.dusk, 0, 24 * 60 - 1, 18 * 60);
    c.dawn = clampInt(c.dawn, 0, 24 * 60 - 1, 6 * 60);
    c.nights = clampInt(c.nights, 0, 999999, 0);
    return c;
  },

  isLeap(year) {
    return year < 1582 ? year % 4 === 0 : (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  },

  daysInMonth(year, month) {
    return [31, this.isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  },

  addDays(c, n) {
    for (let i = 0; i < n; i++) {
      c.day++;
      if (c.day > this.daysInMonth(c.year, c.month)) {
        c.day = 1;
        c.month++;
        if (c.month > 12) { c.month = 1; c.year++; }
      }
    }
  },

  fmtTime(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  },

  dateText(c) { return `${c.day} de ${MONTHS_PT[c.month - 1]} de ${c.year}`; },

  /** Texto usado no Diário e nas ações prolongadas. */
  label(char) {
    const c = this.state(char);
    return `${this.dateText(c)}, ${this.fmtTime(c.minutes)}`;
  },

  /** Noite (entre o anoitecer e o amanhecer) ou dia. */
  phase(c) {
    const night = c.dusk > c.dawn ? (c.minutes >= c.dusk || c.minutes < c.dawn) : (c.minutes >= c.dusk && c.minutes < c.dawn);
    const untilDawn = ((c.dawn - c.minutes) + 1440) % 1440;
    return { night, untilDawn };
  },

  advance(minutes) {
    const char = AppState.activeCharacter;
    if (!char) return;
    const c = this.state(char);
    const before = this.phase(c);
    let total = c.minutes + minutes;
    while (total >= 1440) { total -= 1440; this.addDays(c, 1); }
    c.minutes = total;
    AmbientAudio.clockTick();
    AppState.saveToStorage();
    this.render(char);
    const after = this.phase(c);
    if (before.night && !after.night) showToast('☀️ O sol nasceu! Hora de dormir (🛌) ou sofrer as consequências.', 'danger');
    else if (after.night && after.untilDawn <= 60) showToast(`🌅 Faltam ${after.untilDawn} minutos para o amanhecer.`, 'danger');
  },

  /**
   * Dormir leva até o próximo anoitecer:
   * antes da meia-noite → anoitecer de amanhã; de madrugada ou de dia → anoitecer de hoje.
   */
  sleepToNextNight(c) {
    if (c.minutes >= c.dusk) this.addDays(c, 1);
    c.minutes = c.dusk;
    c.nights++;
  },

  render(char) {
    if (!char) return;
    const c = this.state(char);
    const ph = this.phase(c);
    const dateEl = document.getElementById('clock-date');
    if (dateEl) dateEl.textContent = `${ph.night ? '🌙 Noite de' : '☀️ Dia de'} ${this.dateText(c)}`;
    const timeEl = document.getElementById('clock-time');
    if (timeEl) timeEl.textContent = this.fmtTime(c.minutes);
    const dawnEl = document.getElementById('clock-dawn');
    if (dawnEl) {
      const h = Math.floor(ph.untilDawn / 60);
      const m = ph.untilDawn % 60;
      dawnEl.textContent = ph.night
        ? `Amanhecer em ${h ? `${h}h` : ''}${String(m).padStart(h ? 2 : 1, '0')}${h ? '' : ' min'}`
        : 'Sol no céu: o vampiro deveria estar dormindo';
      dawnEl.className = `clock-dawn${ph.night && ph.untilDawn <= 60 ? ' is-urgent' : ''}${ph.night ? '' : ' is-day'}`;
    }
    document.body.classList.toggle('is-daylight', !ph.night);
    const nights = document.getElementById('clock-nights');
    if (nights) nights.textContent = c.nights ? `${c.nights} noite(s) passadas` : '';
    const bar = document.getElementById('clock-bar');
    if (bar) bar.classList.toggle('is-day', !ph.night);

    // Campos de edição
    const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    set('clock-edit-day', c.day);
    set('clock-edit-month', c.month);
    set('clock-edit-year', c.year);
    set('clock-edit-time', this.fmtTime(c.minutes));
    set('clock-edit-dusk', this.fmtTime(c.dusk));
    set('clock-edit-dawn', this.fmtTime(c.dawn));

    // O Diário sugere a data do relógio
    const sessionDate = document.getElementById('session-new-date');
    if (sessionDate) sessionDate.placeholder = `Data na crônica (ex.: ${this.dateText(c)})`;
  },

  parseTime(value) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null;
  },

  bind() {
    const withChar = fn => e => { const char = AppState.activeCharacter; if (char) fn(char, this.state(char), e); };
    document.querySelectorAll('[data-clock-add]').forEach(btn => {
      btn.addEventListener('click', () => this.advance(parseInt(btn.dataset.clockAdd, 10) || 0));
    });
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('btn-clock-custom', 'click', () => {
      const el = document.getElementById('clock-custom-minutes');
      const n = clampInt(el && el.value, 1, 100000, 0);
      if (n) this.advance(n);
    });
    on('btn-clock-edit', 'click', () => {
      const panel = document.getElementById('clock-edit');
      if (panel) panel.hidden = !panel.hidden;
    });
    const save = (char) => { AppState.saveToStorage(); this.render(char); };
    on('clock-edit-day', 'change', withChar((char, c, e) => { c.day = clampInt(e.target.value, 1, 31, 1); this.state(char); save(char); }));
    on('clock-edit-month', 'change', withChar((char, c, e) => { c.month = clampInt(e.target.value, 1, 12, 1); this.state(char); save(char); }));
    on('clock-edit-year', 'change', withChar((char, c, e) => { c.year = clampInt(e.target.value, 1, 9999, c.year); this.state(char); save(char); }));
    const timeField = key => withChar((char, c, e) => { const t = this.parseTime(e.target.value); if (t !== null) { c[key] = t; save(char); } });
    on('clock-edit-time', 'change', timeField('minutes'));
    on('clock-edit-dusk', 'change', timeField('dusk'));
    on('clock-edit-dawn', 'change', timeField('dawn'));
    document.querySelectorAll('[data-rest]').forEach(btn => btn.addEventListener('click', () => RestManager.sleep()));
  }
};

/**
 * Cura de dano agravado (V20): 5 pontos de sangue e um dia inteiro de descanso por nível.
 * Cada nível agravado tem seu progresso guardado em status.agg_healing.
 */
const AGG_BLOOD_COST = 5;
const AggHealing = {
  queue(char) {
    ensureTurnState(char);
    const count = HEALTH_LEVELS.filter(l => char.health && char.health[l.key] === 'aggravated').length;
    if (!Array.isArray(char.status.agg_healing)) char.status.agg_healing = [];
    const q = char.status.agg_healing;
    while (q.length < count) q.push({ blood: 0, days: 0 });
    if (q.length > count) q.length = count;
    q.forEach(e => { e.blood = clampInt(e.blood, 0, AGG_BLOOD_COST, 0); e.days = clampInt(e.days, 0, 1, 0); });
    return q;
  },

  /** Paga sangue no nível i (até completar 5). Retorna quanto pagou. */
  pay(char, i, amount) {
    const q = this.queue(char);
    const e = q[i];
    if (!e) return 0;
    const pay = Math.min(AGG_BLOOD_COST - e.blood, amount, getBloodCount(char));
    if (pay <= 0) return 0;
    spendBlood(char, pay, { ignoreTurnLimit: true });
    e.blood += pay;
    return pay;
  },

  /** Remove um nível agravado se o primeiro da fila estiver completo. */
  completeIfReady(char) {
    const q = this.queue(char);
    const e = q[0];
    if (!e || e.blood < AGG_BLOOD_COST || e.days < 1) return false;
    const states = HEALTH_LEVELS.map(l => char.health[l.key] || '').filter(Boolean);
    const idx = states.lastIndexOf('aggravated');
    if (idx < 0) return false;
    states.splice(idx, 1);
    q.shift();
    BloodActions.compactHealth(char, states);
    this.queue(char);
    FX.addScar(char);
    FX.bloodToHealth(1);
    return true;
  },

  payButton(i, amount) {
    const char = AppState.activeCharacter;
    if (!char) return;
    const paid = this.pay(char, i, amount);
    if (!paid) {
      showToast(getBloodCount(char) ? 'Este nível já recebeu os 5 pontos de sangue.' : 'Sem sangue na reserva para pagar a cura.', 'info');
      return;
    }
    const healed = this.completeIfReady(char);
    if (healed) AmbientAudio.heal();
    this.afterChange(char);
    const e = this.queue(char)[i];
    showToast(healed
      ? `✨ 1 nível agravado curado (−${paid} PS).`
      : `−${paid} PS na cura do agravado ${i + 1}${e ? ` (${e.blood}/${AGG_BLOOD_COST})` : ''}. ${e && e.days < 1 ? 'Falta 1 dia de descanso (🛌 Dormir).' : ''}`, 'success');
  },

  afterChange(char) {
    AppState.saveToStorage();
    UIRenderer.renderHealthTrack(char);
    UIRenderer.renderBloodPool(char);
    LinkCableSystem.refreshNodeValues();
    CombatManager.render(char);
  },

  render(char) {
    const box = document.getElementById('agg-healing');
    if (!box || !char) return;
    const q = this.queue(char);
    box.hidden = !q.length;
    const list = document.getElementById('agg-healing-list');
    if (!list) return;
    list.innerHTML = '';
    const total = q.reduce((a, e) => a + (AGG_BLOOD_COST - e.blood), 0);
    const days = q.reduce((a, e) => a + (1 - e.days), 0);
    const sum = document.getElementById('agg-healing-summary');
    if (sum) sum.textContent = q.length ? `Faltam ${total} PS e ${days} dia(s) de descanso no total.` : '';
    q.forEach((e, i) => {
      const li = document.createElement('li');
      li.className = 'agg-item';
      const missing = AGG_BLOOD_COST - e.blood;
      li.innerHTML = `
        <span class="agg-name">✶ Agravado ${i + 1}${i === 0 ? ' <small>(o próximo a curar)</small>' : ''}</span>
        <span class="agg-progress" title="Sangue pago">🩸 ${e.blood}/${AGG_BLOOD_COST}</span>
        <span class="agg-progress" title="Dias de descanso">☀️ ${e.days}/1 dia</span>`;
      const actions = document.createElement('span');
      actions.className = 'agg-actions';
      const one = document.createElement('button');
      one.type = 'button';
      one.className = 'btn-tiny';
      one.textContent = '+1 PS';
      one.disabled = !missing;
      one.addEventListener('click', () => this.payButton(i, 1));
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'btn-tiny';
      all.textContent = missing ? `Pagar ${missing}` : 'Pago';
      all.disabled = !missing;
      all.addEventListener('click', () => this.payButton(i, missing));
      actions.append(one, all);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }
};

/** 🛌 Dormir: recupera 1 FV, avança a cura de um agravado e leva à próxima noite. */
const RestManager = {
  sleep() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const parts = [];

    // Força de Vontade
    const temp = Array.isArray(char.status.willpower_temp) ? char.status.willpower_temp : [];
    const perm = parseInt(char.status.willpower_perm, 10) || 0;
    let idx = -1;
    for (let i = Math.min(perm, temp.length) - 1; i >= 0; i--) if (temp[i]) { idx = i; break; }
    if (idx >= 0) {
      temp[idx] = false;
      parts.push('+1 Força de Vontade');
    }

    // Um nível agravado por dia de descanso
    const q = AggHealing.queue(char);
    if (q.length) {
      q[0].days = 1;
      const paid = AggHealing.pay(char, 0, AGG_BLOOD_COST);
      if (paid) parts.push(`−${paid} PS na cura`);
      if (AggHealing.completeIfReady(char)) parts.push('1 nível agravado curado');
      else parts.push(`agravado aguardando ${AGG_BLOOD_COST - q[0].blood} PS`);
    }

    // Tempo e turno
    const c = ChronicleClock.state(char);
    ChronicleClock.sleepToNextNight(c);
    AmbientAudio.sleepSound();
    ensureTurnState(char);
    char.status.turn_blood_spent = 0;
    char.status.physical_boosts = { strength: 0, dexterity: 0, stamina: 0 };
    PhysicalDisciplines.resetTurn(char);

    AppState.saveToStorage();
    UIRenderer.renderWillpowerTemp(char);
    AggHealing.afterChange(char);
    UIRenderer.renderAllDots(char);
    PhysicalDisciplines.refreshAll(char);
    ChronicleClock.render(char);
    showToast(`🛌 Dormiu até ${ChronicleClock.label(char)}. ${parts.join(' · ') || 'Nada a recuperar.'} Ao acordar, use 🌙 Despertar.`, 'success');
  }
};

/** Moldura do retrato conforme ferimentos, fome e torpor. */
const PortraitState = {
  render(char) {
    const frame = document.getElementById('char-avatar-frame');
    if (!frame || !char) return;
    const wound = getWoundState(char);
    const level = wound.index < 0 ? 0 : wound.index <= 1 ? 1 : wound.index <= 3 ? 2 : 3;
    const blood = getBloodCount(char);
    const torpor = !!(char.status && char.status.torpor);
    frame.classList.remove('state-wound-1', 'state-wound-2', 'state-wound-3');
    if (level) frame.classList.add(`state-wound-${level}`);
    frame.classList.toggle('state-hungry', blood > 0 && blood < 5);
    frame.classList.toggle('state-starving', blood === 0);
    frame.classList.toggle('state-torpor', torpor);

    const chips = document.getElementById('avatar-states');
    if (chips) {
      const items = [];
      if (level) items.push(`<span class="avatar-chip chip-wound">🩹 ${escapeHtml(wound.label)}</span>`);
      if (blood < 5) items.push(`<span class="avatar-chip chip-hunger">${blood === 0 ? '🩸 Faminto' : '🩸 Com fome'}</span>`);
      chips.innerHTML = items.join('');
    }
    const btn = document.getElementById('btn-toggle-torpor');
    if (btn) {
      btn.setAttribute('aria-pressed', String(torpor));
      btn.classList.toggle('is-on', torpor);
      btn.textContent = torpor ? '💤 Em torpor' : '💤 Torpor';
    }
  },

  setTorpor(char, on) {
    if (!char.status) char.status = {};
    char.status.torpor = !!on;
    AppState.saveToStorage();
    this.render(char);
    FX.render(char);
  },

  bind() {
    const scarsBtn = document.getElementById('btn-open-scars');
    if (scarsBtn) scarsBtn.addEventListener('click', () => FX.openScars());
    const scarsClose = document.getElementById('btn-close-scars');
    if (scarsClose) scarsClose.addEventListener('click', () => FX.closeScars());
    const scarsAdd = document.getElementById('btn-add-scar');
    if (scarsAdd) scarsAdd.addEventListener('click', () => FX.addScarManual());
    const btn = document.getElementById('btn-toggle-torpor');
    if (btn) btn.addEventListener('click', () => {
      const char = AppState.activeCharacter;
      if (!char) return;
      this.setTorpor(char, !char.status.torpor);
      showToast(char.status.torpor ? '💤 Personagem em torpor.' : 'Personagem desperto do torpor.', 'info');
    });
  }
};

// =============================================================================
// 8h. AÇÕES PROLONGADAS
// Soma os sucessos de várias rolagens até a meta. Falha crítica zera tudo (V20).
// =============================================================================
const ExtendedActions = {
  list(char) {
    if (!Array.isArray(char.extended_actions)) char.extended_actions = [];
    char.extended_actions.forEach(a => {
      if (!a.id) a.id = generateUniqueId();
      a.goal = clampInt(a.goal, 1, 999, 5);
      a.progress = clampInt(a.progress, 0, 9999, 0);
      if (!Array.isArray(a.history)) a.history = [];
      if (typeof a.open !== 'boolean') a.open = false;
    });
    return char.extended_actions;
  },

  active(char) {
    const id = char && char.settings ? char.settings.activeExtended : null;
    return id ? this.list(char).find(a => a.id === id && !a.done) || null : null;
  },

  setActive(char, id) {
    if (!char.settings) char.settings = {};
    char.settings.activeExtended = id || null;
    AppState.saveToStorage();
    this.render(char);
  },

  create(char, name, goal) {
    const a = { id: generateUniqueId(), name: name.trim(), goal: clampInt(goal, 1, 999, 5), progress: 0, done: false, createdAt: Date.now(), history: [], open: false };
    this.list(char).push(a);
    this.setActive(char, a.id);
    showToast(`⏳ “${a.name}” criada (meta ${a.goal}) e ligada ao rolador.`, 'success');
    return a;
  },

  async promptCreate() {
    const char = AppState.activeCharacter;
    if (!char) return;
    const name = await GothicDialog.open({ title: 'Nova ação prolongada', message: 'O que o personagem está tentando fazer ao longo de várias rolagens?', input: { placeholder: 'ex.: Pesquisar ritual' }, confirmLabel: 'Continuar' });
    if (!name || !name.trim()) { this.render(char); return; }
    const goal = await GothicDialog.open({ title: 'Meta de sucessos', message: `Quantos sucessos acumulados completam “${name.trim()}”?`, input: { value: '10', type: 'number' }, confirmLabel: 'Criar' });
    if (goal === null || goal === false) { this.render(char); return; }
    this.create(char, name, goal);
  },

  /** Aplica a rolagem na ação ativa (chamado antes de enviar ao Discord). */
  afterRoll(state) {
    const char = AppState.activeCharacter;
    const a = this.active(char);
    state.extended = null;
    if (!a) return;
    state.extended = { id: a.id, before: a.progress, entryIndex: a.history.length };
    a.history.push({ when: ChronicleClock.label(char), ts: Date.now(), successes: 0, botch: false, total: 0, pool: state.mathStr || '' });
    this.apply(char, state);
    state.notes = [...(state.notes || []), `⏳ ${a.name}: ${a.progress}/${a.goal}${state.isBotch ? ' (falha crítica zerou o progresso)' : ''}`];
  },

  afterReroll(state) {
    if (!state || !state.extended) return;
    const char = AppState.activeCharacter;
    this.apply(char, state);
    const a = this.list(char).find(x => x.id === state.extended.id);
    if (a && Array.isArray(state.notes)) {
      state.notes = state.notes.filter(n => !n.startsWith('⏳ '));
      state.notes.push(`⏳ ${a.name}: ${a.progress}/${a.goal}${state.isBotch ? ' (falha crítica zerou o progresso)' : ''}`);
    }
  },

  apply(char, state) {
    const a = this.list(char).find(x => x.id === state.extended.id);
    if (!a) return;
    const gained = Math.max(0, state.netSuccesses);
    a.progress = state.isBotch ? 0 : state.extended.before + gained;
    const entry = a.history[state.extended.entryIndex];
    if (entry) Object.assign(entry, { successes: gained, botch: !!state.isBotch, total: a.progress });
    const wasDone = a.done;
    a.done = a.progress >= a.goal;
    AppState.saveToStorage();
    this.render(char);
    if (state.isBotch) showToast(`💥 Falha crítica em “${a.name}”: o progresso voltou a 0.`, 'danger');
    else if (a.done && !wasDone) {
      showToast(`🏁 “${a.name}” concluída (${a.progress}/${a.goal})!`, 'success');
      char.settings.activeExtended = null;
    }
  },

  render(char) {
    if (!char) return;
    const actions = this.list(char);
    const active = this.active(char);

    // Seletor no rolador
    const sel = document.getElementById('dock-extended');
    if (sel) {
      sel.innerHTML = '';
      const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; sel.appendChild(o); };
      add('', 'Rolagem comum');
      actions.filter(a => !a.done).forEach(a => add(a.id, `⏳ ${a.name} (${a.progress}/${a.goal})`));
      add('__new__', '＋ Nova ação prolongada…');
      sel.value = active ? active.id : '';
      sel.classList.toggle('is-active', !!active);
    }

    const list = document.getElementById('extended-list');
    if (!list) return;
    list.innerHTML = '';
    if (!actions.length) {
      list.innerHTML = '<li class="extended-empty">Nenhuma ação prolongada. Crie uma aqui ou pelo rolador.</li>';
      return;
    }
    [...actions].reverse().forEach(a => {
      const li = document.createElement('li');
      li.className = `extended-item${a.done ? ' is-done' : ''}${active && active.id === a.id ? ' is-active' : ''}`;
      const pct = Math.min(100, Math.round((a.progress / a.goal) * 100));
      const head = document.createElement('div');
      head.className = 'extended-head';
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'collapse-arrow';
      arrow.textContent = a.open ? '▾' : '▸';
      arrow.title = a.open ? 'Ocultar histórico' : 'Ver histórico de rolagens';
      arrow.setAttribute('aria-expanded', String(a.open));
      const name = document.createElement('span');
      name.className = 'extended-name';
      name.textContent = a.name;
      const count = document.createElement('span');
      count.className = 'extended-count';
      count.textContent = a.done ? `✓ ${a.progress}/${a.goal}` : `${a.progress}/${a.goal}`;
      head.append(arrow, name, count);

      const bar = document.createElement('div');
      bar.className = 'goal-progress';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      const fill = document.createElement('span');
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'extended-actions';
      const mk = (text, cls, fn, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        if (title) b.title = title;
        b.addEventListener('click', fn);
        actionsRow.appendChild(b);
        return b;
      };
      if (!a.done) {
        const isActive = active && active.id === a.id;
        mk(isActive ? '● Ligada ao rolador' : 'Usar no rolador', `btn-tiny${isActive ? ' is-on' : ''}`, () => this.setActive(char, isActive ? null : a.id),
          'As próximas rolagens somam sucessos nesta ação');
      }
      mk('Zerar', 'btn-tiny', () => {
        a.progress = 0; a.done = false;
        a.history.push({ when: ChronicleClock.label(char), ts: Date.now(), successes: 0, botch: false, total: 0, pool: 'zerada manualmente' });
        AppState.saveToStorage(); this.render(char);
      });
      mk('✕', 'btn-remove-trait', async () => {
        const ok = await GothicDialog.confirm({ title: 'Apagar ação prolongada', message: `Apagar “${a.name}” e o histórico dela?`, confirmLabel: 'Apagar', danger: true });
        if (!ok) return;
        char.extended_actions = char.extended_actions.filter(x => x !== a);
        if (char.settings.activeExtended === a.id) char.settings.activeExtended = null;
        AppState.saveToStorage(); this.render(char);
      }, 'Apagar');

      const hist = document.createElement('ol');
      hist.className = 'extended-history';
      hist.hidden = !a.open;
      if (!a.history.length) {
        const li2 = document.createElement('li');
        li2.className = 'extended-empty';
        li2.textContent = 'Nenhuma rolagem ainda.';
        hist.appendChild(li2);
      }
      [...a.history].reverse().forEach(h => {
        const row = document.createElement('li');
        row.className = h.botch ? 'is-botch' : '';
        row.innerHTML = `<span>${escapeHtml(h.when || '')}</span><span>${h.botch ? '💥 falha crítica' : `+${h.successes}`}</span><strong>${h.total}/${a.goal}</strong>`;
        if (h.pool) row.title = h.pool;
        hist.appendChild(row);
      });
      arrow.addEventListener('click', () => { a.open = !a.open; AppState.saveToStorage(); this.render(char); });

      li.append(head, bar, actionsRow, hist);
      list.appendChild(li);
    });
  },

  bind() {
    const sel = document.getElementById('dock-extended');
    if (sel) sel.addEventListener('change', () => {
      const char = AppState.activeCharacter;
      if (!char) return;
      if (sel.value === '__new__') { this.promptCreate(); return; }
      this.setActive(char, sel.value);
    });
    const create = () => {
      const char = AppState.activeCharacter;
      const n = document.getElementById('extended-new-name');
      const g = document.getElementById('extended-new-goal');
      if (!char || !n) return;
      if (!n.value.trim()) { showToast('Dê um nome à ação prolongada.', 'danger'); n.focus(); return; }
      this.create(char, n.value, g ? g.value : 10);
      n.value = '';
    };
    const btn = document.getElementById('btn-extended-add');
    if (btn) btn.addEventListener('click', create);
    ['extended-new-name', 'extended-new-goal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    });
  }
};

// =============================================================================
// 8i. ROLAR POR COMANDO (texto, voz e links para a Siri)
// Ex.: "inteligência + ocultismo dificuldade 7", "força de vontade dif 5",
//      "iniciativa", "atacar com soco", "dano mordida", "ritual defesa do refúgio",
//      "absorver 4 de dano letal".
// Links: ?rolar=<comando>&dif=<n>&ficha=<nome>
// =============================================================================
const TRAIT_ALIASES = {
  'attributes.physical.strength': ['strength', 'str', 'for'],
  'attributes.physical.dexterity': ['dexterity', 'dex', 'des'],
  'attributes.physical.stamina': ['stamina', 'sta', 'resistencia'],
  'attributes.social.charisma': ['charisma', 'cha', 'car'],
  'attributes.social.manipulation': ['manipulation', 'man'],
  'attributes.social.appearance': ['appearance', 'app', 'apa', 'aparencia'],
  'attributes.mental.perception': ['perception', 'per'],
  'attributes.mental.intelligence': ['intelligence', 'int'],
  'attributes.mental.wits': ['wits', 'wit', 'rac', 'raciocinio'],
  'abilities.talents.alertness': ['alertness', 'prontidao'],
  'abilities.talents.athletics': ['athletics', 'atletismo'],
  'abilities.talents.brawl': ['brawl', 'briga'],
  'abilities.talents.foresight': ['awareness', 'consciencia espiritual', 'prescience'],
  'abilities.talents.empathy': ['empathy'],
  'abilities.talents.expression': ['expression'],
  'abilities.talents.intimidation': ['intimidation'],
  'abilities.talents.leadership': ['leadership'],
  'abilities.talents.streetwise': ['streetwise', 'legerdemain', 'manha', 'prestidigitacao'],
  'abilities.talents.subterfuge': ['subterfuge', 'labia', 'subterfugio'],
  'abilities.skills.animal_ken': ['animal ken', 'empatia com animais', 'trato com animais'],
  'abilities.skills.crafts': ['crafts', 'oficios'],
  'abilities.skills.drive': ['drive', 'ride', 'conducao', 'cavalgar', 'cavalgada'],
  'abilities.skills.etiquette': ['etiquette'],
  'abilities.skills.firearms': ['firearms', 'archery', 'armas de fogo', 'arquearia', 'arco'],
  'abilities.skills.melee': ['melee', 'armas brancas', 'armas brancas'],
  'abilities.skills.performance': ['performance'],
  'abilities.skills.larceny': ['larceny', 'commerce', 'furto', 'comercio'],
  'abilities.skills.stealth': ['stealth', 'furtividade'],
  'abilities.skills.survival': ['survival', 'sobrevivencia'],
  'abilities.knowledges.academics': ['academics', 'academicos'],
  'abilities.knowledges.computer': ['computer', 'enigmas', 'computador'],
  'abilities.knowledges.finance': ['finance', 'seneschal', 'financas', 'senescal'],
  'abilities.knowledges.investigation': ['investigation'],
  'abilities.knowledges.law': ['law', 'direito', 'leis'],
  'abilities.knowledges.medicine': ['medicine'],
  'abilities.knowledges.occult': ['occult', 'ocultismo'],
  'abilities.knowledges.politics': ['politics'],
  'abilities.knowledges.science': ['science', 'hearth wisdom', 'ciencia', 'sabedoria popular'],
  'abilities.knowledges.technology': ['technology', 'theology', 'tecnologia', 'teologia'],
  'virtues.conscience': ['conscience', 'conviction', 'consciencia', 'conviccao'],
  'virtues.self_control': ['self control', 'self-control', 'instinct', 'autocontrole', 'instinto'],
  'virtues.courage': ['courage', 'coragem'],
  'status.willpower_perm': ['willpower', 'forca de vontade', 'vontade', 'fv', 'wp'],
  'status.humanity': ['humanity', 'humanidade', 'estrada', 'road', 'trilha']
};

const NUMBER_WORDS = {
  um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3, quatro: 4, four: 4,
  cinco: 5, five: 5, seis: 6, six: 6, sete: 7, seven: 7, oito: 8, eight: 8,
  nove: 9, nine: 9, dez: 10, ten: 10
};

const CommandRoller = {
  norm(text) {
    let t = stripAccents(String(text || '').toLowerCase())
      .replace(/[“”"'`´]/g, ' ')
      .replace(/[^a-z0-9+,\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    t = t.replace(/\b(um|uma|one|dois|duas|two|tres|three|quatro|four|cinco|five|seis|six|sete|seven|oito|eight|nove|nine|dez|ten)\b/g,
      w => String(NUMBER_WORDS[w]));
    return t;
  },

  lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m + n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  },

  /** Índice de tudo que pode entrar numa parada. */
  index(char) {
    const entries = [];
    const add = (ref, label, names, extra = {}) => {
      const keys = new Set();
      names.filter(Boolean).forEach(n => { const k = this.norm(n); if (k) keys.add(k); });
      entries.push({ ref, label, keys: [...keys], ...extra });
    };
    document.querySelectorAll('.trait-row[data-trait]').forEach(row => {
      const ref = row.getAttribute('data-trait');
      const names = [row.getAttribute('data-label')];
      if (EditionManager._original && EditionManager._original[ref]) names.push(EditionManager._original[ref]);
      if (DARK_AGES_LABELS[ref]) names.push(DARK_AGES_LABELS[ref]);
      (row.getAttribute('data-label') || '').split('/').forEach(p => names.push(p));
      names.push(...(TRAIT_ALIASES[ref] || []));
      add(ref, row.getAttribute('data-label') || ref, names);
    });
    add('status.willpower_perm', 'Força de Vontade', TRAIT_ALIASES['status.willpower_perm']);
    const pathName = (char.status && char.status.path_name) || 'Humanidade';
    add('status.humanity', pathName, [...TRAIT_ALIASES['status.humanity'], pathName]);
    (char.disciplines || []).filter(d => d && d.name && d.name.trim()).forEach(d => {
      const canon = canonicalDiscipline(d.name);
      const en = Object.keys(DISCIPLINE_ALIASES).filter(k => DISCIPLINE_ALIASES[k] === canon);
      const bonus = PhysicalDisciplines.bonusKindOfDiscipline(d);
      add(`disc:${d.id}`, d.name.replace(/\s*\(.*$/, '').trim(), [d.name, baseTraitName(d.name), canon, ...en], bonus ? { bonus } : {});
    });
    (char.paths || []).filter(p => p && p.name && p.name.trim()).forEach(p => {
      add(`path:${p.id}`, p.name.replace(/\s*\(.*$/, '').trim(), [p.name, baseTraitName(p.name)]);
    });
    return entries;
  },

  valueOf(char, entry) {
    if (entry.ref.startsWith('disc:') || entry.ref.startsWith('path:')) return XPManager.currentLevel(char, entry.ref);
    if (entry.ref.startsWith('status.')) return parseInt(getNestedValue(char, entry.ref), 10) || 0;
    return getTraitValue(char, entry.ref);
  },

  /** Acha o traço mais parecido com a palavra dita. */
  match(token, entries) {
    const t = this.norm(token);
    if (!t) return null;
    let hit = entries.find(e => e.keys.includes(t));
    if (hit) return hit;
    if (t.length >= 3) {
      hit = entries.find(e => e.keys.some(k => k.length >= 3 && (k.startsWith(t) || t.startsWith(k))));
      if (hit) return hit;
    }
    if (t.length >= 5) {
      let best = null;
      let bestD = 99;
      entries.forEach(e => e.keys.forEach(k => {
        const d = this.lev(t, k);
        const limit = t.length >= 8 ? 2 : 1;
        if (d <= limit && d < bestD) { best = e; bestD = d; }
      }));
      if (best) return best;
    }
    return null;
  },

  /** Nome parecido numa lista (armas, rituais, feitiços). */
  findNamed(list, text) {
    const t = this.norm(text);
    if (!t) return null;
    const named = (list || []).filter(x => x && x.name && x.name.trim()).map(x => ({ x, k: this.norm(x.name) }));
    return (named.find(n => n.k === t)
      || named.find(n => n.k.startsWith(t) || t.startsWith(n.k))
      || named.find(n => t.length >= 4 && n.k.includes(t))
      || named.find(n => this.lev(t, n.k) <= 2) || {}).x || null;
  },

  parse(raw) {
    let t = this.norm(raw);
    const out = { difficulty: null, modifier: 0, autoSuccess: false, text: '' };
    t = t.replace(/\b(?:dificuldade|dificuldad|dif|diff|difficulty|dc|contra)\s*(?:de\s*)?(\d{1,2})\b/, (_, n) => { out.difficulty = clampInt(n, 2, 10, 6); return ' '; });
    t = t.replace(/(?:\bmais\s+|\+\s*)(\d{1,2})\s*dados?\b/, (_, n) => { out.modifier += +n; return ' '; });
    t = t.replace(/(?:\bmenos\s+|-\s*)(\d{1,2})\s*dados?\b/, (_, n) => { out.modifier -= +n; return ' '; });
    t = t.replace(/\b(?:gastando|gastar|gasta|usando|usar|spending|spend)\s+(?:1\s+)?(?:ponto\s+de\s+)?(?:fv|forca de vontade|willpower|wp)\b/, () => { out.autoSuccess = true; return ' '; });
    t = t.replace(/^\s*(?:por favor\s+)?(?:rolar|role|rola|rode|rodar|roda|jogar|jogue|joga|roll|lancar|teste de|teste|fazer|faca)\b\s*(?:de\s+|um\s+|uma\s+|o\s+|a\s+)?/, '');
    out.text = t.replace(/\s+/g, ' ').trim();
    return out;
  },

  async run(raw, opts = {}) {
    const char = AppState.activeCharacter;
    if (!char) return false;
    AmbientAudio.whisper();
    const cmd = this.parse(raw);
    if (opts.difficulty) cmd.difficulty = clampInt(opts.difficulty, 2, 10, 6);
    const t = cmd.text;
    if (!t) { showToast('Diga o que rolar, por exemplo: “inteligência mais ocultismo dificuldade 7”.', 'info'); return false; }
    const say = (msg) => showToast(`🎙️ ${msg}`, 'info');

    const finish = (preset) => {
      if (cmd.difficulty) preset.difficulty = cmd.difficulty;
      LinkCableSystem.setPreset(preset);
      RollOptions.modifier = cmd.modifier;
      if (cmd.autoSuccess) RollOptions.autoSuccess = true;
      LinkCableSystem.updateDock();
      executeDiceRoll();
      return true;
    };

    // Iniciativa
    if (/^(iniciativa|initiative)$/.test(t)) { Initiative.roll(); return true; }

    // Absorção (com dano opcional: "absorver 4 de dano letal")
    let m = /^(?:absorcao|absorver|absorva|absorve|soak)\b(.*)$/.exec(t);
    if (m) {
      const rest = m[1];
      const amount = /(\d{1,2})/.exec(rest);
      const type = /agravad|aggravat/.test(rest) ? 'aggravated' : /contusiv|bashing/.test(rest) ? 'bashing' : /letal|lethal/.test(rest) ? 'lethal' : null;
      const typeSel = document.getElementById('soak-type');
      if (type && typeSel) typeSel.value = type;
      if (amount) {
        const inc = document.getElementById('incoming-damage');
        if (inc) inc.value = amount[1];
        CombatManager.soak({ apply: true });
      } else {
        CombatManager.soak();
        executeDiceRoll();
      }
      return true;
    }

    // Ataque e dano com arma
    m = /^(?:ataque|atacar|ataca|ataco|attack|golpe)\s+(?:com\s+(?:o\s+|a\s+)?|de\s+|with\s+)?(.+)$/.exec(t);
    if (m) {
      const w = this.findNamed(char.weapons, m[1]);
      if (!w) { say(`Não achei a arma “${m[1]}”.`); return false; }
      CombatManager.attack(w);
      return finish(LinkCableSystem.preset);
    }
    m = /^(?:dano|damage)\s+(?:de\s+|do\s+|da\s+|com\s+(?:o\s+|a\s+)?|with\s+)?(.+)$/.exec(t);
    if (m) {
      const w = this.findNamed(char.weapons, m[1]);
      if (!w) { say(`Não achei a arma “${m[1]}”.`); return false; }
      CombatManager.damage(w);
      return finish(LinkCableSystem.preset);
    }

    // Feitiços e rituais do grimório
    m = /^(?:magia|feitico|ritual|spell|conjurar|conjuro|lancar|poder)\s+(?:de\s+|do\s+|da\s+)?(.+)$/.exec(t);
    const spellName = m ? m[1] : t;
    const sp = this.findNamed(SpellManager.list(char), spellName);
    if (sp && (m || this.norm(sp.name) === t)) {
      SpellManager.cast(sp);
      if (LinkCableSystem.preset && LinkCableSystem.preset.meta && LinkCableSystem.preset.meta.spellId === sp.id) return finish(LinkCableSystem.preset);
      return false;
    }
    if (m) { say(`Não achei “${m[1]}” no grimório.`); return false; }

    // Parada de traços: "destreza mais briga", "int + ocultismo"
    const entries = this.index(char);
    const tokens = t.split(/\s*(?:\+|,|\be\b|\bmais\b|\band\b|\bplus\b|\bcom\b)\s*/).map(x => x.trim()).filter(Boolean);
    const parts = [];
    const unknown = [];
    tokens.forEach(tok => {
      const e = this.match(tok, entries);
      if (!e) { unknown.push(tok); return; }
      const part = { label: e.label, value: this.valueOf(char, e), ref: e.ref };
      if (e.bonus) part.bonus = e.bonus;
      parts.push(part);
    });
    if (unknown.length || !parts.length) {
      say(`Não entendi: “${unknown.join('”, “') || t}”. Tente algo como “destreza mais briga dificuldade 6”.`);
      return false;
    }
    // Só Força de Vontade ou só Virtude: rolagem comum de dificuldade 6 (ou a pedida)
    return finish({
      kind: 'command',
      title: `🎙️ ${parts.map(p => p.label).join(' + ')}`,
      parts,
      difficulty: cmd.difficulty || 6,
      applyWounds: !(parts.length === 1 && /^(status|virtues)\./.test(parts[0].ref)),
      meta: {}
    });
  },

  // ---------------------------------------------------------------------------
  // Links (?rolar=) e janela de comando
  // ---------------------------------------------------------------------------
  baseUrl() {
    return `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
  },

  handleUrl() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    const text = params.get('rolar') || params.get('roll') || params.get('r');
    const charName = params.get('ficha') || params.get('char');
    if (!text && !charName) return;
    if (charName) {
      const wanted = this.norm(charName);
      const found = AppState.characters.find(c => this.norm(c.header && c.header.name) === wanted)
        || AppState.characters.find(c => this.norm(c.header && c.header.name).startsWith(wanted));
      if (found && found !== AppState.activeCharacter) {
        AppState.setActive(found.id);
        UIRenderer.updateDropdown();
        UIRenderer.renderAll();
      } else if (!found) {
        showToast(`Ficha “${charName}” não encontrada neste aparelho.`, 'danger');
      }
    }
    const clean = `${location.pathname}${location.hash || ''}`;
    try { history.replaceState(null, '', clean); } catch (e) { /* ignora */ }
    if (text) setTimeout(() => this.run(text, { difficulty: params.get('dif') || params.get('difficulty') }), 350);
  },

  open(prefill = '') {
    const modal = document.getElementById('command-modal');
    if (!modal) return;
    const input = document.getElementById('command-input');
    if (input) input.value = prefill;
    const url = document.getElementById('siri-url');
    if (url) url.textContent = `${this.baseUrl()}?rolar=`;
    const ex = document.getElementById('siri-url-example');
    if (ex) ex.textContent = `${this.baseUrl()}?rolar=iniciativa`;
    const mic = document.getElementById('btn-command-mic');
    if (mic) mic.hidden = !(window.SpeechRecognition || window.webkitSpeechRecognition);
    modal.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 30);
  },

  close() {
    const modal = document.getElementById('command-modal');
    if (modal) modal.classList.add('hidden');
    this.stopListening();
  },

  async submit() {
    const input = document.getElementById('command-input');
    if (!input || !input.value.trim()) return;
    const ok = await this.run(input.value);
    if (ok) {
      this.remember(input.value.trim());
      this.close();
    }
  },

  /** Últimos comandos usados (atalhos de um toque). */
  recent() {
    try { const r = JSON.parse(safeStorageGet('v20_command_recent', '[]')); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  },

  remember(text) {
    const list = [text, ...this.recent().filter(x => x.toLowerCase() !== text.toLowerCase())].slice(0, 8);
    safeStorageSet('v20_command_recent', JSON.stringify(list));
    this.renderRecent();
  },

  renderRecent() {
    const box = document.getElementById('command-recent');
    if (!box) return;
    const examples = ['inteligência + ocultismo dificuldade 7', 'força de vontade dificuldade 5', 'iniciativa', 'destreza mais briga', 'absorver 4 de dano letal'];
    const items = [...this.recent(), ...examples.filter(e => !this.recent().includes(e))].slice(0, 10);
    box.innerHTML = '';
    items.forEach(text => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'command-chip';
      b.textContent = text;
      b.addEventListener('click', () => {
        const input = document.getElementById('command-input');
        if (input) input.value = text;
        this.submit();
      });
      box.appendChild(b);
    });
  },

  listening: null,

  startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Este navegador não tem reconhecimento de voz. Use o microfone do teclado.', 'info'); return; }
    if (this.listening) { this.stopListening(); return; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const input = document.getElementById('command-input');
    const mic = document.getElementById('btn-command-mic');
    rec.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ');
      if (input) input.value = text;
      if (e.results[e.results.length - 1].isFinal) { this.stopListening(); this.submit(); }
    };
    rec.onerror = (e) => {
      this.stopListening();
      if (e.error !== 'aborted' && e.error !== 'no-speech') showToast('Não foi possível usar o microfone. Verifique a permissão do navegador.', 'danger');
    };
    rec.onend = () => this.stopListening();
    this.listening = rec;
    if (mic) { mic.classList.add('is-listening'); mic.textContent = '⏹'; }
    try { rec.start(); } catch (err) { this.stopListening(); }
  },

  stopListening() {
    const rec = this.listening;
    this.listening = null;
    if (rec) { try { rec.stop(); } catch (e) { /* ignora */ } }
    const mic = document.getElementById('btn-command-mic');
    if (mic) { mic.classList.remove('is-listening'); mic.textContent = '🎤'; }
  },

  bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('btn-open-command', 'click', () => this.open());
    on('btn-close-command', 'click', () => this.close());
    on('btn-command-run', 'click', () => this.submit());
    on('btn-command-mic', 'click', () => this.startListening());
    on('command-input', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.submit(); } });
    on('btn-copy-siri-url', 'click', () => copyTextToClipboard(`${this.baseUrl()}?rolar=`, 'Endereço copiado. Cole na ação “URL” do Atalho.'));
    const modal = document.getElementById('command-modal');
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) this.close(); });
      modal.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    }
    this.renderRecent();
  }
};

// =============================================================================
// 8j. ASSISTENTE DE CRIAÇÃO DE PERSONAGEM (V20)
// Passos: conceito e clã → Atributos 7/5/3 → Habilidades 13/9/5 → Vantagens
// → Características derivadas → Pontos de Bônus → Ficha final.
// =============================================================================
const APP_VERSION = '2.4';

const WIZ_ATTRS = {
  physical: { label: 'Físicos', keys: ['strength', 'dexterity', 'stamina'] },
  social: { label: 'Sociais', keys: ['charisma', 'manipulation', 'appearance'] },
  mental: { label: 'Mentais', keys: ['perception', 'intelligence', 'wits'] }
};
const WIZ_ABILS = {
  talents: { label: 'Talentos', keys: ['alertness', 'athletics', 'brawl', 'foresight', 'empathy', 'expression', 'intimidation', 'leadership', 'streetwise', 'subterfuge'] },
  skills: { label: 'Perícias', keys: ['animal_ken', 'crafts', 'drive', 'etiquette', 'firearms', 'melee', 'performance', 'larceny', 'stealth', 'survival'] },
  knowledges: { label: 'Conhecimentos', keys: ['academics', 'computer', 'finance', 'investigation', 'law', 'medicine', 'occult', 'politics', 'science', 'technology'] }
};
const WIZ_PRIORITY_POINTS = { attr: [7, 5, 3], abil: [13, 9, 5] };
const WIZ_PRIORITY_NAMES = ['Primária', 'Secundária', 'Terciária'];
const WIZ_VIRTUES = [
  { key: 'conscience', label: 'Consciência / Convicção' },
  { key: 'self_control', label: 'Autocontrole / Instinto' },
  { key: 'courage', label: 'Coragem' }
];
const WIZ_FREEBIE_COST = { attribute: 5, ability: 2, discipline: 7, background: 1, virtue: 2, humanity: 2, willpower: 1 };
const WIZ_ARCHETYPES = ['Arquiteto', 'Autocrata', 'Bon Vivant', 'Valentão', 'Capitalista', 'Cuidador', 'Celebrante', 'Camaleão',
  'Criança', 'Competidor', 'Conformista', 'Manipulador', 'Ranzinza', 'Diletante', 'Desviado', 'Diretor', 'Enigma',
  'Olho do Furacão', 'Fanático', 'Galante', 'Guru', 'Idealista', 'Juiz', 'Solitário', 'Mártir', 'Masoquista', 'Monstro',
  'Pedagogo', 'Penitente', 'Perfeccionista', 'Rebelde', 'Malandro', 'Sádico', 'Cientista', 'Sociopata', 'Soldado',
  'Sobrevivente', 'Aventureiro', 'Tradicionalista', 'Brincalhão', 'Visionário'];
const WIZ_BACKGROUNDS = ['Aliados', 'Contatos', 'Domínio', 'Fama', 'Geração', 'Influência', 'Lacaios', 'Mentor', 'Rebanho', 'Recursos', 'Status'];
const WIZ_CAITIFF_POOL = ['Animalismo', 'Auspícios', 'Celeridade', 'Dominação', 'Fortitude', 'Ofuscação', 'Potência', 'Presença'];
const WIZ_ATTR_LABELS = {
  strength: 'Força', dexterity: 'Destreza', stamina: 'Vigor', charisma: 'Carisma', manipulation: 'Manipulação',
  appearance: 'Aparência', perception: 'Percepção', intelligence: 'Inteligência', wits: 'Raciocínio'
};

/** Perfis de foco usados pela montagem automática (palavras-chave → pesos). */
const WIZ_FOCUS_PROFILES = [
  { name: 'Investigação', concept: 'Investigador', keys: ['investig', 'detetiv', 'pista', 'misteri', 'pesquis', 'informa', 'segredo'],
    nature: 'Perfeccionista', demeanor: 'Juiz',
    attrs: { perception: 3, wits: 2, intelligence: 2, manipulation: 1 },
    abil: { investigation: 5, alertness: 3, foresight: 2, academics: 2, streetwise: 2, occult: 2, empathy: 1, law: 1, subterfuge: 1 },
    discs: ['Auspícios', 'Dominação', 'Ofuscação', 'Taumaturgia'],
    bg: { Contatos: 3, Recursos: 1, Mentor: 1, Aliados: 1 }, virtues: { self_control: 1 } },
  { name: 'Combate à distância', concept: 'Atirador', keys: ['distancia', 'tiro', 'arma de fogo', 'armas de fogo', 'arqueir', 'arquearia', 'arco', 'besta', 'atirador', 'sniper', 'pistol', 'rifle'],
    nature: 'Soldado', demeanor: 'Solitário',
    attrs: { dexterity: 3, perception: 2, wits: 2, stamina: 1 },
    abil: { firearms: 4, athletics: 2, stealth: 2, alertness: 2, survival: 1, drive: 1 },
    discs: ['Celeridade', 'Auspícios', 'Fortitude', 'Taumaturgia'],
    bg: { Recursos: 1, Aliados: 1 }, virtues: { courage: 1 } },
  { name: 'Combate corpo a corpo', concept: 'Guerreiro', keys: ['corpo a corpo', 'briga', 'luta', 'combate corpo', 'combate fisico', 'guerreir', 'espada', 'soldado', 'brutal', 'capanga', 'cavaleir', 'machado', 'punho'],
    nature: 'Soldado', demeanor: 'Valentão',
    attrs: { strength: 3, dexterity: 2, stamina: 2, wits: 1 },
    abil: { brawl: 3, melee: 3, athletics: 2, intimidation: 2, alertness: 1 },
    discs: ['Potência', 'Celeridade', 'Fortitude', 'Metamorfose'],
    bg: { Aliados: 1, Rebanho: 1, Recursos: 1 }, virtues: { courage: 2 } },
  { name: 'Social e política', concept: 'Cortesão', keys: ['social', 'politic', 'diplom', 'sedu', 'manipul', 'corte', 'intriga', 'nobre', 'lider', 'negoci', 'harpia'],
    nature: 'Arquiteto', demeanor: 'Galante',
    attrs: { charisma: 3, manipulation: 3, appearance: 1, wits: 1 },
    abil: { etiquette: 3, subterfuge: 3, leadership: 2, empathy: 2, politics: 2, expression: 1 },
    discs: ['Presença', 'Dominação', 'Auspícios', 'Demência'],
    bg: { Status: 2, Influência: 2, Recursos: 1, Contatos: 1 }, virtues: { self_control: 1 } },
  { name: 'Ocultismo e rituais', concept: 'Ocultista', keys: ['ocult', 'magia', 'ritual', 'feitic', 'taumat', 'necrom', 'arcan', 'estud', 'sabio', 'erudit', 'bibliotec'],
    nature: 'Visionário', demeanor: 'Pedagogo',
    attrs: { intelligence: 3, wits: 2, perception: 1 },
    abil: { occult: 4, academics: 3, investigation: 1, foresight: 2, law: 1, science: 1 },
    discs: ['Taumaturgia', 'Necromancia', 'Auspícios', 'Tenebrosidade'],
    bg: { Mentor: 2, Recursos: 1, Contatos: 1 }, virtues: { self_control: 1 } },
  { name: 'Furtividade', concept: 'Infiltrador', keys: ['furtiv', 'infiltr', 'ladra', 'ladro', 'espia', 'espiao', 'assassin', 'sombra', 'roubo', 'gatun'],
    nature: 'Malandro', demeanor: 'Camaleão',
    attrs: { dexterity: 3, wits: 2, perception: 1 },
    abil: { stealth: 4, larceny: 3, streetwise: 2, athletics: 1, alertness: 2, subterfuge: 1 },
    discs: ['Ofuscação', 'Celeridade', 'Auspícios', 'Quietus'],
    bg: { Contatos: 2, Aliados: 1 } },
  { name: 'Sobrevivência', concept: 'Caçador', keys: ['sobreviv', 'selvag', 'cacad', 'rastre', 'natureza', 'animal', 'floresta'],
    nature: 'Sobrevivente', demeanor: 'Solitário',
    attrs: { stamina: 2, perception: 2, dexterity: 1, wits: 1 },
    abil: { survival: 4, animal_ken: 3, athletics: 2, stealth: 1, alertness: 2 },
    discs: ['Animalismo', 'Metamorfose', 'Fortitude', 'Ofuscação'],
    bg: { Rebanho: 1, Aliados: 1 }, virtues: { courage: 1 } },
  { name: 'Medicina e ciência', concept: 'Estudioso', keys: ['medic', 'cienc', 'cirurg', 'alquim', 'laborat'],
    nature: 'Cientista', demeanor: 'Cuidador',
    attrs: { intelligence: 3, dexterity: 1, perception: 1 },
    abil: { medicine: 4, science: 3, academics: 2, investigation: 1 },
    discs: ['Auspícios', 'Taumaturgia', 'Vicissitude', 'Fortitude'],
    bg: { Recursos: 2, Contatos: 1 } },
  { name: 'Dinheiro e comércio', concept: 'Mercador', keys: ['dinheiro', 'financ', 'comerc', 'mercad', 'rico', 'banqueir'],
    nature: 'Capitalista', demeanor: 'Conformista',
    attrs: { intelligence: 2, manipulation: 2, wits: 1 },
    abil: { finance: 4, larceny: 1, etiquette: 2, subterfuge: 2, law: 2, politics: 1 },
    discs: ['Presença', 'Dominação', 'Ofuscação'],
    bg: { Recursos: 3, Influência: 1, Contatos: 1 } },
  { name: 'Tecnologia', concept: 'Técnico', keys: ['tecnolog', 'hacker', 'computa', 'engenh', 'invent'],
    nature: 'Arquiteto', demeanor: 'Excêntrico',
    attrs: { intelligence: 3, wits: 2, dexterity: 1 },
    abil: { computer: 4, technology: 3, crafts: 2, science: 1, investigation: 1 },
    discs: ['Auspícios', 'Ofuscação', 'Taumaturgia'],
    bg: { Recursos: 2, Contatos: 1 } },
  { name: 'Artes', concept: 'Artista', keys: ['arte', 'music', 'perform', 'artista', 'poet', 'pintor', 'danc'],
    nature: 'Visionário', demeanor: 'Celebrante',
    attrs: { charisma: 2, appearance: 2, manipulation: 1 },
    abil: { performance: 4, expression: 3, crafts: 2, empathy: 2, etiquette: 1 },
    discs: ['Presença', 'Auspícios', 'Celeridade'],
    bg: { Fama: 2, Rebanho: 1, Recursos: 1 } }
];
const WIZ_DEFAULT_PROFILE = {
  name: 'Versátil', concept: 'Sobrevivente da noite', nature: 'Sobrevivente', demeanor: 'Camaleão',
  attrs: { dexterity: 1, perception: 1, wits: 1, stamina: 1, charisma: 1 },
  abil: { alertness: 2, athletics: 2, brawl: 1, investigation: 1, occult: 1, etiquette: 1, streetwise: 1, stealth: 1, empathy: 1 },
  discs: [], bg: { Recursos: 2, Contatos: 2, Rebanho: 1 }
};
const WIZ_NAMES = {
  v20: ['Helena Vasques', 'Rafael Monteiro', 'Livia Castelo', 'Daniel Arruda', 'Irene Salgado', 'Tomás Alencar'],
  da: ['Aymeric de Rouen', 'Isabeau de Lorraine', 'Gauthier le Noir', 'Mathilde de Blois', 'Thibault de Vaucresson', 'Aliénor de Valois']
};

const CharacterWizard = {
  step: 1,
  draft: null,
  mfQuery: '',

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  blank() {
    const zeros = keys => Object.fromEntries(keys.map(k => [k, 0]));
    return {
      name: '', player: '', chronicle: '', nature: '', demeanor: '', concept: '', sire: '', focus: '',
      clan: '', edition: EditionManager.edition(AppState.activeCharacter), generation: '13ª',
      attrOrder: ['physical', 'social', 'mental'],
      attrs: Object.fromEntries(Object.entries(WIZ_ATTRS).map(([c, d]) => [c, zeros(d.keys)])),
      abilOrder: ['talents', 'skills', 'knowledges'],
      abil: Object.fromEntries(Object.entries(WIZ_ABILS).map(([c, d]) => [c, zeros(d.keys)])),
      discMode: 'standard',
      genCaps: false,   // false = limite de criação (5 e 3); true = limite da Geração
      discs: {},
      caitiffDiscs: [],
      backgrounds: [],
      virtues: { conscience: 0, self_control: 0, courage: 0 },
      pathName: '',
      free: { attribute: {}, ability: {}, discipline: {}, background: {}, virtue: {}, humanity: 0, willpower: 0 },
      merits: [],
      flaws: []
    };
  },

  clanPreset() { return this.draft.clan ? findClanPreset(this.draft.clan) : null; },
  isCaitiff() { const p = this.clanPreset(); return !!(p && p.key === 'caitiff'); },
  isNosferatu() { const p = this.clanPreset(); return !!(p && p.key === 'nosferatu'); },

  clanDisciplines() {
    if (this.isCaitiff()) return this.draft.caitiffDiscs.slice(0, 3);
    const p = this.clanPreset();
    return p ? p.disciplines.slice() : [];
  },

  abilLabel(key, cat) {
    const ref = `abilities.${cat}.${key}`;
    if (this.draft.edition === 'da' && DARK_AGES_LABELS[ref]) return DARK_AGES_LABELS[ref];
    if (EditionManager._original && EditionManager._original[ref]) return EditionManager._original[ref];
    const row = document.querySelector(`.trait-row[data-trait="${ref}"]`);
    return row ? row.getAttribute('data-label') : key;
  },

  // Pontos por etapa
  attrBudget(cat) { return WIZ_PRIORITY_POINTS.attr[this.draft.attrOrder.indexOf(cat)]; },
  abilBudget(cat) { return WIZ_PRIORITY_POINTS.abil[this.draft.abilOrder.indexOf(cat)]; },
  sum(obj) { return Object.values(obj || {}).reduce((a, v) => a + (parseInt(v, 10) || 0), 0); },
  discBudget() { return this.draft.discMode === 'alt' ? 4 : 3; },
  bgBudget() { return this.draft.discMode === 'alt' ? 0 : 5; },
  bgSpent() { return this.draft.backgrounds.reduce((a, b) => a + (b.dots || 0), 0); },

  /** Limite de pontos da Geração escolhida (13ª = 5, 8ª = 5, 6ª = 7, 4ª = 9...). */
  genMax() { return getGenerationRule(this.draft.generation).maxTrait; },

  /** Regra de criação: 5 em Atributos e 3 em Habilidades. Com a opção ligada, vale o limite da Geração. */
  useGenCaps() { return !!this.draft.genCaps; },
  attrCap(key) {
    if (key === 'appearance' && this.isNosferatu()) return 0;
    return this.useGenCaps() ? Math.max(5, this.genMax()) : 5;
  },
  abilCap() { return this.useGenCaps() ? Math.max(3, this.genMax()) : 3; },
  advCap() { return this.useGenCaps() ? Math.max(5, this.genMax()) : 5; },

  attrBase(key) { return key === 'appearance' && this.isNosferatu() ? 0 : 1; },
  attrValue(cat, key, withFree = true) {
    const base = this.attrBase(key) + (this.draft.attrs[cat][key] || 0);
    return base + (withFree ? (this.draft.free.attribute[`${cat}.${key}`] || 0) : 0);
  },
  abilValue(cat, key, withFree = true) {
    return (this.draft.abil[cat][key] || 0) + (withFree ? (this.draft.free.ability[`${cat}.${key}`] || 0) : 0);
  },
  discValue(name, withFree = true) {
    return (this.draft.discs[name] || 0) + (withFree ? (this.draft.free.discipline[name] || 0) : 0);
  },
  bgValue(bg, withFree = true) {
    return (bg.dots || 0) + (withFree ? (this.draft.free.background[bg.name] || 0) : 0);
  },
  virtueValue(key, withFree = true) {
    return 1 + (this.draft.virtues[key] || 0) + (withFree ? (this.draft.free.virtue[key] || 0) : 0);
  },

  /** Passo 5: Humanidade = Consciência + Autocontrole; FV = Coragem (antes dos Pontos de Bônus). */
  derived() {
    const humanity = this.virtueValue('conscience', false) + this.virtueValue('self_control', false);
    const willpower = this.virtueValue('courage', false);
    const rule = getGenerationRule(this.draft.generation);
    return {
      humanity, willpower,
      humanityFinal: Math.min(10, humanity + (this.draft.free.humanity || 0)),
      willpowerFinal: Math.min(10, willpower + (this.draft.free.willpower || 0)),
      blood: rule.maxBlood, perTurn: rule.bloodPerTurn, rule
    };
  },

  flawPoints() { return Math.min(7, this.draft.flaws.reduce((a, f) => a + (parseInt(f.points, 10) || 0), 0)); },
  meritPoints() { return this.draft.merits.reduce((a, m) => a + (parseInt(m.points, 10) || 0), 0); },
  freebieBudget() { return 15 + this.flawPoints(); },

  /** Cada ponto de bônus gasto, com o custo. */
  freebieLedger() {
    const d = this.draft;
    const out = [];
    Object.entries(d.free.attribute).forEach(([k, n]) => { if (n) { const key = k.split('.')[1]; out.push({ what: `Atributo ${WIZ_ATTR_LABELS[key]}`, dots: n, unit: 5 }); } });
    Object.entries(d.free.ability).forEach(([k, n]) => { if (n) { const [cat, key] = k.split('.'); out.push({ what: `Habilidade ${this.abilLabel(key, cat)}`, dots: n, unit: 2 }); } });
    Object.entries(d.free.discipline).forEach(([k, n]) => { if (n) out.push({ what: `Disciplina ${k}`, dots: n, unit: 7 }); });
    Object.entries(d.free.background).forEach(([k, n]) => { if (n) out.push({ what: `Antecedente ${k}`, dots: n, unit: 1 }); });
    Object.entries(d.free.virtue).forEach(([k, n]) => { if (n) out.push({ what: `Virtude ${WIZ_VIRTUES.find(v => v.key === k).label}`, dots: n, unit: 2 }); });
    if (d.free.humanity) out.push({ what: 'Humanidade/Trilha', dots: d.free.humanity, unit: 2 });
    if (d.free.willpower) out.push({ what: 'Força de Vontade', dots: d.free.willpower, unit: 1 });
    d.merits.forEach(m => out.push({ what: `Qualidade ${m.name}`, dots: 1, unit: parseInt(m.points, 10) || 0, merit: true }));
    return out.map(e => ({ ...e, cost: e.dots * e.unit }));
  },
  freebieSpent() { return this.freebieLedger().reduce((a, e) => a + e.cost, 0); },

  // ---------------------------------------------------------------------------
  // Validação
  // ---------------------------------------------------------------------------
  /** Ao voltar para o limite de criação, devolve o que passou do teto. */
  trimToCaps() {
    const d = this.draft;
    Object.keys(WIZ_ATTRS).forEach(c => WIZ_ATTRS[c].keys.forEach(k => {
      const cap = Math.max(0, this.attrCap(k) - this.attrBase(k));
      if (d.attrs[c][k] > cap) d.attrs[c][k] = cap;
      const fk = `${c}.${k}`;
      if (d.free.attribute[fk] && this.attrValue(c, k) > this.attrCap(k)) {
        d.free.attribute[fk] = Math.max(0, this.attrCap(k) - this.attrValue(c, k, false));
        if (!d.free.attribute[fk]) delete d.free.attribute[fk];
      }
    }));
    Object.keys(WIZ_ABILS).forEach(c => WIZ_ABILS[c].keys.forEach(k => {
      if (d.abil[c][k] > this.abilCap()) d.abil[c][k] = this.abilCap();
      const fk = `${c}.${k}`;
      if (d.free.ability[fk] && this.abilValue(c, k) > this.advCap()) {
        d.free.ability[fk] = Math.max(0, this.advCap() - this.abilValue(c, k, false));
        if (!d.free.ability[fk]) delete d.free.ability[fk];
      }
    }));
    Object.keys(d.discs).forEach(n => { if (d.discs[n] > this.advCap()) d.discs[n] = this.advCap(); });
  },

  problems(step) {
    const d = this.draft;
    const p = [];
    if (step === 1) {
      if (!d.name.trim()) p.push('Dê um nome ao personagem.');
      if (!d.clan) p.push('Escolha o clã.');
      if (this.isCaitiff() && d.caitiffDiscs.length !== 3) p.push('Caitiff: escolha 3 Disciplinas para começar.');
    }
    if (step === 2) {
      Object.keys(WIZ_ATTRS).forEach(c => {
        const spent = this.sum(d.attrs[c]);
        const budget = this.attrBudget(c);
        if (spent !== budget) p.push(`${WIZ_ATTRS[c].label}: ${spent} de ${budget} pontos.`);
      });
    }
    if (step === 3) {
      Object.keys(WIZ_ABILS).forEach(c => {
        const spent = this.sum(d.abil[c]);
        const budget = this.abilBudget(c);
        if (spent !== budget) p.push(`${WIZ_ABILS[c].label}: ${spent} de ${budget} pontos.`);
      });
    }
    if (step === 4) {
      const ds = this.sum(d.discs);
      if (ds !== this.discBudget()) p.push(`Disciplinas: ${ds} de ${this.discBudget()} pontos.`);
      if (this.bgSpent() !== this.bgBudget()) p.push(`Antecedentes: ${this.bgSpent()} de ${this.bgBudget()} pontos.`);
      if (d.backgrounds.some(b => b.dots > 0 && !b.name.trim())) p.push('Dê nome a todos os Antecedentes.');
      const vs = this.sum(d.virtues);
      if (vs !== 7) p.push(`Virtudes: ${vs} de 7 pontos.`);
    }
    if (step === 6) {
      const spent = this.freebieSpent();
      const budget = this.freebieBudget();
      if (spent > budget) p.push(`Pontos de Bônus: ${spent} gastos, mas só há ${budget}.`);
      const rawFlaws = d.flaws.reduce((a, f) => a + (parseInt(f.points, 10) || 0), 0);
      if (rawFlaws > 7) p.push(`Defeitos somam ${rawFlaws}; só 7 contam como bônus.`);
    }
    return p;
  },

  // ---------------------------------------------------------------------------
  // Montagem automática pelo foco
  // ---------------------------------------------------------------------------
  matchProfiles(focus) {
    const f = stripAccents(String(focus || '').toLowerCase());
    const hits = WIZ_FOCUS_PROFILES.filter(p => p.keys.some(k => f.includes(k)));
    // "combate" sozinho (sem dizer à distância) vira corpo a corpo
    if (/combate|combat/.test(f) && !hits.some(p => /Combate/.test(p.name))) {
      hits.push(WIZ_FOCUS_PROFILES.find(p => p.name === 'Combate corpo a corpo'));
    }
    return hits.length ? hits : [WIZ_DEFAULT_PROFILE];
  },

  /** Distribui "points" entre chaves conforme o peso, com teto por chave. */
  spread(points, keys, weightOf, cap, base = 0.3) {
    const alloc = Object.fromEntries(keys.map(k => [k, 0]));
    let left = points;
    let guard = 0;
    while (left > 0 && guard++ < 500) {
      let best = null;
      let bestScore = -1;
      keys.forEach((k, i) => {
        if (alloc[k] >= cap(k)) return;
        const score = (weightOf(k) + base) / Math.pow(alloc[k] + 1, 1.5) - i * 0.0001;
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (!best) break;
      alloc[best]++;
      left--;
    }
    return alloc;
  },

  autoBuild() {
    const d = this.draft;
    if (!d.clan) { showToast('Escolha o clã antes de montar automaticamente.', 'danger'); return; }
    const profiles = this.matchProfiles(d.focus);
    const W = { attrs: {}, abil: {}, bg: {}, virtues: {}, discs: [] };
    profiles.forEach(p => {
      Object.entries(p.attrs || {}).forEach(([k, v]) => { W.attrs[k] = (W.attrs[k] || 0) + v; });
      Object.entries(p.abil || {}).forEach(([k, v]) => { W.abil[k] = (W.abil[k] || 0) + v; });
      Object.entries(p.bg || {}).forEach(([k, v]) => { W.bg[k] = (W.bg[k] || 0) + v; });
      Object.entries(p.virtues || {}).forEach(([k, v]) => { W.virtues[k] = (W.virtues[k] || 0) + v; });
      (p.discs || []).forEach(x => { if (!W.discs.includes(x)) W.discs.push(x); });
    });

    // Nome, Natureza, Comportamento, Conceito
    if (!d.name.trim()) {
      const pool = WIZ_NAMES[d.edition === 'da' ? 'da' : 'v20'];
      d.name = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!d.concept.trim()) d.concept = profiles.map(p => p.concept).join(' e ');
    if (!d.nature.trim()) d.nature = profiles[0].nature;
    if (!d.demeanor.trim()) d.demeanor = (profiles[1] || profiles[0]).demeanor;

    // Passo 2: prioridade = soma dos pesos por categoria
    const catScore = (defs, weights) => Object.keys(defs)
      .map(c => [c, defs[c].keys.reduce((a, k) => a + (weights[k] || 0), 0)])
      .sort((a, b) => b[1] - a[1]).map(x => x[0]);
    d.attrOrder = catScore(WIZ_ATTRS, W.attrs);
    Object.keys(WIZ_ATTRS).forEach(c => {
      const keys = WIZ_ATTRS[c].keys.slice().sort((a, b) => (W.attrs[b] || 0) - (W.attrs[a] || 0));
      d.attrs[c] = this.spread(this.attrBudget(c), keys, k => W.attrs[k] || 0,
        k => Math.max(0, this.attrCap(k) - this.attrBase(k)), 0.6);
    });

    // Passo 3
    d.abilOrder = catScore(WIZ_ABILS, W.abil);
    Object.keys(WIZ_ABILS).forEach(c => {
      const keys = WIZ_ABILS[c].keys.slice().sort((a, b) => (W.abil[b] || 0) - (W.abil[a] || 0));
      d.abil[c] = this.spread(this.abilBudget(c), keys, k => W.abil[k] || 0, () => this.abilCap(), 0.25);
    });

    // Passo 4: Disciplinas do clã na ordem do foco
    if (this.isCaitiff()) {
      d.caitiffDiscs = [...W.discs.filter(x => WIZ_CAITIFF_POOL.includes(x)), ...WIZ_CAITIFF_POOL]
        .filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3);
    }
    const clanDiscs = this.clanDisciplines();
    const rank = name => { const i = W.discs.findIndex(x => sameDiscipline(x, name)); return i < 0 ? 99 : i; };
    const ordered = clanDiscs.slice().sort((a, b) => rank(a) - rank(b));
    // Magia de sangue é a identidade de Tremere e Giovanni: pelo menos 1 ponto
    const signature = { tremere: 'Taumaturgia', giovanni: 'Necromancia' }[(this.clanPreset() || {}).key];
    const sigIdx = signature ? ordered.findIndex(x => sameDiscipline(x, signature)) : -1;
    if (sigIdx > 1) { const [sig] = ordered.splice(sigIdx, 1); ordered.splice(1, 0, sig); }
    d.discs = {};
    const pattern = d.discMode === 'alt' ? [2, 1, 1] : [2, 1, 0];
    ordered.forEach((name, i) => { if (pattern[i]) d.discs[name] = pattern[i]; });

    // Antecedentes
    d.backgrounds = [];
    if (this.bgBudget() > 0) {
      const names = Object.keys(W.bg).length ? Object.keys(W.bg) : Object.keys(WIZ_DEFAULT_PROFILE.bg);
      const weights = Object.keys(W.bg).length ? W.bg : WIZ_DEFAULT_PROFILE.bg;
      names.sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
      const alloc = this.spread(this.bgBudget(), names, k => weights[k] || 0, () => 5, 0.2);
      names.forEach(n => { if (alloc[n]) d.backgrounds.push({ name: n, dots: alloc[n] }); });
    }

    // Virtudes (7 pontos)
    d.virtues = this.spread(7, ['self_control', 'conscience', 'courage'], k => 1 + (W.virtues[k] || 0) * 0.5, () => 4, 0);

    // Passo 6: 15 pontos de bônus
    d.free = { attribute: {}, ability: {}, discipline: {}, background: {}, virtue: {}, humanity: 0, willpower: 0 };
    d.merits = [];
    d.flaws = [];
    let left = 15;
    const top = ordered[0];
    if (top && this.discValue(top) < 5 && left >= 7) { d.free.discipline[top] = 1; left -= 7; }
    // A Habilidade principal de cada foco primeiro; depois as de maior peso geral
    const perProfile = profiles.map(p => Object.entries(p.abil || {}).sort((a, b) => b[1] - a[1]).map(x => x[0])[0]).filter(Boolean);
    const topAbils = [...perProfile, ...Object.entries(W.abil).sort((a, b) => b[1] - a[1]).map(x => x[0])]
      .filter((k, i, arr) => arr.indexOf(k) === i);
    let boosted = 0;
    for (const key of topAbils) {
      if (boosted >= 2 || left < 2) break;
      const cat = Object.keys(WIZ_ABILS).find(c => WIZ_ABILS[c].keys.includes(key));
      if (!cat || this.abilValue(cat, key) >= 5) continue;
      d.free.ability[`${cat}.${key}`] = 1;
      left -= 2;
      boosted++;
    }
    if (left >= 2 && d.backgrounds.length) {
      d.free.background[d.backgrounds[0].name] = 2;
      left -= 2;
    }
    const wpRoom = 10 - this.derived().willpower;
    const wp = Math.min(left, wpRoom);
    d.free.willpower = wp;
    left -= wp;
    while (left >= 2 && this.derived().humanityFinal < 10) { d.free.humanity++; left -= 2; }

    this.step = 7;
    this.render();
    showToast(`✨ Ficha montada para: ${profiles.map(p => p.name).join(' + ')}. Revise cada passo com “Voltar”.`, 'success');
  },

  // ---------------------------------------------------------------------------
  // Relatório (passo a passo com a matemática)
  // ---------------------------------------------------------------------------
  report() {
    const d = this.draft;
    const L = [];
    const clan = this.clanPreset();
    const der = this.derived();
    L.push(`=== CRIAÇÃO DE PERSONAGEM (V20) · Ficha v${APP_VERSION} ===`);
    L.push('');
    L.push('PASSO 1 · Conceito e Clã');
    L.push(`Nome: ${d.name} | Natureza: ${d.nature || '—'} | Comportamento: ${d.demeanor || '—'} | Conceito: ${d.concept || '—'}`);
    L.push(`Clã: ${clan ? clan.name : '—'} | Disciplinas do clã: ${this.clanDisciplines().join(', ') || '—'}`);
    L.push(`Geração: ${d.generation} (escolhida livremente, sem depender do Antecedente Geração)${d.focus ? ` | Foco: ${d.focus}` : ''}`);
    L.push('');
    L.push('PASSO 2 · Atributos (7/5/3, todos começam em 1)');
    d.attrOrder.forEach((c, i) => {
      const items = WIZ_ATTRS[c].keys.map(k => `${WIZ_ATTR_LABELS[k]} ${this.attrBase(k)}+${d.attrs[c][k]}=${this.attrValue(c, k, false)}`);
      L.push(`${WIZ_ATTRS[c].label} (${WIZ_PRIORITY_NAMES[i]}, ${this.attrBudget(c)}): ${items.join(', ')} → ${WIZ_ATTRS[c].keys.map(k => d.attrs[c][k]).join(' + ')} = ${this.sum(d.attrs[c])}`);
    });
    L.push('');
    L.push('PASSO 3 · Habilidades (13/9/5, começam em 0, máximo 3)');
    d.abilOrder.forEach((c, i) => {
      const used = WIZ_ABILS[c].keys.filter(k => d.abil[c][k]);
      L.push(`${WIZ_ABILS[c].label} (${WIZ_PRIORITY_NAMES[i]}, ${this.abilBudget(c)}): ${used.map(k => `${this.abilLabel(k, c)} ${d.abil[c][k]}`).join(', ') || '—'} → ${used.map(k => d.abil[c][k]).join(' + ') || 0} = ${this.sum(d.abil[c])}`);
    });
    L.push('');
    L.push(`PASSO 4 · Vantagens (${d.discMode === 'alt' ? '4 em Disciplinas, sem Antecedentes' : '3 em Disciplinas + 5 em Antecedentes'})`);
    const dList = Object.entries(d.discs).filter(([, v]) => v);
    L.push(`Disciplinas (${this.discBudget()}): ${dList.map(([k, v]) => `${k} ${v}`).join(', ') || '—'} → ${dList.map(([, v]) => v).join(' + ') || 0} = ${this.sum(d.discs)}`);
    if (this.bgBudget()) {
      L.push(`Antecedentes (5): ${d.backgrounds.filter(b => b.dots).map(b => `${b.name} ${b.dots}`).join(', ') || '—'} → ${d.backgrounds.filter(b => b.dots).map(b => b.dots).join(' + ') || 0} = ${this.bgSpent()}`);
    }
    L.push(`Virtudes (7, começam em 1): ${WIZ_VIRTUES.map(v => `${v.label} 1+${d.virtues[v.key]}=${this.virtueValue(v.key, false)}`).join(', ')} → ${WIZ_VIRTUES.map(v => d.virtues[v.key]).join(' + ')} = ${this.sum(d.virtues)}`);
    L.push('');
    L.push('PASSO 5 · Características derivadas');
    L.push(`Humanidade/Trilha = Consciência ${this.virtueValue('conscience', false)} + Autocontrole ${this.virtueValue('self_control', false)} = ${der.humanity}`);
    L.push(`Força de Vontade = Coragem = ${der.willpower}`);
    L.push(`Reserva de Sangue (${d.generation}) = ${der.blood} pontos, gasto de até ${der.perTurn} por turno`);
    L.push('');
    const ledger = this.freebieLedger();
    L.push(`PASSO 6 · Pontos de Bônus (15${this.flawPoints() ? ` + ${this.flawPoints()} de Defeitos = ${this.freebieBudget()}` : ''})`);
    if (d.flaws.length) L.push(`Defeitos: ${d.flaws.map(f => `${f.name} (${f.points})`).join(', ')}`);
    ledger.forEach(e => {
      L.push(e.merit ? `• ${e.what}: ${e.cost} pts` : `• ${e.what}: ${e.dots} × ${e.unit} = ${e.cost} pts`);
    });
    const spent = this.freebieSpent();
    L.push(`Total: ${ledger.map(e => e.cost).join(' + ') || 0} = ${spent} de ${this.freebieBudget()}${spent < this.freebieBudget() ? ` (sobram ${this.freebieBudget() - spent})` : ''}`);
    L.push('');
    L.push('PASSO 7 · Ficha final');
    L.push(`${d.name} · ${clan ? clan.name : ''} · ${d.generation} Geração · ${d.concept || ''}`);
    L.push(`Físicos: ${WIZ_ATTRS.physical.keys.map(k => `${WIZ_ATTR_LABELS[k]} ${this.attrValue('physical', k)}`).join(', ')}`);
    L.push(`Sociais: ${WIZ_ATTRS.social.keys.map(k => `${WIZ_ATTR_LABELS[k]} ${this.attrValue('social', k)}`).join(', ')}`);
    L.push(`Mentais: ${WIZ_ATTRS.mental.keys.map(k => `${WIZ_ATTR_LABELS[k]} ${this.attrValue('mental', k)}`).join(', ')}`);
    Object.keys(WIZ_ABILS).forEach(c => {
      const items = WIZ_ABILS[c].keys.filter(k => this.abilValue(c, k)).map(k => `${this.abilLabel(k, c)} ${this.abilValue(c, k)}`);
      L.push(`${WIZ_ABILS[c].label}: ${items.join(', ') || '—'}`);
    });
    L.push(`Disciplinas: ${this.clanDisciplines().filter(n => this.discValue(n)).map(n => `${n} ${this.discValue(n)}`).join(', ') || '—'}`);
    L.push(`Antecedentes: ${d.backgrounds.filter(b => this.bgValue(b)).map(b => `${b.name} ${this.bgValue(b)}`).join(', ') || '—'}`);
    L.push(`Virtudes: ${WIZ_VIRTUES.map(v => `${v.label} ${this.virtueValue(v.key)}`).join(', ')}`);
    L.push(`${this.pathLabel()} ${der.humanityFinal} · Força de Vontade ${der.willpowerFinal} · Sangue ${der.blood}/${der.blood}`);
    if (d.merits.length || d.flaws.length) {
      L.push(`Qualidades: ${d.merits.map(m => `${m.name} (${m.points})`).join(', ') || '—'} | Defeitos: ${d.flaws.map(f => `${f.name} (${f.points})`).join(', ') || '—'}`);
    }
    if (clan && clan.weakness) L.push(`Fraqueza: ${clan.weakness}`);
    return L.join('\n');
  },

  pathLabel() {
    if (this.draft.pathName.trim()) return this.draft.pathName.trim();
    return this.draft.edition === 'da' ? 'Estrada da Humanidade' : 'Humanidade';
  },

  // ---------------------------------------------------------------------------
  // Criar a ficha
  // ---------------------------------------------------------------------------
  async finish() {
    const d = this.draft;
    for (let s = 1; s <= 6; s++) {
      const p = this.problems(s);
      if (p.length) { this.step = s; this.render(); showToast(`Passo ${s}: ${p[0]}`, 'danger'); return; }
    }
    const left = this.freebieBudget() - this.freebieSpent();
    if (left > 0) {
      const ok = await GothicDialog.confirm({
        title: 'Sobraram Pontos de Bônus',
        message: `Ainda há ${left} ponto(s) de bônus. Criar a ficha mesmo assim? (Eles ficam anotados no relatório.)`,
        confirmLabel: 'Criar mesmo assim'
      });
      if (!ok) return;
    }

    const ch = createBlankCharacter(d.name.trim());
    const clan = this.clanPreset();
    const der = this.derived();
    Object.assign(ch.header, {
      player: d.player, chronicle: d.chronicle, nature: d.nature, demeanor: d.demeanor,
      concept: d.concept, sire: d.sire, clan: clan ? clan.name : d.clan, generation: d.generation
    });
    if (!ch.settings) ch.settings = {};
    ch.settings.edition = d.edition;
    ch.settings.autoDerived = false;

    Object.keys(WIZ_ATTRS).forEach(c => WIZ_ATTRS[c].keys.forEach(k => { ch.attributes[c][k] = this.attrValue(c, k); }));
    Object.keys(WIZ_ABILS).forEach(c => WIZ_ABILS[c].keys.forEach(k => { ch.abilities[c][k] = this.abilValue(c, k); }));
    ch.disciplines = this.clanDisciplines().map(name => ({ id: generateUniqueId(), name, level: this.discValue(name), inClan: true }));
    ch.backgrounds = d.backgrounds.filter(b => this.bgValue(b) > 0).map(b => ({ id: generateUniqueId(), name: b.name.trim(), level: this.bgValue(b) }));
    ch.specializations = [];
    ch.virtues = { conscience: this.virtueValue('conscience'), self_control: this.virtueValue('self_control'), courage: this.virtueValue('courage') };
    ch.status.humanity = der.humanityFinal;
    ch.status.path_name = this.pathLabel();
    ch.status.willpower_perm = der.willpowerFinal;
    ch.status.willpower_temp = Array(10).fill(false);
    ch.status.blood_pool = Array.from({ length: der.blood }, () => true);
    ch.health = {};
    ch.xp = { total: 0, spent: 0 };

    // Magia de sangue: Trilha principal no nível da Disciplina; ritual de nível 1 grátis
    const thaum = ch.disciplines.find(x => /taumaturgia|thaumaturgy/i.test(x.name));
    const necro = ch.disciplines.find(x => /necromancia|necromancy/i.test(x.name));
    ch.paths = [];
    if (thaum && thaum.level) ch.paths.push({ id: generateUniqueId(), name: 'Trilha do Sangue (principal)', level: thaum.level, xpPrimary: true });
    if (necro && necro.level) ch.paths.push({ id: generateUniqueId(), name: 'Trilha do Sepulcro (principal)', level: necro.level, xpPrimary: true });
    if (!(thaum && thaum.level) && !(necro && necro.level)) ch.rituals_list = [];

    const cat = typeof MERITS_FLAWS_DATA !== 'undefined' ? MERITS_FLAWS_DATA : [];
    const mf = (item, type) => {
      const src = cat.find(x => x.name === item.name && x.type === type) || {};
      return { id: generateUniqueId(), type, category: src.category || 'fisica', name: item.name, points: parseInt(item.points, 10) || 0, range: src.points || String(item.points), desc: src.desc || '', source: item.custom ? 'Criado na ficha' : (src.source || '') };
    };
    ch.merits_flaws_list = [...d.merits.map(m => mf(m, 'qualidade')), ...d.flaws.map(f => mf(f, 'defeito'))];

    if (!ch.notes) ch.notes = {};
    if (clan && clan.weakness) ch.notes.weakness = clan.weakness;
    ch.notes.markdown = `## Criação do personagem\n\n\`\`\`\n${this.report()}\n\`\`\`\n`;
    if (d.focus) ch.notes.goals = `Foco: ${d.focus}`;

    const parsed = JSON.parse(JSON.stringify(ch));
    normalizeCharacter(parsed);
    AppState.addCharacter(parsed);
    UIRenderer.updateDropdown();
    UIRenderer.renderAll();
    this.close();
    showToast(`🧛 ${parsed.header.name} criado(a) com as regras do V20. O relatório completo está nas Anotações (Página 2).`, 'success');
  },

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  open({ firstRun = false } = {}) {
    this.firstRun = firstRun;
    this.draft = this.blank();
    this.step = 1;
    this.mfQuery = '';
    const m = document.getElementById('wizard-modal');
    if (!m) return;
    m.classList.remove('hidden');
    this.render();
    setTimeout(() => { const f = document.getElementById('wiz-name'); if (f) f.focus(); }, 40);
  },

  close() {
    const m = document.getElementById('wizard-modal');
    if (m) m.classList.add('hidden');
    if (this.firstRun) {
      this.firstRun = false;
      showToast('Ficha em branco pronta. O assistente fica no botão ➕ Novo quando quiser.', 'info');
    }
  },

  go(step) {
    if (step > this.step) {
      for (let s = this.step; s < step; s++) {
        const p = this.problems(s);
        if (p.length) {
          showToast(`Antes de avançar: ${p.join(' ')}`, 'danger');
          this.render();
          return;
        }
      }
    }
    this.step = Math.max(1, Math.min(7, step));
    this.render();
    const body = document.getElementById('wizard-body');
    if (body) body.scrollTop = 0;
  },

  esc(v) { return escapeHtml(String(v == null ? '' : v)); },

  dots(value, max, freeFrom = null) {
    let html = '<span class="wiz-dots" aria-hidden="true">';
    for (let i = 1; i <= max; i++) {
      const cls = i <= value ? (freeFrom !== null && i > freeFrom ? 'is-free' : 'is-on') : '';
      html += `<span class="wiz-dot ${cls}"></span>`;
    }
    return `${html}</span>`;
  },

  stepper(action, id, value, max, label, { min = 0, freeFrom = null, disabledPlus = false, disabledMinus = false } = {}) {
    return `<div class="wiz-trait">
      <span class="wiz-trait-name">${this.esc(label)}</span>
      ${this.dots(value, max, freeFrom)}
      <span class="wiz-trait-val">${value}</span>
      <button type="button" class="wiz-step-btn" data-act="${action}" data-id="${this.esc(id)}" data-delta="-1" aria-label="Diminuir ${this.esc(label)}" ${disabledMinus || value <= min ? 'disabled' : ''}>−</button>
      <button type="button" class="wiz-step-btn" data-act="${action}" data-id="${this.esc(id)}" data-delta="1" aria-label="Aumentar ${this.esc(label)}" ${disabledPlus || value >= max ? 'disabled' : ''}>＋</button>
    </div>`;
  },

  counter(spent, budget) {
    const cls = spent === budget ? 'is-ok' : spent > budget ? 'is-over' : 'is-left';
    return `<span class="wiz-counter ${cls}">${spent}/${budget}</span>`;
  },

  priorityPicker(kind, order, defs) {
    return `<div class="wiz-priority">${order.map((c, i) => `
      <label class="wiz-priority-item"><span>${WIZ_PRIORITY_NAMES[i]} (${WIZ_PRIORITY_POINTS[kind][i]})</span>
        <select data-act="${kind}-order" data-slot="${i}">
          ${Object.keys(defs).map(k => `<option value="${k}" ${k === c ? 'selected' : ''}>${defs[k].label}</option>`).join('')}
        </select></label>`).join('')}</div>`;
  },

  renderStep() {
    const d = this.draft;
    const clan = this.clanPreset();
    const s = this.step;
    if (s === 1) {
      const groups = [{ label: 'Clãs', key: 'clan' }, { label: 'Linhagens', key: 'bloodline' }, { label: 'Sem clã', key: 'other' }];
      const gens = ['3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª', '13ª', '14ª', '15ª'];
      return `
        <h4 class="wiz-title">Passo 1 · Conceito e Clã</h4>
        <div class="wiz-grid">
          <label>Nome <input id="wiz-name" data-field="name" value="${this.esc(d.name)}" placeholder="Nome do personagem"></label>
          <label>Jogador <input data-field="player" value="${this.esc(d.player)}"></label>
          <label>Natureza <input data-field="nature" list="wiz-archetypes" value="${this.esc(d.nature)}" placeholder="Arquétipo íntimo"></label>
          <label>Comportamento <input data-field="demeanor" list="wiz-archetypes" value="${this.esc(d.demeanor)}" placeholder="Máscara social"></label>
          <label>Conceito <input data-field="concept" value="${this.esc(d.concept)}" placeholder="ex.: Detetive particular"></label>
          <label>Crônica <input data-field="chronicle" value="${this.esc(d.chronicle)}"></label>
          <label>Edição
            <select data-field="edition"><option value="v20" ${d.edition === 'v20' ? 'selected' : ''}>V20</option><option value="da" ${d.edition === 'da' ? 'selected' : ''}>Dark Ages 20</option></select></label>
          <label>Geração
            <select data-field="generation">${gens.map(g => `<option value="${g}" ${g === d.generation ? 'selected' : ''}>${g} · ${GENERATION_RULES[g].maxBlood} PS</option>`).join('')}</select></label>
        </div>
        <datalist id="wiz-archetypes">${WIZ_ARCHETYPES.map(a => `<option value="${a}">`).join('')}</datalist>
        <label class="wiz-block">Clã
          <select data-field="clan"><option value="">Escolha um clã…</option>
            ${groups.map(g => `<optgroup label="${g.label}">${CLAN_PRESETS.filter(c => c.group === g.key).map(c => `<option value="${c.key}" ${c.key === d.clan ? 'selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('')}
          </select></label>
        ${clan ? `<div class="wiz-clan-box">
          <p><strong>Disciplinas de clã:</strong> ${this.isCaitiff() ? 'nenhuma fixa. Escolha 3 abaixo.' : clan.disciplines.map(x => `<span class="wiz-tag">${this.esc(x)}</span>`).join(' ')}</p>
          ${this.isCaitiff() ? `<div class="wiz-caitiff">${WIZ_CAITIFF_POOL.map(x => `<label><input type="checkbox" data-act="caitiff" value="${x}" ${d.caitiffDiscs.includes(x) ? 'checked' : ''}> ${x}</label>`).join('')}</div>` : ''}
          <p class="wiz-weakness"><strong>Fraqueza:</strong> ${this.esc(clan.weakness || '')}</p>
          ${this.isNosferatu() ? '<p class="wiz-note">Nosferatu: Aparência fica em 0 e não recebe pontos.</p>' : ''}
        </div>` : ''}
        <p class="wiz-note">A Geração é livre desde o início: não precisa do Antecedente Geração.</p>
        <div class="wiz-auto">
          <label>Foco do personagem (para montar automaticamente)
            <input data-field="focus" value="${this.esc(d.focus)}" placeholder="ex.: investigação e combate à distância"></label>
          <label class="wiz-inline"><input type="checkbox" data-field="discMode" ${d.discMode === 'alt' ? 'checked' : ''}> Usar 4 pontos em Disciplinas (sem os 5 de Antecedentes)</label>
          <label class="wiz-inline"><input type="checkbox" data-field="genCaps" ${d.genCaps ? 'checked' : ''}> Limite da Geração ligado: Atributos e Habilidades podem passar de 5 e 3, até ${this.genMax()} (padrão: limite de criação, 5 e 3)</label>
          <button type="button" class="btn btn-outline" data-act="auto">✨ Montar tudo pelo foco</button>
        </div>`;
    }
    if (s === 2) {
      return `
        <h4 class="wiz-title">Passo 2 · Atributos (7/5/3)</h4>
        <p class="wiz-note">Todos começam em 1. Escolha a prioridade e distribua os pontos (máximo ${this.attrCap('strength')} por Atributo${this.useGenCaps() ? `, pelo limite da ${this.draft.generation} Geração` : ', pela regra de criação'}).</p>
        ${this.priorityPicker('attr', d.attrOrder, WIZ_ATTRS)}
        <div class="wiz-cols">${d.attrOrder.map(c => `
          <div class="wiz-col"><h5>${WIZ_ATTRS[c].label} ${this.counter(this.sum(d.attrs[c]), this.attrBudget(c))}</h5>
            ${WIZ_ATTRS[c].keys.map(k => this.stepper('attr', `${c}.${k}`, this.attrValue(c, k, false), this.attrCap(k), WIZ_ATTR_LABELS[k],
              { min: this.attrBase(k), disabledPlus: this.sum(d.attrs[c]) >= this.attrBudget(c) })).join('')}
          </div>`).join('')}</div>`;
    }
    if (s === 3) {
      return `
        <h4 class="wiz-title">Passo 3 · Habilidades (13/9/5)</h4>
        <p class="wiz-note">Todas começam em 0. Nesta etapa, no máximo ${this.abilCap()} por Habilidade${this.useGenCaps() ? ` (o limite da ${this.draft.generation} Geração)` : ' (os Pontos de Bônus podem passar disso)'}.</p>
        ${this.priorityPicker('abil', d.abilOrder, WIZ_ABILS)}
        <div class="wiz-cols">${d.abilOrder.map(c => `
          <div class="wiz-col"><h5>${WIZ_ABILS[c].label} ${this.counter(this.sum(d.abil[c]), this.abilBudget(c))}</h5>
            ${WIZ_ABILS[c].keys.map(k => this.stepper('abil', `${c}.${k}`, this.abilValue(c, k, false), this.abilCap(), this.abilLabel(k, c),
              { disabledPlus: this.sum(d.abil[c]) >= this.abilBudget(c) })).join('')}
          </div>`).join('')}</div>`;
    }
    if (s === 4) {
      const discs = this.clanDisciplines();
      return `
        <h4 class="wiz-title">Passo 4 · Vantagens</h4>
        <div class="wiz-mode">
          <label><input type="radio" name="wiz-mode" data-act="mode" value="standard" ${d.discMode === 'standard' ? 'checked' : ''}> 3 em Disciplinas + 5 em Antecedentes</label>
          <label><input type="radio" name="wiz-mode" data-act="mode" value="alt" ${d.discMode === 'alt' ? 'checked' : ''}> 4 em Disciplinas, sem Antecedentes</label>
        </div>
        <div class="wiz-cols">
          <div class="wiz-col"><h5>Disciplinas do clã ${this.counter(this.sum(d.discs), this.discBudget())}</h5>
            ${discs.length ? discs.map(n => this.stepper('disc', n, this.discValue(n, false), this.advCap(), n, { disabledPlus: this.sum(d.discs) >= this.discBudget() })).join('') : '<p class="wiz-note">Escolha o clã no Passo 1.</p>'}
          </div>
          <div class="wiz-col"><h5>Antecedentes ${this.counter(this.bgSpent(), this.bgBudget())}</h5>
            ${this.bgBudget() ? `${d.backgrounds.map((b, i) => `
              <div class="wiz-bg-row">
                <input data-act="bg-name" data-index="${i}" list="wiz-bg-list" value="${this.esc(b.name)}" placeholder="Antecedente">
                ${this.stepper('bg', String(i), b.dots, 5, '', { disabledPlus: this.bgSpent() >= this.bgBudget() })}
                <button type="button" class="btn-remove-trait" data-act="bg-remove" data-index="${i}" aria-label="Remover antecedente">✕</button>
              </div>`).join('')}
              <button type="button" class="btn-tiny" data-act="bg-add">＋ Antecedente</button>
              <datalist id="wiz-bg-list">${WIZ_BACKGROUNDS.map(x => `<option value="${x}">`).join('')}</datalist>`
            : '<p class="wiz-note">Opção de 4 pontos em Disciplinas: sem Antecedentes nesta etapa.</p>'}
          </div>
          <div class="wiz-col"><h5>Virtudes ${this.counter(this.sum(d.virtues), 7)}</h5>
            ${WIZ_VIRTUES.map(v => this.stepper('virtue', v.key, this.virtueValue(v.key, false), 5, v.label, { min: 1, disabledPlus: this.sum(d.virtues) >= 7 })).join('')}
            <p class="wiz-note">Todas começam em 1.</p>
          </div>
        </div>`;
    }
    if (s === 5) {
      const der = this.derived();
      return `
        <h4 class="wiz-title">Passo 5 · Características derivadas</h4>
        <div class="wiz-derived">
          <div><span>${this.esc(this.pathLabel())}</span><strong>${der.humanity}</strong><small>Consciência ${this.virtueValue('conscience', false)} + Autocontrole ${this.virtueValue('self_control', false)}</small></div>
          <div><span>Força de Vontade</span><strong>${der.willpower}</strong><small>= Coragem ${this.virtueValue('courage', false)}</small></div>
          <div><span>Reserva de Sangue</span><strong>${der.blood}</strong><small>${d.generation} Geração · até ${der.perTurn} por turno</small></div>
        </div>
        <label class="wiz-block">Nome da Humanidade/Trilha
          <input data-field="pathName" value="${this.esc(d.pathName)}" placeholder="${d.edition === 'da' ? 'Estrada da Humanidade' : 'Humanidade'}"></label>
        <p class="wiz-note">Os Pontos de Bônus gastos em Virtudes no próximo passo não mudam esses valores; Humanidade e Força de Vontade podem ser compradas separadamente.</p>`;
    }
    if (s === 6) {
      const budget = this.freebieBudget();
      const spent = this.freebieSpent();
      const left = budget - spent;
      const canBuy = unit => left >= unit;
      const freeStepper = (kind, id, value, baseValue, max, label, unit) =>
        this.stepper(`free-${kind}`, id, value, max, `${label} (${unit})`, { min: baseValue, freeFrom: baseValue, disabledPlus: !canBuy(unit) });
      const q = stripAccents(this.mfQuery.toLowerCase());
      const catalog = typeof MERITS_FLAWS_DATA !== 'undefined' ? MERITS_FLAWS_DATA : [];
      const results = q.length >= 2 ? catalog.filter(x => stripAccents(x.name.toLowerCase()).includes(q)).slice(0, 8) : [];
      return `
        <h4 class="wiz-title">Passo 6 · Pontos de Bônus ${this.counter(spent, budget)}</h4>
        <p class="wiz-note">15 pontos + até 7 de Defeitos. Custos: Atributo 5 · Habilidade 2 · Disciplina 7 · Antecedente 1 · Virtude 2 · Humanidade 2 · Força de Vontade 1. Pontos em dourado são de bônus.</p>
        <div class="wiz-cols">
          <div class="wiz-col"><h5>Atributos (5)</h5>
            ${Object.keys(WIZ_ATTRS).map(c => WIZ_ATTRS[c].keys.map(k => freeStepper('attribute', `${c}.${k}`, this.attrValue(c, k), this.attrValue(c, k, false), this.attrCap(k), WIZ_ATTR_LABELS[k], 5)).join('')).join('')}
          </div>
          <div class="wiz-col"><h5>Vantagens</h5>
            ${this.clanDisciplines().map(n => freeStepper('discipline', n, this.discValue(n), this.discValue(n, false), this.advCap(), n, 7)).join('')}
            ${d.backgrounds.filter(b => b.name.trim()).map(b => freeStepper('background', b.name, this.bgValue(b), this.bgValue(b, false), 5, b.name, 1)).join('')}
            ${WIZ_VIRTUES.map(v => freeStepper('virtue', v.key, this.virtueValue(v.key), this.virtueValue(v.key, false), 5, v.label, 2)).join('')}
            ${freeStepper('humanity', 'humanity', this.derived().humanityFinal, this.derived().humanity, 10, this.pathLabel(), 2)}
            ${freeStepper('willpower', 'willpower', this.derived().willpowerFinal, this.derived().willpower, 10, 'Força de Vontade', 1)}
          </div>
          <div class="wiz-col"><h5>Habilidades (2)</h5>
            ${Object.keys(WIZ_ABILS).map(c => `<details class="wiz-details" ${c === d.abilOrder[0] ? 'open' : ''}><summary>${WIZ_ABILS[c].label}</summary>
              ${WIZ_ABILS[c].keys.map(k => freeStepper('ability', `${c}.${k}`, this.abilValue(c, k), this.abilValue(c, k, false), this.advCap(), this.abilLabel(k, c), 2)).join('')}
            </details>`).join('')}
          </div>
        </div>
        <div class="wiz-mf">
          <h5>Qualidades e Defeitos</h5>
          <input data-act="mf-search" value="${this.esc(this.mfQuery)}" placeholder="Buscar no catálogo (ex.: Sono leve, Sentidos aguçados)">
          <ul class="wiz-mf-results">${results.map(x => `<li><span>${x.type === 'qualidade' ? '＋' : '−'} ${this.esc(x.name)} <small>(${this.esc(x.points)})</small></span>
            <button type="button" class="btn-tiny" data-act="mf-add" data-type="${x.type}" data-name="${this.esc(x.name)}" data-points="${MeritsFlawsManager.parsePoints(x.points)}">Adicionar</button></li>`).join('')}</ul>
          <div class="wiz-mf-custom">
            <span>Ou crie o seu:</span>
            <select data-act="mf-custom-type" aria-label="Tipo">
              <option value="qualidade">Qualidade (custa)</option>
              <option value="defeito">Defeito (dá pontos)</option>
            </select>
            <input data-act="mf-custom-name" placeholder="Nome (ex.: Olhos de Coruja)" aria-label="Nome da Qualidade ou Defeito">
            <input type="number" data-act="mf-custom-points" min="1" max="7" value="1" inputmode="numeric" aria-label="Pontos">
            <button type="button" class="btn-tiny" data-act="mf-custom-add">＋ Adicionar</button>
          </div>
          <div class="wiz-mf-chosen">
            <p><strong>Qualidades</strong> (custam bônus): ${d.merits.map((m, i) => `<span class="wiz-tag">${this.esc(m.name)} ${m.points} <button type="button" data-act="mf-remove" data-list="merits" data-index="${i}" aria-label="Remover">✕</button></span>`).join(' ') || '—'}</p>
            <p><strong>Defeitos</strong> (dão bônus, máximo 7): ${d.flaws.map((f, i) => `<span class="wiz-tag is-flaw">${this.esc(f.name)} ${f.points} <button type="button" data-act="mf-remove" data-list="flaws" data-index="${i}" aria-label="Remover">✕</button></span>`).join(' ') || '—'}</p>
          </div>
        </div>`;
    }
    // Passo 7
    return `
      <h4 class="wiz-title">Passo 7 · Ficha final</h4>
      <pre class="wiz-report">${this.esc(this.report())}</pre>
      <div class="wiz-final-actions">
        <button type="button" class="btn btn-outline" data-act="copy-report">📋 Copiar relatório</button>
      </div>`;
  },

  renderSummary() {
    const d = this.draft;
    const clan = this.clanPreset();
    const der = this.derived();
    const ok = s => this.problems(s).length === 0;
    const row = (n, title, detail) => `<li class="${this.step === n ? 'is-current' : ''} ${n < 7 && n !== 5 ? (ok(n) ? 'is-ok' : 'is-pending') : ''}">
      <button type="button" data-act="goto" data-step="${n}"><span class="wiz-sum-num">${n}</span><span><strong>${title}</strong><small>${detail}</small></span></button></li>`;
    return `<ol class="wiz-summary">
      ${row(1, 'Conceito e Clã', `${this.esc(d.name || '—')} · ${clan ? clan.name : 'sem clã'} · ${d.generation}`)}
      ${row(2, 'Atributos', d.attrOrder.map(c => `${WIZ_ATTRS[c].label} ${this.sum(d.attrs[c])}/${this.attrBudget(c)}`).join(' · '))}
      ${row(3, 'Habilidades', d.abilOrder.map(c => `${WIZ_ABILS[c].label} ${this.sum(d.abil[c])}/${this.abilBudget(c)}`).join(' · '))}
      ${row(4, 'Vantagens', `Disc. ${this.sum(d.discs)}/${this.discBudget()} · Antec. ${this.bgSpent()}/${this.bgBudget()} · Virt. ${this.sum(d.virtues)}/7`)}
      ${row(5, 'Derivadas', `Hum. ${der.humanity} · FV ${der.willpower} · Sangue ${der.blood}`)}
      ${row(6, 'Pontos de Bônus', `${this.freebieSpent()}/${this.freebieBudget()}${this.flawPoints() ? ` (+${this.flawPoints()} defeitos)` : ''}`)}
      ${row(7, 'Ficha final', 'revisar e criar')}
    </ol>`;
  },

  render() {
    const body = document.getElementById('wizard-body');
    const side = document.getElementById('wizard-summary');
    if (!body || !this.draft) return;
    const scroll = body.scrollTop;
    body.innerHTML = this.renderStep();
    body.scrollTop = scroll;
    if (side) side.innerHTML = this.renderSummary();
    const back = document.getElementById('btn-wizard-back');
    const next = document.getElementById('btn-wizard-next');
    if (back) back.disabled = this.step === 1;
    if (next) next.textContent = this.step === 7 ? '🧛 Criar personagem' : 'Avançar →';
    const progress = document.getElementById('wizard-progress');
    if (progress) progress.textContent = `Passo ${this.step} de 7`;
    const probs = this.step < 7 ? this.problems(this.step) : [];
    const warn = document.getElementById('wizard-warn');
    if (warn) warn.textContent = probs.join(' ');
  },

  // Ações
  act(el, ev) {
    const d = this.draft;
    const a = el.dataset.act;
    const delta = parseInt(el.dataset.delta, 10) || 0;
    const id = el.dataset.id;
    const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (a === 'goto') { this.go(parseInt(el.dataset.step, 10)); return; }
    if (a === 'auto') { this.autoBuild(); return; }
    if (a === 'attr') {
      const [c, k] = id.split('.');
      const cap = this.attrCap(k) - this.attrBase(k);
      if (delta > 0 && this.sum(d.attrs[c]) >= this.attrBudget(c)) return;
      d.attrs[c][k] = clampTo(d.attrs[c][k] + delta, 0, Math.max(0, cap));
    } else if (a === 'abil') {
      const [c, k] = id.split('.');
      if (delta > 0 && this.sum(d.abil[c]) >= this.abilBudget(c)) return;
      d.abil[c][k] = clampTo(d.abil[c][k] + delta, 0, this.abilCap());
    } else if (a === 'disc') {
      if (delta > 0 && this.sum(d.discs) >= this.discBudget()) return;
      d.discs[id] = clampTo((d.discs[id] || 0) + delta, 0, this.advCap());
    } else if (a === 'bg') {
      const b = d.backgrounds[parseInt(id, 10)];
      if (!b || (delta > 0 && this.bgSpent() >= this.bgBudget())) return;
      b.dots = clampTo(b.dots + delta, 0, 5);
    } else if (a === 'bg-add') {
      d.backgrounds.push({ name: '', dots: 0 });
    } else if (a === 'bg-remove') {
      const b = d.backgrounds.splice(parseInt(el.dataset.index, 10), 1)[0];
      if (b) delete d.free.background[b.name];
    } else if (a === 'virtue') {
      if (delta > 0 && this.sum(d.virtues) >= 7) return;
      d.virtues[id] = clampTo(d.virtues[id] + delta, 0, 4);
    } else if (a === 'mode') {
      d.discMode = el.value === 'alt' ? 'alt' : 'standard';
      if (d.discMode === 'alt') { d.backgrounds = []; d.free.background = {}; }
    } else if (a === 'caitiff') {
      const set = new Set(d.caitiffDiscs);
      if (el.checked) { if (set.size >= 3) { el.checked = false; showToast('Caitiff começa com 3 Disciplinas.', 'info'); return; } set.add(el.value); }
      else { set.delete(el.value); delete d.discs[el.value]; delete d.free.discipline[el.value]; }
      d.caitiffDiscs = [...set];
    } else if (a.startsWith('free-')) {
      const kind = a.slice(5);
      const unit = WIZ_FREEBIE_COST[kind];
      const left = this.freebieBudget() - this.freebieSpent();
      if (delta > 0 && left < unit) { showToast(`Faltam pontos: custa ${unit} e restam ${left}.`, 'danger'); return; }
      if (kind === 'humanity' || kind === 'willpower') {
        const der = this.derived();
        const cur = kind === 'humanity' ? der.humanityFinal : der.willpowerFinal;
        if (delta > 0 && cur >= 10) return;
        d.free[kind] = Math.max(0, (d.free[kind] || 0) + delta);
      } else {
        const bag = d.free[kind];
        let current = 0;
        let cap = this.advCap();
        if (kind === 'attribute') { const [c, k] = id.split('.'); current = this.attrValue(c, k); cap = this.attrCap(k); }
        if (kind === 'virtue') cap = 5;
        if (kind === 'ability') { const [c, k] = id.split('.'); current = this.abilValue(c, k); }
        if (kind === 'discipline') current = this.discValue(id);
        if (kind === 'background') current = this.bgValue(d.backgrounds.find(b => b.name === id) || { dots: 0 });
        if (kind === 'virtue') current = this.virtueValue(id);
        if (delta > 0 && current >= cap) return;
        bag[id] = Math.max(0, (bag[id] || 0) + delta);
        if (!bag[id]) delete bag[id];
      }
    } else if (a === 'mf-add') {
      const item = { name: el.dataset.name, points: parseInt(el.dataset.points, 10) || 1 };
      if (el.dataset.type === 'defeito') {
        const raw = d.flaws.reduce((acc, f) => acc + f.points, 0);
        if (raw + item.points > 7) showToast('Defeitos acima de 7 pontos não dão bônus extra.', 'info');
        d.flaws.push(item);
      } else {
        const left = this.freebieBudget() - this.freebieSpent();
        if (item.points > left) { showToast(`A Qualidade custa ${item.points} e restam ${left} pontos.`, 'danger'); return; }
        d.merits.push(item);
      }
    } else if (a === 'mf-custom-add') {
      const box = el.closest('.wiz-mf');
      const type = box.querySelector('[data-act="mf-custom-type"]').value;
      const nameEl = box.querySelector('[data-act="mf-custom-name"]');
      const pointsEl = box.querySelector('[data-act="mf-custom-points"]');
      const name = nameEl.value.trim();
      const points = clampInt(pointsEl.value, 1, 7, 1);
      if (!name) { showToast('Dê um nome à Qualidade ou Defeito.', 'danger'); nameEl.focus(); return; }
      if (type === 'defeito') {
        const raw = d.flaws.reduce((acc, f) => acc + f.points, 0);
        if (raw + points > 7) showToast('Defeitos acima de 7 pontos não dão bônus extra.', 'info');
        d.flaws.push({ name, points, custom: true });
      } else {
        const left = this.freebieBudget() - this.freebieSpent();
        if (points > left) { showToast(`A Qualidade custa ${points} e restam ${left} pontos.`, 'danger'); return; }
        d.merits.push({ name, points, custom: true });
      }
      nameEl.value = '';
    } else if (a === 'mf-remove') {
      d[el.dataset.list].splice(parseInt(el.dataset.index, 10), 1);
    } else if (a === 'copy-report') {
      copyTextToClipboard(this.report(), 'Relatório de criação copiado.');
      return;
    } else {
      return;
    }
    this.render();
  },

  bind() {
    const m = document.getElementById('wizard-modal');
    if (!m) return;
    m.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (el && el.tagName === 'BUTTON') this.act(el, e);
    });
    m.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.act && el.tagName !== 'BUTTON') {
        if (el.dataset.act === 'attr-order' || el.dataset.act === 'abil-order') {
          const key = el.dataset.act === 'attr-order' ? 'attrOrder' : 'abilOrder';
          const order = this.draft[key];
          const slot = parseInt(el.dataset.slot, 10);
          const other = order.indexOf(el.value);
          [order[slot], order[other]] = [order[other], order[slot]];
          // Ao trocar a prioridade, pontos acima do novo limite são devolvidos
          const bag = key === 'attrOrder' ? this.draft.attrs : this.draft.abil;
          const budgetOf = c => (key === 'attrOrder' ? this.attrBudget(c) : this.abilBudget(c));
          Object.keys(bag).forEach(c => {
            let over = this.sum(bag[c]) - budgetOf(c);
            const keys = Object.keys(bag[c]).sort((a, b) => bag[c][a] - bag[c][b]);
            for (const k of keys) { while (over > 0 && bag[c][k] > 0) { bag[c][k]--; over--; } }
          });
          this.render();
          return;
        }
        if (el.dataset.act === 'bg-name') {
          const b = this.draft.backgrounds[parseInt(el.dataset.index, 10)];
          if (b) {
            if (this.draft.free.background[b.name]) {
              this.draft.free.background[el.value] = this.draft.free.background[b.name];
              delete this.draft.free.background[b.name];
            }
            b.name = el.value;
          }
          this.render();
          return;
        }
        this.act(el, e);
        return;
      }
      if (el.dataset.field) {
        const f = el.dataset.field;
        // Campos de texto já foram salvos no "input"; redesenhar aqui engoliria o próximo clique
        if (el.tagName === 'INPUT' && el.type !== 'checkbox') return;
        if (f === 'discMode') {
          this.draft.discMode = el.checked ? 'alt' : 'standard';
          if (el.checked) { this.draft.backgrounds = []; this.draft.free.background = {}; }
        } else if (f === 'genCaps') {
          this.draft.genCaps = el.checked;
          this.trimToCaps();
        } else if (f === 'clan') {
          this.draft.clan = el.value;
          this.draft.discs = {};
          this.draft.free.discipline = {};
          this.draft.caitiffDiscs = [];
          if (this.isNosferatu()) { this.draft.attrs.social.appearance = 0; delete this.draft.free.attribute['social.appearance']; }
        } else {
          this.draft[f] = el.value;
        }
        this.render();
      }
    });
    m.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.field && el.tagName === 'INPUT' && el.type !== 'checkbox') {
        this.draft[el.dataset.field] = el.value;
        const side = document.getElementById('wizard-summary');
        if (side) side.innerHTML = this.renderSummary();
      }
      if (el.dataset.act === 'mf-search') {
        this.mfQuery = el.value;
        const pos = el.selectionStart;
        this.render();
        const again = m.querySelector('[data-act="mf-search"]');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) { /* ignora */ } }
      }
    });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-wizard-close', () => this.close());
    on('btn-wizard-back', () => this.go(this.step - 1));
    on('btn-wizard-next', () => (this.step === 7 ? this.finish() : this.go(this.step + 1)));
    on('btn-wizard-blank', async () => {
      const name = (this.draft && this.draft.name.trim()) || 'Novo Neófito';
      const ch = createBlankCharacter(name);
      AppState.addCharacter(ch);
      UIRenderer.updateDropdown();
      UIRenderer.renderAll();
      this.close();
      showToast('Ficha em branco criada.', 'success');
    });
  }
};

// =============================================================================
// 8k. EFEITOS IMERSIVOS: fome, dano, cicatrizes, dados e Disciplinas
// Tudo desliga junto com "Efeitos leves" e com prefers-reduced-motion.
// =============================================================================
const FX_IMMERSIVE_KEY = 'v20_fx_immersive';

const FX = {
  layer: null, vignette: null, flash: null, overlay: null,

  enabled() {
    return safeStorageGet(FX_IMMERSIVE_KEY, 'on') !== 'off'
      && !LiteEffects.enabled()
      && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },

  init() {
    this.layer = document.getElementById('fx-layer');
    this.vignette = document.getElementById('fx-vignette');
    this.flash = document.getElementById('fx-flash');
    this.overlay = document.getElementById('fx-overlay');
  },

  /** Liga a classe por um instante e depois a remove. */
  pulse(el, cls, ms) {
    if (!el || !this.enabled()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el[`_fx_${cls}`]);
    el[`_fx_${cls}`] = setTimeout(() => el.classList.remove(cls), ms);
  },

  /** Posiciona os efeitos de tela em cima do elemento de origem. */
  anchor(el) {
    if (!this.overlay) return;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
    const y = r ? r.top + r.height / 2 : window.innerHeight * 0.7;
    this.overlay.style.setProperty('--ox', `${x}px`);
    this.overlay.style.setProperty('--oy', `${y}px`);
  },

  clearOverlay() {
    if (!this.overlay) return;
    this.overlay.className = 'fx-overlay';
    this.overlay.innerHTML = '';
  },

  /** Overlay temático: glifos, garras, onda, sentidos ou proteção. */
  themed(kind, anchorEl) {
    if (!this.enabled() || !this.overlay) return;
    this.anchor(anchorEl);
    this.clearOverlay();
    if (kind === 'glyphs') {
      this.overlay.innerHTML = `<svg class="fx-glyphs" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="86"/><circle cx="100" cy="100" r="62"/><circle cx="100" cy="100" r="30"/>
        <path d="M100 14 L158 100 L100 186 L42 100 Z"/><path d="M38 62 L162 138 M162 62 L38 138"/>
        <path d="M100 38 l10 22 24 4 -17 18 4 24 -21 -12 -21 12 4 -24 -17 -18 24 -4z"/></svg>`;
    } else if (kind === 'claws') {
      this.overlay.innerHTML = '<i class="fx-claw"></i><i class="fx-claw"></i><i class="fx-claw"></i>';
      this.pulse(document.body, 'fx-shake', 700);
    } else if (kind === 'ripple') {
      this.overlay.classList.add('is-ripple');
    } else if (kind === 'sense') {
      this.overlay.classList.add('is-sense');
    } else if (kind === 'ward') {
      this.overlay.classList.add('is-ward');
    } else if (kind === 'speed') {
      this.pulse(document.body, 'fx-speed', 800);
      return;
    } else if (kind === 'shadow') {
      this.pulse(document.body, 'fx-shadow', 1000);
      return;
    }
    this.pulse(this.overlay, 'is-on', 1400);
  },

  /** Qual efeito combina com a Disciplina usada na rolagem. */
  effectForDiscipline(name) {
    const k = canonicalDiscipline(name || '');
    if (!k) return null;
    if (/taumaturgia|necromancia/.test(k)) return 'glyphs';
    if (/celeridade/.test(k)) return 'speed';
    if (/ofuscacao|quimerismo/.test(k)) return 'shadow';
    if (/metamorfose|potencia|vicissitude|tanatose/.test(k)) return 'claws';
    if (/dominacao|presenca|demencia/.test(k)) return 'ripple';
    if (/auspicios/.test(k)) return 'sense';
    if (/fortitude|obeah/.test(k)) return 'ward';
    return null;
  },

  /** Procura uma Disciplina entre as partes da parada ou no feitiço rolado. */
  disciplineOfRoll(state) {
    const names = [];
    if (state.preset && Array.isArray(state.preset.parts)) names.push(...state.preset.parts.map(p => p.label));
    if (state.spell) names.push(state.spell.traditionLabel || '', state.spell.name || '');
    if (state.traitsSummary) names.push(...String(state.traitsSummary).split(/[+·]/));
    for (const n of names) {
      const effect = this.effectForDiscipline(n);
      if (effect) return effect;
    }
    return null;
  },

  // ---------------------------------------------------------------------------
  // Micro-interações
  // ---------------------------------------------------------------------------
  /** Os elementos são recriados ao redesenhar: anima no quadro seguinte. */
  dot(container, index, filling) {
    AmbientAudio.dotTick(filling);
    if (!this.enabled() || !container) return;
    requestAnimationFrame(() => {
      const dots = container.querySelectorAll('.dot');
      this.pulse(dots[Math.max(0, Math.min(dots.length - 1, index))], filling ? 'fx-fill' : 'fx-smoke', 600);
    });
  },

  willpower(index, spending) {
    if (!this.enabled()) return;
    requestAnimationFrame(() => {
      const boxes = document.querySelectorAll('#willpower-temp-boxes .box-item');
      this.pulse(boxes[index], spending ? 'fx-shatter' : 'fx-restore', 750);
    });
  },

  blood(point) {
    this.pulse(point, 'fx-drip', 900);
  },

  /** Gotas escorrendo da reserva de sangue até a Vitalidade. */
  bloodToHealth(amount = 1) {
    if (!this.enabled()) return;
    const from = document.getElementById('blood-pool-grid');
    const to = document.getElementById('health-track-list');
    if (!from || !to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const drops = Math.min(6, Math.max(3, amount * 3));
    for (let i = 0; i < drops; i++) {
      const drop = document.createElement('span');
      drop.className = 'fx-drop';
      const sx = a.left + a.width * (0.2 + Math.random() * 0.6);
      const sy = a.top + a.height * (0.2 + Math.random() * 0.5);
      drop.style.left = `${sx}px`;
      drop.style.top = `${sy}px`;
      drop.style.setProperty('--dx', `${b.left + b.width / 2 - sx}px`);
      drop.style.setProperty('--dy', `${b.top + b.height / 2 - sy}px`);
      drop.style.setProperty('--delay', `${i * 90}ms`);
      document.body.appendChild(drop);
      setTimeout(() => drop.remove(), 1400 + i * 90);
    }
    this.pulse(to, 'fx-heal', 1000);
  },

  // ---------------------------------------------------------------------------
  // Rolagem de dados
  // ---------------------------------------------------------------------------
  dice(state) {
    if (!state) return;
    AmbientAudio.duck(1.4);
    AmbientAudio.diceRoll((state.rolls || []).length);
    const kind = state.preset ? state.preset.kind : null;
    const rollSound = {
      soak: () => AmbientAudio.soak(),
      spell: () => AmbientAudio.spell(),
      attack: () => AmbientAudio.attack(/garra|mordida|presa|claw|bite/i.test(state.traitsSummary || '') ? 'claw' : 'blade'),
      damage: () => AmbientAudio.attack(/garra|mordida|presa|claw|bite/i.test(state.traitsSummary || '') ? 'claw' : 'blade')
    }[kind];
    if (rollSound) setTimeout(rollSound, 420);
    const math = `${state.mathStr || ''} ${state.traitsSummary || ''}`;
    if (/destreza|dexterity|celeridade|celerity/i.test(math)) setTimeout(() => AmbientAudio.speedBlur(), 380);
    else if (/for[çc]a|strength|pot[êe]ncia|potence/i.test(math)) setTimeout(() => AmbientAudio.might(), 380);
    if (!this.enabled()) return;
    const results = document.getElementById('dock-dice-results');
    const dice = results ? [...results.querySelectorAll('.die-box')] : [];
    dice.forEach((die, i) => {
      die.style.setProperty('--delay', `${Math.min(i * 45, 500)}ms`);
      this.pulse(die, 'fx-tumble', 700 + i * 45);
      if (die.classList.contains('die-success')) setTimeout(() => die.classList.add('fx-ember'), 500 + i * 45);
      if (die.classList.contains('die-ten')) setTimeout(() => this.pulse(die, 'fx-ruby', 1000), 520 + i * 45);
      if (die.classList.contains('die-botch') && state.isBotch) setTimeout(() => die.classList.add('fx-ash'), 620 + i * 45);
    });

    const themed = this.disciplineOfRoll(state);
    if (themed) setTimeout(() => this.themed(themed, results), 260);

    if (state.isBotch) setTimeout(() => { this.pulse(results, 'fx-crack', 950); this.pulse(document.body, 'fx-shake', 600); AmbientAudio.crack(); }, 560);
    else if (state.netSuccesses >= 5) setTimeout(() => { this.pulse(results, 'fx-triumph', 950); AmbientAudio.chime(); }, 560);

    const meter = document.getElementById('fx-success-meter');
    if (meter) {
      const fill = meter.querySelector('.fx-success-fill');
      const goal = Math.max(3, RollOptions.required || 1);
      const pct = state.isBotch ? 100 : Math.max(0, Math.min(100, (Math.max(0, state.netSuccesses) / goal) * 100));
      meter.hidden = false;
      meter.classList.toggle('is-botch', !!state.isBotch);
      if (fill) {
        fill.style.width = '0%';
        this.pulse(meter, 'is-filling', 1000);
        setTimeout(() => { fill.style.width = `${pct}%`; }, 480);
      }
    }
  },

  /** Clarão de medo (Rötschreck) ou de frenesi, com tremor. */
  /** Marca a caixa de Vitalidade que acabou de ser atingida (risco + espasmo). */
  markHealth(levelKey) { this._healthHit = { key: levelKey, at: Date.now() }; },

  decorateHealth(row, box, levelKey) {
    const hit = this._healthHit;
    if (!this.enabled() || !hit || hit.key !== levelKey || Date.now() - hit.at > 900) return;
    this._healthHit = null;
    this.pulse(box, 'fx-struck', 900);
    this.pulse(row, 'fx-spasm', 500);
  },

  /** Escudo espectral da absorção: surge e trinca se o dano passar. */
  shield(cracked) {
    if (!this.enabled()) return;
    const card = document.querySelector('[data-window-id="win-soak"]');
    if (!card) return;
    this.pulse(card, 'fx-shield', 1400);
    if (cracked) setTimeout(() => this.pulse(card, 'fx-shield-crack', 900), 420);
  },

  /** Ponto comprado com XP acende em dourado. */
  markXpBuy(ref) { this._xpBuy = { ref, at: Date.now() }; },

  decorateXp(container, traitPath) {
    const buy = this._xpBuy;
    if (!this.enabled() || !buy || Date.now() - buy.at > 1200 || buy.ref !== traitPath) return;
    this._xpBuy = null;
    const dot = [...container.querySelectorAll('.dot.active')].pop();
    if (dot) this.pulse(dot, 'fx-gold', 1200);
    this.xpBar(AppState.activeCharacter, true);
  },

  /** Barra metálica embaixo da Experiência: quanto do XP ganho já foi gasto. */
  xpBar(char, pulse = false) {
    const bar = document.getElementById('xp-progress');
    if (!bar || !char) return;
    const auto = typeof XPManager !== 'undefined' && XPManager.enabled(char);
    const t = auto ? XPManager.totals(char) : { total: parseInt(char.xp.total, 10) || 0, spent: parseInt(char.xp.spent, 10) || 0 };
    const total = Math.max(0, t.total || 0);
    const spent = Math.max(0, Math.min(total, t.spent || 0));
    const pct = total ? Math.round((spent / total) * 100) : 0;
    const fill = bar.querySelector('.xp-progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    const text = document.getElementById('xp-progress-text');
    if (text) text.textContent = total ? `${spent} de ${total} XP gastos · ${Math.max(0, total - spent)} livres` : 'Sem XP registrado';
    bar.setAttribute('aria-valuenow', String(pct));
    if (pulse) this.pulse(bar, 'is-pulsing', 1200);
  },

  /** Losango de Celeridade se desfazendo com rastro. */
  markCelerity(index) { this._celerity = { index, at: Date.now() }; },

  decorateCelerity(pip, index) {
    const c = this._celerity;
    if (!this.enabled() || !c || c.index !== index || Date.now() - c.at > 900) return;
    this._celerity = null;
    this.pulse(pip, 'fx-vanish', 800);
  },

  /** Transição em névoa ao trocar de ficha ou de layout. */
  dissolve() {
    if (!this.enabled()) return;
    const view = document.querySelector('.sheet-viewport') || document.querySelector('.sheet-card');
    if (view) this.pulse(view, 'fx-dissolve', 700);
  },

  /** Iniciativa surgindo com impacto. */
  impact(el) {
    if (!this.enabled() || !el) return;
    this.pulse(el, 'fx-impact', 900);
  },

  // ---------------------------------------------------------------------------
  // Painel de cicatrizes
  // ---------------------------------------------------------------------------
  openScars() {
    const modal = document.getElementById('scars-modal');
    if (!modal) return;
    this.renderScarList();
    modal.classList.remove('hidden');
  },

  closeScars() {
    const modal = document.getElementById('scars-modal');
    if (modal) modal.classList.add('hidden');
  },

  renderScarList() {
    const char = AppState.activeCharacter;
    const list = document.getElementById('scars-list');
    if (!char || !list) return;
    const scars = this.scars(char);
    list.innerHTML = '';
    if (!scars.length) {
      list.innerHTML = '<li class="scars-empty">Nenhuma cicatriz ainda. Elas nascem quando um dano agravado é curado — ou adicione uma à mão.</li>';
      return;
    }
    scars.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'scar-item';
      const info = document.createElement('div');
      info.className = 'scar-info';
      info.innerHTML = `<strong>Cicatriz ${i + 1}</strong><small>${escapeHtml(s.real || '')}${s.chronicle ? ` · ${escapeHtml(s.chronicle)}` : ''}</small>`;
      const note = document.createElement('input');
      note.type = 'text';
      note.value = s.note || '';
      note.placeholder = 'Como foi recebida? (ex.: garras de um Lupino em Reims)';
      note.addEventListener('input', () => { s.note = note.value; AppState.saveToStorage(); this.renderScars(char); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-remove-trait';
      del.textContent = '✕';
      del.title = 'Apagar cicatriz';
      del.addEventListener('click', () => {
        char.status.scars = scars.filter(x => x !== s);
        AppState.saveToStorage();
        this.renderScars(char);
        this.renderScarList();
      });
      li.append(info, note, del);
      list.appendChild(li);
    });
  },

  addScarManual() {
    const char = AppState.activeCharacter;
    if (!char) return;
    this.addScar(char, { silent: true });
    this.renderScarList();
    showToast('Cicatriz adicionada. Escreva como ela foi recebida.', 'info');
  },

  /** Avisos sonoros de estado: torpor, Incapacitado e reserva vazia. */
  stateSounds(char, { wound, blood }) {
    const key = char.id || 'x';
    if (this._stateKey !== key) {
      this._stateKey = key;
      this._wasIncap = wound.incapacitated;
      this._wasEmpty = blood === 0;
      this._wasTorpor = !!(char.status && char.status.torpor);
      return;
    }
    const torpor = !!(char.status && char.status.torpor);
    if (torpor && !this._wasTorpor) AmbientAudio.torporSound();
    this._wasTorpor = torpor;
    if (wound.incapacitated && !this._wasIncap) AmbientAudio.collapse();
    this._wasIncap = wound.incapacitated;
    if (blood === 0 && !this._wasEmpty) AmbientAudio.starving();
    this._wasEmpty = blood === 0;
  },

  /** Som do sangue entrando ou saindo, detectado pela variação da reserva. */
  bloodSound(char) {
    const now = getBloodCount(char);
    const key = char.id || 'x';
    if (this._bloodKey !== key) { this._bloodKey = key; this._bloodLast = now; return; }
    const before = this._bloodLast;
    this._bloodLast = now;
    if (before === undefined || now === before) return;
    if (now < before) AmbientAudio.bloodSpend(before - now);
    else AmbientAudio.bloodGain(now - before);
  },

  fear(kind = 'fear') {
    AmbientAudio.duck(1.6);
    if (kind === 'frenzy') { AmbientAudio.growl(); AmbientAudio.hit(62); }
    else { AmbientAudio.whoosh(); AmbientAudio.hit(110); }
    if (!this.enabled() || !this.flash) return;
    this.pulse(this.flash, kind === 'frenzy' ? 'is-frenzy' : 'is-fear', 1700);
    this.pulse(document.body, 'fx-shake', 900);
  },

  // ---------------------------------------------------------------------------
  // Estados do personagem
  // ---------------------------------------------------------------------------
  render(char) {
    if (!char) return;
    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
    const blood = getBloodCount(char);
    const ratio = rule.maxBlood ? blood / rule.maxBlood : 1;
    const hunger = blood === 0 ? 3 : ratio < 0.2 ? 3 : ratio < 0.4 ? 2 : ratio < 0.65 ? 1 : 0;
    if (document.body.dataset.hunger !== String(hunger)) {
      if (hunger > (parseInt(document.body.dataset.hunger, 10) || 0) && this.vignette) this.pulse(this.vignette, 'is-hunger-spike', 1500);
      document.body.dataset.hunger = String(hunger);
    }

    const wound = getWoundState(char);
    const states = HEALTH_LEVELS.map(l => (char.health || {})[l.key]).filter(Boolean);
    const agg = states.filter(v => v === 'aggravated').length;
    const woundLevel = wound.index < 0 ? 0 : wound.index <= 1 ? 1 : wound.index <= 3 ? 2 : 3;
    document.body.dataset.wound = String(woundLevel);
    document.body.dataset.agg = agg ? '1' : '0';
    // Batimento mais rápido conforme o dano agravado aumenta
    document.body.style.setProperty('--fx-beat', `${Math.max(0.7, 1.6 - agg * 0.18)}s`);
    document.body.classList.toggle('state-torpor', !!(char.status && char.status.torpor));

    this.bloodSound(char);
    this.xpBar(char);
    this.stateSounds(char, { hunger, wound, blood });
    this.renderScars(char);
  },

  // ---------------------------------------------------------------------------
  // Cicatrizes
  // ---------------------------------------------------------------------------
  scars(char) {
    if (!char.status) char.status = {};
    if (!Array.isArray(char.status.scars)) char.status.scars = [];
    return char.status.scars;
  },

  renderScars(char) {
    const box = document.getElementById('fx-scars');
    if (!box) return;
    const list = this.scars(char);
    const frame = document.getElementById('char-avatar-frame');
    if (frame) frame.classList.toggle('has-scars', list.length > 0);
    const count = document.getElementById('scars-count');
    if (count) {
      count.textContent = String(list.length);
      count.hidden = list.length === 0;
    }
    box.innerHTML = '';
    list.forEach(s => {
      const mark = document.createElement('button');
      mark.type = 'button';
      mark.className = 'fx-scar';
      mark.style.left = `${s.x}%`;
      mark.style.top = `${s.y}%`;
      mark.style.setProperty('--rot', `${s.rot}deg`);
      mark.style.setProperty('--len', `${s.len}px`);
      const label = `Cicatriz curada em ${s.real}${s.chronicle ? ` (${s.chronicle})` : ''}${s.note ? `: ${s.note}` : ''}`;
      mark.title = label;
      mark.setAttribute('aria-label', label);
      mark.addEventListener('click', () => this.editScar(char, s));
      box.appendChild(mark);
    });
  },

  async editScar(char, scar) {
    const note = await GothicDialog.open({
      title: 'Cicatriz',
      message: `Curada em ${scar.real}${scar.chronicle ? ` · ${scar.chronicle}` : ''}. Como esta ferida foi recebida?`,
      input: { value: scar.note || '', placeholder: 'ex.: fogo grego na ponte de Paris' },
      confirmLabel: 'Guardar'
    });
    if (note === null || note === false) return;
    scar.note = String(note).trim();
    AppState.saveToStorage();
    this.renderScars(char);
  },

  /** Cada nível agravado curado deixa uma marca permanente no retrato. */
  addScar(char, { silent = false } = {}) {
    const list = this.scars(char);
    const scar = {
      id: generateUniqueId(),
      real: new Date().toLocaleDateString('pt-BR'),
      chronicle: typeof ChronicleClock !== 'undefined' ? ChronicleClock.label(char) : '',
      note: '',
      x: 18 + Math.random() * 62,
      y: 16 + Math.random() * 58,
      rot: -35 + Math.random() * 70,
      len: 18 + Math.random() * 22
    };
    list.push(scar);
    AppState.saveToStorage();
    this.renderScars(char);
    showToast('🩹 Ferida agravada cicatrizou. A marca ficou no retrato — clique nela para contar a história.', 'info');
    return scar;
  },

  /** Toca abrir/fechar em qualquer janela ou gaveta, sem precisar tocar em cada botão. */
  watchPanels() {
    const panels = document.querySelectorAll('.gothic-modal-overlay, .side-drawer, #wiki-help-drawer, #dice-history-drawer');
    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        const el = m.target;
        const nowHidden = el.classList.contains('hidden') || el.hasAttribute('hidden');
        if (el._fxHidden === undefined) { el._fxHidden = nowHidden; return; }
        if (el._fxHidden === nowHidden) return;
        el._fxHidden = nowHidden;
        AmbientAudio.drawer(!nowHidden);
      });
    });
    panels.forEach(el => {
      el._fxHidden = el.classList.contains('hidden') || el.hasAttribute('hidden');
      obs.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
    });
  },

  /** Sons de navegação e de comandos comuns. */
  watchClicks() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('button, label, .layout-quick-btn');
      if (!el) return;
      const id = el.id || '';
      if (el.matches('.tab-nav-btn, .grimoire-tab, .layout-quick-btn, .layout-tab, [data-page-tab]')) { AmbientAudio.tab(); return; }
      if (/^btn-(save|export-json|file-backup)$/.test(id) || el.matches('#btn-summary-copy, #btn-layout-save')) { AmbientAudio.stamp(); return; }
      if (el.matches('label[for="import-json-input"], #btn-duplicate, #btn-new')) { AmbientAudio.bookOpen(); return; }
      if (el.matches('[data-xp-toggle], [data-plan-toggle], .btn-goal-buy, #btn-goals-buy-all')) { AmbientAudio.unlock(); return; }
      if (el.matches('#btn-open-command, #btn-command-run, #btn-command-mic')) { AmbientAudio.whisper(); }
    }, true);
    const sel = document.getElementById('character-select');
    if (sel) sel.addEventListener('change', () => AmbientAudio.bookOpen());
  },

  bind() {
    this.init();
    this.watchPanels();
    this.watchClicks();
    const toggle = document.getElementById('toggle-immersive-fx');
    if (toggle) {
      toggle.checked = safeStorageGet(FX_IMMERSIVE_KEY, 'on') !== 'off';
      toggle.addEventListener('change', () => {
        safeStorageSet(FX_IMMERSIVE_KEY, toggle.checked ? 'on' : 'off');
        if (!toggle.checked) {
          document.body.removeAttribute('data-hunger');
          document.body.removeAttribute('data-wound');
          document.body.removeAttribute('data-agg');
          this.clearOverlay();
        } else if (AppState.activeCharacter) this.render(AppState.activeCharacter);
        showToast(toggle.checked
          ? 'Efeitos imersivos ligados: a ficha reage à fome, aos ferimentos e às Disciplinas.'
          : 'Efeitos imersivos desligados.', 'info');
      });
    }
    const sfx = document.getElementById('toggle-sfx');
    if (sfx) {
      sfx.checked = safeStorageGet(SFX_KEY, 'on') !== 'off';
      sfx.addEventListener('change', () => {
        safeStorageSet(SFX_KEY, sfx.checked ? 'on' : 'off');
        if (sfx.checked) AmbientAudio.diceRoll(4);
        showToast(sfx.checked ? 'Sons de ação ligados.' : 'Sons de ação desligados.', 'info');
      });
    }
    const test = document.getElementById('btn-rotschreck-fx');
    if (test) test.addEventListener('click', () => {
      this.fear('fear');
      showToast('🔥 Rötschreck: role Coragem para resistir ao medo do fogo ou do sol.', 'danger');
    });
  }
};

/** Som ambiente ASMR gerado pelo navegador (sem arquivos de áudio). */
const AMBIENT_AUDIO_KEY = 'v20_ambient_scene';
const AMBIENT_VOL_KEY = 'v20_ambient_volume';
const AMBIENT_ON_KEY = 'v20_ambient_on';

const SFX_KEY = 'v20_sfx';
const AmbientAudio = {
  ctx: null, master: null, sfx: null, nodes: [], timers: [], playing: false,

  // Primeiro acesso começa em silêncio: a trilha é uma escolha do jogador
  scene() { return safeStorageGet(AMBIENT_AUDIO_KEY, 'off'); },
  volume() { return clampInt(safeStorageGet(AMBIENT_VOL_KEY, '35'), 0, 100, 35) / 100; },

  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },

  /** Ruído rosa: base de vento, chuva e lareira. */
  noise(seconds = 3) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
    return buf;
  },

  layer(freq, q, gain, lfoRate) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = gain * 0.55;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.start();
    lfo.start();
    this.nodes.push(src, lfo);
  },

  /** Estalo da lareira, gota na janela ou passo na pedra. */
  /** Efeitos (dados, frenesi, Rötschreck) têm saída própria: tocam mesmo sem o som ambiente. */
  sfxEnabled() { return safeStorageGet(SFX_KEY, 'on') !== 'off' && !LiteEffects.enabled(); },

  sfxOut() {
    if (!this.sfxEnabled() || !this.ensure()) return null;
    if (!this.sfx) {
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
    }
    // Efeitos ficam acima do ambiente: precisam ser ouvidos durante a mesa
    this.sfx.gain.value = Math.min(1, Math.max(0.5, this.volume() * 1.6));
    return this.sfx;
  },

  /** Chacoalhar e assentar dos dados: estalos curtos que vão desacelerando. */
  diceRoll(count = 5) {
    const out = this.sfxOut();
    if (!out) return;
    const hits = Math.max(10, Math.min(22, 8 + Math.round(count * 1.2)));
    let t = 0;
    for (let i = 0; i < hits; i++) {
      const progress = i / hits;
      t += 22 + progress * progress * 120;
      setTimeout(() => {
        this.tick({
          freq: 480 + Math.random() * 1700,
          decay: 0.05 + Math.random() * 0.06,
          gain: (0.30 - progress * 0.14) * (0.75 + Math.random() * 0.5),
          out
        });
        if (i % 3 === 0) this.tick({ freq: 170 + Math.random() * 90, decay: 0.09, gain: 0.14, tone: true, out });
      }, t);
    }
    setTimeout(() => {
      this.tick({ freq: 300, decay: 0.2, gain: 0.22, out });
      this.tick({ freq: 120, decay: 0.3, gain: 0.16, tone: true, out });
    }, t + 80);
  },

  /** Sopro de fogo do Rötschreck: ruído com filtro descendo. */
  whoosh({ from = 2200, to = 260, seconds = 0.8, gain = 0.16 } = {}) {
    const out = this.sfxOut();
    if (!out) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(1.2);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, now);
    f.frequency.exponentialRampToValueAtTime(to, now + seconds);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(now);
    src.stop(now + seconds + 0.1);
  },

  /** Rosnado grave da Besta (frenesi). */
  growl() {
    const out = this.sfxOut();
    if (!out) return;
    const now = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.2, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    f.connect(g);
    g.connect(out);
    [54, 61, 82].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 2 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.8, now + 1.1);
      osc.connect(f);
      osc.start(now);
      osc.stop(now + 1.2);
    });
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 7;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(f.frequency);
    lfo.start(now);
    lfo.stop(now + 1.2);
  },

  /** Sangue saindo da reserva: gole grave e descendente. */
  bloodSpend(amount = 1) {
    const out = this.sfxOut();
    if (!out) return;
    const n = Math.max(1, Math.min(4, amount));
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this.tick({ freq: 260, decay: 0.28, gain: 0.13, tone: true, out });
        this.tick({ freq: 620, decay: 0.09, gain: 0.05, out });
      }, i * 110);
    }
  },

  /** Sangue entrando na reserva: gota subindo. */
  bloodGain(amount = 1) {
    const out = this.sfxOut();
    if (!out) return;
    const n = Math.max(1, Math.min(4, amount));
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this.tick({ freq: 480, decay: 0.16, gain: 0.09, tone: true, out });
        setTimeout(() => this.tick({ freq: 900, decay: 0.07, gain: 0.05, out }), 60);
      }, i * 100);
    }
  },

  /** Marcar ou apagar um ponto de traço: toque bem curto. */
  dotTick(filling = true) {
    const out = this.sfxOut();
    if (!out) return;
    // Timbre macio: corpo grave em tom puro, com um toque curto e abafado por cima
    if (filling) {
      this.tick({ freq: 330, decay: 0.17, gain: 0.17, tone: true, out });
      this.tick({ freq: 520, decay: 0.05, gain: 0.05, out });
    } else {
      this.tick({ freq: 200, decay: 0.2, gain: 0.14, tone: true, out });
      this.tick({ freq: 300, decay: 0.06, gain: 0.04, out });
    }
  },

  // ---------------------------------------------------------------------------
  // Biblioteca de efeitos góticos (tudo sintetizado, sem arquivos)
  // ---------------------------------------------------------------------------
  /** Janelas e gavetas: couro pesado deslizando e batida abafada. */
  drawer(open = true) {
    const o = this.sfxOut();
    if (!o) return;
    this.whoosh({ from: open ? 700 : 900, to: open ? 220 : 160, seconds: 0.34, gain: 0.12 });
    setTimeout(() => this.tick({ freq: open ? 150 : 110, decay: 0.28, gain: 0.16, tone: true, out: o }), open ? 180 : 140);
  },

  /** Abas: folha de pergaminho virando com estalo seco de madeira. */
  tab() {
    const o = this.sfxOut();
    if (!o) return;
    this.whoosh({ from: 4200, to: 1600, seconds: 0.16, gain: 0.1 });
    setTimeout(() => this.tick({ freq: 1200, decay: 0.05, gain: 0.12, out: o }), 70);
  },

  /** Salvar/Exportar: selo de ferro no pergaminho com eco de sino. */
  stamp() {
    const o = this.sfxOut();
    if (!o) return;
    this.tick({ freq: 120, decay: 0.32, gain: 0.26, tone: true, out: o });
    this.tick({ freq: 2600, decay: 0.12, gain: 0.12, out: o });
    setTimeout(() => this.tick({ freq: 1320, decay: 1.1, gain: 0.07, tone: true, out: o }), 90);
  },

  /** Importar/trocar de ficha: livro velho abrindo e lufada de vento na cripta. */
  bookOpen() {
    const o = this.sfxOut();
    if (!o) return;
    [0, 70, 130, 210].forEach(d => setTimeout(() => this.tick({ freq: 2200 + Math.random() * 1800, decay: 0.06, gain: 0.12, out: o }), d));
    setTimeout(() => this.whoosh({ from: 900, to: 180, seconds: 0.9, gain: 0.12 }), 120);
  },

  /** Modo XP, Planejador e compra de metas: moedas e sino de catedral. */
  unlock() {
    const o = this.sfxOut();
    if (!o) return;
    [0, 80, 150].forEach((d, i) => setTimeout(() => this.tick({ freq: 2400 + i * 500, decay: 0.12, gain: 0.14, out: o }), d));
    setTimeout(() => this.bellTone(660, 1.6, 0.09), 120);
  },

  bellTone(freq = 440, decay = 1.4, gain = 0.1) {
    const o = this.sfxOut();
    if (!o) return;
    const now = this.ctx.currentTime;
    [1, 2.01, 2.98].forEach((mult, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain / (i + 1.3), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay - i * 0.2);
      osc.connect(g); g.connect(o);
      osc.start(now); osc.stop(now + decay + 0.1);
    });
  },

  /** Rolagens com Destreza: deslocamento de ar bem rápido. */
  speedBlur() {
    this.whoosh({ from: 5200, to: 900, seconds: 0.22, gain: 0.2 });
    setTimeout(() => this.whoosh({ from: 3800, to: 700, seconds: 0.18, gain: 0.13 }), 80);
  },

  /** Rolagens com Força: osso estalando e estouro grave. */
  might() {
    const o = this.sfxOut();
    if (!o) return;
    [0, 45, 95].forEach(d => setTimeout(() => this.tick({ freq: 900 + Math.random() * 700, decay: 0.05, gain: 0.16, out: o }), d));
    setTimeout(() => this.tick({ freq: 62, decay: 0.8, gain: 0.3, tone: true, out: o }), 60);
  },

  /** Dormir: suspiro longo, sino grave e tampa de pedra fechando. */
  sleepSound() {
    const o = this.sfxOut();
    if (!o) return;
    this.whoosh({ from: 900, to: 120, seconds: 1.3, gain: 0.13 });
    setTimeout(() => this.bellTone(150, 3.2, 0.1), 260);
    setTimeout(() => { this.tick({ freq: 70, decay: 0.9, gain: 0.26, tone: true, out: o }); this.tick({ freq: 380, decay: 0.2, gain: 0.1, out: o }); }, 900);
  },

  /** Despertar: arquejo, sino e coração acelerando. */
  wakeSound() {
    const o = this.sfxOut();
    if (!o) return;
    this.whoosh({ from: 300, to: 2400, seconds: 0.5, gain: 0.16 });
    setTimeout(() => this.bellTone(220, 2.6, 0.1), 220);
    [700, 1080, 1400, 1660, 1860].forEach((d, i) => setTimeout(() => this.tick({ freq: 58, decay: 0.3, gain: 0.18 + i * 0.02, tone: true, out: o }), d));
  },

  /** Comando ou voz: sussurro mágico e zumbido ligando. */
  whisper() {
    const o = this.sfxOut();
    if (!o) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(1.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 6; f.frequency.value = 1700;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 5.5; lfoGain.gain.value = 700;
    lfo.connect(lfoGain); lfoGain.connect(f.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    src.connect(f); f.connect(g); g.connect(o);
    src.start(now); src.stop(now + 1.2);
    lfo.start(now); lfo.stop(now + 1.2);
    setTimeout(() => this.tick({ freq: 110, decay: 0.9, gain: 0.12, tone: true, out: o }), 120);
  },

  /** Entrar em torpor: batimento parando e vento frio. */
  torporSound() {
    const o = this.sfxOut();
    if (!o) return;
    [0, 520, 1180, 2000].forEach((d, i) => setTimeout(() => this.tick({ freq: 56 - i * 4, decay: 0.5 + i * 0.2, gain: 0.22 - i * 0.045, tone: true, out: o }), d));
    setTimeout(() => this.whoosh({ from: 600, to: 90, seconds: 2.4, gain: 0.12 }), 400);
  },

  /** Envio ao Discord: corvo distante e cristal. */
  raven() {
    const o = this.sfxOut();
    if (!o) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 5; f.frequency.value = 1400;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.28);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.1, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(f); f.connect(g); g.connect(o);
    osc.start(now); osc.stop(now + 0.4);
    setTimeout(() => this.tick({ freq: 2100, decay: 0.5, gain: 0.08, tone: true, out: o }), 260);
  },

  /** Incapacitado: corpo caindo, respingo e zumbido sumindo. */
  collapse() {
    const o = this.sfxOut();
    if (!o) return;
    this.tick({ freq: 70, decay: 0.7, gain: 0.3, tone: true, out: o });
    setTimeout(() => this.tick({ freq: 420, decay: 0.2, gain: 0.16, out: o }), 120);
    setTimeout(() => this.growl(), 200);
    setTimeout(() => this.bellTone(90, 2.4, 0.07), 500);
  },

  /** Sem sangue: arquejo seco e batimento oco. */
  starving() {
    const o = this.sfxOut();
    if (!o) return;
    this.whoosh({ from: 2600, to: 700, seconds: 0.5, gain: 0.12 });
    [300, 900].forEach(d => setTimeout(() => this.tick({ freq: 52, decay: 0.7, gain: 0.2, tone: true, out: o }), d));
    setTimeout(() => this.whoosh({ from: 200, to: 60, seconds: 2, gain: 0.1 }), 500);
  },

  /** Absorção: pancada surda com anel metálico. */
  soak() {
    const out = this.sfxOut();
    if (!out) return;
    this.tick({ freq: 140, decay: 0.4, gain: 0.16, tone: true, out });
    setTimeout(() => this.tick({ freq: 2400, decay: 0.3, gain: 0.05, out }), 40);
  },

  /** Cura e regeneração: duas notas subindo, quentes. */
  heal() {
    const out = this.sfxOut();
    if (!out) return;
    [392, 587].forEach((freq, i) => setTimeout(() => this.tick({ freq, decay: 0.6, gain: 0.08, tone: true, out }), i * 130));
  },

  /** Magia: brilho cintilante com cauda longa. */
  spell() {
    const out = this.sfxOut();
    if (!out) return;
    const now = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 0.98, now + i * 0.06);
      osc.frequency.linearRampToValueAtTime(freq, now + i * 0.06 + 0.4);
      g.gain.setValueAtTime(0.0001, now + i * 0.06);
      g.gain.linearRampToValueAtTime(0.06, now + i * 0.06 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 1.6);
      osc.connect(g); g.connect(out);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 1.7);
    });
  },

  /** Ataque: lâminas se chocando ou garras rasgando. */
  attack(kind = 'blade') {
    const out = this.sfxOut();
    if (!out) return;
    if (kind === 'claw') {
      this.whoosh({ from: 3200, to: 900, seconds: 0.28, gain: 0.14 });
      setTimeout(() => this.whoosh({ from: 2600, to: 700, seconds: 0.22, gain: 0.1 }), 70);
      return;
    }
    this.tick({ freq: 3200, decay: 0.12, gain: 0.12, out });
    this.tick({ freq: 1800, decay: 0.45, gain: 0.07, tone: true, out });
    setTimeout(() => this.tick({ freq: 2600, decay: 0.3, gain: 0.05, tone: true, out }), 70);
  },

  /** Levar dano: impacto seco e grave. */
  hurt(levels = 1) {
    const out = this.sfxOut();
    if (!out) return;
    this.tick({ freq: 90, decay: 0.5, gain: 0.2, tone: true, out });
    this.tick({ freq: 320, decay: 0.16, gain: 0.1, out });
    if (levels >= 3) setTimeout(() => this.tick({ freq: 70, decay: 0.7, gain: 0.16, tone: true, out }), 120);
  },

  /** XP registrado: tilintar curto. */
  xp() {
    const out = this.sfxOut();
    if (!out) return;
    [1046, 1568].forEach((freq, i) => setTimeout(() => this.tick({ freq, decay: 0.35, gain: 0.06, tone: true, out }), i * 90));
  },

  /** Relógio avançando: tique-taque discreto. */
  clockTick() {
    const out = this.sfxOut();
    if (!out) return;
    this.tick({ freq: 2200, decay: 0.05, gain: 0.05, out });
    setTimeout(() => this.tick({ freq: 1700, decay: 0.06, gain: 0.04, out }), 130);
  },

  /** Novo turno / fim de cena: tambores. */
  drums(beats = 2) {
    const out = this.sfxOut();
    if (!out) return;
    for (let i = 0; i < beats; i++) {
      setTimeout(() => {
        this.tick({ freq: 78 - i * 6, decay: 0.55, gain: 0.2, tone: true, out });
        this.tick({ freq: 240, decay: 0.12, gain: 0.07, out });
      }, i * 230);
    }
  },

  /** Brilho rubi do sucesso decisivo e trinco seco da falha crítica. */
  chime() {
    const out = this.sfxOut();
    if (!out) return;
    [880, 1320].forEach((freq, i) => setTimeout(() => this.tick({ freq, decay: 0.7, gain: 0.09, tone: true, out }), i * 110));
  },

  crack() {
    const out = this.sfxOut();
    if (!out) return;
    this.tick({ freq: 180, decay: 0.5, gain: 0.2, tone: true, out });
    [0, 60, 130].forEach(d => setTimeout(() => this.tick({ freq: 900 + Math.random() * 900, decay: 0.07, gain: 0.12, out }), d));
  },

  tick({ freq = 900, decay = 0.08, gain = 0.08, tone = false, out = null } = {}) {
    const dest = out || this.master;
    if (!this.ctx || !dest) return;
    const now = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    g.connect(dest);
    if (tone) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + decay);
      osc.connect(g);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise(0.25);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 4;
      src.connect(f);
      f.connect(g);
      src.start(now);
      src.stop(now + decay + 0.05);
    }
  },

  bell(freq = 200) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    [1, 2.02, 3.01, 4.3].forEach((mult, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.16 / (i + 1.5), now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4.5 - i * 0.6);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 5);
    });
  },

  /** Batida grave usada pelos clarões. */
  hit(freq = 100) {
    this.tick({ freq, decay: 0.7, gain: 0.18, tone: true, out: this.sfxOut() });
  },

  every(ms, jitter, fn) {
    const loop = () => { fn(); this.timers.push(setTimeout(loop, ms + Math.random() * jitter)); };
    this.timers.push(setTimeout(loop, 300 + Math.random() * jitter));
  },

  /** Áudio de lareira real (arquivo em laço de 2 minutos). */
  fireEl() {
    if (!this._fire) {
      // Duas fontes: AAC para Safari/iPhone e Opus para Chrome e Firefox
      const el = document.createElement('audio');
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      [['./audio-lareira.m4a', 'audio/mp4'], ['./audio-lareira.ogg', 'audio/ogg; codecs=opus']].forEach(([src, type]) => {
        const s = document.createElement('source');
        s.src = src;
        s.type = type;
        el.appendChild(s);
      });
      document.body.appendChild(el);
      this._fire = el;
    }
    return this._fire;
  },

  fireVolume(target) {
    const el = this._fire;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, target));
  },

  build(scene) {
    if (scene === 'fire') {
      const el = this.fireEl();
      el.volume = Math.min(1, this.volume() * 1.5);
      const played = el.play();
      if (played && played.catch) {
        played.catch(() => {
          // Navegador exigiu um toque antes de tocar: espera o primeiro clique
          const kick = () => {
            document.removeEventListener('pointerdown', kick);
            document.removeEventListener('keydown', kick);
            if (this.playing) el.play().catch(() => {});
          };
          document.addEventListener('pointerdown', kick, { once: true });
          document.addEventListener('keydown', kick, { once: true });
        });
      }
      return;
    }
    if (scene === 'rain') {
      this.layer(2400, 0.8, 0.05, 0.08);
      this.layer(520, 0.6, 0.03, 0.05);
      this.every(130, 240, () => this.tick({ freq: 1800 + Math.random() * 2800, decay: 0.03, gain: 0.02 + Math.random() * 0.05 }));
      this.every(2400, 3200, () => this.tick({ freq: 250 + Math.random() * 120, decay: 0.22, gain: 0.05, tone: true }));
    } else if (scene === 'bell') {
      this.layer(280, 0.6, 0.035, 0.04);
      this.every(24000, 18000, () => this.bell(192 + Math.random() * 30));
      this.every(1600, 2400, () => this.tick({ freq: 140 + Math.random() * 90, decay: 0.16, gain: 0.05 }));
    } else {
      this.layer(340, 0.7, 0.05, 0.06);
      this.layer(1500, 0.9, 0.025, 0.1);
      this.every(480, 900, () => this.tick({ freq: 700 + Math.random() * 1500, decay: 0.05 + Math.random() * 0.08, gain: 0.04 + Math.random() * 0.1 }));
    }
  },

  fade(to, seconds = 0.8) {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(Math.max(0.0001, to), now + seconds);
  },

  /** Abaixa o ambiente durante a rolagem e volta em seguida. */
  duck(seconds = 1.2) {
    if (!this.playing) return;
    this.fade(this.volume() * 0.35, 0.15);
    this.fireVolume(this.volume() * 0.5);
    clearTimeout(this._duck);
    this._duck = setTimeout(() => {
      this.fade(this.volume(), 0.9);
      this.fireVolume(this.volume() * 1.5);
    }, seconds * 1000);
  },

  start() {
    if (this.scene() === 'off') { showToast('Escolha uma trilha antes de tocar.', 'info'); return; }
    if (this.playing || LiteEffects.enabled() || !this.ensure()) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.ctx.destination);
    this.build(this.scene());
    this.playing = true;
    this.fade(this.volume(), 1.6);
    safeStorageSet(AMBIENT_ON_KEY, 'on');
    this.render();
  },

  stop({ remember = true } = {}) {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.nodes.forEach(n => { try { n.stop(); } catch (e) { /* já parado */ } });
    this.nodes = [];
    if (this.master) { try { this.master.disconnect(); } catch (e) { /* ignora */ } }
    this.master = null;
    if (this._fire) { try { this._fire.pause(); this._fire.currentTime = 0; } catch (e) { /* ignora */ } }
    this.playing = false;
    if (remember) safeStorageSet(AMBIENT_ON_KEY, 'off');
    this.render();
  },

  toggle() {
    if (this.playing) this.stop();
    else {
      this.start();
      if (!this.playing) showToast('Este navegador não permite gerar som aqui.', 'danger');
    }
  },

  render() {
    const btn = document.getElementById('btn-ambient-audio');
    if (btn) {
      btn.textContent = this.playing ? '⏸ Pausar som ambiente' : '▶ Tocar som ambiente';
      btn.setAttribute('aria-pressed', String(this.playing));
      btn.classList.toggle('is-on', this.playing);
      btn.disabled = this.scene() === 'off';
    }
    const sel = document.getElementById('ambient-scene');
    if (sel && sel.value !== this.scene()) sel.value = this.scene();
    const vol = document.getElementById('ambient-volume');
    if (vol && document.activeElement !== vol) vol.value = String(Math.round(this.volume() * 100));
  },

  bind() {
    const sel = document.getElementById('ambient-scene');
    if (sel) sel.addEventListener('change', () => {
      safeStorageSet(AMBIENT_AUDIO_KEY, sel.value);
      if (sel.value === 'off') { this.stop(); this.render(); showToast('Trilha sonora desligada. Os sons de ação continuam.', 'info'); return; }
      if (this.playing) { this.stop({ remember: false }); this.start(); }
      this.render();
    });
    const vol = document.getElementById('ambient-volume');
    if (vol) vol.addEventListener('input', () => {
      safeStorageSet(AMBIENT_VOL_KEY, vol.value);
      this.fade(this.volume(), 0.2);
      this.fireVolume(this.volume() * 1.5);
    });
    const btn = document.getElementById('btn-ambient-audio');
    if (btn) btn.addEventListener('click', () => this.toggle());
    // O navegador só libera áudio depois de um gesto: retoma o que estava tocando
    if (safeStorageGet(AMBIENT_ON_KEY, 'off') === 'on' && this.scene() !== 'off') {
      const resume = () => { if (!this.playing) this.start(); };
      document.addEventListener('pointerdown', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    }
    this.render();
  }
};

// =============================================================================
// 8k. SINCRONIZAÇÃO ENTRE APARELHOS
// Usa a função /.netlify/functions/sync (Netlify Blobs). Um "espaço" é
// identificado por um código e protegido por um PIN. Nada sai da ficha sem
// que o jogador mande.
// =============================================================================
const SYNC_CODE_KEY = 'v20_sync_code';
const SYNC_PIN_KEY = 'v20_sync_pin';
const SYNC_AUTO_KEY = 'v20_sync_auto';
const SYNC_LAST_KEY = 'v20_sync_last';

const SyncManager = {
  endpoint() { return `${location.origin}/.netlify/functions/sync`; },

  available() { return location.protocol === 'http:' || location.protocol === 'https:'; },

  code() { return safeStorageGet(SYNC_CODE_KEY, ''); },
  pin() { return safeStorageGet(SYNC_PIN_KEY, ''); },
  autoOn() { return safeStorageGet(SYNC_AUTO_KEY, 'off') === 'on'; },

  newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  },

  newPin() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return String(bytes[0] % 1000000).padStart(6, '0');
  },

  ensureIdentity() {
    if (!this.code()) safeStorageSet(SYNC_CODE_KEY, this.newCode());
    if (!this.pin()) safeStorageSet(SYNC_PIN_KEY, this.newPin());
  },

  deviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Este aparelho';
  },

  payload() {
    return {
      format: 'ficha-v20-sync',
      version: APP_VERSION,
      device: this.deviceName(),
      savedAt: new Date().toISOString(),
      characters: AppState.characters
    };
  },

  async request(method, body) {
    const url = method === 'GET'
      ? `${this.endpoint()}?code=${encodeURIComponent(this.code())}&pin=${encodeURIComponent(this.pin())}`
      : this.endpoint();
    const res = await fetch(url, {
      method,
      headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({ code: this.code(), pin: this.pin(), ...body })
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* resposta sem corpo */ }
    if (!res.ok) {
      const msg = data.error || (res.status === 404
        ? 'Nada guardado com esse código ainda.'
        : `O servidor respondeu ${res.status}. A sincronização está publicada no site?`);
      throw new Error(msg);
    }
    return data;
  },

  async upload({ silent = false } = {}) {
    if (!this.guard()) return false;
    this.ensureIdentity();
    this.setBusy(true, 'Enviando…');
    try {
      const data = await this.request('POST', { payload: this.payload() });
      safeStorageSet(SYNC_LAST_KEY, data.updatedAt || new Date().toISOString());
      if (!silent) showToast(`☁️ ${AppState.characters.length} ficha(s) enviadas. Use o mesmo código e PIN no outro aparelho.`, 'success');
      this.render();
      return true;
    } catch (e) {
      showToast(`Não deu para enviar: ${e.message}`, 'danger');
      return false;
    } finally {
      this.setBusy(false);
    }
  },

  async download() {
    if (!this.guard()) return false;
    this.setBusy(true, 'Baixando…');
    try {
      const data = await this.request('GET');
      const chars = (data.payload && data.payload.characters) || [];
      if (!chars.length) { showToast('O espaço está vazio.', 'info'); return false; }
      const result = this.merge(chars);
      safeStorageSet(SYNC_LAST_KEY, data.updatedAt || new Date().toISOString());
      showToast(`☁️ ${result.added} nova(s) e ${result.updated} atualizada(s) — vindas de ${data.device || 'outro aparelho'}.`, 'success');
      this.render();
      return true;
    } catch (e) {
      showToast(`Não deu para baixar: ${e.message}`, 'danger');
      return false;
    } finally {
      this.setBusy(false);
    }
  },

  /** Junta as fichas de fora com as daqui: mesma ficha, fica a versão mais recente. */
  merge(incoming) {
    let added = 0;
    let updated = 0;
    incoming.forEach(remote => {
      if (!remote || !remote.header) return;
      const mine = AppState.characters.find(c => c.id === remote.id);
      normalizeCharacter(remote);
      if (!mine) {
        AppState.characters.push(remote);
        added++;
        return;
      }
      const mineAt = Date.parse(mine.updatedAt || 0) || 0;
      const remoteAt = Date.parse(remote.updatedAt || 0) || 0;
      if (remoteAt > mineAt) {
        Object.assign(mine, remote);
        updated++;
      }
    });
    AppState.saveToStorage();
    UIRenderer.updateDropdown();
    UIRenderer.renderAll();
    return { added, updated };
  },

  guard() {
    if (this.available()) return true;
    showToast('A sincronização só funciona no site publicado (https), não no arquivo aberto do disco.', 'danger');
    return false;
  },

  setBusy(on, label) {
    const box = document.getElementById('sync-status');
    if (box && on) box.textContent = label || 'Trabalhando…';
    ['btn-sync-upload', 'btn-sync-download'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = on;
    });
    if (!on) this.render();
  },

  /** Envio automático depois de mexer na ficha (só se ligado). */
  scheduleAuto() {
    if (!this.autoOn() || !this.available() || !this.code()) return;
    clearTimeout(this._auto);
    this._auto = setTimeout(() => this.upload({ silent: true }), 4000);
  },

  render() {
    const codeEl = document.getElementById('sync-code');
    const pinEl = document.getElementById('sync-pin');
    if (codeEl && document.activeElement !== codeEl) codeEl.value = this.code();
    if (pinEl && document.activeElement !== pinEl) pinEl.value = this.pin();
    const auto = document.getElementById('sync-auto');
    if (auto) auto.checked = this.autoOn();
    const status = document.getElementById('sync-status');
    if (status) {
      const last = safeStorageGet(SYNC_LAST_KEY, '');
      let when = 'ainda não sincronizado neste aparelho';
      if (last) {
        try { when = `última sincronização: ${new Date(last).toLocaleString('pt-BR')}`; } catch (e) { when = `última sincronização: ${last}`; }
      }
      status.textContent = this.available()
        ? `${AppState.characters.length} ficha(s) aqui · ${when}`
        : 'Abra pelo site publicado para sincronizar (o arquivo local não tem servidor).';
    }
  },

  open() {
    const m = document.getElementById('sync-modal');
    if (!m) return;
    this.ensureIdentity();
    this.render();
    m.classList.remove('hidden');
  },

  close() {
    const m = document.getElementById('sync-modal');
    if (m) m.classList.add('hidden');
  },

  bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('btn-open-sync', 'click', () => this.open());
    on('btn-close-sync', 'click', () => this.close());
    on('btn-sync-upload', 'click', () => this.upload());
    on('btn-sync-download', 'click', () => this.download());
    on('btn-sync-new-code', 'click', () => {
      safeStorageSet(SYNC_CODE_KEY, this.newCode());
      safeStorageSet(SYNC_PIN_KEY, this.newPin());
      safeStorageSet(SYNC_LAST_KEY, '');
      this.render();
      showToast('Novo espaço criado. Use o novo código e PIN nos outros aparelhos.', 'info');
    });
    on('btn-sync-copy', 'click', () => copyTextToClipboard(`Ficha V20 — código: ${this.code()} · PIN: ${this.pin()}`, 'Código e PIN copiados.'));
    on('sync-code', 'change', e => {
      const v = String(e.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
      safeStorageSet(SYNC_CODE_KEY, v);
      this.render();
    });
    on('sync-pin', 'change', e => {
      const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 8);
      safeStorageSet(SYNC_PIN_KEY, v);
      this.render();
    });
    on('sync-auto', 'change', e => {
      safeStorageSet(SYNC_AUTO_KEY, e.target.checked ? 'on' : 'off');
      showToast(e.target.checked
        ? 'Envio automático ligado: as mudanças sobem sozinhas alguns segundos depois.'
        : 'Envio automático desligado.', 'info');
    });
    const m = document.getElementById('sync-modal');
    if (m) {
      m.addEventListener('click', e => { if (e.target === m) this.close(); });
      m.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    }
    this.render();
  }
};

/**
 * Catálogos do Grimório (arquivos locais do projeto).
 * Abre uma busca com rituais, feitiços e poderes e cria o item já preenchido.
 */
const GrimoireCatalog = {
  query: '',
  kind: 'ritual',

  source(kind) {
    if (kind === 'ritual') {
      return (typeof RITUAIS_DATA !== 'undefined' ? RITUAIS_DATA : []).map(r => ({
        nome: r.nome, nivel: r.nivel, grupo: r.escola, efeito: r.efeito,
        tradition: /necroman/i.test(r.escola) ? 'necromancia' : 'taumaturgia'
      }));
    }
    if (kind === 'spell') {
      return (typeof FEITICOS_DATA !== 'undefined' ? FEITICOS_DATA : []).map(f => ({
        nome: f.nome, nivel: f.nivel, grupo: `${f.trilha} · ${f.escola}`, efeito: f.efeito, trilha: f.trilha,
        tradition: /necroman/i.test(f.escola) ? 'necromancia' : 'taumaturgia'
      }));
    }
    return (typeof PODERES_DATA !== 'undefined' ? PODERES_DATA : []).map(p => ({
      nome: p.nome, nivel: p.nivel, grupo: p.disciplina, efeito: p.efeito,
      discipline: p.disciplina, parada: p.parada
    }));
  },

  /** Primeiro o que combina com as Disciplinas da ficha, depois o resto. */
  list(char, kind) {
    const all = this.source(kind);
    const q = stripAccents(this.query.toLowerCase().trim());
    const filtered = q
      ? all.filter(x => stripAccents(`${x.nome} ${x.grupo} ${x.efeito}`.toLowerCase()).includes(q))
      : all;
    const owned = (char.disciplines || []).map(d => stripAccents((d.name || '').toLowerCase()));
    const relevante = (x) => owned.some(n => n && stripAccents(x.grupo.toLowerCase()).split(/[^a-z]+/).some(w => w.length > 3 && n.includes(w)));
    return [...filtered.filter(relevante), ...filtered.filter(x => !relevante(x))];
  },

  /** Traduz a parada do catálogo ("Percepção + Prontidão") para os campos da ficha. */
  parsePool(parada) {
    if (!parada || parada === '—') return {};
    const rows = [...document.querySelectorAll('.trait-row[data-trait]')];
    const find = (txt) => {
      const alvo = stripAccents(txt.toLowerCase().trim());
      const row = rows.find(r => stripAccents((r.getAttribute('data-label') || '').toLowerCase()) === alvo);
      return row ? row.getAttribute('data-trait') : '';
    };
    const [a, b] = String(parada).split('+').map(x => x.trim());
    const out = {};
    const primary = a ? find(a) : '';
    const secondary = b ? find(b) : '';
    if (primary) out.primary = primary;
    if (secondary) out.secondary = secondary;
    return out;
  },

  add(char, item) {
    const kind = this.kind;
    const base = {
      kind,
      name: item.nome,
      level: clampInt(item.nivel, 1, 9, 1),
      description: item.trilha ? `${item.trilha}: ${item.efeito || ''}` : (item.efeito || '')
    };
    if (kind === 'power') {
      base.discipline = item.discipline || '';
      base.diffMode = 'fixed';
      base.difficulty = 6;
      Object.assign(base, this.parsePool(item.parada));
    } else {
      base.tradition = item.tradition || 'taumaturgia';
      if (kind === 'ritual') {
        base.primary = 'attributes.mental.intelligence';
        base.secondary = 'abilities.knowledges.occult';
      }
    }
    const sp = SpellManager.normalize(base);
    SpellManager.list(char).push(sp);
    AppState.saveToStorage();
    SpellManager.setTab(kind);
    SpellManager.render(char);
    showToast(`${GRIMOIRE_KINDS[kind].icon} “${sp.name}” adicionado ao Grimório.`, 'success');
  },

  render() {
    const char = AppState.activeCharacter;
    const box = document.getElementById('catalog-list');
    if (!box || !char) return;
    const items = this.list(char, this.kind);
    const count = document.getElementById('catalog-count');
    if (count) count.textContent = `${items.length} item(ns)`;
    document.querySelectorAll('[data-catalog-kind]').forEach(b => {
      const on = b.dataset.catalogKind === this.kind;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    box.innerHTML = '';
    if (!items.length) {
      // Talvez o que ele procura esteja em outra aba
      const outras = ['ritual', 'spell', 'power']
        .filter(k => k !== this.kind)
        .map(k => ({ k, n: this.list(char, k).length }))
        .filter(x => x.n > 0);
      const dica = outras.length
        ? ` Em ${outras.map(x => `${GRIMOIRE_KINDS[x.k].plural} (${x.n})`).join(' e ')} há resultados.`
        : '';
      box.innerHTML = `<li class="catalog-empty">Nada encontrado nesta aba.${escapeHtml(dica)}</li>`;
      return;
    }
    items.slice(0, 120).forEach(item => {
      const li = document.createElement('li');
      li.className = 'catalog-item';
      li.innerHTML = `
        <span class="catalog-level">${item.nivel}</span>
        <span class="catalog-info">
          <strong>${escapeHtml(item.nome)}</strong>
          <small>${escapeHtml(item.grupo)}${item.parada && item.parada !== '—' ? ` · ${escapeHtml(item.parada)}` : ''}</small>
          <em>${escapeHtml(item.efeito || '')}</em>
        </span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-tiny';
      btn.textContent = '＋ Adicionar';
      btn.addEventListener('click', () => this.add(char, item));
      li.appendChild(btn);
      box.appendChild(li);
    });
  },

  open(kind) {
    const m = document.getElementById('catalog-modal');
    if (!m) return;
    this.kind = GRIMOIRE_KINDS[kind] ? kind : SpellManager.activeTab;
    this.query = '';
    const input = document.getElementById('catalog-search');
    if (input) input.value = '';
    this.render();
    m.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 40);
  },

  close() {
    const m = document.getElementById('catalog-modal');
    if (m) m.classList.add('hidden');
  },

  bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('btn-open-catalog', 'click', () => this.open(SpellManager.activeTab));
    on('btn-close-catalog', 'click', () => this.close());
    on('catalog-search', 'input', e => { this.query = e.target.value; this.render(); });
    document.querySelectorAll('[data-catalog-kind]').forEach(b => {
      b.addEventListener('click', () => { this.kind = b.dataset.catalogKind; this.render(); });
    });
    const m = document.getElementById('catalog-modal');
    if (m) {
      m.addEventListener('click', e => { if (e.target === m) this.close(); });
      m.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    }
  }
};

const BALANCE_KEY = 'v20_card_balance';

/**
 * Arrumação dos quadros.
 *
 * Os quadros ficam na ordem padrão, cada um na sua coluna (o Ponto de Sangue
 * continua no centro). Aqui só cuidamos de duas coisas:
 *  1. limpar sobras da versão anterior, que tentava remanejar os quadros;
 *  2. impedir que um quadro arrastado fique por cima de outro — se isso
 *     acontecer, a posição dele volta ao lugar de origem.
 *
 * O espaçamento fluido e o "não esticar" ficam por conta do CSS.
 */
const CardBalancer = {
  /** Remove estilos que a versão 2.3 gravava nos quadros e nas grades. */
  cleanup() {
    document.querySelectorAll('[data-window-id]').forEach(card => {
      if (card.style.gridRowEnd) card.style.gridRowEnd = '';
    });
    document.querySelectorAll('.two-col-grid, .three-col-grid').forEach(grid => {
      if (grid.style.gridAutoRows) grid.style.gridAutoRows = '';
      if (grid.style.alignItems) grid.style.alignItems = '';
    });
  },

  rect(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, left: r.left + window.scrollX, bottom: r.bottom + window.scrollY, right: r.right + window.scrollX };
  },

  overlap(a, b) {
    const margem = 6;
    return a.left < b.right - margem && b.left < a.right - margem
      && a.top < b.bottom - margem && b.top < a.bottom - margem;
  },

  /** Quadro arrastado que cobre outro volta para a posição original. */
  fixOverlaps({ silent = false } = {}) {
    const cards = [...document.querySelectorAll('[data-window-id]')]
      .filter(c => c.offsetParent !== null && !c.classList.contains('is-card-hidden'));
    const movidos = cards.filter(c => c.classList.contains('is-custom-positioned'));
    if (!movidos.length) return 0;

    let corrigidos = 0;
    movidos.forEach(card => {
      const meu = this.rect(card);
      const bate = cards.some(outro => outro !== card && this.overlap(meu, this.rect(outro)));
      if (!bate) return;
      card.style.transform = '';
      card.classList.remove('is-custom-positioned');
      const id = card.dataset.windowId;
      if (DraggableWindowManager.positions[id]) {
        delete DraggableWindowManager.positions[id].x;
        delete DraggableWindowManager.positions[id].y;
        DraggableWindowManager.savePositions();
      }
      corrigidos++;
    });
    if (corrigidos && !silent) {
      showToast(`${corrigidos} quadro(s) estavam por cima de outros e voltaram ao lugar.`, 'info');
      LinkCableSystem.updateWebLines();
    }
    return corrigidos;
  },

  /**
   * Reequilibra as colunas das Vantagens quando uma delas fica muito maior que
   * as outras — por exemplo depois de ocultar, minimizar ou expandir um quadro.
   * A ordem padrão é o ponto de partida e quadros arrastados à mão ficam onde
   * estão; quem for movido perde o deslocamento antigo, para nunca sobrepor.
   */
  remember(grid) {
    if (grid.dataset.orderSaved) return;
    [...grid.querySelectorAll(':scope > .vantagens-col > [data-window-id]')]
      .forEach((card, i) => { card.dataset.originalOrder = String(i); });
    grid.dataset.orderSaved = '1';
  },

  columnsOf(grid) { return [...grid.querySelectorAll(':scope > .vantagens-col')]; },

  singleColumn(grid) {
    return (getComputedStyle(grid).gridTemplateColumns || '').split(' ').filter(Boolean).length <= 1;
  },

  columnHeights(cols) {
    return cols.map(col => [...col.children]
      .filter(c => c.dataset.windowId && !c.classList.contains('is-card-hidden'))
      .reduce((total, c) => total + c.getBoundingClientRect().height + 14, 0));
  },

  balance(grid, { force = false } = {}) {
    this.remember(grid);
    const cols = this.columnsOf(grid);
    if (cols.length < 2) return false;

    const cards = [...grid.querySelectorAll(':scope > .vantagens-col > [data-window-id]')]
      .sort((a, b) => (+a.dataset.originalOrder || 0) - (+b.dataset.originalOrder || 0));

    if (this.singleColumn(grid)) {
      // Celular: volta à ordem original, em sequência
      const porColuna = Math.ceil(cards.length / cols.length);
      cards.forEach((card, i) => {
        const alvo = cols[Math.min(cols.length - 1, Math.floor(i / porColuna))];
        if (card.parentElement !== alvo) alvo.appendChild(card);
      });
      return false;
    }

    const alturas = this.columnHeights(cols);
    const desnivel = Math.max(...alturas) - Math.min(...alturas);
    const maiorQuadro = Math.max(...cards.map(c => c.getBoundingClientRect().height || 0));
    // Só mexe quando o desnível é maior que um quadro médio: evita dança de caixas
    if (!force && desnivel < Math.max(180, maiorQuadro * 0.8)) return false;

    const soma = new Array(cols.length).fill(0);
    const plano = cols.map(() => []);
    const altura = card => card.classList.contains('is-card-hidden')
      ? 0
      : (card.getBoundingClientRect().height || 0) + 14;

    // Quadros fixos: o Ponto de Sangue mora sempre na coluna do meio
    const meio = Math.floor(cols.length / 2);
    const fixos = { 'win-blood': meio };
    cards.forEach(card => {
      const col = fixos[card.dataset.windowId];
      if (col === undefined) return;
      plano[col].push(card);
      soma[col] += altura(card);
    });

    cards.forEach(card => {
      if (fixos[card.dataset.windowId] !== undefined) return;
      let idx = 0;
      for (let i = 1; i < soma.length; i++) if (soma[i] < soma[idx] - 0.5) idx = i;
      plano[idx].push(card);
      soma[idx] += altura(card);
    });

    // Dentro de cada coluna, mantém a ordem padrão da ficha
    plano.forEach(lista => lista.sort((a, b) => (+a.dataset.originalOrder || 0) - (+b.dataset.originalOrder || 0)));

    let mexeu = false;
    plano.forEach((lista, i) => {
      const atual = [...cols[i].children].filter(c => c.dataset.windowId);
      const igual = atual.length === lista.length && atual.every((el, j) => el === lista[j]);
      if (igual) return;
      lista.forEach(card => {
        if (card.parentElement !== cols[i]) {
          // Quadro que muda de coluna não pode manter o deslocamento antigo
          card.style.transform = '';
          card.classList.remove('is-custom-positioned');
          const pos = DraggableWindowManager.positions[card.dataset.windowId];
          if (pos) { delete pos.x; delete pos.y; DraggableWindowManager.savePositions(); }
          mexeu = true;
        }
        cols[i].appendChild(card);
      });
    });
    return mexeu;
  },

  run({ force = false } = {}) {
    this.cleanup();
    let mexeu = false;
    document.querySelectorAll('.advantages-unified-grid').forEach(g => {
      if (this.balance(g, { force })) mexeu = true;
    });
    this.fixOverlaps();
    if (mexeu) LinkCableSystem.updateWebLines();
    return mexeu;
  },

  schedule({ force = false } = {}) {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._force = this._force || force;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      const f = this._force;
      this._force = false;
      // Espera o navegador terminar de redesenhar antes de medir
      setTimeout(() => this.run({ force: f }), 60);
    });
  },

  bind() {
    this.cleanup();
    window.addEventListener('resize', () => this.schedule());
    // Quadro que cresce ou encolhe pede um reequilíbrio
    if (window.ResizeObserver && !this._ro) {
      this._ro = new ResizeObserver(() => this.schedule());
      document.querySelectorAll('[data-window-id]').forEach(c => this._ro.observe(c));
    }
    // Primeira arrumação já sai equilibrada
    setTimeout(() => this.run({ force: true }), 700);
  },

  observe(card) { if (this._ro && card) this._ro.observe(card); }
};

/** Mensagem simples no webhook do Discord (usada pela Iniciativa). */
async function sendDiscordText(text) {
  if (typeof DiscordIntegration === 'undefined') return;
  const url = DiscordIntegration.getUrl();
  if (!url) return;
  const char = AppState.activeCharacter;
  const name = (char && char.header && char.header.name) || 'Ficha V20';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name.slice(0, 80), content: text.slice(0, 1900) })
    });
    if (res && !res.ok && res.status !== 204) showToast(`O Discord recusou a mensagem (erro ${res.status}).`, 'danger');
  } catch (e) {
    showToast('Não foi possível enviar ao Discord (sem conexão?).', 'danger');
  }
}

/**
 * Reserva de sangue interativa:
 * - arrastar sobre os pontos preenche ou esvazia o trecho (segue o estado do 1º ponto);
 * - Shift + clique aplica o estado do último ponto clicado a todo o intervalo;
 * - arrastar a barra líquida define a quantidade total;
 * - campo numérico com ＋/− adiciona ou retira pontos de uma vez.
 * Ajustes manuais não contam no limite de gasto por turno.
 */
const BloodPoolUI = {
  anchor: null,
  drag: null,
  meterDrag: null,

  pool(char) {
    syncBloodPoolWithGeneration(char);
    return char.status.blood_pool;
  },

  commit(char, message) {
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    if (message) showToast(message, 'info');
  },

  /** Mostra o trecho arrastado sem recriar os pontos. */
  preview(char) {
    const d = this.drag;
    if (!d) return;
    const lo = Math.min(d.start, d.current);
    const hi = Math.max(d.start, d.current);
    const next = d.snapshot.map((v, i) => (i >= lo && i <= hi ? d.state : v));
    document.querySelectorAll('#blood-pool-grid .blood-point').forEach((el, i) => {
      el.classList.toggle('active', !!next[i]);
      el.classList.toggle('in-range', i >= lo && i <= hi && hi > lo);
    });
    const counter = document.getElementById('blood-count-display');
    if (counter) counter.textContent = `${next.filter(Boolean).length} / ${next.length}`;
    d.next = next;
  },

  setRange(char, a, b, state) {
    const pool = this.pool(char);
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(pool.length - 1, Math.max(a, b));
    let changed = 0;
    for (let i = lo; i <= hi; i++) {
      if (pool[i] !== state) { pool[i] = state; changed++; }
    }
    return changed;
  },

  /** Preenche os N primeiros pontos e esvazia o resto. */
  setCount(char, count) {
    const pool = this.pool(char);
    const n = Math.max(0, Math.min(count, pool.length));
    for (let i = 0; i < pool.length; i++) pool[i] = i < n;
    return n;
  },

  /** delta > 0 enche pontos vazios; delta < 0 esvazia os últimos cheios. */
  adjust(delta) {
    const char = AppState.activeCharacter;
    if (!char || !delta) return;
    const pool = this.pool(char);
    let done = 0;
    if (delta > 0) {
      for (let i = 0; i < pool.length && done < delta; i++) if (!pool[i]) { pool[i] = true; done++; }
    } else {
      for (let i = pool.length - 1; i >= 0 && done < -delta; i--) if (pool[i]) { pool[i] = false; done++; }
    }
    const total = getBloodCount(char);
    if (!done) {
      showToast(delta > 0 ? `A reserva já está cheia (${total}/${pool.length}).` : 'A reserva já está vazia.', 'info');
      return;
    }
    const partial = done < Math.abs(delta) ? ` (só ${done} cabia${done > 1 ? 'm' : ''})` : '';
    this.commit(char, `${delta > 0 ? '+' : '−'}${done} ponto(s) de sangue${partial}. Reserva: ${total}/${pool.length}.`);
  },

  pointFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pt = el && el.closest ? el.closest('#blood-pool-grid .blood-point') : null;
    return pt ? parseInt(pt.dataset.index, 10) : null;
  },

  bindGrid(grid) {
    grid.addEventListener('pointerdown', e => {
      const pt = e.target.closest('.blood-point');
      if (!pt || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const char = AppState.activeCharacter;
      if (!char) return;
      const i = parseInt(pt.dataset.index, 10);
      const pool = this.pool(char);

      if (e.shiftKey && this.anchor && this.anchor.index < pool.length) {
        e.preventDefault();
        const { index, state } = this.anchor;
        const changed = this.setRange(char, index, i, state);
        this.anchor = { index: i, state };
        const count = Math.abs(i - index) + 1;
        this.commit(char, changed
          ? `${state ? 'Adicionados' : 'Consumidos'} ${changed} ponto(s) no intervalo ${Math.min(i, index) + 1}–${Math.max(i, index) + 1}.`
          : `O intervalo de ${count} ponto(s) já estava ${state ? 'cheio' : 'vazio'}.`);
        return;
      }

      if (e.pointerType === 'mouse') e.preventDefault();
      this.drag = { start: i, current: i, state: !pool[i], pointerId: e.pointerId, snapshot: [...pool] };
      this.preview(char);
    });

    grid.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      const i = this.pointFromEvent(e);
      if (i === null || i === d.current) return;
      d.current = i;
      this.preview(AppState.activeCharacter);
    });

    const finish = e => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      this.drag = null;
      const char = AppState.activeCharacter;
      if (e.type === 'pointercancel' || !d.next) {
        UIRenderer.renderBloodPool(char);
        return;
      }
      const pool = this.pool(char);
      d.next.forEach((v, i) => { pool[i] = v; });
      this.anchor = { index: d.current, state: d.state };
      const n = Math.abs(d.current - d.start) + 1;
      this.commit(char, n > 1 ? `${d.state ? 'Adicionados' : 'Consumidos'} ${n} ponto(s) de sangue.` : '');
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  },

  meterCountFromEvent(meter, e) {
    const char = AppState.activeCharacter;
    const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
    const rect = meter.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(ratio * rule.maxBlood);
  },

  bindMeter(meter) {
    meter.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const char = AppState.activeCharacter;
      if (!char) return;
      e.preventDefault();
      try { meter.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      this.meterDrag = { pointerId: e.pointerId, before: getBloodCount(char) };
      meter.classList.add('is-dragging');
      this.setCount(char, this.meterCountFromEvent(meter, e));
      UIRenderer.renderBloodPool(char);
    });
    meter.addEventListener('pointermove', e => {
      const md = this.meterDrag;
      if (!md || e.pointerId !== md.pointerId) return;
      const char = AppState.activeCharacter;
      const count = this.meterCountFromEvent(meter, e);
      if (count === getBloodCount(char)) return;
      if (md.raf) return;
      md.raf = requestAnimationFrame(() => {
        md.raf = null;
        this.setCount(char, count);
        UIRenderer.renderBloodPool(char);
      });
    });
    const end = e => {
      const md = this.meterDrag;
      if (!md || e.pointerId !== md.pointerId) return;
      this.meterDrag = null;
      meter.classList.remove('is-dragging');
      const char = AppState.activeCharacter;
      const after = getBloodCount(char);
      if (after !== md.before) this.commit(char, `Reserva ajustada: ${md.before} → ${after}.`);
    };
    meter.addEventListener('pointerup', end);
    meter.addEventListener('pointercancel', end);

    // Teclado: setas ±1, PageUp/PageDown ±5, Home/End
    meter.addEventListener('keydown', e => {
      const char = AppState.activeCharacter;
      if (!char) return;
      const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
      const cur = getBloodCount(char);
      const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
      let next = null;
      if (e.key in map) next = cur + map[e.key];
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = rule.maxBlood;
      if (next === null) return;
      e.preventDefault();
      this.setCount(char, Math.max(0, Math.min(rule.maxBlood, next)));
      AppState.saveToStorage();
      UIRenderer.renderBloodPool(char);
      const again = document.getElementById('blood-liquid-meter');
      if (again) again.focus();
    });
  },

  bind() {
    const grid = document.getElementById('blood-pool-grid');
    if (grid) this.bindGrid(grid);
    const meter = document.getElementById('blood-liquid-meter');
    if (meter) this.bindMeter(meter);
    const amount = document.getElementById('blood-adjust-amount');
    const read = () => clampInt(amount && amount.value, 1, 200, 1);
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-blood-adjust-add', () => this.adjust(read()));
    on('btn-blood-adjust-remove', () => this.adjust(-read()));
    if (amount) {
      amount.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); this.adjust(e.shiftKey ? -read() : read()); }
      });
    }
  },

  /** Marca o último ponto clicado (âncora do Shift + clique). */
  decorate(char) {
    const pts = document.querySelectorAll('#blood-pool-grid .blood-point');
    pts.forEach(el => el.classList.remove('is-anchor', 'in-range'));
    if (this.anchor && pts[this.anchor.index]) pts[this.anchor.index].classList.add('is-anchor');
  }
};

/** Despertar: gasta 1 ponto de sangue e renova turno e cena. */
Object.assign(BloodActions, {
  wake() {
    const char = AppState.activeCharacter;
    if (!char) return;
    ensureTurnState(char);
    if (getBloodCount(char) < 1) {
      showToast('Sem sangue para despertar: o Narrador decide (fome, frenesi ou torpor).', 'danger');
      return;
    }
    const res = spendBlood(char, 1, { ignoreTurnLimit: true });
    if (!res.ok) { showToast(res.reason, 'danger'); return; }
    char.status.turn_blood_spent = 0;
    char.status.physical_boosts = { strength: 0, dexterity: 0, stamina: 0 };
    PhysicalDisciplines.resetTurn(char);
    AmbientAudio.wakeSound();
    FX.bloodToHealth(1);
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
    UIRenderer.renderAllDots(char);
    LinkCableSystem.refreshNodeValues();
    PhysicalDisciplines.refreshAll(char);
    showToast(`🌙 Despertar: −1 ponto de sangue (restam ${getBloodCount(char)}). Nova noite, turno e cena renovados.`, 'info');
  }
});

/** Texto compacto do personagem para colar numa crônica com o Narrador. */
const StorytellerSummary = {
  dots(obj, prefix) {
    return Object.keys(obj || {})
      .map(k => ({ label: getTraitLabel(`${prefix}.${k}`), v: parseInt(obj[k], 10) || 0 }))
      .filter(x => x.v > 0)
      .map(x => `${x.label} ${x.v}`)
      .join(', ');
  },

  named(list, extra = () => '') {
    return (list || [])
      .filter(i => i && i.name && i.name.trim())
      .map(i => `${i.name.trim()}${i.level !== undefined ? ` ${i.level}` : ''}${extra(i)}`)
      .join(', ');
  },

  build(char) {
    const h = char.header || {};
    const ed = EditionManager.info(char);
    const rule = getGenerationRule(h.generation);
    const lines = [];
    const add = (label, value) => { if (value && String(value).trim()) lines.push(`${label}: ${value}`); };

    lines.push(`=== ${h.name || 'Sem nome'} — ${h.clan || 'Clã?'}, ${rule.label} (${ed.label}) ===`);
    add('Jogador / Crônica', [h.player, h.chronicle].filter(Boolean).join(' · '));
    add('Natureza / Comportamento', [h.nature, h.demeanor].filter(Boolean).join(' / '));
    add('Conceito', h.concept);
    add('Senhor', h.sire);

    const a = char.attributes || {};
    add('Atributos', [this.dots(a.physical, 'attributes.physical'), this.dots(a.social, 'attributes.social'), this.dots(a.mental, 'attributes.mental')].filter(Boolean).join(' | '));
    const ab = char.abilities || {};
    add('Talentos', this.dots(ab.talents, 'abilities.talents'));
    add('Perícias', this.dots(ab.skills, 'abilities.skills'));
    add('Conhecimentos', this.dots(ab.knowledges, 'abilities.knowledges'));
    add('Especializações', (char.specializations || []).filter(s => s.name && s.name.trim()).map(s => s.name.trim()).join(', '));

    add('Disciplinas', this.named(char.disciplines, d => {
      const cat = XPManager.disciplineCategory(char, d);
      return cat.key === 'clan' ? ' (clã)' : '';
    }));
    add('Trilhas', this.named(char.paths, p => (XPManager.isPrimaryPath(p) ? ' (principal)' : '')));
    const rituals = SpellManager.ofKind(char, 'ritual').filter(r => r.name && r.name.trim());
    const spells = SpellManager.ofKind(char, 'spell').filter(r => r.name && r.name.trim());
    add('Rituais', rituals.map(r => `${r.name.trim()} (nv ${r.level})`).join(', '));
    add('Feitiços', spells.map(r => `${r.name.trim()} (nv ${r.level}, ${SpellManager.costText(r)})`).join(', '));
    add('Poderes', SpellManager.ofKind(char, 'power').filter(r => r.name && r.name.trim())
      .map(r => `${r.name.trim()} (${r.discipline || 'Disciplina'} ${r.level})`).join(', '));
    add('Antecedentes', this.named(char.backgrounds));

    const v = char.virtues || {};
    add('Virtudes', `${getTraitLabel('virtues.conscience')} ${v.conscience || 0}, ${getTraitLabel('virtues.self_control')} ${v.self_control || 0}, ${getTraitLabel('virtues.courage')} ${v.courage || 0}`);
    const s = char.status || {};
    add(ed.summaryLabel, `${(s.path_name || 'Humanidade').trim()} ${s.humanity || 0}`);
    add('Força de Vontade', `${s.willpower_perm || 0} (disponível ${getWillpowerAvailable(char)})`);
    add('Sangue', `${getBloodCount(char)}/${rule.maxBlood} (gasta até ${rule.bloodPerTurn}/turno)`);
    const wound = getWoundState(char);
    add('Vitalidade', wound.index < 0 ? 'ileso' : `${wound.label}${wound.penalty ? ` (−${wound.penalty} dados)` : ''}`);

    add('Armas', (char.weapons || []).filter(w => w.name).map(w => {
      const type = { bashing: 'contusivo', lethal: 'letal', aggravated: 'agravado' }[w.damageType] || w.damageType;
      return `${w.name} (${getTraitLabel(w.attackAttr)}+${getTraitLabel(w.attackAbility)}, dif ${w.difficulty}; dano ${getTraitLabel(w.damageAttr)}${w.damageBonus ? `+${w.damageBonus}` : ''} ${type})`;
    }).join('; '));
    add('Qualidades', (char.merits_flaws_list || []).filter(m => m.type === 'qualidade').map(m => `${m.name} (${m.points})`).join(', '));
    add('Defeitos', (char.merits_flaws_list || []).filter(m => m.type !== 'qualidade').map(m => `${m.name} (${m.points})`).join(', '));
    const notes = char.notes || {};
    const clip = (txt, n) => { const t = String(txt || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
    add('Qualidades/Defeitos (anotações)', clip(notes.merits_flaws, 400));
    add('Fraqueza', clip(notes.weakness, 300));

    const t = XPManager.totals(char);
    if (XPManager.state(char).initialized) add('XP', `disponível ${t.available} (total ${t.total}, gasto ${t.spent})`);
    const goals = GoalPlanner.goals(char).filter(g => !GoalPlanner.isDone(char, g));
    if (goals.length) {
      add('Objetivos', goals.map(g => (g.kind === 'trait'
        ? `${GoalPlanner.label(char, g)} → ${g.target}`
        : GoalPlanner.label(char, g))).join(', '));
    }
    return lines.join('\n');
  },

  open() {
    const char = AppState.activeCharacter;
    const modal = document.getElementById('summary-modal');
    if (!char || !modal) return;
    const out = document.getElementById('summary-output');
    if (out) out.value = this.build(char);
    const count = document.getElementById('backup-count');
    if (count) count.textContent = AppState.characters.length;
    const share = document.getElementById('btn-summary-share');
    if (share) share.hidden = !(navigator.share);
    modal.classList.remove('hidden');
    setTimeout(() => { if (out) out.focus(); }, 30);
  },

  close() {
    const modal = document.getElementById('summary-modal');
    if (modal) modal.classList.add('hidden');
  },

  share() {
    const out = document.getElementById('summary-output');
    if (!out || !navigator.share) return;
    navigator.share({ title: 'Resumo do personagem', text: out.value }).catch(() => {});
  },

  bind() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('btn-open-summary', 'click', () => this.open());
    on('btn-close-summary', 'click', () => this.close());
    on('btn-summary-copy', 'click', () => {
      const out = document.getElementById('summary-output');
      if (out) copyTextToClipboard(out.value, 'Resumo copiado! Cole na conversa com o Narrador.');
    });
    on('btn-summary-share', 'click', () => this.share());
    on('btn-backup-all', 'click', () => BackupManager.exportAll());
    const modal = document.getElementById('summary-modal');
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) this.close(); });
      modal.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    }
  }
};

/** Backup de todas as fichas em um arquivo só (e importação desse arquivo). */
const BACKUP_FORMAT = 'ficha-v20-backup';
const BackupManager = {
  exportAll() {
    const chars = AppState.characters || [];
    if (!chars.length) { showToast('Não há fichas para exportar.', 'info'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), characters: chars };
    const filename = `Fichas_V20_backup_${stamp}.json`;
    saveTextFile(filename, JSON.stringify(payload, null, 2), 'application/json').then(result => {
      if (result === 'shared') showToast(`Backup com ${chars.length} ficha(s) pronto. Use “Salvar em Arquivos”.`, 'success');
      else if (result === 'downloaded') showToast(`Backup com ${chars.length} ficha(s) exportado: ${filename}`, 'success');
    });
  },

  isBackup(data) {
    return !!(data && data.format === BACKUP_FORMAT && Array.isArray(data.characters));
  },

  /** Importa todas as fichas do backup como cópias novas. */
  importAll(data) {
    let count = 0;
    let lastId = null;
    data.characters.forEach(c => {
      if (!c || typeof c !== 'object' || !c.header) return;
      c.id = generateUniqueId();
      normalizeCharacter(c);
      regenerateListIds(c);
      syncBloodPoolWithGeneration(c);
      AppState.characters.push(c);
      lastId = c.id;
      count++;
    });
    if (!count) throw new Error('Backup sem fichas válidas.');
    AppState.setActive(lastId);
    AppState.saveToStorage();
    UIRenderer.renderAll();
    return count;
  }
};

/** Efeitos leves: sem desfoque, aura lateral e brasas (economiza bateria). */
const FX_LITE_KEY = 'v20_fx_lite';
const LiteEffects = {
  enabled() { return safeStorageGet(FX_LITE_KEY, 'off') === 'on'; },

  apply() {
    const on = this.enabled();
    document.body.classList.toggle('fx-lite', on);
    const toggle = document.getElementById('toggle-fx-lite');
    if (toggle) toggle.checked = on;
    if (on) AmbientFX.stop(true); else AmbientFX.start();
  },

  bind() {
    const toggle = document.getElementById('toggle-fx-lite');
    if (toggle) {
      toggle.addEventListener('change', () => {
        safeStorageSet(FX_LITE_KEY, toggle.checked ? 'on' : 'off');
        this.apply();
        showToast(toggle.checked ? 'Efeitos leves ligados: menos animação e desfoque, mais bateria.' : 'Efeitos visuais completos restaurados.', 'info');
      });
    }
    this.apply();
  }
};

const ExtRenderer = {
  renderAll(char) {
    if (!char) return;
    ensureTurnState(char);
    ClanManager.sync(char);
    DerivedStats.renderHint(char);
    BloodMeter.render(char);
    this.renderWoundBadge(char);
    this.renderWillpowerBadge(char);
    CombatManager.render(char);
    MeritsFlawsManager.render(char);
    NotesManager.render(char);
    SectionLock.apply(char);
    GenerationStepper.render(char);
    XPManager.apply(char);
    GoalPlanner.apply(char);
    EditionManager.apply(char);
    Initiative.render(char);
    PhysicalDisciplines.render(char);
    SessionJournal.render(char);
    ChronicleClock.render(char);
    AggHealing.render(char);
    PortraitState.render(char);
    FX.render(char);
    ExtendedActions.render(char);
    LayoutManager.apply(char);
    CardBalancer.schedule();
    UndoManager.ensureBaseline();
  },

  renderWoundBadge(char) {
    const el = document.getElementById('wound-penalty-badge');
    if (!el || !char) return;
    const w = getWoundState(char);
    el.classList.toggle('is-hurt', w.penalty > 0);
    el.classList.toggle('is-incapacitated', w.incapacitated);
    el.textContent = w.incapacitated
      ? 'Incapacitado: não pode agir'
      : (w.index < 0 ? 'Ileso: sem penalidade' : `${w.label}: −${w.penalty} dado${w.penalty === 1 ? '' : 's'}`);
  },

  renderWillpowerBadge(char) {
    const el = document.getElementById('willpower-available');
    if (!el || !char) return;
    const perm = parseInt(char.status.willpower_perm, 10) || 0;
    el.textContent = `Disponível: ${getWillpowerAvailable(char)} de ${perm}`;
  },

  /** Adiciona a marca "+N" de bônus de sangue ao lado dos Atributos Físicos. */
  renderPhysicalBoostBadges(char) {
    Object.keys(PHYSICAL_KEYS).forEach(key => {
      const row = document.querySelector(`.trait-row[data-trait="attributes.physical.${key}"]`);
      if (!row) return;
      let badge = row.querySelector('.boost-badge');
      const boost = getPhysicalBoost(char, key);
      if (boost > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'boost-badge';
          row.querySelector('.trait-name').after(badge);
        }
        badge.textContent = `+${boost}`;
        badge.title = `+${boost} por sangue até o fim da cena`;
      } else if (badge) {
        badge.remove();
      }
    });
  }
};

const ExtEvents = {
  bind(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  },

  closeOnBackdrop(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  },

  init() {
    // Trava de seções, botões de Geração, sucessos garantidos e aviso inicial
    SectionLock.bindGuards();
    document.addEventListener('click', (e) => {
      const lockBtn = e.target.closest('[data-lock-toggle]');
      if (lockBtn) { SectionLock.toggle(lockBtn.getAttribute('data-lock-toggle')); return; }
      const genBtn = e.target.closest('[data-gen-step]');
      if (genBtn && !genBtn.disabled) GenerationStepper.step(parseInt(genBtn.getAttribute('data-gen-step'), 10));
    });
    this.bind('btn-quick-willpower', 'click', () => QuickRolls.willpower());
    document.querySelectorAll('[data-virtue-roll]').forEach(btn => {
      btn.addEventListener('click', () => QuickRolls.virtue(btn.dataset.virtueRoll));
    });
    SpellManager.bindTabs();
    XPManager.bind();
    GoalPlanner.bind();
    EditionManager.bind();
    StorytellerSummary.bind();
    LiteEffects.bind();
    Initiative.bind();
    CombatManager.bindBloodSelects();
    this.bind('btn-weapons-collapse-all', 'click', () => CombatManager.toggleAllWeapons());
    PhysicalDisciplines.bind();
    SessionJournal.bind();
    LayoutManager.bind();
    ChronicleClock.bind();
    PortraitState.bind();
    ExtendedActions.bind();
    CommandRoller.bind();
    CharacterWizard.bind();
    SyncManager.bind();
    GrimoireCatalog.bind();
    CardBalancer.bind();
    FX.bind();
    AmbientAudio.bind();
    document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = `v${APP_VERSION}`; });
    BloodPoolUI.bind();
    this.bind('btn-blood-wake', 'click', () => BloodActions.wake());
    Platform.init();
    this.bind('dock-guaranteed', 'change', (e) => {
      RollOptions.guaranteed = clampInt(e.target.value, 0, 10, 0);
      LinkCableSystem.updateDock();
    });
    WelcomeNotice.init();

    // Desfazer / Refazer / Renomear / PDF / Rolador livre
    // Menu Arquivo (exportar / importar / backup)
    const fileMenu = document.getElementById('file-menu');
    const fileList = document.getElementById('file-menu-list');
    const fileBtn = document.getElementById('btn-file-menu');
    if (fileMenu && fileList && fileBtn) {
      const setOpen = (open) => {
        fileList.hidden = !open;
        fileBtn.setAttribute('aria-expanded', String(open));
        fileMenu.classList.toggle('is-open', open);
      };
      fileBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(fileList.hidden); });
      fileList.addEventListener('click', () => setTimeout(() => setOpen(false), 80));
      fileList.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('label')) { e.preventDefault(); e.target.click(); }
        if (e.key === 'Escape') { setOpen(false); fileBtn.focus(); }
      });
      document.addEventListener('click', (e) => { if (!fileMenu.contains(e.target)) setOpen(false); });
      fileBtn.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    }
    this.bind('btn-file-backup', 'click', () => BackupManager.exportAll());

    // Wiki e Histórico ficam na lateral; na barra do topo só no celular
    this.bind('btn-toolbar-wiki', 'click', () => {
      const b = document.getElementById('btn-open-wiki-help');
      if (b) b.click();
    });
    this.bind('btn-toolbar-history', 'click', () => {
      const b = document.getElementById('btn-open-dice-history');
      if (b) b.click();
    });
    this.bind('btn-undo', 'click', () => UndoManager.undo());
    this.bind('btn-redo', 'click', () => UndoManager.redo());
    this.bind('btn-rename', 'click', async () => {
      const char = AppState.activeCharacter;
      const name = await GothicDialog.prompt({ title: 'Renomear personagem', value: char.header.name || '', placeholder: 'Nome do personagem', confirmLabel: 'Renomear' });
      if (name === null) return;
      char.header.name = name.trim() || 'Sem Nome';
      AppState.saveToStorage();
      UIRenderer.renderAll();
      showToast(`Personagem renomeado para “${char.header.name}”.`, 'success');
    });
    this.bind('btn-print', 'click', () => PrintManager.print());
    this.bind('btn-free-roll', 'click', () => {
      LinkCableSystem.setPreset({ kind: 'free', title: 'Parada livre', parts: [], difficulty: LinkCableSystem.getDifficulty(), applyWounds: true, meta: {} });
      RollOptions.modifier = Math.max(RollOptions.modifier, 1);
      LinkCableSystem.updateDock();
      const mod = document.getElementById('dock-modifier');
      if (mod) mod.focus();
    });


    // Clã
    this.bind('char-clan-select', 'change', e => ClanManager.onSelect(e.target.value));

    // Virtudes → estatísticas derivadas
    this.bind('toggle-auto-derived', 'change', e => {
      const char = AppState.activeCharacter;
      if (!char.settings) char.settings = {};
      char.settings.autoDerived = e.target.checked;
      if (e.target.checked) {
        DerivedStats.applyIfAuto(char);
        UIRenderer.renderAllDots(char);
        UIRenderer.renderWillpowerTemp(char);
        showToast('Força de Vontade e Humanidade agora acompanham as Virtudes.', 'info');
      }
      AppState.saveToStorage();
      ExtRenderer.renderWillpowerBadge(char);
    });

    // Sangue
    this.bind('btn-blood-heal', 'click', () => BloodActions.healOne());
    this.bind('btn-blood-boost', 'click', () => {
      const sel = document.getElementById('blood-boost-attr');
      BloodActions.boostPhysical(sel ? sel.value : 'strength');
    });
    this.bind('btn-blood-new-turn', 'click', () => BloodActions.newTurn());
    this.bind('btn-blood-end-scene', 'click', () => BloodActions.endScene());

    // Combate
    this.bind('btn-add-weapon', 'click', () => CombatManager.addWeapon());
    this.bind('btn-soak-roll', 'click', () => CombatManager.soak());
    this.bind('btn-soak-apply', 'click', () => CombatManager.soak({ apply: true }));
    this.bind('btn-damage-heal-one', 'click', () => CombatManager.healFromDamage(1));
    this.bind('btn-damage-heal-all', 'click', () => CombatManager.healFromDamage(CombatManager.pendingHeal || 1));
    this.bind('btn-damage-heal-skip', 'click', () => {
      const box = document.getElementById('damage-heal');
      if (box) box.hidden = true;
      CombatManager.pendingHeal = 0;
    });
    this.bind('incoming-damage', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); CombatManager.soak({ apply: true }); } });

    // Qualidades & Defeitos
    document.querySelectorAll('[data-open-merits-catalog]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('wiki-help-drawer')?.classList.add('hidden');
      MeritsFlawsManager.openCatalog();
    }));
    this.bind('btn-close-merits-catalog', 'click', () => MeritsFlawsManager.closeCatalog());
    this.closeOnBackdrop('merits-catalog-modal');
    ['mf-search', 'mf-filter-type', 'mf-filter-cat'].forEach(id => {
      this.bind(id, id === 'mf-search' ? 'input' : 'change', () => MeritsFlawsManager.renderCatalog());
    });
    this.bind('btn-add-custom-merit', 'click', () => MeritsFlawsManager.addCustom('qualidade'));
    this.bind('btn-add-custom-flaw', 'click', () => MeritsFlawsManager.addCustom('defeito'));

    // Anotações Markdown
    this.bind('btn-toggle-markdown', 'click', () => NotesManager.toggle());

    // Dock do rolador
    this.bind('dock-modifier', 'input', e => {
      RollOptions.modifier = clampInt(e.target.value, -20, 30, 0);
      LinkCableSystem.updateDock(true);
    });
    this.bind('btn-mod-minus', 'click', () => { RollOptions.modifier = Math.max(-20, RollOptions.modifier - 1); LinkCableSystem.updateDock(); });
    this.bind('btn-mod-plus', 'click', () => { RollOptions.modifier = Math.min(30, RollOptions.modifier + 1); LinkCableSystem.updateDock(); });
    this.bind('toggle-specialty', 'click', () => {
      RollOptions.specialty = !RollOptions.specialty;
      safeStorageSet(SPECIALTY_KEY, RollOptions.specialty ? 'on' : 'off');
      LinkCableSystem.updateDock();
      CombatManager.render(AppState.activeCharacter);
      SpellManager.scheduleRefresh();
    });
    this.bind('dock-required', 'change', (e) => {
      RollProbability.setRequired(e.target.value);
      LinkCableSystem.updateDock();
      CombatManager.render(AppState.activeCharacter);
      SpellManager.scheduleRefresh();
    });
    this.bind('toggle-auto-success', 'click', () => {
      if (!RollOptions.autoSuccess && getWillpowerAvailable(AppState.activeCharacter) <= 0) {
        showToast('Força de Vontade temporária esgotada (0). Não é possível garantir o sucesso automático.', 'danger');
        return;
      }
      RollOptions.autoSuccess = !RollOptions.autoSuccess;
      LinkCableSystem.updateDock();
    });
    this.bind('toggle-wounds', 'click', () => { RollOptions.applyWounds = !RollOptions.applyWounds; LinkCableSystem.updateDock(); });
    this.bind('dock-command-format', 'change', e => {
      RollOptions.commandFormat = e.target.value;
      safeStorageSet(COMMAND_FORMAT_KEY, e.target.value);
      LinkCableSystem.updateDock();
    });
    this.bind('dock-difficulty', 'change', () => LinkCableSystem.updateDock());
    this.bind('btn-wp-auto-after', 'click', () => applyWillpowerAutoSuccessAfterRoll());

    // Atalhos de teclado (fora de campos de texto)
    window.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      if (typing || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); UndoManager.undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); UndoManager.redo(); }
    });

    window.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      ['merits-catalog-modal', 'discord-webhook-modal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    });

    AmbientFX.init();
  }
};

/** Impressão / PDF em A4 com as duas páginas. */
const PrintManager = {
  print() {
    if (Platform.isIOS && Platform.isStandalone && !this._iosHintShown) {
      this._iosHintShown = true;
      GothicDialog.confirm({
        title: 'Imprimir ou salvar PDF',
        message: 'No app instalado, o iOS às vezes não abre a janela de impressão.\n\nSe nada aparecer, abra a ficha no Safari e use Compartilhar → Imprimir. Lá, afaste dois dedos na prévia para salvar como PDF.',
        confirmLabel: 'Tentar imprimir',
        cancelLabel: 'Cancelar'
      }).then(ok => { if (ok) this.print(); });
      return;
    }
    NotesManager.previewMode = true;
    NotesManager.render(AppState.activeCharacter);
    document.body.classList.add('is-printing');
    showToast('No diálogo de impressão, escolha “Salvar como PDF” e papel A4.', 'info');
    setTimeout(() => {
      try { window.print(); } catch (e) { showToast('A impressão foi bloqueada por este navegador.', 'danger'); }
    }, 350);
  },
  after() {
    document.body.classList.remove('is-printing');
    LinkCableSystem.updateWebLines();
  }
};
window.addEventListener('afterprint', () => PrintManager.after());
window.addEventListener('beforeprint', () => {
  document.body.classList.add('is-printing');
  if (typeof NotesManager !== 'undefined' && typeof AppState !== 'undefined' && AppState.activeCharacter) {
    const preview = document.getElementById('markdown-preview');
    if (preview) preview.innerHTML = MarkdownLite.render(AppState.activeCharacter.notes ? AppState.activeCharacter.notes.markdown : '');
  }
});

/**
 * Gasta FV depois da rolagem para somar 1 sucesso automático
 * (útil quando a mesa esqueceu de declarar antes — o sucesso não é cancelado por 1s).
 */
function applyWillpowerAutoSuccessAfterRoll() {
  const state = currentRollState;
  if (!state || !state.rolls || state.rolls.length === 0) return;
  if (state.autoSuccess) { showToast('Esta rolagem já recebeu o sucesso automático.', 'info'); return; }
  if (!spendWillpower(AppState.activeCharacter, 'sucesso automático')) return;
  state.autoSuccess = true;
  Object.assign(state, DiceEngine.evaluate(state.rolls, state.difficulty, { specialty: state.specialty, autoSuccess: true, guaranteed: (state.guaranteed || 0) + (state.bloodAuto || 0) }));
  CombatManager.afterReroll(state);
  ExtendedActions.afterReroll(state);
  renderDiceResultsUI();
  DiceHistoryManager.updateLastRoll(state);
  DiscordIntegration.editLastRoll(state, 'Força de Vontade: +1 sucesso automático');
}
