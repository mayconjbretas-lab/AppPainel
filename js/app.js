'use strict';

// ═══════════════════════════════════════════════════════════════════
// JBRETAS — Painel de Preços ADM
// Dados reais via Apps Script (doGet?tipo=precos)
// ═══════════════════════════════════════════════════════════════════

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwoJ3-g48frwYtMlnpVj5EIYapInPP11OJXrkOPUzCULrbIZWMQW51xFe-Ot4cox00r/exec';

// Credenciais ADM (validadas no cliente — igual ao fechamento)
const ADM_USERS = [
  { email:'adm@jbretas.com',  senha:'adm123'  },
  { email:'adm2@jbretas.com', senha:'adm456'  },
];

// Supervisores e seus postos próprios
const REGIONAIS = {
  Mauricio:['P. JA','P. MANGABEIRAS','P. URBANO FERRAZ','P. DIFERENCIAL','P. ARAPONGA','P. ITAPOA','P. ALEX','P. BERNARDO','P. BOMBOM MATRIZ'],
  Fabricio:['P. TUNEL','P. TRANCOSO','P. ANA LÚCIA','P. SANTA INES - JOAQUIM','P. SAO BERNARDO','P. BAHAMAS','P. SERENA COLIBRI','P. BRUNA'],
  Paulo:['P. TOPAZIO','P. JOCA','P. LOURA EMPREENDIMENTOS','P. AVIVA','P. SAO LUIZ RL','P. PLANALTO','P. SANTA MARIA','P. BOMBOM FILIAL','P. SANTA INES MINAS','PAIVA E PAIVA COMBUSTIVEL'],
  Gledson:['P. GLÓRIA','P. QUATRO RODAS','P. RODRIGO','P. LEANDRO','P. MIRAGEM JBRETAS','P. BIANCA','P. BARBOSA - DUDU'],
  Rodrigo:['P. ESPAÇO REAL','P. BEATRIZ','P. FELIPAO','P. OURO BRANCO'],
};

