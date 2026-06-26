// ══════════════════════════════════════════════════
// JBRETAS AppPainel — app.js consolidado
// v4 (segurança):
// • carregarDadosSensiveis() — busca CUSTO_POSTOS, MARGEM_MINIMA
//   e DISTRIBUIDORAS_DADOS do backend após login (não ficam mais no código)
// • fallback() — calcula preços a partir de CUSTO_POSTOS + MARGEM_MINIMA
// • renderDist() — renderiza a partir de DISTRIBUIDORAS_DADOS (backend)
// • Aba "Coleta" removida do módulo Logística (ficou só "Medição")
//   A coleta de preços existe como módulo separado em Mais+ > Coleta
// ══════════════════════════════════════════════════

// Variáveis Globais de Estado do Aplicativo
let G_DADOS = null;
let G_USER = null;
let G_FILTRO_SUP = 'todos';
let G_MAPA_SUP = 'todos';
let G_MAPA_FUEL = 'GC';
let G_MAPA_COLETA = 'todos'; // 'todos' | 'coletados' | 'semcoleta'

function mapaSetColeta(btn, val) {
  document.querySelectorAll('[id^="mfiltro-"]').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  G_MAPA_COLETA = val;
  renderMapa();
}
let leafletMap = null;
let mapMarkers = [];
let markerCluster = null;

const INTERVALO_ATUALIZACAO = 5 * 60 * 1000;
let _autoRefreshTimer = null;

function iniciarAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(() => {
    if (!document.hidden && localStorage.getItem('jb_adm_user')) {
      carregarDados();
    }
  }, INTERVALO_ATUALIZACAO);
}

// ════════════════════════════════════════════════════════════
// TEMA CLARO/ESCURO
// ════════════════════════════════════════════════════════════
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = tema === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  localStorage.setItem('jb_theme', tema);
}

function toggleTheme() {
  const atual = document.documentElement.getAttribute('data-theme') || 'dark';
  aplicarTema(atual === 'dark' ? 'light' : 'dark');
}

(function() {
  const temaSalvo = localStorage.getItem('jb_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', temaSalvo);
})();

window.addEventListener('DOMContentLoaded', () => {
  const temaSalvo = localStorage.getItem('jb_theme') || 'dark';
  aplicarTema(temaSalvo);

  const salvo = localStorage.getItem('jb_adm_user');
  if (salvo) {
    G_USER = JSON.parse(salvo);
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    // PATCH v4: carrega dados sensíveis antes de carregar os dados do painel
    carregarDadosSensiveis().then(() => {
      carregarDados();
      iniciarAutoRefresh();
    });
  } else {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('screen-login').classList.remove('hidden');
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && localStorage.getItem('jb_adm_user')) {
    carregarDados();
  }
});

function toggleSenha() {
  const inp = document.getElementById('inp-senha');
  const icone = document.getElementById('olho-icone');
  if (inp.type === 'password') {
    inp.type = 'text';
    icone.className = 'fa-solid fa-eye-slash';
  } else {
    inp.type = 'password';
    icone.className = 'fa-solid fa-eye';
  }
}

async function entrar() {
  const email  = document.getElementById('inp-email').value.trim();
  const senha  = document.getElementById('inp-senha').value.trim();
  const errDiv = document.getElementById('login-erro');
  const btn    = document.getElementById('btn-entrar');
  errDiv.classList.add('hidden');
  btn.disabled  = true;
  btn.textContent = 'Verificando...';
  try {
    const res  = await fetch(API_URL + '?tipo=login&email=' + encodeURIComponent(email) + '&senha=' + encodeURIComponent(senha));
    const json = await res.json();
    if (json && json.usuario && (json.usuario.postoKey === 'ADM' || json.usuario.postoKey === 'LOGISTICA')) {
      G_USER = { email: json.usuario.email, gerente: json.usuario.gerente, postoKey: json.usuario.postoKey };
      localStorage.setItem('jb_adm_user', JSON.stringify(G_USER));
      document.getElementById('screen-login').classList.add('hidden');
      document.getElementById('screen-app').classList.remove('hidden');
      // PATCH v4: busca custos/margens/distribuidoras antes de carregar o painel
      await carregarDadosSensiveis();
      carregarDados();
      iniciarAutoRefresh();
    } else if (json && json.usuario) {
      // Credencial válida mas não é ADM/LOGISTICA
      errDiv.textContent = 'Acesso restrito — somente ADM e Logística.';
      errDiv.classList.remove('hidden');
    } else {
      errDiv.textContent = json.erro || 'Credenciais administrativas inválidas.';
      errDiv.classList.remove('hidden');
    }
  } catch (e) {
    errDiv.textContent = 'Erro de conexão. Tente novamente.';
    errDiv.classList.remove('hidden');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'ENTRAR';
  }
}

function sair() {
  localStorage.removeItem('jb_adm_user');
  G_USER = null;
  document.getElementById('screen-app').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
}

// ════════════════════════════════════════════════════════════
// PATCH v4 — DADOS SENSÍVEIS (custos, margens, distribuidoras)
// Carregados do backend após login — não ficam mais expostos no código
// ════════════════════════════════════════════════════════════
async function carregarDadosSensiveis() {
  try {
    const res  = await fetch(API_URL + '?tipo=dadosSensiveis');
    const json = await res.json();
    if (json && json.success) {
      if (json.custos)         CUSTO_POSTOS        = json.custos;
      if (json.margens)        MARGEM_MINIMA       = json.margens;
      if (json.distribuidoras) DISTRIBUIDORAS_DADOS = json.distribuidoras;
    }
  } catch (e) {
    console.warn('Dados sensíveis não carregados:', e);
  }
}

// ════════════════════════════════════════════════════════════
// REQUISIÇÕES E SINCRONIZAÇÃO
// ════════════════════════════════════════════════════════════
async function carregarDados() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('upd-txt').textContent = 'Buscando do banco real...';
  try {
    const res = await fetch(API_URL + '?tipo=precos');
    const json = await res.json();
    if (json && json.success && json.data) {
      G_DADOS = json.data;
      processarDadosReais();
      carregarComparacaoOntem().then(renderComparar);
      showToast('Dados Atualizados', 'Informações coletadas em tempo real com sucesso.');
    } else {
      fallback('Erro na estrutura retornada do Apps Script.');
    }
  } catch (e) {
    console.error(e);
    fallback('Erro de conexão. Usando dados locais offline temporários.');
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

// PATCH v4: fallback calcula preços a partir de CUSTO_POSTOS + MARGEM_MINIMA
// em vez de valores hardcoded
function fallback(msg) {
  showToast('Modo de Segurança', msg);
  G_DADOS = { prop: {}, conc: {} };
  const agora = new Date().toISOString();
  const custoBase = (CUSTO_POSTOS && CUSTO_POSTOS['DEFAULT']) || {};
  for (let p in POSTOS_DADOS) {
    G_DADOS.prop[p] = {
      GC:  (custoBase.GC  || 0) + (MARGEM_MINIMA.GC  || 0),
      GA:  (custoBase.GA  || 0) + (MARGEM_MINIMA.GA  || 0),
      ET:  (custoBase.ET  || 0) + (MARGEM_MINIMA.ET  || 0),
      S10: (custoBase.S10 || 0) + (MARGEM_MINIMA.S10 || 0),
      data: agora, responsavel: 'Sistema Local'
    };
    G_DADOS.conc[p] = {};
    for (let c in POSTOS_DADOS[p].conc) {
      const gcBase = (custoBase.GC || 0) + (MARGEM_MINIMA.GC || 0);
      G_DADOS.conc[p][c] = {
        GC: gcBase - 0.10 + Math.random() * 0.3,
        GA: (custoBase.GA || 0) + (MARGEM_MINIMA.GA || 0) - 0.10 + Math.random() * 0.3,
        ET: (custoBase.ET || 0) + (MARGEM_MINIMA.ET || 0) - 0.10 + Math.random() * 0.3,
        S10: (custoBase.S10 || 0) + (MARGEM_MINIMA.S10 || 0) - 0.10 + Math.random() * 0.3,
        data: agora
      };
    }
  }
  processarDadosReais();
}

// ════════════════════════════════════════════════════════════
// MÉDIA HIERÁRQUICA
// ════════════════════════════════════════════════════════════
function calcularMediaHierarquica(concPlano) {
  const porPosto = {};
  for (let nome in concPlano) {
    const item = concPlano[nome];
    if (!item || !item.GC) continue;
    const bloco = item.bloco || 'SEM_BLOCO';
    if (!porPosto[bloco]) porPosto[bloco] = { valores: [], sup: item.supervisor || '', nomes: [] };
    porPosto[bloco].valores.push(parseFloat(item.GC));
    porPosto[bloco].nomes.push(nome);
  }
  const mediaPorPosto = {};
  for (let bloco in porPosto) {
    const arr = porPosto[bloco].valores;
    const media = arr.reduce((s, v) => s + v, 0) / arr.length;
    mediaPorPosto[bloco] = { media, sup: porPosto[bloco].sup, qtd: arr.length, nomes: porPosto[bloco].nomes };
  }
  const porSupervisor = {};
  for (let bloco in mediaPorPosto) {
    const { media, sup } = mediaPorPosto[bloco];
    if (!sup) continue;
    if (!porSupervisor[sup]) porSupervisor[sup] = [];
    porSupervisor[sup].push({ bloco, media });
  }
  const mediaPorSupervisor = {};
  for (let sup in porSupervisor) {
    const arr = porSupervisor[sup];
    const media = arr.reduce((s, x) => s + x.media, 0) / arr.length;
    mediaPorSupervisor[sup] = { media, postos: arr };
  }
  const supKeys = Object.keys(mediaPorSupervisor);
  if (supKeys.length === 0) { G_MEDIA_DETALHE = null; return null; }
  const mediaGeral = supKeys.reduce((s, k) => s + mediaPorSupervisor[k].media, 0) / supKeys.length;
  G_MEDIA_DETALHE = { mediaPorPosto, mediaPorSupervisor, mediaGeral };
  return mediaGeral;
}

let G_MEDIA_DETALHE = null;

function abrirDetalheMedia() {
  document.getElementById('modal-media').classList.add('open');
  renderDetalheMedia();
}
function fecharMedia(e) { if (e.target.id === 'modal-media') fecharMediaBtn(); }
function fecharMediaBtn() { document.getElementById('modal-media').classList.remove('open'); }

function renderDetalheMedia() {
  const body = document.getElementById('media-detalhe-body');
  if (!G_MEDIA_DETALHE) { body.innerHTML = '<div class="empty">Sem dados de concorrentes coletados hoje.</div>'; return; }
  const { mediaPorSupervisor, mediaGeral } = G_MEDIA_DETALHE;
  const SUPCOR = { Mauricio: '#00e5a0', Paulo: '#4895ef', Fabricio: '#f9c74f', Gledson: '#c77dff', Rodrigo: '#ff6b6b' };
  let html = `<div class="ccard" style="margin-bottom:.6rem;text-align:center">
    <div class="cclbl">MÉDIA GERAL DA REDE (Nível 3)</div>
    <div style="font-family:var(--mono);font-size:1.4rem;font-weight:700;color:var(--inf)">R$ ${mediaGeral.toFixed(3).replace('.', ',')}</div>
    <div style="font-size:.62rem;color:var(--tx3)">Média das ${Object.keys(mediaPorSupervisor).length} médias regionais abaixo</div>
  </div>`;
  for (let sup in mediaPorSupervisor) {
    const { media, postos } = mediaPorSupervisor[sup];
    const cor = SUPCOR[sup] || '#8892a4';
    html += `<div class="reg-sup" style="margin-bottom:.5rem">
      <div class="reg-sup-hdr">
        <div class="reg-sup-nome" style="color:${cor}">${sup} <span style="font-size:.6rem;color:var(--tx3);font-weight:400">(Nível 2)</span></div>
        <div style="font-family:var(--mono);font-weight:700;color:${cor}">R$ ${media.toFixed(3).replace('.', ',')}</div>
      </div><div class="reg-posto-list">`;
    postos.forEach(p => {
      html += `<div class="reg-posto"><span>P. ${p.bloco}</span><span style="font-family:var(--mono)">R$ ${p.media.toFixed(3).replace('.', ',')}</span></div>`;
    });
    html += `</div></div>`;
  }
  body.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// LOOKUP / NORMALIZAÇÃO DE POSTOS
// ════════════════════════════════════════════════════════════
const ALIASES_POSTO = {
  // planilha grava abreviado → chave real em POSTOS_DADOS
  'LOURA':                    'LOURA EMPREENDIMENTOS',
  'P. LOURA':                 'LOURA EMPREENDIMENTOS',
  'MIRAGEM':                  'MIRAGEM JBRETAS',
  'P. MIRAGEM':               'MIRAGEM JBRETAS',
  'BEATRIZ':                  'PAIVA E PAIVA COMBUSTIVEL',
  'P. BEATRIZ':               'PAIVA E PAIVA COMBUSTIVEL',
  'PAIVA E PAIVA':            'PAIVA E PAIVA COMBUSTIVEL',
  'BARBOSA - DUDU':           'BARBOSA - DUDU',
  'SANTA INES - JOAQUIM':     'SANTA INES - JOAQUIM',
};

function normalizarTexto(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function corrigirCoordenada(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return NaN;
  if (Math.abs(n) > 180) return n / 1000000;
  return n;
}

function encontrarPostoCanonico(nomeOriginal) {
  const semP = String(nomeOriginal).replace(/^P\.\s*/i, '').trim();
  const semPNorm = normalizarTexto(semP);
  const candidatos = Object.keys(POSTOS_DADOS);
  if (ALIASES_POSTO[semPNorm] && POSTOS_DADOS[ALIASES_POSTO[semPNorm]]) return ALIASES_POSTO[semPNorm];
  let found = candidatos.find(p => p.toUpperCase() === semP.toUpperCase());
  if (found) return found;
  found = candidatos.find(p => normalizarTexto(p) === semPNorm);
  if (found) return found;
  const prefixados = candidatos.filter(p => {
    const pn = normalizarTexto(p);
    return pn.startsWith(semPNorm) || semPNorm.startsWith(pn);
  });
  if (prefixados.length === 1) return prefixados[0];
  return null;
}

function processarDadosReais() {
  const propPlano = G_DADOS.prop || {};
  const propMapeado = {};
  for (let k in propPlano) {
    propMapeado[k] = propPlano[k];
    const found = encontrarPostoCanonico(k);
    if (found && found !== k) propMapeado[found] = propPlano[k];
  }
  G_DADOS.prop = propMapeado;

  const concPlano = G_DADOS.conc || {};
  const concPorBloco = {};
  const concPorPosto = {};
  for (let nomeConcorrente in concPlano) {
    const d = concPlano[nomeConcorrente];
    const bloco = d.bloco || '';
    if (!concPorBloco[bloco]) concPorBloco[bloco] = {};
    concPorBloco[bloco][nomeConcorrente] = d;
    for (let posto in POSTOS_DADOS) {
      const pd = POSTOS_DADOS[posto];
      if (pd.conc && pd.conc[nomeConcorrente]) {
        if (!concPorPosto[posto]) concPorPosto[posto] = {};
        concPorPosto[posto][nomeConcorrente] = d;
      }
    }
  }
  G_DADOS.concPlano = concPlano;
  G_DADOS.concPorBloco = concPorBloco;
  G_DADOS.concPorPosto = concPorPosto;

  const totalPostosRede = Object.keys(POSTOS_DADOS).length;
  document.getElementById('kv-proprios').textContent = Object.keys(propPlano).length;
  const subEl = document.getElementById('kv-proprios-sub');
  if (subEl) {
    const faltam = totalPostosRede - Object.keys(propPlano).length;
    subEl.textContent = faltam > 0 ? `de ${totalPostosRede} · faltam ${faltam}` : `de ${totalPostosRede} · completo ✓`;
  }
  document.getElementById('kv-concs').textContent = Object.keys(concPlano).length;

  const mediaGcConcorrentes = calcularMediaHierarquica(concPlano);
  document.getElementById('kv-gc').textContent = mediaGcConcorrentes !== null ? 'R$ ' + mediaGcConcorrentes.toFixed(2) : '--';

  let somaGcProp = 0, cGcProp = 0;
  for (let k in propPlano) {
    if (propPlano[k].GC) { somaGcProp += parseFloat(propPlano[k].GC); cGcProp++; }
  }
  document.getElementById('kv-mgc').textContent = cGcProp > 0 ? 'R$ ' + (somaGcProp / cGcProp).toFixed(2) : '--';

  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('upd-txt').textContent = `Atualizado às ${hh}:${mm} · próxima em 5min`;
  document.getElementById('live-txt').textContent = 'ao vivo';

  povoarSelects();
  renderComparar();
  renderHeatmap();
  renderRanking();
  renderRegional();
  renderMapa();
}

function povoarSelects() {
  const lista = Object.keys(POSTOS_DADOS).sort();
  const selPosto = document.getElementById('cmp-posto');
  if (selPosto) {
    const valSalvo = selPosto.value;
    selPosto.innerHTML = '<option value="">Todos os postos</option>' + lista.map(p => `<option value="${p}">P. ${p}</option>`).join('');
    if (valSalvo && lista.includes(valSalvo)) selPosto.value = valSalvo;
  }
  const selSup = document.getElementById('cmp-sup');
  if (selSup) {
    const valSalvo = selSup.value;
    const sups = [...new Set(lista.map(p => POSTOS_DADOS[p].sup).filter(Boolean))].sort();
    selSup.innerHTML = '<option value="">Todos supervisores</option>' + sups.map(s => `<option value="${s}">${s}</option>`).join('');
    if (valSalvo && sups.includes(valSalvo)) selSup.value = valSalvo;
  }
  const selBand = document.getElementById('cmp-band');
  if (selBand) {
    const valSalvo = selBand.value;
    const bands = [...new Set(lista.map(p => POSTOS_DADOS[p].bandeira).filter(Boolean))].sort();
    selBand.innerHTML = '<option value="">Todas bandeiras</option>' + bands.map(b => `<option value="${b}">${b}</option>`).join('');
    if (valSalvo && bands.includes(valSalvo)) selBand.value = valSalvo;
  }
}

// ════════════════════════════════════════════════════════════
// TABS E MODAIS
// ════════════════════════════════════════════════════════════
function setTab(btn, tab) {
  document.querySelectorAll('.nbtn').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.scr').forEach(x => {
    x.classList.remove('active');
    if (x.id === 's-logistica') x.style.display = 'none';
  });
  btn.classList.add('active');
  const sec = document.getElementById('s-' + tab);
  if (sec) sec.classList.add('active');
  if (tab === 'mapa') setTimeout(() => { initLeafletInstance(); }, 150);
  if (tab === 'hist') { povoarHistPosto(); }
}

function abrirMais() { document.getElementById('modal-mais').classList.add('open'); }
function fecharMais(e) { if (e.target.id === 'modal-mais') fecharMaisBtn(); }
function fecharMaisBtn() { document.getElementById('modal-mais').classList.remove('open'); }

function irPara(modulo) {
  fecharMaisBtn();
  if (modulo === 'logistica') {
    document.querySelectorAll('.nbtn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.scr').forEach(x => {
      x.classList.remove('active');
      if (x.id === 's-logistica') x.style.display = 'none';
    });
    const sec = document.getElementById('s-logistica');
    if (sec) { sec.classList.add('active'); sec.style.display = 'flex'; }
    logPopularSelects();
    logSwitchSub('medicao');
    // Re-aplica sticky da linha 2 agora que a seção está visível
    requestAnimationFrame(() => {
      const thead = document.getElementById('log-matrix-thead');
      if (!thead) return;
      const tr1 = thead.querySelector('tr:first-child');
      if (!tr1) return;
      const h = tr1.offsetHeight || 36;
      const topVal = Math.ceil(h) + 'px';
      thead.querySelectorAll('tr:last-child th').forEach(th => { th.style.top = topVal; });
      document.documentElement.style.setProperty('--log-thead-h', topVal);
    });
    return;
  }
  document.querySelectorAll('.nbtn').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.scr').forEach(x => {
    x.classList.remove('active');
    if (x.id === 's-logistica') x.style.display = 'none';
  });
  document.getElementById('s-mais').classList.add('active');
  const ctx = document.getElementById('mais-conteudo');
  if      (modulo === 'amostra')        renderAmostra(ctx);
  else if (modulo === 'notif')          renderNotif(ctx);
  else if (modulo === 'distribuidor')   renderDist(ctx);
  else if (modulo === 'simulador')      renderSim(ctx);
  else if (modulo === 'lancamento')     renderLanc(ctx);
  else if (modulo === 'coleta-simples') renderColetaSimples(ctx);
  else if (modulo === 'relatorios')     renderRel(ctx);
}

