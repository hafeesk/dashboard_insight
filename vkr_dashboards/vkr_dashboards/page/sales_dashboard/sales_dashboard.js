frappe.pages["sales-dashboard"].on_page_load = function (wrapper) {
	wrapper.dashboard = new vkr_dashboards.Dashboard(wrapper, {
	key: "sales", title: __("Sales"), method: "vkr_dashboards.api.get_sales",
	charts: [
		{ key: "trend", title: __("Sales over time"), subtitle: __("Net sales invoiced vs orders booked"), type: "line", span: 2 },
		{ key: "top_customers", title: __("Top customers"), subtitle: __("By net sales in the period"), type: "hbar" },
		{ key: "by_territory", title: __("Sales by territory"), type: "hbar" },
	],
	tables: [
		{ key: "top_items", title: __("Best-selling items"), columns: [
			{ field: "item_code", label: __("Item"), link: "Item", sub: "item_name" },
			{ field: "qty", label: __("Qty"), type: "number", num: 1 },
			{ field: "amount", label: __("Net sales"), type: "currency", num: 1 } ] },
		{ key: "overdue", title: __("Overdue invoices"), subtitle: __("Largest unpaid amounts past their due date (any date)"), columns: [
			{ field: "name", label: __("Invoice"), link: "Sales Invoice", sub: "party" },
			{ field: "due_date", label: __("Due"), type: "date" },
			{ field: "days", label: __("Overdue"), type: "late", num: 1 },
			{ field: "amount", label: __("Outstanding"), type: "currency", num: 1 } ] },
	],
	});
};