// Postos com coordenadas reais
const MAP_POSTOS = [
  {k:'P. JA',          lat:-19.9581,lng:-43.9571,sup:'Mauricio',banda:'Ipiranga',   addr:'Av. Raja Gabaglia, 2461 — Gutierrez'},
  {k:'P. ITAPOA',      lat:-19.9198,lng:-43.9814,sup:'Mauricio',banda:'Shell',      addr:'Av. Amazonas, 2994 — Itapoã'},
  {k:'P. MANGABEIRAS',  lat:-19.9600,lng:-43.9610,sup:'Mauricio',banda:'Shell',      addr:'Av. Afonso Pena, 4321 — Mangabeiras'},
  {k:'P. DIFERENCIAL',  lat:-19.9182,lng:-43.9368,sup:'Mauricio',banda:'Rede Flex',  addr:'Av. do Contorno, 3347 — Funcionários'},
  {k:'P. ARAPONGA',    lat:-19.9620,lng:-43.9500,sup:'Mauricio',banda:'Ipiranga',   addr:'Av. Brasil, 909 — Araponga'},
  {k:'P. URBANO FERRAZ',lat:-19.9300,lng:-43.9540,sup:'Mauricio',banda:'BR/Petrobras',addr:'Av. Álvares Cabral, 780 — Centro'},
  {k:'P. BERNARDO',    lat:-19.9900,lng:-43.9000,sup:'Mauricio',banda:'Shell',      addr:'BR-040, Km 564 — Bernardo Monteiro'},
  {k:'P. ALEX',        lat:-19.9550,lng:-43.9600,sup:'Mauricio',banda:'Ipiranga',   addr:'Av. Raja Gabaglia — Gutierrez'},
  {k:'P. BOMBOM MATRIZ',lat:-19.9081,lng:-43.9257,sup:'Mauricio',banda:'Ipiranga',  addr:'R. Itapecerica, 180 — Floresta'},
  {k:'P. TUNEL',       lat:-19.9050,lng:-43.9470,sup:'Fabricio',banda:'BR/Petrobras',addr:'Av. Cristiano Machado, 71 — Venda Nova'},
  {k:'P. TRANCOSO',    lat:-19.9050,lng:-43.9300,sup:'Fabricio',banda:'Ipiranga',   addr:'R. José Cleto, 1232 — Lagoinha'},
  {k:'P. SERENA COLIBRI',lat:-19.8140,lng:-44.0650,sup:'Fabricio',banda:'Ipiranga', addr:'Av. Pres. Antonio Carlos, 8311 — Pampulha'},
  {k:'P. BRUNA',       lat:-19.8950,lng:-43.9550,sup:'Fabricio',banda:'BR/Petrobras',addr:'Av. Anel Rodoviário — Bairro Novo'},
  {k:'P. SAO BERNARDO', lat:-19.9094,lng:-43.9297,sup:'Fabricio',banda:'Ipiranga',  addr:'Av. Cristiano Machado, 4500 — São Bernardo'},
  {k:'P. ANA LÚCIA',   lat:-19.9480,lng:-44.0700,sup:'Fabricio',banda:'BR/Petrobras',addr:'Rua Ana Lúcia — Contagem'},
  {k:'P. BAHAMAS',     lat:-19.9350,lng:-43.8950,sup:'Fabricio',banda:'Ipiranga',   addr:'Região Bahamas — BH'},
  {k:'P. JOCA',        lat:-19.9290,lng:-43.9730,sup:'Paulo',   banda:'Ipiranga',   addr:'R. Antonio José dos Santos, 609 — Gameleira'},
  {k:'P. LOURA EMPREENDIMENTOS',lat:-19.9380,lng:-44.0900,sup:'Paulo',banda:'Shell',addr:'Av. João Soares, 1024 — Ibirité'},
  {k:'P. TOPAZIO',     lat:-19.7740,lng:-44.0530,sup:'Paulo',   banda:'BR/Petrobras',addr:'Av. Denise Cristina Rocha, 1660 — Vespasiano'},
  {k:'P. AVIVA',       lat:-19.7820,lng:-44.0750,sup:'Paulo',   banda:'Ipiranga',   addr:'R. Alzira Menezes Nogueira, 2292 — Vespasiano'},
  {k:'P. SAO LUIZ RL', lat:-19.7470,lng:-44.0830,sup:'Paulo',   banda:'Ipiranga',   addr:'Av. Eduardo Farnese Brandão — São Luís'},
  {k:'P. PLANALTO',    lat:-19.8270,lng:-44.0070,sup:'Paulo',   banda:'BR/Petrobras',addr:'Av. Dr. Cristiano Guimarães, 2329 — Planalto'},
  {k:'P. SANTA MARIA', lat:-19.7820,lng:-43.8850,sup:'Paulo',   banda:'BR/Petrobras',addr:'Região Santa Maria — BH'},
  {k:'P. BOMBOM FILIAL',lat:-19.9480,lng:-43.9220,sup:'Paulo',  banda:'Ipiranga',   addr:'R. Goitacases — Lourdes'},
  {k:'P. GLÓRIA',      lat:-19.9370,lng:-43.9100,sup:'Gledson', banda:'Shell',      addr:'R. Dep. Cláudio Pinheiro Lima, 957 — Glória'},
  {k:'P. QUATRO RODAS',lat:-19.8670,lng:-44.0580,sup:'Gledson', banda:'Ipiranga',   addr:'Av. Tito Fulgêncio, 950 — Betim'},
  {k:'P. RODRIGO',     lat:-19.9480,lng:-44.1980,sup:'Gledson', banda:'Shell',      addr:'Av. Arthur da Silva, 355 — Ibirité'},
  {k:'P. LEANDRO',     lat:-19.7820,lng:-44.0760,sup:'Gledson', banda:'Ipiranga',   addr:'Av. Abílio Machado, 330 — Vespasiano'},
  {k:'P. MIRAGEM JBRETAS',lat:-19.7820,lng:-43.8850,sup:'Gledson',banda:'Shell',    addr:'Av. Pres. Antonio Carlos, 638 — Lourdes'},
  {k:'P. BIANCA',      lat:-20.0400,lng:-44.1500,sup:'Gledson', banda:'Ipiranga',   addr:'Região Sarzedo — MG'},
  {k:'P. BARBOSA - DUDU',lat:-19.9330,lng:-44.0030,sup:'Gledson',banda:'ALE',       addr:'Região Gameleira — BH'},
  {k:'P. ESPAÇO REAL', lat:-21.1300,lng:-44.2570,sup:'Rodrigo', banda:'BR/Petrobras',addr:'Av. 31 de Março, 3000 — São João Del Rei'},
  {k:'P. BEATRIZ',     lat:-20.0250,lng:-44.1080,sup:'Rodrigo', banda:'Shell',      addr:'Região Betim — MG'},
  {k:'P. FELIPAO',     lat:-19.9230,lng:-43.9900,sup:'Rodrigo', banda:'BR/Petrobras',addr:'Av. Leite de Castro, 2090 — Santa Efigênia'},
  {k:'P. OURO BRANCO', lat:-20.5300,lng:-43.6700,sup:'Rodrigo', banda:'Bandeira Branca',addr:'Ouro Branco — MG'},
  {k:'P. SANTA INES - JOAQUIM',lat:-19.9350,lng:-43.9010,sup:'Fabricio',banda:'Shell',addr:'Região Santa Inês — BH'},
  {k:'P. TRANCOSO',    lat:-19.8980,lng:-43.9400,sup:'Fabricio',banda:'Ipiranga',   addr:'Av. Vilarinho, 1232 — Venda Nova'},
  {k:'PAIVA E PAIVA COMBUSTIVEL',lat:-19.8200,lng:-43.9900,sup:'Paulo',banda:'Bandeira Branca',addr:'Região Contagem — MG'},
];

const SUP_COR = {Mauricio:'#00e5a0',Paulo:'#4895ef',Fabricio:'#f9c74f',Gledson:'#c77dff',Rodrigo:'#ff6b6b'};
const BCOR = {'Rede Flex':'#00e5a0','Ipiranga':'#f9c74f','Vibra':'#4895ef','ALE':'#ff6b6b','Shell':'#e8c84a','BR/Petrobras':'#4db6ac','Rio Branco':'#81c784','Bandeira Branca':'#8892a4','Rede Aqui':'#ff9800','Siga Petro':'#ba68c8','Rede Aliança':'#ff7043','Phoenix':'#ff8c00'};
const CL = {GC:'G.C',GA:'G.A',ET:'ET',S10:'S10',EXTRA:'EXTRA'};
const CC = {GC:'gc',GA:'ga',ET:'et',S10:'s10',EXTRA:'ex'};

// Estado global
let PRECOS = {};      // { "POSTO ALVO": { GC, GA, ET, S10, EXTRA, bandeira, tipo, supervisor, data } }
let filtroSupAtual = 'todos';
let mapaFuel = 'GC';
let mapaFiltroSup = 'todos';
let leafletMap = null;
let leafletMarkers = [];
let _currentUser = null;

