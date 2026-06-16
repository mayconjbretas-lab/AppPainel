// URL de publicação (Web App) do seu Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwoJ3-g48frwYtMlnpVj5EIYapInPP11OJXrkOPUzCULrbIZWMQW51xFe-Ot4cox00r/exec";

let dadosGlobais = null;
let mapaLeaflet = null;
let camadasMarcadores = [];

document.addEventListener("DOMContentLoaded", () => {
    const emailSalvo = localStorage.getItem("jbretas_user_email");
    if (emailSalvo) {
        document.getElementById("user-email").value = emailSalvo;
        carregarDadosPainel(emailSalvo);
    }
});

async function autenticarUsuario() {
    const email = document.getElementById("user-email").value.trim().toLowerCase();
    if (!email) {
        mostrarErro("Por favor, insira um e-mail válido.");
        return;
    }
    carregarDadosPainel(email);
}

async function carregarDadosPainel(email) {
    const btn = document.getElementById("btn-login");
    const errorDiv = document.getElementById("login-error");
    
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Verificando...";
    }
    errorDiv.style.display = "none";

    try {
        const urlRequest = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email)}`;
        const response = await fetch(urlRequest);
        const resultado = await response.json();

        if (resultado && resultado.autorizado) {
            localStorage.setItem("jbretas_user_email", email);
            dadosGlobais = resultado.dados;
            
            document.getElementById("login-screen").style.display = "none";
            document.getElementById("main-panel").style.display = "block";
            document.getElementById("error-alert").style.display = "none";
            
            inicializarPainel();
        } else {
            mostrarErro("E-mail não cadastrado ou sem permissão de acesso.");
            resetBotaoLogin();
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        document.getElementById("error-alert").style.display = "flex";
        mostrarErro("Falha ao conectar com o banco de dados.");
        resetBotaoLogin();
    }
}

function resetBotaoLogin() {
    const btn = document.getElementById("btn-login");
    if (btn) {
        btn.disabled = false;
        btn.innerText = "Acessar Painel";
    }
}

function mostrarErro(mensagem) {
    const errorDiv = document.getElementById("login-error");
    errorDiv.innerText = mensagem;
    errorDiv.style.display = "block";
}

function logout() {
    localStorage.removeItem("jbretas_user_email");
    location.reload();
}

function recarregarDados() {
    const emailSalvo = localStorage.getItem("jbretas_user_email");
    if (emailSalvo) carregarDadosPainel(emailSalvo);
}

function inicializarPainel() {
    if (!dadosGlobais) return;

    // Atualiza os Cards Superiores com os dados do Apps Script
    document.getElementById("card-postos").innerText = dadosGlobais.resumo?.postosMonitorados || "0";
    document.getElementById("card-concorrentes").innerText = dadosGlobais.resumo?.concorrentes || "0";
    document.getElementById("card-media-conc").innerText = dadosGlobais.resumo?.mediaGCOncorrente || "R$ 0,000";
    document.getElementById("card-nosso-medio").innerText = dadosGlobais.resumo?.nossoGCMedio || "R$ 0,000";

    if (dadosGlobais.resumo?.postosMonitorados) {
        document.getElementById("total-postos-sub").innerText = `Todos os ${dadosGlobais.resumo.postosMonitorados} postos — dados reais da planilha`;
    }

    // Alimenta o seletor (dropdown) com a sua lista de postos próprios
    const select = document.getElementById("select-posto");
    select.innerHTML = '<option value="">Selecione o posto...</option>';
    
    if (dadosGlobais.postosProprios) {
        dadosGlobais.postosProprios.forEach(posto => {
            const opt = document.createElement("option");
            opt.value = posto.id;
            opt.innerText = posto.nome;
            select.appendChild(opt);
        });
    }
}

function atualizarComparativo() {
    const select = document.getElementById("select-posto");
    const idPosto = select.value;
    const placeholder = document.getElementById("placeholder-compara");
    const dadosDiv = document.getElementById("dados-comparativo");

    if (!idPosto) {
        placeholder.style.display = "block";
        dadosDiv.style.display = "none";
        return;
    }

    placeholder.style.display = "none";
    dadosDiv.style.display = "block";

    // Filtra o posto escolhido
    const postoDados = dadosGlobais.postosProprios.find(p => p.id === idPosto);
    if (!postoDados) {
        dadosDiv.innerHTML = `<p style="padding:15px; color:#ef4444;">Dados do posto não encontrados.</p>`;
        return;
    }

    // Constrói dinamicamente a tabela do comparativo preservando o seu estilo
    let html = `
        <div class="comparativo-wrapper">
            <h3 style="color:#10b981; margin-bottom:15px;">${postoDados.nome}</h3>
            <table class="dados-table">
                <thead>
                    <tr>
                        <th>Combustível</th>
                        <th>Nosso Preço</th>
                        <th>Média Conc.</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Loop pelos combustíveis vindos da planilha para este posto
    if (postoDados.combustiveis) {
        Object.keys(postoDados.combustiveis).forEach(comb => {
            const info = postoDados.combustiveis[comb];
            html += `
                <tr>
                    <td><strong>${comb}</strong></td>
                    <td style="color:#10b981; font-weight:bold;">${info.nossoPreco || '--'}</td>
                    <td style="color:#3b82f6;">${info.mediaConc || '--'}</td>
                    <td><span class="status-indicator ${info.statusClass || 'ok'}">${info.status || 'OK'}</span></td>
                </tr>
            `;
        });
    }

    html += `</tbody></table></div>`;
    dadosDiv.innerHTML = html;
}

