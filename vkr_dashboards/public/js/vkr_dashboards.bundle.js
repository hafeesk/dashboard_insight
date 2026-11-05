// VKR Dashboards — shared dashboard page: header with From / To / Company filters and quick ranges,
// KPI tiles with change vs the previous period, SVG charts with hover tooltips, and tables.
frappe.provide("vkr_dashboards");

(() => {
	const PALETTE = { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] };
	const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));
	const dark = () => (document.documentElement.getAttribute("data-theme") || document.documentElement.getAttribute("data-theme-mode")) === "dark";
	const colors = () => (dark() ? PALETTE.dark : PALETTE.light);
	const store = (k, v) => {
		try {
			if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
			localStorage.setItem(k, JSON.stringify(v));
		} catch (e) {
			return null;
		}
	};
	const ymd = (d) => frappe.datetime.obj_to_str(d);
	const today = () => frappe.datetime.str_to_obj(frappe.datetime.get_today());

	// ------------------------------------------------------------------ number formatting
	const compact = (v) =>
		new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: Math.abs(v) < 1000 ? 0 : 1 }).format(v || 0);
	const symbol = (cur) => {
		try {
			return (window.get_currency_symbol && get_currency_symbol(cur)) || cur || "";
		} catch (e) {
			return cur || "";
		}
	};
	const fmt = (v, kind, cur, short = false) => {
		v = v || 0;
		if (kind === "percent") return `${(Math.round(v * 10) / 10).toLocaleString()}%`;
		if (kind === "days") return `${short ? compact(v) : format_number(v, null, v % 1 ? 1 : 0)} ${__("days")}`;
		if (kind === "currency") return short ? `${symbol(cur)} ${compact(v)}` : format_currency(v, cur, 0);
		return short ? compact(v) : format_number(v, null, v % 1 ? 1 : 0);
	};

	// ------------------------------------------------------------------ quick ranges
	const RANGES = [
		["month", __("This month"), () => [frappe.datetime.month_start(), frappe.datetime.get_today()]],
		["last_month", __("Last month"), () => {
			const s = frappe.datetime.add_months(frappe.datetime.month_start(), -1);
			return [s, frappe.datetime.add_days(frappe.datetime.month_start(), -1)];
		}],
		["quarter", __("This quarter"), () => [frappe.datetime.quarter_start ? frappe.datetime.quarter_start() : quarter_start(), frappe.datetime.get_today()]],
		["ytd", __("Year to date"), () => [`${frappe.datetime.get_today().slice(0, 4)}-01-01`, frappe.datetime.get_today()]],
		["12m", __("Last 12 months"), () => [frappe.datetime.add_days(frappe.datetime.add_months(frappe.datetime.get_today(), -12), 1), frappe.datetime.get_today()]],
	];
	function quarter_start() {
		const d = today();
		return ymd(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
	}

	// ------------------------------------------------------------------ dashboard
	vkr_dashboards.Dashboard = class Dashboard {
		constructor(wrapper, cfg) {
			this.cfg = cfg;
			this.key = `vkr_dash_${cfg.key}`;
			this.page = frappe.ui.make_app_page({ parent: wrapper, title: cfg.title, single_column: true });
			$(wrapper).addClass("vd-page");
			this.$root = $(`<div class="vd"></div>`).appendTo(this.page.main);
			this.make_layout();
			this.make_filters();
			this.refresh();
			$(window).on(`resize.${this.key}`, frappe.utils.debounce(() => this.data && this.render_charts(), 200));
		}

		make_layout() {
			const c = this.cfg;
			this.$root.html(`
				<header class="vd-head">
					<div class="vd-title">
						<div class="vd-eyebrow">${__("Dashboard")}</div>
						<h1>${esc(c.title)}</h1>
						<div class="vd-range"></div>
					</div>
					<div class="vd-filters">
						<div class="vd-presets" role="group" aria-label="${__("Quick range")}">${RANGES.map(
							([k, l]) => `<button class="btn-reset vd-preset" data-range="${k}">${esc(l)}</button>`).join("")}</div>
						<div class="vd-controls">
							<div class="vd-ctl vd-from"></div><div class="vd-ctl vd-to"></div><div class="vd-ctl vd-company"></div>
							<button class="btn-reset vd-refresh" title="${__("Refresh")}" aria-label="${__("Refresh")}">${frappe.utils.icon("refresh-cw", "sm")}</button>
						</div>
					</div>
				</header>
				<div class="vd-denied" hidden></div>
				<section class="vd-kpis"></section>
				<section class="vd-grid">${c.charts.map((ch) => `
					<article class="vd-card ${ch.span === 2 ? "vd-span-2" : ""}" data-chart="${ch.key}">
						<header><h3>${esc(ch.title)}</h3>${ch.subtitle ? `<p>${esc(ch.subtitle)}</p>` : ""}<div class="vd-legend"></div></header>
						<div class="vd-chart-wrap"><div class="vd-chart"></div><div class="vd-tip" hidden></div></div>
					</article>`).join("")}
					${(c.tables || []).map((t) => `
					<article class="vd-card ${t.span === 2 ? "vd-span-2" : ""}" data-table="${t.key}">
						<header><h3>${esc(t.title)}</h3>${t.subtitle ? `<p>${esc(t.subtitle)}</p>` : ""}</header>
						<div class="vd-table-wrap"></div>
					</article>`).join("")}
				</section>`);
		}

		make_filters() {
			const saved = store(this.key) || {};
			const range = RANGES.find((r) => r[0] === (saved.range || this.cfg.default_range || "month")) || RANGES[0];
			const [f, t] = saved.range === "custom" && saved.from_date ? [saved.from_date, saved.to_date] : range[2]();
			this.range = saved.range || range[0];
			const ctl = (parent, df) =>
				frappe.ui.form.make_control({ parent: this.$root.find(parent), df: { ...df, change: () => this.on_change(df.fieldname) }, render_input: true });
			this.from = ctl(".vd-from", { fieldtype: "Date", fieldname: "from_date", placeholder: __("From"), label: __("From") });
			this.to = ctl(".vd-to", { fieldtype: "Date", fieldname: "to_date", placeholder: __("To"), label: __("To") });
			this.company = ctl(".vd-company", { fieldtype: "Link", fieldname: "company", options: "Company", placeholder: __("All companies"), label: __("Company") });
			this.silent = true;
			this.from.set_value(f);
			this.to.set_value(t);
			this.company.set_value(saved.company !== undefined ? saved.company : frappe.defaults.get_user_default("Company") || "");
			setTimeout(() => (this.silent = false), 300);
			this.mark_preset();
			this.$root.on("click", ".vd-preset", (e) => {
				const r = RANGES.find((x) => x[0] === $(e.currentTarget).data("range"));
				const [a, b] = r[2]();
				this.range = r[0];
				this.silent = true;
				this.from.set_value(a);
				this.to.set_value(b);
				setTimeout(() => ((this.silent = false), this.refresh()), 50);
				this.mark_preset();
			});
			this.$root.on("click", ".vd-refresh", () => this.refresh());
		}

		on_change(field) {
			if (this.silent) return;
			if (field !== "company") this.range = "custom";
			this.mark_preset();
			clearTimeout(this._t);
			this._t = setTimeout(() => this.refresh(), 250);
		}

		mark_preset() {
			this.$root.find(".vd-preset").each((i, el) => $(el).toggleClass("active", $(el).data("range") === this.range));
		}

		args() {
			return { from_date: this.from.get_value(), to_date: this.to.get_value(), company: this.company.get_value() || null };
		}

		refresh() {
			const a = this.args();
			if (!a.from_date || !a.to_date) return;
			store(this.key, { range: this.range, from_date: a.from_date, to_date: a.to_date, company: a.company || "" });
			this.$root.addClass("vd-loading");
			frappe
				.xcall(this.cfg.method, a)
				.then((d) => {
					this.data = d;
					this.render();
				})
				.finally(() => this.$root.removeClass("vd-loading"));
		}

		render() {
			const d = this.data;
			const p = d.period;
			const show = (s) => frappe.datetime.str_to_user(s);
			this.$root.find(".vd-range").html(
				`${esc(show(p.from_date))} – ${esc(show(p.to_date))}${d.company ? ` · ${esc(d.company)}` : ""}
				<span class="vd-vs">${__("compared with {0} – {1}", [esc(show(p.prev_from)), esc(show(p.prev_to))])}</span>`
			);
			this.$root.find(".vd-denied").prop("hidden", !(d.denied || []).length)
				.text(__("Some figures are hidden because you don't have access to: {0}", [(d.denied || []).map((x) => __(x)).join(", ")]));
			this.render_kpis();
			this.render_charts();
			this.render_tables();
		}

		render_kpis() {
			const d = this.data;
			this.$root.find(".vd-kpis").html(
				(d.kpis || []).map((k) => {
					const delta = this.delta(k);
					return `<div class="vd-kpi" title="${esc(k.hint || "")}">
						<div class="vd-kpi-label">${esc(k.label)}${k.hint ? `<span class="vd-info">${frappe.utils.icon("info", "xs")}</span>` : ""}</div>
						<div class="vd-kpi-value" title="${esc(fmt(k.value, k.kind, d.currency))}">${esc(fmt(k.value, k.kind, d.currency, true))}</div>
						${delta}
					</div>`;
				}).join("")
			);
		}

		delta(k) {
			if (k.key === "stock_value" || k.key === "below_reorder") return `<div class="vd-delta vd-flat">${__("as of today")}</div>`;
			const prev = k.prev || 0, cur = k.value || 0;
			if (!prev && !cur) return `<div class="vd-delta vd-flat">${__("no activity")}</div>`;
			if (!prev) return `<div class="vd-delta vd-flat">${__("new this period")}</div>`;
			const pct = k.kind === "percent" ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
			const up = pct > 0.05, down = pct < -0.05;
			const tone = !up && !down ? "flat" : k.good === "none" ? "flat" : (up === (k.good === "up") ? "good" : "bad");
			const arrow = up ? "▲" : down ? "▼" : "■";
			const val = k.kind === "percent" ? `${Math.abs(Math.round(pct * 10) / 10)} ${__("pts")}` : `${Math.abs(Math.round(pct * 10) / 10)}%`;
			return `<div class="vd-delta vd-${tone}"><span aria-hidden="true">${arrow}</span> ${val} <span class="vd-delta-note">${__("vs previous")}</span></div>`;
		}

		render_charts() {
			const d = this.data;
			this.cfg.charts.forEach((ch) => {
				const $card = this.$root.find(`[data-chart="${ch.key}"]`);
				const data = (d.charts || {})[ch.key];
				const $el = $card.find(".vd-chart");
				const has = data && data.labels && data.labels.length && data.datasets.some((s) => s.values.some((v) => v));
				$card.toggleClass("vd-empty", !has);
				$card.find(".vd-legend").html(
					has && data.datasets.length > 1
						? data.datasets.map((s, i) => `<span><i style="background:${colors()[i]}"></i>${esc(s.name)}</span>`).join("")
						: ""
				);
				if (!has) return $el.html(`<div class="vd-none">${data ? __("No data for this period") : __("Not available")}</div>`);
				const kind = ch.fmt || "currency";
				const opts = { el: $el[0], tip: $card.find(".vd-tip")[0], data, f: (v, s) => fmt(v, kind, d.currency, s) };
				if (ch.type === "hbar") hbar(opts);
				else if (ch.type === "columns") columns(opts);
				else line(opts);
			});
		}

		render_tables() {
			const d = this.data;
			(this.cfg.tables || []).forEach((t) => {
				const rows = (d.tables || {})[t.key];
				const $w = this.$root.find(`[data-table="${t.key}"] .vd-table-wrap`);
				if (!rows || !rows.length) return $w.html(`<div class="vd-none">${rows ? __("Nothing to show") : __("Not available")}</div>`);
				$w.html(`<table class="vd-table"><thead><tr>${t.columns.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
					<tbody>${rows.map((r) => `<tr>${t.columns.map((c) => `<td class="${c.num ? "num" : ""}">${this.cell(r, c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
			});
		}

		cell(r, c) {
			const v = r[c.field];
			if (c.link) {
				const name = r[c.link_field || c.field];
				return `<a href="${frappe.utils.get_form_link(c.link, name)}">${esc(v)}</a>${c.sub ? `<small>${esc(r[c.sub] || "")}</small>` : ""}`;
			}
			if (c.type === "currency") return esc(format_currency(v, this.data.currency, 0));
			if (c.type === "number") return esc(format_number(v || 0, null, (v || 0) % 1 ? 2 : 0));
			if (c.type === "date") return esc(v ? frappe.datetime.str_to_user(v) : "");
			if (c.type === "late") return v > 0 ? `<span class="vd-late">${__("{0} days", [v])}</span>` : `<span class="vd-ok">${__("on time")}</span>`;
			if (c.type === "percent") return `<span class="vd-bar-cell"><i style="width:${Math.min(100, v || 0)}%"></i></span>${esc(Math.round(v || 0))}%`;
			return esc(v) + (c.sub ? `<small>${esc(r[c.sub] || "")}</small>` : "");
		}
	};

	// ------------------------------------------------------------------ SVG charts
	const NS = "http://www.w3.org/2000/svg";
	const nice = (max) => {
		if (max <= 0) return [0, 1];
		const p = Math.pow(10, Math.floor(Math.log10(max)));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => max / s <= 4) || p * 10;
		return [step * Math.ceil(max / step), step];
	};
	const svg = (w, h) => `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" xmlns="${NS}">`;
	const tipAt = (tip, el, x, y, html) => {
		tip.innerHTML = html;
		tip.hidden = false;
		const box = el.getBoundingClientRect();
		const tw = tip.offsetWidth;
		let left = x + 14;
		if (left + tw > box.width) left = x - tw - 14;
		tip.style.left = `${Math.max(0, left)}px`;
		tip.style.top = `${Math.max(0, y - 10)}px`;
	};
	const tipRows = (o, i) =>
		o.data.datasets.map((s, j) => `<div><i style="background:${colors()[j]}"></i>${esc(s.name)}<b>${esc(o.f(s.values[i]))}</b></div>`).join("");

	// line / area over time (1–3 series), crosshair + tooltip
	function line(o) {
		const el = o.el, W = Math.max(320, el.clientWidth), H = 240, L = 56, R = 12, T = 12, B = 28;
		const { labels, datasets } = o.data;
		const max = Math.max(...datasets.flatMap((s) => s.values), 0);
		const [top, step] = nice(max);
		const n = labels.length, x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), y = (v) => T + (H - T - B) * (1 - v / top);
		let s = svg(W, H);
		for (let v = 0; v <= top + 1e-9; v += step)
			s += `<line class="vd-grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="vd-axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(o.f(v, true))}</text>`;
		const every = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 72)));
		labels.forEach((l, i) => {
			if (i % every === 0 || i === n - 1) s += `<text class="vd-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`;
		});
		datasets.forEach((d, j) => {
			const pts = d.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
			if (j === 0) s += `<polygon points="${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}" fill="${colors()[0]}" opacity=".10"/>`;
			s += `<polyline points="${pts}" fill="none" stroke="${colors()[j]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
			if (n <= 31) d.values.forEach((v, i) => (s += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${colors()[j]}"/>`));
		});
		s += `<line class="vd-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
		s += `<rect class="vd-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
		el.innerHTML = s;
		const cross = el.querySelector(".vd-cross");
		const hit = el.querySelector(".vd-hit");
		hit.addEventListener("mousemove", (e) => {
			const r = el.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
			const i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((px - L) / (W - L - R)) * (n - 1))));
			cross.setAttribute("x1", x(i));
			cross.setAttribute("x2", x(i));
			cross.setAttribute("visibility", "visible");
			tipAt(o.tip, el, (x(i) / W) * r.width, e.clientY - r.top, `<header>${esc(labels[i])}</header>${tipRows(o, i)}`);
		});
		hit.addEventListener("mouseleave", () => ((o.tip.hidden = true), cross.setAttribute("visibility", "hidden")));
	}

	// grouped vertical columns (counts per period)
	function columns(o) {
		const el = o.el, W = Math.max(320, el.clientWidth), H = 240, L = 40, R = 8, T = 12, B = 28;
		const { labels, datasets } = o.data;
		const max = Math.max(...datasets.flatMap((s) => s.values), 0);
		const [top, step] = nice(max);
		const n = labels.length, band = (W - L - R) / n, k = datasets.length;
		const bw = Math.max(2, Math.min(18, (band - 6) / k - 2));
		const y = (v) => T + (H - T - B) * (1 - v / top);
		let s = svg(W, H);
		for (let v = 0; v <= top + 1e-9; v += step)
			s += `<line class="vd-grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="vd-axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(o.f(v, true))}</text>`;
		const every = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 60)));
		labels.forEach((l, i) => {
			const cx = L + band * i + band / 2;
			if (i % every === 0) s += `<text class="vd-axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`;
			datasets.forEach((d, j) => {
				const v = d.values[i], bx = cx - (k * (bw + 2)) / 2 + j * (bw + 2), by = y(v), h = y(0) - by;
				if (h > 0) s += `<path d="${rounded(bx, by, bw, h)}" fill="${colors()[j]}"/>`;
			});
			s += `<rect class="vd-hit" data-i="${i}" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent"/>`;
		});
		el.innerHTML = s + "</svg>";
		hover_bands(o, el, labels);
	}

	// horizontal bars for a ranked list (top customers, warehouses…)
	function hbar(o) {
		const el = o.el, W = Math.max(300, el.clientWidth);
		const { labels, datasets } = o.data;
		const vals = datasets[0].values, n = labels.length, row = 30, T = 4, H = T + n * row + 4;
		const lw = Math.min(170, Math.max(90, W * 0.34)), vw = 76, bwmax = W - lw - vw - 16;
		const max = Math.max(...vals, 0) || 1;
		let s = svg(W, H);
		labels.forEach((l, i) => {
			const y0 = T + i * row, w = Math.max(2, (vals[i] / max) * bwmax);
			const name = String(l || "");
			const short = name.length > 26 ? name.slice(0, 25) + "…" : name;
			s += `<text class="vd-cat" x="${lw - 10}" y="${y0 + row / 2 + 4}" text-anchor="end">${esc(short)}</text>`;
			s += `<path d="${roundedH(lw, y0 + 7, w, row - 14)}" fill="${colors()[0]}"/>`;
			s += `<text class="vd-val" x="${lw + w + 8}" y="${y0 + row / 2 + 4}">${esc(o.f(vals[i], true))}</text>`;
			s += `<rect class="vd-hit" data-i="${i}" x="0" y="${y0}" width="${W}" height="${row}" fill="transparent"/>`;
		});
		el.innerHTML = s + "</svg>";
		hover_bands(o, el, labels);
	}

	function hover_bands(o, el, labels) {
		el.querySelectorAll(".vd-hit").forEach((h) => {
			h.addEventListener("mousemove", (e) => {
				const r = el.getBoundingClientRect(), i = +h.dataset.i;
				el.querySelectorAll(".vd-hit").forEach((x) => x.classList.toggle("on", x === h));
				tipAt(o.tip, el, e.clientX - r.left, e.clientY - r.top, `<header>${esc(labels[i])}</header>${tipRows(o, i)}`);
			});
			h.addEventListener("mouseleave", () => ((o.tip.hidden = true), h.classList.remove("on")));
		});
	}

	// bar with a 4px rounded data end, square at the baseline
	const rounded = (x, y, w, h) => {
		const r = Math.min(4, w / 2, h);
		return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
	};
	const roundedH = (x, y, w, h) => {
		const r = Math.min(4, h / 2, w);
		return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
	};
})();
