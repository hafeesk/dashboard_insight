"""Data for the VKR dashboards (Sales, Purchase, Stock, HR).

Every endpoint takes from_date / to_date (and an optional company) and returns
{
	"period": {...},
	"kpis": [{key, label, value, prev, kind: currency|number|percent|days, good: up|down}],
	"charts": {name: {labels, datasets: [{name, values}]}},
	"tables": {name: [rows]},
	"denied": [sections the user may not read],
}
KPIs carry the value for the previous period of the same length, for the change badge.
A section the user has no read permission for is left out (and listed in "denied").
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, add_months, flt, getdate, nowdate

TOP = 10


# ----------------------------------------------------------------------------- helpers


def _period(from_date, to_date):
	f = getdate(from_date or add_months(nowdate(), -1))
	t = getdate(to_date or nowdate())
	if f > t:
		f, t = t, f
	days = (t - f).days + 1
	pf, pt = f - timedelta(days=days), f - timedelta(days=1)
	return frappe._dict(from_date=f, to_date=t, prev_from=pf, prev_to=pt, days=days)


def _company(company):
	if company:
		if not frappe.db.exists("Company", company):
			frappe.throw(_("Company {0} not found").format(company))
		return company
	return None


def _can(doctype):
	return bool(frappe.db.exists("DocType", doctype)) and bool(frappe.has_permission(doctype, "read"))


def _currency(company):
	if company:
		return frappe.get_cached_value("Company", company, "default_currency")
	return frappe.defaults.get_global_default("currency") or frappe.db.get_default("currency")


def _val(sql, values):
	r = frappe.db.sql(sql, values)
	return flt(r[0][0]) if r and r[0][0] is not None else 0


def _buckets(p):
	"""Labels and a SQL expression grouping a date column: by day up to 45 days, else by month."""
	if p.days <= 45:
		keys, d = [], p.from_date
		while d <= p.to_date:
			keys.append(d.strftime("%Y-%m-%d"))
			d = d + timedelta(days=1)
		return keys, [getdate(k).strftime("%d %b") for k in keys], "%Y-%m-%d"
	keys, d = [], p.from_date.replace(day=1)
	while d <= p.to_date:
		keys.append(d.strftime("%Y-%m"))
		d = getdate(add_months(d, 1))
	return keys, [getdate(k + "-01").strftime("%b %Y") for k in keys], "%Y-%m"


def _series(sql, values, p, date_col_fmt):
	"""Run a grouped query returning (bucket_key, value) and line it up with the period's buckets."""
	keys, labels, fmt = _buckets(p)
	# date_format patterns: escape % because the query uses %(name)s parameters
	rows = dict(frappe.db.sql(sql.replace("{fmt}", fmt.replace("%", "%%")), values))
	return keys, labels, [flt(rows.get(k)) for k in keys]


def _cond(company, alias=""):
	return f" and {alias}company = %(company)s" if company else ""


def _kpi(key, label, cur, prev, kind="currency", good="up", hint=None):
	return {"key": key, "label": label, "value": flt(cur, 2), "prev": flt(prev, 2), "kind": kind, "good": good, "hint": hint}


def _out(p, company, kpis, charts, tables, denied):
	return {
		"period": {"from_date": str(p.from_date), "to_date": str(p.to_date), "prev_from": str(p.prev_from), "prev_to": str(p.prev_to),
			"days": p.days, "bucket": "day" if p.days <= 45 else "month"},
		"company": company,
		"currency": _currency(company),
		"kpis": kpis,
		"charts": charts,
		"tables": tables,
		"denied": denied,
	}


def _args(p, company, **kw):
	return {"from": p.from_date, "to": p.to_date, "pfrom": p.prev_from, "pto": p.prev_to, "company": company, "today": getdate(nowdate()), **kw}


# ----------------------------------------------------------------------------- sales


