"use strict";

/* =========================================================
   1. Ativos — cada um com a cor de uma cédula do real
   ========================================================= */
const PADRAO = [
  { id:"poupanca", nome:"Poupança",        nota:"R$ 200 · lobo-guará", cor:"#8E96A6",
    taxas:{pess:5.5,  base:6.3,  otim:7.0},  ir:"isento",   risco:1,
    obs:"0,5% ao mês + TR enquanto a Selic estiver acima de 8,5%." },
  { id:"selic",    nome:"Tesouro Selic",   nota:"R$ 1 · beija-flor",   cor:"#2F8F6B",
    taxas:{pess:8.5,  base:11.0, otim:13.5}, ir:"regressivo", risco:1,
    obs:"Acompanha a Selic. Liquidez diária e risco soberano." },
  { id:"cdb",      nome:"CDB 100% do CDI", nota:"R$ 100 · garoupa",    cor:"#2E7FA8",
    taxas:{pess:8.0,  base:11.0, otim:14.0}, ir:"regressivo", risco:1,
    obs:"Coberto pelo FGC até R$ 250 mil por banco." },
  { id:"ipca",     nome:"Tesouro IPCA+",   nota:"R$ 50 · onça",        cor:"#B0793C",
    taxas:{pess:8.0,  base:10.5, otim:13.0}, ir:"regressivo", risco:2,
    obs:"IPCA + juro real. Oscila se você vender antes do vencimento." },
  { id:"fii",      nome:"Fundos imobiliários", nota:"R$ 5 · garça",    cor:"#7A5AA8",
    taxas:{pess:3.0,  base:11.0, otim:17.0}, ir:"fixo:20",  risco:3,
    obs:"Os aluguéis mensais costumam ser isentos; o ganho na venda, não." },
  { id:"acoes",    nome:"Ações / ETF",     nota:"R$ 20 · mico-leão",   cor:"#DDA92F",
    taxas:{pess:2.0,  base:13.0, otim:22.0}, ir:"fixo:15",  risco:3,
    obs:"Vendas de ações até R$ 20 mil por mês podem ser isentas; ETFs não são." },
  { id:"cripto",   nome:"Criptomoeda",     nota:"R$ 10 · arara",       cor:"#C9502F",
    taxas:{pess:-25, base:20.0, otim:60.0}, ir:"fixo:17.5", risco:4,
    obs:"Sem garantia nenhuma. Confira a alíquota vigente antes de declarar." }
];

const ROTULO_RISCO = {1:"Baixo",2:"Médio",3:"Alto",4:"Muito alto"};

let ativos = clonar(PADRAO);
let visivel = {};
ativos.forEach(a => visivel[a.id] = true);

const estado = { aporte:500, inicial:0, anos:10, cenario:"base", ir:true, infl:false, inflacao:4.5 };

function clonar(x){ return JSON.parse(JSON.stringify(x)); }

/* =========================================================
   2. Formatação
   ========================================================= */
const fmtBRL  = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
const fmtBRL0 = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const fmtNum  = new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

function curto(v){
  const s = v < 0 ? "-" : "";
  const n = Math.abs(v);
  if (n >= 1e6) return s + "R$ " + (n/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1}) + " mi";
  if (n >= 1e3) return s + "R$ " + Math.round(n/1e3) + " mil";
  return s + "R$ " + Math.round(n);
}

/* =========================================================
   3. Motor de cálculo
   -------------------------------------------------------
   Depósito no início de cada mês; juros compostos mensais.
   O IR é apurado parcela a parcela, porque a alíquota
   regressiva depende de quanto tempo cada aporte ficou
   aplicado.
   ========================================================= */
function taxaMensal(anual){ return Math.pow(1 + anual/100, 1/12) - 1; }

function aliquotaRegressiva(dias){
  if (dias > 720) return 15;
  if (dias > 360) return 17.5;
  if (dias > 180) return 20;
  return 22.5;
}

