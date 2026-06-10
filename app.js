/* ═══════════════════════════════════════════════════════════════
   JORNADA ACADÊMICA — CIÊNCIAS CONTÁBEIS
   app.js — versão 2.0 (sem dependência de API Claude)
   Newsletters geradas localmente com base nos arquivos do Drive.
   ═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   ⚙️  CONFIGURAÇÃO — EDITE AQUI
   ══════════════════════════════════════════════════════ */

/**
 * PASTA_DRIVE_URL
 * Cole o link da sua pasta principal do Google Drive.
 * A pasta deve ter compartilhamento "Qualquer pessoa com o link pode ver".
 */
const PASTA_DRIVE_URL = "https://drive.google.com/drive/folders/1IcB1uXNjsVBijbHO7z5jn0IU2ScbHoZt?usp=drive_link";

/**
 * GOOGLE_API_KEY
 * Chave gratuita do Google Cloud Console com a Google Drive API ativada.
 * Sem ela o site roda em modo demonstração com dados de exemplo.
 * ★ Cole sua chave entre as aspas abaixo:
 */
const GOOGLE_API_KEY = ""; // ← COLE SUA GOOGLE API KEY AQUI

/**
 * Intervalo de atualização automática (ms). Padrão: 5 minutos.
 */
const AUTO_REFRESH_INTERVAL_MS = 300_000;

/* ══════════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════════ */
const STATE = {
  semestres:   [],   // [{ id, nome, cadeiras: [{ id, nome, arquivos:[] }] }]
  newsletters: [],   // [{ cadeiraId, cadeiraNome, semestreNome, conteudo, geradaEm }]
  loadedAt:    null,
};

/* ══════════════════════════════════════════════════════
   UTILITÁRIOS
   ══════════════════════════════════════════════════════ */

function extractFolderId(url) {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isContabil(nome) {
  const kw = ["contab","calculo","financ","tribut","custo","audit","fiscal","orcament","gestao","societar"];
  const n = normalize(nome);
  return kw.some(k => n.includes(k));
}

function fileIcon(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = { pdf:"📄", xlsx:"📊", xls:"📊", csv:"📊", pptx:"📑", ppt:"📑",
                docx:"📝", doc:"📝", txt:"📋", jpg:"🖼", jpeg:"🖼", png:"🖼" };
  return map[ext] || "📁";
}

function antiCache(url) {
  return url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
}

function setLoading(on) {
  document.getElementById("loading-overlay").classList.toggle("visible", on);
}

function showError(msg) {
  document.getElementById("error-text").textContent = msg;
  document.getElementById("error-message").classList.remove("hidden");
}

function hideError() {
  document.getElementById("error-message").classList.add("hidden");
}

/* ══════════════════════════════════════════════════════
   GOOGLE DRIVE — LEITURA VIA API v3
   ══════════════════════════════════════════════════════ */

/**
 * Lista conteúdo de uma pasta do Drive.
 * Retorna null se não houver API Key (modo demo).
 */
async function listDriveFolder(folderId) {
  if (!GOOGLE_API_KEY) return null;

  const url = antiCache(
    `https://www.googleapis.com/drive/v3/files` +
    `?q=%27${folderId}%27+in+parents+and+trashed%3Dfalse` +
    `&fields=files(id%2Cname%2CmimeType%2CmodifiedTime)` +
    `&pageSize=200` +
    `&key=${GOOGLE_API_KEY}`
  );

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `HTTP ${res.status}`;
    throw new Error("Google Drive API: " + msg);
  }
  const data = await res.json();
  return data.files || [];
}

/**
 * Carrega a estrutura completa: Semestres → Cadeiras → Arquivos
 */
async function loadDriveStructure() {
  const rootId = extractFolderId(PASTA_DRIVE_URL);
  if (!rootId) throw new Error("URL da pasta inválida em PASTA_DRIVE_URL.");

  const rootItems = await listDriveFolder(rootId);
  if (rootItems === null) return buildDemoData(); // sem API Key

  const FOLDER = "application/vnd.google-apps.folder";
  const semestresItems = rootItems.filter(i => i.mimeType === FOLDER);

  if (semestresItems.length === 0) {
    // Talvez a pasta raiz já seja o nível de semestres — tenta um nível abaixo
    return buildDemoData();
  }

  const semestres = [];
  for (const semItem of semestresItems) {
    const cadeiraItems = await listDriveFolder(semItem.id) || [];
    const cadeiras = [];

    for (const cadItem of cadeiraItems.filter(i => i.mimeType === FOLDER)) {
      const arquivos = await listDriveFolder(cadItem.id) || [];
      cadeiras.push({
        id:       cadItem.id,
        nome:     cadItem.name,
        arquivos: arquivos.filter(f => f.mimeType !== FOLDER),
      });
    }

    semestres.push({ id: semItem.id, nome: semItem.name, cadeiras });
  }

  return semestres;
}