@frappe.whitelist()
def get_sales(from_date=None, to_date=None, company=None):
	p, company = _period(from_date, to_date), _company(company)
	a = _args(p, company)
	kpis, charts, tables, denied = [], {}, {}, []
	cc = _cond(company)

	if _can("Sales Invoice"):
		si = "from `tabSales Invoice` where docstatus = 1 and posting_date between %(f)s and %(t)s" + cc
		cur = dict(a, f=p.from_date, t=p.to_date)
		prv = dict(a, f=p.prev_from, t=p.prev_to)
		net, pnet = _val("select sum(base_net_total) " + si, cur), _val("select sum(base_net_total) " + si, prv)
		cnt, pcnt = _val("select count(*) " + si + " and is_return = 0", cur), _val("select count(*) " + si + " and is_return = 0", prv)
		kpis += [
			_kpi("net_sales", _("Net sales"), net, pnet, hint=_("Submitted sales invoices, net of returns")),
			_kpi("invoices", _("Invoices"), cnt, pcnt, "number"),
			_kpi("avg_invoice", _("Average invoice"), net / cnt if cnt else 0, pnet / pcnt if pcnt else 0),
			_kpi("receivable", _("Unpaid from period"), _val("select sum(outstanding_amount * conversion_rate) " + si, cur),
				_val("select sum(outstanding_amount * conversion_rate) " + si, prv), good="down", hint=_("Outstanding on invoices raised in the period")),
		]
		keys, labels, vals = _series(
			"select date_format(posting_date, '{fmt}'), sum(base_net_total) from `tabSales Invoice` "
			"where docstatus = 1 and posting_date between %(from)s and %(to)s" + cc + " group by 1", a, p, None)
		charts["trend"] = {"labels": labels, "datasets": [{"name": _("Net sales"), "values": vals}]}
		charts["top_customers"] = _bars(frappe.db.sql(
			"select coalesce(nullif(customer_name, ''), customer), sum(base_net_total) v from `tabSales Invoice` "
			"where docstatus = 1 and posting_date between %(from)s and %(to)s" + cc + " group by customer order by v desc limit %(n)s",
			dict(a, n=TOP)), _("Net sales"))
		charts["by_territory"] = _bars(frappe.db.sql(
			"select coalesce(territory, %(none)s), sum(base_net_total) v from `tabSales Invoice` "
			"where docstatus = 1 and posting_date between %(from)s and %(to)s" + cc + " group by territory order by v desc limit 8",
			dict(a, none=_("Not set"))), _("Net sales"))
		tables["top_items"] = frappe.db.sql(
			"select i.item_code, max(i.item_name) item_name, sum(i.stock_qty) qty, sum(i.base_net_amount) amount "
			"from `tabSales Invoice Item` i join `tabSales Invoice` s on s.name = i.parent "
			"where s.docstatus = 1 and s.posting_date between %(from)s and %(to)s" + _cond(company, "s.")
			+ " group by i.item_code order by amount desc limit %(n)s", dict(a, n=TOP), as_dict=True)
		tables["overdue"] = frappe.db.sql(
			"select name, coalesce(nullif(customer_name, ''), customer) party, due_date, outstanding_amount * conversion_rate amount, "
			"datediff(%(today)s, due_date) days from `tabSales Invoice` where docstatus = 1 and outstanding_amount > 0 "
			"and due_date < %(today)s" + cc + " order by amount desc limit %(n)s", dict(a, n=TOP), as_dict=True)
	else:
		denied.append("Sales Invoice")

	if _can("Sales Order"):
		so = "select sum(base_net_total) from `tabSales Order` where docstatus = 1 and transaction_date between %(f)s and %(t)s" + cc
		kpis.append(_kpi("orders", _("Orders booked"), _val(so, dict(a, f=p.from_date, t=p.to_date)), _val(so, dict(a, f=p.prev_from, t=p.prev_to))))
		if "trend" in charts:
			_, _l, vals = _series(
				"select date_format(transaction_date, '{fmt}'), sum(base_net_total) from `tabSales Order` "
				"where docstatus = 1 and transaction_date between %(from)s and %(to)s" + cc + " group by 1", a, p, None)
			charts["trend"]["datasets"].append({"name": _("Orders booked"), "values": vals})
	else:
		denied.append("Sales Order")

	if _can("Payment Entry"):
		pe = ("select sum(base_received_amount) from `tabPayment Entry` where docstatus = 1 and payment_type = 'Receive' "
			"and party_type = 'Customer' and posting_date between %(f)s and %(t)s" + cc)
		kpis.append(_kpi("collected", _("Collected"), _val(pe, dict(a, f=p.from_date, t=p.to_date)), _val(pe, dict(a, f=p.prev_from, t=p.prev_to))))

	if _can("Customer"):
		nc = "select count(*) from `tabCustomer` where date(creation) between %(f)s and %(t)s"
		kpis.append(_kpi("new_customers", _("New customers"), _val(nc, dict(a, f=p.from_date, t=p.to_date)), _val(nc, dict(a, f=p.prev_from, t=p.prev_to)), "number"))
	return _out(p, company, kpis, charts, tables, denied)