// ════════════════════════════════════════════════════════════
// COMPARAR — Monitor de Preços
// ════════════════════════════════════════════════════════════
const CMP_FUELS = [
  { key: 'ET',   label: 'Etanol' },
  { key: 'GC',   label: 'Comum' },
  { key: 'GA',   label: 'Aditiv.' },
  { key: 'S10',  label: 'Diesel S10' },
  { key: 'S500', label: 'Diesel S500' },
];
const CMP_STRATS = [
  { key: 'agg',  label: 'Agressivo', desc: '1 centavo abaixo do concorrente mais barato — ganha volume.' },
  { key: 'avg',  label: 'Na média',  desc: 'Média dos concorrentes coletados — equilíbrio.' },
  { key: 'prem', label: 'Premium',   desc: '1 centavo acima do mais caro — protege margem.' },
];
let G_CMP_FUEL      = 'GC';
let G_CMP_STRAT     = 'avg';
let G_CMP_SUP       = '';
let G_CMP_BAND      = '';
let G_CMP_POSTO     = '';
let G_CMP_SO_MUDOU  = false;
let G_CMP_FAIXA_PRECO = 'todos'; // 'todos' | 'abaixo' | 'acima'
let G_ONTEM_MAP     = {};

function montarFuelTabsComparar() {
  const wrap = document.getElementById('cmp-fuel-tabs');
  if (!wrap) return;
  wrap.innerHTML = CMP_FUELS.map(f =>
    `<button class="fueltab${f.key === G_CMP_FUEL ? ' active' : ''}" onclick="cmpSetFuel('${f.key}')">${f.label}</button>`
  ).join('');
}

function montarStratTabsComparar() {
  const wrap = document.getElementById('cmp-strat-tabs');
  if (!wrap) return;
  wrap.innerHTML = CMP_STRATS.map(s =>
    `<button class="strat-tab${s.key === G_CMP_STRAT ? ' active' : ''}" onclick="cmpSetStrat('${s.key}')">${s.label}</button>`
  ).join('');
  const atual = CMP_STRATS.find(s => s.key === G_CMP_STRAT);
  const descEl = document.getElementById('cmp-strat-desc');
  if (descEl) descEl.textContent = atual ? atual.desc : '';
}

function cmpSetFuel(key)  { G_CMP_FUEL  = key; renderComparar(); }
function cmpSetStrat(key) { G_CMP_STRAT = key; renderComparar(); }
function cmpSetSup(val)   { G_CMP_SUP   = val; renderComparar(); }
function cmpSetBand(val)  { G_CMP_BAND  = val; renderComparar(); }
function cmpSetPosto(val) { G_CMP_POSTO = val; renderComparar(); }
function cmpToggleSoMudou(chk) { G_CMP_SO_MUDOU = chk.checked; renderComparar(); }

function cmpSetFaixaPreco(btn, faixa) {
  G_CMP_FAIXA_PRECO = faixa;
  ['flt-abaixo', 'flt-acima', 'flt-todos-preco'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); el.style.display = id === 'flt-todos-preco' ? 'none' : ''; }
  });
  if (faixa !== 'todos') {
    btn.classList.add('active');
    const limpar = document.getElementById('flt-todos-preco');
    if (limpar) limpar.style.display = '';
  }
  renderComparar();
}

function formatarDataBR(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

async function carregarComparacaoOntem() {
  try {
    const res = await fetch(API_URL + '?tipo=historico&dias=3');
    const json = await res.json();
    if (!json || !Array.isArray(json.historico)) { G_ONTEM_MAP = {}; return; }
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemStr = formatarDataBR(ontem);
    const mapa = {};
    CMP_FUELS.forEach(f => mapa[f.key] = {});
    json.historico.forEach(r => {
      if (r.data !== ontemStr) return;
      if (r.tipo === 'Próprio') return;
      CMP_FUELS.forEach(f => { if (r[f.key]) mapa[f.key][r.postoAlvo] = parseFloat(r[f.key]); });
    });
    G_ONTEM_MAP = mapa;
  } catch (e) {
    console.warn('Comparação com ontem indisponível:', e);
    G_ONTEM_MAP = {};
  }
}

function cmpCalcularSugerido(min, avg, max) {
  if (G_CMP_STRAT === 'agg')  return min - 0.01;
  if (G_CMP_STRAT === 'prem') return max + 0.01;
  return avg;
}

function renderComparar() {
  montarFuelTabsComparar();
  montarStratTabsComparar();
  if (!G_DADOS) return;

  const fuel = G_CMP_FUEL;
  const fuelLabel = (CMP_FUELS.find(f => f.key === fuel) || {}).label || fuel;

  const postos = Object.keys(POSTOS_DADOS).filter(p => {
    const e = POSTOS_DADOS[p];
    if (G_CMP_POSTO && p !== G_CMP_POSTO)        return false;
    if (G_CMP_SUP  && e.sup      !== G_CMP_SUP)  return false;
    if (G_CMP_BAND && e.bandeira !== G_CMP_BAND) return false;
    return true;
  }).sort();

  let somaMinha = 0, contMinha = 0, somaConc = 0, contConc = 0;
  let cardsHtml = '';

  postos.forEach(posto => {
    const estru = POSTOS_DADOS[posto] || {};
    const dadosProp = G_DADOS.prop[posto] || G_DADOS.prop['P. ' + posto] || null;
    const ownVal = (dadosProp && dadosProp[fuel]) ? parseFloat(dadosProp[fuel]) : null;

    const concPorPosto = (G_DADOS.concPorPosto && G_DADOS.concPorPosto[posto]) ? G_DADOS.concPorPosto[posto] : {};
    const concPorBloco = (G_DADOS.concPorBloco && G_DADOS.concPorBloco[estru.bloco || posto]) ? G_DADOS.concPorBloco[estru.bloco || posto] : {};
    const concMerge = Object.assign({}, concPorBloco, concPorPosto);

    const competidores = Object.keys(concMerge)
      .map(nome => ({
        nome,
        preco: concMerge[nome][fuel] ? parseFloat(concMerge[nome][fuel]) : null,
        ontem: (G_ONTEM_MAP[fuel] && G_ONTEM_MAP[fuel][nome] !== undefined) ? G_ONTEM_MAP[fuel][nome] : null,
      }))
      .filter(c => c.preco !== null)
      .filter(c => !G_CMP_SO_MUDOU || (c.ontem !== null && Math.abs(c.preco - c.ontem) >= 0.005))
      .sort((a, b) => a.preco - b.preco);

    if (ownVal === null && competidores.length === 0) return;
    if (ownVal !== null) { somaMinha += ownVal; contMinha++; }
    competidores.forEach(c => { somaConc += c.preco; contConc++; });

    const precos = competidores.map(c => c.preco);
    const min = precos.length ? Math.min(...precos) : null;
    const max = precos.length ? Math.max(...precos) : null;
    const avg = precos.length ? precos.reduce((a, b) => a + b, 0) / precos.length : null;
    const perdendo = ownVal !== null && min !== null && ownVal > min;

    const badgeHtml = ownVal !== null
      ? `<span class="region-badge ${perdendo ? 'perdendo' : 'ganhando'}">Você: R$ ${ownVal.toFixed(2)}</span>`
      : '';

    let listHtml = '';
    if (competidores.length) {
      competidores.forEach(c => {
        const d = c.preco - (ownVal || 0);
        const igual = Math.abs(d) < 0.005;

        // Filtro de faixa de preço
        if (G_CMP_FAIXA_PRECO === 'abaixo' && ownVal !== null && !(d < -0.004)) return;
        if (G_CMP_FAIXA_PRECO === 'acima'  && ownVal !== null && !(d >  0.004)) return;

        let diffHtml = '';
        if (ownVal !== null) {
          const cor = igual ? 'var(--wn)' : (d < 0 ? 'var(--dg)' : 'var(--ok)');
          const txt = igual ? 'igual' : (d > 0 ? '+' : '') + Math.round(d * 100) + 'c';
          diffHtml = `<span class="complist-diff" style="color:${cor}">${txt}</span>`;
        }
        let vsOntemHtml = '';
        if (c.ontem !== null) {
          const dOntem = c.preco - c.ontem;
          if (Math.abs(dOntem) >= 0.005) {
            const corOntem = dOntem > 0 ? 'var(--dg)' : 'var(--ok)';
            const seta = dOntem > 0 ? '↑' : '↓';
            vsOntemHtml = ` <span style="font-size:.62rem;color:${corOntem}">${seta}${Math.abs(Math.round(dOntem * 100))}c vs ontem</span>`;
          }
        }
        listHtml += `<div class="complist-row"><span class="complist-nome">${c.nome}${vsOntemHtml}</span><span><span class="complist-preco">R$ ${c.preco.toFixed(2)}</span>${diffHtml}</span></div>`;
      });
      if (!listHtml) {
        listHtml = `<div class="empty" style="padding:.4rem 0;font-size:.74rem;text-align:left">Nenhum concorrente para esse filtro.</div>`;
      }
    } else {
      const msgVazio = G_CMP_SO_MUDOU
        ? `Nenhum concorrente mudou de preço desde ontem para ${fuelLabel.toLowerCase()}`
        : `Sem concorrente coletado hoje para ${fuelLabel.toLowerCase()}`;
      listHtml = `<div class="empty" style="padding:.4rem 0;font-size:.74rem;text-align:left">${msgVazio}</div>`;
    }

    let sugeridoHtml = '';
    if (ownVal !== null && precos.length) {
      const alvo = cmpCalcularSugerido(min, avg, max);
      const mover = alvo - ownVal;
      const moverIgual = Math.abs(mover) < 0.005;
      const corMover = moverIgual ? 'var(--tx3)' : (mover < 0 ? 'var(--dg)' : 'var(--ok)');
      const txtMover = moverIgual ? 'manter' : (mover > 0 ? '+' : '') + Math.round(mover * 100) + 'c';
      sugeridoHtml = `<div class="sugerido-row"><span class="sugerido-lbl">Sugerido</span><span><span class="sugerido-val">R$ ${alvo.toFixed(2)}</span><span class="sugerido-move" style="color:${corMover}">${txtMover}</span></span></div>`;
    }

    cardsHtml += `<div class="region-card" id="cmp-card-${posto.replace(/[^a-zA-Z0-9]/g, '_')}">
      <div class="region-hdr"><span class="region-nome">P. ${posto}</span>${badgeHtml}</div>
      ${listHtml}
      ${sugeridoHtml}
    </div>`;
  });

  const regionsEl = document.getElementById('cmp-regions');
  if (regionsEl) regionsEl.innerHTML = cardsHtml || '<div class="empty">Nenhuma coleta para esse filtro hoje.</div>';

  const minhaAvg = contMinha ? somaMinha / contMinha : null;
  const concAvg  = contConc  ? somaConc  / contConc  : null;
  let diffTxt = '-', diffCor = 'var(--tx3)';
  if (minhaAvg !== null && concAvg !== null) {
    const d = minhaAvg - concAvg;
    diffCor = d > 0 ? 'var(--dg)' : 'var(--ok)';
    diffTxt = (d > 0 ? '+' : '') + 'R$ ' + Math.abs(d).toFixed(2) + (d > 0 ? ' acima' : ' abaixo');
  }
  const myAvgEl = document.getElementById('cmp-myavg');
  if (myAvgEl) {
    myAvgEl.innerHTML = `
      <div class="myavg-card mine">
        <div class="myavg-lbl">Minha média</div>
        <div class="myavg-val" style="color:var(--ac)">${minhaAvg !== null ? 'R$ ' + minhaAvg.toFixed(2) : '--'}</div>
        <div class="myavg-sub" style="color:var(--ac)">${contMinha} posto(s)</div>
      </div>
      <div class="myavg-card comp">
        <div class="myavg-lbl">Média concorrência</div>
        <div class="myavg-val">${concAvg !== null ? 'R$ ' + concAvg.toFixed(2) : '--'}</div>
        <div class="myavg-sub" style="color:${diffCor}">${diffTxt}</div>
      </div>`;
  }
}

// ════════════════════════════════════════════════════════════
// HEATMAP / RANKING / REGIONAL
// ════════════════════════════════════════════════════════════
function renderHeatmap() {
  const body = document.getElementById('heatmap-body');
  let arr = [];
  for (let p in G_DADOS.prop) {
    if (G_DADOS.prop[p].GC > 0) arr.push(parseFloat(G_DADOS.prop[p].GC));
  }
  if (arr.length === 0) { body.innerHTML = '<div class="empty">Sem dados</div>'; return; }
  arr.sort((a, b) => a - b);
  const min = arr[0], max = arr[arr.length - 1], dif = max - min || 1;
  body.innerHTML = '';
  for (let p in G_DADOS.prop) {
    const val = G_DADOS.prop[p].GC;
    if (!val || val <= 0) continue;
    const pct = (parseFloat(val) - min) / dif;
    let cor = 'var(--ok)';
    if (pct > 0.35 && pct <= 0.7) cor = 'var(--wn)';
    else if (pct > 0.7) cor = 'var(--dg)';
    const cell = document.createElement('div');
    cell.className = 'hcell';
    cell.style.background = cor;
    cell.title = `${p}: R$ ${parseFloat(val).toFixed(2)}`;
    cell.onclick = () => {
      setTab(document.querySelectorAll('.nbtn')[0], 'comp');
      G_CMP_SUP = ''; G_CMP_BAND = ''; G_CMP_POSTO = ''; G_CMP_FUEL = 'GC';
      const selSup = document.getElementById('cmp-sup'); if (selSup) selSup.value = '';
      const selBand = document.getElementById('cmp-band'); if (selBand) selBand.value = '';
      const selPosto = document.getElementById('cmp-posto'); if (selPosto) selPosto.value = '';
      renderComparar();
      setTimeout(() => {
        const alvo = document.getElementById('cmp-card-' + p.replace(/[^a-zA-Z0-9]/g, '_'));
        if (alvo) { alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); alvo.style.borderColor = 'var(--ac)'; }
      }, 80);
    };
    body.appendChild(cell);
  }
}

