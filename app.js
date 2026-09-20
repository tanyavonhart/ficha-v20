/**
 * FICHA DE PERSONAGEM AUTOMATIZADA - VAMPIRO: A MÁSCARA (V20)
 * JavaScript Puro Modular (Vanilla JS, sem dependências)
 * Suporte a: Janelas Arrastáveis, Imã Magnético, Redimensionamento, Link Cable, rolador V20
 * (especialização, '1' cancela, Força de Vontade, penalidade de ferimento), Discord e histórico.
 *
 * Depende de v20-automacoes.js (carregado antes) para regras derivadas, presets de clã,
 * desfazer/refazer, arsenal, Qualidades & Defeitos e efeitos visuais.
 */

'use strict';

const STORAGE_KEY = 'v20_character_sheets_db';
const ACTIVE_CHAR_KEY = 'v20_active_char_id';
const LAYOUT_POS_KEY = 'v20_window_positions';
const DISCORD_WEBHOOK_KEY = 'v20_discord_webhook_url';
const DISCORD_AUTO_SEND_KEY = 'v20_discord_auto_send';
const SNAP_GRID = 12; // Grade magnética de 12px para o efeito de ímã

const GENERATION_RULES = {
  '15ª': { label: '15ª Geração', maxBlood: 10, bloodPerTurn: 1, maxTrait: 5 },
  '14ª': { label: '14ª Geração', maxBlood: 10, bloodPerTurn: 1, maxTrait: 5 },
  '13ª': { label: '13ª Geração', maxBlood: 10, bloodPerTurn: 1, maxTrait: 5 },
  '12ª': { label: '12ª Geração', maxBlood: 11, bloodPerTurn: 1, maxTrait: 5 },
  '11ª': { label: '11ª Geração', maxBlood: 12, bloodPerTurn: 1, maxTrait: 5 },
  '10ª': { label: '10ª Geração', maxBlood: 13, bloodPerTurn: 1, maxTrait: 5 },
  '9ª':  { label: '9ª Geração',  maxBlood: 14, bloodPerTurn: 2, maxTrait: 5 },
  '8ª':  { label: '8ª Geração',  maxBlood: 15, bloodPerTurn: 3, maxTrait: 5 },
  '7ª':  { label: '7ª Geração',  maxBlood: 20, bloodPerTurn: 4, maxTrait: 6 },
  '6ª':  { label: '6ª Geração',  maxBlood: 30, bloodPerTurn: 6, maxTrait: 7 },
  '5ª':  { label: '5ª Geração',  maxBlood: 40, bloodPerTurn: 8, maxTrait: 8 },
  '4ª':  { label: '4ª Geração',  maxBlood: 50, bloodPerTurn: 10, maxTrait: 9 },
  '3ª':  { label: '3ª Geração',  maxBlood: 100, bloodPerTurn: 10, maxTrait: 10 }
};

const HEALTH_LEVELS = [
  { key: 'bruised', label: 'Escoriado', penalty: '-0' },
  { key: 'hurt', label: 'Machucado', penalty: '-1' },
  { key: 'injured', label: 'Ferido', penalty: '-1' },
  { key: 'wounded', label: 'Ferido Gravemente', penalty: '-2' },
  { key: 'mauled', label: 'Espancado', penalty: '-2' },
  { key: 'crippled', label: 'Aleijado', penalty: '-5' },
  { key: 'incapacitated', label: 'Incapacitado', penalty: 'Incapaz' }
];

const DAMAGE_CYCLE = ['', 'bashing', 'lethal', 'aggravated'];