def _bars(rows, name):
	return {"labels": [r[0] for r in rows], "datasets": [{"name": name, "values": [flt(r[1]) for r in rows]}]}


# ----------------------------------------------------------------------------- purchase


@frappe.whitelist()
def get_purchase(from_date=None, to_date=None, company=None):
	p, company = _period(from_date, to_date), _company(company)
	a = _args(p, company)
	kpis, charts, tables, denied = [], {}, {}, []
	cc = _cond(company)

	if _can("Purchase Invoice"):
		pi = "from `tabPurchase Invoice` where docstatus = 1 and posting_date between %(f)s and %(t)s" + cc
		cur = dict(a, f=p.from_date, t=p.to_date)
		prv = dict(a, f=p.prev_from, t=p.prev_to)
		net, pnet = _val("select sum(base_net_total) " + pi, cur), _val("select sum(base_net_total) " + pi, prv)
		cnt, pcnt = _val("select count(*) " + pi + " and is_return = 0", cur), _val("select count(*) " + pi + " and is_return = 0", prv)
		kpis += [
			_kpi("net_purchase", _("Net purchases"), net, pnet, good="down", hint=_("Submitted purchase invoices, net of returns")),
			_kpi("bills", _("Supplier invoices"), cnt, pcnt, "number", good="down"),
			_kpi("payable", _("Unpaid from period"), _val("select sum(outstanding_amount * conversion_rate) " + pi, cur),
				_val("select sum(outstanding_amount * conversion_rate) " + pi, prv), good="down", hint=_("Outstanding on supplier invoices of the period")),
		]
		keys, labels, vals = _series(
			"select date_format(posting_date, '{fmt}'), sum(base_net_total) from `tabPurchase Invoice` "
			"where docstatus = 1 and posting_date between %(from)s and %(to)s" + cc + " group by 1", a, p, None)
		charts["trend"] = {"labels": labels, "datasets": [{"name": _("Net purchases"), "values": vals}]}
		charts["top_suppliers"] = _bars(frappe.db.sql(
			"select coalesce(nullif(supplier_name, ''), supplier), sum(base_net_total) v from `tabPurchase Invoice` "
			"where docstatus = 1 and posting_date between %(from)s and %(to)s" + cc + " group by supplier order by v desc limit %(n)s",
			dict(a, n=TOP)), _("Net purchases"))
		charts["by_item_group"] = _bars(frappe.db.sql(
			"select coalesce(i.item_group, %(none)s), sum(i.base_net_amount) v from `tabPurchase Invoice Item` i "
			"join `tabPurchase Invoice` s on s.name = i.parent where s.docstatus = 1 and s.posting_date between %(from)s and %(to)s"
			+ _cond(company, "s.") + " group by i.item_group order by v desc limit 8", dict(a, none=_("Not set"))), _("Net purchases"))
		tables["top_items"] = frappe.db.sql(
			"select i.item_code, max(i.item_name) item_name, sum(i.stock_qty) qty, sum(i.base_net_amount) amount "
			"from `tabPurchase Invoice Item` i join `tabPurchase Invoice` s on s.name = i.parent "
			"where s.docstatus = 1 and s.posting_date between %(from)s and %(to)s" + _cond(company, "s.")
			+ " group by i.item_code order by amount desc limit %(n)s", dict(a, n=TOP), as_dict=True)
	else:
		denied.append("Purchase Invoice")

	if _can("Purchase Order"):
		po = "select sum(base_net_total) from `tabPurchase Order` where docstatus = 1 and transaction_date between %(f)s and %(t)s" + cc
		kpis.append(_kpi("orders", _("Orders placed"), _val(po, dict(a, f=p.from_date, t=p.to_date)), _val(po, dict(a, f=p.prev_from, t=p.prev_to)), good="down"))
		tables["pending_orders"] = frappe.db.sql(
			"select name, coalesce(nullif(supplier_name, ''), supplier) party, schedule_date, base_net_total amount, per_received, "
			"datediff(%(today)s, schedule_date) days from `tabPurchase Order` where docstatus = 1 and per_received < 100 "
			"and status not in ('Closed', 'On Hold', 'Completed') and transaction_date <= %(to)s" + cc
			+ " order by schedule_date asc limit %(n)s", dict(a, n=TOP), as_dict=True)
		if "trend" in charts:
			_, _l, vals = _series(
				"select date_format(transaction_date, '{fmt}'), sum(base_net_total) from `tabPurchase Order` "
				"where docstatus = 1 and transaction_date between %(from)s and %(to)s" + cc + " group by 1", a, p, None)
			charts["trend"]["datasets"].append({"name": _("Orders placed"), "values": vals})
	else:
		denied.append("Purchase Order")

	if _can("Payment Entry"):
		pe = ("select sum(base_paid_amount) from `tabPayment Entry` where docstatus = 1 and payment_type = 'Pay' "
			"and party_type = 'Supplier' and posting_date between %(f)s and %(t)s" + cc)
		kpis.append(_kpi("paid", _("Paid to suppliers"), _val(pe, dict(a, f=p.from_date, t=p.to_date)), _val(pe, dict(a, f=p.prev_from, t=p.prev_to)), good="none"))
	return _out(p, company, kpis, charts, tables, denied)