function setFiltroSup(btn, sup) {
  const r = btn.parentNode;
  r.querySelectorAll('.ftag').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  G_FILTRO_SUP = sup;
  renderRanking();
}

function renderRanking() {
  const body = document.getElementById('rank-body');
  let list = [];
  const concPlano = G_DADOS.concPlano || G_DADOS.conc || {};
  for (let nome in concPlano) {
    const item = concPlano[nome];
    if (!item || !item.GC) continue;
    const sup = item.supervisor || '';
    if (G_FILTRO_SUP !== 'todos' && sup !== G_FILTRO_SUP) continue;
    list.push({ nome, postoP: item.bloco || '', banda: item.bandeira || 'B. Branca', sup, preco: parseFloat(item.GC) });
  }
  document.getElementById('rank-count').textContent = `${list.length} concorrentes mapeados`;
  if (list.length === 0) { body.innerHTML = '<div class="empty">Nenhum dado para este filtro</div>'; return; }
  list.sort((a, b) => a.preco - b.preco);
  let html = '';
  list.forEach((x, idx) => {
    let corDot = 'var(--wn)';
    if (idx < list.length * 0.2) corDot = 'var(--ok)';
    else if (idx > list.length * 0.8) corDot = 'var(--dg)';
    html += `<div class="ritem">
      <div class="rnum">#${idx + 1}</div>
      <div class="rdot" style="background:${corDot}"></div>
      <div class="rinfo"><div class="rnome">${x.nome}</div><div class="rbanda">${x.banda} • Ref: P. ${x.postoP}</div></div>
      <div class="rpreco">R$ ${x.preco.toFixed(2)}</div>
    </div>`;
  });
  body.innerHTML = html;
  renderBandaRank(list);
  renderDeslocados();
}

function renderBandaRank(list) {
  const body = document.getElementById('band-rank-body');
  let bData = {};
  list.forEach(x => {
    if (!bData[x.banda]) bData[x.banda] = { soma: 0, c: 0 };
    bData[x.banda].soma += x.preco; bData[x.banda].c++;
  });
  let html = '';
  for (let b in bData) {
    const med = bData[b].soma / bData[b].c;
    html += `<div class="bbox"><div class="bbnome">${b}</div><div class="bbval">R$ ${med.toFixed(2)}</div><div style="font-size:.55rem;color:var(--tx3)">${bData[b].c} postos</div></div>`;
  }
  body.innerHTML = html || '<div class="empty">Sem dados</div>';
}

function renderDeslocados() {
  const body = document.getElementById('deslocado-body');
  let totalGc = 0, cGc = 0;
  for (let p in G_DADOS.prop) {
    if (G_DADOS.prop[p].GC > 0) { totalGc += parseFloat(G_DADOS.prop[p].GC); cGc++; }
  }
  if (cGc === 0) { body.innerHTML = '<div class="empty">Sem dados de média de rede</div>'; return; }
  const mediaRede = totalGc / cGc;
  let html = '';
  for (let p in G_DADOS.prop) {
    const v = parseFloat(G_DADOS.prop[p].GC);
    if (!v || v <= 0) continue;
    const diff = v - mediaRede;
    if (Math.abs(diff) >= 0.15) {
      const sColor = diff > 0 ? 'var(--dg)' : 'var(--inf)';
      html += `<div class="ritem">
        <div class="rinfo"><div class="rnome">P. ${p}</div><div class="rbanda">Desvio de ${diff > 0 ? '+' : ''}${diff.toFixed(2)} da média da rede</div></div>
        <div class="rpreco" style="color:${sColor}">R$ ${v.toFixed(2)}</div>
      </div>`;
    }
  }
  body.innerHTML = html || '<div class="empty">Nenhum posto com desvio crítico (>= R$ 0.15) detectado.</div>';
}

function renderRegional() {
  const bandBody = document.getElementById('band-body');
  const regBody  = document.getElementById('reg-body');
  let bData = {};
  const concPlanoReg = G_DADOS.concPlano || G_DADOS.conc || {};
  for (let nome in concPlanoReg) {
    const item = concPlanoReg[nome];
    if (!item || !item.GC) continue;
    const b = item.bandeira || 'Bandeira Branca';
    if (!bData[b]) bData[b] = { s: 0, c: 0 };
    bData[b].s += parseFloat(item.GC); bData[b].c++;
  }
  let htmlB = '';
  for (let b in bData) {
    htmlB += `<div class="bbox"><div class="bbnome">${b}</div><div class="bbval">R$ ${(bData[b].s / bData[b].c).toFixed(2)}</div></div>`;
  }
  bandBody.innerHTML = htmlB || '<div class="empty">Sem dados</div>';

  let sData = {};
  for (let p in G_DADOS.prop) {
    const sup = POSTOS_DADOS[p] ? POSTOS_DADOS[p].sup : 'Sem Sup';
    const v = parseFloat(G_DADOS.prop[p].GC);
    if (v > 0) { if (!sData[sup]) sData[sup] = []; sData[sup].push({ n: p, v }); }
  }
  let htmlS = '';
  for (let sup in sData) {
    htmlS += `<div class="reg-sup">
      <div class="reg-sup-hdr"><div class="reg-sup-nome">${sup}</div><div class="klbl">${sData[sup].length} postos</div></div>
      <div class="reg-posto-list">`;
    sData[sup].forEach(x => {
      htmlS += `<div class="reg-posto"><span>P. ${x.n}</span><span style="font-family:var(--mono);font-weight:700;color:var(--ac)">R$ ${x.v.toFixed(2)}</span></div>`;
    });
    htmlS += `</div></div>`;
  }
  regBody.innerHTML = htmlS || '<div class="empty">Sem dados</div>';
}

// ════════════════════════════════════════════════════════════
// MAPA LEAFLET
// ════════════════════════════════════════════════════════════
function initLeafletInstance() {
  if (leafletMap !== null) { leafletMap.invalidateSize(); return; }
  leafletMap = L.map('leaflet-map', { zoomControl: false }).setView([-19.92, -43.96], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OSM ©CARTO', subdomains: 'abcd', maxZoom: 19
  }).addTo(leafletMap);
  markerCluster = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false, removeOutsideVisibleBounds: false })
    : null;
  if (markerCluster) leafletMap.addLayer(markerCluster);
  renderMapa();
}

function mapaFuelChange(val) { G_MAPA_FUEL = val; renderMapa(); }
function mapaSetSup(btn, sup) {
  document.querySelectorAll('.map-ftag').forEach(x => x.classList.remove('on'));
  btn.classList.add('on');
  G_MAPA_SUP = sup;
  renderMapa();
}

function renderMapa() {
  if (!leafletMap) return;
  if (markerCluster) markerCluster.clearLayers();
  else mapMarkers.forEach(m => leafletMap.removeLayer(m));
  mapMarkers = [];

  let precosValidos = [], contColetados = 0, contSemColeta = 0;
  const SUPCOR_MAP = { Mauricio: '#00e5a0', Paulo: '#4895ef', Fabricio: '#f9c74f', Gledson: '#c77dff', Rodrigo: '#ff6b6b' };
  const propDados = (G_DADOS && G_DADOS.prop) ? G_DADOS.prop : {};
  const propIndex = {};
  Object.keys(propDados).forEach(k => {
    const norm = k.replace(/^P\.\s*/i, '').trim().toUpperCase();
    propIndex[norm] = propDados[k];
    propIndex[k.toUpperCase()] = propDados[k];
  });

  MAP_POSTOS.forEach(posto => {
    if (G_MAPA_SUP !== 'todos' && posto.sup !== G_MAPA_SUP) return;
    const d = propIndex[posto.ap.toUpperCase()]
           || propIndex[posto.k.toUpperCase()]
           || propIndex[('P. ' + posto.k).toUpperCase()]
           || null;
    const temColeta = d !== null;
    if (temColeta) contColetados++; else contSemColeta++;
    if (G_MAPA_COLETA === 'coletados' && !temColeta) return;
    if (G_MAPA_COLETA === 'semcoleta' &&  temColeta) return;

    const latApi = (d && d.lat) ? corrigirCoordenada(d.lat) : NaN;
    const lngApi = (d && d.lng) ? corrigirCoordenada(d.lng) : NaN;
    const lat = (!isNaN(latApi) && latApi !== 0) ? latApi : posto.lat;
    const lng = (!isNaN(lngApi) && lngApi !== 0) ? lngApi : posto.lng;
    if (!lat || !lng) return;

    const sup  = (d && d.supervisor) || posto.sup;
    const cor  = SUPCOR_MAP[sup] || '#8892a4';
    let iconHtml, preco;
    if (temColeta) {
      preco = d[G_MAPA_FUEL];
      const precoExibir = preco ? 'R$' + parseFloat(preco).toFixed(2) : '--';
      if (preco) precosValidos.push(parseFloat(preco));
      iconHtml = `<div class="custom-marker" style="border-color:${cor};background:#0d1a12">
        <div class="m-name" style="color:${cor}">${posto.ap}</div>
        <div class="m-price" style="color:#fff">${precoExibir}</div>
      </div>`;
    } else {
      iconHtml = `<div class="custom-marker" style="border-color:#333;background:#0d0f12;opacity:.6">
        <div class="m-name" style="color:#5a6478">${posto.ap}</div>
        <div class="m-price" style="color:#3a4355;font-size:9px">⏳ aguardando</div>
      </div>`;
    }

    const cIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [72, 34], iconAnchor: [36, 17] });
    const marker = L.marker([lat, lng], { icon: cIcon });
    if (markerCluster) markerCluster.addLayer(marker); else marker.addTo(leafletMap);
    marker.on('click', () => {
      const dtxt = (d && d.data) ? ` · ${d.data} ${d.hora || ''}` : '';
      let dHtml = `<div class="card" style="margin-top:.5rem"><div class="chdr">
        <div class="ctitle" style="color:${cor}">${posto.ap}</div>
        <div class="csub">Sup: ${sup}${dtxt}</div>
      </div><div class="cbody">`;
      if (temColeta) {
        const fmt3 = v => v ? 'R$' + parseFloat(v).toFixed(3).replace('.', ',') : '--';
        dHtml += `<div class="pr"><span class="prc">G. Comum</span><span class="prv gc">${fmt3(d.GC)}</span></div>`;
        dHtml += `<div class="pr"><span class="prc">G. Aditivada</span><span class="prv ga">${fmt3(d.GA)}</span></div>`;
        dHtml += `<div class="pr"><span class="prc">Etanol</span><span class="prv et">${fmt3(d.ET)}</span></div>`;
        dHtml += `<div class="pr"><span class="prc">Diesel S10</span><span class="prv s10">${fmt3(d.S10)}</span></div>`;
        if (d.S500) dHtml += `<div class="pr"><span class="prc">Diesel S500</span><span class="prv s10">${fmt3(d.S500)}</span></div>`;
      } else {
        dHtml += `<div class="empty" style="padding:.5rem;font-size:.72rem">⏳ Sem coleta hoje.</div>`;
      }
      dHtml += `</div></div>`;
      document.getElementById('mapa-detail').innerHTML = dHtml;
    });
    mapMarkers.push(marker);
  });

  // Postos com coleta mas sem coordenada fixa
  Object.keys(propDados).forEach(k => {
    const d = propDados[k];
    const latV = corrigirCoordenada(d.lat), lngV = corrigirCoordenada(d.lng);
    if (!d.lat || !d.lng || isNaN(latV) || isNaN(lngV) || latV === 0 || lngV === 0) return;
    const sup = d.supervisor || '';
    if (G_MAPA_SUP !== 'todos' && sup !== G_MAPA_SUP) return;
    if (G_MAPA_COLETA === 'semcoleta') return;
    const norm = k.replace(/^P\.\s*/i, '').trim().toUpperCase();
    const canonico = encontrarPostoCanonico(k);
    const jaPlotado = MAP_POSTOS.some(p =>
      p.k.toUpperCase() === norm ||
      ('P. ' + p.k).toUpperCase() === k.toUpperCase() ||
      (canonico && p.k.toUpperCase() === canonico.toUpperCase())
    );
    if (jaPlotado) return;
    const cor = (({ Mauricio: '#00e5a0', Paulo: '#4895ef', Fabricio: '#f9c74f', Gledson: '#c77dff', Rodrigo: '#ff6b6b' })[sup]) || '#8892a4';
    const nome = k.replace(/^P\.\s*/i, 'P. ').substring(0, 12);
    const preco = d[G_MAPA_FUEL];
    if (preco) precosValidos.push(parseFloat(preco));
    contColetados++;
    const iconHtml = `<div class="custom-marker" style="border-color:${cor};background:#0d1a12">
      <div class="m-name" style="color:${cor}">${nome}</div>
      <div class="m-price" style="color:#fff">${preco ? 'R$' + parseFloat(preco).toFixed(2) : '--'}</div>
    </div>`;
    const cIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [72, 34], iconAnchor: [36, 17] });
    const marker = L.marker([latV, lngV], { icon: cIcon });
    if (markerCluster) markerCluster.addLayer(marker); else marker.addTo(leafletMap);
    mapMarkers.push(marker);
  });

  const contador = document.getElementById('mapa-contador');
  if (contador) contador.innerHTML = `<span style="color:var(--ac)">✅ ${contColetados}</span> coletados &nbsp;·&nbsp; <span style="color:var(--tx3)">⏳ ${contSemColeta}</span> aguardando`;

  const legend = document.getElementById('map-legend');
  if (precosValidos.length > 0) {
    precosValidos.sort((a, b) => a - b);
    const min = precosValidos[0], max = precosValidos[precosValidos.length - 1];
    legend.innerHTML = `<span style="color:var(--ok)">Mín: R$ ${min.toFixed(2)}</span><span style="color:var(--wn)">Filtro: ${G_MAPA_FUEL}</span><span style="color:var(--dg)">Máx: R$ ${max.toFixed(2)}</span>`;
  } else {
    legend.innerHTML = `<span>Nenhum preço real carregado para ${G_MAPA_FUEL}</span>`;
  }

  if (mapMarkers.length > 0) {
    const grupo = L.featureGroup(mapMarkers);
    const bounds = grupo.getBounds();
    if (bounds.isValid()) leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }
}

// ════════════════════════════════════════════════════════════
// MAIS+ (submódulos)
// ════════════════════════════════════════════════════════════
function renderAmostra(ctx) {
  ctx.innerHTML = `<div class="sdiv">Controle de Validade Amostra-Testemunha</div>
    <div class="am-card"><div class="am-posto">P. JA</div><div class="am-sub">Bandeira Ipiranga</div><div class="klbl">Dias restantes</div><div class="am-bar-bg"><div class="am-bar" style="width:80%"></div></div><div class="am-dias" style="color:var(--ok)">24 Dias</div></div>
    <div class="am-card"><div class="am-posto">P. ITAPOA</div><div class="am-sub">Bandeira Shell</div><div class="klbl">Dias restantes</div><div class="am-bar-bg"><div class="am-bar" style="width:40%;background:var(--wn)"></div></div><div class="am-dias" style="color:var(--wn)">12 Dias</div></div>
    <div class="am-card"><div class="am-posto">P. BRUNA</div><div class="am-sub">Bandeira BR</div><div class="klbl">Dias restantes</div><div class="am-bar-bg"><div class="am-bar" style="width:10%;background:var(--dg)"></div></div><div class="am-dias" style="color:var(--dg)">2 Dias (Coletar Urgente)</div></div>`;
}

function renderNotif(ctx) {
  ctx.innerHTML = `<div class="sdiv">Histórico de Alertas de Preço</div>
    <div class="notif-item"><div class="notif-ico" style="background:rgba(255,77,109,0.12);color:var(--dg)"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="notif-txt"><strong>P. BRUNA</strong> está R$ 0.24 acima da média regional para Etanol.</div><div class="notif-sub">Há 14 minutos • Sistema Autônomo</div></div></div>
    <div class="notif-item"><div class="notif-ico" style="background:var(--acd);color:var(--ac)"><i class="fa-solid fa-circle-check"></i></div><div><div class="notif-txt">Coleta concluída com sucesso pelo supervisor Maurício na região Centro-Sul.</div><div class="notif-sub">Há 1 hora • App Coletor</div></div></div>`;
}

// PATCH v4: renderDist agora lê DISTRIBUIDORAS_DADOS do backend (não hardcoded)
function renderDist(ctx) {
  if (!DISTRIBUIDORAS_DADOS || !DISTRIBUIDORAS_DADOS.length) {
    ctx.innerHTML = `<div class="sdiv">Preços de Custo Médio FOB Refinaria</div>
      <div class="empty">Carregando dados do servidor...</div>`;
    carregarDadosSensiveis().then(() => renderDist(ctx));
    return;
  }
  const itens = DISTRIBUIDORAS_DADOS.map(d => {
    const rows = Object.keys(d.precos).map(k =>
      `<div class="dbitem"><span>${k}</span><span class="dbval">R$ ${Number(d.precos[k]).toFixed(2)}</span></div>`
    ).join('');
    return `<div class="dbox"><div class="dbnome">${d.nome}</div>${rows}</div>`;
  }).join('');
  ctx.innerHTML = `<div class="sdiv">Preços de Custo FOB Refinaria</div>
    <div class="dcol">${itens}</div>`;
}