function generateUniqueId() {
  return 'v20_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

function snapToGrid(val, step = SNAP_GRID) {
  return Math.round(val / step) * step;
}

// =============================================================================
// GERENCIADOR DE TEMAS E PERSONALIZAÇÃO DE CORES
// =============================================================================
const THEME_CUSTOMIZATION_KEY = 'v20_theme_customizations';

const THEME_PRESETS = {
  red: {
    name: 'Vermelho (Carmesim)',
    primaryHue: 0,
    primarySat: 100,
    secondaryHue: 40,
    secondarySat: 65,
    bgLightness: 8,
    noiseOpacity: 7
  },
  green: {
    name: 'Verde (Esmeralda)',
    primaryHue: 142,
    primarySat: 80,
    secondaryHue: 85,
    secondarySat: 70,
    bgLightness: 7,
    noiseOpacity: 7
  },
  purple: {
    name: 'Roxo (Abissal)',
    primaryHue: 275,
    primarySat: 85,
    secondaryHue: 310,
    secondarySat: 65,
    bgLightness: 7,
    noiseOpacity: 7
  },
  yellow: {
    name: 'Amarelo (Âmbar)',
    primaryHue: 42,
    primarySat: 95,
    secondaryHue: 48,
    secondarySat: 85,
    bgLightness: 8,
    noiseOpacity: 7
  },
  // Temas dos Clãs (mesma paleta do site publicado)
  ventrue:  { name: 'Ventrue (Sangue Azul & Ouro Nobre)',          primaryHue: 218, primarySat: 85, secondaryHue: 44, secondarySat: 80, bgLightness: 7, noiseOpacity: 6 },
  tremere:  { name: 'Tremere (Carmesim Hermético & Ouro Arcano)',  primaryHue: 350, primarySat: 92, secondaryHue: 42, secondarySat: 82, bgLightness: 7, noiseOpacity: 7 },
  toreador: { name: 'Toreador (Rosa das Paixões & Ouro Rosé)',     primaryHue: 330, primarySat: 78, secondaryHue: 18, secondarySat: 58, bgLightness: 8, noiseOpacity: 6 },
  brujah:   { name: 'Brujah (Fogo Revolucionário & Aço Urbano)',   primaryHue: 16,  primarySat: 95, secondaryHue: 210, secondarySat: 14, bgLightness: 8, noiseOpacity: 9 },
  lasombra: { name: 'Lasombra (Escuridão Abissal & Prata Lunar)',  primaryHue: 262, primarySat: 38, secondaryHue: 220, secondarySat: 12, bgLightness: 4, noiseOpacity: 8 },
  tzimisce: { name: 'Tzimisce (Esmeralda Draconiana & Ouro Ancestral)', primaryHue: 152, primarySat: 72, secondaryHue: 46, secondarySat: 72, bgLightness: 6, noiseOpacity: 7 },
  giovanni: { name: 'Giovanni (Púrpura Espectral & Ouro Veneziano)', primaryHue: 285, primarySat: 62, secondaryHue: 40, secondarySat: 62, bgLightness: 6, noiseOpacity: 7 }
};

/** Ordem das Gerações, da mais nova (15ª) para a mais antiga (3ª). */
const GENERATION_ORDER = ['15ª', '14ª', '13ª', '12ª', '11ª', '10ª', '9ª', '8ª', '7ª', '6ª', '5ª', '4ª', '3ª'];

/** Máximo de pontos exibidos para Atributos, Habilidades e Disciplinas (patamar de Ancião). */
const ELDER_TRAIT_MAX = 9;

const ThemeManager = {
  currentTheme: {
    preset: 'red',
    primaryHue: 0,
    primarySat: 100,
    secondaryHue: 40,
    secondarySat: 65,
    bgLightness: 8,
    noiseOpacity: 7
  },

  init() {
    this.loadForActiveCharacter();
  },

  loadForActiveCharacter() {
    if (AppState.activeCharacter && AppState.activeCharacter.theme) {
      this.currentTheme = { ...AppState.activeCharacter.theme };
    } else {
      const saved = localStorage.getItem(THEME_CUSTOMIZATION_KEY);
      if (saved) {
        try {
          this.currentTheme = { ...this.currentTheme, ...JSON.parse(saved) };
        } catch (e) {
          console.error('Erro ao carregar tema:', e);
        }
      } else {
        this.currentTheme = { ...THEME_PRESETS.red };
      }
    }
    this.applyTheme(this.currentTheme);
    this.updateControlsUI();
  },

  applyTheme(theme) {
    const root = document.documentElement;

    const cssVarsToManage = [
      '--crimson-base', '--crimson-dark', '--crimson-bright', '--crimson-glow', '--crimson-cable',
      '--gold-base', '--gold-dark', '--gold-bright', '--gold-glow', '--border-accent',
      '--bg-app', '--bg-sheet', '--bg-card', '--bg-card-alt', '--bg-input', '--noise-opacity'
    ];

    // Se o tema for o Vermelho Padrão oficial, remove todos os overrides inline para usar o CSS original exato
    if (theme.preset === 'red') {
      cssVarsToManage.forEach(v => root.style.removeProperty(v));

      const previewPri = document.getElementById('preview-primary');
      if (previewPri) previewPri.style.background = '#ff1a1a';

      const previewSec = document.getElementById('preview-secondary');
      if (previewSec) previewSec.style.background = '#e5c158';

      const previewBg = document.getElementById('preview-bg');
      if (previewBg) previewBg.style.background = '#1a1a23';
      return;
    }

    const pHue = parseInt(theme.primaryHue, 10) || 0;
    const pSat = parseInt(theme.primarySat, 10) || 100;
    const sHue = parseInt(theme.secondaryHue, 10) || 40;
    const sSat = parseInt(theme.secondarySat, 10) || 65;
    const bgL = parseInt(theme.bgLightness, 10) || 8;
    const noise = parseInt(theme.noiseOpacity, 10) || 7;

    // Destaque Primário (Bolinhas / Sangue / Cabos)
    root.style.setProperty('--crimson-base', `hsl(${pHue}, ${pSat}%, 30%)`);
    root.style.setProperty('--crimson-dark', `hsl(${pHue}, ${pSat}%, 18%)`);
    root.style.setProperty('--crimson-bright', `hsl(${pHue}, ${pSat}%, 55%)`);
    root.style.setProperty('--crimson-glow', `hsla(${pHue}, ${pSat}%, 55%, 0.55)`);
    root.style.setProperty('--crimson-cable', `hsl(${pHue}, ${pSat}%, 58%)`);

    // Destaque Secundário (Títulos / Bordas / Ankh)
    root.style.setProperty('--gold-base', `hsl(${sHue}, ${sSat}%, 55%)`);
    root.style.setProperty('--gold-dark', `hsl(${sHue}, ${sSat}%, 35%)`);
    root.style.setProperty('--gold-bright', `hsl(${sHue}, ${sSat}%, 65%)`);
    root.style.setProperty('--gold-glow', `hsla(${sHue}, ${sSat}%, 65%, 0.35)`);
    root.style.setProperty('--border-accent', `hsl(${sHue}, ${sSat}%, 25%)`);

    // Blocos Centrais e Cards da Ficha (Cinza Carvão Neutro / Gótico)
    root.style.setProperty('--bg-sheet', `hsl(240, 2%, ${bgL + 4}%)`);
    root.style.setProperty('--bg-card', `hsl(240, 3%, ${bgL + 6}%)`);
    root.style.setProperty('--bg-card-alt', `hsl(240, 3%, ${bgL + 5}%)`);
    root.style.setProperty('--bg-input', `hsl(240, 2%, ${bgL + 2}%)`);
    root.style.setProperty('--border-subtle', `hsl(240, 4%, ${bgL + 12}%)`);

    // Opacidade do Ruído
    root.style.setProperty('--noise-opacity', `${noise / 100}`);

    // Atualiza caixas de preview
    const previewPri = document.getElementById('preview-primary');
    if (previewPri) previewPri.style.background = `hsl(${pHue}, ${pSat}%, 55%)`;

    const previewSec = document.getElementById('preview-secondary');
    if (previewSec) previewSec.style.background = `hsl(${sHue}, ${sSat}%, 65%)`;

    const previewBg = document.getElementById('preview-bg');
    if (previewBg) previewBg.style.background = `hsl(240, 5%, ${bgL + 7}%)`;

    if (typeof LinkCableSystem !== 'undefined' && LinkCableSystem.drawCables) {
      LinkCableSystem.drawCables();
    }
  },

  applyPreset(presetKey) {
    if (!THEME_PRESETS[presetKey]) return;
    const preset = THEME_PRESETS[presetKey];
    this.currentTheme = {
      preset: presetKey,
      primaryHue: preset.primaryHue,
      primarySat: preset.primarySat,
      secondaryHue: preset.secondaryHue,
      secondarySat: preset.secondarySat,
      bgLightness: preset.bgLightness,
      noiseOpacity: preset.noiseOpacity
    };
    this.applyTheme(this.currentTheme);
    this.updateControlsUI();
    this.save();
  },

  updateFromSliders() {
    const sPriHue = document.getElementById('slider-primary-hue');
    const sPriSat = document.getElementById('slider-primary-sat');
    const sSecHue = document.getElementById('slider-secondary-hue');
    const sSecSat = document.getElementById('slider-secondary-sat');
    const sBgL = document.getElementById('slider-bg-lightness');
    const sNoise = document.getElementById('slider-noise-opacity');

    if (sPriHue) this.currentTheme.primaryHue = parseInt(sPriHue.value, 10);
    if (sPriSat) this.currentTheme.primarySat = parseInt(sPriSat.value, 10);
    if (sSecHue) this.currentTheme.secondaryHue = parseInt(sSecHue.value, 10);
    if (sSecSat) this.currentTheme.secondarySat = parseInt(sSecSat.value, 10);
    if (sBgL) this.currentTheme.bgLightness = parseInt(sBgL.value, 10);
    if (sNoise) this.currentTheme.noiseOpacity = parseInt(sNoise.value, 10);

    this.currentTheme.preset = 'custom';
    this.applyTheme(this.currentTheme);

    const vPriHue = document.getElementById('val-primary-hue');
    const vPriSat = document.getElementById('val-primary-sat');
    const vSecHue = document.getElementById('val-secondary-hue');
    const vSecSat = document.getElementById('val-secondary-sat');
    const vBgL = document.getElementById('val-bg-lightness');
    const vNoise = document.getElementById('val-noise-opacity');

    if (vPriHue) vPriHue.textContent = `${this.currentTheme.primaryHue}°`;
    if (vPriSat) vPriSat.textContent = `${this.currentTheme.primarySat}%`;
    if (vSecHue) vSecHue.textContent = `${this.currentTheme.secondaryHue}°`;
    if (vSecSat) vSecSat.textContent = `${this.currentTheme.secondarySat}%`;
    if (vBgL) vBgL.textContent = `${this.currentTheme.bgLightness}%`;
    if (vNoise) vNoise.textContent = `${this.currentTheme.noiseOpacity}%`;

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    this.save();
  },

  updateControlsUI() {
    const t = this.currentTheme;

    const sPriHue = document.getElementById('slider-primary-hue');
    const sPriSat = document.getElementById('slider-primary-sat');
    const sSecHue = document.getElementById('slider-secondary-hue');
    const sSecSat = document.getElementById('slider-secondary-sat');
    const sBgL = document.getElementById('slider-bg-lightness');
    const sNoise = document.getElementById('slider-noise-opacity');

    if (sPriHue) sPriHue.value = t.primaryHue;
    if (sPriSat) sPriSat.value = t.primarySat;
    if (sSecHue) sSecHue.value = t.secondaryHue;
    if (sSecSat) sSecSat.value = t.secondarySat;
    if (sBgL) sBgL.value = t.bgLightness;
    if (sNoise) sNoise.value = t.noiseOpacity;

    const vPriHue = document.getElementById('val-primary-hue');
    const vPriSat = document.getElementById('val-primary-sat');
    const vSecHue = document.getElementById('val-secondary-hue');
    const vSecSat = document.getElementById('val-secondary-sat');
    const vBgL = document.getElementById('val-bg-lightness');
    const vNoise = document.getElementById('val-noise-opacity');

    if (vPriHue) vPriHue.textContent = `${t.primaryHue}°`;
    if (vPriSat) vPriSat.textContent = `${t.primarySat}%`;
    if (vSecHue) vSecHue.textContent = `${t.secondaryHue}°`;
    if (vSecSat) vSecSat.textContent = `${t.secondarySat}%`;
    if (vBgL) vBgL.textContent = `${t.bgLightness}%`;
    if (vNoise) vNoise.textContent = `${t.noiseOpacity}%`;

    document.querySelectorAll('.preset-btn').forEach(btn => {
      if (btn.getAttribute('data-preset') === t.preset) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  save() {
    if (AppState.activeCharacter) {
      AppState.activeCharacter.theme = { ...this.currentTheme };
      AppState.saveToStorage();
    }
    localStorage.setItem(THEME_CUSTOMIZATION_KEY, JSON.stringify(this.currentTheme));
  },

  reset() {
    this.applyPreset('red');
    showToast('Tema padrão (Vermelho Carmesim) restaurado!', 'info');
  }
};

function getGenerationRule(genStr) {
  if (!genStr) return GENERATION_RULES['13ª'];
  const clean = genStr.toString().trim();
  if (GENERATION_RULES[clean]) return GENERATION_RULES[clean];
  const match = clean.match(/(\d+)/);
  if (match) {
    const key = match[1] + 'ª';
    if (GENERATION_RULES[key]) return GENERATION_RULES[key];
  }
  return GENERATION_RULES['13ª'];
}

function syncBloodPoolWithGeneration(char) {
  if (!char.status) char.status = {};
  const rule = getGenerationRule(char.header ? char.header.generation : '13ª');
  const targetMax = rule.maxBlood;

  if (!Array.isArray(char.status.blood_pool)) {
    char.status.blood_pool = Array(targetMax).fill(false).map((_, i) => i < Math.min(10, targetMax));
    return;
  }

  if (char.status.blood_pool.length < targetMax) {
    const diff = targetMax - char.status.blood_pool.length;
    for (let i = 0; i < diff; i++) char.status.blood_pool.push(false);
  } else if (char.status.blood_pool.length > targetMax) {
    char.status.blood_pool = char.status.blood_pool.slice(0, targetMax);
  }
}

/** Normaliza '8', '8ª', '8ª Geração' → '8ª'. */
function normalizeGenerationKey(genStr) {
  const m = String(genStr || '').match(/(\d+)/);
  const key = m ? `${m[1]}ª` : '13ª';
  return GENERATION_RULES[key] ? key : '13ª';
}

/**
 * Troca a Geração do personagem ativo e ajusta a reserva de sangue:
 *  - o tamanho da reserva passa a ser o máximo da nova Geração;
 *  - se a reserva estava cheia, continua cheia; senão, os pontos atuais são mantidos
 *    (cortando o excedente quando a nova reserva é menor).
 */
function applyGenerationChange(newGen, { silent = false } = {}) {
  const char = AppState.activeCharacter;
  if (!char) return;
  const key = normalizeGenerationKey(newGen);
  const oldRule = getGenerationRule(char.header.generation);
  const pool = Array.isArray(char.status.blood_pool) ? char.status.blood_pool : [];
  const filled = pool.slice(0, oldRule.maxBlood).filter(Boolean).length;
  const wasFull = filled >= oldRule.maxBlood;

  char.header.generation = key;
  const rule = getGenerationRule(key);
  const newCount = wasFull ? rule.maxBlood : Math.min(filled, rule.maxBlood);
  char.status.blood_pool = Array.from({ length: rule.maxBlood }, (_, i) => i < newCount);
  syncBloodPoolWithGeneration(char);
  AppState.saveToStorage();

  const select = document.getElementById('char-generation');
  if (select && select.value !== key) select.value = key;
  UIRenderer.updateDropdown();
  UIRenderer.renderBloodPool(char);
  CombatManager.render(char);
  LinkCableSystem.refreshNodeValues();
  GenerationStepper.render(char);
  if (!silent) {
    const lost = filled > rule.maxBlood ? ` (${filled - rule.maxBlood} ponto(s) de sangue excedente(s) perdido(s))` : '';
    showToast(`${rule.label}: reserva ${newCount}/${rule.maxBlood}, gasto ${rule.bloodPerTurn}/turno, limite oficial de traço ${rule.maxTrait}${lost}.`, 'info');
  }
}

/** Botões de subir/descer Geração (cabeçalho e card de sangue). */
const GenerationStepper = {
  /** dir = -1 → Geração mais antiga (número menor, mais poder); dir = +1 → mais nova */
  step(dir) {
    const char = AppState.activeCharacter;
    if (!char) return;
    const current = normalizeGenerationKey(char.header.generation);
    const idx = GENERATION_ORDER.indexOf(current);
    const nextIdx = idx + (dir < 0 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= GENERATION_ORDER.length) {
      showToast(dir < 0 ? 'A 3ª Geração é o limite (Antediluvianos).' : 'A 15ª Geração é a mais distante de Caim.', 'info');
      return;
    }
    applyGenerationChange(GENERATION_ORDER[nextIdx]);
  },

  render(char) {
    if (!char) return;
    const current = normalizeGenerationKey(char.header.generation);
    const idx = GENERATION_ORDER.indexOf(current);
    const older = GENERATION_ORDER[idx + 1];
    const younger = GENERATION_ORDER[idx - 1];
    document.querySelectorAll('[data-gen-step]').forEach(btn => {
      const dir = parseInt(btn.getAttribute('data-gen-step'), 10);
      const target = dir < 0 ? older : younger;
      btn.disabled = !target;
      if (target) {
        const r = GENERATION_RULES[target];
        btn.title = `Mudar para ${r.label} — reserva ${r.maxBlood}, ${r.bloodPerTurn}/turno`;
      } else {
        btn.title = dir < 0 ? 'Já está na 3ª Geração' : 'Já está na 15ª Geração';
      }
      btn.setAttribute('aria-label', btn.title);
    });
    document.querySelectorAll('[data-gen-current]').forEach(el => { el.textContent = current; });
  }
};

function createBlankCharacter(customName) {
  const defaultGen = '13ª';
  const genRule = GENERATION_RULES[defaultGen];

  return {
    id: generateUniqueId(),
    header: {
      name: customName || 'Novo Neófito',
      player: '',
      chronicle: '',
      nature: '',
      demeanor: '',
      clan: '',
      generation: defaultGen,
      sire: '',
      concept: '',
      avatar: ''
    },
    attributes: {
      physical: { strength: 1, dexterity: 1, stamina: 1 },
      social: { charisma: 1, manipulation: 1, appearance: 1 },
      mental: { perception: 1, intelligence: 1, wits: 1 }
    },
    abilities: {
      talents: { alertness: 0, athletics: 0, brawl: 0, foresight: 0, empathy: 0, expression: 0, intimidation: 0, leadership: 0, streetwise: 0, subterfuge: 0 },
      skills: { animal_ken: 0, crafts: 0, drive: 0, etiquette: 0, firearms: 0, melee: 0, performance: 0, larceny: 0, stealth: 0, survival: 0 },
      knowledges: { academics: 0, computer: 0, finance: 0, investigation: 0, law: 0, medicine: 0, occult: 0, politics: 0, science: 0, technology: 0 }
    },
    disciplines: [
      { id: generateUniqueId(), name: 'Potência', level: 1 },
      { id: generateUniqueId(), name: 'Celeridade', level: 1 }
    ],
    specializations: [
      { id: generateUniqueId(), name: 'Força: Empurrão Poderoso', level: 1 }
    ],
    backgrounds: [
      { id: generateUniqueId(), name: 'Recursos', level: 2 },
      { id: generateUniqueId(), name: 'Contatos', level: 1 }
    ],
    paths: [
      { id: generateUniqueId(), name: 'Trilha do Sangue (Principal)', level: 2 }
    ],
    rituals_list: [
      { id: generateUniqueId(), level: 1, name: 'Defesa do Refúgio Sagrado', description: 'Protege o refúgio contra a luz solar direta.' }
    ],
    virtues: { conscience: 1, self_control: 1, courage: 1 },
    status: {
      path_name: 'Humanidade',
      humanity: 7,
      willpower_perm: 5,
      willpower_temp: Array(10).fill(false),
      blood_pool: Array(genRule.maxBlood).fill(false).map((_, i) => i < genRule.maxBlood),
      turn_blood_spent: 0,
      physical_boosts: { strength: 0, dexterity: 0, stamina: 0 }
    },
    health: { bruised: '', hurt: '', injured: '', wounded: '', mauled: '', crippled: '', incapacitated: '' },
    notes: { merits_flaws: '', weakness: '', other_traits: '', history: '', haven: '', goals: '', possessions: '', markdown: '' },
    merits_flaws_list: [],
    weapons: defaultWeapons(),
    xp: { total: 0, spent: 0 },
    theme: {
      preset: 'red',
      primaryHue: 0,
      primarySat: 100,
      secondaryHue: 40,
      secondarySat: 65,
      bgLightness: 8,
      noiseOpacity: 7
    },
    settings: {
      autoDerived: true, // FV = Coragem e Humanidade = Consciência + Autocontrole
      lockedSections: {}, // seções com edição travada (🔒)
      discordWebhook: '',
      discordFaceEmotes: {},
      discordEmotes: {
        critico: '<:critico:1540580738007695512>',
        sucesso: '<:sucesso:1540580820127842344>',
        falha: '<:falha:1540580800456691773>',
        falhacritica: '<:falhacritica:1540580772652523600>'
      }
    },
    roll_history: []
  };
}

/**
 * Garante que fichas antigas ou importadas tenham todos os campos das versões novas.
 * Nunca sobrescreve valores existentes.
 */
function normalizeCharacter(c) {
  if (!c || typeof c !== 'object') return c;
  if (!c.header) c.header = {};
  ['disciplines', 'specializations', 'backgrounds', 'paths', 'rituals_list', 'roll_history', 'merits_flaws_list'].forEach(k => {
    if (!Array.isArray(c[k])) c[k] = [];
  });
  ['disciplines', 'specializations', 'backgrounds', 'paths', 'rituals_list'].forEach(k => {
    c[k].forEach(item => { if (item && !item.id) item.id = generateUniqueId(); });
  });
  if (!Array.isArray(c.weapons)) c.weapons = defaultWeapons();
  if (!c.notes) c.notes = {};
  ['merits_flaws', 'weakness', 'other_traits', 'history', 'haven', 'goals', 'possessions', 'markdown'].forEach(k => {
    if (typeof c.notes[k] !== 'string') c.notes[k] = '';
  });
  if (!c.virtues) c.virtues = { conscience: 1, self_control: 1, courage: 1 };
  if (!c.status) c.status = {};
  if (!Array.isArray(c.status.willpower_temp) || c.status.willpower_temp.length !== 10) c.status.willpower_temp = Array(10).fill(false);
  if (typeof c.status.turn_blood_spent !== 'number') c.status.turn_blood_spent = 0;
  if (!c.status.physical_boosts) c.status.physical_boosts = { strength: 0, dexterity: 0, stamina: 0 };
  if (!c.health) c.health = { bruised: '', hurt: '', injured: '', wounded: '', mauled: '', crippled: '', incapacitated: '' };
  if (!c.xp) c.xp = { total: 0, spent: 0 };
  if (!c.theme) {
    c.theme = { preset: 'red', primaryHue: 0, primarySat: 100, secondaryHue: 40, secondarySat: 65, bgLightness: 8, noiseOpacity: 7 };
  }
  if (!c.settings) {
    c.settings = {
      discordWebhook: '',
      discordEmotes: {
        critico: '<:critico:1540580738007695512>',
        sucesso: '<:sucesso:1540580820127842344>',
        falha: '<:falha:1540580800456691773>',
        falhacritica: '<:falhacritica:1540580772652523600>'
      }
    };
  }
  // Fichas antigas: automação desligada para não sobrescrever FV/Humanidade compradas com XP
  if (typeof c.settings.autoDerived !== 'boolean') c.settings.autoDerived = false;
  if (!c.settings.discordFaceEmotes) c.settings.discordFaceEmotes = {};
  if (!c.settings.lockedSections || typeof c.settings.lockedSections !== 'object') c.settings.lockedSections = {};
  if (c.abilities && c.abilities.talents) {
    if (c.abilities.talents.foresight === undefined && c.abilities.talents.dodge !== undefined) {
      c.abilities.talents.foresight = c.abilities.talents.dodge;
    }
  }
  if (c.abilities && c.abilities.skills) {
    if (c.abilities.skills.larceny === undefined && c.abilities.skills.security !== undefined) {
      c.abilities.skills.larceny = c.abilities.skills.security;
    }
  }
  return c;
}

/** Gera novos IDs para todas as listas (usado ao duplicar e importar). */
function regenerateListIds(c) {
  // Prefixos usados nas referências do histórico de XP
  const prefixes = { disciplines: 'disc', specializations: 'spec', backgrounds: 'bg', paths: 'path', rituals_list: 'rit', sessions: 'session', extended_actions: 'ext' };
  const remap = {};
  ['disciplines', 'specializations', 'backgrounds', 'paths', 'rituals_list', 'weapons', 'merits_flaws_list', 'sessions', 'extended_actions'].forEach(k => {
    if (!Array.isArray(c[k])) return;
    c[k].forEach(item => {
      if (!item) return;
      const newId = generateUniqueId();
      if (prefixes[k] && item.id) remap[`${prefixes[k]}:${item.id}`] = `${prefixes[k]}:${newId}`;
      item.id = newId;
    });
  });
  if (c.settings && c.settings.activeExtended && remap[`ext:${c.settings.activeExtended}`]) {
    c.settings.activeExtended = remap[`ext:${c.settings.activeExtended}`].slice(4);
  }
  if (c.xp_auto && Array.isArray(c.xp_auto.log)) {
    c.xp_auto.log.forEach(e => { if (e && remap[e.ref]) e.ref = remap[e.ref]; });
  }
}

const AppState = {
  characters: [],
  activeCharacter: null,

  init() {
    this.loadFromStorage();
    if (this.characters.length === 0) {
      // Primeiro acesso: nasce uma ficha em branco e o assistente de criação se abre
      const firstChar = createBlankCharacter('Novo Personagem');
      syncBloodPoolWithGeneration(firstChar);
      this.characters.push(firstChar);
      this.activeCharacter = firstChar;
      this.isFirstRun = true;
      this.saveToStorage();
    } else {
      const savedActiveId = localStorage.getItem(ACTIVE_CHAR_KEY);
      const found = this.characters.find(c => c.id === savedActiveId);
      this.activeCharacter = found || this.characters[0];
      syncBloodPoolWithGeneration(this.activeCharacter);
    }
  },

  loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      this.characters = data ? JSON.parse(data) : [];
      this.characters.forEach(c => normalizeCharacter(c));
    } catch (e) {
      console.error('Erro ao ler do LocalStorage:', e);
      this.characters = [];
    }
  },

  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.characters));
      if (this.activeCharacter) {
        localStorage.setItem(ACTIVE_CHAR_KEY, this.activeCharacter.id);
      }
    } catch (e) {
      console.error('Erro ao salvar no LocalStorage:', e);
      const now = Date.now();
      if (!this._lastQuotaWarn || now - this._lastQuotaWarn > 8000) {
        this._lastQuotaWarn = now;
        showToast('O navegador recusou o salvamento (espaço cheio?). Exporte a ficha em JSON e use fotos menores ou por link.', 'danger');
      }
    }
    if (this.activeCharacter) this.activeCharacter.updatedAt = new Date().toISOString();
    if (typeof SyncManager !== 'undefined') SyncManager.scheduleAuto();
    if (typeof UndoManager !== 'undefined') UndoManager.capture();
  },

  /** Fecha o agrupamento de desfazer pendente antes de trocar de ficha. */
  flushUndo() {
    if (typeof UndoManager !== 'undefined' && UndoManager.pendingTimer) UndoManager.commit();
  },

  setActive(id) {
    if (typeof FX !== 'undefined' && this.activeId && this.activeId !== id) FX.dissolve();
    this.flushUndo();
    const char = this.characters.find(c => c.id === id);
    if (char) {
      this.activeCharacter = char;
      syncBloodPoolWithGeneration(this.activeCharacter);
      try { localStorage.setItem(ACTIVE_CHAR_KEY, id); } catch (e) { /* ignora */ }
      LinkCableSystem.clear();
      ThemeManager.loadForActiveCharacter();
      if (typeof DiceHistoryManager !== 'undefined') {
        DiceHistoryManager.updateBadgeCount();
      }
      return true;
    }
    return false;
  },

  addCharacter(newChar) {
    this.flushUndo();
    normalizeCharacter(newChar);
    syncBloodPoolWithGeneration(newChar);
    this.characters.push(newChar);
    this.activeCharacter = newChar;
    this.saveToStorage();
    LinkCableSystem.clear();
  },

  duplicateActive() {
    if (!this.activeCharacter) return null;
    this.flushUndo();
    const cloned = JSON.parse(JSON.stringify(this.activeCharacter));
    cloned.id = generateUniqueId();
    cloned.header.name = (cloned.header.name || 'Personagem') + ' (Cópia)';
    regenerateListIds(cloned);
    syncBloodPoolWithGeneration(cloned);
    this.characters.push(cloned);
    this.activeCharacter = cloned;
    this.saveToStorage();
    LinkCableSystem.clear();
    return cloned;
  },

  deleteActive() {
    this.flushUndo();
    if (this.characters.length <= 1) {
      const blank = createBlankCharacter('Novo Personagem');
      this.characters = [blank];
      this.activeCharacter = blank;
    } else {
      const currentId = this.activeCharacter.id;
      this.characters = this.characters.filter(c => c.id !== currentId);
      this.activeCharacter = this.characters[0];
    }
    syncBloodPoolWithGeneration(this.activeCharacter);
    this.saveToStorage();
    LinkCableSystem.clear();
  }
};

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = '✨';
  if (type === 'success') icon = '🩸';
  if (type === 'danger') icon = '⚠️';
  if (type === 'info') icon = 'ℹ️';

  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s, transform 0.4s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 400);
  }, 2800);
}