# ----------------------------------------------------------------------------- stock


@frappe.whitelist()
def get_stock(from_date=None, to_date=None, company=None):
	p, company = _period(from_date, to_date), _company(company)
	a = _args(p, company)
	kpis, charts, tables, denied = [], {}, {}, []
	wc = " and w.company = %(company)s" if company else ""

	if _can("Bin"):
		kpis.append(_kpi("stock_value", _("Stock value today"),
			_val("select sum(b.stock_value) from `tabBin` b join `tabWarehouse` w on w.name = b.warehouse where 1=1" + wc, a), 0,
			good="none", hint=_("Current value of all stock (not limited to the dates)")))
		charts["by_warehouse"] = _bars(frappe.db.sql(
			"select b.warehouse, sum(b.stock_value) v from `tabBin` b join `tabWarehouse` w on w.name = b.warehouse where 1=1"
			+ wc + " group by b.warehouse having v <> 0 order by v desc limit %(n)s", dict(a, n=TOP)), _("Stock value"))
		reorder = frappe.db.sql(
			"select b.item_code, i.item_name, b.warehouse, b.projected_qty qty, r.warehouse_reorder_level level "
			"from `tabBin` b join `tabItem Reorder` r on r.parent = b.item_code and r.warehouse = b.warehouse "
			"join `tabItem` i on i.name = b.item_code join `tabWarehouse` w on w.name = b.warehouse "
			"where i.disabled = 0 and r.warehouse_reorder_level > 0 and b.projected_qty < r.warehouse_reorder_level" + wc
			+ " order by (b.projected_qty - r.warehouse_reorder_level) asc limit 50", a, as_dict=True) if frappe.db.table_exists("Item Reorder") else []
		kpis.append(_kpi("below_reorder", _("Below reorder level"), len(reorder), 0, "number", good="down", hint=_("Item / warehouse pairs, today")))
		tables["reorder"] = reorder[:TOP]
	else:
		denied.append("Bin")

	if _can("Stock Ledger Entry"):
		sle = ("from `tabStock Ledger Entry` s join `tabWarehouse` w on w.name = s.warehouse where s.is_cancelled = 0 "
			"and s.posting_date between %(f)s and %(t)s" + wc)
		cur = dict(a, f=p.from_date, t=p.to_date)
		prv = dict(a, f=p.prev_from, t=p.prev_to)
		inn = "select sum(s.stock_value_difference) " + sle + " and s.actual_qty > 0"
		out = "select -sum(s.stock_value_difference) " + sle + " and s.actual_qty < 0"
		kpis.insert(1, _kpi("received", _("Value received"), _val(inn, cur), _val(inn, prv), good="none"))
		kpis.insert(2, _kpi("issued", _("Value issued"), _val(out, cur), _val(out, prv), good="none"))
		base = ("from `tabStock Ledger Entry` s join `tabWarehouse` w on w.name = s.warehouse where s.is_cancelled = 0 "
			"and s.posting_date between %(from)s and %(to)s" + wc)
		_, labels, vin = _series("select date_format(s.posting_date, '{fmt}'), sum(s.stock_value_difference) " + base + " and s.actual_qty > 0 group by 1", a, p, None)
		_, _l, vout = _series("select date_format(s.posting_date, '{fmt}'), -sum(s.stock_value_difference) " + base + " and s.actual_qty < 0 group by 1", a, p, None)
		charts["movement"] = {"labels": labels, "datasets": [{"name": _("Received"), "values": vin}, {"name": _("Issued"), "values": vout}]}
		tables["top_moving"] = frappe.db.sql(
			"select s.item_code, max(i.item_name) item_name, -sum(s.actual_qty) qty, -sum(s.stock_value_difference) amount "
			"from `tabStock Ledger Entry` s join `tabWarehouse` w on w.name = s.warehouse join `tabItem` i on i.name = s.item_code "
			"where s.is_cancelled = 0 and s.actual_qty < 0 and s.posting_date between %(from)s and %(to)s" + wc
			+ " group by s.item_code order by qty desc limit %(n)s", dict(a, n=TOP), as_dict=True)
	else:
		denied.append("Stock Ledger Entry")

	if _can("Stock Entry"):
		cc = _cond(company)
		se = "select count(*) from `tabStock Entry` where docstatus = 1 and posting_date between %(f)s and %(t)s" + cc
		kpis.append(_kpi("entries", _("Stock entries"), _val(se, dict(a, f=p.from_date, t=p.to_date)), _val(se, dict(a, f=p.prev_from, t=p.prev_to)), "number", good="none"))
		charts["by_purpose"] = _bars(frappe.db.sql(
			"select purpose, count(*) v from `tabStock Entry` where docstatus = 1 and posting_date between %(from)s and %(to)s"
			+ cc + " group by purpose order by v desc", a), _("Entries"))
	return _out(p, company, kpis, charts, tables, denied)