/* ══════════════════════════════════════════════════════
   DADOS DE DEMONSTRAÇÃO
   Aparecem quando GOOGLE_API_KEY está vazia.
   ══════════════════════════════════════════════════════ */
function buildDemoData() {
  console.info("[JornadaAcadêmica] Modo demonstração — configure GOOGLE_API_KEY para dados reais.");
  return [
    {
      id: "sem1", nome: "1º Semestre - 2025.1",
      cadeiras: [
        { id: "c1", nome: "Contabilidade Introdutória",
          arquivos: [
            { id:"a1", name:"Introducao_Contabilidade.pdf" },
            { id:"a2", name:"Exercicios_Debito_Credito.xlsx" },
          ] },
        { id: "c2", nome: "Matemática Financeira",
          arquivos: [
            { id:"a3", name:"Juros_Simples_Compostos.pdf" },
            { id:"a4", name:"Amortizacao_SAC_PRICE.xlsx" },
          ] },
        { id: "c3", nome: "Introdução à Economia",
          arquivos: [
            { id:"a5", name:"Microeconomia_Fundamentos.pdf" },
          ] },
        { id: "c4", nome: "Direito Empresarial",
          arquivos: [
            { id:"a6", name:"Codigo_Civil_Resumo.pdf" },
          ] },
      ],
    },
    {
      id: "sem2", nome: "2º Semestre - 2025.2",
      cadeiras: [
        { id: "c5", nome: "Contabilidade Intermediária",
          arquivos: [
            { id:"a7", name:"Balancetes_e_Balanco.pdf" },
            { id:"a8", name:"DRE_Modelo.xlsx" },
          ] },
        { id: "c6", nome: "Legislação Tributária",
          arquivos: [
            { id:"a9",  name:"Impostos_Federais.pdf" },
            { id:"a10", name:"ICMS_IPI_PIS_COFINS.pptx" },
          ] },
        { id: "c7", nome: "Contabilidade de Custos",
          arquivos: [
            { id:"a11", name:"Custo_Direto_Indireto.pdf" },
            { id:"a12", name:"Markup_e_Precificacao.xlsx" },
          ] },
      ],
    },
    {
      id: "sem3", nome: "3º Semestre - 2026.1",
      cadeiras: [
        { id: "c8", nome: "Auditoria Contábil",
          arquivos: [
            { id:"a13", name:"Normas_Auditoria_NBC.pdf" },
            { id:"a14", name:"Checklist_Auditoria.xlsx" },
          ] },
        { id: "c9", nome: "Análise de Balanços",
          arquivos: [
            { id:"a15", name:"Indices_Financeiros.pdf" },
            { id:"a16", name:"Planilha_Indices.xlsx" },
          ] },
        { id: "c10", nome: "Gestão Financeira",
          arquivos: [
            { id:"a17", name:"Fluxo_de_Caixa.pdf" },
            { id:"a18", name:"Orçamento_Empresarial.xlsx" },
          ] },
      ],
    },
  ];
}

/* ══════════════════════════════════════════════════════
   GERAÇÃO DE NEWSLETTER — LOCAL (sem API externa)
   Conteúdo gerado com base no nome da cadeira e arquivos.
   ══════════════════════════════════════════════════════ */

/**
 * Banco de conteúdo por área — usado para gerar newsletters localmente.
 * Expanda conforme suas cadeiras reais.
 */