// =============================================================================
// GERENCIADOR DE JANELAS: ARRASTE MAGNÉTICO (ÍMÃ) & REDIMENSIONAMENTO DE ABAS
// =============================================================================
const DraggableWindowManager = {
  positions: {}, // { windowId: { x, y, w, h } }
  activeCard: null,
  isResizing: false,
  startX: 0,
  startY: 0,
  initialX: 0,
  initialY: 0,
  initialW: 0,
  initialH: 0,

  init() {
    this.injectResizeHandles();
    this.loadPositions();
    this.applyAllPositions();
    this.bindDragAndResizeEvents();
    this.setupResizeObserver();

    window.addEventListener('resize', () => {
      LinkCableSystem.updateWebLines();
    });

    window.addEventListener('scroll', () => {
      LinkCableSystem.updateWebLines();
    }, { passive: true, capture: true });
  },

  injectResizeHandles() {
    const cards = document.querySelectorAll('.draggable-card[data-window-id]');
    cards.forEach(card => {
      if (!card.querySelector('.card-resize-handle')) {
        const handle = document.createElement('span');
        handle.className = 'card-resize-handle';
        handle.title = 'Clique e arraste para redimensionar o tamanho da aba';
        handle.innerHTML = '◢';
        card.appendChild(handle);
      }
    });
  },

  loadPositions() {
    try {
      const saved = localStorage.getItem(LAYOUT_POS_KEY);
      this.positions = saved ? JSON.parse(saved) : {};
    } catch (e) {
      this.positions = {};
    }
  },

  savePositions() {
    try {
      localStorage.setItem(LAYOUT_POS_KEY, JSON.stringify(this.positions));
    } catch (e) {
      console.error('Erro ao salvar layout:', e);
    }
  },

  applyAllPositions() {
    const cards = document.querySelectorAll('.draggable-card[data-window-id]');
    cards.forEach(card => {
      const winId = card.getAttribute('data-window-id');
      const pos = this.positions[winId];
      if (pos) {
        if (pos.x !== undefined && pos.y !== undefined && (pos.x !== 0 || pos.y !== 0)) {
          card.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
          card.classList.add('is-custom-positioned');
        } else {
          card.style.transform = '';
          card.classList.remove('is-custom-positioned');
        }

        if (pos.w) card.style.width = `${pos.w}px`;
        else card.style.width = '';

        if (pos.h) card.style.height = `${pos.h}px`;
        else card.style.height = '';
        
        this.checkCardCollapseState(card);
      } else {
        card.style.transform = '';
        card.style.width = '';
        card.style.height = '';
        card.classList.remove('is-custom-positioned', 'is-collapsed-small');
      }
    });
  },

  checkCardCollapseState(card) {
    if (!card) return;
    const winId = card.getAttribute('data-window-id');
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Se o card não tem altura customizada definida pelo usuário (layout padrão), nunca colapsa por altura
    const hasCustomHeight = !!card.style.height;
    
    let isHeightCollapsed = false;
    if (hasCustomHeight) {
      if (winId === 'win-xp' && rect.height < 52) isHeightCollapsed = true;
      else if (winId === 'win-willpower' && rect.height < 70) isHeightCollapsed = true;
      else if (winId === 'win-blood' && rect.height < 90) isHeightCollapsed = true;
      else if (rect.height < 55) isHeightCollapsed = true;
    }

    const isWidthCollapsed = rect.width < 195;

    if (isWidthCollapsed || isHeightCollapsed) {
      card.classList.add('is-collapsed-small');
    } else {
      card.classList.remove('is-collapsed-small');
    }
  },

  setupResizeObserver() {
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
          this.checkCardCollapseState(entry.target);
        }
      });
      document.querySelectorAll('.draggable-card[data-window-id]').forEach(card => observer.observe(card));
    }
  },

  resetPositions() {
    this.positions = {};
    localStorage.removeItem(LAYOUT_POS_KEY);
    const cards = document.querySelectorAll('.draggable-card[data-window-id]');
    cards.forEach(card => {
      card.style.transform = '';
      card.style.width = '';
      card.style.height = '';
      card.classList.remove('is-custom-positioned', 'is-dragging', 'is-resizing', 'snap-aligned', 'is-collapsed-small');
    });
    LinkCableSystem.updateWebLines();
    showToast('Layout e tamanhos das janelas restaurados para o padrão!', 'info');
  },

  bindDragAndResizeEvents() {
    const cards = document.querySelectorAll('.draggable-card[data-window-id]');
    
    cards.forEach(card => {
      const dragHandle = card.querySelector('.draggable-handle') || card;
      const resizeHandle = card.querySelector('.card-resize-handle');
      const winId = card.getAttribute('data-window-id');

      // 1. ARRASTE COM ÍMÃ (MAGNETIC DRAG)
      dragHandle.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return; // no toque, arrastar atrapalharia a rolagem
        if (card.closest('.section-locked')) return;
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('input') || 
            e.target.closest('select') || e.target.closest('textarea') || e.target.closest('.card-badge-link') || 
            e.target.closest('.dot') || e.target.closest('.trait-link-node') || 
            e.target.closest('.btn-add-trait') || e.target.closest('.btn-remove-trait') || 
            e.target.closest('.card-resize-handle')) {
          return;
        }

        this.activeCard = card;
        this.isResizing = false;
        this.startX = e.clientX;
        this.startY = e.clientY;

        const currentPos = this.positions[winId] || { x: 0, y: 0 };
        this.initialX = currentPos.x || 0;
        this.initialY = currentPos.y || 0;

        card.classList.add('is-dragging');
        dragHandle.setPointerCapture(e.pointerId);
      });

      dragHandle.addEventListener('pointermove', (e) => {
        if (!this.activeCard || this.activeCard !== card || this.isResizing) return;

        const rawDx = e.clientX - this.startX;
        const rawDy = e.clientY - this.startY;
        
        // Efeito de ímã: Encaixa na grade magnética de 12px
        const snappedX = snapToGrid(this.initialX + rawDx, SNAP_GRID);
        const snappedY = snapToGrid(this.initialY + rawDy, SNAP_GRID);

        card.style.transform = `translate3d(${snappedX}px, ${snappedY}px, 0)`;
        card.classList.add('is-custom-positioned');
        card.classList.add('snap-aligned');

        requestAnimationFrame(() => LinkCableSystem.updateWebLines());
      });

      const endDrag = (e) => {
        if (!this.activeCard || this.activeCard !== card || this.isResizing) return;

        const rawDx = e.clientX - this.startX;
        const rawDy = e.clientY - this.startY;
        const finalX = snapToGrid(this.initialX + rawDx, SNAP_GRID);
        const finalY = snapToGrid(this.initialY + rawDy, SNAP_GRID);

        if (!this.positions[winId]) this.positions[winId] = {};
        this.positions[winId].x = finalX;
        this.positions[winId].y = finalY;
        this.savePositions();

        card.classList.remove('is-dragging', 'snap-aligned');
        try { dragHandle.releasePointerCapture(e.pointerId); } catch (_) {}
        this.activeCard = null;

        LinkCableSystem.updateWebLines();
      };

      dragHandle.addEventListener('pointerup', endDrag);
      dragHandle.addEventListener('pointercancel', endDrag);

      // 2. REDIMENSIONAMENTO DE TAMANHO (RESIZABLE CARDS)
      if (resizeHandle) {
        resizeHandle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (e.pointerType === 'touch') return;
          if (card.closest('.section-locked')) return;
          this.activeCard = card;
          this.isResizing = true;
          this.startX = e.clientX;
          this.startY = e.clientY;

          const rect = card.getBoundingClientRect();
          this.initialW = rect.width;
          this.initialH = rect.height;

          card.classList.add('is-resizing');
          resizeHandle.classList.add('is-resizing');
          resizeHandle.setPointerCapture(e.pointerId);
        });

        resizeHandle.addEventListener('pointermove', (e) => {
          if (!this.activeCard || this.activeCard !== card || !this.isResizing) return;

          const rawDw = e.clientX - this.startX;
          const rawDh = e.clientY - this.startY;

          const newW = Math.max(140, snapToGrid(this.initialW + rawDw, SNAP_GRID));
          const newH = Math.max(42, snapToGrid(this.initialH + rawDh, SNAP_GRID));

          card.style.width = `${newW}px`;
          card.style.height = `${newH}px`;
          card.classList.add('is-custom-positioned');
          this.checkCardCollapseState(card);

          requestAnimationFrame(() => LinkCableSystem.updateWebLines());
        });

        const endResize = (e) => {
          if (!this.activeCard || this.activeCard !== card || !this.isResizing) return;

          const rect = card.getBoundingClientRect();
          const finalW = snapToGrid(rect.width, SNAP_GRID);
          const finalH = snapToGrid(rect.height, SNAP_GRID);

          if (!this.positions[winId]) this.positions[winId] = {};
          this.positions[winId].w = finalW;
          this.positions[winId].h = finalH;
          this.savePositions();
          this.checkCardCollapseState(card);

          card.classList.remove('is-resizing');
          resizeHandle.classList.remove('is-resizing');
          try { resizeHandle.releasePointerCapture(e.pointerId); } catch (_) {}
          
          this.activeCard = null;
          this.isResizing = false;

          LinkCableSystem.updateWebLines();
        };

        resizeHandle.addEventListener('pointerup', endResize);
        resizeHandle.addEventListener('pointercancel', endResize);
      }
    });
  }
};

function dataURItoBlob(dataURI) {
  try {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (e) {
    console.error('Erro ao converter dataURI para Blob:', e);
    return new Blob([], { type: 'image/png' });
  }
}

async function uploadImageToHost(fileOrBlob) {
  try {
    const formData = new FormData();
    formData.append('image', fileOrBlob);
    const res = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        Authorization: 'Client-ID 546c25a59c58ad7'
      },
      body: formData
    });
    const data = await res.json();
    if (data && data.success && data.data && data.data.link) {
      return data.data.link;
    }
  } catch (e) {
    console.warn('Falha no upload para o Imgur:', e);
  }
  return null;
}

// =============================================================================
// INTEGRAÇÃO COM DISCORD WEBHOOK (FETCH POST EMBED & PATCH EDIT)
// =============================================================================
const currentRollState = {
  char: null,
  totalPool: 0,
  difficulty: 6,
  rolls: [],
  traitsSummary: '',
  mathStr: '',
  successes: 0,
  tenCount: 0,
  botchCount: 0,
  netSuccesses: 0,
  outcomeBadgeText: '',
  isBotch: false,
  hasRerolled: false,
  lastDiscordMessageId: null,
  rerolledIndices: [],
  // extras da versão estendida
  specialty: false,
  autoSuccess: false,
  basePool: 0,
  modifier: 0,
  woundPenalty: 0,
  willpowerSpent: 0,
  preset: null,
  notes: []
};

const DISCORD_EMOTES_KEY = 'v20_discord_custom_emotes';

const DiscordIntegration = {
  getUrl() {
    if (AppState.activeCharacter && AppState.activeCharacter.settings && typeof AppState.activeCharacter.settings.discordWebhook === 'string') {
      return AppState.activeCharacter.settings.discordWebhook.trim();
    }
    return '';
  },

  setUrl(url) {
    const cleanUrl = (url || '').trim();
    if (AppState.activeCharacter) {
      if (!AppState.activeCharacter.settings) AppState.activeCharacter.settings = {};
      AppState.activeCharacter.settings.discordWebhook = cleanUrl;
      AppState.saveToStorage();
    }
  },

  getEmotes() {
    const defaultEmotes = {
      critico: '<:critico:1540580738007695512>',
      sucesso: '<:sucesso:1540580820127842344>',
      falha: '<:falha:1540580800456691773>',
      falhacritica: '<:falhacritica:1540580772652523600>'
    };

    if (AppState.activeCharacter && AppState.activeCharacter.settings && AppState.activeCharacter.settings.discordEmotes) {
      return { ...defaultEmotes, ...AppState.activeCharacter.settings.discordEmotes };
    }

    return defaultEmotes;
  },

  setEmotes(emotes) {
    if (AppState.activeCharacter) {
      if (!AppState.activeCharacter.settings) AppState.activeCharacter.settings = {};
      AppState.activeCharacter.settings.discordEmotes = emotes;
      AppState.saveToStorage();
    }
  },

  async getValidAvatarUrl(header) {
    if (!header) return '';
    if (header.avatarUrl && header.avatarUrl.startsWith('http')) return header.avatarUrl;
    if (header.avatar && (header.avatar.startsWith('http://') || header.avatar.startsWith('https://'))) return header.avatar;
    if (header.avatar && header.avatar.startsWith('data:image/')) {
      const blob = dataURItoBlob(header.avatar);
      const hosted = await uploadImageToHost(blob);
      if (hosted) {
        header.avatarUrl = hosted;
        AppState.saveToStorage();
        return hosted;
      }
    }
    return '';
  },

  /** Emote de cada dado: primeiro o emote da face (d10_N), depois a categoria. */
  emoteForDie(r, data) {
    const faces = (AppState.activeCharacter && AppState.activeCharacter.settings && AppState.activeCharacter.settings.discordFaceEmotes) || {};
    if (faces[r]) return faces[r];
    const e = this.getEmotes();
    if (r === 1) return e.falhacritica || ':falhacritica:';
    if (r === 10 && data.specialty) return e.critico || ':critico:';
    if (r >= data.difficulty) return e.sucesso || ':sucesso:';
    return e.falha || ':falha:';
  },

  outcomeText(data) {
    if (data.netSuccesses > 0) return `${data.netSuccesses} Sucesso${data.netSuccesses > 1 ? 's' : ''}`;
    if (data.isBotch) return `Falha Crítica (${data.botchCount}x '1')`;
    if (data.netSuccesses < 0) return 'Falha (sucessos cancelados por 1s)';
    return 'Falha Simples (0 sucessos)';
  },

  /** Monta o Rich Embed da rolagem (usado no envio e na edição). */
  async buildRollPayload(data, footerNote) {
    const char = data.char || {};
    const header = char.header || {};
    const charName = (header.name && header.name.trim()) ? header.name.trim() : 'Neófito';
    const charClan = (header.clan && header.clan.trim()) ? header.clan.trim() : 'Sem Clã';
    const playerName = (header.player && header.player.trim()) ? header.player.trim() : 'N/A';

    let embedColor = 0x555566;
    if (data.specialty && data.tenCount > 0 && data.netSuccesses > 0) embedColor = 0x06b6d4;
    else if (data.netSuccesses > 0) embedColor = 0x22c55e;
    else if (data.isBotch) embedColor = 0xff1111;

    const facesSummary = data.rolls.map((r, i) => (data.rerolledIndices && data.rerolledIndices.includes(i) ? `${r}↻` : `${r}`)).join(' ');
    const emotesLine = data.rolls.map(r => this.emoteForDie(r, data)).join(' ') + (data.autoSuccess ? ` ${this.getEmotes().sucesso || ''}+1` : '');
    const cleanTraits = data.traitsSummary || 'Parada de Dados';
    const poolLine = data.basePool !== undefined && (data.modifier || data.woundPenalty)
      ? `${data.basePool}${data.modifier ? ` ${data.modifier > 0 ? '+' : '−'} ${Math.abs(data.modifier)}` : ''}${data.woundPenalty ? ` − ${data.woundPenalty}` : ''} = ${data.totalPool} dados`
      : `${data.totalPool} dados`;

    const fields = [
      { name: 'Personagem', value: `${charName} (${charClan})`.slice(0, 1024), inline: true },
      { name: 'Jogador', value: playerName.slice(0, 1024), inline: true },
      { name: 'Teste', value: `${cleanTraits} vs Dif ${data.difficulty}`.slice(0, 1024), inline: false },
      { name: 'Parada', value: poolLine, inline: true },
      { name: 'Dados', value: `\`${facesSummary || '—'}\``.slice(0, 1024), inline: false },
      {
        name: 'Resultado',
        value: `**${this.outcomeText(data)}**\n${data.successes} sucesso(s) bruto(s) · ${data.botchCount} × '1'${data.specialty ? ` · ${data.tenCount} × 10 (valem 2)` : ''}${data.autoSuccess ? ' · +1 automático' : ''}${data.guaranteed ? ` · +${data.guaranteed} garantido(s)` : ''}${data.bloodAuto ? ` · +${data.bloodAuto} automático(s) de ${data.bloodLabel} (${data.bloodSpent} PS)` : ''}`,
        inline: false
      }
    ];
    if (Array.isArray(data.notes) && data.notes.length) {
      fields.push({ name: 'Modificadores', value: data.notes.join('\n').slice(0, 1024), inline: false });
    }

    let embedTitle = `🎲 ${cleanTraits}`;
    let description;
    if (data.spell) {
      const trad = SPELL_TRADITIONS[data.spell.tradition] || SPELL_TRADITIONS.outro;
      if (!data.isBotch) embedColor = trad.color;
      embedTitle = `${data.spell.icon || '🔮'} ${data.spell.name} — ${data.spell.kindLabel || 'Feitiço'} ${String(data.spell.traditionLabel).toLowerCase()} nível ${data.spell.level}`;
      fields.splice(3, 0,
        { name: '🩸 Custo pago', value: data.spell.costPaid, inline: true },
        { name: '✧ Efeito', value: data.spell.effect, inline: true }
      );
    }
    if (data.hasRerolled) {
      const n = data.rerollCount || (data.rerolledIndices || []).length;
      description = `🔥 **REROLADO COM FORÇA DE VONTADE** — ${n} dado${n === 1 ? '' : 's'} com falha (marcados com ↻)`;
      if (!data.spell && !data.isBotch) embedColor = 0xd4af37;
    }

    const payload = {
      username: `${charName} (${charClan})`.slice(0, 80),
      content: emotesLine.slice(0, 1900),
      embeds: [{
        title: embedTitle.slice(0, 256),
        description,
        color: embedColor,
        fields,
        footer: { text: `Vampiro: A Máscara (V20)${footerNote ? ` • ${footerNote}` : ''}` },
        timestamp: new Date().toISOString()
      }]
    };

    const finalAvatar = await this.getValidAvatarUrl(header);
    if (finalAvatar) {
      payload.avatar_url = finalAvatar;
      payload.embeds[0].author = { name: charName.slice(0, 256), icon_url: finalAvatar };
      payload.embeds[0].thumbnail = { url: finalAvatar };
    }
    return payload;
  },

  async sendRoll(data) {
    const rawUrl = this.getUrl();
    if (!rawUrl) return; // Envio automático apenas quando há webhook configurado

    // ?wait=true devolve o ID da mensagem para permitir a edição posterior
    const url = rawUrl.includes('?') ? `${rawUrl}&wait=true` : `${rawUrl}?wait=true`;
    const payload = await this.buildRollPayload(data);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response && (response.ok || response.status === 204)) {
        AmbientAudio.raven();
        showToast('Rolagem enviada para o Discord!', 'info');
        const resJson = await response.json().catch(() => null);
        if (resJson && resJson.id) currentRollState.lastDiscordMessageId = resJson.id;
      } else if (response) {
        const errData = await response.json().catch(() => ({}));
        console.error('Discord Webhook erro:', response.status, errData);
        showToast(`O Discord recusou a rolagem (erro ${response.status}). Confira a URL do webhook.`, 'danger');
      }
    } catch (err) {
      console.error('Erro ao disparar Discord Webhook:', err);
      showToast('Não foi possível falar com o Discord. Confira a URL do webhook ou se o navegador bloqueia a conexão.', 'danger');
    }
  },

  async editLastRoll(data, footerNote = 'Rolagem atualizada') {
    const rawUrl = this.getUrl();
    if (!rawUrl) return;
    if (!currentRollState.lastDiscordMessageId) return this.sendRoll(data);

    const cleanBaseUrl = rawUrl.split('?')[0];
    const patchUrl = `${cleanBaseUrl}/messages/${currentRollState.lastDiscordMessageId}`;
    const payload = await this.buildRollPayload(data, footerNote);
    delete payload.username;
    delete payload.avatar_url;

    try {
      const response = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response && (response.ok || response.status === 204)) {
        showToast('Mensagem do Discord atualizada.', 'success');
      } else if (response) {
        console.warn('Falha ao editar mensagem do Discord (status ' + response.status + '), enviando nova.');
        currentRollState.lastDiscordMessageId = null;
        this.sendRoll(data);
      }
    } catch (err) {
      console.error('Erro ao editar mensagem no Discord:', err);
    }
  },

  async sendTestMessage() {
    const url = this.getUrl();
    if (!url) {
      showToast('Insira a URL do Webhook do Discord antes de testar!', 'danger');
      return;
    }

    const payload = {
      username: 'Vampiro: A Máscara (V20)',
      embeds: [
        {
          title: 'Teste de Integração com o Discord',
          description: 'A integração com a Ficha de Personagem Automatizada (V20) foi configurada com sucesso!\n\nAs próximas rolagens de dados disparadas na ficha aparecerão neste canal.',
          color: 0x8b0000,
          fields: [
            { name: 'Status da Conexão', value: 'Operacional (fetch POST ativo)', inline: true },
            { name: 'Edição', value: 'Vampiro: A Máscara V20', inline: true }
          ],
          footer: { text: 'Vampiro: A Máscara (V20) • Teste de Webhook' },
          timestamp: new Date().toISOString()
        }
      ]
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok || response.status === 204) {
        showToast('Mensagem de teste enviada com sucesso para o Discord!', 'success');
      } else {
        showToast(`Erro ao testar Discord (Status ${response.status})`, 'danger');
      }
    } catch (err) {
      console.error('Erro no teste de Discord Webhook:', err);
      showToast('Falha na requisição ao Discord. Verifique a URL.', 'danger');
    }
  }
};