// ═══ FORMATTERS ═══
function fmt(v) {
  if (v == null || v === '') return '—';
  return 'R$' + parseFloat(v).toFixed(3).replace('.', ',');
}
function fmtShort(v) {
  if (v == null) return '—';
  return 'R$' + parseFloat(v).toFixed(2).replace('.', ',');
}
function med(arr) {
  const f = arr.filter(x => x != null && x !== '');
  return f.length ? f.reduce((a, b) => a + parseFloat(b), 0) / f.length : null;
}

// ═══ LOGIN ═══
function toggleSenha() {
  const i = document.getElementById('inp-senha');
  i.type = i.type === 'password' ? 'text' : 'password';
}

async function entrar() {
  const email = (document.getElementById('inp-email').value || '').trim().toLowerCase();
  const senha = (document.getElementById('inp-senha').value || '').trim();
  const btn   = document.getElementById('btn-entrar');
  const erroEl= document.getElementById('login-erro');

  if (!email || !senha) { mostrarErro('Preencha e-mail e senha.'); return; }

  btn.textContent = 'Aguarde...';
  btn.disabled = true;
  erroEl.classList.add('hidden');

  // Valida ADM
  const adm = ADM_USERS.find(u => u.email === email && u.senha === senha);
  if (!adm) {
    // Tenta via Apps Script (caso adicione mais usuários no futuro)
    try {
      const url = SHEETS_URL + '?tipo=login&email=' + encodeURIComponent(email) + '&senha=' + encodeURIComponent(senha);
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.usuario && (!json.usuario.postoKey || json.usuario.postoKey === 'ADM')) {
        _currentUser = json.usuario;
        iniciarApp();
        return;
      }
    } catch(e) {}
    mostrarErro('Credenciais inválidas ou sem acesso ADM.');
    btn.textContent = 'ENTRAR';
    btn.disabled = false;
    return;
  }

  _currentUser = { email: adm.email, gerente: 'ADM JBRETAS' };
  iniciarApp();
}

function mostrarErro(msg) {
  const el = document.getElementById('login-erro');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function iniciarApp() {
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-app').classList.remove('hidden');
  carregarDados();
  // Registra SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

function sair() {
  _currentUser = null;
  PRECOS = {};
  document.getElementById('screen-app').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('inp-senha').value = '';
}

// ═══ CARREGAR DADOS ═══
async function carregarDados() {
  const el = document.getElementById('upd-txt');
  el.textContent = 'Atualizando...';

  try {
    const url = SHEETS_URL + '?tipo=precos';
    const resp = await fetch(url);
    const json = await resp.json();

    if (json.precos) {
      PRECOS = json.precos;
      el.textContent = 'Atualizado: ' + (json.atualizado || new Date().toLocaleString('pt-BR'));
      renderKPIs();
      renderComp();
      renderRanking();
      renderRegional();
      renderHeatmap();
      if (leafletMap) renderLeafletMarkers();
      showToast('Dados atualizados', Object.keys(PRECOS).length + ' postos/concorrentes');
    } else {
      el.textContent = 'Erro ao carregar — ' + (json.erro || 'sem dados');
    }
  } catch(e) {
    el.textContent = 'Sem conexão — dados offline';
    showToast('Offline', 'Verifique sua conexão');
  }
}

// ═══ KPIs ═══
function renderKPIs() {
  const proprios = Object.values(PRECOS).filter(p => p.tipo === 'Próprio');
  const concs    = Object.values(PRECOS).filter(p => p.tipo === 'Concorrente');

  document.getElementById('kv-proprios').textContent = proprios.length;
  document.getElementById('kv-concs').textContent    = concs.length;

  const gcConcs  = concs.map(p => p.GC).filter(Boolean);
  const gcProp   = proprios.map(p => p.GC).filter(Boolean);

  const mGcConcs = med(gcConcs);
  const mGcProp  = med(gcProp);

  document.getElementById('kv-gc').textContent  = mGcConcs ? fmtShort(mGcConcs) : '--';
  document.getElementById('kv-mgc').textContent = mGcProp  ? fmtShort(mGcProp)  : '--';
}

// ═══ POPULA SELECT DE POSTOS PRÓPRIOS ═══
function initSelects() {
  const sel = document.getElementById('posto-comp');
  // Limpa preservando o placeholder
  while (sel.options.length > 1) sel.remove(1);
  const proprios = Object.keys(PRECOS)
    .filter(k => PRECOS[k].tipo === 'Próprio')
    .sort();
  proprios.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  });
}

