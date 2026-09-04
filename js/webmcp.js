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

  try {
    var ret = ctx.registerTool(tool);
    if (ret && typeof ret.catch === "function") {
      ret.catch(function (e) {
        console.debug("[webmcp] registerTool falhou:", e);
      });
    }
  } catch (e) {
    console.debug("[webmcp] registerTool falhou:", e);
  }
})();
