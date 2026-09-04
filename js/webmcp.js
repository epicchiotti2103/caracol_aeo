/*!
 * WebMCP — Caracol AEO
 * Expõe a auditoria AEO instantânea como tool para agentes que rodam dentro do
 * navegador (ChatGPT desktop, Chrome com a flag #enable-webmcp-testing).
 * Spec: https://github.com/webmachinelearning/webmcp
 *
 * Feature detection obrigatória: em navegador sem suporte o script não faz nada
 * e não escreve nada no console.
 */
(function () {
  "use strict";

  var API_URL = "https://aeobr-audit-api.vercel.app/api/audit";

  // A API vive em document.modelContext (atual). navigator.modelContext era a
  // localização anterior da spec — aceitamos as duas.
  var ctx = null;
  try {
    ctx = (typeof document !== "undefined" && document.modelContext) ||
          (typeof navigator !== "undefined" && navigator.modelContext) ||
          null;
  } catch (e) {
    return;
  }
  if (!ctx || typeof ctx.registerTool !== "function") return;

  // Rótulos amigáveis para as 4 dimensões devolvidas pela API.
  var CATEGORIAS = {
    schema_org: "Dados Estruturados",
    conteudo_estrutura: "Conteúdo",
    tecnico_crawlability: "Técnico",
    meta_tags: "Meta Tags"
  };

  function urlValida(valor) {
    if (typeof valor !== "string" || !valor.trim()) return false;
    try {
      var p = new URL(valor.trim()).protocol;
      return p === "http:" || p === "https:";
    } catch (e) {
      return false;
    }
  }

  // Reduz a resposta da API ao essencial: nada de tipos_detectados, ai_bots_status
  // ou powered_by — o agente só precisa dos números e das ações.
  function compactar(d) {
    var out = {
      url: d.url,
      score: d.score,
      max_score: d.max_score || 100,
      rating: d.rating,
      categorias: {},
      oportunidades: []
    };

    var dims = d.dimensoes || {};
    for (var chave in CATEGORIAS) {
      if (!Object.prototype.hasOwnProperty.call(dims, chave)) continue;
      var dim = dims[chave] || {};
      out.categorias[CATEGORIAS[chave]] = { score: dim.score, max: dim.max };
    }

    // A API traz recomendacoes_priorizadas no topo; se vier vazia, junta as das
    // dimensões como fallback.
    var recs = d.recomendacoes_priorizadas;
    if (!recs || !recs.length) {
      recs = [];
      for (var k in dims) {
        if (!Object.prototype.hasOwnProperty.call(dims, k)) continue;
        var lista = (dims[k] || {}).recommendations || [];
        for (var i = 0; i < lista.length; i++) recs.push(lista[i]);
      }
    }
    for (var j = 0; j < recs.length; j++) {
      var r = recs[j] || {};
      if (!r.acao) continue;
      out.oportunidades.push({ prioridade: r.prioridade, acao: r.acao });
    }

    out.fonte = "https://www.aeobr.com.br/auditoria";
    return out;
  }

  function texto(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj) }] };
  }

  function erro(msg) {
    return { content: [{ type: "text", text: msg }], isError: true };
  }

  var tool = {
    name: "audit_site",
    description: "Roda a auditoria AEO instantânea da Caracol em um site: retorna score geral 0-100, score por categoria (Dados Estruturados, Conteúdo, Técnico, Meta Tags) e principais oportunidades.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL completa do site, com https://"
        }
      },
      required: ["url"]
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: function (args) {
      var url = args && args.url;
      if (!urlValida(url)) {
        return Promise.resolve(erro(
          "URL inválida. Informe o endereço completo do site, começando com https:// (ex.: https://suaempresa.com.br)."
        ));
      }
      return fetch(API_URL + "?url=" + encodeURIComponent(url.trim()))
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (r) {
          if (!r.ok) {
            return erro("A auditoria falhou (HTTP " + r.status + "). Confira a URL e tente de novo.");
          }
          if (r.data && r.data.error) {
            return erro("Não consegui auditar essa URL: " + r.data.error);
          }
          return texto(compactar(r.data));
        })
        .catch(function () {
          return erro("Não consegui auditar essa URL agora. Confira o endereço e tente de novo.");
        });
    }
  };

  function registrar(t) {
    try {
      var ret = ctx.registerTool(t);
      if (ret && typeof ret.catch === "function") {
        ret.catch(function (e) {
          console.debug("[webmcp] registerTool falhou:", t.name, e);
        });
      }
    } catch (e) {
      console.debug("[webmcp] registerTool falhou:", t.name, e);
    }
  }

  registrar(tool);

  // --- Tool do formulário de diagnóstico gratuito -------------------------
  //
  // O <form> da home já se declara como tool via toolname/tooldescription,
  // mas o navegador do ChatGPT ignora a API declarativa ("Tools defined
  // through HTML form attributes aren't available as site tools"). Aqui vai
  // um equivalente imperativo — registrado SÓ quando a versão declarativa não
  // apareceu, pra não colidir de nome no Chrome/Edge.
  //
  // Preenche e para: quem envia é a pessoa, não o agente.

  var NOME_TOOL_FORM = "request_free_aeo_audit";

  function preencher(el, valor) {
    el.value = valor;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  var toolForm = {
    name: NOME_TOOL_FORM,
    description: "Preenche o formulário de diagnóstico AEO gratuito da Caracol nesta página com nome, e-mail corporativo e site da empresa. NÃO envia: depois de preencher, a própria pessoa precisa clicar em 'Gerar Diagnóstico Gratuito' para confirmar. O relatório chega por e-mail em até 24h.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo de quem está pedindo o diagnóstico" },
        email: { type: "string", description: "E-mail corporativo para receber o relatório" },
        site: { type: "string", description: "URL do site da empresa a ser auditado, com https://" }
      },
      required: ["nome", "email", "site"]
    },
    annotations: { readOnlyHint: false },
    execute: function (args) {
      var form = document.getElementById("auditForm");
      if (!form) {
        return erro("O formulário de diagnóstico gratuito não está nesta página. Abra https://www.aeobr.com.br/ e tente de novo.");
      }
      var a = args || {};
      var nome = typeof a.nome === "string" ? a.nome.trim() : "";
      var email = typeof a.email === "string" ? a.email.trim() : "";
      var site = typeof a.site === "string" ? a.site.trim() : "";

      if (!nome) return erro("Informe o nome de quem está solicitando o diagnóstico.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro("E-mail inválido. Use um e-mail corporativo, como nome@empresa.com.br.");
      if (!urlValida(site)) return erro("Site inválido. Informe a URL completa da empresa, começando com https://.");

      var campos = [["nm", nome], ["em", email], ["ws", site]];
      for (var i = 0; i < campos.length; i++) {
        var el = document.getElementById(campos[i][0]);
        if (!el) return erro("Não encontrei o campo '" + campos[i][0] + "' no formulário desta página.");
        preencher(el, campos[i][1]);
      }

      try {
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        var botao = form.querySelector(".fsub");
        if (botao) botao.focus({ preventScroll: true });
      } catch (e) { /* rolagem é cosmética */ }

      return texto({
        status: "preenchido_aguardando_confirmacao",
        nome: nome,
        email: email,
        site: site,
        enviado: false,
        proximo_passo: "O formulário foi preenchido na página, mas NÃO enviado. Peça para a pessoa conferir os dados e clicar em 'Gerar Diagnóstico Gratuito' para confirmar o envio."
      });
    }
  };

  // Só registra a versão imperativa se a declarativa não estiver valendo.
  // O Chrome AGENDA o registro declarativo (não é síncrono na análise do
  // HTML), então a checagem espera a página carregar antes de perguntar.
  function decidirToolForm() {
    if (!document.getElementById("auditForm")) return;
    if (typeof ctx.getTools !== "function") { registrar(toolForm); return; }
    Promise.resolve(ctx.getTools()).then(function (tools) {
      var jaTem = (tools || []).some(function (t) { return t && t.name === NOME_TOOL_FORM; });
      if (!jaTem) registrar(toolForm);
    }, function () {
      registrar(toolForm);
    });
  }

  function agendarDecisao() { setTimeout(decidirToolForm, 500); }

  if (document.readyState === "complete") agendarDecisao();
  else window.addEventListener("load", agendarDecisao, { once: true });
})();