// ═══ TELA COMPARAR ═══
function renderComp() {
  initSelects();
  const posto = document.getElementById('posto-comp').value;
  const body  = document.getElementById('comp-body');
  if (!posto) { body.innerHTML = '<div class="empty">Selecione um posto acima</div>'; return; }

  const meu = PRECOS[posto];
  if (!meu) { body.innerHTML = '<div class="empty">Sem dados para este posto</div>'; return; }

  const sup = meu.supervisor || '';
  const cor = SUP_COR[sup] || '#8892a4';

  // Encontra concorrentes do mesmo bloco
  const bloco = meu.bloco || '';
  const concNames = bloco
    ? Object.keys(PRECOS).filter(k => PRECOS[k].tipo === 'Concorrente' && PRECOS[k].bloco === bloco)
    : [];

  // Card "meu posto"
  let meuHtml = `<div class="ccard meu"><div class="cclbl">Meu posto</div><div class="ccnome">${posto}</div>`;
  if (sup) meuHtml += `<div style="font-size:.6rem;color:${cor};margin-bottom:4px">Sup. ${sup}</div>`;
  if (meu.data) meuHtml += `<div class="ccdatarow">📅 ${meu.data} ${meu.hora || ''}</div>`;
  ['GC','GA','ET','S10'].forEach(c => {
    meuHtml += `<div class="pr"><span class="prc">${CL[c]||c}</span><span class="prv ${CC[c]||'gc'}">${fmt(meu[c])}</span></div>`;
  });
  meuHtml += '</div>';

  // Cards concorrentes
  let concHtml = '<div style="display:flex;flex-direction:column;gap:6px">';
  if (!concNames.length) {
    concHtml += '<div class="empty" style="padding:.5rem">Sem concorrentes cadastrados</div>';
  } else {
    concNames.slice(0,2).forEach(cn => {
      const cv = PRECOS[cn];
      const banda = cv.bandeira || 'Bandeira Branca';
      const corB  = BCOR[banda] || '#8892a4';
      concHtml += `<div class="ccard conc"><div class="cclbl" style="color:${corB}">${banda}</div><div class="ccnome" title="${cn}">${cn}</div>`;
      if (cv.data) concHtml += `<div class="ccdatarow">📅 ${cv.data}</div>`;
      ['GC','GA','ET','S10'].forEach(cb => {
        const vc = cv[cb], vm = meu[cb];
        let ex = '';
        if (vc && vm) {
          const d = vc - vm;
          if (Math.abs(d) > 0.002) ex = `<span style="font-size:.58rem;color:${d>0?'var(--dg)':'var(--ok)'};margin-left:3px">${d>=0?'+':''}${d.toFixed(3)}</span>`;
        }
        concHtml += `<div class="pr"><span class="prc">${CL[cb]||cb}</span><span>${vc?`<span class="prv ${CC[cb]||'gc'}">${fmt(vc)}</span>${ex}`:'<span class="prv nd">—</span>'}</span></div>`;
      });
      concHtml += '</div>';
    });
    if (concNames.length > 2) concHtml += `<div class="conc-mais">+${concNames.length-2} concorrentes</div>`;
  }
  concHtml += '</div>';

  // Diferença GC
  let diffHtml = '';
  const gcConcs = concNames.map(cn => PRECOS[cn]?.GC).filter(Boolean);
  const mediaGC = med(gcConcs);
  if (mediaGC && meu.GC) {
    const diff = meu.GC - mediaGC;
    const pct  = Math.min(Math.abs(diff)/0.5*100, 100);
    const cor2 = diff < 0 ? 'var(--ok)' : 'var(--dg)';
    diffHtml = `<div class="dbox"><div class="dlbl">Diferença G.C — Meu posto vs média concorrentes</div>
      <div class="drow"><span class="dc">G.C</span><div class="dbg"><div class="dbar" style="width:${pct}%;background:${cor2}"></div></div>
      <span class="dval ${diff<0?'ok':'bad'}">${diff<0?'-':'+'}${fmt(Math.abs(diff))}</span></div>
      <div style="font-size:.68rem;color:${cor2};text-align:center;margin-top:4px">${diff<0?'Você está mais barato — posicionamento bom':'Você está mais caro que a média dos concorrentes'}</div></div>`;
    const meds = ['GC','GA','ET','S10'].map(c => {
      const arr = concNames.map(cn => PRECOS[cn]?.[c]).filter(Boolean);
      const m = med(arr);
      return m ? `<span class="mval">${CL[c]||c} <b>${fmt(m)}</b></span>` : '';
    }).join('');
    diffHtml += `<div class="mbox"><div class="mlbl2">Média de ${gcConcs.length} concorrentes</div><div class="mvals">${meds}</div></div>`;
  }

  document.getElementById('comp-sub').textContent = posto + (bloco ? ' — bloco ' + bloco : '');
  body.innerHTML = `<div class="cpair">${meuHtml}${concHtml}</div>${diffHtml}`;
}

// ═══ HEATMAP ═══
function renderHeatmap() {
  const gcVals = Object.values(PRECOS).filter(p => p.tipo === 'Próprio' && p.GC).map(p => p.GC);
  if (!gcVals.length) return;
  const faixas = [
    {lbl:'<5,75',  cor:'hlo', n:0},
    {lbl:'5,75-5,80',cor:'hlo', n:0},
    {lbl:'5,80-5,90',cor:'hmid',n:0},
    {lbl:'5,90-6,00',cor:'hhi', n:0},
    {lbl:'>6,00',  cor:'hhi', n:0},
  ];
  gcVals.forEach(v => {
    if (v < 5.75)       faixas[0].n++;
    else if (v < 5.80)  faixas[1].n++;
    else if (v < 5.90)  faixas[2].n++;
    else if (v < 6.00)  faixas[3].n++;
    else                 faixas[4].n++;
  });
  const cores = ['var(--ok)','var(--ok)','var(--wn)','var(--dg)','var(--dg)'];
  document.getElementById('heatmap-body').innerHTML = faixas.map((f,i) =>
    `<div class="hcell ${f.cor}"><div class="hclbl">${f.lbl}</div><div class="hcval" style="color:${cores[i]}">${f.n}</div></div>`
  ).join('');
}

// ═══ RANKING ═══
function getConcsFiltrados() {
  return Object.keys(PRECOS).filter(k => {
    const p = PRECOS[k];
    if (p.tipo !== 'Concorrente') return false;
    if (filtroSupAtual === 'todos') return true;
    return p.supervisor === filtroSupAtual;
  });
}

function setFiltroSup(btn, sup) {
  document.querySelectorAll('#filtro-sup .ftag').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filtroSupAtual = sup;
  renderRanking();
}

