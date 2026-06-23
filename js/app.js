// ══════════════════════════════════════════════════
// JBRETAS AppPainel — app.js consolidado (sem duplicatas)
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
    carregarDados();
    iniciarAutoRefresh();
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

function entrar() {
  const email = document.getElementById('inp-email').value.trim();
  const senha = document.getElementById('inp-senha').value.trim();
  const errDiv = document.getElementById('login-erro');
  errDiv.classList.add('hidden');
  const u = USUARIOS_ADM.find(x => x.email.toLowerCase() === email.toLowerCase() && x.senha === senha);
  if (u) {
    G_USER = { email: u.email };
    localStorage.setItem('jb_adm_user', JSON.stringify(G_USER));
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    carregarDados();
  } else {
    errDiv.textContent = 'Credenciais administrativas inválidas.';
    errDiv.classList.remove('hidden');
  }
}

function sair() {
  localStorage.removeItem('jb_adm_user');
  G_USER = null;
  document.getElementById('screen-app').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
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

function fallback(msg) {
  showToast('Modo de Segurança', msg);
  G_DADOS = { prop: {}, conc: {} };
  const agora = new Date().toISOString();
  for (let p in POSTOS_DADOS) {
    G_DADOS.prop[p] = { GC: 5.49, GA: 5.69, ET: 3.59, S10: 5.99, data: agora, responsavel: 'Sistema Local' };
    G_DADOS.conc[p] = {};
    for (let c in POSTOS_DADOS[p].conc) {
      G_DADOS.conc[p][c] = {
        GC: 5.39 + Math.random() * 0.3, GA: 5.59 + Math.random() * 0.3,
        ET: 3.49 + Math.random() * 0.3, S10: 5.89 + Math.random() * 0.3, data: agora
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
  'BEATRIZ': 'PAIVA E PAIVA COMBUSTIVEL',
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
  const selLog = document.getElementById('log-sel-posto');
  if (selLog) {
    const valSalvoLog = selLog.value;
    selLog.innerHTML = '<option value="">Selecione um posto...</option>';
    lista.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      selLog.appendChild(opt);
    });
    if (valSalvoLog && POSTOS_DADOS[valSalvoLog]) selLog.value = valSalvoLog;
  }
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

function renderDist(ctx) {
  ctx.innerHTML = `<div class="sdiv">Preços de Custo Médio FOB Refinaria</div>
    <div class="dcol">
      <div class="dbox"><div class="dbnome">IPIRANGA</div><div class="dbitem"><span>GC</span><span class="dbval">R$ 4.41</span></div><div class="dbitem"><span>ET</span><span class="dbval">R$ 2.89</span></div></div>
      <div class="dbox"><div class="dbnome">SHELL</div><div class="dbitem"><span>GC</span><span class="dbval">R$ 4.44</span></div><div class="dbitem"><span>ET</span><span class="dbval">R$ 2.91</span></div></div>
    </div>`;
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
// ════════════════════════════════════════════════════════════
let LOG_MAT_DADOS       = null;
let LOG_MAT_EDICOES     = {};
let LOG_MAT_POSTO_ATUAL = '';
let LOG_MES_CARREGADO   = '';
let LOG_SUB_ATIVA       = 'medicao';
let LC_TODAS            = [];
let _logAutoRefreshTimer = null;

const LOG_CATEGORIAS = [
  { chave: 'medicao',   titulo: '🛢️ MEDIÇÃO (L)',        cls: 'lh-med',  cor: '#4895ef', edit: true  },
  { chave: 'venda',     titulo: '⛽ VENDA DIÁRIA (L)',    cls: 'lh-ven',  cor: '#d4af37', edit: true  },
  { chave: 'carga',     titulo: '🚚 CARGA RECEBIDA (L)',  cls: 'lh-carg', cor: '#c77dff', edit: true  },
  { chave: 'prePedido', titulo: '📦 PRÉ-PEDIDO (L)',      cls: 'lh-pre',  cor: '#f9c74f', edit: true  },
  { chave: 'pedido',    titulo: '📋 PEDIDO FINAL (L)',    cls: 'lh-ped',  cor: '#ff9e00', edit: true  },
  { chave: 'previsao',  titulo: '📐 PREVISÃO MED. (L)',   cls: 'lh-prev', cor: '#4cc9f0', edit: false },
  { chave: 'diferenca', titulo: 'Δ DIFERENÇA',            cls: 'lh-dif',  cor: '#ff4d6d', edit: false },
];

function logPopularSelects() {
  // Selects já populados no HTML — garante que o value do option bate com o AS
}

function logSwitchSub(sub) {
  LOG_SUB_ATIVA = sub;
  document.querySelectorAll('.log-subtab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('lsubt-' + sub);
  if (btn) btn.classList.add('active');
  const medEl    = document.getElementById('log-sub-medicao');
  const coletaEl = document.getElementById('log-sub-coleta');
  if (medEl)    medEl.style.display    = sub === 'medicao' ? 'flex' : 'none';
  if (coletaEl) coletaEl.style.display = sub === 'coleta'  ? 'flex' : 'none';
  ['btn-log-salvar', 'btn-log-pre'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = sub === 'medicao' ? '' : 'none';
  });
  if (sub === 'coleta' && !LC_TODAS.length) lcCarregar();
}

function logOnPostoChange(posto) {
  LC_TODAS = [];
  carregarLogMatriz(posto);
  if (LOG_SUB_ATIVA === 'coleta') lcCarregar();
}

async function logRefresh() {
  const btn  = document.getElementById('btn-log-refresh');
  const icon = document.getElementById('btn-log-refresh-icon');
  if (btn)  btn.disabled = true;
  if (icon) icon.classList.add('girando');
  try {
    if (LOG_SUB_ATIVA === 'medicao') {
      if (!LOG_MAT_POSTO_ATUAL) return;
      const pendentes = Object.keys(LOG_MAT_EDICOES).length;
      if (pendentes > 0) {
        const ok = confirm(pendentes + ' alteração(ões) não salva(s).\nRecarregar vai descartá-las. Continuar?');
        if (!ok) return;
      }
      await carregarLogMatriz(LOG_MAT_POSTO_ATUAL);
    } else {
      LC_TODAS = [];
      await lcCarregar();
    }
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
  try {
    const res  = await fetch(API_URL + '?tipo=mesCompleto&posto=' + encodeURIComponent(posto));
    const json = await res.json();
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

function logMontarCabecalho(grupos, vendaCols) {
  const thead = document.getElementById('log-matrix-thead');
  if (!thead) return;
  const n = LOG_CATEGORIAS.length;
  let r1 = '<tr><th rowspan="2" class="log-sticky-col" style="background:var(--sf2)">DIA</th>';
  LOG_CATEGORIAS.forEach((cat, ci) => {
    const cols = logColsDaCategoria(cat.chave, grupos, vendaCols);
    const ge = ci < n - 1 ? ' log-grp-end' : '', gs = ci > 0 ? ' log-grp-st' : '';
    r1 += '<th colspan="' + cols.length + '" class="' + cat.cls + ge + gs + '">' + cat.titulo + '</th>';
  });
  r1 += '</tr><tr>';
  LOG_CATEGORIAS.forEach((cat, ci) => {
    const cols = logColsDaCategoria(cat.chave, grupos, vendaCols);
    cols.forEach((col, gi) => {
      let cls = '';
      if (gi === cols.length - 1) cls += ' log-grp-end';
      if (ci > 0 && gi === 0)    cls += ' log-grp-st';
      r1 += '<th' + (cls ? ' class="' + cls.trim() + '"' : '') + ' style="color:' + cat.cor + ';font-size:.62rem">' + col.abv + '</th>';
    });
  });
  thead.innerHTML = r1 + '</tr>';
}

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

function logMontarLinhas(dados) {
  const tbody = document.getElementById('log-matrix-tbody');
  if (!tbody) return;
  const grupos = dados.grupos, vendaCols = dados.combustiveisVenda;
  let html = '';
  dados.dias.forEach((d, diaIdx) => {
    html += '<tr><td class="log-sticky-col">' + String(d.dia).padStart(2, '0') + '/' + dados.mes + '</td>';
    LOG_CATEGORIAS.forEach((cat, ci) => {
      const cols   = logColsDaCategoria(cat.chave, grupos, vendaCols);
      const valores = d[cat.chave] || [];
      cols.forEach((col, i) => {
        const val  = valores[i];
        const last = i === cols.length - 1, first = ci > 0 && i === 0;
        const cls  = (last ? 'log-grp-end' : '') + (first ? ' log-grp-st' : '');
        const tdA  = cls.trim() ? ' class="' + cls.trim() + '"' : '';
        if (cat.chave === 'previsao') {
          html += '<td' + tdA + '><span id="lp_' + diaIdx + '_' + i + '">' + logFmtL(val) + '</span></td>';
        } else if (cat.chave === 'diferenca') {
          const cor = val > 0 ? 'var(--ac)' : (val < 0 ? 'var(--dg)' : 'var(--tx3)');
          html += '<td' + tdA + '><span id="ld_' + diaIdx + '_' + i + '" style="color:' + cor + ';font-weight:700">' +
            (val === null || val === undefined ? '—' : (val > 0 ? '+' : '') + logFmtL(val)) + '</span></td>';
        } else {
          const ca = String(col.comb).replace(/"/g, '&quot;');
          html += '<td' + tdA + '><input type="text" inputmode="numeric" class="log-cell-in"' +
            ' data-dia="' + diaIdx + '" data-campo="' + cat.chave + '" data-comb="' + ca + '"' +
            ' value="' + logFmtL(val).replace('—', '') + '"' +
            ' oninput="logCelulaEditada(this)" onblur="logCelulaBlur(this)"></td>';
        }
      });
    });
    html += '</tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="30" style="padding:1.5rem;color:var(--tx3);text-align:center">Sem dados.</td></tr>';
}

function logRecalcPrev(diaIdx) {
  if (!LOG_MAT_DADOS) return;
  const dias = LOG_MAT_DADOS.dias, dia = dias[diaIdx];
  if (!dia) return;
  const diaOntem = dias[diaIdx - 1];
  const grupos = LOG_MAT_DADOS.grupos, vendaCols = LOG_MAT_DADOS.combustiveisVenda;
  grupos.forEach((g, i) => {
    let prev = null;
    if (diaOntem) {
      const medOntem = diaOntem.medicao[i];
      if (medOntem !== null && medOntem !== undefined) {
        const carga = Number(dia.carga[i]) || 0;
        const iV = vendaCols.findIndex(c => c.comb === g.comb);
        const venda = (iV === -1 || dia.venda[iV] === null) ? 0 : Number(dia.venda[iV]);
        prev = Number(medOntem) + carga - venda;
      }
    }
    dia.previsao[i] = prev;
    const medHoje = dia.medicao[i];
    const diff = (prev !== null && medHoje !== null && medHoje !== undefined) ? Number(medHoje) - prev : null;
    dia.diferenca[i] = diff;
    const elP = document.getElementById('lp_' + diaIdx + '_' + i);
    if (elP) elP.textContent = logFmtL(prev);
    const elD = document.getElementById('ld_' + diaIdx + '_' + i);
    if (elD) {
      elD.style.color = diff > 0 ? 'var(--ac)' : (diff < 0 ? 'var(--dg)' : 'var(--tx3)');
      elD.textContent = diff === null ? '—' : (diff > 0 ? '+' : '') + logFmtL(diff);
    }
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
// COLETA DE PREÇOS — Visão Auditora (Mais+)
// ════════════════════════════════════════════════════════════
let CS_TODAS = [];

function renderColetaSimples(ctx) {
  ctx.innerHTML = `
    <div class="sdiv">Coleta de Preços — Visão Auditora</div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem">
      <input type="text" id="cs-flt-posto" class="map-sel" placeholder="Posto alvo..." style="flex:1;min-width:110px" oninput="csAplicarFiltros()">
      <select id="cs-flt-sup" class="map-sel" onchange="csAplicarFiltros()">
        <option value="">Todos supervisores</option>
        <option>Mauricio</option><option>Fabricio</option><option>Paulo</option><option>Gledson</option><option>Rodrigo</option>
      </select>
      <select id="cs-flt-dias" class="map-sel" onchange="csCarregar()">
        <option value="7">7 dias</option><option value="15" selected>15 dias</option><option value="30">30 dias</option>
      </select>
    </div>
    <div id="cs-status" style="font-size:.65rem;color:var(--tx3);font-family:var(--mono);margin-bottom:.4rem">Carregando...</div>
    <div style="overflow-x:auto;border:1px solid var(--bd);border-radius:var(--r)">
      <table style="border-collapse:collapse;width:100%;min-width:700px;font-size:.75rem">
        <thead><tr style="background:var(--sf2)">
          <th class="cs-th">DATA</th><th class="cs-th">POSTO</th><th class="cs-th">GERENTE</th>
          <th class="cs-th">POSTO ALVO</th><th class="cs-th">SUPERVISOR</th>
          <th class="cs-th" style="color:#f9c74f">ET</th><th class="cs-th" style="color:var(--ac)">GC</th>
          <th class="cs-th" style="color:#4895ef">GA</th><th class="cs-th" style="color:#ff4d6d">S10</th>
          <th class="cs-th" style="color:#c77dff">S500</th><th class="cs-th">FOTO</th>
        </tr></thead>
        <tbody id="cs-tbody"><tr><td colspan="11" style="padding:1.5rem;text-align:center;color:var(--tx3)"><div class="loading-spin" style="margin:0 auto"></div></td></tr></tbody>
      </table>
    </div>
    <div id="cs-popover" style="display:none;position:fixed;z-index:500;background:var(--sf);border:1px solid var(--bd2);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);width:260px;pointer-events:none">
      <div style="background:var(--sf2);padding:.4rem .7rem;border-bottom:1px solid var(--bd);font-size:.7rem;font-family:var(--mono)" id="cs-pop-label">Foto</div>
      <div style="padding:.4rem;background:#0a0c10"><img id="cs-pop-img" src="" style="width:100%;border-radius:6px"></div>
      <div style="padding:.35rem .7rem;background:var(--sf2);border-top:1px solid var(--bd)"><a id="cs-pop-link" href="#" target="_blank" style="font-size:.62rem;color:var(--ac);text-decoration:underline">Abrir no Drive</a></div>
    </div>`;
  csCarregar();
}

async function csCarregar() {
  const dias = (document.getElementById('cs-flt-dias') || { value: '15' }).value;
  const tbody = document.getElementById('cs-tbody');
  const statusEl = document.getElementById('cs-status');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="11" style="padding:1.5rem;text-align:center;color:var(--tx3)"><div class="loading-spin" style="margin:0 auto"></div></td></tr>';
  if (statusEl) statusEl.textContent = 'Carregando...';
  try {
    const res  = await fetch(API_URL + '?tipo=coletaRecentes&dias=' + dias);
    const json = await res.json();
    if (json.success && Array.isArray(json.registros)) { CS_TODAS = json.registros; csAplicarFiltros(); }
    else tbody.innerHTML = '<tr><td colspan="11" style="padding:1.5rem;text-align:center;color:var(--dg)">Erro ao carregar.</td></tr>';
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:1.5rem;text-align:center;color:var(--dg)">Erro: ' + e.message + '</td></tr>';
  }
}

function csAplicarFiltros() {
  const fP = ((document.getElementById('cs-flt-posto') || { value: '' }).value).trim().toUpperCase();
  const fS = (document.getElementById('cs-flt-sup')   || { value: '' }).value;
  const el = document.getElementById('cs-status');
  const f  = CS_TODAS.filter(r => {
    if (fP && !String(r.postoAlvo || '').toUpperCase().includes(fP)) return false;
    if (fS && r.supervisor !== fS) return false;
    return true;
  });
  if (el) el.textContent = f.length + ' de ' + CS_TODAS.length + ' registros';
  csRenderLinhas(f);
}

function csP(v) {
  if (v === null || v === undefined || isNaN(v)) return '<span style="color:var(--tx3)">—</span>';
  return '<span style="font-family:var(--mono);font-weight:700">' + Number(v).toFixed(2).replace('.', ',') + '</span>';
}
function csDriveThumb(url) { const m = url && url.match(/[-\w]{25,}/); return m ? 'https://lh3.googleusercontent.com/d/' + m[0] + '=w300' : ''; }
function csShowPhoto(event, url, label) {
  const pop = document.getElementById('cs-popover'); if (!pop) return;
  document.getElementById('cs-pop-label').textContent = label || 'Foto';
  document.getElementById('cs-pop-img').src = csDriveThumb(url);
  document.getElementById('cs-pop-link').href = url;
  pop.style.display = 'block';
  const x = Math.min(event.clientX - 130, window.innerWidth - 270), y = Math.min(event.clientY - 80, window.innerHeight - 300);
  pop.style.left = Math.max(4, x) + 'px'; pop.style.top = Math.max(4, y) + 'px';
}
function csHidePhoto() { const p = document.getElementById('cs-popover'); if (p) p.style.display = 'none'; }

function csRenderLinhas(registros) {
  const tbody = document.getElementById('cs-tbody'); if (!tbody) return;
  if (!registros.length) { tbody.innerHTML = '<tr><td colspan="11" style="padding:1.5rem;text-align:center;color:var(--tx3)">Nenhum registro.</td></tr>'; return; }
  const SC = { Mauricio: 'var(--ac)', Paulo: '#4895ef', Fabricio: '#f9c74f', Gledson: '#c77dff', Rodrigo: '#ff6b6b' };
  let html = '';
  registros.forEach(r => {
    const isProp = r.tipo === 'Próprio', corN = isProp ? 'var(--ac)' : 'var(--tx)', supC = SC[r.supervisor] || 'var(--tx3)';
    const temFoto = r.foto && String(r.foto).startsWith('http');
    const fS = temFoto ? r.foto.replace(/'/g, '') : '', lS = (r.postoAlvo || '').replace(/'/g, '');
    const fotoCell = temFoto
      ? `<span style="cursor:pointer;color:#4895ef;font-family:var(--mono);font-size:.7rem;text-decoration:underline" onmouseenter="csShowPhoto(event,'${fS}','${lS}')" onmouseleave="csHidePhoto()" onclick="csShowPhoto(event,'${fS}','${lS}')">📷 Ver</span>`
      : '<span style="color:var(--tx3)">—</span>';
    html += `<tr style="border-bottom:1px solid var(--bd)">
      <td style="padding:.45rem .65rem;font-family:var(--mono);font-size:.7rem;color:var(--tx3);white-space:nowrap">${r.data || '—'}</td>
      <td style="padding:.45rem .65rem;font-size:.78rem;color:var(--tx2)">${r.posto || '—'}</td>
      <td style="padding:.45rem .65rem;font-size:.75rem;color:var(--tx3)">${r.gerente || '—'}</td>
      <td style="padding:.45rem .65rem;font-size:.82rem;font-weight:600;color:${corN}">${r.postoAlvo || '—'}</td>
      <td style="padding:.45rem .65rem;font-size:.72rem;font-family:var(--mono);color:${supC}">${r.supervisor || '—'}</td>
      <td style="padding:.45rem .65rem;text-align:center">${csP(r.ET)}</td>
      <td style="padding:.45rem .65rem;text-align:center">${csP(r.GC)}</td>
      <td style="padding:.45rem .65rem;text-align:center">${csP(r.GA)}</td>
      <td style="padding:.45rem .65rem;text-align:center">${csP(r.S10)}</td>
      <td style="padding:.45rem .65rem;text-align:center">${csP(r.S500)}</td>
      <td style="padding:.45rem .65rem;text-align:center">${fotoCell}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// COLETA — sub-aba Logística (lcXxx)
// ════════════════════════════════════════════════════════════
async function lcCarregar() {
  const dias = (document.getElementById('lc-flt-dias') || { value: '15' }).value;
  const tbody = document.getElementById('lc-tbody');
  const statusEl = document.getElementById('lc-status');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="11" style="padding:1.2rem;text-align:center;color:var(--tx3)"><div class="loading-spin" style="margin:0 auto;width:24px;height:24px"></div></td></tr>';
  if (statusEl) statusEl.textContent = 'Carregando...';
  try {
    const res  = await fetch(API_URL + '?tipo=coletaRecentes&dias=' + dias);
    const json = await res.json();
    if (json.success && Array.isArray(json.registros)) { LC_TODAS = json.registros; lcAplicarFiltros(); }
    else tbody.innerHTML = '<tr><td colspan="11" style="padding:1.2rem;text-align:center;color:var(--dg)">Erro ao carregar.</td></tr>';
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:1.2rem;text-align:center;color:var(--dg)">Erro: ' + e.message + '</td></tr>';
  }
}

function lcAplicarFiltros() {
  const fPosto   = (document.getElementById('lc-flt-posto')   || { value: '' }).value.trim().toUpperCase();
  const fGerente = (document.getElementById('lc-flt-gerente') || { value: '' }).value.trim().toUpperCase();
  const fTipo    = (document.getElementById('lc-flt-tipo')    || { value: '' }).value;
  const fSup     = (document.getElementById('lc-flt-sup')     || { value: '' }).value;
  const fDe      = (document.getElementById('lc-flt-de')      || { value: '' }).value;
  const fAte     = (document.getElementById('lc-flt-ate')     || { value: '' }).value;
  const statusEl = document.getElementById('lc-status');
  const dataDe   = fDe  ? new Date(fDe  + 'T00:00:00') : null;
  const dataAte  = fAte ? new Date(fAte + 'T23:59:59') : null;
  const filtrados = LC_TODAS.filter(r => {
    if (fPosto   && !String(r.postoAlvo || '').toUpperCase().includes(fPosto))   return false;
    if (fGerente && !String(r.gerente   || '').toUpperCase().includes(fGerente)) return false;
    if (fTipo    && r.tipo       !== fTipo) return false;
    if (fSup     && r.supervisor !== fSup)  return false;
    if (dataDe || dataAte) {
      const p = String(r.data || '').split('/');
      if (p.length !== 3) return false;
      const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
      if (dataDe && d < dataDe) return false;
      if (dataAte && d > dataAte) return false;
    }
    return true;
  });
  const ativos = !!(fPosto || fGerente || fTipo || fSup || fDe || fAte);
  if (statusEl) statusEl.textContent = ativos
    ? filtrados.length + ' de ' + LC_TODAS.length + ' registros (filtro ativo)'
    : filtrados.length + ' registros';
  lcRenderLinhas(filtrados);
}

function lcLimparFiltros() {
  ['lc-flt-de', 'lc-flt-ate', 'lc-flt-posto', 'lc-flt-gerente', 'lc-flt-tipo', 'lc-flt-sup'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  lcAplicarFiltros();
}

function lcP(v) {
  if (v === null || v === undefined || isNaN(v)) return '<span style="color:var(--tx3)">—</span>';
  return '<span style="font-family:var(--mono);font-weight:700">' + Number(v).toFixed(2).replace('.', ',') + '</span>';
}
function lcDriveThumb(url) { const m = url && url.match(/[-\w]{25,}/); return m ? 'https://lh3.googleusercontent.com/d/' + m[0] + '=w280' : ''; }
function lcShowPhoto(event, url, label) {
  const pop = document.getElementById('lc-popover'); if (!pop) return;
  document.getElementById('lc-pop-label').textContent = label || 'Foto';
  document.getElementById('lc-pop-img').src = lcDriveThumb(url);
  document.getElementById('lc-pop-link').href = url;
  pop.style.display = 'block';
  const x = Math.min(event.clientX - 120, window.innerWidth - 250), y = Math.min(event.clientY - 70, window.innerHeight - 280);
  pop.style.left = Math.max(4, x) + 'px'; pop.style.top = Math.max(4, y) + 'px';
}
function lcHidePhoto() { const p = document.getElementById('lc-popover'); if (p) p.style.display = 'none'; }

function lcRenderLinhas(registros) {
  const tbody = document.getElementById('lc-tbody'); if (!tbody) return;
  if (!registros.length) { tbody.innerHTML = '<tr><td colspan="11" style="padding:1.2rem;text-align:center;color:var(--tx3)">Nenhum registro.</td></tr>'; return; }
  const SC = { Mauricio: 'var(--ac)', Paulo: '#4895ef', Fabricio: '#f9c74f', Gledson: '#c77dff', Rodrigo: '#ff6b6b' };
  let html = '';
  registros.forEach(r => {
    const isProp = r.tipo === 'Próprio', corN = isProp ? 'var(--ac)' : 'var(--tx)', supC = SC[r.supervisor] || 'var(--tx3)';
    const temFoto = r.foto && String(r.foto).startsWith('http');
    const fS = temFoto ? r.foto.replace(/'/g, '') : '', lS = (r.postoAlvo || '').replace(/'/g, '');
    const fotoCell = temFoto
      ? `<span style="cursor:pointer;color:#4895ef;font-family:var(--mono);font-size:.65rem;text-decoration:underline" onmouseenter="lcShowPhoto(event,'${fS}','${lS}')" onmouseleave="lcHidePhoto()" onclick="lcShowPhoto(event,'${fS}','${lS}')">📷 Ver</span>`
      : '<span style="color:var(--tx3)">—</span>';
    html += `<tr style="border-bottom:1px solid var(--bd)">
      <td style="padding:.4rem .6rem;font-family:var(--mono);font-size:.65rem;color:var(--tx3);white-space:nowrap">${r.data || '—'}</td>
      <td style="padding:.4rem .6rem;font-size:.72rem;color:var(--tx2);white-space:nowrap">${r.posto || '—'}</td>
      <td style="padding:.4rem .6rem;font-size:.68rem;color:var(--tx3);white-space:nowrap">${r.gerente || '—'}</td>
      <td style="padding:.4rem .6rem;font-size:.78rem;font-weight:600;color:${corN};white-space:nowrap">${r.postoAlvo || '—'}</td>
      <td style="padding:.4rem .6rem;font-size:.65rem;font-family:var(--mono);color:${supC};white-space:nowrap">${r.supervisor || '—'}</td>
      <td style="padding:.4rem .6rem;text-align:center">${lcP(r.ET)}</td>
      <td style="padding:.4rem .6rem;text-align:center">${lcP(r.GC)}</td>
      <td style="padding:.4rem .6rem;text-align:center">${lcP(r.GA)}</td>
      <td style="padding:.4rem .6rem;text-align:center">${lcP(r.S10)}</td>
      <td style="padding:.4rem .6rem;text-align:center">${lcP(r.S500)}</td>
      <td style="padding:.4rem .6rem;text-align:center">${fotoCell}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
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
