/* ═══════════════════════════════════════════════════════════════
   JORNADA ACADÊMICA — CIÊNCIAS CONTÁBEIS
   app.js — Lógica principal: Drive, newsletter, navegação
   ═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   ⚙️  CONFIGURAÇÃO — EDITE AQUI
   ══════════════════════════════════════════════════════ */

/**
 * PASTA_DRIVE_URL: Cole aqui o link da sua pasta principal do Google Drive.
 * Formato aceito: https://drive.google.com/drive/folders/SEU_ID_AQUI
 *
 * A pasta deve estar com compartilhamento "Qualquer pessoa com o link".
 * Estrutura esperada:
 *   FACULDADE DE CIÊNCIAS CONTÁBEIS/
 *     └─ SEMESTRES/
 *          └─ [Nome do Semestre]/
 *               └─ [Nome da Cadeira]/
 *                    └─ [arquivos variados]
 */
const PASTA_DRIVE_URL = "https://drive.google.com/drive/folders/1IcB1uXNjsVBijbHO7z5jn0IU2ScbHoZt?usp=drive_link";

/**
 * Intervalo de atualização automática em milissegundos.
 * Padrão: 5 minutos (300_000). Ajuste conforme necessidade.
 */
const AUTO_REFRESH_INTERVAL_MS = 300_000;

/**
 * Modelo Claude usado para gerar as newsletters.
 * Não altere a menos que haja atualização oficial.
 */
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

/* ══════════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════════ */
const STATE = {
  semestres: [],          // [{ nome, cadeiras: [{ nome, arquivos: [] }] }]
  newsletters: [],        // newsletters geradas { semestreNome, cadeiraId, cadeiraNome, conteudo, geradaEm }
  currentSemestre: null,
  currentCadeira: null,
  loadedAt: null,
};

/* ══════════════════════════════════════════════════════
   UTILITÁRIOS
   ══════════════════════════════════════════════════════ */