const CONTEUDO_BASE = {
  contab: {
    topicos: [
      { titulo: "Princípios Contábeis Fundamentais",
        descricao: "Os princípios contábeis geralmente aceitos (PCGA) formam a base para o registro e divulgação das informações financeiras. Incluem entidade, continuidade, oportunidade e competência.",
        exemplo: "Competência: receitas e despesas são reconhecidas no período em que ocorrem, independentemente do pagamento." },
      { titulo: "Equação Patrimonial",
        descricao: "A equação fundamental da contabilidade expressa o equilíbrio entre Ativo, Passivo e Patrimônio Líquido.",
        exemplo: "Ativo = Passivo + Patrimônio Líquido → A = P + PL" },
      { titulo: "Débito e Crédito",
        descricao: "O método das partidas dobradas exige que todo lançamento tenha um débito e um crédito de mesmo valor, mantendo o equilíbrio da equação patrimonial.",
        exemplo: "Compra de estoque à vista: D – Estoque / C – Caixa" },
      { titulo: "Demonstrações Contábeis",
        descricao: "As principais demonstrações são Balanço Patrimonial, DRE, DMPL, DFC e Notas Explicativas. Cada uma revela uma dimensão diferente da saúde financeira da empresa.",
        exemplo: "DRE: Receita Bruta – Deduções = Receita Líquida – CMV = Lucro Bruto – Despesas = Lucro Líquido" },
    ],
    conceitos: ["Ativo","Passivo","Patrimônio Líquido","Receita","Despesa","Resultado","Lançamento","Razão","Balancete"],
    formula: "Ativo Total = Passivo Circulante + Passivo Não Circulante + Patrimônio Líquido",
    questoes: [
      "O que diferencia Ativo Circulante de Ativo Não Circulante?",
      "Como funciona o método das partidas dobradas?",
      "Qual a diferença entre regime de caixa e regime de competência?",
      "Como é estruturado o Balanço Patrimonial?",
    ],
    fontes: ["NBC TG — Normas Brasileiras de Contabilidade (CFC)", "Marion, J.C. — Contabilidade Empresarial (Atlas)", "Portal do CFC: cfc.org.br"],
    nivel: "Intermediário", horas: 4,
  },
  financ: {
    topicos: [
      { titulo: "Valor do Dinheiro no Tempo",
        descricao: "Um real hoje vale mais do que um real no futuro devido ao potencial de ganho ao longo do tempo. Esse conceito é central em todas as análises financeiras.",
        exemplo: "VP = VF / (1 + i)ⁿ → R$1.000 daqui a 1 ano com i=10%: VP = R$909,09" },
      { titulo: "Juros Simples e Compostos",
        descricao: "No juro simples, os juros incidem apenas sobre o capital inicial. No juro composto, os juros acumulam sobre os juros anteriores (capitalização).",
        exemplo: "Simples: J = C × i × n | Composto: M = C × (1 + i)ⁿ" },
      { titulo: "Sistemas de Amortização",
        descricao: "Os principais sistemas são SAC (amortização constante) e PRICE (prestação constante). Cada um tem perfis diferentes de juros pagos ao longo do tempo.",
        exemplo: "SAC: parcelas decrescentes | PRICE: parcelas constantes" },
      { titulo: "Taxa Efetiva e Nominal",
        descricao: "A taxa nominal não considera a capitalização no período; a taxa efetiva reflete o custo ou rendimento real após capitalização.",
        exemplo: "Taxa nominal 12% a.a. capitalizada mensalmente → taxa efetiva = (1+0,01)¹² − 1 = 12,68% a.a." },
    ],
    conceitos: ["Taxa de juros","Capitalização","Valor Presente","Valor Futuro","Amortização","Anuidade","TIR","VPL","Payback"],
    formula: "VPL = Σ [FCt / (1+i)ᵗ] − Investimento Inicial",
    questoes: [
      "Qual a diferença entre juro simples e juro composto?",
      "Como calcular o valor presente de um fluxo de caixa futuro?",
      "Em que situação o sistema SAC é mais vantajoso que o PRICE?",
      "O que é TIR e como ela auxilia na tomada de decisão?",
    ],
    fontes: ["Assaf Neto — Matemática Financeira e suas Aplicações", "Calculadora do Cidadão (BCB)", "Khan Academy — Finanças"],
    nivel: "Intermediário", horas: 5,
  },
  tribut: {
    topicos: [
      { titulo: "Tributos Federais",
        descricao: "Os principais tributos federais que afetam as empresas são IRPJ, CSLL, PIS, COFINS e IPI. Cada um possui base de cálculo, alíquota e regime próprios.",
        exemplo: "Lucro Real: IRPJ = 15% sobre Lucro Real + adicional de 10% sobre o que exceder R$20.000/mês" },
      { titulo: "Regimes Tributários",
        descricao: "Simples Nacional, Lucro Presumido e Lucro Real são os principais regimes. A escolha impacta diretamente a carga tributária e as obrigações acessórias.",
        exemplo: "Simples Nacional: alíquota única progressiva por faixa de faturamento (Anexos I a V)" },
      { titulo: "ICMS e ISS",
        descricao: "ICMS (estadual) incide sobre circulação de mercadorias; ISS (municipal) sobre prestação de serviços. Ambos compõem a estrutura tributária indireta brasileira.",
        exemplo: "ICMS por dentro: se o preço é R$100 com alíquota 12%, o ICMS embutido = R$100 × 12% = R$12" },
      { titulo: "Obrigações Acessórias",
        descricao: "Além do pagamento dos tributos, as empresas devem cumprir obrigações acessórias como SPED, EFD-Contribuições, DCTF, ECF e eSocial.",
        exemplo: "SPED Fiscal: escrituração digital dos livros fiscais entregue mensalmente à Receita Federal" },
    ],
    conceitos: ["Fato gerador","Base de cálculo","Alíquota","IRPJ","CSLL","PIS","COFINS","ICMS","ISS","Substituição tributária"],
    formula: "Carga Tributária Efetiva = (Total de Tributos Pagos / Receita Bruta) × 100",
    questoes: [
      "Quais são as diferenças entre Lucro Real e Lucro Presumido?",
      "O que é substituição tributária e como funciona?",
      "Como calcular o PIS e a COFINS no regime não cumulativo?",
      "Quais empresas são obrigadas ao Lucro Real?",
    ],
    fontes: ["Receita Federal: receita.fazenda.gov.br", "Portal Tributário: portaltributario.com.br", "Higuchi — Imposto de Renda das Empresas (IR Publicações)"],
    nivel: "Avançado", horas: 5,
  },
  custo: {
    topicos: [
      { titulo: "Classificação dos Custos",
        descricao: "Custos são classificados quanto à variabilidade (fixos e variáveis) e quanto à identificação (diretos e indiretos). Essa classificação orienta o sistema de custeio escolhido.",
        exemplo: "Custo fixo: aluguel da fábrica (não varia com a produção) | Custo variável: matéria-prima (proporcional à produção)" },
      { titulo: "Custeio por Absorção e Variável",
        descricao: "No custeio por absorção todos os custos de produção são alocados ao produto. No custeio variável, apenas os custos variáveis compõem o custo do produto.",
        exemplo: "Custeio Variável → Margem de Contribuição = Receita − Custos e Despesas Variáveis" },
      { titulo: "Ponto de Equilíbrio",
        descricao: "O ponto de equilíbrio (break-even) é o volume de vendas onde receitas igualam custos totais, sem lucro nem prejuízo.",
        exemplo: "PE Contábil (unid.) = Custo Fixo Total / Margem de Contribuição Unitária" },
      { titulo: "Markup e Formação de Preço",
        descricao: "O markup é o índice aplicado sobre o custo do produto para cobrir despesas e gerar lucro. É essencial para a precificação estratégica.",
        exemplo: "Markup = 1 / (1 − (Impostos% + Despesas% + Lucro%) / 100)" },
    ],
    conceitos: ["Margem de contribuição","Ponto de equilíbrio","Custeio ABC","Overhead","Rateio","Markup","Break-even","Custo-volume-lucro"],
    formula: "Ponto de Equilíbrio (R$) = Custos Fixos / (1 − Custos Variáveis / Receita Total)",
    questoes: [
      "Como diferenciar custo direto de custo indireto?",
      "Qual a vantagem do custeio variável para a tomada de decisão?",
      "Como calcular o ponto de equilíbrio contábil e financeiro?",
      "O que é margem de contribuição e como ela é usada?",
    ],
    fontes: ["Martins, Eliseu — Contabilidade de Custos (Atlas)", "Horngren — Cost Accounting", "CRC-SP: Material de Custos"],
    nivel: "Intermediário", horas: 4,
  },
  audit: {
    topicos: [
      { titulo: "Normas de Auditoria (NBC TA)",
        descricao: "As Normas Brasileiras de Contabilidade Técnicas de Auditoria regulam o trabalho do auditor independente. São convergentes com as ISA (International Standards on Auditing).",
        exemplo: "NBC TA 200: objetivos gerais do auditor independente e condução da auditoria conforme normas" },
      { titulo: "Planejamento e Risco de Auditoria",
        descricao: "O risco de auditoria é composto pelo risco inerente, risco de controle e risco de detecção. O planejamento visa reduzir esse risco a um nível aceitavelmente baixo.",
        exemplo: "Risco de Auditoria = Risco Inerente × Risco de Controle × Risco de Detecção" },
      { titulo: "Evidências e Procedimentos",
        descricao: "As evidências de auditoria são obtidas por inspeção, observação, confirmação, recálculo, reexecução, procedimentos analíticos e indagação.",
        exemplo: "Circularização de clientes: confirmação externa dos saldos de contas a receber" },
      { titulo: "Relatório do Auditor",
        descricao: "O relatório pode conter opinião sem modificação (limpa), com modificação (com ressalva, adversa ou abstenção de opinião), dependendo das evidências obtidas.",
        exemplo: "Opinião adversa: demonstrações não representam adequadamente a posição financeira da entidade" },
    ],
    conceitos: ["Materialidade","Risco de auditoria","Evidência","Controle interno","Parecer","NBC TA","Escopo","Independência","Due diligence"],
    formula: "Materialidade de Planejamento ≈ 5% do Lucro Antes do IR ou 1% da Receita Bruta",
    questoes: [
      "Quais os componentes do risco de auditoria?",
      "O que diferencia opinião com ressalva de opinião adversa?",
      "Como o auditor determina a materialidade?",
      "Quais são os tipos de procedimentos de auditoria?",
    ],
    fontes: ["CFC — NBC TA (normas completas): cfc.org.br", "Attie, William — Auditoria: Conceitos e Aplicações", "IBRACON: ibracon.com.br"],
    nivel: "Avançado", horas: 5,
  },
  default: {
    topicos: [
      { titulo: "Fundamentos da Disciplina",
        descricao: "Esta cadeira estabelece as bases conceituais e teóricas necessárias para a compreensão dos temas subsequentes no curso de Ciências Contábeis.",
        exemplo: "Aprofunde-se nos conceitos introdutórios antes de avançar para os tópicos mais complexos." },
      { titulo: "Aplicações Práticas",
        descricao: "A teoria é reforçada com exercícios práticos, estudos de caso e análise de situações reais do mercado contábil e empresarial.",
        exemplo: "Relacione cada conceito estudado com situações do dia a dia das organizações." },
      { titulo: "Legislação e Normas Aplicáveis",
        descricao: "O exercício profissional contábil é regulado por normas do CFC, CVM, Receita Federal e pelo alinhamento às normas internacionais IFRS.",
        exemplo: "Consulte sempre a versão atualizada das normas no portal do CFC: cfc.org.br" },
    ],
    conceitos: ["Contabilidade","Normas","Demonstrações","Análise","Gestão","Planejamento","Controle","Relatório"],
    formula: null,
    questoes: [
      "Quais são os principais conceitos desta disciplina?",
      "Como esta matéria se relaciona com as demais do curso?",
      "Que habilidades práticas você desenvolveu nesta cadeira?",
      "Quais são as principais normas aplicáveis a esta área?",
    ],
    fontes: ["Portal do CFC: cfc.org.br", "Receita Federal: receita.fazenda.gov.br", "CVM: cvm.gov.br"],
    nivel: "Básico", horas: 3,
  },
};