function simular(ativo, cfg){
  const im = taxaMensal(ativo.taxas[cfg.cenario]);
  const N  = cfg.anos * 12;

  const serie = [];
  let saldo = cfg.inicial;
  let investido = cfg.inicial;
  serie.push({ mes:0, saldo, investido });

  for (let m = 1; m <= N; m++){
    saldo = (saldo + cfg.aporte) * (1 + im);
    investido += cfg.aporte;
    serie.push({ mes:m, saldo, investido });
  }

  // Imposto: cada parcela tem sua própria idade
  let imposto = 0;
  const parcelas = [];
  if (cfg.inicial > 0) parcelas.push({ valor: cfg.inicial, meses: N });
  for (let m = 1; m <= N; m++) parcelas.push({ valor: cfg.aporte, meses: N - m + 1 });

  for (const p of parcelas){
    const bruto = p.valor * Math.pow(1 + im, p.meses);
    const ganho = bruto - p.valor;
    if (ganho <= 0) continue;
    let aliq = 0;
    if (ativo.ir === "regressivo")        aliq = aliquotaRegressiva(p.meses * 30);
    else if (ativo.ir.startsWith("fixo:")) aliq = parseFloat(ativo.ir.split(":")[1]);
    imposto += ganho * aliq / 100;
  }
  if (!cfg.ir) imposto = 0;

  const bruto   = serie[serie.length-1].saldo;
  const liquido = bruto - imposto;

  // Correção pela inflação, se pedida
  let fator = 1;
  if (cfg.infl){
    const infMes = taxaMensal(cfg.inflacao);
    fator = 1 / Math.pow(1 + infMes, N);
    serie.forEach(p => {
      p.saldo = p.saldo / Math.pow(1 + infMes, p.mes);
      p.investido = p.investido / Math.pow(1 + infMes, p.mes);
    });
  }

  return {
    ativo,
    serie,
    investido,
    bruto: bruto * fator,
    imposto: imposto * fator,
    liquido: liquido * fator,
    ganho: liquido * fator - (cfg.infl ? serie[serie.length-1].investido : investido),
    investidoAjustado: cfg.infl ? serie[serie.length-1].investido : investido,
    taxa: ativo.taxas[cfg.cenario]
  };
}

// A série precisa refletir o líquido para o gráfico não mentir.
// Aplica-se o desconto de IR proporcionalmente ao ganho acumulado.
function serieLiquida(r, cfg){
  const gBruto = r.serie[r.serie.length-1].saldo - r.serie[r.serie.length-1].investido;
  const prop = gBruto > 0 ? (r.liquido - r.investidoAjustado) / gBruto : 1;
  return r.serie.map(p => ({
    mes: p.mes,
    valor: p.investido + (p.saldo - p.investido) * (p.saldo > p.investido ? prop : 1),
    investido: p.investido
  }));
}

function calcularTudo(){
  const cfg = { ...estado };
  return ativos.map(a => {
    const r = simular(a, cfg);
    r.linha = serieLiquida(r, cfg);
    return r;
  });
}

/* =========================================================
   4. Gráfico de linha (SVG desenhado à mão)
   ========================================================= */
const W = 780, H = 400, ML = 62, MR = 16, MT = 18, MB = 34;

function desenharLinha(resultados){
  const svg = document.getElementById("grafico-linha");
  const vis = resultados.filter(r => visivel[r.ativo.id]);
  const N = estado.anos * 12;

  let max = 0;
  vis.forEach(r => r.linha.forEach(p => { if (p.valor > max) max = p.valor; }));
  const invFinal = resultados[0].linha[resultados[0].linha.length-1].investido;
  max = Math.max(max, invFinal, 1);
  max *= 1.08;

  const x = m => ML + (m / Math.max(N,1)) * (W - ML - MR);
  const y = v => H - MB - (v / max) * (H - MT - MB);

  let out = "";

  // grade horizontal
  const passos = 5;
  for (let i = 0; i <= passos; i++){
    const v = max * i / passos, py = y(v);
    out += `<line class="eixo" x1="${ML}" y1="${py.toFixed(1)}" x2="${W-MR}" y2="${py.toFixed(1)}"/>`;
    out += `<text class="rotulo" x="${ML-9}" y="${(py+4).toFixed(1)}" text-anchor="end">${curto(v)}</text>`;
  }

  // marcas de ano
  const passoAno = Math.max(1, Math.ceil(estado.anos / 8));
  for (let a = 0; a <= estado.anos; a += passoAno){
    const px = x(a*12);
    out += `<line class="eixo" x1="${px.toFixed(1)}" y1="${H-MB}" x2="${px.toFixed(1)}" y2="${H-MB+5}"/>`;
    out += `<text class="rotulo" x="${px.toFixed(1)}" y="${H-MB+19}" text-anchor="middle">${a===0?"hoje":a+"a"}</text>`;
  }

  // linha dos aportes
  const base = resultados[0].linha;
  let dAp = "";
  base.forEach((p,i) => { dAp += (i?"L":"M") + x(p.mes).toFixed(1) + " " + y(p.investido).toFixed(1) + " "; });
  out += `<path class="aportes" d="${dAp}"/>`;
  out += `<text class="rotulo" x="${W-MR}" y="${(y(invFinal)-8).toFixed(1)}" text-anchor="end">o que você depositou</text>`;

  // séries
  vis.forEach(r => {
    let d = "";
    r.linha.forEach((p,i) => { d += (i?"L":"M") + x(p.mes).toFixed(1) + " " + y(p.valor).toFixed(1) + " "; });
    out += `<path class="serie" d="${d}" stroke="${r.ativo.cor}"/>`;
  });

  // camada de interação
  out += `<g id="cursor" style="opacity:0"><line class="eixo" stroke="${"rgba(255,255,255,.35)"}" x1="0" y1="${MT}" x2="0" y2="${H-MB}"/></g>`;
  out += `<rect id="captura" x="${ML}" y="${MT}" width="${W-ML-MR}" height="${H-MT-MB}" fill="transparent" style="cursor:crosshair"/>`;

  svg.innerHTML = out;
  ligarCursor(svg, vis, x, y, N);
}