// =============================================================================
// SISTEMA DE LINK CABLE SEQUENCIAL COM FÍSICA E CABO CURVADO
// =============================================================================
const LinkCableSystem = {
  selectedNodes: [],
  animationFrameId: null,
  preset: null, // rolagem pronta (ataque, dano, absorção, parada livre)

  toggle(nodeData) {
    if (this.preset) {
      this.preset = null;
      RollOptions.reset();
    }
    const existingIndex = this.selectedNodes.findIndex(n => n.id === nodeData.id);
    let isAdding = false;

    if (existingIndex >= 0) {
      this.selectedNodes.splice(existingIndex, 1);
      if (nodeData.buttonEl) nodeData.buttonEl.classList.remove('active-linked');
    } else {
      this.selectedNodes.push(nodeData);
      if (nodeData.buttonEl) {
        nodeData.buttonEl.classList.add('active-linked');
        nodeData.buttonEl.classList.add('node-connecting');
        setTimeout(() => {
          if (nodeData.buttonEl) nodeData.buttonEl.classList.remove('node-connecting');
        }, 550);
      }
      isAdding = true;
    }

    // Conectar/desconectar uma Especialização liga/desliga a regra do 10 = 2 sucessos
    if (String(nodeData.id).startsWith('spec_')) {
      RollOptions.specialty = this.selectedNodes.some(n => String(n.id).startsWith('spec_'));
    }

    this.updateWebLines(isAdding && this.selectedNodes.length >= 2);
    this.updateDock();
  },

  /** Abre o rolador com uma parada pronta, sem cabos. */
  setPreset(preset) {
    this.selectedNodes.forEach(n => { if (n.buttonEl) n.buttonEl.classList.remove('active-linked'); });
    this.selectedNodes = [];
    this.updateWebLines(false);
    RollOptions.reset();
    RollOptions.applyWounds = preset.applyWounds !== false;
    this.preset = preset;
    const diffSelect = document.getElementById('dock-difficulty');
    if (diffSelect && preset.difficulty) diffSelect.value = String(preset.difficulty);
    const results = document.getElementById('dock-dice-results');
    if (results) results.classList.add('hidden');
    this.updateDock();
  },

  /** Partes da parada atual: nós conectados ou preset. null quando o dock está fechado. */
  getPoolParts() {
    if (this.selectedNodes.length > 0) {
      const nodeParts = this.selectedNodes.map(n => {
        const part = { label: n.label, value: parseInt(n.value, 10) || 0, id: n.id, ref: n.id };
        // Celeridade/Potência conectadas por cabo já contam: não somar de novo
        if (/^disc_/.test(String(n.id)) && /celeridade|celerity/i.test(n.label)) part.bonus = 'celerity';
        if (/^disc_/.test(String(n.id)) && /pot[eê]ncia|potence/i.test(n.label)) part.bonus = 'potence';
        return part;
      });
      return PhysicalDisciplines.apply(AppState.activeCharacter, nodeParts);
    }
    if (this.preset) {
      const char = AppState.activeCharacter;
      // Recalcula os valores do preset (ex.: bônus de sangue gasto depois de abrir)
      if ((this.preset.kind === 'soak' || this.preset.kind === 'damage') && char) {
        CombatManager.refreshPreset(this.preset, char);
      }
      if (this.preset.kind === 'spell' && char) {
        const sp = SpellManager.find(char, this.preset.meta.spellId);
        if (sp) this.preset.parts = SpellManager.poolParts(char, sp);
      }
      if (this.preset.kind === 'willpower' && char) {
        this.preset.parts = [{ label: 'Força de Vontade', value: parseInt(char.status.willpower_perm, 10) || 0 }];
      }
      return PhysicalDisciplines.apply(char, this.preset.parts.map(p => ({ ...p })));
    }
    return null;
  },

  getDifficulty() {
    const diffSelect = document.getElementById('dock-difficulty');
    return diffSelect ? clampInt(diffSelect.value, 2, 10, 6) : 6;
  },

  /** Calcula a parada final com modificador e penalidade de ferimento. */
  computePool() {
    const parts = this.getPoolParts() || [];
    const base = parts.reduce((acc, p) => acc + (parseInt(p.value, 10) || 0), 0);
    const char = AppState.activeCharacter;
    const wound = char ? getWoundState(char) : { penalty: 0, incapacitated: false, index: -1 };
    const penalty = RollOptions.applyWounds ? wound.penalty : 0;
    const total = Math.max(0, base + RollOptions.modifier - penalty);
    return { parts, base, modifier: RollOptions.modifier, penalty, wound, total };
  },

  clear() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.selectedNodes.forEach(n => {
      if (n.buttonEl) n.buttonEl.classList.remove('active-linked');
    });
    document.querySelectorAll('.card-cable-linked-active').forEach(c => c.classList.remove('card-cable-linked-active'));
    this.selectedNodes = [];
    this.preset = null;
    if (typeof RollOptions !== 'undefined') RollOptions.reset();
    this.updateWebLines(false);
    this.updateDock();
  },

  drawCables() {
    this.updateWebLines(false);
  },

  updateWebLines(animate = false) {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const svgLinesGroup = document.getElementById('blood-web-lines');
    if (!svgLinesGroup) return;
    svgLinesGroup.innerHTML = '';

    // Limpa estado de brilho dos cards antes de reavaliar visibilidade
    document.querySelectorAll('.card-cable-linked-active').forEach(c => c.classList.remove('card-cable-linked-active'));

    if (this.selectedNodes.length === 0) return;

    // 1º Passo: Avalia a visibilidade de cada nó e coleta referências
    const rawNodes = this.selectedNodes.map(node => {
      if (!node.buttonEl) return null;
      const pageEl = node.buttonEl.closest('.page-container');
      if (pageEl && pageEl.classList.contains('hidden-page')) return null;

      const card = node.buttonEl.closest('.draggable-card') || node.buttonEl.closest('.status-card') || node.buttonEl.closest('.trait-category');
      const rect = node.buttonEl.getBoundingClientRect();

      let isNodeVisible = true;
      if (rect.width === 0 || rect.height === 0) {
        isNodeVisible = false;
      } else if (card) {
        const cardRect = card.getBoundingClientRect();
        if (card.classList.contains('is-collapsed-small')) {
          isNodeVisible = false;
        } else if (
          rect.bottom <= cardRect.top + 4 ||
          rect.top >= cardRect.bottom - 4 ||
          rect.right <= cardRect.left + 4 ||
          rect.left >= cardRect.right - 4
        ) {
          isNodeVisible = false;
        }
      }

      if (isNodeVisible) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          isCardFallback: false,
          card: null,
          cardRect: null
        };
      }

      // Se a bolinha selecionada não estiver visível (card colapsado/oculto), ativa brilho no card
      if (card) {
        const cardRect = card.getBoundingClientRect();
        if (cardRect.width > 0 && cardRect.height > 0) {
          card.classList.add('card-cable-linked-active');
          return {
            x: cardRect.left + cardRect.width / 2,
            y: cardRect.top + cardRect.height / 2,
            isCardFallback: true,
            card: card,
            cardRect: cardRect
          };
        }
      }

      return null;
    }).filter(c => c !== null);

    if (rawNodes.length === 0) return;

    // Referência de ancoragem inferior caso haja apenas 1 nó
    const dockEl = document.getElementById('dice-roller-dock');
    const dockRect = dockEl ? dockEl.getBoundingClientRect() : null;
    const defaultTarget = dockRect 
      ? { x: dockRect.left + dockRect.width / 2, y: dockRect.top + 8 }
      : { x: window.innerWidth / 2, y: window.innerHeight - 30 };

    // 2º Passo: Calcula o ponto grudado exatamente na borda do container na direção do cabo
    const coords = rawNodes.map((item, idx) => {
      if (!item.isCardFallback) {
        return { x: item.x, y: item.y, isCardFallback: false };
      }

      let target = defaultTarget;
      if (rawNodes.length > 1) {
        if (idx < rawNodes.length - 1) target = rawNodes[idx + 1];
        else target = rawNodes[idx - 1];
      }

      const cx = item.cardRect.left + item.cardRect.width / 2;
      const cy = item.cardRect.top + item.cardRect.height / 2;
      const dx = target.x - cx;
      const dy = target.y - cy;

      let borderX = cx;
      let borderY = item.cardRect.top;

      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        const halfW = item.cardRect.width / 2;
        const halfH = item.cardRect.height / 2;
        const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
        const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
        const scale = Math.min(scaleX, scaleY);
        borderX = cx + dx * scale;
        borderY = cy + dy * scale;
      }

      return {
        x: borderX,
        y: borderY,
        isCardFallback: true
      };
    });

    if (coords.length === 0) return;

    // Desenha o anel de brilho (aura) e conector no overlay SVG global (z-index 90, 100% livre de qualquer corte)
    coords.forEach(p => {
      const aura = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      aura.setAttribute('cx', p.x);
      aura.setAttribute('cy', p.y);
      aura.setAttribute('r', '9.5');
      aura.setAttribute('class', 'cable-node-aura');
      svgLinesGroup.appendChild(aura);

      const joint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      joint.setAttribute('cx', p.x);
      joint.setAttribute('cy', p.y);
      joint.setAttribute('r', '4.5');
      joint.setAttribute('class', 'cable-connector-joint');
      svgLinesGroup.appendChild(joint);
    });

    if (coords.length < 2) return;

    const segments = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);

      const baseSag = Math.min(220, Math.max(35, dist * 0.26 + Math.abs(dx) * 0.12));
      const cp1x = p1.x + dx * 0.25;
      const cp2x = p1.x + dx * 0.75;

      const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glowPath.setAttribute('class', 'blood-cable-path-glow');
      svgLinesGroup.appendChild(glowPath);

      const mainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      mainPath.setAttribute('class', 'blood-cable-path-main');
      svgLinesGroup.appendChild(mainPath);

      const corePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      corePath.setAttribute('class', 'blood-cable-path-core');
      svgLinesGroup.appendChild(corePath);

      segments.push({
        p1, p2, dx, dy, dist, cp1x, cp2x, baseSag,
        glowPath, mainPath, corePath,
        isNew: i === coords.length - 2
      });
    }

    const renderSegments = (progress = 1) => {
      // Oscilação suave com início em zero (sem salto inicial brusco) e amortecimento gradual
      const decay = progress >= 1 ? 0 : Math.exp(-progress * 2.8);
      const verticalSway = progress >= 1 ? 0 : Math.sin(progress * Math.PI * 2.4) * decay;
      const horizontalSway = progress >= 1 ? 0 : Math.sin(progress * Math.PI * 1.8) * decay;

      segments.forEach((seg) => {
        let currentSag = seg.baseSag;
        let lateralOffset = 0;

        // APENAS A NOVA LIGAÇÃO BALANÇA COM AMPLITUDE SUAVE E DELICADA
        if (seg.isNew && progress < 1) {
          currentSag = seg.baseSag * (1 + 0.14 * verticalSway);
          const safeDist = seg.dist || 100;
          const lateralAmp = Math.min(15, Math.max(5, safeDist * 0.028));
          lateralOffset = lateralAmp * horizontalSway;
        }

        const cp1x = seg.cp1x + lateralOffset * 0.6;
        const cp1y = seg.p1.y + Math.max(0, seg.dy * 0.3) + currentSag;

        const cp2x = seg.cp2x + lateralOffset * 0.8;
        const cp2y = seg.p2.y - Math.max(0, -seg.dy * 0.3) + currentSag;

        const d = `M ${seg.p1.x} ${seg.p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${seg.p2.x} ${seg.p2.y}`;
        seg.glowPath.setAttribute('d', d);
        seg.mainPath.setAttribute('d', d);
        seg.corePath.setAttribute('d', d);
      });
    };

    if (!animate) {
      renderSegments(1);
      return;
    }

    // Inicia suavemente a partir do estado de repouso (offset zero)
    renderSegments(0);

    // ANIMAÇÃO DE BALANÇO SUAVE E DELICADA (1200ms DE AMORTECIMENTO TRANQUILO)
    const startTime = performance.now();
    const duration = 1200; // ms

    const animateSway = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      renderSegments(progress);

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animateSway);
      } else {
        renderSegments(1);
        this.animationFrameId = null;
      }
    };

    this.animationFrameId = requestAnimationFrame(animateSway);
  },

  updateDock(fromModifierInput = false) {
    const dock = document.getElementById('dice-roller-dock');
    const badgesContainer = document.getElementById('dock-selected-traits-list');
    const mathDisplay = document.getElementById('dock-pool-math');
    const totalBadge = document.getElementById('dock-pool-total');
    const commandInput = document.getElementById('dock-command-input');
    const resultsContainer = document.getElementById('dock-dice-results');
    const titleEl = document.getElementById('dock-title');

    if (!dock) return;

    const parts = this.getPoolParts();
    if (parts === null) {
      dock.classList.add('hidden');
      document.body.classList.remove('dock-open');
      if (resultsContainer) resultsContainer.classList.add('hidden');
      return;
    }

    dock.classList.remove('hidden');
    document.body.classList.add('dock-open');
    if (titleEl) titleEl.textContent = this.preset ? this.preset.title : 'Parada de dados';
    const noteEl = document.getElementById('dock-preset-note');
    if (noteEl) {
      const note = this.preset && this.preset.note ? this.preset.note : '';
      noteEl.textContent = note;
      noteEl.hidden = !note;
    }
    dock.classList.toggle('dock-spell', !!(this.preset && this.preset.kind === 'spell'));
    SpellManager.markActive();

    if (badgesContainer) {
      badgesContainer.innerHTML = '';
      parts.forEach((part, idx) => {
        const badge = document.createElement('span');
        badge.className = 'dock-trait-badge';
        badge.innerHTML = `${escapeHtml(part.label)} <strong>[${part.value}]</strong>`;
        badgesContainer.appendChild(badge);
        if (idx < parts.length - 1) {
          const plus = document.createElement('span');
          plus.className = 'dock-plus';
          plus.textContent = '+';
          badgesContainer.appendChild(plus);
        }
      });
    }

    const pool = this.computePool();
    const segments = [];
    if (parts.length) segments.push(parts.map(p => `${p.label} (${p.value})`).join(' + '));
    if (pool.modifier) segments.push(`${pool.modifier > 0 ? '+' : '−'} ${Math.abs(pool.modifier)} mod.`);
    if (pool.penalty) segments.push(`− ${pool.penalty} ferimento`);
    if (mathDisplay) mathDisplay.textContent = segments.join(' ') || 'Ajuste o modificador para definir a parada';
    if (totalBadge) totalBadge.textContent = pool.total;

    const diff = this.getDifficulty();
    const label = this.preset ? this.preset.title : parts.map(p => p.label).join(' + ');
    if (commandInput) commandInput.value = buildRollCommand(RollOptions.commandFormat, pool.total, diff, RollOptions.commandFormat === 'vr' ? '' : label);

    const fmtSel = document.getElementById('dock-command-format');
    if (fmtSel && fmtSel.value !== RollOptions.commandFormat) fmtSel.value = RollOptions.commandFormat;

    const modInput = document.getElementById('dock-modifier');
    if (modInput && !fromModifierInput) modInput.value = RollOptions.modifier;

    const setToggle = (id, on, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('aria-pressed', String(!!on));
      el.classList.toggle('is-on', !!on);
      if (text) el.querySelector('.chip-text').textContent = text;
    };
    setToggle('toggle-specialty', RollOptions.specialty, RollOptions.specialty ? '10 = 2 sucessos' : '10 = 1 sucesso');

    // Chance antes de rolar
    const odds = document.getElementById('dock-odds-value');
    const botchEl = document.getElementById('dock-odds-botch');
    const reqSel = document.getElementById('dock-required');
    if (reqSel && String(reqSel.value) !== String(RollOptions.required)) reqSel.value = String(RollOptions.required);
    if (odds) {
      const fixed = clampInt(RollOptions.guaranteed, 0, 10, 0) + (RollOptions.autoSuccess ? 1 : 0)
        + (this.preset && this.preset.autoSuccesses ? this.preset.autoSuccesses : 0);
      const pr = RollProbability.compute(pool.total, diff, { specialty: RollOptions.specialty, fixed, required: RollOptions.required });
      odds.textContent = RollProbability.pct(pr.success);
      odds.className = `dock-odds-value ${RollProbability.level(pr.success)}`;
      if (botchEl) botchEl.textContent = fixed > 0 ? 'sem risco de falha crítica' : `falha crítica ${RollProbability.pct(pr.botch)}`;
    }
    const gSel = document.getElementById('dock-guaranteed');
    if (gSel && String(gSel.value) !== String(RollOptions.guaranteed)) gSel.value = String(RollOptions.guaranteed);
    if (gSel) gSel.classList.toggle('is-active', RollOptions.guaranteed > 0);
    const wpAvail = AppState.activeCharacter ? getWillpowerAvailable(AppState.activeCharacter) : 0;
    setToggle('toggle-auto-success', RollOptions.autoSuccess, `FV: +1 sucesso (${wpAvail})`);
    const woundText = pool.wound.incapacitated
      ? 'Incapacitado'
      : (pool.wound.index < 0 ? 'Ferimentos: 0' : `Ferimentos: −${pool.wound.penalty}`);
    setToggle('toggle-wounds', RollOptions.applyWounds, woundText);
    const woundChip = document.getElementById('toggle-wounds');
    if (woundChip) woundChip.classList.toggle('is-hurt', pool.wound.penalty > 0 || pool.wound.incapacitated);
  },

  refreshNodeValues() {
    this.selectedNodes.forEach(node => {
      if (node.getter) node.value = node.getter();
    });
    this.updateDock();
    SpellManager.scheduleRefresh();
  }
};

