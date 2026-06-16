// CONFIGURAÇÃO: Insira aqui a URL de publicação (Web App) do seu Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwoJ3-g48frwYtMlnpVj5EIYapInPP11OJXrkOPUzCULrbIZWMQW51xFe-Ot4cox00r/exec";

let dadosGlobais = null;
let mapaLeaflet = null;

// Executa ao carregar a página: verifica se o usuário já logou antes
document.addEventListener("DOMContentLoaded", () => {
    const emailSalvo = localStorage.getItem("jbretas_user_email");
    if (emailSalvo) {
        document.getElementById("user-email").value = emailSalvo;
        carregarDadosPainel(emailSalvo);
    }
});

// Função de Autenticação Segura (Apenas por e-mail cadastrado no AppScript)
async function autenticarUsuario() {
    const email = document.getElementById("user-email").value.trim().toLowerCase();
    const errorDiv = document.getElementById("login-error");
    const btn = document.getElementById("btn-login");

    if (!email) {
        mostrarErro("Por favor, insira um e-mail válido.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Verificando...";
    errorDiv.style.display = "none";

    try {
        // Faz a requisição ao seu Apps Script passando o e-mail como parâmetro de verificação
        const urlRequest = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email)}`;
        const response = await fetch(urlRequest);
        const resultado = await response.json();

        // O Apps Script deve retornar um objeto indicando se o e-mail existe/está ativo
        if (resultado && resultado.autorizado) {
            localStorage.setItem("jbretas_user_email", email);
            dadosGlobais = resultado.dados; // Salva os dados retornados da planilha
            
            // Transiciona a tela
            document.getElementById("login-screen").style.display = "none";
            document.getElementById("main-panel").style.style.display = "block";
            
            inicializarPainel();
        } else {
            mostrarErro("E-mail não autorizado ou não cadastrado.");
            btn.disabled = false;
            btn.innerText = "Acessar Painel";
        }
    } catch (error) {
        console.error("Erro na autenticação:", error);
        mostrarErro("Falha ao conectar ao servidor. Tente novamente.");
        btn.disabled = false;
        btn.innerText = "Acessar Painel";
    }
}

function mostrarErro(mensagem) {
    const errorDiv = document.getElementById("login-error");
    errorDiv.innerText = mensaje;
    errorDiv.style.display = "block";
}

function logout() {
    localStorage.removeItem("jbretas_user_email");
    location.reload();
}

// Inicializa os componentes visuais do painel com base nos dados seguros recebidos
function inicializarPainel() {
    if (!dadosGlobais) return;

    // 1. Atualizar Cards de Resumo
    document.getElementById("card-postos").innerText = dadosGlobais.resumo.postosMonitorados || "32";
    document.getElementById("card-concorrentes").innerText = dadosGlobais.resumo.concorrentes || "135";
    document.getElementById("card-media-conc").innerText = dadosGlobais.resumo.mediaGCOncorrente || "R$ 5,820";
    document.getElementById("card-nosso-medio").innerText = dadosGlobais.resumo.nossoGCMedio || "R$ 5,784";

    // 2. Popular o Select de Postos Próprios
    const select = document.getElementById("select-posto");
    select.innerHTML = '<option value="">Selecione o posto...</option>';
    
    if (dadosGlobais.postosProprios) {
        dadosGlobais.postosProprios.forEach(posto => {
            const opt = document.createElement("option");
            opt.value = posto.id || posto.nome;
            opt.innerText = posto.nome;
            select.appendChild(opt);
        });
    }
}

// Atualiza a tabela comparativa do posto selecionado
function actualizarComparativo() {
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

    // Aqui entra a lógica dinâmica para renderizar os concorrentes diretos filtrados da planilha
    dadosDiv.innerHTML = `<p style="padding: 15px; color: #a0aec0;">Carregando comparativo do <strong>${idPosto}</strong>...</p>`;
}

// Gerenciamento de Abas da Navegação Inferior
function mudarAba(aba) {
    // Remove classe ativa de todos os botões da navbar
    document.querySelectorAll(".bottom-nav .nav-item").forEach(btn => btn.classList.remove("active"));
    // Oculta todas as seções principais
    document.getElementById("section-compara").style.display = "none";
    document.getElementById("section-mapa").style.display = "none";

    // Ativa a aba clicada
    if (aba === 'compara') {
        document.getElementById("nav-compara").classList.add("active");
        document.getElementById("section-compara").style.display = "grid";
    } else if (aba === 'mapa') {
        document.getElementById("nav-mapa").classList.add("active");
        document.getElementById("section-mapa").style.display = "block";
        setTimeout(() => { inicializarMapa(); }, 200); // Garante renderização correta do Leaflet
    }
}

// Inicializa o Mapa Leaflet com os marcadores georreferenciados
function inicializarMapa() {
    if (mapaLeaflet) return; // Evita recriar o mapa duplicado

    // Centralizado em Belo Horizonte / Grande BH por padrão
    mapaLeaflet = L.map('map').setView([-19.9167, -43.9333], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapaLeaflet);

    // Exemplo de Marcador (P. FELIPÃO encontrado no seu print)
    const marker = L.circleMarker([-19.9324, -43.9388], {
        color: '#a855f7',
        fillColor: '#a855f7',
        fillOpacity: 0.8,
        radius: 8
    }).addTo(mapaLeaflet);

    marker.bindPopup(`
        <div style="color: #1a202c; font-family: sans-serif;">
            <h4 style="margin:0 0 5px 0; color:#a855f7;">P. FELIPÃO</h4>
            <p style="margin:0 0 5px 0; font-size:11px; color:#4a5568;">Sup. Rodrigo - Vilma</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 5px 0;">
            <strong>Gasolina Comum:</strong> <span style="color:#2f855a;">R$ 5,81</span>
        </div>
    `);
}