function ligarCursor(svg, vis, x, y, N){
  const captura = svg.querySelector("#captura");
  const cursor  = svg.querySelector("#cursor");
  const dica    = document.getElementById("dica");
  const moldura = document.getElementById("moldura-linha");
  if (!captura) return;

  function mover(ev){
    const cx = svg.getBoundingClientRect();
    const escala = cx.width / W;
    const svgX = (ev.clientX - cx.left) / escala;
    let mes = Math.round(((svgX - ML) / (W - ML - MR)) * N);
    mes = Math.max(0, Math.min(N, mes));

    const px = x(mes);
    cursor.style.opacity = 1;
    const linha = cursor.querySelector("line");
    linha.setAttribute("x1", px); linha.setAttribute("x2", px);

    const itens = vis
      .map(r => ({ r, p: r.linha[mes] }))
      .sort((a,b) => b.p.valor - a.p.valor)
      .map(({r,p}) => `<li><span class="nome"><i class="ponto" style="background:${r.ativo.cor}"></i>${r.ativo.nome}</span><b class="num">${fmtBRL0.format(p.valor)}</b></li>`)
      .join("");

    const anos = Math.floor(mes/12), ms = mes%12;
    const quando = mes === 0 ? "hoje" : [anos?anos+(anos>1?" anos":" ano"):"", ms?ms+(ms>1?" meses":" mês"):""].filter(Boolean).join(" e ");

    dica.innerHTML = `<h4>${quando}</h4><ul>${itens}
      <li style="border-top:1px solid var(--linha);margin-top:6px;padding-top:6px"><span class="nome" style="color:var(--papel-suave)">depositado</span><b class="num" style="color:var(--papel-suave)">${fmtBRL0.format(vis[0]?vis[0].linha[mes].investido:0)}</b></li></ul>`;
    dica.style.opacity = 1;

    const pxTela = px * escala;
    const larg = dica.offsetWidth;
    let esq = pxTela + 18;
    if (esq + larg > moldura.clientWidth - 8) esq = pxTela - larg - 18;
    dica.style.left = Math.max(8, esq) + "px";
    dica.style.top  = "24px";
  }

  captura.addEventListener("mousemove", mover);
  captura.addEventListener("touchmove", e => { if(e.touches[0]) mover(e.touches[0]); }, {passive:true});
  captura.addEventListener("mouseleave", () => { dica.style.opacity = 0; cursor.style.opacity = 0; });
}

/* =========================================================
   5. Barras-cédula
   ========================================================= */