function mudarAba(aba) {
    document.querySelectorAll(".bottom-nav .nav-item").forEach(btn => btn.classList.remove("active"));
    document.getElementById("section-compara").style.display = "none";
    document.getElementById("section-mapa").style.display = "none";

    if (aba === 'compara') {
        document.getElementById("nav-compara").classList.add("active");
        document.getElementById("section-compara").style.display = "grid";
    } else if (aba === 'mapa') {
        document.getElementById("nav-mapa").classList.add("active");
        document.getElementById("section-mapa").style.display = "block";
        setTimeout(() => { inicializarMapa(); }, 250);
    }
}

function inicializarMapa() {
    if (mapaLeaflet) {
        mapaLeaflet.invalidateSize();
        return;
    }

    // Coordenadas padrão da Grande BH
    mapaLeaflet = L.map('map').setView([-19.9167, -43.9333], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapaLeaflet);

    renderizarMarcadoresMapa();
}

function renderizarMarcadoresMapa() {
    if (!mapaLeaflet || !dadosGlobais?.mapaMarcadores) return;

    // Limpa marcadores anteriores
    camadasMarcadores.forEach(m => mapaLeaflet.removeLayer(m));
    camadasMarcadores = [];

    const combustivelFiltro = document.getElementById("map-filtro-combustivel").value;

    dadosGlobais.mapaMarcadores.forEach(ponto => {
        if (ponto.lat && ponto.lng) {
            const precoExibido = ponto.precos?.[combustivelFiltro] || "N/A";
            
            const marker = L.circleMarker([ponto.lat, ponto.lng], {
                color: ponto.corGrupo || '#a855f7',
                fillColor: ponto.corGrupo || '#a855f7',
                fillOpacity: 0.8,
                radius: 8
            }).addTo(mapaLeaflet);

            marker.bindPopup(`
                <div class="map-popup">
                    <h4>${ponto.nome}</h4>
                    <p class="popup-sub">${ponto.supervisor || ''}</p>
                    <hr>
                    <strong>${combustivelFiltro}:</strong> <span class="popup-price">R$ ${precoExibido}</span>
                </div>
            `);

            camadasMarcadores.push(marker);
        }
    });
}
