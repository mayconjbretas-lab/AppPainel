// ══════════════════════════════════════════════════
// CONFIGURAÇÃO — troque pelo ID da implantação ativa
// ══════════════════════════════════════════════════

// Credenciais ADM (validadas localmente — sem expor no Apps Script)


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
let markerCluster = null; // agrupa marcadores próximos numa bolha — sem isso, postos com
                           // coordenadas parecidas (mesma região de BH) ficavam empilhados
                           // um em cima do outro e só o de cima aparecia no mapa

// Controle de Inicialização e Sessão
// Intervalo de atualização automática (5 minutos)
const INTERVALO_ATUALIZACAO = 5 * 60 * 1000;
let _autoRefreshTimer = null;

function iniciarAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(() => {
    // Só atualiza se o app estiver visível e o usuário logado
    if (!document.hidden && localStorage.getItem('jb_adm_user')) {
      carregarDados();
    }
  }, INTERVALO_ATUALIZACAO);
}

// ════════════════════════════════════════════════════════════
// TEMA CLARO/ESCURO — sol/lua
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

// Aplica o tema salvo (ou escuro por padrão) antes de tudo, para evitar flash
(function() {
  const temaSalvo = localStorage.getItem('jb_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', temaSalvo);
})();

window.addEventListener('DOMContentLoaded', () => {
  // Sincroniza o ícone do botão com o tema já aplicado
  const temaSalvo = localStorage.getItem('jb_theme') || 'dark';
  aplicarTema(temaSalvo);

  const salvo = localStorage.getItem('jb_adm_user');
  if(salvo) {
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

// Atualiza quando o usuário volta para a aba após ficar ausente
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && localStorage.getItem('jb_adm_user')) {
    // Se ficou mais de 5 min fora, atualiza ao voltar
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
  if(u) {
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

// Requisições e Sincronização em Tempo Real (Sheet API)
async function carregarDados() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('upd-txt').textContent = 'Buscando do banco real...';
  try {
    const res = await fetch(API_URL + '?tipo=precos');
    const json = await res.json();
    
    if(json && json.success && json.data) {
      G_DADOS = json.data;
      processarDadosReais();
      carregarComparacaoOntem().then(renderComparar); // atualiza os "vs ontem" assim que chegar, sem travar o resto
      showToast('Dados Atualizados', 'Informações coletadas em tempo real com sucesso.');
    } else {
      fallback('Erro na estrutura retornada do Apps Script.');
    }
  } catch(e) {
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
  
  for(let p in POSTOS_DADOS) {
    G_DADOS.prop[p] = {
      GC: 5.49, GA: 5.69, ET: 3.59, S10: 5.99,
      data: agora, responsavel: 'Sistema Local'
    };
    G_DADOS.conc[p] = {};
    for(let c in POSTOS_DADOS[p].conc) {
      G_DADOS.conc[p][c] = {
        GC: 5.39 + Math.random()*0.3,
        GA: 5.59 + Math.random()*0.3,
        ET: 3.49 + Math.random()*0.3,
        S10: 5.89 + Math.random()*0.3,
        data: agora
      };
    }
  }
  processarDadosReais();
}

// ════════════════════════════════════════════════════════════
// MÉDIA HIERÁRQUICA — posto → supervisor (regional) → geral
// ────────────────────────────────────────────────────────────
// Por que não é média simples de todos os registros:
// um posto com 7 concorrentes não pode pesar 3,5x mais que um
// posto com 2, e uma região com mais postos coletados não pode
// puxar a média geral para o seu lado. Cada nível conta 1x.
//
// Nível 1 — por posto:       média de GC dos concorrentes daquele posto
// Nível 2 — por supervisor:  média das médias dos postos daquele supervisor
// Nível 3 — geral da rede:   média das médias dos supervisores
//
// O nosso próprio preço (G_DADOS.prop) nunca entra aqui —
// esta função só recebe concPlano (concorrentes).
// ════════════════════════════════════════════════════════════
function calcularMediaHierarquica(concPlano) {
  // Nível 1: agrupa GC dos concorrentes por POSTO (campo "bloco")
  const porPosto = {}; // { bloco: [gc1, gc2, ...] }
  for (let nome in concPlano) {
    const item = concPlano[nome];
    if (!item || !item.GC) continue;
    const bloco = item.bloco || 'SEM_BLOCO';
    if (!porPosto[bloco]) porPosto[bloco] = { valores: [], sup: item.supervisor || '', nomes: [] };
    porPosto[bloco].valores.push(parseFloat(item.GC));
    porPosto[bloco].nomes.push(nome);
  }

  // Nível 1 → calcula a média de cada posto
  const mediaPorPosto = {}; // { bloco: { media, sup, qtd, nomes } }
  for (let bloco in porPosto) {
    const arr = porPosto[bloco].valores;
    const media = arr.reduce((s, v) => s + v, 0) / arr.length;
    mediaPorPosto[bloco] = { media, sup: porPosto[bloco].sup, qtd: arr.length, nomes: porPosto[bloco].nomes };
  }

  // Nível 2: agrupa as médias de posto por SUPERVISOR
  const porSupervisor = {}; // { sup: [{bloco, media}, ...] }
  for (let bloco in mediaPorPosto) {
    const { media, sup } = mediaPorPosto[bloco];
    if (!sup) continue;
    if (!porSupervisor[sup]) porSupervisor[sup] = [];
    porSupervisor[sup].push({ bloco, media });
  }

  // Nível 2 → calcula a média regional de cada supervisor
  const mediaPorSupervisor = {}; // { sup: { media, postos: [...] } }
  for (let sup in porSupervisor) {
    const arr = porSupervisor[sup];
    const media = arr.reduce((s, x) => s + x.media, 0) / arr.length;
    mediaPorSupervisor[sup] = { media, postos: arr };
  }

  // Nível 3: média geral = média das médias regionais
  const supKeys = Object.keys(mediaPorSupervisor);
  if (supKeys.length === 0) {
    G_MEDIA_DETALHE = null;
    return null;
  }
  const mediaGeral = supKeys.reduce((s, k) => s + mediaPorSupervisor[k].media, 0) / supKeys.length;

  // Salva o detalhamento completo para exibição no modal
  G_MEDIA_DETALHE = { mediaPorPosto, mediaPorSupervisor, mediaGeral };
  return mediaGeral;
}

let G_MEDIA_DETALHE = null;

function abrirDetalheMedia() {
  document.getElementById('modal-media').classList.add('open');
  renderDetalheMedia();
}
function fecharMedia(e) {
  if (e.target.id === 'modal-media') fecharMediaBtn();
}
function fecharMediaBtn() {
  document.getElementById('modal-media').classList.remove('open');
}

function renderDetalheMedia() {
  const body = document.getElementById('media-detalhe-body');
  if (!G_MEDIA_DETALHE) {
    body.innerHTML = '<div class="empty">Sem dados de concorrentes coletados hoje.</div>';
    return;
  }
  const { mediaPorSupervisor, mediaGeral } = G_MEDIA_DETALHE;
  const SUPCOR = {Mauricio:'#00e5a0',Paulo:'#4895ef',Fabricio:'#f9c74f',Gledson:'#c77dff',Rodrigo:'#ff6b6b'};

  let html = `<div class="ccard" style="margin-bottom:.6rem;text-align:center">
    <div class="cclbl">MÉDIA GERAL DA REDE (Nível 3)</div>
    <div style="font-family:var(--mono);font-size:1.4rem;font-weight:700;color:var(--inf)">R$ ${mediaGeral.toFixed(3).replace('.',',')}</div>
    <div style="font-size:.62rem;color:var(--tx3)">Média das ${Object.keys(mediaPorSupervisor).length} médias regionais abaixo</div>
  </div>`;

  for (let sup in mediaPorSupervisor) {
    const { media, postos } = mediaPorSupervisor[sup];
    const cor = SUPCOR[sup] || '#8892a4';
    html += `<div class="reg-sup" style="margin-bottom:.5rem">
      <div class="reg-sup-hdr">
        <div class="reg-sup-nome" style="color:${cor}">${sup} <span style="font-size:.6rem;color:var(--tx3);font-weight:400">(Nível 2 — regional)</span></div>
        <div style="font-family:var(--mono);font-weight:700;color:${cor}">R$ ${media.toFixed(3).replace('.',',')}</div>
      </div>
      <div class="reg-posto-list">`;
    postos.forEach(p => {
      html += `<div class="reg-posto"><span>P. ${p.bloco}</span><span style="font-family:var(--mono)">R$ ${p.media.toFixed(3).replace('.',',')}</span></div>`;
    });
    html += `</div></div>`;
  }

  body.innerHTML = html;
}

// Apelidos conhecidos — postos que mudaram de nome ou que a planilha grava
// diferente do nome cadastrado, sem nenhuma relação de texto pra um match
// automático (acento/prefixo) conseguir achar sozinho. Chave já em formato
// normalizado (sem acento, maiúsculo).
const ALIASES_POSTO = {
  'BEATRIZ': 'PAIVA E PAIVA COMBUSTIVEL',
};

// Remove acentos pra comparação — "ANA LÚCIA" e "ANA LUCIA" têm que ser
// reconhecidos como o mesmo posto, mesmo vindo digitados diferente na planilha.
function normalizarTexto(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

// Acha o nome canônico (chave de POSTOS_DADOS) pra um nome vindo da planilha,
// em 4 tentativas progressivas:
// 0) apelido manual cadastrado (ALIASES_POSTO)
// 1) match exato
// 2) match ignorando acento
// 3) match por prefixo (resolve nome abreviado tipo "LOURA" → "LOURA EMPREENDIMENTOS"),
//    só aceito se achar EXATAMENTE 1 candidato — evita casar errado entre dois postos
//    que comecem parecido.
function encontrarPostoCanonico(nomeOriginal) {
  const semP = String(nomeOriginal).replace(/^P\.\s*/i, '').trim();
  const semPNorm = normalizarTexto(semP);
  const candidatos = Object.keys(POSTOS_DADOS);

  if (ALIASES_POSTO[semPNorm] && POSTOS_DADOS[ALIASES_POSTO[semPNorm]]) {
    return ALIASES_POSTO[semPNorm];
  }

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
  // ── Postos próprios: normaliza chave removendo "P. " ──────────
  const propPlano = G_DADOS.prop || {};
  const propMapeado = {};
  for (let k in propPlano) {
    // Mantém a chave original E uma versão sem "P. " para lookup
    propMapeado[k] = propPlano[k];
    const found = encontrarPostoCanonico(k);
    if (found && found !== k) propMapeado[found] = propPlano[k];
  }
  G_DADOS.prop = propMapeado;

  // ── Concorrentes: mantém formato plano {nomeConcorrente: dados} ─
  // Mas TAMBÉM cria índice por bloco (supervisor/posto) para renderComp
  // G_DADOS.concPorBloco = { bloco: { nomeConcorrente: dados } }
  const concPlano = G_DADOS.conc || {};
  const concPorBloco = {}; // agrupado por bloco (ex: "DIFERENCIAL")
  const concPorPosto = {}; // agrupado por postoAlvo do próprio (ex: "P. DIFERENCIAL")

  for (let nomeConcorrente in concPlano) {
    const d = concPlano[nomeConcorrente];
    const bloco = d.bloco || '';
    const supervisor = d.supervisor || '';
    if (!concPorBloco[bloco]) concPorBloco[bloco] = {};
    concPorBloco[bloco][nomeConcorrente] = d;
    // Tenta mapear para posto próprio pelo bloco
    for (let posto in POSTOS_DADOS) {
      const pd = POSTOS_DADOS[posto];
      // Match pelo nome do concorrente na lista do posto
      if (pd.conc && pd.conc[nomeConcorrente]) {
        if (!concPorPosto[posto]) concPorPosto[posto] = {};
        concPorPosto[posto][nomeConcorrente] = d;
      }
    }
  }
  G_DADOS.concPlano   = concPlano;
  G_DADOS.concPorBloco = concPorBloco;
  G_DADOS.concPorPosto = concPorPosto;

  // ── KPIs ──────────────────────────────────────────────────────
  const contProp = Object.keys(G_DADOS.prop).filter(k => propPlano[k]).length || Object.keys(propPlano).length;
  const contConc = Object.keys(concPlano).length;
  const totalPostosRede = Object.keys(POSTOS_DADOS).length; // total cadastrado (37)
  document.getElementById('kv-proprios').textContent = Object.keys(propPlano).length;
  const subEl = document.getElementById('kv-proprios-sub');
  if (subEl) {
    const faltam = totalPostosRede - Object.keys(propPlano).length;
    subEl.textContent = faltam > 0 ? `de ${totalPostosRede} · faltam ${faltam}` : `de ${totalPostosRede} · completo ✓`;
  }
  document.getElementById('kv-concs').textContent = contConc;

  // ── Média GC Concorrentes — hierárquica (posto → supervisor → geral) ──
  // Evita que um posto com 7 concorrentes pese mais que um com 2,
  // e que uma região com mais postos pese mais que outra.
  // Nosso próprio preço NUNCA entra nessa conta — só concorrentes.
  const mediaGcConcorrentes = calcularMediaHierarquica(concPlano);
  document.getElementById('kv-gc').textContent = mediaGcConcorrentes !== null
    ? 'R$ ' + mediaGcConcorrentes.toFixed(2) : '--';

  // ── Nosso GC médio — média simples dos postos próprios coletados ──
  let somaGcProp = 0, cGcProp = 0;
  for (let k in propPlano) {
    if (propPlano[k].GC) { somaGcProp += parseFloat(propPlano[k].GC); cGcProp++; }
  }
  document.getElementById('kv-mgc').textContent = cGcProp > 0 ? 'R$ ' + (somaGcProp/cGcProp).toFixed(2) : '--';
  
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  document.getElementById('upd-txt').textContent = `Atualizado às ${hh}:${mm} · próxima em 5min`;
  document.getElementById('live-txt').textContent = 'ao vivo';
  
  povoarSelects();
  renderComparar();
  renderHeatmap();
  renderRanking();
  renderRegional();
  renderMapa(); // Renderiza ou atualiza os marcadores dinâmicos do Leaflet
}

function povoarSelects() {
  const lista = Object.keys(POSTOS_DADOS).sort();

  // Select da tela de Logística (mesma lista de postos)
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

  // Filtros da nova aba Comparar: posto específico, supervisor e bandeira
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

// Renderização de Abas (Tabs) e Modais
function setTab(btn, tab) {
  document.querySelectorAll('.nbtn').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.scr').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('s-' + tab).classList.add('active');
  if(tab === 'mapa') setTimeout(() => { initLeafletInstance(); }, 150);
  if(tab === 'hist') { povoarHistPosto(); }
}

function abrirMais() {
  document.getElementById('modal-mais').classList.add('open');
}
function fecharMais(e) {
  if(e.target.id === 'modal-mais') fecharMaisBtn();
}
function fecharMaisBtn() {
  document.getElementById('modal-mais').classList.remove('open');
}

function irPara(modulo) {
  fecharMaisBtn();

  // Logística tem seção própria (não é um módulo dentro de "Mais+")
  if (modulo === 'logistica') {
    document.querySelectorAll('.nbtn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.scr').forEach(x => x.classList.remove('active'));
    document.getElementById('s-logistica').classList.add('active');
    return;
  }

  document.querySelectorAll('.nbtn').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.scr').forEach(x => x.classList.remove('active'));
  document.getElementById('s-mais').classList.add('active');
  
  const ctx = document.getElementById('mais-conteudo');
  if(modulo === 'amostra') renderAmostra(ctx);
  else if(modulo === 'notif') renderNotif(ctx);
  else if(modulo === 'distribuidor') renderDist(ctx);
  else if(modulo === 'simulador') renderSim(ctx);
  else if(modulo === 'lancamento') renderLanc(ctx);
  else if(modulo === 'relatorios') renderRel(ctx);
}

// ════════════════════════════════════════════════════════════
// COMPARAR — Monitor de Preços (fuel tabs, estratégia, cards por posto)
// ════════════════════════════════════════════════════════════
// Nota: "Rede" do modelo de referência foi unificado com "Bandeira" aqui,
// porque na base real (POSTOS_DADOS / Coleta de Preços) os concorrentes
// só carregam um único campo de bandeira — não existe um campo separado
// de rede independente (ex: "Rede Flex") distinto da bandeira oficial.
const CMP_FUELS = [
  {key:'ET',   label:'Etanol'},
  {key:'GC',   label:'Comum'},
  {key:'GA',   label:'Aditiv.'},
  {key:'S10',  label:'Diesel S10'},
  {key:'S500', label:'Diesel S500'},
];
const CMP_STRATS = [
  {key:'agg',  label:'Agressivo', desc:'1 centavo abaixo do concorrente mais barato — ganha volume.'},
  {key:'avg',  label:'Na média',  desc:'Média dos concorrentes coletados — equilíbrio.'},
  {key:'prem', label:'Premium',   desc:'1 centavo acima do mais caro — protege margem.'},
];
let G_CMP_FUEL  = 'GC';
let G_CMP_STRAT = 'avg';
let G_CMP_SUP   = '';
let G_CMP_BAND  = '';
let G_CMP_POSTO = '';     // filtro por posto específico — "Minha média" recalcula só pra ele
let G_CMP_SO_MUDOU = false; // mostra só concorrentes cujo preço mudou desde ontem
let G_ONTEM_MAP = {};     // { 'GC': {nomeConcorrente: precoOntem}, 'ET': {...}, ... }

function montarFuelTabsComparar() {
  const wrap = document.getElementById('cmp-fuel-tabs');
  if (!wrap) return;
  wrap.innerHTML = CMP_FUELS.map(f =>
    `<button class="fueltab${f.key===G_CMP_FUEL?' active':''}" onclick="cmpSetFuel('${f.key}')">${f.label}</button>`
  ).join('');
}

function montarStratTabsComparar() {
  const wrap = document.getElementById('cmp-strat-tabs');
  if (!wrap) return;
  wrap.innerHTML = CMP_STRATS.map(s =>
    `<button class="strat-tab${s.key===G_CMP_STRAT?' active':''}" onclick="cmpSetStrat('${s.key}')">${s.label}</button>`
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

function formatarDataBR(d) {
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

// Busca os preços de ONTEM (via tipo=historico, sem filtro de posto) e monta
// um mapa por combustível → nome do concorrente → preço, pra renderComparar
// poder calcular "mudou desde ontem" sem precisar de nenhuma coluna nova
// no Apps Script. Roda em paralelo com carregarDados, não trava a tela.
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
      if (r.tipo === 'Próprio') return; // comparação é só entre concorrentes
      CMP_FUELS.forEach(f => {
        if (r[f.key]) mapa[f.key][r.postoAlvo] = parseFloat(r[f.key]);
      });
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
    if (G_CMP_POSTO && p !== G_CMP_POSTO)         return false;
    if (G_CMP_SUP  && e.sup       !== G_CMP_SUP)  return false;
    if (G_CMP_BAND && e.bandeira  !== G_CMP_BAND) return false;
    return true;
  }).sort();

  let somaMinha = 0, contMinha = 0;
  let somaConc  = 0, contConc  = 0;
  let cardsHtml = '';

  postos.forEach(posto => {
    const estru = POSTOS_DADOS[posto] || {};
    const dadosProp = G_DADOS.prop[posto] || G_DADOS.prop['P. '+posto] || null;
    const ownVal = (dadosProp && dadosProp[fuel]) ? parseFloat(dadosProp[fuel]) : null;

    // Mesma lógica de busca de concorrentes que o painel já usava: por posto, complementado por bloco
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

    if (ownVal === null && competidores.length === 0) return; // nada pra mostrar nesse combustível, pula o card

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
        let diffHtml = '';
        if (ownVal !== null) {
          const d = c.preco - ownVal;
          const igual = Math.abs(d) < 0.005;
          const cor = igual ? 'var(--wn)' : (d < 0 ? 'var(--dg)' : 'var(--ok)');
          const txt = igual ? 'igual' : (d > 0 ? '+' : '') + Math.round(d * 100) + 'c';
          diffHtml = `<span class="complist-diff" style="color:${cor}">${txt}</span>`;
        }
        let vsOntemHtml = '';
        if (c.ontem !== null) {
          const dOntem = c.preco - c.ontem;
          if (Math.abs(dOntem) >= 0.005) {
            const corOntem = dOntem > 0 ? 'var(--dg)' : 'var(--ok)';
            const seta = dOntem > 0 ? '' : '↓';
            vsOntemHtml = ` <span style="font-size:.62rem;color:${corOntem}">${seta}${Math.abs(Math.round(dOntem*100))}c vs ontem</span>`;
          }
        }
        listHtml += `<div class="complist-row"><span class="complist-nome">${c.nome}${vsOntemHtml}</span><span><span class="complist-preco">R$ ${c.preco.toFixed(2)}</span>${diffHtml}</span></div>`;
      });
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

function renderHeatmap() {
  const body = document.getElementById('heatmap-body');
  let arr = [];
  for(let p in G_DADOS.prop) {
    if(G_DADOS.prop[p].GC > 0) arr.push(parseFloat(G_DADOS.prop[p].GC));
  }
  if(arr.length === 0) {
    body.innerHTML = '<div class="empty">Sem dados</div>';
    return;
  }
  arr.sort((a,b)=>a-b);
  const min = arr[0], max = arr[arr.length-1];
  const dif = max - min || 1;
  
  body.innerHTML = '';
  for(let p in G_DADOS.prop) {
    const val = G_DADOS.prop[p].GC;
    if(!val || val <= 0) continue;
    const pct = (parseFloat(val) - min) / dif;
    let cor = 'var(--ok)';
    if(pct > 0.35 && pct <= 0.7) cor = 'var(--wn)';
    else if(pct > 0.7) cor = 'var(--dg)';
    
    const cell = document.createElement('div');
    cell.className = 'hcell';
    cell.style.background = cor;
    cell.title = `${p}: R$ ${parseFloat(val).toFixed(2)}`;
    cell.onclick = () => {
      setTab(document.querySelectorAll('.nbtn')[0], 'comp');
      G_CMP_SUP = '';
      G_CMP_BAND = '';
      G_CMP_POSTO = '';
      G_CMP_FUEL = 'GC';
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
  r.querySelectorAll('.ftag').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  G_FILTRO_SUP = sup;
  renderRanking();
}

function renderRanking() {
  const body = document.getElementById('rank-body');
  let list = [];
  
  // Usa concPlano (formato plano direto da API) + filtra por supervisor
  const concPlano = G_DADOS.concPlano || G_DADOS.conc || {};
  for (let nome in concPlano) {
    const item = concPlano[nome];
    if (!item || !item.GC) continue;
    const sup = item.supervisor || '';
    if (G_FILTRO_SUP !== 'todos' && sup !== G_FILTRO_SUP) continue;
    list.push({
      nome:   nome,
      postoP: item.bloco || '',
      banda:  item.bandeira || 'B. Branca',
      sup:    sup,
      preco:  parseFloat(item.GC)
    });
  }
  
  document.getElementById('rank-count').textContent = `${list.length} concorrentes mapeados`;
  if(list.length === 0) {
    body.innerHTML = '<div class="empty">Nenhum dado para este filtro</div>';
    return;
  }
  list.sort((a,b)=>a.preco-b.preco);
  
  let html = '';
  list.forEach((x, idx) => {
    let corDot = 'var(--wn)';
    if(idx < list.length * 0.2) corDot = 'var(--ok)';
    else if(idx > list.length * 0.8) corDot = 'var(--dg)';
    
    html += `<div class="ritem">
      <div class="rnum">#${idx+1}</div>
      <div class="rdot" style="background:${corDot}"></div>
      <div class="rinfo">
        <div class="rnome">${x.nome}</div>
        <div class="rbanda">${x.banda} • Ref: P. ${x.postoP}</div>
      </div>
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
    if(!bData[x.banda]) bData[x.banda] = {soma:0, c:0};
    bData[x.banda].soma += x.preco;
    bData[x.banda].c++;
  });
  let html = '';
  for(let b in bData) {
    const med = bData[b].soma / bData[b].c;
    html += `<div class="bbox"><div class="bbnome">${b}</div><div class="bbval">R$ ${med.toFixed(2)}</div><div style="font-size:.55rem;color:var(--tx3)">${bData[b].c} postos</div></div>`;
  }
  body.innerHTML = html || '<div class="empty">Sem dados</div>';
}

function renderDeslocados() {
  const body = document.getElementById('deslocado-body');
  let html = '';
  let totalGc = 0, cGc = 0;
  for(let p in G_DADOS.prop) {
    if(G_DADOS.prop[p].GC > 0) { totalGc += parseFloat(G_DADOS.prop[p].GC); cGc++; }
  }
  if(cGc === 0) {
    body.innerHTML = '<div class="empty">Sem dados de média de rede</div>';
    return;
  }
  const mediaRede = totalGc / cGc;
  for(let p in G_DADOS.prop) {
    const v = parseFloat(G_DADOS.prop[p].GC);
    if(!v || v <= 0) continue;
    const diff = v - mediaRede;
    if(Math.abs(diff) >= 0.15) {
      const sColor = diff > 0 ? 'var(--dg)' : 'var(--inf)';
      html += `<div class="ritem">
        <div class="rinfo">
          <div class="rnome">P. ${p}</div>
          <div class="rbanda">Desvio de ${diff > 0 ? '+' : ''}${diff.toFixed(2)} da média da rede</div>
        </div>
        <div class="rpreco" style="color:${sColor}">R$ ${v.toFixed(2)}</div>
      </div>`;
    }
  }
  body.innerHTML = html || '<div class="empty">Nenhum posto com desvio crítico (>= R$ 0.15) detectado.</div>';
}

function renderRegional() {
  const bandBody = document.getElementById('band-body');
  const regBody = document.getElementById('reg-body');
  
  let bData = {};
  const concPlanoReg = G_DADOS.concPlano || G_DADOS.conc || {};
  for (let nome in concPlanoReg) {
    const item = concPlanoReg[nome];
    if (!item || !item.GC) continue;
    const b = item.bandeira || 'Bandeira Branca';
    if (!bData[b]) bData[b] = {s:0, c:0};
    bData[b].s += parseFloat(item.GC); bData[b].c++;
  }
  let htmlB = '';
  for(let b in bData) {
    htmlB += `<div class="bbox"><div class="bbnome">${b}</div><div class="bbval">R$ ${(bData[b].s/bData[b].c).toFixed(2)}</div></div>`;
  }
  bandBody.innerHTML = htmlB || '<div class="empty">Sem dados</div>';
  
  let sData = {};
  for(let p in G_DADOS.prop) {
    const sup = POSTOS_DADOS[p] ? POSTOS_DADOS[p].sup : 'Sem Sup';
    const v = parseFloat(G_DADOS.prop[p].GC);
    if(v > 0) {
      if(!sData[sup]) sData[sup] = [];
      sData[sup].push({n:p, v:v});
    }
  }
  let htmlS = '';
  for(let sup in sData) {
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

// 🗺️ INTEGRAÇÃO DO MAPA LEAFLET COM DADOS EM TEMPO REAL
function initLeafletInstance() {
  if (leafletMap !== null) {
    leafletMap.invalidateSize();
    return;
  }
  // Centraliza em BH / Contagem
  leafletMap = L.map('leaflet-map', {zoomControl: false}).setView([-19.92, -43.96], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OSM ©CARTO', subdomains:'abcd', maxZoom:19
  }).addTo(leafletMap);

  markerCluster = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        // Por padrão o plugin some com marcadores fora da área visível atual
        // (otimização de performance) — com só ~37 postos isso não pesa nada,
        // e era a causa de postos mais distantes (ex: PAIVA E PAIVA, ~140km
        // ao sul) nunca aparecerem mesmo estando corretamente no grupo.
        removeOutsideVisibleBounds: false
      })
    : null;
  if (markerCluster) leafletMap.addLayer(markerCluster);

  renderMapa();
}

function mapaFuelChange(val) {
  G_MAPA_FUEL = val;
  renderMapa();
}

function mapaSetSup(btn, sup) {
  document.querySelectorAll('.map-ftag').forEach(x=>x.classList.remove('on'));
  btn.classList.add('on');
  G_MAPA_SUP = sup;
  renderMapa();
}

function renderMapa() {
  if (!leafletMap) return;
  
  if (markerCluster) markerCluster.clearLayers();
  else mapMarkers.forEach(m => leafletMap.removeLayer(m));
  mapMarkers = [];
  
  let precosValidos = [];
  let contColetados = 0, contSemColeta = 0;
  const SUPCOR_MAP = {Mauricio:'#00e5a0',Paulo:'#4895ef',Fabricio:'#f9c74f',Gledson:'#c77dff',Rodrigo:'#ff6b6b'};

  // Índice: chave normalizada → dados da API
  const propDados = (G_DADOS && G_DADOS.prop) ? G_DADOS.prop : {};
  
  // Monta índice de lookup: "NOME_SEM_P" → dados
  const propIndex = {};
  Object.keys(propDados).forEach(k => {
    const norm = k.replace(/^P\.\s*/i,'').trim().toUpperCase();
    propIndex[norm] = propDados[k];
    propIndex[k.toUpperCase()] = propDados[k]; // também chave original
  });

  // ── 1. Todos os postos do MAP_POSTOS (base fixa com coordenadas) ──
  MAP_POSTOS.forEach(posto => {
    if (G_MAPA_SUP !== 'todos' && posto.sup !== G_MAPA_SUP) return;

    // Lookup: tenta "BERNARDO", "P. BERNARDO", "P. BOMBOM MATRIZ", etc.
    const d = propIndex[posto.ap.toUpperCase()]
           || propIndex[posto.k.toUpperCase()]
           || propIndex[('P. ' + posto.k).toUpperCase()]
           || null;

    const temColeta = d !== null;
    
    // Filtro com/sem coleta
    if (G_MAPA_COLETA === 'coletados'  && !temColeta) return;
    if (G_MAPA_COLETA === 'semcoleta'  &&  temColeta) return;

    // Coordenadas: usa lat/lng da API se existir, senão usa as fixas do MAP_POSTOS
    const lat = (d && d.lat && !isNaN(parseFloat(d.lat))) ? parseFloat(d.lat) : posto.lat;
    const lng = (d && d.lng && !isNaN(parseFloat(d.lng))) ? parseFloat(d.lng) : posto.lng;
    if (!lat || !lng) return;

    const sup   = (d && d.supervisor) || posto.sup;
    const banda = (d && d.bandeira)   || posto.banda;
    const cor   = SUPCOR_MAP[sup] || '#8892a4';

    let iconHtml, preco;
    if (temColeta) {
      contColetados++;
      preco = d[G_MAPA_FUEL];
      const precoExibir = preco ? 'R$' + parseFloat(preco).toFixed(2) : '--';
      if (preco) precosValidos.push(parseFloat(preco));
      iconHtml = `<div class="custom-marker" style="border-color:${cor};background:#0d1a12">
        <div class="m-name" style="color:${cor}">${posto.ap}</div>
        <div class="m-price" style="color:#fff">${precoExibir}</div>
      </div>`;
    } else {
      contSemColeta++;
      iconHtml = `<div class="custom-marker" style="border-color:#333;background:#0d0f12;opacity:.6">
        <div class="m-name" style="color:#5a6478">${posto.ap}</div>
        <div class="m-price" style="color:#3a4355;font-size:9px">⏳ aguardando</div>
      </div>`;
    }

    const cIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [72, 34], iconAnchor: [36, 17] });
    const marker = L.marker([lat, lng], { icon: cIcon });
    if (markerCluster) markerCluster.addLayer(marker); else marker.addTo(leafletMap);

    marker.on('click', () => {
      const dtxt = (d && d.data) ? ` · ${d.data} ${d.hora||''}` : '';
      let dHtml = `<div class="card" style="margin-top:.5rem"><div class="chdr">
        <div class="ctitle" style="color:${cor}">${posto.ap}</div>
        <div class="csub">Sup: ${sup} · ${banda}${dtxt}</div>
      </div><div class="cbody">`;
      if (temColeta) {
        const fmt3 = v => v ? 'R$'+parseFloat(v).toFixed(3).replace('.',',') : '--';
        dHtml += `<div class="pr"><span class="prc">G. Comum</span><span class="prv gc">${fmt3(d.GC)}</span></div>`;
        dHtml += `<div class="pr"><span class="prc">G. Aditivada</span><span class="prv ga">${fmt3(d.GA)}</span></div>`;
        dHtml += `<div class="pr"><span class="prc">Etanol</span><span class="prv et">${fmt3(d.ET)}</span></div>`;
        dHtml += `<div class="pr"><span class="prc">Diesel S10</span><span class="prv s10">${fmt3(d.S10)}</span></div>`;
        if (d.S500) dHtml += `<div class="pr"><span class="prc">Diesel S500</span><span class="prv s10">${fmt3(d.S500)}</span></div>`;
      } else {
        dHtml += `<div class="empty" style="padding:.5rem;font-size:.72rem">⏳ Sem coleta hoje.<br>Aguardando o gerente enviar pelo app.</div>`;
      }
      dHtml += `</div></div>`;
      document.getElementById('mapa-detail').innerHTML = dHtml;
    });
    mapMarkers.push(marker);
  });

  // ── 2. Postos com coleta mas sem coordenada no MAP_POSTOS ──────
  // (postos novos ou que a planilha tem lat/lng mas MAP_POSTOS não tem)
  Object.keys(propDados).forEach(k => {
    const d = propDados[k];
    if (!d.lat || !d.lng || isNaN(parseFloat(d.lat))) return;
    const sup = d.supervisor || '';
    if (G_MAPA_SUP !== 'todos' && sup !== G_MAPA_SUP) return;
    if (G_MAPA_COLETA === 'semcoleta') return; // tem coleta, pula

    // Verifica se já foi plotado no passo 1
    const norm = k.replace(/^P\.\s*/i,'').trim().toUpperCase();
    const jaPlotado = MAP_POSTOS.some(p => 
      p.k.toUpperCase() === norm || 
      ('P. ' + p.k).toUpperCase() === k.toUpperCase()
    );
    if (jaPlotado) return;

    const cor  = SUPCOR_MAP[sup] || '#8892a4';
    const nome = k.replace(/^P\.\s*/i,'P. ').substring(0,12);
    const preco = d[G_MAPA_FUEL];
    const precoExibir = preco ? 'R$'+parseFloat(preco).toFixed(2) : '--';
    if (preco) precosValidos.push(parseFloat(preco));
    contColetados++;

    const iconHtml = `<div class="custom-marker" style="border-color:${cor};background:#0d1a12">
      <div class="m-name" style="color:${cor}">${nome}</div>
      <div class="m-price" style="color:#fff">${precoExibir}</div>
    </div>`;
    const cIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [72, 34], iconAnchor: [36, 17] });
    const marker = L.marker([parseFloat(d.lat), parseFloat(d.lng)], { icon: cIcon });
    if (markerCluster) markerCluster.addLayer(marker); else marker.addTo(leafletMap);
    marker.on('click', () => {
      const fmt3 = v => v ? 'R$'+parseFloat(v).toFixed(3).replace('.',',') : '--';
      document.getElementById('mapa-detail').innerHTML = 
        `<div class="card" style="margin-top:.5rem"><div class="chdr">
          <div class="ctitle" style="color:${cor}">${k}</div>
          <div class="csub">Sup: ${sup} · ${d.bandeira||''} · ${d.data||''}</div>
        </div><div class="cbody">
          <div class="pr"><span class="prc">G. Comum</span><span class="prv gc">${fmt3(d.GC)}</span></div>
          <div class="pr"><span class="prc">G. Aditivada</span><span class="prv ga">${fmt3(d.GA)}</span></div>
          <div class="pr"><span class="prc">Etanol</span><span class="prv et">${fmt3(d.ET)}</span></div>
          <div class="pr"><span class="prc">Diesel S10</span><span class="prv s10">${fmt3(d.S10)}</span></div>
        </div></div>`;
    });
    mapMarkers.push(marker);
  });

  // ── Contador e legenda ─────────────────────────────────────────
  const contador = document.getElementById('mapa-contador');
  if (contador) {
    const total = contColetados + contSemColeta;
    contador.innerHTML = `<span style="color:var(--ac)">✅ ${contColetados}</span> coletados &nbsp;·&nbsp; <span style="color:var(--tx3)">⏳ ${contSemColeta}</span> aguardando`;
  }
  
  // Renderiza legenda inteligente baseado nos ranges de preços reais atuais
  const legend = document.getElementById('map-legend');
  if (precosValidos.length > 0) {
    precosValidos.sort((a,b)=>a-b);
    const min = precosValidos[0];
    const max = precosValidos[precosValidos.length-1];
    legend.innerHTML = `
      <span style="color:var(--ok)">Mín: R$ ${min.toFixed(2)}</span>
      <span style="color:var(--wn)">Filtro: ${G_MAPA_FUEL}</span>
      <span style="color:var(--dg)">Máx: R$ ${max.toFixed(2)}</span>
    `;
  } else {
    legend.innerHTML = `<span>Nenhum preço real carregado para ${G_MAPA_FUEL}</span>`;
  }
}

// Submódulos Complementares (Mais+)
function renderAmostra(ctx) {
  ctx.innerHTML = `<div class="sdiv">Controle de Validade Amostra-Testemunha</div>
    <div class="am-card"><div class="am-posto">P. JA</div><div class="am-sub">Bandeira Ipiranga</div><div class="klbl">Dias restantes da amostra ativa</div><div class="am-bar-bg"><div class="am-bar" style="width:80%"></div></div><div class="am-dias" style="color:var(--ok)">24 Dias</div></div>
    <div class="am-card"><div class="am-posto">P. ITAPOA</div><div class="am-sub">Bandeira Shell</div><div class="klbl">Dias restantes da amostra ativa</div><div class="am-bar-bg"><div class="am-bar" style="width:40%; background:var(--wn)"></div></div><div class="am-dias" style="color:var(--wn)">12 Dias</div></div>
    <div class="am-card"><div class="am-posto">P. BRUNA</div><div class="am-sub">Bandeira BR</div><div class="klbl">Dias restantes da amostra ativa</div><div class="am-bar-bg"><div class="am-bar" style="width:10%; background:var(--dg)"></div></div><div class="am-dias" style="color:var(--dg)">2 Dias (Coletar Urgente)</div></div>`;
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
  const c = parseFloat(document.getElementById('s-custo').value)||0;
  const v = parseFloat(document.getElementById('s-venda').value)||0;
  const i = parseFloat(document.getElementById('s-imp').value)||0;
  const resDiv = document.getElementById('s-res');
  resDiv.style.display = 'block';
  const margem = v - c - (v * (i/100));
  document.getElementById('s-res-v').textContent = 'R$ ' + margem.toFixed(2);
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
  const gc = document.getElementById('l-gc').value;
  const ga = document.getElementById('l-ga').value;
  const et = document.getElementById('l-et').value;
  const s10 = document.getElementById('l-s10').value;
  
  document.getElementById('loading').classList.remove('hidden');
  try {
    const url = `${API_URL}?action=setPreco&posto=${encodeURIComponent(posto)}&gc=${gc}&ga=${ga}&et=${et}&s10=${s10}&user=${encodeURIComponent(G_USER.email)}`;
    const res = await fetch(url);
    const text = await res.text();
    showToast('Sucesso', 'Preço gravado diretamente na planilha corporativa.');
    carregarDados();
  } catch(e) {
    showToast('Erro de Conexão', 'Não foi possível persistir os dados.');
    document.getElementById('loading').classList.add('hidden');
  }
}

function renderRel(ctx) {
  ctx.innerHTML = `<div class="sdiv">Relatórios Analíticos consolidados</div>
    <div class="rcard">
      <div class="rcardtop"><div class="rcardico" style="background:var(--acd);color:var(--ac)"><i class="fa-solid fa-chart-line"></i></div><div><div class="rcardtitle">Evolução Semanal de Margem</div><div class="rcardsub">Volumetria vs Elasticidade de Preço</div></div></div>
      <div class="rrows">
        <div class="rrow"><span>Média da Rede (Jan 2026)</span><strong>R$ 0.44 / L</strong></div>
        <div class="rrow"><span>Média da Rede (Atual)</span><strong style="color:var(--ac)">R$ 0.51 / L</strong></div>
      </div>
    </div>`;
}

// Utilitário global de notificações em tela (Toast)

// ══════════════════════════════════════════════════
// ABA HISTÓRICO — evolução de preços ao longo do tempo
// ══════════════════════════════════════════════════
let G_HISTORICO = [];
let G_CHART = null;

function povoarHistPosto() {
  const sel = document.getElementById('hist-posto');
  if (sel.options.length > 1) return; // já preenchido
  Object.keys(POSTOS_DADOS).sort().forEach(p => {
    const o = document.createElement('option');
    o.value = 'P. ' + p;
    o.textContent = 'P. ' + p;
    sel.appendChild(o);
  });
}

async function carregarHistorico() {
  povoarHistPosto();
  const posto   = document.getElementById('hist-posto') ? document.getElementById('hist-posto').value : '';
  const dias    = document.getElementById('hist-dias')  ? document.getElementById('hist-dias').value  : '30';
  const subEl   = document.getElementById('hist-sub');
  const loadEl  = document.getElementById('hist-loading');

  if (loadEl) loadEl.classList.remove('hidden');
  if (subEl)  subEl.textContent = 'Carregando...';
  G_HISTORICO = [];

  try {
    const url  = API_URL + '?tipo=historico&dias=' + encodeURIComponent(dias) + (posto ? '&posto=' + encodeURIComponent(posto) : '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000); // timeout 15s
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();

    if (json && json.success && Array.isArray(json.historico)) {
      G_HISTORICO = json.historico;
      if (subEl) subEl.textContent = (posto || 'Todos os postos') + ' — últimos ' + dias + ' dias (' + json.historico.length + ' registros)';
    } else if (json && json.historico) {
      G_HISTORICO = json.historico;
      if (subEl) subEl.textContent = (posto || 'Todos os postos') + ' — ' + G_HISTORICO.length + ' registros';
    } else {
      if (subEl) subEl.textContent = 'Sem dados no período selecionado.';
    }
  } catch(e) {
    console.warn('Histórico erro:', e.name, e.message);
    if (subEl) subEl.textContent = e.name === 'AbortError' 
      ? 'Tempo esgotado — planilha muito grande. Tente filtrar por posto.' 
      : 'Sem conexão com o servidor.';
  } finally {
    if (loadEl) loadEl.classList.add('hidden');
    renderGrafico();
    renderResumoHistorico();
    renderListaHistorico();
  }
}

function renderGrafico() {
  const fuel    = document.getElementById('hist-fuel').value;
  const canvas  = document.getElementById('hist-canvas');
  const ctx     = canvas.getContext('2d');

  // Filtrar apenas próprios com o combustível
  const pontos = G_HISTORICO.filter(r => r.tipo === 'Próprio' && r[fuel] !== null);

  if (pontos.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const parent = canvas.parentElement;
    parent.innerHTML = '<div class="empty">Sem dados de ' + fuel + ' no período selecionado.</div>';
    return;
  }

  // Garante canvas no DOM
  if (!document.getElementById('hist-canvas')) {
    const parent = document.querySelector('#s-hist .card:nth-child(2) .cbody');
    const c = document.createElement('canvas');
    c.id = 'hist-canvas';
    c.style = 'width:100%;max-height:220px;display:block';
    parent.innerHTML = '';
    parent.appendChild(c);
  }

  // Agrupa por data — média do dia
  const porData = {};
  pontos.forEach(r => {
    if (!porData[r.data]) porData[r.data] = [];
    porData[r.data].push(parseFloat(r[fuel]));
  });
  const datas  = Object.keys(porData).sort((a,b) => {
    const pa=a.split('/'), pb=b.split('/');
    return new Date(pa[2],pa[1]-1,pa[0]) - new Date(pb[2],pb[1]-1,pb[0]);
  });
  const valores = datas.map(d => {
    const arr = porData[d];
    return arr.reduce((s,v)=>s+v,0)/arr.length;
  });

  // Desenha gráfico de linha simples no canvas
  const W = canvas.offsetWidth || 340;
  const H = 200;
  canvas.width  = W;
  canvas.height = H;
  ctx.clearRect(0,0,W,H);

  const pad = {t:20, r:10, b:30, l:50};
  const gW = W - pad.l - pad.r;
  const gH = H - pad.t - pad.b;

  const minV = Math.min(...valores) - 0.05;
  const maxV = Math.max(...valores) + 0.05;
  const rV   = maxV - minV || 0.1;

  const xOf = (i) => pad.l + (i/(datas.length-1||1))*gW;
  const yOf = (v) => pad.t + (1-(v-minV)/rV)*gH;

  // Grade
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i=0; i<=4; i++) {
    const y = pad.t + (i/4)*gH;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
    const val = maxV - (i/4)*rV;
    ctx.fillStyle = '#5a6478';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('R$'+val.toFixed(2), pad.l-4, y+3);
  }

  // Linha de preço
  ctx.strokeStyle = '#00e5a0';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  valores.forEach((v,i) => {
    const x=xOf(i), y=yOf(v);
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Área sob a linha
  ctx.fillStyle = 'rgba(0,229,160,0.08)';
  ctx.beginPath();
  valores.forEach((v,i) => {
    const x=xOf(i), y=yOf(v);
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.lineTo(xOf(valores.length-1), pad.t+gH);
  ctx.lineTo(xOf(0), pad.t+gH);
  ctx.closePath();
  ctx.fill();

  // Pontos
  ctx.fillStyle = '#00e5a0';
  valores.forEach((v,i) => {
    ctx.beginPath();
    ctx.arc(xOf(i), yOf(v), 3, 0, Math.PI*2);
    ctx.fill();
  });

  // Datas no eixo X (só algumas)
  ctx.fillStyle = '#5a6478';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(datas.length/5));
  datas.forEach((d,i) => {
    if (i % step !== 0 && i !== datas.length-1) return;
    const parts = d.split('/');
    ctx.fillText(parts[0]+'/'+parts[1], xOf(i), H-8);
  });
}

function renderResumoHistorico() {
  const fuel  = document.getElementById('hist-fuel') ? document.getElementById('hist-fuel').value : 'GC';
  const body  = document.getElementById('hist-resumo');
  const prop  = G_HISTORICO.filter(r => r.tipo === 'Próprio' && r[fuel]);
  const conc  = G_HISTORICO.filter(r => r.tipo !== 'Próprio' && r[fuel]);

  if (!prop.length && !conc.length) {
    body.innerHTML = '<div class="empty">Sem dados suficientes para resumo.</div>';
    return;
  }

  const media = arr => arr.length ? (arr.reduce((s,r)=>s+parseFloat(r[fuel]),0)/arr.length) : null;
  const min_r = arr => arr.length ? Math.min(...arr.map(r=>parseFloat(r[fuel]))) : null;
  const max_r = arr => arr.length ? Math.max(...arr.map(r=>parseFloat(r[fuel]))) : null;

  const mp = media(prop), mc = media(conc);
  const fmt = v => v !== null ? 'R$ '+v.toFixed(2).replace('.',',') : '--';

  body.innerHTML = `
    <div class="bgrid" style="grid-template-columns:1fr 1fr;gap:.5rem">
      <div class="bbox">
        <div class="bbnome" style="color:var(--ac)">Nossos Postos</div>
        <div class="dbitem"><span>Média</span><span class="dbval">${fmt(mp)}</span></div>
        <div class="dbitem"><span>Mínimo</span><span class="dbval">${fmt(min_r(prop))}</span></div>
        <div class="dbitem"><span>Máximo</span><span class="dbval">${fmt(max_r(prop))}</span></div>
        <div class="dbitem"><span>Registros</span><span class="dbval">${prop.length}</span></div>
      </div>
      <div class="bbox">
        <div class="bbnome" style="color:var(--wn)">Concorrentes</div>
        <div class="dbitem"><span>Média</span><span class="dbval">${fmt(mc)}</span></div>
        <div class="dbitem"><span>Mínimo</span><span class="dbval">${fmt(min_r(conc))}</span></div>
        <div class="dbitem"><span>Máximo</span><span class="dbval">${fmt(max_r(conc))}</span></div>
        <div class="dbitem"><span>Registros</span><span class="dbval">${conc.length}</span></div>
      </div>
    </div>
    ${mp && mc ? `<div style="margin-top:.5rem;padding:.6rem;background:${mp<mc?'rgba(0,229,160,.08)':'rgba(255,77,109,.08)'};border-radius:8px;font-size:.78rem">
      ${mp < mc
        ? `✅ Nosso preço médio está <strong style="color:var(--ok)">R$ ${(mc-mp).toFixed(2)} abaixo</strong> da concorrência no período.`
        : `⚠️ Nosso preço médio está <strong style="color:var(--dg)">R$ ${(mp-mc).toFixed(2)} acima</strong> da concorrência no período.`}
    </div>` : ''}
  `;
}

function renderListaHistorico() {
  const body = document.getElementById('hist-lista');
  const qtd  = document.getElementById('hist-qtd');
  const fuel = document.getElementById('hist-fuel') ? document.getElementById('hist-fuel').value : 'GC';

  const lista = G_HISTORICO.filter(r => r[fuel]).slice(-50).reverse();
  qtd.textContent = lista.length + ' registros (mais recentes)';

  if (!lista.length) {
    body.innerHTML = '<div class="empty">Sem registros no período.</div>';
    return;
  }

  body.innerHTML = lista.map(r => {
    const isProp = r.tipo === 'Próprio';
    const cor    = isProp ? 'var(--ac)' : 'var(--tx3)';
    const v      = parseFloat(r[fuel]).toFixed(2).replace('.',',');
    return `<div class="ritem">
      <div class="rinfo">
        <div class="rnome" style="color:${cor}">${r.postoAlvo}</div>
        <div class="rbanda">${r.data} ${r.hora ? r.hora.substring(0,5) : ''} · ${r.tipo} · ${r.bandeira||''}</div>
      </div>
      <div class="rpreco" style="color:${cor}">R$ ${v}</div>
    </div>`;
  }).join('');
}

// Adicionar no setTab: carregar histórico quando necessário
const _setTabOrig = window.setTab;

function showToast(title, msg) {
  const t = document.getElementById('toast');
  document.getElementById('t-title').textContent = title;
  document.getElementById('t-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
// ════════════════════════════════════════════════════════════
// LOGÍSTICA — resumo do dia + pedido de amanhã (por grupo de tanque)
// ════════════════════════════════════════════════════════════
let G_LOG_DADOS = null; // resumo carregado da API para o posto atual
let G_LOG_PEDIDOS = {}; // { combustivel: valorDigitado }

async function carregarLogistica(posto) {
  const empty   = document.getElementById('log-empty');
  const content = document.getElementById('log-content');
  const cardsEl = document.getElementById('log-cards');

  if (!posto) {
    empty.classList.remove('hidden');
    empty.textContent = 'Selecione um posto acima para ver o resumo do dia.';
    content.style.display = 'none';
    return;
  }

  empty.classList.remove('hidden');
  empty.textContent = 'Carregando dados do posto...';
  content.style.display = 'none';
  G_LOG_PEDIDOS = {};

  try {
    const url = API_URL + '?tipo=resumoDia&posto=' + encodeURIComponent(posto);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();

    if (!json || !json.success || !json.resumo || json.resumo.erro) {
      empty.textContent = (json && json.resumo && json.resumo.erro) || 'Não foi possível carregar os dados deste posto.';
      return;
    }

    G_LOG_DADOS = json.resumo;
    empty.classList.add('hidden');
    content.style.display = 'block';

    document.getElementById('log-posto-nome').textContent = G_LOG_DADOS.posto;
    document.getElementById('log-data-ref').textContent = 'Fechamento de hoje · ' + G_LOG_DADOS.data;

    renderCardsLogistica();
  } catch (e) {
    console.warn('Logística erro:', e.name, e.message);
    empty.textContent = e.name === 'AbortError'
      ? 'Tempo esgotado ao buscar dados. Tente novamente.'
      : 'Erro ao carregar dados do posto.';
  }
}

function fmtL(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Math.round(v).toLocaleString('pt-BR') + ' L';
}

function renderCardsLogistica() {
  const cardsEl = document.getElementById('log-cards');
  if (!G_LOG_DADOS || !G_LOG_DADOS.grupos || !G_LOG_DADOS.grupos.length) {
    cardsEl.innerHTML = '<div class="empty">Sem grupos de tanque cadastrados para este posto.</div>';
    return;
  }

  cardsEl.innerHTML = G_LOG_DADOS.grupos.map((g, i) => {
    const diffVal = g.diferencaHoje;
    const diffCor = diffVal === null ? 'var(--tx3)' : (Math.abs(diffVal) <= g.margem ? 'var(--ok)' : 'var(--dg)');
    const diffTxt = diffVal === null ? '—' : (diffVal >= 0 ? '+' : '') + Math.round(diffVal).toLocaleString('pt-BR') + ' L';
    const pctOcup = g.capacidade ? Math.min(100, Math.round(((g.medicaoHoje||0) / g.capacidade) * 100)) : 0;

    const valorAtualPedido = G_LOG_PEDIDOS[g.combustivel] !== undefined
      ? G_LOG_PEDIDOS[g.combustivel]
      : (g.pedidoAmanha !== null ? g.pedidoAmanha : '');

    return `
    <div class="log-card">
      <div class="log-card-hdr">
        <div class="log-card-titulo">${g.combustivel}</div>
        <div class="log-card-cap">${(g.capacidade||0).toLocaleString('pt-BR')} L cap.</div>
      </div>

      <div class="log-barra-wrap">
        <div class="log-barra"><div class="log-barra-fill" style="width:${pctOcup}%"></div></div>
        <div class="log-barra-lbl">${pctOcup}% do tanque (medição de hoje)</div>
      </div>

      <div class="log-grid4">
        <div class="log-item"><div class="log-item-lbl">Medição</div><div class="log-item-val">${fmtL(g.medicaoHoje)}</div></div>
        <div class="log-item"><div class="log-item-lbl">Venda hoje</div><div class="log-item-val" style="color:var(--dg)">${fmtL(g.vendaHoje)}</div></div>
        <div class="log-item"><div class="log-item-lbl">Carga hoje</div><div class="log-item-val" style="color:var(--ok)">${fmtL(g.cargaHoje)}</div></div>
        <div class="log-item"><div class="log-item-lbl">Diferença</div><div class="log-item-val" style="color:${diffCor}">${diffTxt}</div></div>
      </div>

      <div class="log-prev-row">
        <i class="fa-solid fa-chart-line"></i>
        <span>Previsão para amanhã: <strong>${fmtL(g.previsaoAmanha)}</strong></span>
      </div>

      <div class="log-pedido-row">
        <label class="log-pedido-lbl">Pedido para amanhã (L)</label>
        <input type="number" inputmode="numeric" class="log-pedido-input"
               placeholder="Ex: 5000"
               value="${valorAtualPedido}"
               oninput="atualizarPedidoLogistica('${g.combustivel.replace(/'/g,"\\'")}', this.value)">
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

  if (!pedidos.length) {
    showToast('Nada para enviar', 'Preencha ao menos um pedido antes de enviar.');
    return;
  }

  const btn = document.getElementById('log-btn-salvar');
  const txtOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        tipo: 'pedido_logistica',
        posto: G_LOG_DADOS.posto,
        pedidos: pedidos,
        user: (G_USER && G_USER.email) || 'ADM'
      })
    });
    const json = await res.json();

    if (json && json.success !== false) {
      showToast('Pedido enviado ✅', pedidos.length + ' grupo(s) atualizado(s) na planilha.');
      carregarLogistica(G_LOG_DADOS.posto); // recarrega para confirmar gravação
    } else {
      showToast('Erro ao enviar', (json && json.message) || 'Tente novamente em instantes.');
    }
  } catch (e) {
    console.warn('Salvar pedido erro:', e);
    showToast('Erro ao enviar', 'Verifique sua conexão e tente novamente.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
  }
}