function renderRanking() {
  const concsKey = getConcsFiltrados();
  const todos = concsKey
    .map(k => ({ nome:k, ...PRECOS[k] }))
    .filter(c => c.GC)
    .sort((a,b) => a.GC - b.GC);

  document.getElementById('rank-count').textContent = todos.length + ' concorrentes com dados' + (filtroSupAtual !== 'todos' ? ' — ' + filtroSupAtual : '');

  const mn = todos[0]?.GC || 0;
  const mx = todos[todos.length-1]?.GC || 1;
  const rng = mx - mn || 1;

  document.getElementById('rank-body').innerHTML = todos.map((c,i) => {
    const cor = BCOR[c.bandeira] || '#8892a4';
    const pct = ((c.GC - mn) / rng * 100);
    return `<div class="ri">
      <div class="rmeta">
        <div class="rl">
          <span class="rnum">${i+1}</span>
          <span class="rd" style="background:${cor}"></span>
          <span class="rnome">${c.nome}</span>
          <span class="rbanda" style="color:${cor}">${(c.bandeira||'').replace('Bandeira Branca','B.B')}</span>
          ${i===0?'<span class="tag ok">+ barato</span>':i===todos.length-1?'<span class="tag bad">+ caro</span>':''}
        </div>
        <span class="rpreco">${fmt(c.GC)}</span>
      </div>
      <div class="rbarbg"><div class="rbar" style="width:${Math.max(pct,1)}%;background:${cor}"></div></div>
      <div class="rsub">GA ${fmt(c.GA)} · ET ${fmt(c.ET)} · S10 ${fmt(c.S10)}${c.data?' · '+c.data:''}</div>
    </div>`;
  }).join('') || '<div class="empty">Sem dados para este filtro</div>';

  // Ranking por bandeira
  const porB = {};
  todos.forEach(c => {
    const b = c.bandeira || 'Bandeira Branca';
    if (!porB[b]) porB[b] = [];
    porB[b].push(c.GC);
  });
  const rB = Object.keys(porB).map(b => ({ b, m: med(porB[b]), n: porB[b].length })).sort((a,z) => a.m - z.m);
  document.getElementById('band-rank-body').innerHTML = rB.map((b,i) => {
    const cor = BCOR[b.b] || '#8892a4';
    return `<div class="bbox"><div class="bnome" style="color:${cor}">${b.b}</div><div class="bpreco">${fmtShort(b.m)}</div><div class="bn">${b.n} leituras</div>${i===0?'<div class="btag ok">mais barato</div>':i===rB.length-1?'<div class="btag bad">mais caro</div>':''}</div>`;
  }).join('');

  // Deslocados
  const mTotal = med(todos.map(c => c.GC));
  const srt = todos.slice().sort((a,b) => Math.abs(b.GC - mTotal) - Math.abs(a.GC - mTotal));
  document.getElementById('deslocado-body').innerHTML = srt.slice(0,5).map(c => {
    const diff = c.GC - mTotal;
    const cor = diff < 0 ? 'var(--ok)' : 'var(--dg)';
    const pct = Math.min(Math.abs(diff)/0.3*100, 100);
    return `<div class="desitem">
      <div class="deswrap">
        <div class="desnome">${c.nome.substring(0,24)}</div>
        <div class="desmed">média: ${fmt(mTotal)}</div>
        <div class="desbarbg"><div class="desbar" style="width:${pct}%;background:${cor}"></div></div>
      </div>
      <div class="desval" style="color:${cor}">${diff>=0?'+':''}${diff.toFixed(3)}</div>
    </div>`;
  }).join('');
}