function renderSim(ctx) {
  ctx.innerHTML = `<div class="sdiv">Simulador de Margem de Contribuição</div>
    <div class="card"><div class="cbody sim-form">
      <div class="sim-row"><div class="sim-lbl">Preço Custo</div><input type="number" id="s-custo" value="4.42" class="sim-inp" oninput="calcSim()"></div>
      <div class="sim-row"><div class="sim-lbl">Preço Venda</div><input type="number" id="s-venda" value="5.49" class="sim-inp" oninput="calcSim()"></div>
      <div class="sim-row"><div class="sim-lbl">Impostos %</div><input type="number" id="s-imp" value="13.4" class="sim-inp" oninput="calcSim()"></div>
      <div class="sim-res" id="s-res">Margem Líquida Estimada: <span class="sim-res-val" id="s-res-v">R$ 0.00</span></div>
    </div></div>`;
  calcSim();
}
function calcSim() {
  const c = parseFloat(document.getElementById('s-custo').value) || 0;
  const v = parseFloat(document.getElementById('s-venda').value) || 0;
  const i = parseFloat(document.getElementById('s-imp').value)   || 0;
  document.getElementById('s-res').style.display = 'block';
  document.getElementById('s-res-v').textContent = 'R$ ' + (v - c - (v * (i / 100))).toFixed(2);
}

function renderLanc(ctx) {
  let opts = '';
  Object.keys(POSTOS_DADOS).sort().forEach(p => opts += `<option value="${p}">P. ${p}</option>`);
  ctx.innerHTML = `<div class="sdiv">Forçar Entrada Operacional de Preço ADM</div>
    <div class="card"><div class="cbody lanc-form">
      <label class="flbl">Posto Alvo</label><select class="sel" id="l-posto">${opts}</select>
      <div class="lanc-item"><span class="lanc-lbl">Gasolina Comum</span><input type="number" id="l-gc" value="5.49" class="lanc-inp"></div>
      <div class="lanc-item"><span class="lanc-lbl">Gasolina Aditivada</span><input type="number" id="l-ga" value="5.69" class="lanc-inp"></div>
      <div class="lanc-item"><span class="lanc-lbl">Etanol Hidratado</span><input type="number" id="l-et" value="3.59" class="lanc-inp"></div>
      <div class="lanc-item"><span class="lanc-lbl">Diesel S10</span><input type="number" id="l-s10" value="5.99" class="lanc-inp"></div>
      <button class="btn-enviar" onclick="enviarPreco()">Salvar Alteração no Banco</button>
    </div></div>`;
}

async function enviarPreco() {
  const posto = document.getElementById('l-posto').value;
  const gc = document.getElementById('l-gc').value, ga = document.getElementById('l-ga').value;
  const et = document.getElementById('l-et').value, s10 = document.getElementById('l-s10').value;
  document.getElementById('loading').classList.remove('hidden');
  try {
    const url = `${API_URL}?action=setPreco&posto=${encodeURIComponent(posto)}&gc=${gc}&ga=${ga}&et=${et}&s10=${s10}&user=${encodeURIComponent(G_USER.email)}`;
    await fetch(url);
    showToast('Sucesso', 'Preço gravado diretamente na planilha corporativa.');
    carregarDados();
  } catch (e) {
    showToast('Erro de Conexão', 'Não foi possível persistir os dados.');
    document.getElementById('loading').classList.add('hidden');
  }
}