// =============================================================================
// RENDERIZAÇÃO DA INTERFACE, ESPECIALIZAÇÕES, CAMINHOS E RITUAIS
// =============================================================================
const UIRenderer = {
  
  renderAll() {
    const char = AppState.activeCharacter;
    if (!char) return;

    syncBloodPoolWithGeneration(char);
    this.updateDropdown();
    this.bindInputs(char);
    this.renderAvatar(char);
    this.renderAllDots(char);
    this.renderDynamicDisciplines(char);
    this.renderDynamicSpecializations(char);
    this.renderDynamicBackgrounds(char);
    this.renderDynamicPaths(char);
    this.renderDynamicRituals(char);
    this.renderWillpowerTemp(char);
    this.renderBloodPool(char);
    this.renderHealthTrack(char);
    this.updateXPCalculation(char);
    this.bindLinkCableNodes(char);
    this.renderDynamicRitualsState();
    ExtRenderer.renderAll(char);
    DraggableWindowManager.applyAllPositions();
    LinkCableSystem.updateDock();
  },

  /** Mantém o estado expandido/recolhido dos rituais entre renderizações. */
  renderDynamicRitualsState() {
    if (!this._ritualOpen) this._ritualOpen = new Set();
  },

  renderAvatar(char) {
    const img = document.getElementById('char-avatar-img');
    const placeholder = document.getElementById('char-avatar-placeholder');
    const btnRemove = document.getElementById('btn-avatar-remove');

    if (!img || !placeholder) return;

    const avatarUrl = (char && char.header && char.header.avatar) ? char.header.avatar.trim() : '';

    if (avatarUrl) {
      img.src = avatarUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
      if (btnRemove) btnRemove.classList.remove('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
      if (btnRemove) btnRemove.classList.add('hidden');
    }
  },

  updateDropdown() {
    const select = document.getElementById('character-select');
    if (!select) return;
    select.innerHTML = '';
    AppState.characters.forEach(char => {
      const opt = document.createElement('option');
      opt.value = char.id;
      const charName = (char.header && char.header.name && char.header.name.trim()) ? char.header.name.trim() : 'Sem Nome';
      const charClan = (char.header && char.header.clan && char.header.clan.trim()) ? ` (${char.header.clan})` : '';
      const charGen = (char.header && char.header.generation) ? ` - ${char.header.generation}` : '';
      opt.textContent = charName + charClan + charGen;
      if (char.id === AppState.activeCharacter.id) opt.selected = true;
      select.appendChild(opt);
    });
  },

  bindInputs(char) {
    const boundElements = document.querySelectorAll('[data-bind]');
    boundElements.forEach(el => {
      const path = el.getAttribute('data-bind');
      const val = getNestedValue(char, path);
      if (val !== undefined && val !== null) el.value = val;
      else el.value = '';
    });
  },

  renderAllDots(char) {
    const dotContainers = document.querySelectorAll('.trait-row[data-trait] .dots-group, .dots-group[data-trait]');

    dotContainers.forEach(container => {
      const row = container.closest('[data-trait]') || container;
      const traitPath = row.getAttribute('data-trait');
      const min = parseInt(container.getAttribute('data-min') || '0', 10);
      const max = parseInt(container.getAttribute('data-max') || '9', 10);
      let currentVal = getNestedValue(char, traitPath);

      if (currentVal === undefined || currentVal === null) {
        currentVal = min;
        setNestedValue(char, traitPath, currentVal);
      }

      // Pontos até o limite da Geração são "normais"; acima disso ficam marcados
      // como temporários (sangue, Celeridade, Vigor emprestado...), mas continuam clicáveis.
      const isTraitScale = /^(attributes|abilities)\./.test(traitPath);
      const genLimit = isTraitScale ? getGenerationRule(char.header ? char.header.generation : '13ª').maxTrait : null;

      const label = row.getAttribute('data-label') || traitPath;
      container.setAttribute('data-val', currentVal);
      container.dataset.xpRef = traitPath;
      this.buildDotsHtml(container, currentVal, min, max, (newVal) => {
        const active = AppState.activeCharacter;
        setNestedValue(active, traitPath, newVal);
        // Virtude comprada com XP não aumenta Humanidade nem FV retroativamente
        if (traitPath.startsWith('virtues.') && !XPManager.enabled(active) && DerivedStats.applyIfAuto(active)) {
          this.renderWillpowerTemp(active);
        }
        AppState.saveToStorage();
        this.renderAllDots(active);
        LinkCableSystem.refreshNodeValues();
        ExtRenderer.renderWillpowerBadge(active);
        DerivedStats.renderHint(active);
        if (isTraitScale) { CombatManager.render(active); }
      }, genLimit, label);
      FX.decorateXp(container, traitPath);
    });

    ExtRenderer.renderPhysicalBoostBadges(char);
  },

  /**
   * Desenha os pontos de um traço.
   * limit: pontos acima deste valor aparecem como "acima do limite da Geração".
   * O container vira um controle deslizante acessível pelo teclado (setas).
   */
  buildDotsHtml(container, currentVal, min, max, onValueChange, limit = null, label = '') {
    container.innerHTML = '';
    // Selo numérico antes dos pontos (igual ao site publicado).
    // Fica dentro do próprio grupo para funcionar também em linhas ainda não inseridas no DOM.
    const badge = document.createElement('span');
    badge.className = 'dots-value' + (currentVal ? '' : ' is-zero');
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(currentVal);
    if (limit !== null && currentVal > limit) {
      badge.classList.add('is-over-limit');
      badge.title = `${currentVal} está acima do limite da Geração (${limit}): conta como pontos temporários.`;
    }
    // Objetivo de build: mostra a meta ao lado do valor e os pontos planejados
    const planned = GoalPlanner.plannedTarget(container);
    if (planned && planned > currentVal) {
      badge.dataset.goal = planned;
      badge.classList.add('has-goal');
    }
    container.appendChild(badge);
    const isLocked = () => !!container.closest('.section-locked');
    // Modo Editável XP: calcula e registra o custo (ou bloqueia se faltar XP)
    const commit = (newVal) => {
      const xpOn = XPManager.enabled(AppState.activeCharacter) && newVal > currentVal;
      if (!XPManager.beforeChange(container, currentVal, newVal)) return false;
      // O container guarda a referência do traço (data-xp-ref)
      if (xpOn) FX.markXpBuy(container.dataset.xpRef || '');
      onValueChange(newVal);
      // A ficha redesenha os pontos: anima depois, no ponto equivalente
      FX.dot(container, (newVal > currentVal ? newVal : currentVal) - 1, newVal > currentVal);
      return true;
    };
    for (let i = 1; i <= max; i++) {
      const dot = document.createElement('span');
      const over = limit !== null && i > limit;
      dot.className = 'dot' + (i <= currentVal ? ' active' : '') + (over ? ' dot-over-limit' : '')
        + (planned && i > currentVal && i <= planned ? ' dot-planned' : '');
      dot.dataset.index = i;
      dot.title = over ? `${i}: acima do limite da Geração (${limit}) — vale como ponto temporário` : `${i} / ${max}`;

      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLocked()) { SectionLock.warn(container); return; }
        if (GoalPlanner.handleDot(container, currentVal, i)) return;
        let newVal = i;
        if (currentVal === i) newVal = Math.max(min, i - 1);
        commit(newVal);
      });

      dot.addEventListener('mouseenter', () => {
        container.querySelectorAll('.dot').forEach((d, idx) => d.classList.toggle('hover-fill', idx < i));
        dot.title = GoalPlanner.active() && container.dataset.xpRef
          ? GoalPlanner.previewTitle(container, currentVal, i)
          : XPManager.enabled() && container.dataset.xpRef
          ? XPManager.previewTitle(container, currentVal, i)
          : (over ? `${i}: acima do limite da Geração (${limit}) — ponto temporário` : `${i} / ${max}`);
      });

      container.appendChild(dot);
    }

    container.onmouseleave = () => container.querySelectorAll('.dot').forEach(d => d.classList.remove('hover-fill'));
    const keyMax = max;
    container.tabIndex = 0;
    container.setAttribute('role', 'slider');
    container.setAttribute('aria-valuemin', String(min));
    container.setAttribute('aria-valuemax', String(keyMax));
    container.setAttribute('aria-valuenow', String(currentVal));
    if (label) container.setAttribute('aria-label', label);
    container.onkeydown = (e) => {
      if (isLocked()) return;
      if (GoalPlanner.active() && container.dataset.xpRef) {
        const delta = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
        if (delta) { e.preventDefault(); GoalPlanner.handleKey(container, currentVal, delta); }
        return;
      }
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(max, currentVal + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(min, currentVal - 1);
      else if (e.key === 'Home') next = min;
      if (next !== null && next !== currentVal) {
        e.preventDefault();
        const path = container.closest('[data-trait]') ? container.closest('[data-trait]').getAttribute('data-trait') : null;
        if (!commit(next)) return;
        // devolve o foco ao controle recriado
        requestAnimationFrame(() => {
          const again = path
            ? document.querySelector(`[data-trait="${path}"] .dots-group, .dots-group[data-trait="${path}"]`)
            : null;
          if (again) again.focus();
        });
      }
    };
  },

  bindLinkCableNodes(char) {
    const rows = document.querySelectorAll('.trait-row[data-trait]');
    rows.forEach(row => {
      const linkBtn = row.querySelector('.trait-link-node');
      const traitPath = row.getAttribute('data-trait');
      const label = row.getAttribute('data-label') || (row.querySelector('.trait-name') ? row.querySelector('.trait-name').textContent : 'Traço');
      
      if (linkBtn) {
        linkBtn.onclick = (e) => {
          e.stopPropagation();

          const getValue = () => {
            if (traitPath === 'status.willpower_perm') {
              const perm = parseInt(getNestedValue(AppState.activeCharacter, 'status.willpower_perm'), 10) || 0;
              const tempSpent = (AppState.activeCharacter && AppState.activeCharacter.status && Array.isArray(AppState.activeCharacter.status.willpower_temp))
                ? AppState.activeCharacter.status.willpower_temp.filter(Boolean).length
                : 0;
              return Math.max(0, perm - tempSpent);
            }
            return getTraitValue(AppState.activeCharacter, traitPath);
          };

          const currentVal = getValue();
          LinkCableSystem.toggle({
            id: traitPath,
            label: label,
            value: currentVal,
            buttonEl: linkBtn,
            getter: getValue
          });
        };
      }
    });
  },

  renderDynamicDisciplines(char) {
    const list = document.getElementById('disciplines-list');
    if (!list) return;
    DisciplineCatalog.render(char);
    list.innerHTML = '';
    if (!Array.isArray(char.disciplines)) char.disciplines = [];

    char.disciplines.forEach((disc, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';

      const linkBtn = document.createElement('button');
      linkBtn.type = 'button';
      linkBtn.className = 'trait-link-node';
      linkBtn.title = 'Conectar Disciplina para rolagem';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dynamic-input';
      input.placeholder = 'Nome da Disciplina';
      input.value = disc.name || '';
      input.setAttribute('aria-label', 'Nome da Disciplina');
      // Caixa de sugestões: escolha da lista ou digite o que quiser
      input.setAttribute('list', 'discipline-names');
      input.title = 'Escolha na lista ou escreva o nome que quiser';
      input.addEventListener('input', (e) => {
        disc.name = e.target.value;
        AppState.saveToStorage();
        LinkCableSystem.refreshNodeValues();
        CombatManager.renderSoak(AppState.activeCharacter);
      });

      const discMax = ELDER_TRAIT_MAX;
      const discLimit = getGenerationRule(char.header ? char.header.generation : '13ª').maxTrait;
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'dots-group dots-9';
      dotsContainer.setAttribute('data-min', '0');
      dotsContainer.setAttribute('data-max', String(discMax));
      dotsContainer.setAttribute('data-val', disc.level || 0);
      if (!disc.id) disc.id = generateUniqueId();
      dotsContainer.dataset.xpRef = `disc:${disc.id}`;

      this.buildDotsHtml(dotsContainer, disc.level || 0, 0, discMax, (newVal) => {
        disc.level = newVal;
        AppState.saveToStorage();
        this.renderDynamicDisciplines(AppState.activeCharacter);
        LinkCableSystem.refreshNodeValues();
        CombatManager.renderSoak(AppState.activeCharacter);
      }, discLimit, disc.name || 'Disciplina');

      if (disc.inClan) {
        row.classList.add('is-in-clan');
        input.title = 'Disciplina de clã';
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-trait';
      removeBtn.title = 'Remover Disciplina';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        XPManager.onRemove(char, `disc:${disc.id}`);
        char.disciplines.splice(index, 1);
        AppState.saveToStorage();
        this.renderDynamicDisciplines(AppState.activeCharacter);
        CombatManager.renderSoak(AppState.activeCharacter);
        LinkCableSystem.clear();
      });

      linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const discLabel = disc.name ? disc.name.trim() : `Disciplina #${index + 1}`;
        LinkCableSystem.toggle({
          id: `disc_${disc.id || index}`,
          label: discLabel,
          value: disc.level || 0,
          buttonEl: linkBtn,
          getter: () => disc.level || 0
        });
      });

      row.appendChild(linkBtn);
      row.appendChild(input);
      row.appendChild(XPManager.disciplineChip(char, disc, () => this.renderDynamicDisciplines(AppState.activeCharacter)));
      row.appendChild(dotsContainer);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  },

  renderDynamicSpecializations(char) {
    const list = document.getElementById('specializations-list');
    SpecializationCatalog.render(char);
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(char.specializations)) char.specializations = [];

    char.specializations.forEach((spec, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';

      const linkBtn = document.createElement('button');
      linkBtn.type = 'button';
      linkBtn.className = 'trait-link-node';
      linkBtn.title = 'Conectar Especialização para rolagem';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dynamic-input';
      input.placeholder = 'Ex: Ocultismo: Rituais';
      input.value = spec.name || '';
      input.setAttribute('list', 'specialization-names');
      input.title = 'Escreva o traço (ex.: "Briga") para ver as sugestões dele';
      input.addEventListener('focus', () => SpecializationCatalog.render(char, input.value));
      input.addEventListener('input', (e) => {
        spec.name = e.target.value;
        SpecializationCatalog.render(char, e.target.value);
        AppState.saveToStorage();
        LinkCableSystem.refreshNodeValues();
      });

      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'dots-group dots-9';
      dotsContainer.setAttribute('data-min', '0');
      dotsContainer.setAttribute('data-max', '9');
      dotsContainer.setAttribute('data-val', spec.level || 0);

      this.buildDotsHtml(dotsContainer, spec.level || 0, 0, 9, (newVal) => {
        spec.level = newVal;
        AppState.saveToStorage();
        this.renderDynamicSpecializations(AppState.activeCharacter);
        LinkCableSystem.refreshNodeValues();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-trait';
      removeBtn.title = 'Remover Especialização';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        XPManager.onRemove(char, `spec:${spec.id}`);
        char.specializations.splice(index, 1);
        AppState.saveToStorage();
        this.renderDynamicSpecializations(AppState.activeCharacter);
        LinkCableSystem.clear();
      });

      linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const specLabel = spec.name ? spec.name.trim() : `Especialização #${index + 1}`;
        LinkCableSystem.toggle({
          id: `spec_${spec.id || index}`,
          label: specLabel,
          value: spec.level || 0,
          buttonEl: linkBtn,
          getter: () => spec.level || 0
        });
      });

      if (!spec.id) spec.id = generateUniqueId();
      row.appendChild(linkBtn);
      row.appendChild(input);
      row.appendChild(XPManager.itemChip(char, {
        ref: `spec:${spec.id}`, type: 'specialty', label: `Especialização ${spec.name || ''}`.trim(), amount: 3, rule: '3 (fixo)', compact: true
      }, () => this.renderDynamicSpecializations(AppState.activeCharacter)));
      row.appendChild(dotsContainer);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  },

  renderDynamicBackgrounds(char) {
    BackgroundCatalog.render(char);
    const list = document.getElementById('backgrounds-list');
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(char.backgrounds)) char.backgrounds = [];

    char.backgrounds.forEach((bg, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dynamic-input';
      input.placeholder = 'Nome do Antecedente';
      input.setAttribute('list', 'background-names');
      input.title = 'Escolha na lista ou escreva o nome que quiser';
      input.value = bg.name || '';
      input.addEventListener('input', (e) => {
        bg.name = e.target.value;
        AppState.saveToStorage();
      });

      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'dots-group dots-9';
      dotsContainer.setAttribute('data-min', '0');
      dotsContainer.setAttribute('data-max', '9');
      dotsContainer.setAttribute('data-val', bg.level || 0);
      if (!bg.id) bg.id = generateUniqueId();
      dotsContainer.dataset.xpRef = `bg:${bg.id}`;

      this.buildDotsHtml(dotsContainer, bg.level || 0, 0, 9, (newVal) => {
        bg.level = newVal;
        AppState.saveToStorage();
        this.renderDynamicBackgrounds(AppState.activeCharacter);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-trait';
      removeBtn.title = 'Remover Antecedente';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        XPManager.onRemove(char, `bg:${bg.id}`);
        char.backgrounds.splice(index, 1);
        AppState.saveToStorage();
        this.renderDynamicBackgrounds(AppState.activeCharacter);
      });

      row.appendChild(input);
      row.appendChild(dotsContainer);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  },

  renderDynamicPaths(char) {
    const list = document.getElementById('paths-list');
    if (!list) return;
    PathCatalog.render(char);
    list.innerHTML = '';
    if (!Array.isArray(char.paths)) char.paths = [];

    char.paths.forEach((pth, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-row';

      const linkBtn = document.createElement('button');
      linkBtn.type = 'button';
      linkBtn.className = 'trait-link-node';
      linkBtn.title = 'Conectar Caminho para rolagem';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dynamic-input';
      input.placeholder = 'Nome do Caminho';
      input.value = pth.name || '';
      // Caixa de sugestões filtrada pela Disciplina de magia de sangue da ficha
      input.setAttribute('list', 'path-names');
      input.title = 'Escolha na lista da sua Disciplina ou escreva o nome que quiser';
      input.addEventListener('input', (e) => {
        pth.name = e.target.value;
        PathCatalog.render(char);
        AppState.saveToStorage();
        LinkCableSystem.refreshNodeValues();
      });

      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'dots-group dots-9';
      dotsContainer.setAttribute('data-min', '0');
      dotsContainer.setAttribute('data-max', '9');
      dotsContainer.setAttribute('data-val', pth.level || 0);
      if (!pth.id) pth.id = generateUniqueId();
      dotsContainer.dataset.xpRef = `path:${pth.id}`;

      this.buildDotsHtml(dotsContainer, pth.level || 0, 0, 9, (newVal) => {
        pth.level = newVal;
        AppState.saveToStorage();
        this.renderDynamicPaths(AppState.activeCharacter);
        LinkCableSystem.refreshNodeValues();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-trait';
      removeBtn.title = 'Remover Caminho';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        XPManager.onRemove(char, `path:${pth.id}`);
        char.paths.splice(index, 1);
        AppState.saveToStorage();
        this.renderDynamicPaths(AppState.activeCharacter);
        LinkCableSystem.clear();
      });

      linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pthLabel = pth.name ? pth.name.trim() : `Caminho #${index + 1}`;
        LinkCableSystem.toggle({
          id: `path_${pth.id || index}`,
          label: pthLabel,
          value: pth.level || 0,
          buttonEl: linkBtn,
          getter: () => pth.level || 0
        });
      });

      row.appendChild(linkBtn);
      row.appendChild(input);
      row.appendChild(XPManager.pathChip(char, pth, () => this.renderDynamicPaths(AppState.activeCharacter)));
      row.appendChild(dotsContainer);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  },

  /** Grimório de feitiços customizados (ver SpellManager em v20-automacoes.js). */
  renderDynamicRituals(char) {
    SpellManager.render(char);
  },

  renderWillpowerTemp(char) {
    const container = document.getElementById('willpower-temp-boxes');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(char.status.willpower_temp) || char.status.willpower_temp.length !== 10) {
      char.status.willpower_temp = Array(10).fill(false);
    }
    for (let i = 0; i < 10; i++) {
      const box = document.createElement('div');
      box.className = 'box-item' + (char.status.willpower_temp[i] ? ' checked' : '');
      box.title = `Ponto de Vontade Gasto #${i + 1}`;
      box.setAttribute('role', 'checkbox');
      box.setAttribute('aria-checked', String(!!char.status.willpower_temp[i]));
      box.tabIndex = 0;
      const toggleBox = () => {
        FX.willpower(i, !char.status.willpower_temp[i]);
        char.status.willpower_temp[i] = !char.status.willpower_temp[i];
        AppState.saveToStorage();
        this.renderWillpowerTemp(AppState.activeCharacter);
        LinkCableSystem.refreshNodeValues();
      };
      box.addEventListener('click', toggleBox);
      box.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleBox(); } });
      container.appendChild(box);
    }
    ExtRenderer.renderWillpowerBadge(char);
  },

  renderBloodPool(char) {
    const container = document.getElementById('blood-pool-grid');
    const counterDisplay = document.getElementById('blood-count-display');
    const rulesInfo = document.getElementById('generation-rules-info');
    if (!container) return;
    container.innerHTML = '';

    const gen = char.header && char.header.generation ? char.header.generation : '13ª';
    const rule = getGenerationRule(gen);
    syncBloodPoolWithGeneration(char);

    const totalMax = rule.maxBlood;
    let activeCount = 0;

    for (let i = 0; i < totalMax; i++) {
      const isFilled = char.status.blood_pool[i] === true;
      if (isFilled) activeCount++;
      const bloodPt = document.createElement('div');
      bloodPt.className = 'blood-point' + (isFilled ? ' active' : '');
      bloodPt.dataset.index = i;
      bloodPt.title = `Ponto ${i + 1} de ${totalMax} · arraste para encher/esvaziar vários · Shift + clique para um intervalo`;
      container.appendChild(bloodPt);
    }

    if (counterDisplay) counterDisplay.textContent = `${activeCount} / ${totalMax}`;
    if (rulesInfo) {
      rulesInfo.innerHTML = `
        <span>Geração: <strong>${rule.label || gen}</strong></span> • 
        <span>Max: <strong>${rule.maxBlood} pts</strong></span> • 
        <span>Gasto/Turno: <strong>${rule.bloodPerTurn} pt${rule.bloodPerTurn > 1 ? 's' : ''}</strong></span> • 
        <span title="Limite oficial do livro. A ficha permite até 9 pontos para Anciões.">Limite oficial: <strong>${rule.maxTrait}</strong></span>
      `;
    }
    BloodMeter.render(char);
    BloodPoolUI.decorate(char);
    CombatManager.renderSoak(char);
    PhysicalDisciplines.render(char);
    PortraitState.render(char);
    FX.render(char);
    GenerationStepper.render(char);
    SpellManager.scheduleRefresh();
  },

  renderHealthTrack(char) {
    const container = document.getElementById('health-track-list');
    if (!container) return;
    container.innerHTML = '';
    if (!char.health) char.health = { bruised: '', hurt: '', injured: '', wounded: '', mauled: '', crippled: '', incapacitated: '' };

    HEALTH_LEVELS.forEach(lvl => {
      const row = document.createElement('div');
      row.className = 'health-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'health-name';
      nameSpan.textContent = lvl.label;

      const penaltySpan = document.createElement('span');
      penaltySpan.className = 'health-penalty';
      penaltySpan.textContent = lvl.penalty;

      const box = document.createElement('div');
      const currentState = char.health[lvl.key] || '';
      box.className = 'health-box' + (currentState ? ` state-${currentState}` : '');
      box.title = `Estado: ${currentState || 'Livre'}`;

      box.setAttribute('role', 'button');
      box.tabIndex = 0;
      box.setAttribute('aria-label', `${lvl.label}: ${currentState ? DAMAGE_TYPES[currentState].label : 'sem dano'}`);
      const cycle = () => {
        const nextState = getNextDamageState(currentState);
        // Som: piorou o ferimento ou sarou a caixa
        if (nextState && nextState !== currentState) { AmbientAudio.hurt(1); FX.markHealth(lvl.key); }
        else if (!nextState && currentState) AmbientAudio.heal();
        char.health[lvl.key] = nextState;
        AppState.saveToStorage();
        this.renderHealthTrack(AppState.activeCharacter);
      };
      box.addEventListener('click', cycle);
      box.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cycle(); } });

      FX.decorateHealth(row, box, lvl.key);
      row.appendChild(nameSpan);
      row.appendChild(penaltySpan);
      row.appendChild(box);
      container.appendChild(row);
    });
    ExtRenderer.renderWoundBadge(char);
    LinkCableSystem.updateDock();
    AggHealing.render(char);
    PortraitState.render(char);
    FX.render(char);
  },

  updateXPCalculation(char) {
    const total = parseInt(char.xp && char.xp.total ? char.xp.total : 0, 10) || 0;
    const spent = parseInt(char.xp && char.xp.spent ? char.xp.spent : 0, 10) || 0;
    const currentDisplay = document.getElementById('xp-current-display');
    if (currentDisplay) {
      const available = total - spent;
      currentDisplay.textContent = available;
      if (available < 0) {
        currentDisplay.style.color = '#ff5555';
        currentDisplay.style.borderColor = '#991111';
      } else {
        currentDisplay.style.color = '#55ff55';
        currentDisplay.style.borderColor = '#1e451e';
      }
    }
    XPManager.renderPanel(char);
  }
};