// ═══ REGIONAL ═══
function renderRegional() {
  // Por bandeira
  const porBConc = {};
  Object.keys(PRECOS).filter(k => PRECOS[k].tipo === 'Concorrente').forEach(k => {
    const p = PRECOS[k];
    const b = p.bandeira || 'Bandeira Branca';
    if (!porBConc[b]) porBConc[b] = { gc:[], ga:[], et:[], s10:[], n:0 };
    if (p.GC) porBConc[b].gc.push(p.GC);
    if (p.GA) porBConc[b].ga.push(p.GA);
    if (p.ET) porBConc[b].et.push(p.ET);
    if (p.S10) porBConc[b].s10.push(p.S10);
    porBConc[b].n++;
  });
  document.getElementById('band-body').innerHTML = Object.keys(porBConc).sort().map(b => {
    const d = porBConc[b];
    const cor = BCOR[b] || '#8892a4';
    const rows = [['G.C',med(d.gc),'#4895ef'],['G.A',med(d.ga),'#f9c74f'],['ET',med(d.et),'#00e5a0'],['S10',med(d.s10),'#ff6b6b']]
      .filter(x => x[1]).map(x => `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--bd);font-size:.68rem;font-family:var(--mono)"><span style="color:${x[2]}">${x[0]}</span><span>${fmtShort(x[1])}</span></div>`).join('');
    return `<div class="bbox" style="text-align:left"><div class="bnome" style="color:${cor};margin-bottom:5px">${b}<span style="font-weight:400;font-size:.6rem;color:var(--tx3);margin-left:4px">${d.n}</span></div>${rows}</div>`;
  }).join('');

  // Por supervisor
  document.getElementById('reg-body').innerHTML = Object.keys(REGIONAIS).map(reg => {
    const postos = REGIONAIS[reg];
    const gc=[], ga=[], et=[], s10=[];
    postos.forEach(p => {
      const v = PRECOS[p];
      if (!v) return;
      if (v.GC) gc.push(v.GC);
      if (v.GA) ga.push(v.GA);
      if (v.ET) et.push(v.ET);
      if (v.S10) s10.push(v.S10);
    });
    const cor = SUP_COR[reg] || '#8892a4';
    const medP = gc.length ? fmtShort(med(gc)) : '--';
    return `<div class="regi">
      <div class="regnome" style="color:${cor}">Supervisor ${reg}</div>
      <div class="regpostos">${postos.slice(0,4).join(' · ')}${postos.length>4?' +'+(postos.length-4):''}</div>
      <div class="regprecos">
        ${gc.length?`<span class="regp" style="color:#4895ef">GC <b>${medP}</b></span>`:''}
        ${ga.length?`<span class="regp" style="color:#f9c74f">GA <b>${fmtShort(med(ga))}</b></span>`:''}
        ${et.length?`<span class="regp" style="color:#00e5a0">ET <b>${fmtShort(med(et))}</b></span>`:''}
      </div>
      <div>${postos.map(p => {
        const v = PRECOS[p];
        return `<div class="regrow"><span class="regpnome">${p}</span><span class="regpval">${v?.GC?fmt(v.GC):'—'}</span></div>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

// ═══ MAPA LEAFLET ═══
function initMapa() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  const el = document.getElementById('leaflet-map');
  if (!el) return;
  leafletMap = L.map('leaflet-map', { center:[-19.917,-43.960], zoom:11 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:19 }).addTo(leafletMap);
  // Legenda
  document.getElementById('map-legend').innerHTML = Object.entries(SUP_COR).map(([s,c]) =>
    `<span class="map-leg-item"><span class="map-leg-dot" style="background:${c}"></span>${s}</span>`
  ).join('');
  renderLeafletMarkers();
}

function renderLeafletMarkers() {
  if (!leafletMap) return;
  leafletMarkers.forEach(m => m.remove());
  leafletMarkers = [];
  MAP_POSTOS.filter(p => mapaFiltroSup === 'todos' || p.sup === mapaFiltroSup).forEach(p => {
    const dado = PRECOS[p.k];
    const preco = dado?.[mapaFuel];
    const cor = SUP_COR[p.sup] || '#8892a4';
    const icon = L.divIcon({
      className:'',
      html: `<div style="background:${cor};border:2px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 3px ${cor}50"></div>`,
      iconSize:[14,14], iconAnchor:[7,7], popupAnchor:[0,-10]
    });
    const precoStr = preco ? 'R$' + parseFloat(preco).toFixed(2).replace('.',',') : '—';
    const popup = `<div style="min-width:160px">
      <div style="font-weight:700;color:${cor};font-size:12px;margin-bottom:3px">${p.k}</div>
      <div style="color:#8892a4;font-size:10px;margin-bottom:2px">Sup. ${p.sup} · ${p.banda}</div>
      <div style="color:#5a6478;font-size:9px;margin-bottom:4px">📍 ${p.addr}</div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid #2a3040;padding-top:4px">
        <span style="color:#8892a4;font-size:10px">${{GC:'G.Comum',GA:'G.Aditivada',ET:'Etanol',S10:'Diesel S10'}[mapaFuel]||mapaFuel}</span>
        <span style="font-weight:700;color:${cor};font-size:12px">${precoStr}</span>
      </div>
      ${dado?.data?`<div style="color:#5a6478;font-size:9px;margin-top:2px">Coletado: ${dado.data}</div>`:''}
    </div>`;
    const marker = L.marker([p.lat, p.lng], { icon });
    marker.bindPopup(popup, { maxWidth:220 });
    marker.addTo(leafletMap);
    leafletMarkers.push(marker);
  });
}

function mapaFuelChange(f) { mapaFuel = f; renderLeafletMarkers(); }
function mapaSetSup(btn, sup) {
  document.querySelectorAll(".map-ftag[id^='mbtn-']").forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  mapaFiltroSup = sup;
  renderLeafletMarkers();
  if (leafletMap && sup !== 'todos') {
    const ps = MAP_POSTOS.filter(p => p.sup === sup);
    if (ps.length) leafletMap.fitBounds([
      [Math.min(...ps.map(p=>p.lat))-0.01, Math.min(...ps.map(p=>p.lng))-0.01],
      [Math.max(...ps.map(p=>p.lat))+0.01, Math.max(...ps.map(p=>p.lng))+0.01]
    ]);
  } else if (leafletMap) leafletMap.setView([-19.917,-43.960], 11);
}

// ═══ NAVEGAÇÃO ═══
function setTab(btn, id) {
  document.querySelectorAll('.nbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  document.getElementById('main').scrollTop = 0;
  if (id === 'ranking') renderRanking();
  if (id === 'regional') renderRegional();
  if (id === 'mapa') { setTimeout(initMapa, 100); }
}

function abrirMais() { document.getElementById('modal-mais').classList.add('open'); }
function fecharMaisBtn() { document.getElementById('modal-mais').classList.remove('open'); }
function fecharMais(e) { if (e.target === document.getElementById('modal-mais')) fecharMaisBtn(); }

function irPara(sub) {
  fecharMaisBtn();
  document.querySelectorAll('.nbtn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
  document.getElementById('s-mais').classList.add('active');
  document.getElementById('main').scrollTop = 0;
  const fn = { amostra:rAmostra, notif:rNotif, distribuidor:rDistribuidor, simulador:rSimulador, lancamento:rLancamento, relatorios:rRelatorios };
  if (fn[sub]) fn[sub]();
}

// ═══ MAIS+ SUBMODULES ═══
function rAmostra() {
  document.getElementById('mais-conteudo').innerHTML = '<div class="sdiv">Controle de amostras-testemunha</div>' +
    '<div style="padding:6px 8px;background:rgba(249,199,79,.08);border:1px solid rgba(249,199,79,.2);border-radius:8px;font-size:.68rem;color:var(--wn);margin-bottom:.75rem">Prazo legal: 90 dias — obrigatório reter amostra para defesa ANP</div>' +
    '<div class="card"><div class="chdr"><div class="ctitle">Amostras ativas</div></div><div class="cbody">' +
    [
      {posto:'P. JA',comb:'GC',coleta:'10/06/2026',prazo:'10/09/2026',obs:'Amostra 001-26',dr:92},
      {posto:'P. ITAPOA',comb:'ET',coleta:'05/05/2026',prazo:'05/08/2026',obs:'Amostra 002-26',dr:54},
      {posto:'P. URBANO FERRAZ',comb:'S10',coleta:'01/04/2026',prazo:'01/07/2026',obs:'Amostra 003-26',dr:19},
    ].map(a => {
      const pct = Math.max(0, Math.min(100, ((90-a.dr)/90)*100));
      const sc  = a.dr <= 0 ? 'vence' : a.dr <= 15 ? 'alerta' : 'ok';
      const bc  = a.dr <= 0 ? 'var(--dg)' : a.dr <= 15 ? 'var(--wn)' : 'var(--ok)';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--bd)">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:.78rem;font-weight:700">${a.posto} — ${a.comb}</span>
          <span style="font-size:.62rem;padding:2px 8px;border-radius:10px;background:rgba(0,229,160,.1);color:${bc}">${a.dr}d restantes</span>
        </div>
        <div style="font-size:.65rem;color:var(--tx3);margin-bottom:4px">${a.obs} · Coleta: ${a.coleta} · Prazo: ${a.prazo}</div>
        <div style="background:var(--bd);border-radius:3px;height:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;border-radius:3px;background:${bc}"></div>
        </div>
      </div>`;
    }).join('') + '</div></div>';
}

function rNotif() {
  document.getElementById('mais-conteudo').innerHTML = '<div class="sdiv">Alertas recentes</div>' +
    '<div class="card"><div class="cbody">' +
    '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd)">' +
    '<div style="width:32px;height:32px;border-radius:8px;background:rgba(255,77,109,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">📈</div>' +
    '<div><div style="font-size:.78rem;color:var(--tx)">Concorrente subiu G.C</div><div style="font-size:.68rem;color:var(--tx3)">Aguardando coleta do dia</div></div></div>' +
    '<div style="text-align:center;padding:1rem;color:var(--tx3);font-size:.75rem">Conecte os dados reais para ver alertas automáticos</div></div></div>';
}

function rDistribuidor() {
  document.getElementById('mais-conteudo').innerHTML = '<div class="sdiv">Custo por distribuidora</div>' +
    '<div class="card"><div class="cbody">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
    [['Ipiranga','#f9c74f','5,320','3,180','5,990'],['BR/Petrobras','#4db6ac','5,290','3,150','5,960'],['Shell','#e8c84a','5,260','3,120','5,930'],['ALE','#ff6b6b','5,310','3,160','5,980']].map(([n,c,gc,et,s10]) =>
      `<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:.75rem"><div style="font-size:.7rem;font-weight:700;color:${c};font-family:var(--mono);margin-bottom:5px">${n}</div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;border-bottom:1px solid var(--bd);padding:2px 0"><span style="color:var(--tx3)">G.C</span><span>R$${gc}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;border-bottom:1px solid var(--bd);padding:2px 0"><span style="color:var(--tx3)">ET</span><span>R$${et}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;padding:2px 0"><span style="color:var(--tx3)">S10</span><span>R$${s10}</span></div></div>`
    ).join('') + '</div></div></div>';
}

function rSimulador() {
  document.getElementById('mais-conteudo').innerHTML = '<div class="sdiv">Simulador de preço</div>' +
    '<div class="sim"><div class="simtitle">Se eu abaixar, compensa?</div>' +
    '<div class="simrow"><span class="simlbl">Preço atual (R$/L)</span><input class="siminput" type="number" id="sa" value="5.790" step="0.010" oninput="calcSim()"></div>' +
    '<div class="simrow"><span class="simlbl">Novo preço (R$/L)</span><input class="siminput" type="number" id="sn" value="5.750" step="0.010" oninput="calcSim()"></div>' +
    '<div class="simrow"><span class="simlbl">Volume diário (L)</span><input class="siminput" type="number" id="sv" value="5000" step="100" oninput="calcSim()"></div>' +
    '<div class="simres" id="simres"><div class="simreslbl">Impacto na margem diária</div><div class="simresval" id="srv">calculando...</div></div></div>';
  calcSim();
}
function calcSim() {
  const a = parseFloat(document.getElementById('sa')?.value||0);
  const n = parseFloat(document.getElementById('sn')?.value||0);
  const v = parseFloat(document.getElementById('sv')?.value||0);
  const el = document.getElementById('srv'); const box = document.getElementById('simres');
  if (!a||!n||!v||!el) return;
  const imp = (n-a)*v;
  el.textContent = (imp>=0?'+':'')+'R$'+imp.toFixed(2).replace('.',',')+'/dia';
  el.style.color = imp>=0?'var(--ok)':'var(--dg)';
  if (box) { box.style.borderColor=imp>=0?'rgba(0,229,160,.2)':'rgba(255,77,109,.2)'; box.style.background=imp>=0?'rgba(0,229,160,.06)':'rgba(255,77,109,.06)'; }
}

function rLancamento() {
  const proprios = Object.keys(PRECOS).filter(k => PRECOS[k].tipo === 'Próprio').sort();
  document.getElementById('mais-conteudo').innerHTML = '<div class="sdiv">Lançar preço do posto</div>' +
    '<div class="card"><div class="chdr"><div class="ctitle">Informe os preços praticados hoje</div></div><div class="cbody">' +
    `<select class="sel" id="posto-lanc" onchange="atualizarLanc()"><option value="">Selecione...</option>${proprios.map(p=>`<option>${p}</option>`).join('')}</select>` +
    '<div id="lanc-campos"><div class="empty">Selecione o posto</div></div></div></div>' +
    '<div class="card" id="lanc-comp-card" style="display:none"><div class="chdr"><div class="ctitle">Comparativo</div></div><div class="cbody" id="lanc-comp-body"></div></div>';
}
function atualizarLanc() {
  const posto = document.getElementById('posto-lanc')?.value;
  const campos = document.getElementById('lanc-campos');
  if (!posto||!campos) return;
  const v = PRECOS[posto] || {};
  campos.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:.75rem">` +
    ['GC','GA','ET','S10'].map(c => `<div><label style="display:block;font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--tx3);margin-bottom:2px;font-family:var(--mono)">${CL[c]||c}</label><input type="number" id="lanc-${c}" step="0.001" value="${v[c]?parseFloat(v[c]).toFixed(3):''}" style="width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);color:var(--tx);font-family:var(--mono);font-size:.88rem;padding:6px 8px;outline:none"></div>`).join('') +
    `</div><button onclick="salvarLanc('${posto}')" style="width:100%;background:var(--ac);color:#0a0d0f;border:none;border-radius:var(--r);font-family:var(--mono);font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:.75rem;cursor:pointer">Salvar Preços</button>`;
}
function salvarLanc(posto) {
  if (!PRECOS[posto]) PRECOS[posto] = { tipo:'Próprio' };
  ['GC','GA','ET','S10'].forEach(c => {
    const el = document.getElementById('lanc-'+c);
    if (el && el.value) PRECOS[posto][c] = parseFloat(el.value);
  });
  renderComp(); renderKPIs(); renderHeatmap();
  showToast('Preços salvos!', 'P. ' + posto + ' atualizado');
  const card = document.getElementById('lanc-comp-card'); const body = document.getElementById('lanc-comp-body');
  if (!card||!body) return;
  card.style.display = 'block';
  const bloco = PRECOS[posto].bloco || '';
  const concs = bloco ? Object.keys(PRECOS).filter(k => PRECOS[k].tipo === 'Concorrente' && PRECOS[k].bloco === bloco) : [];
  body.innerHTML = concs.slice(0,4).map(cn => {
    const cv = PRECOS[cn];
    const cor = BCOR[cv.bandeira]||'#8892a4';
    return `<div style="margin-bottom:7px;padding:8px;background:var(--sf2);border:1px solid var(--bd);border-radius:8px"><div style="font-size:.7rem;font-weight:700;color:${cor};font-family:var(--mono);margin-bottom:5px">${cn}</div>` +
      ['GC','GA','ET','S10'].map(cb => {
        const vm = PRECOS[posto][cb], vc = cv[cb]; if (!vm&&!vc) return '';
        const diff = vm&&vc ? vm-vc : null;
        return `<div class="pr"><span class="prc">${CL[cb]||cb}</span><span style="display:flex;gap:5px;align-items:center"><span style="color:var(--ac);font-family:var(--mono)">${vm?fmt(vm):'—'}</span><span style="color:var(--tx3);font-size:.6rem">vs</span><span style="color:var(--tx2)">${vc?fmt(vc):'—'}</span>${diff?`<span style="font-size:.62rem;color:${diff>0.005?'var(--dg)':diff<-0.005?'var(--ok)':'var(--tx3)'};">${diff>=0?'+':''}${diff.toFixed(3)}</span>`:''}</span></div>`;
      }).join('') + '</div>';
  }).join('') || '<div class="empty">Sem concorrentes</div>';
}

function rRelatorios() {
  document.getElementById('mais-conteudo').innerHTML = '<div class="sdiv">Relatórios comerciais</div>' +
    '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:.85rem;margin-bottom:.65rem"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><div style="width:34px;height:34px;border-radius:8px;background:rgba(72,149,239,.15);display:flex;align-items:center;justify-content:center;font-size:18px">📈</div><div><div style="font-size:.82rem;font-weight:500">Mix Gasolina Aditivada</div><div style="font-size:.68rem;color:var(--tx3)">% sobre total de gasolinas — rede JBRETAS</div></div></div><div style="display:flex;flex-direction:column;gap:3px"><div style="display:flex;justify-content:space-between;font-size:.7rem;font-family:var(--mono)"><span style="color:var(--tx3)">P. JA (Octapro)</span><span style="font-weight:700">38,2%</span></div><div style="display:flex;justify-content:space-between;font-size:.7rem;font-family:var(--mono)"><span style="color:var(--tx3)">Média da rede</span><span style="font-weight:700;color:var(--ac)">24,1%</span></div></div></div>' +
    '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:.85rem"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><div style="width:34px;height:34px;border-radius:8px;background:rgba(249,199,79,.12);display:flex;align-items:center;justify-content:center;font-size:18px">🛢️</div><div><div style="font-size:.82rem;font-weight:500">Relatório Óleo Soutag</div><div style="font-size:.68rem;color:var(--tx3)">Vendas acumuladas — jun/2026</div></div></div><div style="display:flex;flex-direction:column;gap:3px"><div style="display:flex;justify-content:space-between;font-size:.7rem;font-family:var(--mono)"><span style="color:var(--tx3)">Litros vendidos</span><span style="font-weight:700">2.840 L</span></div><div style="display:flex;justify-content:space-between;font-size:.7rem;font-family:var(--mono)"><span style="color:var(--tx3)">Margem média</span><span style="font-weight:700;color:var(--ok)">R$6,50/L</span></div></div></div>';
}

// ═══ TOAST ═══
function showToast(title, msg) {
  const t = document.getElementById('toast');
  document.getElementById('t-title').textContent = title;
  document.getElementById('t-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// SW register
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