function desenharCedulas(resultados){
  const alvo = document.getElementById("cedulas");
  const vis = resultados.filter(r => visivel[r.ativo.id]).sort((a,b) => b.liquido - a.liquido);
  const max = Math.max(...vis.map(r => r.liquido), 1);

  alvo.innerHTML = vis.map(r => {
    const larg = Math.max(8, (r.liquido / max) * 100);
    const propAporte = Math.max(0, Math.min(100, (r.investidoAjustado / r.liquido) * 100));
    return `
      <div class="cedula">
        <div class="id">
          <b>${r.ativo.nome}</b>
          <small>${fmtNum.format(r.taxa)}% a.a.</small>
        </div>
        <div class="trilho">
          <div class="barra" style="--c:${r.ativo.cor};width:${larg.toFixed(2)}%">
            <div class="aportado" style="width:${propAporte.toFixed(2)}%"></div>
            <span class="cifra">${fmtBRL0.format(r.liquido)}</span>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* =========================================================
   6. Tabela e destaques
   ========================================================= */
function desenharTabela(resultados){
  const tb = document.getElementById("tbody");
  const vis = resultados.filter(r => visivel[r.ativo.id]).sort((a,b) => b.liquido - a.liquido);

  tb.innerHTML = vis.map(r => `
    <tr>
      <td class="ativo"><i class="ponto" style="background:${r.ativo.cor}"></i>${r.ativo.nome}</td>
      <td><span class="tag r${r.ativo.risco}">${ROTULO_RISCO[r.ativo.risco]}</span></td>
      <td class="num">${fmtNum.format(r.taxa)}%</td>
      <td class="num">${fmtBRL.format(r.bruto)}</td>
      <td class="num">${r.imposto > 0 ? "−" + fmtBRL.format(r.imposto) : "isento"}</td>
      <td class="num"><b>${fmtBRL.format(r.liquido)}</b></td>
      <td class="num ${r.ganho >= 0 ? "up" : "down"}">${r.ganho >= 0 ? "+" : "−"}${fmtBRL.format(Math.abs(r.ganho))}</td>
      <td class="num">${(r.liquido / Math.max(r.investidoAjustado,1)).toFixed(2)}×</td>
    </tr>`).join("");
}

function desenharDestaques(resultados){
  const vis = resultados.filter(r => visivel[r.ativo.id]);
  if (!vis.length) return;
  const melhor = vis.reduce((a,b) => b.liquido > a.liquido ? b : a);
  const poup = resultados.find(r => r.ativo.id === "poupanca");
  const inv = melhor.investidoAjustado;

  document.getElementById("d-melhor").textContent = fmtBRL0.format(melhor.liquido);
  document.getElementById("d-melhor").style.color = melhor.ativo.cor;
  document.getElementById("d-melhor-nota").textContent =
    `${melhor.ativo.nome} · risco ${ROTULO_RISCO[melhor.ativo.risco].toLowerCase()}`;

  document.getElementById("d-investido").textContent = fmtBRL0.format(inv);
  document.getElementById("d-investido-nota").textContent =
    `${estado.anos * 12} aportes de ${fmtBRL0.format(estado.aporte)}` + (estado.infl ? " (corrigidos)" : "");

  const delta = melhor.liquido - poup.liquido;
  const el = document.getElementById("d-delta");
  el.textContent = (delta >= 0 ? "+" : "−") + fmtBRL0.format(Math.abs(delta));
  el.className = "val num " + (delta >= 0 ? "up" : "down");
}

/* =========================================================
   7. Chips e painel de taxas
   ========================================================= */
function montarChips(){
  const alvo = document.getElementById("chips");
  alvo.innerHTML = ativos.map(a => `
    <button type="button" class="chip" data-id="${a.id}" style="--c:${a.cor}" aria-pressed="${visivel[a.id]}">
      <i class="ponto"></i>${a.nome}
    </button>`).join("");
  alvo.querySelectorAll(".chip").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      const ligados = Object.values(visivel).filter(Boolean).length;
      if (visivel[id] && ligados <= 1) return;
      visivel[id] = !visivel[id];
      b.setAttribute("aria-pressed", visivel[id]);
      atualizar();
    });
  });
}

function montarTaxas(){
  const grade = document.getElementById("grade-taxas");
  grade.querySelectorAll(".gerado").forEach(n => n.remove());

  ativos.forEach(a => {
    const rotuloIR = a.ir === "isento" ? "isento"
      : a.ir === "regressivo" ? "regressivo 22,5% → 15%"
      : "fixo " + fmtNum.format(parseFloat(a.ir.split(":")[1])) + "%";

    const nome = document.createElement("div");
    nome.className = "nomeat gerado";
    nome.innerHTML = `<i class="ponto" style="background:${a.cor}"></i><span>${a.nome}</span>`;
    grade.appendChild(nome);

    ["pess","base","otim"].forEach(k => {
      const wrap = document.createElement("div");
      wrap.className = "gerado";
      const inp = document.createElement("input");
      inp.type = "number"; inp.step = "0.1"; inp.value = a.taxas[k];
      inp.setAttribute("aria-label", `${a.nome} — cenário ${k}`);
      inp.addEventListener("input", () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) { a.taxas[k] = v; atualizar(); }
      });
      wrap.appendChild(inp);
      grade.appendChild(wrap);
    });

    const obs = document.createElement("div");
    obs.className = "imposto gerado";
    obs.innerHTML = `<b style="color:var(--papel)">${rotuloIR}</b><br>${a.obs}`;
    grade.appendChild(obs);
  });
}

/* =========================================================
   8. Entradas
   ========================================================= */
function mascarar(input, chave){
  function aplicar(){
    const digitos = input.value.replace(/\D/g, "").slice(0, 12);
    const valor = digitos ? parseInt(digitos, 10) / 100 : 0;
    estado[chave] = valor;
    input.value = fmtNum.format(valor);
  }
  input.addEventListener("input", () => { aplicar(); atualizar(); });
  input.addEventListener("blur", aplicar);
  aplicar();
}

function ligarControles(){
  mascarar(document.getElementById("aporte"), "aporte");
  mascarar(document.getElementById("inicial"), "inicial");

  const anos = document.getElementById("anos");
  anos.addEventListener("input", () => {
    estado.anos = parseInt(anos.value, 10);
    document.getElementById("anos-txt").textContent = estado.anos;
    document.getElementById("anos-rot").textContent =
      (estado.anos > 1 ? "anos" : "ano") + " · " + estado.anos * 12 + " aportes";
    atualizar();
  });

  document.querySelectorAll("[data-cen]").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-cen]").forEach(o => o.removeAttribute("aria-pressed"));
      b.setAttribute("aria-pressed", "true");
      estado.cenario = b.dataset.cen;
      atualizar();
    });
  });

  document.getElementById("opt-ir").addEventListener("change", e => { estado.ir = e.target.checked; atualizar(); });
  document.getElementById("opt-infl").addEventListener("change", e => { estado.infl = e.target.checked; atualizar(); });
  document.getElementById("inflacao").addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { estado.inflacao = v; atualizar(); }
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    ativos = clonar(PADRAO);
    montarTaxas();
    atualizar();
  });

  document.getElementById("btn-csv").addEventListener("click", baixarCSV);
}

function baixarCSV(){
  const rs = calcularTudo().filter(r => visivel[r.ativo.id]);
  const cab = ["Aplicacao","Risco","Taxa a.a. (%)","Total investido","Valor bruto","IR estimado","Valor liquido","Rendimento"];
  const linhas = rs.map(r => [
    r.ativo.nome, ROTULO_RISCO[r.ativo.risco], fmtNum.format(r.taxa),
    fmtNum.format(r.investidoAjustado), fmtNum.format(r.bruto),
    fmtNum.format(r.imposto), fmtNum.format(r.liquido), fmtNum.format(r.ganho)
  ]);
  const cfg = [
    [], ["Aporte mensal", fmtNum.format(estado.aporte)],
    ["Valor inicial", fmtNum.format(estado.inicial)],
    ["Prazo (anos)", estado.anos], ["Cenario", estado.cenario],
    ["Descontando IR", estado.ir ? "sim" : "nao"],
    ["Corrigido pela inflacao", estado.infl ? "sim (" + fmtNum.format(estado.inflacao) + "% a.a.)" : "nao"]
  ];
  const csv = [cab, ...linhas, ...cfg].map(l => l.map(c => `"${c}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8"}));
  const a = document.createElement("a");
  a.href = url; a.download = `simulacao-${estado.anos}anos.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   9. Ciclo de atualização
   ========================================================= */
function atualizar(){
  const rs = calcularTudo();
  desenharDestaques(rs);
  desenharLinha(rs);
  desenharCedulas(rs);
  desenharTabela(rs);
}

montarChips();
montarTaxas();
ligarControles();
atualizar();
window.addEventListener("resize", () => desenharLinha(calcularTudo()));