// =============================================================================
// EVENTOS, ABAS DE PÁGINAS, ROLAGEM (REGRA DO 10 & 1) E EXPORTAÇÃO
// =============================================================================
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[p];
  }
  return curr;
}

function setNestedValue(obj, path, value) {
  if (!obj || !path) return;
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!curr[p] || typeof curr[p] !== 'object') curr[p] = {};
    curr = curr[p];
  }
  curr[parts[parts.length - 1]] = value;
}

const DICE_HISTORY_KEY = 'v20_dice_roll_history';

const DiceHistoryManager = {
  getHistory() {
    if (AppState.activeCharacter && Array.isArray(AppState.activeCharacter.roll_history)) {
      return AppState.activeCharacter.roll_history;
    }
    return [];
  },

  saveHistory(history) {
    const trimmed = history.slice(-60);
    if (AppState.activeCharacter) {
      AppState.activeCharacter.roll_history = trimmed;
      AppState.saveToStorage();
    }
    this.updateBadgeCount();
  },

  addRoll(rollState) {
    const history = this.getHistory();
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const charName = (rollState.char && rollState.char.header && rollState.char.header.name && rollState.char.header.name.trim()) 
      ? rollState.char.header.name.trim() 
      : 'Personagem';

    const entry = {
      id: Date.now().toString(),
      charName: charName,
      time: timeStr,
      traitsSummary: rollState.traitsSummary || 'Parada de Dados',
      difficulty: rollState.difficulty,
      totalPool: rollState.totalPool,
      rolls: [...rollState.rolls],
      successes: rollState.successes,
      tenCount: rollState.tenCount,
      botchCount: rollState.botchCount,
      netSuccesses: rollState.netSuccesses,
      isBotch: rollState.isBotch,
      hasRerolled: rollState.hasRerolled || false,
      rerolledIndices: rollState.rerolledIndices ? [...rollState.rerolledIndices] : [],
      specialty: !!rollState.specialty,
      autoSuccess: !!rollState.autoSuccess,
      guaranteed: rollState.guaranteed || 0,
      notes: Array.isArray(rollState.notes) ? [...rollState.notes] : []
    };

    // Adiciona ao final da lista (mais antigas no topo, mais recentes embaixo)
    history.push(entry);
    this.saveHistory(history);
  },

  updateLastRoll(rollState) {
    const history = this.getHistory();
    if (history.length === 0) return this.addRoll(rollState);

    const lastIdx = history.length - 1;
    history[lastIdx].rolls = [...rollState.rolls];
    history[lastIdx].successes = rollState.successes;
    history[lastIdx].tenCount = rollState.tenCount;
    history[lastIdx].botchCount = rollState.botchCount;
    history[lastIdx].netSuccesses = rollState.netSuccesses;
    history[lastIdx].isBotch = rollState.isBotch;
    history[lastIdx].hasRerolled = !!rollState.hasRerolled;
    history[lastIdx].rerolledIndices = rollState.rerolledIndices ? [...rollState.rerolledIndices] : [];
    history[lastIdx].autoSuccess = !!rollState.autoSuccess;
    history[lastIdx].notes = Array.isArray(rollState.notes) ? [...rollState.notes] : [];

    this.saveHistory(history);
    this.renderHistory();
  },

  clearHistory() {
    if (AppState.activeCharacter) {
      AppState.activeCharacter.roll_history = [];
      AppState.saveToStorage();
    }
    this.updateBadgeCount();
    this.renderHistory();
    showToast('Histórico de rolagens deste personagem limpo!', 'info');
  },

  updateBadgeCount() {
    const totalTag = document.getElementById('history-total-tag');
    const history = this.getHistory();
    document.querySelectorAll('[data-history-count]').forEach(el => { el.textContent = history.length; });
    if (totalTag) totalTag.textContent = `${history.length} rolagem${history.length === 1 ? '' : 'ns'} gravada${history.length === 1 ? '' : 's'}`;
  },

  renderHistory() {
    const listEl = document.getElementById('dice-history-list');
    if (!listEl) return;
    const history = this.getHistory();
    this.updateBadgeCount();

    if (history.length === 0) {
      listEl.innerHTML = `
        <div class="history-empty-state">
          <span class="history-empty-icon">🎲</span>
          <span class="history-empty-text">Nenhuma rolagem registrada ainda.</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">As rolagens feitas aparecerão aqui automaticamente!</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item-card';

      let outcomeText = '';
      let outcomeClass = 'outcome-failure';

      const tensCount = item.specialty === false ? 0 : item.tenCount;
      if (tensCount > 0 && item.netSuccesses > 0) {
        outcomeText = `💎 ${item.netSuccesses} Suc (${item.tenCount}x 10)`;
        outcomeClass = 'outcome-crit';
        card.classList.add('has-crit');
      } else if (item.netSuccesses > 0) {
        outcomeText = `🟢 ${item.netSuccesses} Sucesso${item.netSuccesses > 1 ? 's' : ''}`;
        outcomeClass = 'outcome-success';
        card.classList.add('has-success');
      } else if (item.isBotch) {
        outcomeText = `💥 Falha Crítica (${item.botchCount}x '1')`;
        outcomeClass = 'outcome-botch';
        card.classList.add('has-botch');
      } else {
        outcomeText = '⚪ Falha Simples';
        outcomeClass = 'outcome-failure';
      }

      const rerollBadge = item.hasRerolled ? '<span class="history-extra-tag">Falhas re-roladas</span>' : '';
      const notesHtml = Array.isArray(item.notes) && item.notes.length
        ? `<div class="history-notes-line">${item.notes.map(n => escapeHtml(n)).join(' · ')}</div>`
        : '';

      const diceHtml = item.rolls.map((r, idx) => {
        let cls = 'mini-die';
        if (r === 10 && item.specialty !== false) cls += ' die-ten';
        else if (r >= item.difficulty) cls += ' die-success';
        else if (r === 1) cls += ' die-botch';
        if (item.rerolledIndices && item.rerolledIndices.includes(idx)) {
          cls += ' die-rerolled';
        }
        return `<span class="${cls}" title="${r}${item.rerolledIndices && item.rerolledIndices.includes(idx) ? ' (Rerolado)' : ''}">${r}</span>`;
      }).join('');

      card.innerHTML = `
        <div class="history-card-top">
          <span class="history-char-name">👤 ${escapeHtml(item.charName)}</span>
          <span class="history-timestamp">⏱️ ${item.time}</span>
        </div>
        <div class="history-traits-line">🎲 ${escapeHtml(item.traitsSummary)} ${rerollBadge}</div>
        ${notesHtml}
        <div class="history-meta-line">
          <span class="history-diff-tag">Dif ${item.difficulty} • ${item.totalPool} dados</span>
          <span class="history-outcome-badge ${outcomeClass}">${outcomeText}</span>
        </div>
        <div class="history-dice-row">${diceHtml}</div>
      `;

      listEl.appendChild(card);
    });

    // Auto-scroll para o final (rolagens mais recentes)
    setTimeout(() => {
      listEl.scrollTop = listEl.scrollHeight;
    }, 20);
  }
};

function getNextDamageState(currentState) {
  const currentIndex = DAMAGE_CYCLE.indexOf(currentState);
  if (currentIndex === -1 || currentIndex === DAMAGE_CYCLE.length - 1) return DAMAGE_CYCLE[0];
  return DAMAGE_CYCLE[currentIndex + 1];
}

// =============================================================================
// ROLAGEM V20: dificuldade, especialização (10 = 2), '1' cancela, FV e ferimentos
// =============================================================================
function executeDiceRoll() {
  const char = AppState.activeCharacter;
  const parts = LinkCableSystem.getPoolParts();
  if (!char || parts === null) return;
  const preset = LinkCableSystem.preset;
  // Sucessos automáticos comprados com sangue (Fortitude na absorção, Potência no dano)
  // Potência ativa entra em qualquer rolagem com Força, não só no dano da arma
  const presetAuto = preset && preset.autoSuccesses ? preset.autoSuccesses : 0;
  const potenceAuto = (!preset || preset.kind !== 'damage') ? PhysicalDisciplines.autoFrom(char, parts) : 0;
  const bloodAuto = presetAuto + potenceAuto;
  const bloodUse = preset && preset.blood && preset.blood.amount > 0 ? preset.blood : null;

  const pool = LinkCableSystem.computePool();
  if (RollOptions.applyWounds && pool.wound.incapacitated) {
    showToast('Personagem Incapacitado não pode agir. Cure ferimentos ou desmarque "Ferimentos" se o Narrador permitir.', 'danger');
    return;
  }
  if (pool.total <= 0 && !bloodAuto) {
    const why = pool.penalty > 0 ? ' As penalidades de ferimento zeraram a parada.' : '';
    showToast(`A parada de dados está zerada.${why} Conecte traços ou ajuste o modificador.`, 'danger');
    return;
  }

  if (bloodUse) {
    const check = canSpendBlood(char, bloodUse.amount, { ignoreTurnLimit: !!bloodUse.ignoreTurnLimit });
    if (!check.ok) { showToast(check.reason, 'danger'); return; }
    if (RollOptions.autoSuccess && getWillpowerAvailable(char) < 1) {
      showToast('Sem Força de Vontade para o sucesso automático. Desmarque a opção ou recupere FV.', 'danger');
      return;
    }
  }

  // Feitiço: desconta sangue/FV antes de rolar (já contando a FV do sucesso automático)
  let spellInfo = null;
  if (preset && preset.kind === 'spell') {
    const sp = SpellManager.find(char, preset.meta.spellId);
    if (!sp) {
      showToast('Este feitiço foi removido do grimório. Feche o rolador e escolha outro.', 'danger');
      return;
    }
    const paid = SpellManager.payCost(char, sp, RollOptions.autoSuccess ? 1 : 0);
    if (!paid) return;
    spellInfo = SpellManager.rollInfo(sp, paid);
  }

  // Sucesso automático: exige e consome 1 ponto de FV temporária no momento da rolagem
  let willpowerSpent = 0;
  if (RollOptions.autoSuccess) {
    if (!spendWillpower(char, 'sucesso automático')) {
      RollOptions.autoSuccess = false;
      LinkCableSystem.updateDock();
      return;
    }
    willpowerSpent = 1;
  }

  if (bloodUse) {
    spendBlood(char, bloodUse.amount, { ignoreTurnLimit: !!bloodUse.ignoreTurnLimit });
    AppState.saveToStorage();
    UIRenderer.renderBloodPool(char);
  }

  const difficulty = LinkCableSystem.getDifficulty();
  const rolls = DiceEngine.rollMany(Math.max(0, pool.total));
  const guaranteed = clampInt(RollOptions.guaranteed, 0, 10, 0);
  const outcome = DiceEngine.evaluate(rolls, difficulty, { specialty: RollOptions.specialty, autoSuccess: RollOptions.autoSuccess, guaranteed: guaranteed + bloodAuto });

  const traitsSummary = preset
    ? `${preset.title}${parts.length ? ` (${parts.map(p => p.label).join(' + ')})` : ''}`
    : parts.map(p => p.label).join(' + ');
  const mathStr = parts.map(p => `${p.label} (${p.value})`).join(' + ');

  const notes = [];
  if (pool.modifier) notes.push(`Modificador ${pool.modifier > 0 ? '+' : ''}${pool.modifier}`);
  if (pool.penalty) notes.push(`Ferimento (${pool.wound.label}) −${pool.penalty}`);
  if (RollOptions.specialty) notes.push('10 vale 2 sucessos');
  if (RollOptions.autoSuccess) notes.push('Força de Vontade: +1 sucesso automático');
  if (guaranteed) notes.push(`${guaranteed} sucesso(s) garantido(s)`);
  if (bloodUse) notes.push(`🩸 ${bloodUse.amount} PS em ${bloodUse.label}: ${bloodAuto} sucesso(s) automático(s)`);
  else if (bloodAuto) {
    const disc = potenceAuto ? 'Potência' : 'Fortitude';
    notes.push(`🩸 ${disc} ativa: ${bloodAuto} sucesso(s) automático(s) neste turno`);
  }
  if (spellInfo) notes.push(`Custo do feitiço pago: ${spellInfo.costPaid}`, `Efeito: ${spellInfo.effect}`);

  Object.assign(currentRollState, outcome, {
    char,
    totalPool: pool.total,
    basePool: pool.base,
    modifier: pool.modifier,
    woundPenalty: pool.penalty,
    difficulty,
    rolls,
    traitsSummary: traitsSummary || 'Parada livre',
    mathStr,
    specialty: RollOptions.specialty,
    autoSuccess: RollOptions.autoSuccess,
    guaranteed,
    bloodAuto,
    bloodSpent: bloodUse ? bloodUse.amount : 0,
    bloodLabel: bloodUse ? bloodUse.label : (potenceAuto ? 'Potência' : (presetAuto ? 'Fortitude' : '')),
    willpowerSpent,
    hasRerolled: false,
    rerolledIndices: [],
    lastDiscordMessageId: null,
    damageApp: null,
    extended: null,
    preset: preset ? { ...preset } : null,
    spell: spellInfo,
    rerollCount: 0,
    notes
  });

  // O sucesso automático vale para uma rolagem só
  RollOptions.autoSuccess = false;
  LinkCableSystem.updateDock();

  ExtendedActions.afterRoll(currentRollState);
  renderDiceResultsUI();
  FX.dice(currentRollState);
  DiceHistoryManager.addRoll(currentRollState);
  DiscordIntegration.sendRoll(currentRollState);
  CombatManager.afterRoll(currentRollState.preset, currentRollState);
}

/** Re-rola os dados que não geraram sucesso, gastando 1 ponto de FV (uma vez por rolagem). */
function rerollFailures() {
  const state = currentRollState;
  if (state.hasRerolled) {
    showToast('As falhas desta rolagem já foram re-roladas.', 'info');
    return;
  }

  const failureIndices = [];
  state.rolls.forEach((r, idx) => { if (r < state.difficulty) failureIndices.push(idx); });
  if (failureIndices.length === 0) {
    showToast('Não há dados sem sucesso para re-rolar.', 'info');
    return;
  }

  if (!spendWillpower(AppState.activeCharacter, 're-rolar falhas')) return;

  state.hasRerolled = true;
  state.willpowerSpent = (state.willpowerSpent || 0) + 1;
  state.rerollCount = failureIndices.length;
  state.rerolledIndices = [...failureIndices];
  failureIndices.forEach(idx => { state.rolls[idx] = DiceEngine.rollD10(); });

  Object.assign(state, DiceEngine.evaluate(state.rolls, state.difficulty, { specialty: state.specialty, autoSuccess: state.autoSuccess, guaranteed: (state.guaranteed || 0) + (state.bloodAuto || 0) }));
  state.notes = [...(state.notes || []), `🔥 Rerolado com Força de Vontade: ${failureIndices.length} dado(s) com falha`];
  showToast(`🔥 ${failureIndices.length} falha(s) rerolada(s): ${state.outcomeBadgeText}`, state.netSuccesses > 0 ? 'success' : 'info');
  ExtendedActions.afterReroll(state);

  renderDiceResultsUI();
  DiceHistoryManager.updateLastRoll(state);
  CombatManager.afterReroll(state);
  DiscordIntegration.editLastRoll(state, '🔥 Rerolado com Força de Vontade');
  CombatManager.afterRoll(state.preset, state);
}

function renderDiceResultsUI() {
  const resultsContainer = document.getElementById('dock-dice-results');
  const outcomeBadge = document.getElementById('dice-outcome-badge');
  const summaryText = document.getElementById('dice-summary-text');
  const diceList = document.getElementById('dice-rendered-list');
  const btnReroll = document.getElementById('btn-reroll-failures');
  const rerollBadge = document.getElementById('dice-reroll-badge');
  const spellBadge = document.getElementById('dice-spell-badge');

  if (!resultsContainer || !outcomeBadge || !summaryText || !diceList) return;
  if (rerollBadge) {
    rerollBadge.hidden = !currentRollState.hasRerolled;
    rerollBadge.textContent = `🔥 Rerolado com Força de Vontade (${currentRollState.rerollCount || currentRollState.rerolledIndices.length} dado${(currentRollState.rerollCount || currentRollState.rerolledIndices.length) === 1 ? '' : 's'})`;
  }
  if (spellBadge) {
    const sp = currentRollState.spell;
    spellBadge.hidden = !sp;
    if (sp) spellBadge.textContent = `🔮 ${sp.effect} · pago: ${sp.costPaid}`;
  }
  resultsContainer.classList.toggle('is-rerolled', !!currentRollState.hasRerolled);

  resultsContainer.classList.remove('hidden');
  diceList.innerHTML = '';

  currentRollState.rolls.forEach((r, idx) => {
    const dieEl = document.createElement('div');
    dieEl.className = 'die-box';
    dieEl.textContent = r;

    if (r === 10 && currentRollState.specialty) {
      dieEl.classList.add('die-ten');
      dieEl.title = 'Resultado 10 com especialização (vale 2 sucessos)';
    } else if (r >= currentRollState.difficulty) {
      dieEl.classList.add('die-success');
      dieEl.title = 'Sucesso (>= Dif)';
    } else if (r === 1) {
      dieEl.classList.add('die-botch');
      dieEl.title = 'Resultado 1 (Cancela 1 Sucesso)';
    }

    if (currentRollState.rerolledIndices.includes(idx)) {
      dieEl.classList.add('die-rerolled');
      dieEl.title += ' (Rerolado!)';
    }

    diceList.appendChild(dieEl);
  });

  outcomeBadge.className = 'outcome-badge';
  if (currentRollState.netSuccesses > 0) {
    outcomeBadge.classList.add('outcome-success');
  } else if (currentRollState.netSuccesses === 0) {
    outcomeBadge.classList.add('outcome-failure');
  } else {
    if (currentRollState.isBotch) outcomeBadge.classList.add('outcome-botch');
    else outcomeBadge.classList.add('outcome-failure');
  }
  outcomeBadge.textContent = currentRollState.outcomeBadgeText;

  const st = currentRollState;
  const tenStr = st.specialty && st.tenCount > 0 ? ` · ${st.tenCount}× 10 valendo 2` : '';
  const autoStr = (st.autoSuccess ? ' · +1 automático (FV)' : '') + (st.guaranteed ? ` · +${st.guaranteed} garantido(s)` : '')
    + (st.bloodAuto ? ` · +${st.bloodAuto} automático(s) de ${st.bloodLabel} (sangue)` : '');
  const rerollTag = st.hasRerolled ? ' · falhas re-roladas' : '';
  const extras = [];
  if (st.modifier) extras.push(`mod. ${st.modifier > 0 ? '+' : ''}${st.modifier}`);
  if (st.woundPenalty) extras.push(`ferimento −${st.woundPenalty}`);
  const extrasStr = extras.length ? ` (${extras.join(', ')})` : '';
  summaryText.textContent = `${st.totalPool} d10${extrasStr} contra Dif ${st.difficulty} — ${st.successes} sucesso(s) bruto(s), ${st.botchCount} × '1'${tenStr}${autoStr}${rerollTag}`;

  if (st.bloodAuto) {
    const bDie = document.createElement('div');
    bDie.className = 'die-box die-auto die-blood';
    bDie.textContent = `+${st.bloodAuto}🩸`;
    bDie.title = `${st.bloodAuto} sucesso(s) automático(s) comprados com sangue em ${st.bloodLabel}`;
    diceList.appendChild(bDie);
  }

  if (st.guaranteed) {
    const gDie = document.createElement('div');
    gDie.className = 'die-box die-auto die-guaranteed';
    gDie.textContent = `+${st.guaranteed}`;
    gDie.title = 'Sucessos garantidos (não são cancelados por 1)';
    diceList.appendChild(gDie);
  }

  if (st.autoSuccess) {
    const autoDie = document.createElement('div');
    autoDie.className = 'die-box die-auto';
    autoDie.textContent = '+1';
    autoDie.title = 'Sucesso automático da Força de Vontade (não é cancelado por 1)';
    diceList.appendChild(autoDie);
  }

  const wpAvail = getWillpowerAvailable(AppState.activeCharacter);

  // Botão de re-rolar falhas (custa 1 FV)
  if (btnReroll) {
    const failCount = st.rolls.filter(r => r < st.difficulty).length;
    if (!st.hasRerolled && failCount > 0) {
      btnReroll.classList.remove('hidden');
      btnReroll.disabled = wpAvail <= 0;
      btnReroll.title = wpAvail <= 0
        ? 'Força de Vontade temporária em 0: recupere pontos para rerolar'
        : `Gasta 1 FV (restam ${wpAvail}) e rerola ${failCount} dado${failCount > 1 ? 's' : ''} com falha`;
      btnReroll.innerHTML = `<span class="btn-icon" aria-hidden="true">🔥</span> Gastar 1 FV para Rerolar Falhas <span class="reroll-count">${failCount}</span>`;
    } else if (st.hasRerolled) {
      btnReroll.classList.add('hidden');
    } else {
      btnReroll.classList.add('hidden');
    }
  }

  // Botão de sucesso automático depois da rolagem
  const btnAuto = document.getElementById('btn-wp-auto-after');
  if (btnAuto) {
    btnAuto.classList.toggle('hidden', !!st.autoSuccess);
    btnAuto.disabled = wpAvail <= 0;
    btnAuto.title = wpAvail <= 0 ? 'Sem Força de Vontade temporária' : 'Gasta 1 ponto de Força de Vontade: +1 sucesso que não é cancelado por 1';
  }
}

function setupEventListeners() {
  
  // Modal de Personalização de Tema / Cores
  const themeModal = document.getElementById('theme-customizer-modal');
  const btnOpenThemeModal = document.getElementById('btn-theme-modal');
  const btnCloseThemeModal = document.getElementById('btn-close-theme-modal');
  const btnSaveTheme = document.getElementById('btn-save-theme');
  const btnResetTheme = document.getElementById('btn-reset-theme');

  if (btnOpenThemeModal && themeModal) {
    btnOpenThemeModal.addEventListener('click', () => {
      ThemeManager.updateControlsUI();
      themeModal.classList.remove('hidden');
    });
  }

  if (btnCloseThemeModal && themeModal) {
    btnCloseThemeModal.addEventListener('click', () => {
      themeModal.classList.add('hidden');
    });
  }

  if (themeModal) {
    themeModal.addEventListener('click', (e) => {
      if (e.target === themeModal) themeModal.classList.add('hidden');
    });
  }

  // Presets Rápidos
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      ThemeManager.applyPreset(presetKey);
      showToast(`Preset "${THEME_PRESETS[presetKey]?.name || presetKey}" aplicado!`, 'info');
    });
  });

  // Sliders em Tempo Real
  const themeSliders = [
    'slider-primary-hue', 'slider-primary-sat',
    'slider-secondary-hue', 'slider-secondary-sat',
    'slider-bg-lightness', 'slider-noise-opacity'
  ];

  themeSliders.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        ThemeManager.updateFromSliders();
      });
    }
  });

  if (btnSaveTheme && themeModal) {
    btnSaveTheme.addEventListener('click', () => {
      ThemeManager.save();
      themeModal.classList.add('hidden');
      showToast('Tema e cores salvas com sucesso!', 'success');
    });
  }

  if (btnResetTheme) {
    btnResetTheme.addEventListener('click', () => {
      ThemeManager.reset();
    });
  }

  // Modal de Configuração do Discord Webhook
  const discordModal = document.getElementById('discord-webhook-modal');
  const btnOpenDiscordModal = document.getElementById('btn-discord-modal');
  const btnCloseDiscordModal = document.getElementById('btn-close-discord-modal');
  const btnSaveDiscordWebhook = document.getElementById('btn-save-discord-webhook');
  const btnTestDiscordWebhook = document.getElementById('btn-test-discord-webhook');
  const discordUrlInput = document.getElementById('discord-webhook-url');
  const discordAutoSendToggle = document.getElementById('discord-auto-send-toggle');
  const emoteCriticoInput = document.getElementById('discord-emote-critico');
  const emoteSucessoInput = document.getElementById('discord-emote-sucesso');
  const emoteFalhaInput = document.getElementById('discord-emote-falha');
  const emoteFalhaCriticaInput = document.getElementById('discord-emote-falhacritica');

  if (btnOpenDiscordModal && discordModal) {
    btnOpenDiscordModal.addEventListener('click', () => {
      const activeChar = AppState.activeCharacter;
      const charName = (activeChar && activeChar.header && activeChar.header.name && activeChar.header.name.trim())
        ? activeChar.header.name.trim()
        : 'Personagem Atual';

      const targetLabel = document.getElementById('discord-modal-target-char');
      if (targetLabel) {
        targetLabel.textContent = `Configurando para: 👤 ${charName}`;
      }

      if (discordUrlInput) discordUrlInput.value = DiscordIntegration.getUrl();
      const emotes = DiscordIntegration.getEmotes();
      if (emoteCriticoInput) emoteCriticoInput.value = emotes.critico || '';
      if (emoteSucessoInput) emoteSucessoInput.value = emotes.sucesso || '';
      if (emoteFalhaInput) emoteFalhaInput.value = emotes.falha || '';
      if (emoteFalhaCriticaInput) emoteFalhaCriticaInput.value = emotes.falhacritica || '';
      const faces = (activeChar && activeChar.settings && activeChar.settings.discordFaceEmotes) || {};
      for (let f = 1; f <= 10; f++) {
        const faceInput = document.getElementById(`discord-face-${f}`);
        if (faceInput) faceInput.value = faces[f] || '';
      }
      discordModal.classList.remove('hidden');
    });
  }

  if (btnCloseDiscordModal && discordModal) {
    btnCloseDiscordModal.addEventListener('click', () => {
      discordModal.classList.add('hidden');
    });
  }

  if (discordModal) {
    discordModal.addEventListener('click', (e) => {
      if (e.target === discordModal) discordModal.classList.add('hidden');
    });
  }

  if (btnSaveDiscordWebhook) {
    btnSaveDiscordWebhook.addEventListener('click', () => {
      if (discordUrlInput) DiscordIntegration.setUrl(discordUrlInput.value);
      
      DiscordIntegration.setEmotes({
        critico: emoteCriticoInput ? (emoteCriticoInput.value.trim() || '<:critico:1540580738007695512>') : '<:critico:1540580738007695512>',
        sucesso: emoteSucessoInput ? (emoteSucessoInput.value.trim() || '<:sucesso:1540580820127842344>') : '<:sucesso:1540580820127842344>',
        falha: emoteFalhaInput ? (emoteFalhaInput.value.trim() || '<:falha:1540580800456691773>') : '<:falha:1540580800456691773>',
        falhacritica: emoteFalhaCriticaInput ? (emoteFalhaCriticaInput.value.trim() || '<:falhacritica:1540580772652523600>') : '<:falhacritica:1540580772652523600>'
      });

      const faceMap = {};
      for (let f = 1; f <= 10; f++) {
        const faceInput = document.getElementById(`discord-face-${f}`);
        if (faceInput && faceInput.value.trim()) faceMap[f] = faceInput.value.trim();
      }
      if (AppState.activeCharacter) {
        AppState.activeCharacter.settings.discordFaceEmotes = faceMap;
        AppState.saveToStorage();
      }

      if (discordModal) discordModal.classList.add('hidden');
      showToast('Configurações do Discord salvas para este personagem!', 'success');
    });
  }

  if (btnTestDiscordWebhook) {
    btnTestDiscordWebhook.addEventListener('click', () => {
      if (discordUrlInput) DiscordIntegration.setUrl(discordUrlInput.value);
      DiscordIntegration.sendTestMessage();
    });
  }

  // Drawer de Histórico de Rolagens
  const historyDrawer = document.getElementById('dice-history-drawer');
  const btnOpenHistory = document.getElementById('btn-open-dice-history');
  const btnCloseHistory = document.getElementById('btn-close-dice-history');
  const btnClearHistory = document.getElementById('btn-clear-dice-history');

  if (btnOpenHistory && historyDrawer) {
    btnOpenHistory.addEventListener('click', () => {
      DiceHistoryManager.renderHistory();
      historyDrawer.classList.remove('hidden');
    });
  }

  if (btnCloseHistory && historyDrawer) {
    btnCloseHistory.addEventListener('click', () => {
      historyDrawer.classList.add('hidden');
    });
  }

  if (historyDrawer) {
    historyDrawer.addEventListener('click', (e) => {
      if (e.target === historyDrawer) historyDrawer.classList.add('hidden');
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      GothicDialog.confirm({
        title: 'Limpar histórico de rolagens',
        message: 'Todas as rolagens gravadas deste personagem serão apagadas.',
        confirmLabel: 'Limpar histórico',
        danger: true
      }).then(ok => { if (ok) DiceHistoryManager.clearHistory(); });
    });
  }

  // Drawer de Ajuda & Wiki V20 (Lado Esquerdo)
  const btnOpenWiki = document.getElementById('btn-open-wiki-help');
  const btnCloseWiki = document.getElementById('btn-close-wiki-help');
  const wikiDrawer = document.getElementById('wiki-help-drawer');
  const wikiSearchInput = document.getElementById('wiki-search-input');

  if (btnOpenWiki && wikiDrawer) {
    btnOpenWiki.addEventListener('click', () => {
      wikiDrawer.classList.remove('hidden');
      if (wikiSearchInput) {
        setTimeout(() => wikiSearchInput.focus(), 50);
      }
    });
  }

  if (btnCloseWiki && wikiDrawer) {
    btnCloseWiki.addEventListener('click', () => {
      wikiDrawer.classList.add('hidden');
    });
  }

  if (wikiDrawer) {
    wikiDrawer.addEventListener('click', (e) => {
      if (e.target === wikiDrawer) wikiDrawer.classList.add('hidden');
    });
  }

  if (wikiSearchInput) {
    wikiSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const items = document.querySelectorAll('.wiki-link-card, .wiki-card-info');
      const sections = document.querySelectorAll('.wiki-section');

      items.forEach(item => {
        const text = (item.getAttribute('data-search-text') || '') + ' ' + (item.innerText || '');
        if (!q || text.toLowerCase().includes(q)) {
          item.classList.remove('wiki-item-hidden');
        } else {
          item.classList.add('wiki-item-hidden');
        }
      });

      sections.forEach(sec => {
        const visibleChild = sec.querySelector('.wiki-link-card:not(.wiki-item-hidden), .wiki-card-info:not(.wiki-item-hidden)');
        if (!q || visibleChild) {
          sec.classList.remove('wiki-item-hidden');
        } else {
          sec.classList.add('wiki-item-hidden');
        }
      });
    });
  }

  // Abas de Página
  const tabBtns = document.querySelectorAll('.tab-nav-btn');
  const page1 = document.getElementById('page-1');
  const page2 = document.getElementById('page-2');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === 'page-1') {
        if (page1) page1.classList.remove('hidden-page');
        if (page2) page2.classList.add('hidden-page');
      } else if (targetTab === 'page-2') {
        if (page1) page1.classList.add('hidden-page');
        if (page2) page2.classList.remove('hidden-page');
      } else {
        if (page1) page1.classList.remove('hidden-page');
        if (page2) page2.classList.remove('hidden-page');
      }
      setTimeout(() => {
        LinkCableSystem.updateWebLines();
        // A página que estava escondida só tem altura agora: reencaixa os quadros
        if (typeof CardBalancer !== 'undefined') CardBalancer.schedule();
      }, 60);
    });
  });

  // Botão Resetar Layout das Janelas
  const btnResetLayout = document.getElementById('btn-reset-layout');
  if (btnResetLayout) {
    btnResetLayout.addEventListener('click', () => {
      DraggableWindowManager.resetPositions();
      if (typeof CardBalancer !== 'undefined') CardBalancer.schedule();
    });
  }

  // Foto de Perfil do Personagem (Upload, URL, Remoção)
  const avatarInput = document.getElementById('char-avatar-input');
  const avatarFrame = document.getElementById('char-avatar-frame');
  const btnAvatarUrl = document.getElementById('btn-avatar-url');
  const btnAvatarRemove = document.getElementById('btn-avatar-remove');

  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione um arquivo de imagem válido (PNG, JPG, etc).', 'danger');
        return;
      }

      // Fotos da câmera do iPhone passam de 3 MB: reduz para 512 px antes de salvar
      resizeImageFile(file).then(async (resized) => {
        if (!resized) {
          showToast('Não foi possível ler esta imagem. Tente uma foto em JPG ou PNG.', 'danger');
          return;
        }
        if (AppState.activeCharacter) {
          if (!AppState.activeCharacter.header) AppState.activeCharacter.header = {};
          AppState.activeCharacter.header.avatar = resized.dataUrl;
          AppState.activeCharacter.header.avatarUrl = '';
          AppState.saveToStorage();
          UIRenderer.renderAvatar(AppState.activeCharacter);
          showToast('Foto de perfil atualizada com sucesso!', 'success');

          // Hospeda em segundo plano para o Discord usar como thumbnail sem anexo grande
          const uploadFile = resized.blob
            ? new File([resized.blob], (file.name || 'avatar').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
            : file;
          const hosted = await uploadImageToHost(uploadFile);
          if (hosted && AppState.activeCharacter && AppState.activeCharacter.header) {
            AppState.activeCharacter.header.avatarUrl = hosted;
            AppState.saveToStorage();
          }
        }
      });
      e.target.value = '';
    });
  }

  if (avatarFrame) {
    avatarFrame.addEventListener('click', () => {
      if (avatarInput) avatarInput.click();
    });
  }

  if (btnAvatarUrl) {
    btnAvatarUrl.addEventListener('click', async () => {
      const currentUrl = (AppState.activeCharacter && AppState.activeCharacter.header && AppState.activeCharacter.header.avatar && AppState.activeCharacter.header.avatar.startsWith('http')) ? AppState.activeCharacter.header.avatar : '';
      const inputUrl = await GothicDialog.prompt({
        title: 'Foto por link',
        message: 'Cole o endereço direto da imagem (termina em .png, .jpg ou .webp).',
        value: currentUrl,
        placeholder: 'https://…',
        type: 'url',
        confirmLabel: 'Usar imagem'
      });
      if (inputUrl !== null) {
        if (!AppState.activeCharacter.header) AppState.activeCharacter.header = {};
        AppState.activeCharacter.header.avatar = inputUrl.trim();
        AppState.activeCharacter.header.avatarUrl = inputUrl.trim();
        AppState.saveToStorage();
        UIRenderer.renderAvatar(AppState.activeCharacter);
        showToast('Foto de perfil vinculada via URL!', 'success');
      }
    });
  }

  if (btnAvatarRemove) {
    btnAvatarRemove.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await GothicDialog.confirm({ title: 'Remover foto', message: 'A foto de perfil deste personagem será removida.', confirmLabel: 'Remover', danger: true });
      if (ok) {
        if (AppState.activeCharacter && AppState.activeCharacter.header) {
          AppState.activeCharacter.header.avatar = '';
          AppState.activeCharacter.header.avatarUrl = '';
          AppState.saveToStorage();
          UIRenderer.renderAvatar(AppState.activeCharacter);
          showToast('Foto de perfil removida.', 'info');
        }
      }
    });
  }

  // Inputs
  document.addEventListener('input', (e) => {
    const target = e.target;
    const bindPath = target.getAttribute('data-bind');
    if (bindPath && AppState.activeCharacter) {
      let val = target.value;
      if (target.type === 'number') val = parseInt(val, 10) || 0;
      setNestedValue(AppState.activeCharacter, bindPath, val);
      AppState.saveToStorage();

      if (bindPath === 'header.name' || bindPath === 'header.clan' || bindPath === 'header.generation') {
        UIRenderer.updateDropdown();
        if (bindPath === 'header.generation') {
          syncBloodPoolWithGeneration(AppState.activeCharacter);
          UIRenderer.renderBloodPool(AppState.activeCharacter);
        }
      }

      if (bindPath === 'xp.total' || bindPath === 'xp.spent') {
        UIRenderer.updateXPCalculation(AppState.activeCharacter);
      }
      if (bindPath === 'status.path_name') {
        DerivedStats.renderHint(AppState.activeCharacter);
      }
    }
  });

  document.addEventListener('change', (e) => {
    const target = e.target;
    const bindPath = target.getAttribute('data-bind');
    if (bindPath === 'header.generation' && AppState.activeCharacter) {
      applyGenerationChange(target.value);
    }
  });

  const charSelect = document.getElementById('character-select');
  if (charSelect) {
    charSelect.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      if (AppState.setActive(selectedId)) {
        UIRenderer.renderAll();
        showToast(`Ficha "${AppState.activeCharacter.header.name || 'Personagem'}" carregada!`, 'info');
      }
    });
  }

  const btnNew = document.getElementById('btn-new');
  if (btnNew) {
    // Novo personagem: assistente com as regras de criação do V20 (ou ficha em branco)
    btnNew.addEventListener('click', () => CharacterWizard.open());
  }

  const btnSave = document.getElementById('btn-save');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      AppState.saveToStorage();
      UIRenderer.updateDropdown();
      showToast('Ficha salva no navegador com sucesso!', 'success');
    });
  }

  const btnDuplicate = document.getElementById('btn-duplicate');
  if (btnDuplicate) {
    btnDuplicate.addEventListener('click', () => {
      const cloned = AppState.duplicateActive();
      if (cloned) {
        UIRenderer.renderAll();
        showToast(`Ficha duplicada como "${cloned.header.name}"!`, 'success');
      }
    });
  }

  const btnDelete = document.getElementById('btn-delete');
  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      const name = AppState.activeCharacter.header.name || 'este personagem';
      const ok = await GothicDialog.confirm({
        title: 'Excluir ficha',
        message: `A ficha de “${name}” será apagada deste navegador. Exporte em JSON antes se quiser guardar uma cópia.`,
        confirmLabel: 'Excluir ficha',
        danger: true
      });
      if (ok) {
        AppState.deleteActive();
        UIRenderer.renderAll();
        showToast('Ficha excluída com sucesso.', 'danger');
      }
    });
  }

  // Botões Adicionar Traços
  const btnAddDisc = document.getElementById('btn-add-discipline');
  if (btnAddDisc) {
    btnAddDisc.addEventListener('click', () => {
      if (!AppState.activeCharacter.disciplines) AppState.activeCharacter.disciplines = [];
      AppState.activeCharacter.disciplines.push({ id: generateUniqueId(), name: '', level: XPManager.enabled() ? 0 : 1 });
      AppState.saveToStorage();
      UIRenderer.renderDynamicDisciplines(AppState.activeCharacter);
    });
  }

  const btnAddSpec = document.getElementById('btn-add-specialization');
  if (btnAddSpec) {
    btnAddSpec.addEventListener('click', () => {
      const char = AppState.activeCharacter;
      if (!char.specializations) char.specializations = [];
      const spec = { id: generateUniqueId(), name: '', level: 1 };
      if (XPManager.enabled(char) && !XPManager.chargeItem(char, { ref: `spec:${spec.id}`, type: 'specialty', label: 'Nova especialização', amount: 3, rule: '3 (fixo)' })) return;
      char.specializations.push(spec);
      AppState.saveToStorage();
      UIRenderer.renderDynamicSpecializations(AppState.activeCharacter);
    });
  }

  const btnAddBg = document.getElementById('btn-add-background');
  if (btnAddBg) {
    btnAddBg.addEventListener('click', () => {
      if (!AppState.activeCharacter.backgrounds) AppState.activeCharacter.backgrounds = [];
      AppState.activeCharacter.backgrounds.push({ id: generateUniqueId(), name: '', level: XPManager.enabled() && XPManager.state(AppState.activeCharacter).backgroundRule ? 0 : 1 });
      AppState.saveToStorage();
      UIRenderer.renderDynamicBackgrounds(AppState.activeCharacter);
    });
  }

  const btnAddPath = document.getElementById('btn-add-path');
  if (btnAddPath) {
    btnAddPath.addEventListener('click', () => {
      if (!AppState.activeCharacter.paths) AppState.activeCharacter.paths = [];
      AppState.activeCharacter.paths.push({ id: generateUniqueId(), name: '', level: XPManager.enabled() ? 0 : 1, xpPrimary: AppState.activeCharacter.paths.length === 0 });
      AppState.saveToStorage();
      UIRenderer.renderDynamicPaths(AppState.activeCharacter);
    });
  }

  const btnAddRitual = document.getElementById('btn-add-ritual');
  if (btnAddRitual) {
    btnAddRitual.addEventListener('click', () => SpellManager.add());
  }

  // Sangue & Vitalidade
  const btnBloodFill = document.getElementById('btn-blood-fill-all');
  if (btnBloodFill) {
    btnBloodFill.addEventListener('click', () => {
      const total = AppState.activeCharacter.status.blood_pool.length;
      AppState.activeCharacter.status.blood_pool = Array(total).fill(true);
      AppState.saveToStorage();
      UIRenderer.renderBloodPool(AppState.activeCharacter);
      showToast(`Reserva de Sangue preenchida (${total}/${total})!`, 'success');
    });
  }

  const btnBloodClear = document.getElementById('btn-blood-clear-all');
  if (btnBloodClear) {
    btnBloodClear.addEventListener('click', () => {
      const total = AppState.activeCharacter.status.blood_pool.length;
      AppState.activeCharacter.status.blood_pool = Array(total).fill(false);
      AppState.saveToStorage();
      UIRenderer.renderBloodPool(AppState.activeCharacter);
      showToast('Reserva de Sangue esvaziada (0).', 'info');
    });
  }

  const btnHealthClear = document.getElementById('btn-health-clear-all');
  if (btnHealthClear) {
    btnHealthClear.addEventListener('click', () => {
      AppState.activeCharacter.health = { bruised: '', hurt: '', injured: '', wounded: '', mauled: '', crippled: '', incapacitated: '' };
      AppState.saveToStorage();
      UIRenderer.renderHealthTrack(AppState.activeCharacter);
      showToast('Todos os ferimentos foram curados!', 'success');
    });
  }

  const btnClearLinks = document.getElementById('btn-clear-links');
  if (btnClearLinks) btnClearLinks.addEventListener('click', () => LinkCableSystem.clear());

  const btnCopyCmd = document.getElementById('btn-copy-command');
  if (btnCopyCmd) {
    btnCopyCmd.addEventListener('click', () => {
      const input = document.getElementById('dock-command-input');
      if (input && input.value) copyTextToClipboard(input.value, 'Comando copiado!');
    });
  }

  const btnRollDice = document.getElementById('btn-roll-dice');
  if (btnRollDice) btnRollDice.addEventListener('click', executeDiceRoll);

  const btnRerollFailures = document.getElementById('btn-reroll-failures');
  if (btnRerollFailures) btnRerollFailures.addEventListener('click', rerollFailures);

  const btnExport = document.getElementById('btn-export-json');
  if (btnExport) btnExport.addEventListener('click', exportCharacterToJson);

  const importInput = document.getElementById('import-json-input');
  if (importInput) importInput.addEventListener('change', handleJsonImport);


  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      AppState.saveToStorage();
      UIRenderer.updateDropdown();
      showToast('Ficha salva! (Ctrl+S)', 'success');
    } else if (e.key === 'Escape') {
      const wikiDrawer = document.getElementById('wiki-help-drawer');
      const historyDrawer = document.getElementById('dice-history-drawer');
      const themeModal = document.getElementById('theme-customizer-modal');
      const discordModal = document.getElementById('discord-webhook-modal');
      if (wikiDrawer) wikiDrawer.classList.add('hidden');
      if (historyDrawer) historyDrawer.classList.add('hidden');
      if (themeModal) themeModal.classList.add('hidden');
      if (discordModal) discordModal.classList.add('hidden');
    }
  });

  window.addEventListener('scroll', () => LinkCableSystem.updateWebLines(), { passive: true });
  window.addEventListener('resize', () => LinkCableSystem.updateWebLines());
}

function exportCharacterToJson() {
  const char = AppState.activeCharacter;
  if (!char) return;

  const rawName = (char.header && char.header.name && char.header.name.trim()) ? char.header.name.trim() : 'Personagem';
  const cleanName = rawName.replace(/[^a-zA-Z0-9_\u00C0-\u00FF-]/g, '_');
  const filename = `${cleanName}_V20.json`;

  const jsonString = JSON.stringify(char, null, 2);
  saveTextFile(filename, jsonString, 'application/json').then(result => {
    if (result === 'shared') showToast(`“${filename}” pronto. Use “Salvar em Arquivos” para guardar o backup.`, 'success');
    else if (result === 'downloaded') showToast(`Arquivo "${filename}" exportado com sucesso!`, 'success');
  });
}

function handleJsonImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsedData = JSON.parse(e.target.result);
      // Backup com várias fichas
      if (BackupManager.isBackup(parsedData)) {
        const count = BackupManager.importAll(parsedData);
        showToast(`Backup importado: ${count} ficha(s) adicionada(s).`, 'success');
        return;
      }
      if (!parsedData || typeof parsedData !== 'object' || !parsedData.header) {
        throw new Error('Arquivo JSON inválido para a ficha V20.');
      }

      parsedData.id = generateUniqueId();
      normalizeCharacter(parsedData);
      regenerateListIds(parsedData);
      
      syncBloodPoolWithGeneration(parsedData);

      AppState.addCharacter(parsedData);
      UIRenderer.renderAll();
      showToast(`Ficha "${parsedData.header.name || 'Importada'}" importada com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao importar JSON:', err);
      showToast('Erro ao importar JSON: arquivo corrompido ou incompatível.', 'danger');
    } finally {
      event.target.value = '';
    }
  };

  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  AppState.init();
  UIRenderer.renderAll();
  DraggableWindowManager.init();
  setupEventListeners();
  ExtEvents.init();
  DiceHistoryManager.updateBadgeCount();
  UndoManager.ensureBaseline();
  CommandRoller.handleUrl();
  // Primeiro acesso: abre o assistente de criação (fechando, fica a ficha em branco)
  if (AppState.isFirstRun) setTimeout(() => CharacterWizard.open({ firstRun: true }), 500);
  console.log('Ficha V20 pronta: regras automáticas, rolador com FV, arsenal, desfazer/refazer e compêndio.');
});