/**
 * Seleciona o conteúdo base adequado para a cadeira.
 */
function selecionarConteudo(cadeiraNome) {
  const n = normalize(cadeiraNome);
  if (n.includes("contab")) return CONTEUDO_BASE.contab;
  if (n.includes("financ") || n.includes("matematica") || n.includes("calculo")) return CONTEUDO_BASE.financ;
  if (n.includes("tribut") || n.includes("fiscal") || n.includes("imposto")) return CONTEUDO_BASE.tribut;
  if (n.includes("custo")) return CONTEUDO_BASE.custo;
  if (n.includes("audit")) return CONTEUDO_BASE.audit;
  return CONTEUDO_BASE.default;
}

/**
 * Gera o objeto de newsletter localmente (sem chamada à API).
 */
function gerarNewsletterLocal(cadeira, semestreNome) {
  const base = selecionarConteudo(cadeira.nome);
  const tiposArquivos = [...new Set(cadeira.arquivos.map(f => (f.name.split(".").pop() || "").toUpperCase()))];

  return {
    resumo_executivo: `A cadeira de ${cadeira.nome} (${semestreNome}) abrange os fundamentos e aplicações essenciais para a formação do profissional contábil. Os materiais disponíveis (${tiposArquivos.join(", ") || "—"}) cobrem os principais tópicos da ementa, com ênfase na prática e no entendimento conceitual. O domínio deste conteúdo é fundamental para as disciplinas subsequentes do curso.`,
    topicos_principais: base.topicos,
    conceitos_chave: base.conceitos,
    formula_destaque: base.formula,
    feynman_aplicacao: `Para aplicar o Método Feynman em ${cadeira.nome}: escolha um conceito central (ex.: "${base.conceitos[0]}"), escreva uma explicação como se fosse ensinar alguém que nunca estudou o assunto. Use exemplos numéricos simples. Onde você travar ou usar jargão sem explicar — esse é o ponto a revisar no material.`,
    questoes_revisao: base.questoes,
    proximos_passos: `Após dominar os fundamentos de ${cadeira.nome}, aprofunde-se nas normas técnicas específicas, resolva exercícios com dados reais e procure relacionar o conteúdo com as demais cadeiras do semestre. Leia casos práticos do mercado para consolidar o aprendizado.`,
    fontes_recomendadas: base.fontes,
    nivel_complexidade: base.nivel,
    carga_estimada_horas: base.horas + cadeira.arquivos.length,
  };
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO DE NEWSLETTER
   ══════════════════════════════════════════════════════ */

function renderNewsletterHTML(nl, cadeira, semestreNome) {
  const contabil = isContabil(cadeira.nome);

  const topicosHTML = (nl.topicos_principais || []).map(t => `
    <li>
      <strong>${t.titulo}</strong><br>${t.descricao}
      ${t.exemplo ? `<br><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:4px;display:block">▸ ${t.exemplo}</span>` : ""}
    </li>`).join("");

  const conceitosHTML = (nl.conceitos_chave || []).map(c =>
    `<span class="file-chip">${c}</span>`).join("");

  const questoesHTML = (nl.questoes_revisao || []).map(q =>
    `<div class="review-card">${q}</div>`).join("");

  const fontesHTML = (nl.fontes_recomendadas || []).map(f =>
    `<li>${f}</li>`).join("");

  const arquivosHTML = (cadeira.arquivos || []).map(a =>
    `<span class="file-chip">${fileIcon(a.name)} ${a.name}</span>`).join("");

  const formulaBlock = nl.formula_destaque ? `
    <div class="nl-section" style="border-left:3px solid ${contabil ? "var(--accent-2)" : "var(--accent)"}">
      <div class="nl-section-label">FÓRMULA EM DESTAQUE</div>
      <h2><span class="section-icon">∑</span> Equação Principal</h2>
      <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:16px 20px;font-family:var(--font-mono);font-size:15px;color:var(--text-pri);margin-top:8px;letter-spacing:.03em">
        ${nl.formula_destaque}
      </div>
    </div>` : "";

  return `
  <div class="newsletter-wrap">
    <div class="nl-masthead">
      <div class="nl-edition">NEWSLETTER ACADÊMICA • ${contabil ? "CONTÁBIL / CÁLCULO ★" : "ACADÊMICO"}</div>
      <div class="nl-title">${cadeira.nome}</div>
      <div class="nl-meta-row">
        <div class="nl-meta-item">📅 <strong>${formatDate(new Date())}</strong></div>
        <div class="nl-meta-item">📚 <strong>${semestreNome}</strong></div>
        <div class="nl-meta-item">⏱ <strong>${nl.carga_estimada_horas || "—"}h</strong> estimadas</div>
        <div class="nl-meta-item">📊 <strong>${nl.nivel_complexidade || "—"}</strong></div>
      </div>
    </div>

    <div class="nl-section">
      <div class="nl-section-label">RESUMO EXECUTIVO</div>
      <h2><span class="section-icon">◈</span> Visão Geral</h2>
      <p>${nl.resumo_executivo || "—"}</p>
    </div>

    ${cadeira.arquivos.length ? `
    <div class="nl-section">
      <div class="nl-section-label">MATERIAIS DA PASTA</div>
      <h2><span class="section-icon">📂</span> Arquivos Detectados (${cadeira.arquivos.length})</h2>
      <div class="files-chips">${arquivosHTML}</div>
    </div>` : ""}

    ${formulaBlock}

    ${topicosHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">CONTEÚDO DETALHADO</div>
      <h2><span class="section-icon">▦</span> Tópicos Principais</h2>
      <ul>${topicosHTML}</ul>
    </div>` : ""}

    ${conceitosHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">VOCABULÁRIO ESSENCIAL</div>
      <h2><span class="section-icon">◉</span> Conceitos-Chave</h2>
      <div class="files-chips" style="margin-top:8px">${conceitosHTML}</div>
    </div>` : ""}

    <div class="feynman-box">
      <div class="feynman-label">✦ Método de Estudo — Richard Feynman</div>
      <h3>Aprenda ensinando</h3>
      <p style="font-size:13px;color:var(--text-sec);line-height:1.65;margin-bottom:4px">
        ${nl.feynman_aplicacao || "Explique o conteúdo como se ensinasse alguém sem conhecimento prévio."}
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

    ${questoesHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">AUTOAVALIAÇÃO</div>
      <h2><span class="section-icon">?</span> Questões de Revisão</h2>
      <div class="review-grid">${questoesHTML}</div>
    </div>` : ""}

    ${nl.proximos_passos ? `
    <div class="nl-section">
      <div class="nl-section-label">APROFUNDAMENTO</div>
      <h2><span class="section-icon">→</span> Próximos Passos</h2>
      <p>${nl.proximos_passos}</p>
    </div>` : ""}

    ${fontesHTML ? `
    <div class="nl-section">
      <div class="nl-section-label">REFERÊNCIAS</div>
      <h2><span class="section-icon">📖</span> Fontes Recomendadas</h2>
      <ul>${fontesHTML}</ul>
    </div>` : ""}
  </div>`;
}

/* ══════════════════════════════════════════════════════
   NAVEGAÇÃO
   ══════════════════════════════════════════════════════ */

function navigateTo(page, params = {}) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const target = document.getElementById("page-" + page);
  if (target) target.classList.add("active");

  const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add("active");

  if (page === "semestre" && params.semestreId) renderSemestrePage(params.semestreId);
  if (page === "newsletter" && params.cadeiraId) renderNewsletterPage(params.cadeiraId, params.semestreNome || "");

  document.getElementById("main-content").scrollTo({ top: 0, behavior: "smooth" });
}

/* ══════════════════════════════════════════════════════
   RENDERIZAÇÃO — HOME
   ══════════════════════════════════════════════════════ */

function renderHome() {
  const totalCadeiras  = STATE.semestres.reduce((s, sem) => s + sem.cadeiras.length, 0);
  const totalArquivos  = STATE.semestres.reduce((s, sem) =>
    s + sem.cadeiras.reduce((c, cad) => c + cad.arquivos.length, 0), 0);

  document.getElementById("stat-semestres").textContent  = STATE.semestres.length;
  document.getElementById("stat-cadeiras").textContent   = totalCadeiras;
  document.getElementById("stat-arquivos").textContent   = totalArquivos;
  document.getElementById("stat-newsletters").textContent = STATE.newsletters.length;

  // Últimas newsletters
  const recentes = [...STATE.newsletters].reverse().slice(0, 3);
  const homeGrid = document.getElementById("home-newsletters-grid");
  homeGrid.innerHTML = recentes.length
    ? recentes.map(nl => buildNLCard(nl)).join("")
    : `<div style="grid-column:1/-1;color:var(--text-ter);font-size:14px;padding:20px 0">
         Clique em uma cadeira no menu lateral e depois em "Gerar Newsletter" para começar.
       </div>`;

  // Cadeiras em destaque (contábeis/cálculo)
  const todas = STATE.semestres.flatMap(s => s.cadeiras.map(c => ({ ...c, semestreNome: s.nome })));
  const destaques = todas.filter(c => isContabil(c.nome)).slice(0, 4);
  const hGrid = document.getElementById("highlight-grid");
  hGrid.innerHTML = destaques.length
    ? destaques.map((c, i) => `
        <div class="highlight-card ${i % 2 === 1 ? "orange" : ""}" data-icon="∑"
             onclick="navigateTo('newsletter', { cadeiraId: '${c.id}', semestreNome: '${c.semestreNome}' })">
          <div class="hl-tag">${c.semestreNome} • Em destaque</div>
          <div class="hl-title">${c.nome}</div>
          <div class="hl-desc">${c.arquivos.length} arquivo(s) • Clique para abrir a newsletter</div>
        </div>`).join("")
    : `<div style="grid-column:1/-1;color:var(--text-ter);font-size:14px;padding:20px 0">
         Adicione cadeiras com nomes como "Contabilidade", "Tributário" ou "Custos" para ver destaques.
       </div>`;
}

/* ══════════════════════════════════════════════════════
   SIDEBAR — SEMESTRES
   ══════════════════════════════════════════════════════ */

function renderSidebarSemestres() {
  document.getElementById("nav-semestres").innerHTML = STATE.semestres.map(s => `
    <button class="nav-item" data-page="semestre-${s.id}"
            onclick="navigateTo('semestre', { semestreId: '${s.id}' })">
      <span class="nav-icon">◎</span><span>${s.nome}</span>
    </button>`).join("");

  const sel = document.getElementById("nl-filter-semestre");
  sel.innerHTML = `<option value="">Todos os Semestres</option>` +
    STATE.semestres.map(s => `<option value="${s.id}">${s.nome}</option>`).join("");
}

/* ══════════════════════════════════════════════════════
   PÁGINA DE SEMESTRE
   ══════════════════════════════════════════════════════ */

function renderSemestrePage(semestreId) {
  const sem = STATE.semestres.find(s => s.id === semestreId);
  if (!sem) return;

  document.getElementById("semestre-title").innerHTML =
    sem.nome.replace(/(\d+[ºo°]?)/, "<em>$1</em>");

  document.getElementById("cadeiras-list").innerHTML = sem.cadeiras.map(cad => {
    const nlOk = STATE.newsletters.find(n => n.cadeiraId === cad.id);
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
            ${cad.arquivos.map(f => `<span class="file-chip">${fileIcon(f.name)} ${f.name}</span>`).join("")
              || `<span style="color:var(--text-ter);font-size:13px">Nenhum arquivo detectado.</span>`}
          </div>
          <div class="cadeira-preview" style="margin-top:12px;font-size:13.5px;color:var(--text-sec)">
            ${nlOk ? `<em>✓ Newsletter gerada em ${formatDate(new Date(nlOk.geradaEm))}</em>` : "Newsletter ainda não gerada para esta cadeira."}
          </div>
          <button class="btn-open-nl"
                  onclick="navigateTo('newsletter',{cadeiraId:'${cad.id}',semestreNome:'${sem.nome}'})">
            ${nlOk ? "↻ Ver Newsletter" : "◈ Gerar Newsletter"} →
          </button>
        </div>
      </div>`;
  }).join("");
}

function toggleCadeira(id) {
  document.getElementById("cad-row-" + id).classList.toggle("open");
}

/* ══════════════════════════════════════════════════════
   PÁGINA DE NEWSLETTER
   ══════════════════════════════════════════════════════ */

function renderNewsletterPage(cadeiraId, semestreNome) {
  const container = document.getElementById("newsletter-content");
  hideError();

  // Encontra cadeira em qualquer semestre
  const cadeira = STATE.semestres
    .flatMap(s => s.cadeiras.map(c => ({ ...c, semestreNome: s.nome })))
    .find(c => c.id === cadeiraId);

  if (!cadeira) {
    container.innerHTML = `<div class="error-banner"><span>⚠</span><span>Cadeira não encontrada.</span></div>`;
    return;
  }

  const semNome = semestreNome || cadeira.semestreNome;

  // Newsletter já gerada?
  const existente = STATE.newsletters.find(n => n.cadeiraId === cadeiraId);
  if (existente) {
    container.innerHTML = renderNewsletterHTML(existente.conteudo, cadeira, semNome);
    addRegenerateButton(container, cadeiraId, semNome);
    return;
  }

  // Gera localmente (instantâneo, sem chamada externa)
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:30vh">
    <div class="loader-ring"></div></div>`;

  setTimeout(() => {
    try {
      const nlData = gerarNewsletterLocal(cadeira, semNome);
      STATE.newsletters.push({
        cadeiraId,
        cadeiraNome: cadeira.nome,
        semestreNome: semNome,
        conteudo: nlData,
        geradaEm: Date.now(),
      });
      saveNewslettersLocal();
      container.innerHTML = renderNewsletterHTML(nlData, cadeira, semNome);
      addRegenerateButton(container, cadeiraId, semNome);
      renderHome();
    } catch (err) {
      container.innerHTML = `<div class="error-banner"><span>⚠</span><span>Erro: ${err.message}</span></div>`;
    }
  }, 400); // pequeno delay para mostrar o loading
}

function addRegenerateButton(container, cadeiraId, semestreNome) {
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
   TODAS AS NEWSLETTERS
   ══════════════════════════════════════════════════════ */

function renderAllNewsletters() {
  const grid   = document.getElementById("all-newsletters-grid");
  const busca  = normalize(document.getElementById("nl-search").value);
  const filSem = document.getElementById("nl-filter-semestre").value;
  const semNomeFilter = filSem ? STATE.semestres.find(s => s.id === filSem)?.nome : "";

  let lista = STATE.newsletters;
  if (busca)      lista = lista.filter(nl => normalize(nl.cadeiraNome).includes(busca) || normalize(nl.semestreNome).includes(busca));
  if (semNomeFilter) lista = lista.filter(nl => nl.semestreNome === semNomeFilter);

  grid.innerHTML = lista.length
    ? lista.map(nl => buildNLCard(nl)).join("")
    : `<div style="grid-column:1/-1;color:var(--text-ter);font-size:14px;padding:20px 0">
         Nenhuma newsletter encontrada. Gere newsletters nas cadeiras dos semestres.
       </div>`;
}

function filterNewsletters() { renderAllNewsletters(); }

function buildNLCard(nl) {
  const contabil = isContabil(nl.cadeiraNome);
  const resumo   = nl.conteudo?.resumo_executivo || "";
  const nivel    = nl.conteudo?.nivel_complexidade || "";
  return `
    <div class="nl-card ${contabil ? "contabil" : ""}"
         onclick="navigateTo('newsletter',{cadeiraId:'${nl.cadeiraId}',semestreNome:'${nl.semestreNome}'})">
      <span class="card-tag">${contabil ? "★ Contábil" : "◈ Acadêmico"}</span>
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
   PERSISTÊNCIA LOCAL
   ══════════════════════════════════════════════════════ */

function saveNewslettersLocal() {
  try { localStorage.setItem("jornada_newsletters_v2", JSON.stringify(STATE.newsletters)); }
  catch { /* quota */ }
}

function loadNewslettersLocal() {
  try {
    const s = localStorage.getItem("jornada_newsletters_v2");
    if (s) STATE.newsletters = JSON.parse(s);
  } catch { STATE.newsletters = []; }
}

/* ══════════════════════════════════════════════════════
   REFRESH / INICIALIZAÇÃO
   ══════════════════════════════════════════════════════ */

async function refreshData() {
  const icon = document.getElementById("refresh-icon");
  icon.classList.add("spinning");
  setLoading(true);
  hideError();

  try {
    STATE.semestres = await loadDriveStructure();
    STATE.loadedAt  = new Date();

    renderSidebarSemestres();
    renderHome();
    renderAllNewsletters();

    document.getElementById("last-update").textContent =
      "Atualizado\n" + formatDate(STATE.loadedAt);

  } catch (err) {
    console.error("[JornadaAcadêmica]", err);
    showError("Erro ao carregar o Drive: " + err.message);
  } finally {
    setLoading(false);
    icon.classList.remove("spinning");
  }
}

function openModal(html) {
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

async function init() {
  loadNewslettersLocal();
  await refreshData();
  setInterval(refreshData, AUTO_REFRESH_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", init);