/** Extrai o ID da pasta de uma URL do Google Drive */
function extractFolderId(url) {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Formata uma data para exibição amigável */
function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

/** Normaliza texto: minúsculas, sem acento, sem espaço extra */
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Detecta se o nome de uma cadeira é contábil/cálculo (para destaque) */
function isContabil(nome) {
  const keywords = ["contab", "calculo", "financ", "tribut", "custos", "audit", "fiscal", "contabil"];
  const n = normalize(nome);
  return keywords.some(k => n.includes(k));
}

/** Ícone por tipo de arquivo */
function fileIcon(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = { pdf: "📄", xlsx: "📊", xls: "📊", csv: "📊", pptx: "📑", ppt: "📑", docx: "📝", doc: "📝", txt: "📋", jpg: "🖼", jpeg: "🖼", png: "🖼" };
  return map[ext] || "📁";
}

/** Anti-cache URL */
function antiCache(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_t=${Date.now()}`;
}

/** Mostra/esconde o overlay de carregamento */
function setLoading(on) {
  document.getElementById("loading-overlay").classList.toggle("visible", on);
}

/** Exibe mensagem de erro */
function showError(msg) {
  const el = document.getElementById("error-message");
  document.getElementById("error-text").textContent = msg;
  el.classList.remove("hidden");
}

/** Esconde mensagem de erro */
function hideError() {
  document.getElementById("error-message").classList.add("hidden");
}

/* ══════════════════════════════════════════════════════
   GOOGLE DRIVE — LEITURA DE PASTAS
   Usa a API pública do Google Drive (sem autenticação)
   para pastas compartilhadas com "qualquer pessoa com o link"
   ══════════════════════════════════════════════════════ */

/**
 * Lista arquivos e subpastas de uma pasta do Drive via API pública.
 * @param {string} folderId
 * @returns {Promise<Array>} lista de itens { id, name, mimeType }
 */
async function listDriveFolder(folderId) {
  /*
   * A API pública de listagem do Google Drive permite acesso a pastas
   * compartilhadas sem API key para leituras básicas via endpoint de
   * exportação. Usamos o endpoint de metadata público.
   *
   * ATENÇÃO: O Google Drive não expõe uma API REST pública sem API key.
   * A abordagem abaixo usa o endpoint de feed exportável (legado v2)
   * que funciona para pastas públicas no modo "qualquer pessoa com o link".
   * Se sua organização usa Drive corporativo, pode ser necessário uma
   * Google API Key (gratuita) — neste caso, descomente o bloco alternativo.
   */

  // --- Opção A: Google Drive JSON feed (funciona para pastas públicas) ---
  const feedUrl = antiCache(
    `https://drive.google.com/drive/folders/${folderId}`
  );

  /*
   * Como o Drive retorna HTML e não uma API REST pura sem key,
   * usamos o endpoint de API pública v3 com chave de leitura anônima.
   *
   * ★ Para funcionar em produção, você DEVE adicionar uma Google API Key.
   * ★ Passos: console.cloud.google.com → Credenciais → Criar Chave de API
   * ★ Habilitar: Google Drive API
   * ★ Cole a key abaixo:
   */
  const GOOGLE_API_KEY = "AIzaSyB2er6hl-KDl2VrAhMkTcEtocMKME6UlfA"; // ← INSIRA SUA GOOGLE API KEY AQUI (gratuita)

  if (GOOGLE_API_KEY) {
    // Opção com API Key (recomendada para produção)
    const apiUrl = antiCache(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,modifiedTime,size)&key=${GOOGLE_API_KEY}`
    );
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
    const data = await res.json();
    return data.files || [];
  } else {
    /*
     * ─────────────────────────────────────────────────────────────
     * MODO DEMONSTRAÇÃO (sem API Key)
     * Retorna dados de exemplo para você visualizar o site funcionando.
     * Substitua por dados reais quando tiver a API Key configurada.
     * ─────────────────────────────────────────────────────────────
     */
    console.warn("[JornadaAcadêmica] Sem GOOGLE_API_KEY — usando dados de demonstração.");
    return null; // sinal para usar dados demo
  }
}

/**
 * Carrega a estrutura completa do Drive de forma recursiva.
 * Estrutura: Raiz → Semestres → Cadeiras → Arquivos
 */
async function loadDriveStructure() {
  const rootId = extractFolderId(PASTA_DRIVE_URL);
  if (!rootId) throw new Error("URL da pasta do Drive inválida. Verifique PASTA_DRIVE_URL.");

  // Tenta listar a pasta raiz
  const rootItems = await listDriveFolder(rootId);

  // Sem API Key → usa dados de demonstração
  if (rootItems === null) {
    return buildDemoData();
  }

  // Filtra apenas subpastas (semestres)
  const semestresItems = rootItems.filter(i => i.mimeType === "application/vnd.google-apps.folder");

  const semestres = [];
  for (const semItem of semestresItems) {
    const cadeiraItems = (await listDriveFolder(semItem.id)) || [];
    const cadeiras = [];

    for (const cadItem of cadeiraItems.filter(i => i.mimeType === "application/vnd.google-apps.folder")) {
      const arquivos = (await listDriveFolder(cadItem.id)) || [];
      cadeiras.push({
        id: cadItem.id,
        nome: cadItem.name,
        arquivos: arquivos.filter(f => f.mimeType !== "application/vnd.google-apps.folder"),
      });
    }

    semestres.push({ id: semItem.id, nome: semItem.name, cadeiras });
  }

  return semestres;
}

/* ══════════════════════════════════════════════════════
   DADOS DE DEMONSTRAÇÃO
   Exibidos quando não há API Key configurada.
   Reflete a estrutura real esperada.
   ══════════════════════════════════════════════════════ */
function buildDemoData() {
  return [
    {
      id: "sem1", nome: "1º Semestre",
      cadeiras: [
        {
          id: "cad-contab1", nome: "Contabilidade Introdutória",
          arquivos: [
            { id: "f1", name: "Introducao_Contabilidade.pdf", mimeType: "application/pdf" },
            { id: "f2", name: "Exercicios_Debito_Credito.xlsx", mimeType: "application/vnd.ms-excel" },
          ],
        },
        {
          id: "cad-mat", nome: "Matemática Financeira",
          arquivos: [
            { id: "f3", name: "Juros_Simples_Compostos.pdf", mimeType: "application/pdf" },
            { id: "f4", name: "Planilha_Amortizacao.xlsx", mimeType: "application/vnd.ms-excel" },
            { id: "f5", name: "Exercicios_TVM.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          ],
        },
        {
          id: "cad-eco", nome: "Introdução à Economia",
          arquivos: [
            { id: "f6", name: "Microeconomia_Fundamentos.pdf", mimeType: "application/pdf" },
          ],
        },
      ],
    },
    {
      id: "sem2", nome: "2º Semestre",
      cadeiras: [
        {
          id: "cad-contab2", nome: "Contabilidade Intermediária",
          arquivos: [
            { id: "f7", name: "Balancetes_e_Balanco.pdf", mimeType: "application/pdf" },
            { id: "f8", name: "DRE_Modelo.xlsx", mimeType: "application/vnd.ms-excel" },
          ],
        },
        {
          id: "cad-tribut", nome: "Legislação Tributária",
          arquivos: [
            { id: "f9", name: "Impostos_Federais.pdf", mimeType: "application/pdf" },
            { id: "f10", name: "ICMS_IPI_PIS_COFINS.pptx", mimeType: "application/vnd.ms-powerpoint" },
          ],
        },
        {
          id: "cad-direito", nome: "Direito Empresarial",
          arquivos: [
            { id: "f11", name: "Codigo_Civil_Comentado.pdf", mimeType: "application/pdf" },
          ],
        },
      ],
    },
    {
      id: "sem3", nome: "3º Semestre",
      cadeiras: [
        {
          id: "cad-custos", nome: "Contabilidade de Custos",
          arquivos: [
            { id: "f12", name: "Custo_Direto_Indireto.pdf", mimeType: "application/pdf" },
            { id: "f13", name: "Markup_e_Precificacao.xlsx", mimeType: "application/vnd.ms-excel" },
          ],
        },
        {
          id: "cad-audit", nome: "Auditoria Contábil",
          arquivos: [
            { id: "f14", name: "Normas_Auditoria.pdf", mimeType: "application/pdf" },
            { id: "f15", name: "Checklist_Auditoria.xlsx", mimeType: "application/vnd.ms-excel" },
          ],
        },
      ],
    },
  ];
}

/* ══════════════════════════════════════════════════════
   GERAÇÃO DE NEWSLETTER VIA CLAUDE API
   ══════════════════════════════════════════════════════ */

/**
 * Gera a newsletter de uma cadeira usando a API Claude.
 * @param {object} cadeira  { nome, arquivos: [] }
 * @param {string} semestre Nome do semestre
 * @returns {Promise<string>} HTML da newsletter
 */
async function gerarNewsletter(cadeira, semestre) {
  const arquivosDesc = cadeira.arquivos.map(f => `• ${f.name} (${f.mimeType})`).join("\n");
  const ehContabil = isContabil(cadeira.nome);

  const prompt = `Você é um especialista acadêmico em Ciências Contábeis com didática excepcional.

CADEIRA: ${cadeira.nome}
SEMESTRE: ${semestre}
ARQUIVOS DISPONÍVEIS NA PASTA:
${arquivosDesc || "Nenhum arquivo detectado ainda."}

Gere uma newsletter acadêmica COMPLETA, DETALHADA e com HIERARQUIA VISUAL CLARA em JSON.
${ehContabil ? "Esta é uma cadeira de CONTABILIDADE/CÁLCULO — dê destaque especial a fórmulas, cálculos e exemplos numéricos." : ""}

RESPONDA APENAS COM JSON VÁLIDO, sem markdown, sem backticks. Estrutura EXATA:
{
  "resumo_executivo": "Parágrafo conciso (3-4 frases) sobre o conteúdo desta cadeira",
  "topicos_principais": [
    { "titulo": "Título do tópico", "descricao": "Explicação detalhada de 2-3 frases", "exemplo": "Exemplo prático ou fórmula quando aplicável" }
  ],
  "conceitos_chave": ["conceito 1", "conceito 2", "conceito 3", "conceito 4", "conceito 5"],
  "formula_destaque": "Fórmula ou equação principal (se aplicável, senão null)",
  "feynman_aplicacao": "Como aplicar o Método Feynman neste conteúdo — explicação em linguagem simples",
  "questoes_revisao": ["Questão 1?", "Questão 2?", "Questão 3?", "Questão 4?"],
  "proximos_passos": "O que estudar em seguida para aprofundar o conhecimento",
  "fontes_recomendadas": ["Recurso/livro/site 1", "Recurso/livro/site 2"],
  "nivel_complexidade": "Básico | Intermediário | Avançado",
  "carga_estimada_horas": 2
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error ${response.status}`);
  }

  const data = await response.json();
  const rawText = (data.content || []).map(b => b.text || "").join("");

  // Parse seguro do JSON
  try {
    const clean = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    // Fallback: retorna objeto mínimo com o texto bruto
    return {
      resumo_executivo: rawText.substring(0, 400) || "Newsletter gerada.",
      topicos_principais: [],
      conceitos_chave: [],
      questoes_revisao: [],
      fontes_recomendadas: [],
      nivel_complexidade: "—",
      carga_estimada_horas: 0,
    };
  }
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO DE NEWSLETTER
   ══════════════════════════════════════════════════════ */

function renderNewsletterHTML(nl, cadeira, semestre) {
  const contabil = isContabil(cadeira.nome);
  const cor = contabil ? "var(--accent-2)" : "var(--accent)";
  const tag = contabil ? "Contábil / Cálculo ★" : "Acadêmico";

  const topicosHTML = (nl.topicos_principais || []).map(t => `
    <li>
      <strong>${t.titulo}</strong><br>
      ${t.descricao}
      ${t.exemplo ? `<br><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:4px;display:block">▸ ${t.exemplo}</span>` : ""}
    </li>
  `).join("");

  const conceitosHTML = (nl.conceitos_chave || []).map(c =>
    `<span class="file-chip">${c}</span>`
  ).join("");

  const questoesHTML = (nl.questoes_revisao || []).map(q =>
    `<div class="review-card">${q}</div>`
  ).join("");

  const fontesHTML = (nl.fontes_recomendadas || []).map(f =>
    `<li>${f}</li>`
  ).join("");

  const arquivosHTML = (cadeira.arquivos || []).map(a =>
    `<span class="file-chip">${fileIcon(a.name)} ${a.name}</span>`
  ).join("");

  const formulaBlock = nl.formula_destaque ? `
    <div class="nl-section" style="border-left: 3px solid ${cor};">
      <div class="nl-section-label">FÓRMULA EM DESTAQUE</div>
      <h2><span class="section-icon">∑</span> Equação Principal</h2>
      <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:16px 20px;font-family:var(--font-mono);font-size:15px;color:var(--text-pri);margin-top:8px;letter-spacing:.03em;">
        ${nl.formula_destaque}
      </div>
    </div>
  ` : "";

  return `
  <div class="newsletter-wrap">

    <!-- ── MASTHEAD ── -->
    <div class="nl-masthead">
      <div class="nl-edition">NEWSLETTER ACADÊMICA • ${tag.toUpperCase()}</div>
      <div class="nl-title">${cadeira.nome}</div>
      <div class="nl-meta-row">
        <div class="nl-meta-item">📅 <strong>${formatDate(new Date())}</strong></div>
        <div class="nl-meta-item">📚 <strong>${semestre}</strong></div>
        <div class="nl-meta-item">⏱ <strong>${nl.carga_estimada_horas || "—"}h</strong> estimadas</div>
        <div class="nl-meta-item">📊 <strong>${nl.nivel_complexidade || "—"}</strong></div>
      </div>
    </div>

    <!-- ── RESUMO EXECUTIVO ── -->
    <div class="nl-section">
      <div class="nl-section-label">RESUMO EXECUTIVO</div>
      <h2><span class="section-icon">◈</span> Visão Geral</h2>
      <p>${nl.resumo_executivo || "—"}</p>
    </div>

    <!-- ── ARQUIVOS DETECTADOS ── -->
    ${cadeira.arquivos.length ? `
    <div class="nl-section">
      <div class="nl-section-label">MATERIAIS DA PASTA</div>
      <h2><span class="section-icon">📂</span> Arquivos Detectados</h2>
      <div class="files-chips">${arquivosHTML}</div>
    </div>
    ` : ""}

    <!-- ── FÓRMULA DESTAQUE ── -->
    ${formulaBlock}

    <!-- ── TÓPICOS PRINCIPAIS ── -->
    ${topicosHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">CONTEÚDO DETALHADO</div>
      <h2><span class="section-icon">▦</span> Tópicos Principais</h2>
      <ul>${topicosHTML}</ul>
    </div>
    ` : ""}

    <!-- ── CONCEITOS-CHAVE ── -->
    ${conceitosHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">VOCABULÁRIO ESSENCIAL</div>
      <h2><span class="section-icon">◉</span> Conceitos-Chave</h2>
      <div class="files-chips" style="margin-top:8px">${conceitosHTML}</div>
    </div>
    ` : ""}

    <!-- ── MÉTODO FEYNMAN ── -->
    <div class="feynman-box">
      <div class="feynman-label">✦ Método de Estudo — Richard Feynman</div>
      <h3>Aprenda ensinando</h3>
      <p style="font-size:13px;color:var(--text-sec);line-height:1.65;margin-bottom:4px">
        ${nl.feynman_aplicacao || "Tente explicar os conceitos desta cadeira como se estivesse ensinando alguém sem conhecimento prévio. Identifique os pontos onde você hesita — esses são os pontos a revisar."}
      </p>
      <div class="feynman-steps">
        <div class="feynman-step">
          <div class="step-num">1</div>
          <div class="step-name">Escolha o Conceito</div>
          <div class="step-desc">Selecione um tópico desta cadeira</div>
        </div>
        <div class="feynman-step">
          <div class="step-num">2</div>
          <div class="step-name">Ensine Simplesmente</div>
          <div class="step-desc">Explique como para uma criança</div>
        </div>
        <div class="feynman-step">
          <div class="step-num">3</div>
          <div class="step-name">Identifique Lacunas</div>
          <div class="step-desc">Onde você travou? Revise!</div>
        </div>
        <div class="feynman-step">
          <div class="step-num">4</div>
          <div class="step-name">Simplifique Mais</div>
          <div class="step-desc">Use analogias e exemplos reais</div>
        </div>
      </div>
    </div>

    <!-- ── QUESTÕES DE REVISÃO ── -->
    ${questoesHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">AUTOAVALIAÇÃO</div>
      <h2><span class="section-icon">?</span> Questões de Revisão</h2>
      <div class="review-grid">${questoesHTML}</div>
    </div>
    ` : ""}

    <!-- ── PRÓXIMOS PASSOS ── -->
    ${nl.proximos_passos ? `
    <div class="nl-section">
      <div class="nl-section-label">APROFUNDAMENTO</div>
      <h2><span class="section-icon">→</span> Próximos Passos</h2>
      <p>${nl.proximos_passos}</p>
    </div>
    ` : ""}

    <!-- ── FONTES ── -->
    ${fontesHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">REFERÊNCIAS</div>
      <h2><span class="section-icon">📖</span> Fontes Recomendadas</h2>
      <ul>${fontesHTML}</ul>
    </div>
    ` : ""}

  </div>`;
}

/* ══════════════════════════════════════════════════════
   NAVEGAÇÃO
   ══════════════════════════════════════════════════════ */

function navigateTo(page, params = {}) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add("active");

  const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add("active");

  if (page === "semestre" && params.semestreId) {
    renderSemestrePage(params.semestreId);
  }
  if (page === "newsletter" && params.cadeiraId && params.semestreNome) {
    renderNewsletterPage(params.cadeiraId, params.semestreNome);
  }

  // Scroll ao topo
  document.getElementById("main-content").scrollTo({ top: 0, behavior: "smooth" });
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO — HOME
   ══════════════════════════════════════════════════════ */

function renderHome() {
  // Estatísticas
  const totalCadeiras = STATE.semestres.reduce((s, sem) => s + sem.cadeiras.length, 0);
  const totalArquivos = STATE.semestres.reduce((s, sem) =>
    s + sem.cadeiras.reduce((c, cad) => c + cad.arquivos.length, 0), 0);
  const totalNLs = STATE.newsletters.length;

  document.getElementById("stat-semestres").textContent = STATE.semestres.length;
  document.getElementById("stat-cadeiras").textContent = totalCadeiras;
  document.getElementById("stat-arquivos").textContent = totalArquivos;
  document.getElementById("stat-newsletters").textContent = totalNLs;

  // Últimas newsletters (até 3)
  const recentNLs = [...STATE.newsletters].reverse().slice(0, 3);
  const homeGrid = document.getElementById("home-newsletters-grid");
  if (recentNLs.length) {
    homeGrid.innerHTML = recentNLs.map(nl => buildNLCard(nl)).join("");
  } else {
    homeGrid.innerHTML = `
      <div style="grid-column:1/-1;color:var(--text-ter);font-size:14px;padding:20px 0">
        Nenhuma newsletter gerada ainda. Clique em uma cadeira no menu para gerar.
      </div>`;
  }

  // Destaques: cadeiras contábeis / cálculo
  const todas = STATE.semestres.flatMap(s => s.cadeiras.map(c => ({ ...c, semestreNome: s.nome })));
  const destaques = todas.filter(c => isContabil(c.nome)).slice(0, 4);
  const highlightGrid = document.getElementById("highlight-grid");
  if (destaques.length) {
    const cores = ["", "orange", "", "orange"];
    highlightGrid.innerHTML = destaques.map((c, i) => `
      <div class="highlight-card ${cores[i] || ""}" data-icon="${isContabil(c.nome) ? "∑" : "◈"}"
           onclick="navigateTo('newsletter', { cadeiraId: '${c.id}', semestreNome: '${c.semestreNome}' })">
        <div class="hl-tag">${c.semestreNome} • Em destaque</div>
        <div class="hl-title">${c.nome}</div>
        <div class="hl-desc">${c.arquivos.length} arquivo(s) disponível(eis) • Clique para abrir a newsletter</div>
      </div>
    `).join("");
  } else {
    highlightGrid.innerHTML = `
      <div style="grid-column:1/-1;color:var(--text-ter);font-size:14px;padding:20px 0">
        Nenhuma cadeira com destaque detectada ainda.
      </div>`;
  }
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO — SIDEBAR SEMESTRES
   ══════════════════════════════════════════════════════ */

function renderSidebarSemestres() {
  const container = document.getElementById("nav-semestres");
  container.innerHTML = STATE.semestres.map(s => `
    <button class="nav-item" data-page="semestre-${s.id}"
            onclick="navigateTo('semestre', { semestreId: '${s.id}' })">
      <span class="nav-icon">◎</span>
      <span>${s.nome}</span>
    </button>
  `).join("");

  // Atualiza filtro de semestres nas newsletters
  const sel = document.getElementById("nl-filter-semestre");
  sel.innerHTML = `<option value="">Todos os Semestres</option>` +
    STATE.semestres.map(s => `<option value="${s.id}">${s.nome}</option>`).join("");
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO — PÁGINA DE SEMESTRE
   ══════════════════════════════════════════════════════ */

function renderSemestrePage(semestreId) {
  const semestre = STATE.semestres.find(s => s.id === semestreId);
  if (!semestre) return;

  document.getElementById("semestre-title").innerHTML = semestre.nome.replace(/(\d+º?)/, "<em>$1</em>");

  const container = document.getElementById("cadeiras-list");
  container.innerHTML = semestre.cadeiras.map(cad => {
    const nlExistente = STATE.newsletters.find(n => n.cadeiraId === cad.id);
    const contabil = isContabil(cad.nome);
    return `
      <div class="cadeira-row" id="cad-row-${cad.id}">
        <div class="cadeira-header" onclick="toggleCadeira('${cad.id}')">
          <div>
            ${contabil ? `<div style="font-size:10px;color:var(--accent-2);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">★ Destaque</div>` : ""}
            <div class="cadeira-name">${cad.nome}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="cadeira-files">${cad.arquivos.length} arquivo(s)</span>
            <span class="cadeira-toggle">⌄</span>
          </div>
        </div>
        <div class="cadeira-body">
          <div class="files-chips">
            ${cad.arquivos.map(f => `<span class="file-chip">${fileIcon(f.name)} ${f.name}</span>`).join("") || "<span style='color:var(--text-ter);font-size:13px'>Nenhum arquivo detectado.</span>"}
          </div>
          <div class="cadeira-preview">
            ${nlExistente ? `<em>Newsletter gerada em ${formatDate(new Date(nlExistente.geradaEm))}</em>` : "Newsletter ainda não gerada para esta cadeira."}
          </div>
          <button class="btn-open-nl"
                  onclick="navigateTo('newsletter', { cadeiraId: '${cad.id}', semestreNome: '${semestre.nome}' })">
            ${nlExistente ? "↻ Ver Newsletter" : "◈ Gerar Newsletter"} →
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function toggleCadeira(cadeiraId) {
  document.getElementById(`cad-row-${cadeiraId}`).classList.toggle("open");
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO — PÁGINA DE NEWSLETTER
   ══════════════════════════════════════════════════════ */

async function renderNewsletterPage(cadeiraId, semestreNome) {
  const container = document.getElementById("newsletter-content");

  // Encontra a cadeira
  const semestre = STATE.semestres.find(s => s.nome === semestreNome);
  const cadeiraObj = semestre?.cadeiras.find(c => c.id === cadeiraId) ||
    STATE.semestres.flatMap(s => s.cadeiras).find(c => c.id === cadeiraId);

  if (!cadeiraObj) {
    container.innerHTML = `<div class="error-banner"><span>⚠</span><span>Cadeira não encontrada.</span></div>`;
    return;
  }

  // Verifica se já tem newsletter
  const existente = STATE.newsletters.find(n => n.cadeiraId === cadeiraId);
  if (existente) {
    container.innerHTML = renderNewsletterHTML(existente.conteudo, cadeiraObj, semestreNome);
    addRegenerateButton(container, cadeiraId, semestreNome, cadeiraObj);
    return;
  }

  // Gera nova newsletter
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;gap:16px">
      <div class="loader-ring" style="border-top-color:var(--accent)"></div>
      <p style="color:var(--text-sec);font-size:14px">Gerando newsletter com IA para <strong>${cadeiraObj.nome}</strong>…</p>
    </div>`;

  try {
    const nlData = await gerarNewsletter(cadeiraObj, semestreNome);
    const nlEntry = {
      cadeiraId,
      cadeiraNome: cadeiraObj.nome,
      semestreNome,
      conteudo: nlData,
      geradaEm: Date.now(),
    };
    STATE.newsletters.push(nlEntry);
    saveNewslettersLocal();

    container.innerHTML = renderNewsletterHTML(nlData, cadeiraObj, semestreNome);
    addRegenerateButton(container, cadeiraId, semestreNome, cadeiraObj);

    // Atualiza home se estiver ativa
    renderHome();
  } catch (err) {
    container.innerHTML = `
      <div class="error-banner">
        <span>⚠</span>
        <span>Erro ao gerar newsletter: ${err.message}</span>
        <button onclick="renderNewsletterPage('${cadeiraId}','${semestreNome}')">Tentar novamente</button>
      </div>
      <div style="margin-top:20px;padding:16px;background:var(--surface);border-radius:var(--radius-md);font-size:13px;color:var(--text-sec)">
        <strong>Dica:</strong> Verifique se a API do Claude está acessível neste ambiente.
        O site funciona em modo demonstração mesmo sem conexão à API.
      </div>`;
  }
}

function addRegenerateButton(container, cadeiraId, semestreNome, cadeiraObj) {
  const btn = document.createElement("button");
  btn.className = "btn-refresh";
  btn.style.cssText = "margin:20px 0 40px;width:auto;padding:10px 24px;";
  btn.innerHTML = "↻ Regenerar Newsletter";
  btn.onclick = () => {
    STATE.newsletters = STATE.newsletters.filter(n => n.cadeiraId !== cadeiraId);
    saveNewslettersLocal();
    renderNewsletterPage(cadeiraId, semestreNome);
  };
  container.appendChild(btn);
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO — TODAS AS NEWSLETTERS
   ══════════════════════════════════════════════════════ */

function renderAllNewsletters() {
  const grid = document.getElementById("all-newsletters-grid");
  const busca = normalize(document.getElementById("nl-search").value);
  const filSem = document.getElementById("nl-filter-semestre").value;

  let filtradas = STATE.newsletters;
  if (busca) filtradas = filtradas.filter(nl =>
    normalize(nl.cadeiraNome).includes(busca) || normalize(nl.semestreNome).includes(busca));
  if (filSem) filtradas = filtradas.filter(nl =>
    STATE.semestres.find(s => s.id === filSem)?.nome === nl.semestreNome);

  if (!filtradas.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-ter);font-size:14px;padding:20px 0">Nenhuma newsletter encontrada.</div>`;
    return;
  }
  grid.innerHTML = filtradas.map(nl => buildNLCard(nl)).join("");
}

function filterNewsletters() {
  renderAllNewsletters();
}

function buildNLCard(nl) {
  const contabil = isContabil(nl.cadeiraNome);
  const resumo = nl.conteudo?.resumo_executivo || "Newsletter acadêmica gerada com IA.";
  const nivel = nl.conteudo?.nivel_complexidade || "";
  return `
    <div class="nl-card ${contabil ? "contabil" : ""}"
         onclick="navigateTo('newsletter', { cadeiraId: '${nl.cadeiraId}', semestreNome: '${nl.semestreNome}' })">
      <div>
        <span class="card-tag">${contabil ? "★ Contábil" : "◈ Acadêmico"}</span>
      </div>
      <div class="card-semestre-badge">${nl.semestreNome}</div>
      <div class="card-title">${nl.cadeiraNome}</div>
      <div class="card-excerpt">${resumo}</div>
      <div class="card-footer">
        <span class="card-meta">${nivel} • ${formatDate(new Date(nl.geradaEm))}</span>
        <span class="card-arrow">→</span>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   PERSISTÊNCIA LOCAL (localStorage)
   ══════════════════════════════════════════════════════ */

function saveNewslettersLocal() {
  try {
    localStorage.setItem("jornada_newsletters", JSON.stringify(STATE.newsletters));
  } catch { /* quota excedida — silencioso */ }
}

function loadNewslettersLocal() {
  try {
    const saved = localStorage.getItem("jornada_newsletters");
    if (saved) STATE.newsletters = JSON.parse(saved);
  } catch { STATE.newsletters = []; }
}

/* ══════════════════════════════════════════════════════
   ATUALIZAÇÃO DE DADOS
   ══════════════════════════════════════════════════════ */

async function refreshData() {
  const icon = document.getElementById("refresh-icon");
  icon.classList.add("spinning");
  setLoading(true);
  hideError();

  try {
    const semestres = await loadDriveStructure();
    STATE.semestres = semestres;
    STATE.loadedAt = new Date();

    // Atualiza UI
    renderSidebarSemestres();
    renderHome();
    renderAllNewsletters();

    // Horário da última atualização
    document.getElementById("last-update").textContent =
      `Atualizado\n${formatDate(STATE.loadedAt)}`;

  } catch (err) {
    console.error("[JornadaAcadêmica]", err);
    showError("Não foi possível carregar os dados do Drive: " + err.message);
  } finally {
    setLoading(false);
    icon.classList.remove("spinning");
  }
}

/* ══════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════ */

function openModal(htmlContent) {
  document.getElementById("modal-body").innerHTML = htmlContent;
  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

/* ══════════════════════════════════════════════════════
   INICIALIZAÇÃO
   ══════════════════════════════════════════════════════ */

async function init() {
  // Carrega newsletters salvas localmente
  loadNewslettersLocal();

  // Carrega estrutura do Drive
  await refreshData();

  // Auto-refresh periódico
  setInterval(refreshData, AUTO_REFRESH_INTERVAL_MS);
}

// Inicia quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", init);
