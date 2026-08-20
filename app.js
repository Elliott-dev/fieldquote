/**
 * FieldQuote — local, deterministic quote engine.
 * No network. No API keys. Works offline.
 */
(function (root) {
  "use strict";

  var TRADES = {
    hvac: "HVAC",
    plumbing: "Plumbing",
    electrical: "Electrical",
    garage: "Garage door",
    general: "General"
  };

  var EXAMPLES = [
    {
      id: "wh",
      label: "Water heater · Corona",
      trade: "plumbing",
      city: "Corona, CA",
      customer: "Maria Santos",
      shop: "Corona Plumbing Co.",
      phone: "(951) 555-0140",
      notes: "Water heater leaking from the bottom, 40 gal gas, in the garage. Corona. Wants it this weekend if possible. Old unit is 12 years."
    },
    {
      id: "ac",
      label: "AC not cooling · Riverside",
      trade: "hvac",
      city: "Riverside, CA",
      customer: "James Nguyen",
      shop: "Valley Air & Heat",
      phone: "(951) 555-0188",
      notes: "AC not blowing cold, 4-ton split system, outside unit running. Possible capacitor. Riverside. House is hot, can you come today?"
    },
    {
      id: "gd",
      label: "Opener dead · Eastvale",
      trade: "garage",
      city: "Eastvale, CA",
      customer: "Derek Cole",
      shop: "Eastvale Door Works",
      phone: "(951) 555-0162",
      notes: "Garage door opener is dead, Chamberlain chain drive, Eastvale. Door is heavy, springs look tired too. Need it working for the work truck."
    },
    {
      id: "el",
      label: "Kitchen GFCIs · Norco",
      trade: "electrical",
      city: "Norco, CA",
      customer: "Priya Shah",
      shop: "Norco Electric",
      phone: "(951) 555-0119",
      notes: "Kitchen remodel: add 4 GFCI outlets, check 100A panel capacity, Norco. Permit if the city requires it. No open walls except backsplash."
    }
  ];

  function money(n) {
    var v = Math.round(n);
    return "$" + v.toLocaleString("en-US");
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function todayParts(d) {
    d = d || new Date();
    return {
      y: d.getFullYear(),
      m: pad(d.getMonth() + 1),
      day: pad(d.getDate()),
      pretty: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    };
  }

  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).toUpperCase().slice(0, 4);
  }

  function quoteNumber(input) {
    var t = todayParts();
    return "FQ-" + t.y + t.m + t.day + "-" + hashStr(
      [input.shop, input.trade, input.notes, input.customer, input.rate, input.markup].join("|")
    );
  }

  function validUntil(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function numFrom(text, re, fallback) {
    var m = text.match(re);
    return m ? parseFloat(m[1]) : fallback;
  }

  function flagsFrom(notes) {
    var t = (notes || "").toLowerCase();
    return {
      text: t,
      emergency: /emergency|asap|urgent|come today|today\b|right away|now\b/.test(t),
      weekend: /weekend|saturday|sunday|after.?hours/.test(t),
      leak: /leak/.test(t),
      install: /install|new |replace|replacement|swap/.test(t),
      repair: /repair|fix|not working|dead|broken|not blowing|not cooling/.test(t),
      gallons: numFrom(t, /(\d+)\s*(?:gal|gallon)/, null),
      tons: numFrom(t, /(\d+(?:\.\d+)?)\s*-?\s*ton/, null),
      amps: numFrom(t, /(\d+)\s*a(?:mp)?\b/, null),
      gfciQty: numFrom(t, /(\d+)\s*(?:gfci|outlet)/, null),
      tankless: /tankless/.test(t),
      gas: /\bgas\b/.test(t),
      electricWh: /electric/.test(t) && /water|heater/.test(t),
      haul: /haul|take.?away|dispose|disposal of old/.test(t),
      springs: /spring/.test(t),
      opener: /opener|chamberlain|liftmaster|genie/.test(t),
      panel: /panel|service upgrade|200a|100a/.test(t),
      waterHeater: /water\s*heater|hot\s*water\s*tank|tankless/.test(t),
      ac: /\bac\b|air\s*cond|not\s*cool|not\s*blowing|capacitor|freon|refrigerant|condenser|evaporator|mini\s*split|heat\s*pump|furnace/.test(t),
      toilet: /toilet|commode/.test(t),
      faucet: /faucet|tap|shower valve|garbage disposal|disposal/.test(t),
      outlet: /outlet|gfci|receptacle|plug/.test(t),
      garage: /garage\s*door|opener|torsion|track/.test(t)
    };
  }

  function item(desc, qty, unit, unitCost, kind) {
    qty = qty;
    unitCost = Math.round(unitCost);
    return {
      desc: desc,
      qty: qty,
      unit: unit,
      unitCost: unitCost,
      ext: Math.round(qty * unitCost),
      kind: kind || "other"
    };
  }

  function labor(desc, hours, rate) {
    return item(desc, hours, "hr", rate, "labor");
  }

  function mat(desc, qty, unit, cost) {
    return item(desc, qty, unit, cost, "material");
  }

  function buildItems(input, f) {
    var rate = input.rate;
    var items = [];
    var trade = input.trade;

    if (f.waterHeater || (trade === "plumbing" && (f.leak || /heater/.test(f.text)))) {
      var gal = f.gallons || 40;
      var hours = f.tankless ? 5 : gal >= 75 ? 4.5 : 3.5;
      var unitCost = f.tankless ? 2200 : f.electricWh ? 620 : gal >= 75 ? 1420 : gal >= 50 ? 1040 : 890;
      var unitName = f.tankless
        ? "Tankless gas water heater (SoCal supply est.)"
        : (gal + "-gal " + (f.electricWh ? "electric" : "gas") + " water heater (SoCal supply est.)");
      items.push(labor("Site visit — leak check and shutoff", 1, rate));
      items.push(labor("Remove old unit, set and start new water heater", hours, rate));
      items.push(mat(unitName, 1, "ea", unitCost));
      items.push(mat("Code kit — valves, flex, T&P, drip pan, fittings", 1, "lot", 145));
      if (f.haul) items.push(mat("Haul-away of old water heater", 1, "ea", 95));
    } else if (f.toilet && trade !== "electrical" && trade !== "hvac" && trade !== "garage") {
      items.push(labor("Remove existing toilet and reset new", 2, rate));
      items.push(mat("Standard elongated toilet (est.)", 1, "ea", 240));
      items.push(mat("Wax ring, supply line, flange hardware", 1, "lot", 42));
    } else if (f.faucet && trade === "plumbing") {
      items.push(labor("Diagnose and replace fixture / disposal", 1.5, rate));
      items.push(mat("Fixture or disposal allowance (est.)", 1, "ea", 220));
      items.push(mat("Supply stops, connectors, putty", 1, "lot", 38));
    } else if (trade === "plumbing") {
      items.push(labor("Diagnostic / leak trace", 1, rate));
      items.push(labor("Repair labor allowance", 2.5, rate));
      items.push(mat("Parts and fittings allowance (est.)", 1, "lot", 160));
    }

    if (f.ac || trade === "hvac") {
      if (!items.length || f.ac) {
        if (/replace|new system|change.?out/.test(f.text)) {
          var tons = f.tons || 3;
          items = [];
          items.push(labor("Load check, disconnect, and recover old system", 3, rate));
          items.push(labor("Set condenser/air handler, braze, vacuum, start", 8, rate));
          items.push(mat(tons + "-ton split system equipment package (est.)", 1, "ea", Math.round(1600 * tons)));
          items.push(mat("Line-set, pad, whip, disconnect, condensate (est.)", 1, "lot", 420));
        } else {
          items.push(labor("HVAC diagnostic — temps, electrical, airflow", 1, rate));
          if (/capacitor|possible capacitor/.test(f.text)) {
            items.push(labor("Replace dual/run capacitor and retest", 0.75, rate));
            items.push(mat("Run / dual capacitor (est.)", 1, "ea", 95));
          } else if (/contactor/.test(f.text)) {
            items.push(labor("Replace contactor and retest", 0.75, rate));
            items.push(mat("Contactor (est.)", 1, "ea", 72));
          } else if (/motor|fan/.test(f.text)) {
            items.push(labor("Replace condenser fan motor", 1.5, rate));
            items.push(mat("Condenser fan motor (est.)", 1, "ea", 260));
          } else {
            items.push(labor("Repair labor allowance after diagnosis", 1.5, rate));
            items.push(mat("Common electrical / airflow parts allowance", 1, "lot", 120));
          }
          items.push(mat("System test — amp draw, temp split, safety check", 1, "ea", 40));
        }
      }
    }

    if (f.outlet || (trade === "electrical" && !f.panel && items.length === 0) || (trade === "electrical" && f.outlet)) {
      var qty = f.gfciQty || (/4/.test(f.text) ? 4 : 2);
      if (f.outlet || trade === "electrical") {
        items.push(labor("Circuit check and kitchen layout", 0.75, rate));
        items.push(labor("Install GFCI devices and make-up", qty * 0.45, rate));
        items.push(mat("WR GFCI receptacle (est.)", qty, "ea", 28));
        items.push(mat("Wire, boxes, covers, connectors", 1, "lot", 55));
      }
    }

    if (f.panel || (trade === "electrical" && /panel|100a|200a/.test(f.text))) {
      var amps = f.amps || (/200/.test(f.text) ? 200 : 100);
      items.push(labor("Panel / load assessment", 1, rate));
      if (/upgrade|200|replace panel/.test(f.text)) {
        items.push(labor("Panel replacement / upgrade labor", 7, rate));
        items.push(mat((amps >= 200 ? 200 : amps) + "A panel, breakers, lugs (est.)", 1, "ea", 890));
        items.push(mat("Grounding and bonding materials", 1, "lot", 120));
      } else {
        items.push(labor("Panel inspection, labeling, torque check", 1, rate));
        items.push(mat("Labels, filler plates, minor hardware", 1, "lot", 35));
      }
    }

    if (f.garage || trade === "garage") {
      if (f.opener || /opener|dead/.test(f.text) || trade === "garage") {
        items.push(labor("Remove failed opener, hang and program new unit", 2.25, rate));
        items.push(mat("Belt/chain garage-door opener (est.)", 1, "ea", 340));
        items.push(mat("Sensors, rail hardware, fasteners", 1, "lot", 45));
      }
      if (f.springs || /tired|heavy/.test(f.text)) {
        items.push(labor("Replace torsion springs (safety-rated)", 2, rate));
        items.push(mat("Torsion spring pair, matched (est.)", 1, "pr", 220));
      }
    }

    if (trade === "general" && items.length === 0) {
      items.push(labor("On-site diagnostic and scope", 1, rate));
      items.push(labor("Repair / install labor allowance", 3, rate));
      items.push(mat("Materials allowance (est.)", 1, "lot", 180));
      items.push(mat("Consumables — fasteners, patch, cleaners", 1, "lot", 25));
    }

    if (items.length === 0) {
      items.push(labor("Site visit and written scope", 1, rate));
      items.push(labor("Trade labor allowance", 2.5, rate));
      items.push(mat("Materials allowance (est.)", 1, "lot", 150));
    }

    if (f.weekend || f.emergency) {
      var fee = f.weekend && f.emergency ? 225 : f.weekend ? 185 : 175;
      var label = f.weekend && f.emergency
        ? "Same-day / weekend dispatch"
        : f.weekend
          ? "Weekend / after-hours dispatch"
          : "Same-day / emergency dispatch";
      items.push(item(label, 1, "ea", fee, "surcharge"));
    }

    // Cap at 6: keep first materials/labor, drop extras from the end except surcharge
    if (items.length > 6) {
      var surcharge = items.filter(function (x) { return x.kind === "surcharge"; });
      var core = items.filter(function (x) { return x.kind !== "surcharge"; }).slice(0, 6 - surcharge.length);
      items = core.concat(surcharge);
    }

    return items;
  }

  function exclusions(input, f) {
    var list = [
      "City / county permits and inspection fees",
      "Unforeseen conditions found after opening the work",
      "Work not listed on this estimate"
    ];
    if (f.waterHeater || input.trade === "plumbing") {
      if (!f.haul) list.push("Haul-away of the old unit (unless listed)");
      list.push("Drywall, paint, or garage finish repair");
      list.push("Expansion tank, seismic strap, or vent upgrades if required on site");
    }
    if (f.ac || input.trade === "hvac") {
      list.push("Refrigerant recovery beyond a standard service charge");
      list.push("Duct repair, condensate drain rebuild, or permit for a change-out (unless listed)");
    }
    if (input.trade === "electrical" || f.outlet || f.panel) {
      list.push("Panel upgrade if load calculation fails");
      list.push("Fishing walls that are closed, or finish carpentry / tile");
    }
    if (input.trade === "garage" || f.garage) {
      list.push("Track, cable, or panel replacement beyond springs/opener listed");
      list.push("Drywall damage around the opener header");
    }
    if (input.trade === "general") {
      list.push("Specialty parts beyond the materials allowance");
    }
    return list.slice(0, 6);
  }

  function summaryLine(input, f) {
    var bits = [];
    if (f.waterHeater) bits.push((f.tankless ? "tankless" : (f.gallons || 40) + "-gal") + " water heater " + (f.leak ? "leak / replace" : "work"));
    if (f.ac) bits.push(f.tons ? f.tons + "-ton AC service" : "AC / heating service");
    if (f.toilet) bits.push("toilet replace");
    if (f.outlet) bits.push("GFCI / outlet work");
    if (f.panel) bits.push("panel check" + (f.amps ? " (" + f.amps + "A)" : ""));
    if (f.opener || (input.trade === "garage")) bits.push("garage door opener");
    if (f.springs) bits.push("torsion springs");
    if (!bits.length) bits.push((TRADES[input.trade] || "Trade") + " job from notes");
    if (f.weekend) bits.push("weekend request");
    if (f.emergency) bits.push("same-day request");
    return bits.join(" · ");
  }

  function generate(input) {
    var notes = (input.notes || "").trim();
    if (!notes) {
      return { error: "Paste the job notes first — the messy text from the customer or your voicemail." };
    }
    var rate = Number(input.rate);
    var markup = Number(input.markup);
    if (!(rate > 0)) rate = 125;
    if (!(markup >= 0)) markup = 25;
    input = {
      shop: (input.shop || "").trim() || "SHOP NAME",
      phone: (input.phone || "").trim(),
      city: (input.city || "").trim() || "Corona, CA",
      trade: input.trade || "general",
      customer: (input.customer || "").trim(),
      notes: notes,
      rate: rate,
      markup: markup
    };
    var f = flagsFrom(notes);
    var items = buildItems(input, f);
    var laborTotal = 0;
    var matTotal = 0;
    var otherTotal = 0;
    items.forEach(function (it) {
      if (it.kind === "labor") laborTotal += it.ext;
      else if (it.kind === "material") matTotal += it.ext;
      else otherTotal += it.ext;
    });
    var markupAmt = Math.round(matTotal * (markup / 100));
    var total = laborTotal + matTotal + markupAmt + otherTotal;
    var low = Math.round(total * 0.85);
    var high = Math.round(total * 1.15);
    var t = todayParts();
    return {
      shop: input.shop,
      phone: input.phone,
      city: input.city,
      trade: TRADES[input.trade] || input.trade,
      customer: input.customer || "Walk-in / phone lead",
      notes: notes,
      summary: summaryLine(input, f),
      items: items,
      laborTotal: laborTotal,
      matTotal: matTotal,
      markup: markup,
      markupAmt: markupAmt,
      otherTotal: otherTotal,
      total: total,
      low: low,
      high: high,
      quoteNo: quoteNumber(input),
      date: t.pretty,
      valid: validUntil(14),
      exclusions: exclusions(input, f),
      rate: rate
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderQuote(q) {
    var rows = q.items.map(function (it) {
      var tag = it.kind === "material" ? '<span class="est-tag">ESTIMATE</span>' : "";
      return (
        "<tr>" +
        "<td>" + escapeHtml(it.desc) + tag + "</td>" +
        "<td class='c'>" + it.qty + "</td>" +
        "<td class='c'>" + escapeHtml(it.unit) + "</td>" +
        "<td class='r'>" + money(it.unitCost) + "</td>" +
        "<td class='r'>" + money(it.ext) + "</td>" +
        "</tr>"
      );
    }).join("");
    var excl = q.exclusions.map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("");
    return (
      '<article class="ticket" id="ticket">' +
        '<div class="ticket-bar"></div>' +
        '<div class="ticket-body">' +
          '<div class="stamp">ESTIMATE</div>' +
          '<div class="quote-head">' +
            "<div>" +
              '<p class="shop-name">' + escapeHtml(q.shop) + "</p>" +
              '<p class="shop-meta">' + escapeHtml([q.phone, q.city].filter(Boolean).join(" · ")) + "</p>" +
              '<p class="shop-meta">' + escapeHtml(q.trade) + "</p>" +
            "</div>" +
            "<div>" +
              '<div class="qid">' + escapeHtml(q.quoteNo) + "</div>" +
              '<div class="quote-meta">' + escapeHtml(q.date) + "</div>" +
              '<div class="quote-meta">Valid through ' + escapeHtml(q.valid) + "</div>" +
            "</div>" +
          "</div>" +
          "<p><strong>Prepared for:</strong> " + escapeHtml(q.customer) + "<br>" +
          "<strong>Job:</strong> " + escapeHtml(q.summary) + "</p>" +
          '<h4 class="block-title">Line items</h4>' +
          '<table class="lines">' +
            "<thead><tr><th>Description</th><th class='c'>Qty</th><th class='c'>Unit</th><th class='r'>Each</th><th class='r'>Total</th></tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
          "</table>" +
          '<div class="totals">' +
            "<div><span>Labor</span><span>" + money(q.laborTotal) + "</span></div>" +
            "<div><span>Materials (est. contractor cost)</span><span>" + money(q.matTotal) + "</span></div>" +
            "<div><span>Material markup (" + q.markup + "%)</span><span>" + money(q.markupAmt) + "</span></div>" +
            (q.otherTotal ? "<div><span>Dispatch / other</span><span>" + money(q.otherTotal) + "</span></div>" : "") +
            '<div class="grand"><span>Estimated total</span><span>' + money(q.total) + "</span></div>" +
          "</div>" +
          '<div class="range">Quoted range (±15%): ' + money(q.low) + " – " + money(q.high) + "</div>" +
          '<h4 class="block-title">Notes from the inbound job</h4>' +
          '<p class="tiny">' + escapeHtml(q.notes) + "</p>" +
          '<div class="notes">' +
            '<h4 class="block-title">Exclusions</h4>' +
            "<ul>" + excl + "</ul>" +
            '<h4 class="block-title">Terms</h4>' +
            "<ul>" +
              "<li>Estimate valid 14 days from the date above.</li>" +
              "<li>50% deposit to schedule. Remainder due on completion.</li>" +
              "<li>SoCal ballpark only. Final price is set after a site look and your review.</li>" +
              "<li>Contractor confirms licenses, permits, and warranty before this goes to the customer.</li>" +
            "</ul>" +
          "</div>" +
          '<div class="sign">' +
            '<div class="line">Contractor signature</div>' +
            '<div class="line">Date</div>' +
          "</div>" +
          '<p class="tiny" style="margin-top:16px">Drafted by FieldQuote. Not a licensed contractor. Review before sending.</p>' +
        "</div>" +
      "</article>"
    );
  }

  function quoteToText(q) {
    var lines = [];
    lines.push(q.shop);
    lines.push([q.phone, q.city].filter(Boolean).join(" · "));
    lines.push("ESTIMATE  " + q.quoteNo + "  " + q.date);
    lines.push("Valid through " + q.valid);
    lines.push("");
    lines.push("Prepared for: " + q.customer);
    lines.push("Job: " + q.summary);
    lines.push("");
    q.items.forEach(function (it, i) {
      lines.push((i + 1) + ". " + it.desc + (it.kind === "material" ? " [ESTIMATE]" : ""));
      lines.push("   " + it.qty + " " + it.unit + " × " + money(it.unitCost) + " = " + money(it.ext));
    });
    lines.push("");
    lines.push("Labor: " + money(q.laborTotal));
    lines.push("Materials (est.): " + money(q.matTotal));
    lines.push("Material markup (" + q.markup + "%): " + money(q.markupAmt));
    if (q.otherTotal) lines.push("Dispatch / other: " + money(q.otherTotal));
    lines.push("Estimated total: " + money(q.total));
    lines.push("Range (±15%): " + money(q.low) + " – " + money(q.high));
    lines.push("");
    lines.push("Exclusions:");
    q.exclusions.forEach(function (e) { lines.push("• " + e); });
    lines.push("");
    lines.push("Terms: 14-day validity. 50% deposit to schedule. Remainder on completion.");
    lines.push("Drafted by FieldQuote. Contractor reviews price, licenses, and terms before sending.");
    return lines.join("\n");
  }

  var FieldQuote = {
    EXAMPLES: EXAMPLES,
    TRADES: TRADES,
    generate: generate,
    renderQuote: renderQuote,
    quoteToText: quoteToText,
    flagsFrom: flagsFrom
  };

  function $(id) { return document.getElementById(id); }

  function readForm() {
    return {
      shop: $("shop").value,
      phone: $("phone").value,
      city: $("city").value,
      trade: $("trade").value,
      customer: $("customer").value,
      notes: $("notes").value,
      rate: $("rate").value,
      markup: $("markup").value
    };
  }

  function setNotesState() {
    var empty = !($("notes").value || "").trim();
    $("generate").disabled = empty;
    $("notes-warn").hidden = !empty;
  }

  var lastQuote = null;

  function showQuote(q) {
    lastQuote = q;
    $("quote").innerHTML = renderQuote(q);
    $("quote-actions").hidden = false;
  }

  function fillExample(ex) {
    $("shop").value = ex.shop;
    $("phone").value = ex.phone;
    $("city").value = ex.city;
    $("trade").value = ex.trade;
    $("customer").value = ex.customer;
    $("notes").value = ex.notes;
    setNotesState();
    var q = generate(readForm());
    if (!q.error) showQuote(q);
    $("generator").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function boot() {
    var chipBox = $("chips");
    EXAMPLES.forEach(function (ex) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = ex.label;
      b.addEventListener("click", function () { fillExample(ex); });
      chipBox.appendChild(b);
    });

    $("notes").addEventListener("input", setNotesState);
    setNotesState();

    $("quote-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = generate(readForm());
      if (q.error) {
        $("notes-warn").hidden = false;
        $("notes-warn").textContent = q.error;
        $("generate").disabled = true;
        return;
      }
      showQuote(q);
    });

    $("btn-print").addEventListener("click", function () { window.print(); });
    $("btn-pdf").addEventListener("click", function () { window.print(); });
    $("btn-copy").addEventListener("click", function () {
      if (!lastQuote) return;
      var text = quoteToText(lastQuote);
      function done() {
        $("btn-copy").textContent = "Copied";
        setTimeout(function () { $("btn-copy").textContent = "Copy text"; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          window.prompt("Copy this estimate:", text);
        });
      } else {
        window.prompt("Copy this estimate:", text);
      }
    });
    $("btn-new").addEventListener("click", function () {
      $("customer").value = "";
      $("notes").value = "";
      lastQuote = null;
      $("quote").innerHTML =
        '<div class="quote-empty"><strong>No quote yet.</strong>Paste a job on the left — or tap an example chip — then generate.</div>';
      $("quote-actions").hidden = true;
      setNotesState();
      $("notes").focus();
    });

    $("lead-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var lead = {
        email: $("lead-email").value.trim(),
        shop: $("lead-shop").value.trim(),
        trade: $("lead-trade").value,
        ts: new Date().toISOString()
      };
      if (!lead.email || !lead.shop) return;
      var key = "fieldquote_leads";
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch (err) { list = []; }
      if (!Array.isArray(list)) list = [];
      list.push(lead);
      try { localStorage.setItem(key, JSON.stringify(list)); } catch (err) { /* private mode */ }
      $("lead-form").style.display = "none";
      $("lead-thanks").classList.add("show");
    });
  }

  root.FieldQuote = FieldQuote;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FieldQuote;
  }
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);