function renderRel(ctx) {
  ctx.innerHTML = `<div class="sdiv">Relatórios Analíticos consolidados</div>
    <div class="rcard">
      <div class="rcardtop"><div class="rcardico" style="background:var(--acd);color:var(--ac)"><i class="fa-solid fa-chart-line"></i></div><div><div class="rcardtitle">Evolução Semanal de Margem</div><div class="rcardsub">Volumetria vs Elasticidade de Preço</div></div></div>
      <div class="rrows"><div class="rrow"><span>Média da Rede (Jan 2026)</span><strong>R$ 0.44 / L</strong></div><div class="rrow"><span>Média da Rede (Atual)</span><strong style="color:var(--ac)">R$ 0.51 / L</strong></div></div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// HISTÓRICO
// ════════════════════════════════════════════════════════════
let G_HISTORICO = [];

function povoarHistPosto() {
  const sel = document.getElementById('hist-posto');
  if (!sel || sel.options.length > 1) return;
  Object.keys(POSTOS_DADOS).sort().forEach(p => {
    const o = document.createElement('option');
    o.value = 'P. ' + p; o.textContent = 'P. ' + p;
    sel.appendChild(o);
  });
}

async function carregarHistorico() {
  povoarHistPosto();
  const posto  = document.getElementById('hist-posto')  ? document.getElementById('hist-posto').value  : '';
  const dias   = document.getElementById('hist-dias')   ? document.getElementById('hist-dias').value   : '30';
  const subEl  = document.getElementById('hist-sub');
  const loadEl = document.getElementById('hist-loading');
  if (loadEl) loadEl.classList.remove('hidden');
  if (subEl)  subEl.textContent = 'Carregando...';
  G_HISTORICO = [];
  try {
    const url  = API_URL + '?tipo=historico&dias=' + encodeURIComponent(dias) + (posto ? '&posto=' + encodeURIComponent(posto) : '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();
    if (json && Array.isArray(json.historico)) {
      G_HISTORICO = json.historico;
      if (subEl) subEl.textContent = (posto || 'Todos os postos') + ' — últimos ' + dias + ' dias (' + json.historico.length + ' registros)';
    } else {
      if (subEl) subEl.textContent = 'Sem dados no período selecionado.';
    }
  } catch (e) {
    if (subEl) subEl.textContent = e.name === 'AbortError' ? 'Tempo esgotado — tente filtrar por posto.' : 'Sem conexão com o servidor.';
  } finally {
    if (loadEl) loadEl.classList.add('hidden');
    renderGrafico(); renderResumoHistorico(); renderListaHistorico();
  }
}

function renderGrafico() {
  const fuel   = document.getElementById('hist-fuel').value;
  const canvas = document.getElementById('hist-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const pontos = G_HISTORICO.filter(r => r.tipo === 'Próprio' && r[fuel] !== null);
  if (pontos.length === 0) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
  const porData = {};
  pontos.forEach(r => { if (!porData[r.data]) porData[r.data] = []; porData[r.data].push(parseFloat(r[fuel])); });
  const datas  = Object.keys(porData).sort((a, b) => {
    const pa = a.split('/'), pb = b.split('/');
    return new Date(pa[2], pa[1] - 1, pa[0]) - new Date(pb[2], pb[1] - 1, pb[0]);
  });
  const valores = datas.map(d => { const arr = porData[d]; return arr.reduce((s, v) => s + v, 0) / arr.length; });
  const W = canvas.offsetWidth || 340, H = 200;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  const pad = { t: 20, r: 10, b: 30, l: 50 };
  const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;
  const minV = Math.min(...valores) - 0.05, maxV = Math.max(...valores) + 0.05, rV = maxV - minV || 0.1;
  const xOf = i => pad.l + (i / (datas.length - 1 || 1)) * gW;
  const yOf = v => pad.t + (1 - (v - minV) / rV) * gH;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * gH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = '#5a6478'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
    ctx.fillText('R$' + (maxV - (i / 4) * rV).toFixed(2), pad.l - 4, y + 3);
  }
  ctx.strokeStyle = '#00e5a0'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath();
  valores.forEach((v, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)); });
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,229,160,0.08)'; ctx.beginPath();
  valores.forEach((v, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)); });
  ctx.lineTo(xOf(valores.length - 1), pad.t + gH); ctx.lineTo(xOf(0), pad.t + gH); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#00e5a0';
  valores.forEach((v, i) => { ctx.beginPath(); ctx.arc(xOf(i), yOf(v), 3, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#5a6478'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(datas.length / 5));
  datas.forEach((d, i) => {
    if (i % step !== 0 && i !== datas.length - 1) return;
    const parts = d.split('/');
    ctx.fillText(parts[0] + '/' + parts[1], xOf(i), H - 8);
  });
}

function renderResumoHistorico() {
  const fuel = document.getElementById('hist-fuel') ? document.getElementById('hist-fuel').value : 'GC';
  const body = document.getElementById('hist-resumo');
  const prop = G_HISTORICO.filter(r => r.tipo === 'Próprio' && r[fuel]);
  const conc = G_HISTORICO.filter(r => r.tipo !== 'Próprio' && r[fuel]);
  if (!prop.length && !conc.length) { body.innerHTML = '<div class="empty">Sem dados suficientes para resumo.</div>'; return; }
  const media = arr => arr.length ? (arr.reduce((s, r) => s + parseFloat(r[fuel]), 0) / arr.length) : null;
  const min_r = arr => arr.length ? Math.min(...arr.map(r => parseFloat(r[fuel]))) : null;
  const max_r = arr => arr.length ? Math.max(...arr.map(r => parseFloat(r[fuel]))) : null;
  const mp = media(prop), mc = media(conc);
  const fmt = v => v !== null ? 'R$ ' + v.toFixed(2).replace('.', ',') : '--';
  body.innerHTML = `
    <div class="bgrid" style="grid-template-columns:1fr 1fr;gap:.5rem">
      <div class="bbox"><div class="bbnome" style="color:var(--ac)">Nossos Postos</div>
        <div class="dbitem"><span>Média</span><span class="dbval">${fmt(mp)}</span></div>
        <div class="dbitem"><span>Mínimo</span><span class="dbval">${fmt(min_r(prop))}</span></div>
        <div class="dbitem"><span>Máximo</span><span class="dbval">${fmt(max_r(prop))}</span></div>
        <div class="dbitem"><span>Registros</span><span class="dbval">${prop.length}</span></div></div>
      <div class="bbox"><div class="bbnome" style="color:var(--wn)">Concorrentes</div>
        <div class="dbitem"><span>Média</span><span class="dbval">${fmt(mc)}</span></div>
        <div class="dbitem"><span>Mínimo</span><span class="dbval">${fmt(min_r(conc))}</span></div>
        <div class="dbitem"><span>Máximo</span><span class="dbval">${fmt(max_r(conc))}</span></div>
        <div class="dbitem"><span>Registros</span><span class="dbval">${conc.length}</span></div></div>
    </div>
    ${mp && mc ? `<div style="margin-top:.5rem;padding:.6rem;background:${mp < mc ? 'rgba(0,229,160,.08)' : 'rgba(255,77,109,.08)'};border-radius:8px;font-size:.78rem">
      ${mp < mc ? `✅ Nosso preço médio está <strong style="color:var(--ok)">R$ ${(mc - mp).toFixed(2)} abaixo</strong> da concorrência.`
               : `⚠️ Nosso preço médio está <strong style="color:var(--dg)">R$ ${(mp - mc).toFixed(2)} acima</strong> da concorrência.`}
    </div>` : ''}`;
}

function renderListaHistorico() {
  const body = document.getElementById('hist-lista');
  const qtd  = document.getElementById('hist-qtd');
  const fuel = document.getElementById('hist-fuel') ? document.getElementById('hist-fuel').value : 'GC';
  const lista = G_HISTORICO.filter(r => r[fuel]).slice(-50).reverse();
  qtd.textContent = lista.length + ' registros (mais recentes)';
  if (!lista.length) { body.innerHTML = '<div class="empty">Sem registros no período.</div>'; return; }
  body.innerHTML = lista.map(r => {
    const isProp = r.tipo === 'Próprio', cor = isProp ? 'var(--ac)' : 'var(--tx3)';
    const v = parseFloat(r[fuel]).toFixed(2).replace('.', ',');
    return `<div class="ritem">
      <div class="rinfo"><div class="rnome" style="color:${cor}">${r.postoAlvo}</div>
      <div class="rbanda">${r.data} ${r.hora ? r.hora.substring(0, 5) : ''} · ${r.tipo} · ${r.bandeira || ''}</div></div>
      <div class="rpreco" style="color:${cor}">R$ ${v}</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
// UTILITÁRIOS GLOBAIS
// ════════════════════════════════════════════════════════════
function showToast(title, msg) {
  const t = document.getElementById('toast');
  document.getElementById('t-title').textContent = title;
  document.getElementById('t-msg').textContent   = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ════════════════════════════════════════════════════════════
// LOGÍSTICA — módulo consolidado (SEM DUPLICATAS)
// PATCH v4: sub-aba "Coleta" REMOVIDA do módulo Logística.
//   A coleta de preços agora existe só em Mais+ > Coleta (renderColetaSimples).
//   A seção Logística exibe apenas a sub-aba "Medição".
// ════════════════════════════════════════════════════════════
let LOG_MAT_DADOS       = null;
let LOG_MAT_EDICOES     = {};
let LOG_MAT_POSTO_ATUAL = '';
let LOG_MES_CARREGADO   = '';
let LOG_SUB_ATIVA       = 'medicao';
let LC_TODAS            = [];
let _logAutoRefreshTimer = null;

// Apenas as 5 seções editáveis — Previsão e Diferença são calculadas
// automaticamente pela planilha (fórmulas) e não precisam aparecer aqui.
const LOG_CATEGORIAS = [
  { chave: 'medicao',   titulo: '🛢️ MEDIÇÃO (L)',        cls: 'lh-med',  cor: '#4895ef', edit: true },
  { chave: 'venda',     titulo: '⛽ VENDA DIÁRIA (L)',    cls: 'lh-ven',  cor: '#d4af37', edit: true },
  { chave: 'carga',     titulo: '🚚 CARGA RECEBIDA (L)',  cls: 'lh-carg', cor: '#c77dff', edit: true },
  { chave: 'prePedido', titulo: '📦 PRÉ-PEDIDO (L)',      cls: 'lh-pre',  cor: '#f9c74f', edit: true },
  { chave: 'pedido',    titulo: '📋 PEDIDO FINAL (L)',    cls: 'lh-ped',  cor: '#ff9e00', edit: true },
];

// Injeta CSS global para corrigir sticky headers e scrollbar da matriz
(function injetarCssMatriz() {
  if (document.getElementById('css-log-matrix')) return;
  const s = document.createElement('style');
  s.id = 'css-log-matrix';
  s.textContent = `
    /* ── Wrapper scroll ──────────────────────────────── */
    #log-sub-medicao {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      max-height: calc(100vh - 160px);
    }

    /* ── Scrollbar maior ─────────────────────────────── */
    #log-sub-medicao::-webkit-scrollbar        { width: 10px; height: 10px; }
    #log-sub-medicao::-webkit-scrollbar-track  { background: #0d1020; border-radius: 6px; }
    #log-sub-medicao::-webkit-scrollbar-thumb  { background: #2a3555; border-radius: 6px; border: 2px solid #0d1020; }
    #log-sub-medicao::-webkit-scrollbar-thumb:hover { background: #4895ef; }
    #log-sub-medicao::-webkit-scrollbar-corner { background: #0d1020; }

    /* ── Tabela ──────────────────────────────────────── */
    #log-matrix-table {
      border-collapse: separate;
      border-spacing: 0;
      width: max-content;
      min-width: 100%;
    }

    /* ── Thead sticky (vertical) ─────────────────────── */
    #log-matrix-thead th {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #12172a;
    }

    /* ── Input nas células ───────────────────────────── */
    .log-cell-in {
      background: transparent;
      border: none;
      border-bottom: 1px solid #252d45;
      color: inherit;
      width: 68px;
      text-align: right;
      font-size: .8rem;
      font-family: var(--mono, monospace);
      padding: 2px 4px;
      outline: none;
      display: block;
    }
    .log-cell-in:focus       { border-bottom-color: #4895ef; background: rgba(72,149,239,.08); }
    .log-cell-dirty          { border-bottom-color: #f9c74f !important; }

    /* ── Hover nas linhas ────────────────────────────── */
    #log-matrix-tbody tr:hover td { background: rgba(255,255,255,.025) !important; }
    #log-matrix-tbody tr:hover td[style*="0d1020"] { background: #0d1020 !important; }
  `;
  if (document.head) document.head.appendChild(s);
  else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
})();

function logPopularSelects() {
  // Selects já populados no HTML — garante que o value do option bate com o AS
}

// PATCH v4: logSwitchSub só conhece 'medicao' — sub-aba 'coleta' foi removida
function logSwitchSub(sub) {
  LOG_SUB_ATIVA = 'medicao'; // força sempre medição (coleta foi removida desta seção)
  document.querySelectorAll('.log-subtab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('lsubt-medicao');
  if (btn) btn.classList.add('active');
  const medEl = document.getElementById('log-sub-medicao');
  if (medEl) medEl.style.display = 'flex';
  ['btn-log-salvar', 'btn-log-pre'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
}

function logOnPostoChange(posto) {
  LC_TODAS = [];
  const postoCompleto = (posto || '').trim();
  carregarLogMatriz(postoCompleto);
}

async function logRefresh() {
  const btn  = document.getElementById('btn-log-refresh');
  const icon = document.getElementById('btn-log-refresh-icon');
  if (btn)  btn.disabled = true;
  if (icon) icon.classList.add('girando');
  try {
    if (!LOG_MAT_POSTO_ATUAL) return;
    const pendentes = Object.keys(LOG_MAT_EDICOES).length;
    if (pendentes > 0) {
      const ok = confirm(pendentes + ' alteração(ões) não salva(s).\nRecarregar vai descartá-las. Continuar?');
      if (!ok) return;
    }
    await carregarLogMatriz(LOG_MAT_POSTO_ATUAL);
    logRegistrarAtualizacao();
  } finally {
    if (btn)  btn.disabled = false;
    if (icon) icon.classList.remove('girando');
  }
}

function logRegistrarAtualizacao() {
  const el = document.getElementById('log-ultima-atualizacao');
  if (!el) return;
  const agora = new Date();
  el.textContent = 'Atual. ' + String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
}

async function carregarLogMatriz(posto) {
  const sub   = document.getElementById('log-matrix-sub');
  const tbody = document.getElementById('log-matrix-tbody');
  const thead = document.getElementById('log-matrix-thead');
  if (!posto) {
    if (sub)   sub.textContent = '• Selecione um posto';
    if (tbody) tbody.innerHTML = '<tr><td style="padding:1.5rem;color:var(--tx3);text-align:center">Selecione um posto para carregar a matriz do mês.</td></tr>';
    if (thead) thead.innerHTML = '';
    LOG_MAT_DADOS = null; LOG_MAT_EDICOES = {};
    logAtualizarBotoes(); return;
  }
  LOG_MAT_POSTO_ATUAL = posto;
  LOG_MAT_EDICOES = {};
  if (sub)   sub.textContent = '• Carregando ' + posto + '...';
  if (tbody) tbody.innerHTML = '<tr><td style="padding:1.5rem;color:var(--tx3);text-align:center"><div class="loading-spin" style="margin:0 auto"></div></td></tr>';
  logAtualizarBotoes();

  async function _tentarBuscar(nomePosto) {
    const res  = await fetch(API_URL + '?tipo=mesCompleto&posto=' + encodeURIComponent(nomePosto));
    return await res.json();
  }

  function _semAcento(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  try {
    let json = await _tentarBuscar(posto);

    if ((json.erro || !json.success) && _semAcento(posto) !== posto) {
      const postoSemAcento = _semAcento(posto);
      const json2 = await _tentarBuscar(postoSemAcento);
      if (json2.success && !json2.erro) {
        json = json2;
        LOG_MAT_POSTO_ATUAL = postoSemAcento;
      }
    }

    if (json.erro || !json.success) {
      if (sub)   sub.textContent = '• Erro: ' + (json.erro || 'Falha');
      if (tbody) tbody.innerHTML = '<tr><td style="padding:1.5rem;color:var(--dg);text-align:center">' + (json.erro || 'Erro') + '</td></tr>';
      return;
    }
    LOG_MAT_DADOS = json;
    if (sub) sub.textContent = '• ' + json.posto + ' — ' + json.mes + '/' + json.ano;
    LOG_MES_CARREGADO = json.mes + '/' + String(json.ano).slice(2);
    logMontarCabecalho(json.grupos, json.combustiveisVenda);
    logMontarLinhas(json);
    logRegistrarAtualizacao();
  } catch (e) {
    if (sub)   sub.textContent = '• Falha de conexão';
    if (tbody) tbody.innerHTML = '<tr><td style="padding:1.5rem;color:var(--dg);text-align:center">Erro: ' + e.message + '</td></tr>';
  }
}

function logColsDaCategoria(chave, grupos, vendaCols) { return chave === 'venda' ? vendaCols : grupos; }

function logFmtL(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Math.round(Number(v)).toLocaleString('pt-BR');
}
function logParseNum(str) {
  if (!str && str !== 0) return null;
  const s = String(str).replace(/\./g, '').replace(',', '.').replace('—', '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function logMontarCabecalho(grupos, vendaCols) {
  const thead = document.getElementById('log-matrix-thead');
  if (!thead) return;
  const table = thead.closest('table');
  if (table) table.id = 'log-matrix-table';

  const STICKY_BASE = 'position:sticky;z-index:18;';
  const TH_BASE     = 'text-align:center;white-space:nowrap;padding:.4rem .6rem;';
  const BG_MAP = {
    medicao:   { g1: '#101e30', g2: '#0e1b2c', borda: '#4895ef' },
    venda:     { g1: '#181508', g2: '#151307', borda: '#d4af37' },
    carga:     { g1: '#160d22', g2: '#130b1e', borda: '#c77dff' },
    prePedido: { g1: '#1a1608', g2: '#171407', borda: '#f9c74f' },
    pedido:    { g1: '#1a1105', g2: '#171005', borda: '#ff9e00' },
  };

  const DIA_STYLE =
    'position:sticky;left:0;top:0;z-index:30;' +
    'background:#0d1120;' +
    'min-width:62px;padding:.4rem .5rem;' +
    'font-size:.68rem;font-weight:700;' +
    'color:#5a6478;text-align:center;' +
    'border-bottom:1px solid #1e2845;' +
    'border-right:2px solid #1e2845;';

  let r1 = '<tr>';
  r1 += '<th rowspan="2" style="' + DIA_STYLE + '">DIA</th>';

  LOG_CATEGORIAS.forEach((cat, ci) => {
    const cols = logColsDaCategoria(cat.chave, grupos, vendaCols);
    const span = cols.length;
    const m    = BG_MAP[cat.chave] || { g1: '#0d1120', g2: '#0d1120', borda: '#2a3550' };
    if (ci > 0) {
      r1 += '<th rowspan="2" style="' +
        'position:sticky;top:0;z-index:20;' +
        'background:#07090f;width:8px;min-width:8px;' +
        'border:none;padding:0' +
        '"></th>';
    }
    r1 += '<th colspan="' + span + '" style="' +
      STICKY_BASE + 'top:0;z-index:20;' +
      'background:' + m.g1 + ';' +
      TH_BASE +
      'font-family:var(--mono,monospace);font-size:.62rem;font-weight:700;' +
      'color:' + cat.cor + ';' +
      'letter-spacing:.05em;text-transform:uppercase;' +
      'border-bottom:2px solid ' + m.borda + ';' +
      'border-left:1px solid ' + m.borda + '55;' +
      '">' + cat.titulo + '</th>';
  });
  r1 += '</tr>';

  let r2 = '<tr>';

  LOG_CATEGORIAS.forEach((cat, ci) => {
    const cols = logColsDaCategoria(cat.chave, grupos, vendaCols);
    const m    = BG_MAP[cat.chave] || { g1: '#0d1120', g2: '#0d1120', borda: '#2a3550' };
    cols.forEach((col, gi) => {
      const isFirst = gi === 0;
      r2 += '<th style="' +
        STICKY_BASE + 'top:var(--log-thead-h,36px);z-index:19;' +
        'background:' + m.g2 + ';' +
        TH_BASE +
        'font-family:var(--mono,monospace);font-size:.7rem;font-weight:700;' +
        'color:' + cat.cor + ';' +
        'min-width:72px;' +
        'border-bottom:2px solid ' + m.borda + ';' +
        (isFirst ? 'border-left:1px solid ' + m.borda + '55;' : '') +
        '">' + col.abv + '</th>';
    });
  });
  r2 += '</tr>';

  thead.innerHTML = r1 + r2;

  function _aplicarTopLinha2() {
    const tr1 = thead.querySelector('tr:first-child');
    if (!tr1) return 0;
    const h = tr1.offsetHeight || tr1.getBoundingClientRect().height || 36;
    const topVal = Math.ceil(h) + 'px';
    thead.querySelectorAll('tr:last-child th').forEach(th => { th.style.top = topVal; });
    document.documentElement.style.setProperty('--log-thead-h', topVal);
    return h;
  }

  const h0 = _aplicarTopLinha2();
  if (!h0 || h0 < 10) {
    requestAnimationFrame(() => {
      const h1 = _aplicarTopLinha2();
      if (!h1 || h1 < 10) {
        requestAnimationFrame(() => _aplicarTopLinha2());
      }
    });
  }
}

function logMontarLinhas(dados) {
  const tbody = document.getElementById('log-matrix-tbody');
  if (!tbody) return;
  const grupos   = dados.grupos;
  const vendaCols = dados.combustiveisVenda;
  const hoje     = new Date().getDate();

  const TD  = 'padding:.35rem .45rem;font-size:.8rem;font-family:var(--mono,monospace);text-align:right;border-bottom:1px solid #1e2435;';
  const SEP = 'background:#0d1020;width:12px;min-width:12px;border:none;padding:0;';

  let html = '';
  dados.dias.forEach((d, diaIdx) => {
    const isHoje = d.dia === hoje;
    const diaTxt = String(d.dia).padStart(2, '0') + '/' + dados.mes;
    const diaStyle = 'position:sticky;left:0;z-index:5;background:' + (isHoje ? '#0e1a2e' : '#12172a') +
      ';padding:.35rem .5rem;font-size:.75rem;font-family:var(--mono,monospace);border-bottom:1px solid #1e2435;' +
      (isHoje ? 'color:#4895ef;font-weight:700' : 'color:#5a6478') + ';white-space:nowrap;min-width:62px;';
    const rowBg = isHoje ? 'background:rgba(72,149,239,.05)' : '';

    html += '<tr style="' + rowBg + '">';
    html += '<td style="' + diaStyle + '">' + diaTxt + '</td>';

    LOG_CATEGORIAS.forEach((cat, ci) => {
      const cols   = logColsDaCategoria(cat.chave, grupos, vendaCols);
      const valores = d[cat.chave] || [];

      if (ci > 0) html += '<td style="' + SEP + '"></td>';

      cols.forEach((col, i) => {
        const val = valores[i];
        const ca  = String(col.comb).replace(/"/g, '&quot;');
        html += '<td style="' + TD + '">' +
          '<input type="text" inputmode="numeric" class="log-cell-in"' +
          ' data-dia="'   + diaIdx      + '"' +
          ' data-campo="' + cat.chave   + '"' +
          ' data-comb="'  + ca          + '"' +
          ' value="'      + logFmtL(val).replace('—', '') + '"' +
          ' oninput="logCelulaEditada(this)" onblur="logCelulaBlur(this)">' +
          '</td>';
      });
    });
    html += '</tr>';
  });

  const totalCols = 1 + LOG_CATEGORIAS.reduce((s, cat, ci) =>
    s + logColsDaCategoria(cat.chave, grupos, vendaCols).length + (ci > 0 ? 1 : 0), 0);

  tbody.innerHTML = html ||
    '<tr><td colspan="' + totalCols + '" style="padding:1.5rem;color:var(--tx3);text-align:center">Sem dados.</td></tr>';
}

function logRecalcPrev(diaIdx) {
  if (!LOG_MAT_DADOS) return;
  const dias = LOG_MAT_DADOS.dias, dia = dias[diaIdx];
  if (!dia) return;
  const diaOntem = dias[diaIdx - 1];
  const grupos = LOG_MAT_DADOS.grupos, vendaCols = LOG_MAT_DADOS.combustiveisVenda;
  grupos.forEach((g, i) => {
    if (!diaOntem) return;
    const medOntem = diaOntem.medicao[i];
    if (medOntem === null || medOntem === undefined) return;
    const carga = Number(dia.carga[i]) || 0;
    const iV = vendaCols.findIndex(c => c.comb === g.comb);
    const venda = (iV === -1 || dia.venda[iV] === null) ? 0 : Number(dia.venda[iV]);
    dia.previsao[i] = Number(medOntem) + carga - venda;
    const medHoje = dia.medicao[i];
    dia.diferenca[i] = (dia.previsao[i] !== null && medHoje !== null && medHoje !== undefined)
      ? Number(medHoje) - dia.previsao[i] : null;
  });
}

function logCelulaEditada(inp) {
  if (!LOG_MAT_DADOS) return;
  const diaIdx = parseInt(inp.dataset.dia), campo = inp.dataset.campo, comb = inp.dataset.comb;
  const valor  = logParseNum(inp.value);
  inp.classList.add('log-cell-dirty');
  const diaObj = LOG_MAT_DADOS.dias[diaIdx];
  const cols   = campo === 'venda' ? LOG_MAT_DADOS.combustiveisVenda : LOG_MAT_DADOS.grupos;
  const idx    = cols.findIndex(c => c.comb === comb);
  if (idx === -1) return;
  diaObj[campo][idx] = valor;
  LOG_MAT_EDICOES[diaIdx + '|' + campo + '|' + comb] = { dia: diaIdx, campo, comb, valor };
  if (campo === 'medicao')                         logRecalcPrev(diaIdx + 1);
  else if (campo === 'carga' || campo === 'venda') logRecalcPrev(diaIdx);
  logAtualizarBotoes();
}
function logCelulaBlur(inp) { inp.value = logFmtL(logParseNum(inp.value)).replace('—', ''); }

function logAtualizarBotoes() {
  const pend   = Object.values(LOG_MAT_EDICOES);
  const preQtd = pend.filter(e => e.campo === 'prePedido').length;
  const matQtd = pend.length - preQtd;
  const btnS   = document.getElementById('btn-log-salvar');
  const btnP   = document.getElementById('btn-log-pre');
  if (btnS) { btnS.disabled = matQtd === 0; btnS.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar' + (matQtd ? ' (' + matQtd + ')' : ''); }
  if (btnP) { btnP.disabled = preQtd === 0; btnP.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Pré-Pedido' + (preQtd ? ' (' + preQtd + ')' : ''); }
}

function logLimparDirty() {
  document.querySelectorAll('#log-matrix-tbody .log-cell-dirty').forEach(el => el.classList.remove('log-cell-dirty'));
}

async function logSalvarMatriz() {
  if (!LOG_MAT_DADOS) return;
  const posto = LOG_MAT_POSTO_ATUAL;
  const itens = Object.values(LOG_MAT_EDICOES)
    .filter(e => e.campo !== 'prePedido')
    .map(e => ({ data: LOG_MAT_DADOS.dias[e.dia].data, campo: e.campo, combustivel: e.comb, valor: e.valor }));
  if (!itens.length) return;
  const btn = document.getElementById('btn-log-salvar');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    await fetch(API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'editar_matriz', posto, itens, user: (G_USER && G_USER.email) || 'ADM' }) });
    Object.keys(LOG_MAT_EDICOES).forEach(k => { if (LOG_MAT_EDICOES[k].campo !== 'prePedido') delete LOG_MAT_EDICOES[k]; });
    logLimparDirty(); logAtualizarBotoes();
    showToast('Salvo ✅', itens.length + ' alteração(ões) gravadas.');
    await carregarLogMatriz(posto);
  } catch (e) { showToast('Erro', e.message); btn.disabled = false; logAtualizarBotoes(); }
}

async function logEnviarPrePedido() {
  if (!LOG_MAT_DADOS) return;
  const posto = LOG_MAT_POSTO_ATUAL;
  const itens = Object.values(LOG_MAT_EDICOES)
    .filter(e => e.campo === 'prePedido')
    .map(e => ({ data: LOG_MAT_DADOS.dias[e.dia].data, campo: 'prePedido', combustivel: e.comb, valor: e.valor }));
  if (!itens.length) return;
  const btn = document.getElementById('btn-log-pre');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    await fetch(API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'editar_matriz', posto, itens, user: (G_USER && G_USER.email) || 'ADM' }) });
    Object.keys(LOG_MAT_EDICOES).forEach(k => { if (LOG_MAT_EDICOES[k].campo === 'prePedido') delete LOG_MAT_EDICOES[k]; });
    logLimparDirty(); logAtualizarBotoes();
    showToast('Pré-Pedido salvo ✅', itens.length + ' sugestão(ões) gravadas.');
    await carregarLogMatriz(posto);
  } catch (e) { showToast('Erro', e.message); logAtualizarBotoes(); }
}

function logVerificarViradaMes() {
  if (!LOG_MAT_POSTO_ATUAL || !LOG_MES_CARREGADO) return false;
  const MESES_ABV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const agora = new Date();
  const mesHoje = MESES_ABV[agora.getMonth()] + '/' + String(agora.getFullYear()).slice(2);
  return mesHoje !== LOG_MES_CARREGADO;
}

function logIniciarAutoRefresh() {
  if (_logAutoRefreshTimer) clearInterval(_logAutoRefreshTimer);
  _logAutoRefreshTimer = setInterval(async () => {
    const sec = document.getElementById('s-logistica');
    if (!sec || !sec.classList.contains('active')) return;
    if (!LOG_MAT_POSTO_ATUAL) return;
    if (logVerificarViradaMes()) {
      const MESES_ABV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      const agora = new Date();
      const novoMes = MESES_ABV[agora.getMonth()] + '/' + String(agora.getFullYear()).slice(2);
      showToast('📅 Novo mês!', 'Recarregando na aba ' + novoMes);
      await carregarLogMatriz(LOG_MAT_POSTO_ATUAL);
    }
  }, 3 * 60 * 1000);
}
logIniciarAutoRefresh(); // ← chamada única

// ════════════════════════════════════════════════════════════
// COLETA DE PREÇOS — Visão Auditora com Swipe de Fotos (Mais+)
// v3: fluxo correto
//   LISTA  = 37 postos próprios (agrupados)
//   DETALHE = concorrentes do posto em swipe (foto + nome + preços mudam juntos)
//   NAVEGAÇÃO = Ant/Próx percorre os 37 postos
// ════════════════════════════════════════════════════════════

const CS_FUEL_NAMES = { GC:'Gasolina C', ET:'Etanol', GA:'G. Aditivada', S10:'Diesel S10', S500:'Diesel S500' };

// ── estado global ────────────────────────────────────────────────
let CS_REGISTROS  = [];  // todos os registros brutos do período
let CS_POSTOS     = [];  // lista de postos próprios ordenada: [{key, nome, concs:[...], meuPreco, fotoMeu, qtdConcs}]
let CS_FILTRADOS  = [];  // postos após filtros
let CS_ESTADOS    = {};  // { postoKey: 'pend'|'ok'|'flag' }
let CS_MEU_HOJE   = {};  // { postoKey: { GC, ET, ..., _fotoMeu } }
let CS_MEU_ONTEM  = {};  // idem para dia anterior
let CS_POSTO_IDX  = -1;  // índice do posto ativo em CS_FILTRADOS
let CS_CONC_IDX   = 0;   // índice do concorrente ativo (slide atual)
let CS_MODO_DIFF  = 'hoje';
let CS_FILTRO_SUP = '';
let CS_CTX        = null;
let csSX = 0, csDragging = false, csDelta = 0, csHintShown = false;

// ── CSS — injetado uma vez ────────────────────────────────────────
(function csInjetarCss() {
  if (document.getElementById('css-coleta-v3')) return;
  const s = document.createElement('style');
  s.id = 'css-coleta-v3';
  s.textContent = `
    #cs-shell{display:flex;flex-direction:column;height:calc(100vh - 120px);overflow:hidden}
    #cs-topbar{background:var(--sf);border-bottom:1px solid var(--bd);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:6px;flex-wrap:wrap}
    .cs-chip{background:var(--sf2);border-radius:5px;padding:3px 8px;font-size:11px;color:var(--tx3)}
    .cs-chip b{color:var(--tx)}
    #cs-prog{height:2px;background:var(--sf2);flex-shrink:0}
    #cs-prog-fill{height:100%;background:var(--ac);transition:width .3s}
    #cs-filtros{background:var(--sf);border-bottom:1px solid var(--bd);padding:6px 10px;display:flex;align-items:center;gap:5px;overflow-x:auto;flex-shrink:0;scrollbar-width:none}
    #cs-filtros::-webkit-scrollbar{display:none}
    .cs-sel{background:var(--sf2);border:1px solid var(--bd);border-radius:5px;color:var(--tx);font-size:11px;padding:3px 6px;cursor:pointer}
    .cs-pill{background:var(--sf2);border:1px solid var(--bd);border-radius:20px;padding:3px 10px;font-size:11px;color:var(--tx3);white-space:nowrap;cursor:pointer;user-select:none}
    .cs-pill.active{background:var(--acd);border-color:var(--ac);color:var(--ac)}
    .cs-pill.danger.active{background:rgba(255,77,109,.08);border-color:#ff4d6d80;color:#ff4d6d}

    /* ── LISTA DE POSTOS ── */
    #cs-lista{flex:1;overflow-y:auto;display:flex;flex-direction:column}
    .cs-posto-item{padding:11px 14px;border-bottom:1px solid var(--sf2);cursor:pointer;display:flex;align-items:center;gap:10px}
    .cs-posto-item:hover,.cs-posto-item:active{background:var(--sf)}
    .cs-posto-item.cs-ok  {border-left:3px solid var(--ac);background:rgba(0,229,160,.04)}
    .cs-posto-item.cs-flag{border-left:3px solid #ff4d6d;background:rgba(255,77,109,.04)}
    .cs-posto-icon{width:34px;height:34px;border-radius:8px;background:var(--sf2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
    .cs-posto-body{flex:1;min-width:0}
    .cs-posto-nome{font-size:13px;font-weight:600;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cs-posto-sub{font-size:10px;color:var(--tx3);margin-top:2px;display:flex;align-items:center;gap:5px}
    .cs-posto-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
    .cs-qtd-badge{font-size:10px;color:var(--tx3);background:var(--sf2);border-radius:10px;padding:2px 7px}
    .cs-sd{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .cs-sd-pend{background:var(--tx3);opacity:.35}
    .cs-sd-ok{background:var(--ac)}
    .cs-sd-flag{background:#ff4d6d}
    .cs-band-pill{border-radius:3px;padding:1px 5px;font-size:9px;font-weight:600}

    /* ── DETALHE ── */
    #cs-detalhe{flex:1;overflow:hidden;flex-direction:column;display:none}
    #cs-detalhe.cs-on{display:flex}
    #cs-dhdr{background:var(--sf);border-bottom:1px solid var(--bd);padding:10px 12px;flex-shrink:0}
    .cs-nav-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
    .cs-btn-back{background:var(--sf2);border:none;border-radius:6px;padding:5px 10px;font-size:11px;color:var(--tx);cursor:pointer}
    .cs-counter{font-size:11px;color:var(--tx3);margin-left:auto}
    .cs-btn-nav{background:var(--sf2);border:none;border-radius:6px;padding:5px 10px;font-size:12px;color:var(--tx);cursor:pointer}
    .cs-dtitle{font-size:15px;font-weight:600;color:var(--tx);display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px}
    /* nome do concorrente — muda com o slide */
    #cs-d-conc-nome{font-size:13px;color:var(--ac);font-weight:600;margin-top:2px}
    .cs-badge{border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600}
    .cs-badge-pend{background:var(--sf2);color:var(--tx3)}
    .cs-badge-ok{background:var(--acd);color:var(--ac);border:1px solid var(--bd2)}
    .cs-badge-flag{background:rgba(255,77,109,.1);color:#ff4d6d;border:1px solid rgba(255,77,109,.3)}
    .cs-dsub{font-size:11px;color:var(--tx3);margin-top:2px}
    .cs-dsub span{color:var(--ac);font-weight:600}
    .cs-meta-row{display:flex;gap:5px;margin-top:5px;flex-wrap:wrap}
    .cs-mc{background:var(--sf2);border-radius:5px;padding:3px 7px;font-size:10px;color:var(--tx3)}
    .cs-mc b{color:var(--tx2)}

    /* ── FOTOS ── */
    .cs-fotos-outer{position:relative;flex-shrink:0;background:#0a0d12;border-bottom:1px solid var(--bd)}
    .cs-fotos-wrap{overflow:hidden;height:190px;cursor:grab;user-select:none;position:relative}
    .cs-fotos-wrap:active{cursor:grabbing}
    .cs-fotos-track{display:flex;height:100%;will-change:transform}
    .cs-slide{flex-shrink:0;height:190px;display:flex;gap:2px}
    .cs-fhalf{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#111620}
    .cs-fhalf img{width:100%;height:100%;object-fit:cover;cursor:zoom-in}
    .cs-flabel{position:absolute;bottom:0;left:0;right:0;background:#00000090;padding:4px 7px;font-size:9px;font-weight:600;display:flex;align-items:center;gap:4px}
    .cs-flabel.conc{color:#fbbf24}
    .cs-flabel.meu{color:var(--ac)}
    .cs-foto-ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;width:100%;height:100%}
    .cs-foto-ph svg{opacity:.2}
    .cs-foto-ph span{font-size:8px;color:var(--tx3)}
    .cs-fdrive{position:absolute;top:5px;right:5px;background:#00000080;border-radius:4px;padding:2px 6px;font-size:9px;color:#60a5fa;text-decoration:none}
    .cs-arr{position:absolute;top:50%;transform:translateY(-50%);z-index:5;background:#00000060;border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;cursor:pointer}
    .cs-arr:hover{background:#00000090}
    .cs-arr-l{left:5px}
    .cs-arr-r{right:5px}
    .cs-hint{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#00000075;border-radius:7px;padding:4px 10px;font-size:9px;color:#ffffffa0;pointer-events:none;white-space:nowrap;transition:opacity .4s}
    /* dots + nome do slide atual */
    .cs-dots-row{display:flex;align-items:center;justify-content:center;gap:6px;padding:5px 10px;background:#0a0d12;min-height:26px}
    .cs-dot{width:5px;height:5px;border-radius:50%;background:var(--sf2);transition:all .2s;cursor:pointer;flex-shrink:0}
    .cs-dot.on{background:var(--ac);width:14px;border-radius:3px}
    #cs-slide-lbl{font-size:9px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}

    /* ── DADOS ── */
    #cs-dados{flex:1;overflow-y:auto;overflow-x:hidden}
    .cs-alerta{background:rgba(255,77,109,.07);border-bottom:1px solid rgba(255,77,109,.2);padding:7px 12px;font-size:11px;color:#fca5a5;line-height:1.5;display:flex;gap:6px}
    .cs-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--bd)}
    .cs-toggle-lbl{font-size:10px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
    .cs-toggle-btns{display:flex;gap:4px}
    .cs-tbtn{background:var(--sf2);border:1px solid var(--bd);border-radius:5px;padding:3px 10px;font-size:10px;color:var(--tx3);cursor:pointer}
    .cs-tbtn.on{background:var(--acd);border-color:var(--ac);color:var(--ac);font-weight:600}
    .cs-preco-table{width:100%;border-collapse:collapse;font-size:12px}
    .cs-preco-table thead th{font-size:9px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:7px 10px;text-align:left;border-bottom:1px solid var(--bd);background:var(--sf);position:sticky;top:0;z-index:1;white-space:nowrap}
    .cs-preco-table thead th:last-child{text-align:right}
    .cs-preco-table td{padding:9px 10px;border-bottom:0.5px solid var(--sf2);vertical-align:middle}
    .cs-tr-ok td{background:rgba(0,229,160,.05)}
    .cs-tr-bad td{background:rgba(255,77,109,.06)}
    .cs-tr-eq td{background:rgba(233,179,65,.04)}
    .cs-fuel-nm{font-size:12px;color:var(--tx);font-weight:500}
    .cs-v-conc,.cs-v-meu{font-size:13px;font-weight:600;color:var(--tx)}
    .cs-diff-col{text-align:right}
    .cs-dif-ok{color:#4ade80;font-weight:600;font-size:12px}
    .cs-dif-bad{color:#f87171;font-weight:600;font-size:12px}
    .cs-dif-eq{color:#e3b341;font-weight:600;font-size:12px}
    .cs-dif-sub{font-size:9px;color:var(--tx3);display:block;margin-top:1px}
    .cs-delta{font-size:9px;display:block;margin-top:1px}
    .cs-delta-up{color:#4ade80}
    .cs-delta-dn{color:#f87171}
    .cs-delta-eq{color:var(--tx3)}

    /* ── AÇÕES ── */
    #cs-acoes{background:var(--sf);border-top:1px solid var(--bd);padding:10px 12px;display:flex;gap:8px;flex-shrink:0}
    .cs-btn-ant{background:var(--sf2);color:var(--tx);border:none;border-radius:8px;padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;flex:1}
    .cs-btn-flag{background:rgba(255,77,109,.08);color:#f85149;border:1px solid rgba(248,81,73,.3);border-radius:8px;padding:10px 12px;font-size:13px;cursor:pointer}
    .cs-btn-ok{background:var(--ac);color:#0d1117;border:none;border-radius:8px;padding:10px 0;font-size:12px;font-weight:600;cursor:pointer;flex:2}
    .cs-btn-ok:active{opacity:.85}

    /* zoom */
    #cs-zoom{position:fixed;inset:0;background:#000000dd;z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;display:none}
    #cs-zoom img{max-width:95vw;max-height:90vh;border-radius:8px;object-fit:contain}

    .cs-estado{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:10px;color:var(--tx3);font-size:13px;padding:40px 0}
    .cs-spin{width:26px;height:26px;border:2px solid var(--sf2);border-top-color:var(--ac);border-radius:50%;animation:cspin .8s linear infinite}
    @keyframes cspin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(s);
})();

// ── Ponto de entrada ──────────────────────────────────────────────
function renderColetaSimples(ctx) {
  CS_CTX = ctx;
  CS_POSTO_IDX = -1;
  CS_CONC_IDX  = 0;
  CS_FILTRO_SUP = '';
  CS_MODO_DIFF  = 'hoje';
  csHintShown   = false;

  ctx.innerHTML = `
    <div id="cs-shell">
      <div id="cs-topbar">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="color:var(--ac);font-weight:600;font-size:13px">Coleta de Preços</span>
          <span class="cs-chip">Data: <b id="cs-data">—</b></span>
          <span class="cs-chip"><b id="cs-qtd-postos">—</b> postos</span>
        </div>
      </div>
      <div id="cs-prog"><div id="cs-prog-fill" style="width:0%"></div></div>
      <div id="cs-filtros">
        <select class="cs-sel" id="cs-flt-sup" onchange="csAplicarFiltros()">
          <option value="">Todos supervisores</option>
        </select>
        <span class="cs-pill active" id="cspill-todos" onclick="csSetPill('todos',this)">Todos</span>
        <span class="cs-pill" id="cspill-pend"  onclick="csSetPill('pend',this)">⏳ Pendentes</span>
        <span class="cs-pill" id="cspill-ok"    onclick="csSetPill('ok',this)">✓ Ok</span>
        <span class="cs-pill danger" id="cspill-flag" onclick="csSetPill('flag',this)">⚠ Margem</span>
        <select class="cs-sel" id="cs-flt-dias" onchange="csCarregar()">
          <option value="1" selected>Hoje</option>
          <option value="3">3 dias</option>
          <option value="7">7 dias</option>
          <option value="15">15 dias</option>
        </select>
      </div>

      <!-- LISTA DOS 37 POSTOS -->
      <div id="cs-lista">
        <div class="cs-estado"><div class="cs-spin"></div>Carregando...</div>
      </div>

      <!-- DETALHE: concorrentes do posto em swipe -->
      <div id="cs-detalhe">
        <div id="cs-dhdr">
          <div class="cs-nav-row">
            <button class="cs-btn-back" onclick="csVoltarLista()">← Postos</button>
            <span class="cs-counter" id="cs-counter"></span>
            <button class="cs-btn-nav" onclick="csPosAnterior()">‹ Posto ant.</button>
            <button class="cs-btn-nav" onclick="csPosProximo()">Próximo posto ›</button>
          </div>
          <!-- Nome do posto próprio (fixo) -->
          <div class="cs-dtitle">
            <span id="cs-d-posto">—</span>
            <span class="cs-badge" id="cs-d-badge">pendente</span>
          </div>
          <!-- Nome do concorrente atual (muda com o slide) -->
          <div id="cs-d-conc-nome">—</div>
          <div class="cs-dsub">Supervisor: <span id="cs-d-sup">—</span> · <span id="cs-d-data">—</span></div>
          <div class="cs-meta-row">
            <div class="cs-mc">👤 <b id="cs-d-ger">—</b></div>
            <div class="cs-mc">🕐 <b id="cs-d-hora">—</b></div>
            <div class="cs-mc" id="cs-d-concs-total">—</div>
          </div>
        </div>

        <!-- fotos: concorrente | meu posto -->
        <div class="cs-fotos-outer" id="cs-fotos-outer">
          <div class="cs-fotos-wrap" id="cs-fotos-wrap">
            <div class="cs-fotos-track" id="cs-fotos-track"></div>
            <div class="cs-hint" id="cs-hint">← arrasta para ver próximo concorrente →</div>
          </div>
          <button class="cs-arr cs-arr-l" id="cs-arr-l" onclick="csConcNav(-1)">‹</button>
          <button class="cs-arr cs-arr-r" id="cs-arr-r" onclick="csConcNav(1)">›</button>
        </div>
        <!-- dots + nome do concorrente em miniatura -->
        <div class="cs-dots-row" id="cs-dots-row">
          <span id="cs-slide-lbl"></span>
        </div>

        <div id="cs-dados">
          <div class="cs-alerta" id="cs-alerta" style="display:none">
            <span>⚠</span><div id="cs-alerta-txt"></div>
          </div>
          <div class="cs-toggle-row">
            <span class="cs-toggle-lbl">Diferença calculada</span>
            <div class="cs-toggle-btns">
              <button class="cs-tbtn on" id="cs-tbtn-hoje"  onclick="csSetToggle('hoje')">vs Hoje</button>
              <button class="cs-tbtn"    id="cs-tbtn-ontem" onclick="csSetToggle('ontem')">vs Ontem</button>
            </div>
          </div>
          <table class="cs-preco-table">
            <thead>
              <tr>
                <th>Combustível</th>
                <th>Concorrente</th>
                <th>Meu</th>
                <th style="text-align:right">Diferença</th>
              </tr>
            </thead>
            <tbody id="cs-tbody"></tbody>
          </table>
        </div>

        <div id="cs-acoes">
          <button class="cs-btn-ant"  onclick="csPosAnterior()">← Posto ant.</button>
          <button class="cs-btn-flag" onclick="csSinalizar()" title="Sinalizar">⚠</button>
          <button class="cs-btn-ok"   onclick="csConfirmar()">✓ Ok e próximo posto</button>
        </div>
      </div>
    </div>
    <div id="cs-zoom" onclick="this.style.display='none'"><img id="cs-zoom-img" src="" alt="Zoom"></div>
  `;

  csIniciarSwipe();
  csCarregar();
}

// ── Carregamento ──────────────────────────────────────────────────
async function csCarregar() {
  const diasEl = document.getElementById('cs-flt-dias');
  const dias   = diasEl ? parseInt(diasEl.value) : 1;
  const listaEl = document.getElementById('cs-lista');
  if (listaEl) listaEl.innerHTML = '<div class="cs-estado"><div class="cs-spin"></div>Carregando...</div>';

  try {
    const [rHoje, rOntem] = await Promise.all([
      fetch(API_URL + '?tipo=coletaRecentes&dias=' + dias),
      fetch(API_URL + '?tipo=coletaRecentes&dias=' + (dias + 1)),
    ]);
    const jH = await rHoje.json();
    const jO = await rOntem.json();

    const regsHoje  = jH.registros  || jH.data  || [];
    const regsOntem = jO.registros  || jO.data  || [];

    CS_REGISTROS = regsHoje.map((r, i) => ({ ...csNorm(r), _id: i }));
    const ontemNorm = regsOntem.map(r => csNorm(r));

    // ── Mapa preços próprios hoje ──
    CS_MEU_HOJE = {};
    CS_REGISTROS.filter(r => r.Tipo === 'Próprio' || r.Tipo === 'Proprio').forEach(r => {
      const k = csChave(r.PostoAlvo || r.Posto);
      if (!CS_MEU_HOJE[k]) CS_MEU_HOJE[k] = {};
      ['GC','ET','GA','S10','S500'].forEach(f => { if (r[f] !== null) CS_MEU_HOJE[k][f] = r[f]; });
      if (r.Foto) CS_MEU_HOJE[k]._fotoMeu = r.Foto;
      if (r.Gerente)    CS_MEU_HOJE[k]._gerente    = r.Gerente;
      if (r.Supervisor) CS_MEU_HOJE[k]._supervisor = r.Supervisor;
      if (r.Data)       CS_MEU_HOJE[k]._data       = r.Data;
      if (r.Hora)       CS_MEU_HOJE[k]._hora       = r.Hora;
    });

    // ── Mapa preços próprios ontem ──
    CS_MEU_ONTEM = {};
    const datasExtra = [...new Set(ontemNorm.map(r => r.Data))].sort();
    const dataOntemStr = datasExtra[0] || null;
    if (dataOntemStr) {
      ontemNorm.filter(r => r.Data === dataOntemStr && (r.Tipo === 'Próprio' || r.Tipo === 'Proprio')).forEach(r => {
        const k = csChave(r.PostoAlvo || r.Posto);
        if (!CS_MEU_ONTEM[k]) CS_MEU_ONTEM[k] = {};
        ['GC','ET','GA','S10','S500'].forEach(f => { if (r[f] !== null) CS_MEU_ONTEM[k][f] = r[f]; });
      });
    }

    // ── Agrupa concorrentes por posto próprio ──
    // Usa POSTOS_DADOS (config.js) como fonte dos 37 postos — garante que todos aparecem
    const concorrentes = CS_REGISTROS.filter(r => !(r.Tipo === 'Próprio' || r.Tipo === 'Proprio'));

    CS_POSTOS = Object.keys(POSTOS_DADOS).sort().map(postoKey => {
      const meu   = CS_MEU_HOJE[postoKey] || {};
      const concs = concorrentes.filter(r => csChave(r.Posto) === postoKey || csChave(r.Posto).includes(postoKey));
      const pdInfo = POSTOS_DADOS[postoKey] || {};
      return {
        key:       postoKey,
        nome:      'P. ' + postoKey,
        sup:       pdInfo.sup || meu._supervisor || '',
        gerente:   meu._gerente    || '',
        data:      meu._data       || '',
        hora:      meu._hora       || '',
        fotoMeu:   meu._fotoMeu    || '',
        meuPreco:  meu,
        concs:     concs,
        qtdConcs:  concs.length,
        temColeta: concs.length > 0 || Object.keys(meu).filter(k => !k.startsWith('_')).length > 0,
      };
    });

    CS_ESTADOS = {};
    CS_POSTOS.forEach(p => { CS_ESTADOS[p.key] = 'pend'; });

    csPopularFiltros();
    csAplicarFiltros();

    // data mais recente
    const datas = [...new Set(CS_REGISTROS.map(r => r.Data))];
    const dataEl = document.getElementById('cs-data');
    if (dataEl) dataEl.textContent = datas[datas.length - 1] || '—';

  } catch (e) {
    const listaEl = document.getElementById('cs-lista');
    if (listaEl) listaEl.innerHTML = `<div class="cs-estado">
      <span style="color:#f87171">⚠ Erro ao carregar</span>
      <span style="font-size:11px">${e.message}</span>
      <button onclick="csCarregar()" style="background:var(--sf2);border:none;border-radius:6px;color:var(--tx);padding:6px 12px;font-size:12px;cursor:pointer">↻ Tentar novamente</button>
    </div>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function csNorm(r) {
  const n = {};
  for (const k in r) n[k.trim()] = r[k];
  return {
    Data: n.data||n.Data||'', Hora: n.hora||n.Hora||'',
    Posto: n.posto||n.Posto||n['Posto (Gerente)']||'',
    Gerente: n.gerente||n.Gerente||'',
    PostoAlvo: n.postoAlvo||n.PostoAlvo||n['Posto Alvo']||'',
    Tipo: n.tipo||n.Tipo||'', Bandeira: n.bandeira||n.Bandeira||'',
    Supervisor: n.supervisor||n.Supervisor||'',
    ET: csPf(n.ET||n.et), GC: csPf(n.GC||n.gc), GA: csPf(n.GA||n.ga),
    S10: csPf(n.S10||n.s10), S500: csPf(n.S500||n.s500),
    Foto: n.foto||n.Foto||'',
  };
}
function csPf(v) {
  if (v===null||v===undefined||v===''||v==='-') return null;
  const n = parseFloat(String(v).replace(',','.'));
  return isNaN(n) ? null : n;
}
function csChave(nome) {
  return (nome||'').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // remove acentos: LÚCIA→LUCIA, Ã→A etc
    .replace(/^P\.\s*/,'').replace(/\s+/g,' ');
}
function csFmt(v) {
  if (v===null||v===undefined) return '—';
  return parseFloat(v).toFixed(2).replace('.',',');
}
function csDriveId(url) {
  if (!url) return null;
  let m;
  m = url.match(/\/file\/d\/([^\/\?]+)/); if (m) return m[1];
  m = url.match(/\/d\/([^\/\?]+)/);       if (m) return m[1];
  m = url.match(/[?&]id=([^&]+)/);        if (m) return m[1];
  m = url.match(/lh3\.googleusercontent\.com\/d\/([^=\?\/]+)/); if (m) return m[1];
  return null;
}
function csCorBanda(b) {
  if (!b) return {bg:'var(--sf2)',txt:'var(--tx3)'};
  const bl = b.toLowerCase();
  if (bl.includes('shell'))    return {bg:'#92600020',txt:'#fcd34d'};
  if (bl.includes('ipiranga')) return {bg:'#d6400020',txt:'#f87171'};
  if (bl.includes('br')||bl.includes('petrobras')) return {bg:'#00562020',txt:'#4ade80'};
  if (bl.includes('ale'))      return {bg:'#1e3a8a20',txt:'#93c5fd'};
  return {bg:'var(--sf2)',txt:'var(--tx2)'};
}

// ── Filtros ───────────────────────────────────────────────────────
function csPopularFiltros() {
  const sups = [...new Set(CS_POSTOS.map(p => p.sup).filter(Boolean))].sort();
  const el = document.getElementById('cs-flt-sup');
  if (el) el.innerHTML = '<option value="">Todos supervisores</option>' + sups.map(s=>`<option>${s}</option>`).join('');
}

function csAplicarFiltros() {
  const sup = (document.getElementById('cs-flt-sup')||{}).value || '';
  CS_FILTRO_SUP = sup;
  CS_FILTRADOS = CS_POSTOS.filter(p => {
    if (sup && p.sup !== sup) return false;
    const est = CS_ESTADOS[p.key] || 'pend';
    if (window._csPillAtivo === 'pend' && est !== 'pend') return false;
    if (window._csPillAtivo === 'ok'   && est !== 'ok')   return false;
    if (window._csPillAtivo === 'flag' && est !== 'flag') return false;
    return true;
  });
  csRenderLista();
  csAtualizarProg();
}

function csSetPill(tipo, el) {
  window._csPillAtivo = tipo;
  document.querySelectorAll('.cs-pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  csAplicarFiltros();
}

// ── Lista dos 37 postos ───────────────────────────────────────────
function csRenderLista() {
  const el = document.getElementById('cs-lista');
  if (!el) return;

  const qtdEl = document.getElementById('cs-qtd-postos');
  if (qtdEl) qtdEl.textContent = CS_FILTRADOS.length;

  if (!CS_FILTRADOS.length) {
    el.innerHTML = '<div class="cs-estado">Nenhum posto encontrado</div>';
    return;
  }

  el.innerHTML = CS_FILTRADOS.map((p, i) => {
    const est = CS_ESTADOS[p.key] || 'pend';
    const sdCls = est==='ok' ? 'cs-sd-ok' : est==='flag' ? 'cs-sd-flag' : 'cs-sd-pend';
    const liCls = est==='ok' ? 'cs-ok' : est==='flag' ? 'cs-flag' : '';
    const icon  = p.temColeta ? '📍' : '⏳';
    const pdInfo = POSTOS_DADOS[p.key] || {};
    const bc = csCorBanda(pdInfo.bandeira || '');
    return `<div class="cs-posto-item ${liCls}" onclick="csAbrirPosto(${i})">
      <div class="cs-posto-icon">${icon}</div>
      <div class="cs-posto-body">
        <div class="cs-posto-nome">${p.nome}</div>
        <div class="cs-posto-sub">
          <span style="color:var(--ac);font-size:10px">${p.sup}</span>
          <span class="cs-band-pill" style="background:${bc.bg};color:${bc.txt}">${pdInfo.bandeira||''}</span>
        </div>
      </div>
      <div class="cs-posto-right">
        <span class="cs-qtd-badge">${p.qtdConcs} conc.</span>
        <span class="cs-sd ${sdCls}"></span>
      </div>
    </div>`;
  }).join('');
}

// ── Detalhe do posto ──────────────────────────────────────────────
function csAbrirPosto(i) {
  CS_POSTO_IDX = i;
  CS_CONC_IDX  = 0;
  const lista   = document.getElementById('cs-lista');
  const detalhe = document.getElementById('cs-detalhe');
  if (lista)   lista.style.display   = 'none';
  if (detalhe) { detalhe.style.display = 'flex'; detalhe.classList.add('cs-on'); }
  csRenderDetalhe();
}

function csVoltarLista() {
  CS_POSTO_IDX = -1;
  const lista   = document.getElementById('cs-lista');
  const detalhe = document.getElementById('cs-detalhe');
  if (detalhe) { detalhe.style.display = 'none'; detalhe.classList.remove('cs-on'); }
  if (lista)   lista.style.display   = 'flex';
  csRenderLista();
}

function csRenderDetalhe() {
  if (CS_POSTO_IDX < 0 || CS_POSTO_IDX >= CS_FILTRADOS.length) return;
  const posto = CS_FILTRADOS[CS_POSTO_IDX];

  // contador de postos
  const counter = document.getElementById('cs-counter');
  if (counter) counter.textContent = 'Posto ' + (CS_POSTO_IDX+1) + ' / ' + CS_FILTRADOS.length;

  // nome do posto (título fixo)
  const dPostoEl = document.getElementById('cs-d-posto');
  if (dPostoEl) dPostoEl.textContent = posto.nome;

  // supervisor / data
  const dSupEl = document.getElementById('cs-d-sup');
  if (dSupEl) dSupEl.textContent = posto.sup || '—';
  const dDataEl = document.getElementById('cs-d-data');
  if (dDataEl) dDataEl.textContent = posto.data || '—';

  // gerente / hora
  const dGerEl  = document.getElementById('cs-d-ger');
  if (dGerEl) dGerEl.textContent = posto.gerente || '—';
  const dHoraEl = document.getElementById('cs-d-hora');
  if (dHoraEl) dHoraEl.textContent = posto.hora || '—';

  // total de concorrentes
  const totEl = document.getElementById('cs-d-concs-total');
  if (totEl) totEl.innerHTML = `📋 <b>${posto.qtdConcs} concorrente(s)</b>`;

  // badge estado
  const est   = CS_ESTADOS[posto.key] || 'pend';
  const badge = document.getElementById('cs-d-badge');
  if (badge) {
    badge.textContent = est==='ok' ? '✓ ok' : est==='flag' ? '⚠ sinalizado' : 'pendente';
    badge.className   = 'cs-badge ' + (est==='ok' ? 'cs-badge-ok' : est==='flag' ? 'cs-badge-flag' : 'cs-badge-pend');
  }

  // monta carrossel com os concorrentes do posto
  csConstruirCarrossel(posto);
  csAtualizarCarrossel(false);
  csRenderPrecos();
}

// ── Carrossel de concorrentes ─────────────────────────────────────
function csConstruirCarrossel(posto) {
  const wrap  = document.getElementById('cs-fotos-wrap');
  const track = document.getElementById('cs-fotos-track');
  if (!wrap || !track) return;
  const W = wrap.offsetWidth || window.innerWidth;

  if (!posto.concs.length) {
    // sem coleta hoje — mostra só foto do meu posto
    track.innerHTML = `<div class="cs-slide" style="width:${W}px">
      <div class="cs-fhalf" style="background:#0a0d12;justify-content:center;flex-direction:column;align-items:center;gap:8px">
        <span style="font-size:30px">⏳</span>
        <span style="font-size:12px;color:var(--tx3)">Sem coleta de concorrentes hoje</span>
      </div>
      <div class="cs-fhalf" style="border-left:1px solid rgba(0,229,160,.2)">
        ${csFotoHalfInner(posto.fotoMeu,'meu',posto.nome)}
      </div>
    </div>`;
    const dotsRow = document.getElementById('cs-dots-row');
    if (dotsRow) dotsRow.innerHTML = '<span id="cs-slide-lbl" style="font-size:9px;color:var(--tx3)">0 concorrentes coletados</span>';
    const al = document.getElementById('cs-arr-l');
    const ar = document.getElementById('cs-arr-r');
    if (al) al.style.display = 'none';
    if (ar) ar.style.display = 'none';
    return;
  }

  track.innerHTML = posto.concs.map((conc, i) => {
    const label = (conc.PostoAlvo || '—').substring(0, 20);
    return `<div class="cs-slide" style="width:${W}px">
      ${csFotoHalf(conc.Foto,'conc', conc.PostoAlvo||'Concorrente')}
      <div class="cs-fhalf" style="border-left:1px solid rgba(0,229,160,.2)">
        ${csFotoHalfInner(posto.fotoMeu,'meu',posto.nome)}
      </div>
    </div>`;
  }).join('');

  // dots com nome abreviado
  const dotsRow = document.getElementById('cs-dots-row');
  if (dotsRow) {
    const dotsHtml = posto.concs.map((_,i)=>
      `<div class="cs-dot${i===CS_CONC_IDX?' on':''}" onclick="csConcGoTo(${i})"></div>`
    ).join('');
    const nomeConcAtual = (posto.concs[CS_CONC_IDX] && posto.concs[CS_CONC_IDX].PostoAlvo) || '—';
    dotsRow.innerHTML = dotsHtml + `<span id="cs-slide-lbl">${nomeConcAtual}</span>`;
  }

  const al = document.getElementById('cs-arr-l');
  const ar = document.getElementById('cs-arr-r');
  if (al) al.style.display = posto.concs.length > 1 ? 'flex' : 'none';
  if (ar) ar.style.display = posto.concs.length > 1 ? 'flex' : 'none';

  // hint
  const hint = document.getElementById('cs-hint');
  if (hint) {
    hint.style.opacity = (posto.concs.length > 1 && !csHintShown) ? '1' : '0';
    if (posto.concs.length > 1 && !csHintShown) {
      setTimeout(() => { const h=document.getElementById('cs-hint'); if(h) h.style.opacity='0'; csHintShown=true; }, 1800);
    }
  }

  // nome do concorrente no cabeçalho
  csAtualizarNomeConc();
}

function csAtualizarNomeConc() {
  if (CS_POSTO_IDX < 0 || CS_POSTO_IDX >= CS_FILTRADOS.length) return;
  const posto = CS_FILTRADOS[CS_POSTO_IDX];
  const conc  = posto.concs[CS_CONC_IDX];
  const nomeEl = document.getElementById('cs-d-conc-nome');
  if (nomeEl) {
    if (conc) {
      const bc = csCorBanda(conc.Bandeira);
      nomeEl.innerHTML = `${conc.PostoAlvo||'—'} <span class="cs-band-pill" style="background:${bc.bg};color:${bc.txt}">${conc.Bandeira||''}</span>`;
    } else {
      nomeEl.textContent = 'Sem concorrentes coletados';
    }
  }
}

function csAtualizarCarrossel(animate) {
  const wrap  = document.getElementById('cs-fotos-wrap');
  const track = document.getElementById('cs-fotos-track');
  if (!wrap || !track) return;
  const W = wrap.offsetWidth || window.innerWidth;
  track.style.transition = animate ? 'transform .28s cubic-bezier(.4,0,.2,1)' : 'none';
  track.style.transform  = `translateX(${-CS_CONC_IDX * W}px)`;

  // dots
  document.querySelectorAll('.cs-dot').forEach((d,i) => d.classList.toggle('on', i===CS_CONC_IDX));

  // nome no label dos dots
  if (CS_POSTO_IDX >= 0 && CS_POSTO_IDX < CS_FILTRADOS.length) {
    const posto = CS_FILTRADOS[CS_POSTO_IDX];
    const nomeConcAtual = (posto.concs[CS_CONC_IDX] && posto.concs[CS_CONC_IDX].PostoAlvo) || '';
    const lbl = document.getElementById('cs-slide-lbl');
    if (lbl) lbl.textContent = nomeConcAtual;
  }

  const al = document.getElementById('cs-arr-l');
  const ar = document.getElementById('cs-arr-r');
  if (CS_POSTO_IDX >= 0 && CS_POSTO_IDX < CS_FILTRADOS.length) {
    const n = CS_FILTRADOS[CS_POSTO_IDX].concs.length;
    if (al) al.style.opacity = CS_CONC_IDX===0 ? '.3' : '1';
    if (ar) ar.style.opacity = CS_CONC_IDX>=n-1 ? '.3' : '1';
  }
}

function csConcGoTo(i) {
  if (CS_POSTO_IDX < 0 || CS_POSTO_IDX >= CS_FILTRADOS.length) return;
  const n = CS_FILTRADOS[CS_POSTO_IDX].concs.length;
  CS_CONC_IDX = Math.max(0, Math.min(n-1, i));
  csAtualizarCarrossel(true);
  csAtualizarNomeConc(); // ← atualiza o nome no cabeçalho
  csRenderPrecos();
}

function csConcNav(dir) { csConcGoTo(CS_CONC_IDX + dir); }

// ── Swipe touch + mouse ───────────────────────────────────────────
function csIniciarSwipe() {
  document.addEventListener('touchstart',  csOnTS, {passive:true});
  document.addEventListener('touchmove',   csOnTM, {passive:true});
  document.addEventListener('touchend',    csOnTE);
  document.addEventListener('mousedown',   csOnMS);
  document.addEventListener('mousemove',   csOnMM);
  document.addEventListener('mouseup',     csOnME);
  document.addEventListener('mouseleave',  csOnME);
}
function csIsInWrap(e) {
  const w = document.getElementById('cs-fotos-wrap');
  return w && w.contains(e.target);
}
function csApplyDrag(delta) {
  const wrap = document.getElementById('cs-fotos-wrap');
  const track = document.getElementById('cs-fotos-track');
  if (!wrap||!track) return;
  track.style.transition = 'none';
  track.style.transform = `translateX(${-CS_CONC_IDX*(wrap.offsetWidth||window.innerWidth)+delta}px)`;
}
function csFinishDrag() {
  if (Math.abs(csDelta) > 50) csConcNav(csDelta < 0 ? 1 : -1);
  else csAtualizarCarrossel(true);
  csDelta = 0;
}
function csOnTS(e){if(!csIsInWrap(e))return;csSX=e.touches[0].clientX;csDragging=true;}
function csOnTM(e){if(!csDragging||!csIsInWrap(e))return;csDelta=e.touches[0].clientX-csSX;csApplyDrag(csDelta);}
function csOnTE(){if(!csDragging)return;csDragging=false;csFinishDrag();}
function csOnMS(e){if(!csIsInWrap(e))return;csSX=e.clientX;csDragging=true;}
function csOnMM(e){if(!csDragging)return;csDelta=e.clientX-csSX;csApplyDrag(csDelta);}
function csOnME(){if(!csDragging)return;csDragging=false;csFinishDrag();}

// ── Foto helpers ──────────────────────────────────────────────────
function csFotoHalf(url, tipo, labelTxt) {
  return `<div class="cs-fhalf">${csFotoHalfInner(url,tipo,labelTxt)}</div>`;
}
function csFotoHalfInner(url, tipo, labelTxt) {
  const id      = csDriveId(url);
  const thumb   = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w600` : null;
  const driveUrl= id ? `https://drive.google.com/file/d/${id}/view` : null;
  const lblCls  = tipo==='conc' ? 'cs-flabel conc' : 'cs-flabel meu';
  const icon    = tipo==='conc' ? '📷' : '🏠';
  const short   = (labelTxt||'').substring(0,18);
  const strokeC = tipo==='meu' ? 'rgba(0,229,160,.3)' : '#8b949e';
  const phColor = tipo==='meu' ? 'rgba(0,229,160,.5)' : 'var(--tx3)';
  if (thumb) {
    return `<img src="${thumb}" alt="${labelTxt}" onclick="csZoom('${thumb}')"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="cs-foto-ph" style="display:none">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${strokeC}" stroke-width="1.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span style="color:${phColor}">Drive bloqueou</span>
              ${driveUrl?`<a href="${driveUrl}" target="_blank" style="color:#60a5fa;font-size:10px">↗ Abrir</a>`:''}
            </div>
            <div class="${lblCls}">${icon} ${short}</div>
            ${driveUrl?`<a class="cs-fdrive" href="${driveUrl}" target="_blank">↗ Drive</a>`:''}`;
  }
  return `<div class="cs-foto-ph">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${strokeC}" stroke-width="1.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
    <span style="color:${phColor}">sem foto</span>
  </div>
  <div class="${lblCls}">${icon} ${short}</div>`;
}

// ── Tabela de preços ──────────────────────────────────────────────
function csSetToggle(modo) {
  CS_MODO_DIFF = modo;
  const bh = document.getElementById('cs-tbtn-hoje');
  const bo = document.getElementById('cs-tbtn-ontem');
  if (bh) bh.classList.toggle('on', modo==='hoje');
  if (bo) bo.classList.toggle('on', modo==='ontem');
  csRenderPrecos();
}

function csRenderPrecos() {
  if (CS_POSTO_IDX < 0 || CS_POSTO_IDX >= CS_FILTRADOS.length) return;
  const posto = CS_FILTRADOS[CS_POSTO_IDX];
  const conc  = posto.concs[CS_CONC_IDX] || null;

  const meuHoje  = CS_MEU_HOJE[posto.key]  || {};
  const meuOntem = CS_MEU_ONTEM[posto.key] || {};
  const meuBase  = CS_MODO_DIFF==='hoje' ? meuHoje : meuOntem;

  if (!conc) {
    const tbody = document.getElementById('cs-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="padding:16px;text-align:center;opacity:.4">Sem concorrentes coletados para este posto hoje</td></tr>`;
    const ab = document.getElementById('cs-alerta');
    if (ab) ab.style.display = 'none';
    return;
  }

  const alertas = [];
  let html = '';

  ['GC','ET','GA','S10','S500'].forEach(k => {
    const concVal = conc[k];
    if (concVal===null||concVal===undefined) return;
    const meuVal   = meuBase[k]!==undefined  ? meuBase[k]  : null;
    const meuHojeV = meuHoje[k]!==undefined  ? meuHoje[k]  : null;
    let rowCls='', diffHtml='', deltaHtml='';

    if (meuVal!==null) {
      const d = meuVal - concVal;
      if (d > 0.005) {
        rowCls   = 'cs-tr-bad';
        diffHtml = `<span class="cs-dif-bad">▲ ${csFmt(Math.abs(d))}</span><span class="cs-dif-sub">eu mais caro</span>`;
        alertas.push(`${CS_FUEL_NAMES[k]||k}: conc. R$${csFmt(concVal)} vs meu R$${csFmt(meuVal)}`);
      } else if (d < -0.005) {
        rowCls   = 'cs-tr-ok';
        diffHtml = `<span class="cs-dif-ok">▼ ${csFmt(Math.abs(d))}</span><span class="cs-dif-sub">eu mais barato</span>`;
      } else {
        rowCls   = 'cs-tr-eq';
        diffHtml = `<span class="cs-dif-eq">= igual</span>`;
      }
      if (CS_MODO_DIFF==='ontem' && meuHojeV!==null && meuOntem[k]!==undefined) {
        const delta = meuHojeV - meuOntem[k];
        if (Math.abs(delta)>=0.005) {
          const cls  = delta>0 ? 'cs-delta-up' : 'cs-delta-dn';
          const seta = delta>0 ? '↑' : '↓';
          deltaHtml = `<span class="cs-delta ${cls}">${seta} ${Math.abs(delta).toFixed(2).replace('.',',')} vs ontem</span>`;
        } else {
          deltaHtml = `<span class="cs-delta cs-delta-eq">= sem mudança</span>`;
        }
      }
    } else {
      diffHtml = `<span class="cs-dif-eq" style="opacity:.4">—</span>`;
    }

    html += `<tr class="${rowCls}">
      <td><span class="cs-fuel-nm">${CS_FUEL_NAMES[k]||k}</span></td>
      <td><span class="cs-v-conc">R$${csFmt(concVal)}</span></td>
      <td>${meuVal!==null?`<span class="cs-v-meu">R$${csFmt(meuVal)}</span>${deltaHtml}`:'<span style="opacity:.4">—</span>'}</td>
      <td class="cs-diff-col">${diffHtml}</td>
    </tr>`;
  });

  const tbody = document.getElementById('cs-tbody');
  if (tbody) tbody.innerHTML = html || `<tr><td colspan="4" style="padding:14px;text-align:center;opacity:.4">Sem preços</td></tr>`;

  const ab  = document.getElementById('cs-alerta');
  const abt = document.getElementById('cs-alerta-txt');
  if (ab&&abt) {
    if (alertas.length) { abt.innerHTML = alertas.join(' · '); ab.style.display='flex'; }
    else ab.style.display='none';
  }
}

// ── Ações ─────────────────────────────────────────────────────────
function csConfirmar() {
  if (CS_POSTO_IDX<0) return;
  CS_ESTADOS[CS_FILTRADOS[CS_POSTO_IDX].key] = 'ok';
  csAtualizarProg();
  if (CS_POSTO_IDX < CS_FILTRADOS.length-1) { CS_POSTO_IDX++; CS_CONC_IDX=0; csRenderDetalhe(); }
  else csVoltarLista();
}
function csSinalizar() {
  if (CS_POSTO_IDX<0) return;
  CS_ESTADOS[CS_FILTRADOS[CS_POSTO_IDX].key] = 'flag';
  csAtualizarProg();
  csRenderDetalhe();
}
function csPosProximo()  { if (CS_POSTO_IDX<CS_FILTRADOS.length-1) { CS_POSTO_IDX++; CS_CONC_IDX=0; csRenderDetalhe(); } }
function csPosAnterior() { if (CS_POSTO_IDX>0)                     { CS_POSTO_IDX--; CS_CONC_IDX=0; csRenderDetalhe(); } }
function csAtualizarProg() {
  const tot = CS_POSTOS.length;
  const ok  = CS_POSTOS.filter(p => CS_ESTADOS[p.key]!=='pend').length;
  const el  = document.getElementById('cs-prog-fill');
  if (el) el.style.width = tot>0 ? Math.round(ok/tot*100)+'%' : '0%';
}

// ── Zoom ──────────────────────────────────────────────────────────
function csZoom(src) {
  const z = document.getElementById('cs-zoom');
  const i = document.getElementById('cs-zoom-img');
  if (!z||!i) return;
  i.src = src;
  z.style.display = 'flex';
}
// LOGÍSTICA — resumo do dia (carregarLogistica / salvarPedidosLogistica)
// (mantido para compatibilidade com o HTML que chama essas funções)
// ════════════════════════════════════════════════════════════
let G_LOG_DADOS  = null;
let G_LOG_PEDIDOS = {};

async function carregarLogistica(posto) {
  const empty   = document.getElementById('log-empty');
  const content = document.getElementById('log-content');
  if (!posto) {
    if (empty) { empty.classList.remove('hidden'); empty.textContent = 'Selecione um posto acima para ver o resumo do dia.'; }
    if (content) content.style.display = 'none';
    return;
  }
  if (empty) { empty.classList.remove('hidden'); empty.textContent = 'Carregando dados do posto...'; }
  if (content) content.style.display = 'none';
  G_LOG_PEDIDOS = {};
  try {
    const url  = API_URL + '?tipo=resumoDia&posto=' + encodeURIComponent(posto);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();
    if (!json || !json.success || !json.resumo || json.resumo.erro) {
      if (empty) empty.textContent = (json && json.resumo && json.resumo.erro) || 'Não foi possível carregar os dados.';
      return;
    }
    G_LOG_DADOS = json.resumo;
    if (empty) empty.classList.add('hidden');
    if (content) content.style.display = 'block';
    const nomeEl = document.getElementById('log-posto-nome');
    const dataEl = document.getElementById('log-data-ref');
    if (nomeEl) nomeEl.textContent = G_LOG_DADOS.posto;
    if (dataEl) dataEl.textContent = 'Fechamento de hoje · ' + G_LOG_DADOS.data;
    renderCardsLogistica();
  } catch (e) {
    if (empty) empty.textContent = e.name === 'AbortError' ? 'Tempo esgotado. Tente novamente.' : 'Erro ao carregar dados.';
  }
}

function fmtL(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Math.round(v).toLocaleString('pt-BR') + ' L';
}

function renderCardsLogistica() {
  const cardsEl = document.getElementById('log-cards');
  if (!G_LOG_DADOS || !G_LOG_DADOS.grupos || !G_LOG_DADOS.grupos.length) {
    if (cardsEl) cardsEl.innerHTML = '<div class="empty">Sem grupos de tanque cadastrados para este posto.</div>';
    return;
  }
  cardsEl.innerHTML = G_LOG_DADOS.grupos.map((g) => {
    const diffVal = g.diferencaHoje;
    const diffCor = diffVal === null ? 'var(--tx3)' : (Math.abs(diffVal) <= g.margem ? 'var(--ok)' : 'var(--dg)');
    const diffTxt = diffVal === null ? '—' : (diffVal >= 0 ? '+' : '') + Math.round(diffVal).toLocaleString('pt-BR') + ' L';
    const pctOcup = g.capacidade ? Math.min(100, Math.round(((g.medicaoHoje || 0) / g.capacidade) * 100)) : 0;
    const valorAtualPedido = G_LOG_PEDIDOS[g.combustivel] !== undefined ? G_LOG_PEDIDOS[g.combustivel] : (g.pedidoAmanha !== null ? g.pedidoAmanha : '');
    return `<div class="log-card">
      <div class="log-card-hdr"><div class="log-card-titulo">${g.combustivel}</div><div class="log-card-cap">${(g.capacidade || 0).toLocaleString('pt-BR')} L cap.</div></div>
      <div class="log-barra-wrap"><div class="log-barra"><div class="log-barra-fill" style="width:${pctOcup}%"></div></div><div class="log-barra-lbl">${pctOcup}% do tanque</div></div>
      <div class="log-grid4">
        <div class="log-item"><div class="log-item-lbl">Medição</div><div class="log-item-val">${fmtL(g.medicaoHoje)}</div></div>
        <div class="log-item"><div class="log-item-lbl">Venda hoje</div><div class="log-item-val" style="color:var(--dg)">${fmtL(g.vendaHoje)}</div></div>
        <div class="log-item"><div class="log-item-lbl">Carga hoje</div><div class="log-item-val" style="color:var(--ok)">${fmtL(g.cargaHoje)}</div></div>
        <div class="log-item"><div class="log-item-lbl">Diferença</div><div class="log-item-val" style="color:${diffCor}">${diffTxt}</div></div>
      </div>
      <div class="log-prev-row"><i class="fa-solid fa-chart-line"></i><span>Previsão para amanhã: <strong>${fmtL(g.previsaoAmanha)}</strong></span></div>
      <div class="log-pedido-row">
        <label class="log-pedido-lbl">Pedido para amanhã (L)</label>
        <input type="number" inputmode="numeric" class="log-pedido-input" placeholder="Ex: 5000" value="${valorAtualPedido}"
               oninput="atualizarPedidoLogistica('${g.combustivel.replace(/'/g, "\\'")}', this.value)">
      </div>
    </div>`;
  }).join('');
}

function atualizarPedidoLogistica(combustivel, valor) {
  G_LOG_PEDIDOS[combustivel] = valor === '' ? '' : parseFloat(valor);
}

async function salvarPedidosLogistica() {
  if (!G_LOG_DADOS) return;
  const pedidos = Object.keys(G_LOG_PEDIDOS)
    .filter(k => G_LOG_PEDIDOS[k] !== '' && G_LOG_PEDIDOS[k] !== null && !isNaN(G_LOG_PEDIDOS[k]))
    .map(k => ({ combustivel: k, valor: G_LOG_PEDIDOS[k] }));
  if (!pedidos.length) { showToast('Nada para enviar', 'Preencha ao menos um pedido.'); return; }
  const btn = document.getElementById('log-btn-salvar');
  const txtOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
  try {
    const res  = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ tipo: 'pedido_logistica', posto: G_LOG_DADOS.posto, pedidos, user: (G_USER && G_USER.email) || 'ADM' }) });
    const json = await res.json();
    if (json && json.success !== false) {
      showToast('Pedido enviado ✅', pedidos.length + ' grupo(s) atualizado(s) na planilha.');
      carregarLogistica(G_LOG_DADOS.posto);
    } else {
      showToast('Erro ao enviar', (json && json.message) || 'Tente novamente.');
    }
  } catch (e) {
    showToast('Erro ao enviar', 'Verifique sua conexão.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = txtOriginal; }
  }
}