# ----------------------------------------------------------------------------- HR


@frappe.whitelist()
def get_hr(from_date=None, to_date=None, company=None):
	p, company = _period(from_date, to_date), _company(company)
	a = _args(p, company)
	kpis, charts, tables, denied = [], {}, {}, []
	cc = _cond(company)

	if _can("Employee"):
		active = ("select count(*) from `tabEmployee` where date_of_joining <= %(d)s "
			"and (relieving_date is null or relieving_date > %(d)s) and status != 'Inactive'" + cc)
		head_end, head_start = _val(active, dict(a, d=p.to_date)), _val(active, dict(a, d=add_days(p.from_date, -1)))
		phead_end, phead_start = head_start, _val(active, dict(a, d=add_days(p.prev_from, -1)))
		joins = "select count(*) from `tabEmployee` where date_of_joining between %(f)s and %(t)s" + cc
		exits = "select count(*) from `tabEmployee` where relieving_date between %(f)s and %(t)s" + cc
		cur, prv = dict(a, f=p.from_date, t=p.to_date), dict(a, f=p.prev_from, t=p.prev_to)
		j, pj, x, px = _val(joins, cur), _val(joins, prv), _val(exits, cur), _val(exits, prv)
		avg, pavg = (head_start + head_end) / 2, (phead_start + phead_end) / 2
		kpis += [
			_kpi("headcount", _("Headcount"), head_end, phead_end, "number", good="none", hint=_("Active employees on the To date")),
			_kpi("joiners", _("Joined"), j, pj, "number"),
			_kpi("exits", _("Left"), x, px, "number", good="down"),
			_kpi("attrition", _("Attrition"), (x / avg * 100) if avg else 0, (px / pavg * 100) if pavg else 0, "percent", good="down",
				hint=_("Leavers ÷ average headcount in the period")),
		]
		charts["by_department"] = _bars(frappe.db.sql(
			"select coalesce(nullif(department, ''), %(none)s), count(*) v from `tabEmployee` where date_of_joining <= %(to)s "
			"and (relieving_date is null or relieving_date > %(to)s) and status != 'Inactive'" + cc
			+ " group by department order by v desc limit 10", dict(a, none=_("No department"))), _("Employees"))
		charts["by_department"]["labels"] = [_strip_abbr(l) for l in charts["by_department"]["labels"]]
		_, labels, vj = _series("select date_format(date_of_joining, '{fmt}'), count(*) from `tabEmployee` "
			"where date_of_joining between %(from)s and %(to)s" + cc + " group by 1", a, p, None)
		_, _l, vx = _series("select date_format(relieving_date, '{fmt}'), count(*) from `tabEmployee` "
			"where relieving_date between %(from)s and %(to)s" + cc + " group by 1", a, p, None)
		charts["movement"] = {"labels": labels, "datasets": [{"name": _("Joined"), "values": vj}, {"name": _("Left"), "values": vx}]}
		tables["joiners"] = frappe.db.sql(
			"select name, employee_name, department, designation, date_of_joining from `tabEmployee` "
			"where date_of_joining between %(from)s and %(to)s" + cc + " order by date_of_joining desc limit %(n)s", dict(a, n=TOP), as_dict=True)
		for r in tables["joiners"]:
			r.department = _strip_abbr(r.department)
	else:
		denied.append("Employee")

	if _can("Leave Application"):
		la = ("select sum(total_leave_days) from `tabLeave Application` where docstatus = 1 and status = 'Approved' "
			"and from_date between %(f)s and %(t)s" + cc)
		kpis.append(_kpi("leave_days", _("Leave days taken"), _val(la, dict(a, f=p.from_date, t=p.to_date)), _val(la, dict(a, f=p.prev_from, t=p.prev_to)), "days", good="none"))
		charts["by_leave_type"] = _bars(frappe.db.sql(
			"select leave_type, sum(total_leave_days) v from `tabLeave Application` where docstatus = 1 and status = 'Approved' "
			"and from_date between %(from)s and %(to)s" + cc + " group by leave_type order by v desc limit 8", a), _("Days"))
	else:
		denied.append("Leave Application")

	if _can("Attendance"):
		att = ("select sum(case when status in ('Present', 'Work From Home') then 1 when status = 'Half Day' then 0.5 else 0 end), count(*) "
			"from `tabAttendance` where docstatus = 1 and attendance_date between %(f)s and %(t)s" + cc)
		r = frappe.db.sql(att, dict(a, f=p.from_date, t=p.to_date))[0]
		pr = frappe.db.sql(att, dict(a, f=p.prev_from, t=p.prev_to))[0]
		kpis.append(_kpi("attendance", _("Attendance rate"), flt(r[0]) / flt(r[1]) * 100 if r[1] else 0,
			flt(pr[0]) / flt(pr[1]) * 100 if pr[1] else 0, "percent", hint=_("Present days ÷ marked days")))
		charts["attendance"] = _bars(frappe.db.sql(
			"select status, count(*) v from `tabAttendance` where docstatus = 1 and attendance_date between %(from)s and %(to)s"
			+ cc + " group by status order by v desc", a), _("Days"))
	else:
		denied.append("Attendance")
	return _out(p, company, kpis, charts, tables, denied)


def _strip_abbr(name):
	"""'Sales - VKR' -> 'Sales' (department names carry the company abbreviation)."""
	if not name:
		return name
	head, sep, tail = name.rpartition(" - ")
	return head if sep and tail and len(tail) <= 6 and tail.isupper() else name
