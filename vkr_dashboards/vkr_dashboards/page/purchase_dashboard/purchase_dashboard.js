frappe.pages["purchase-dashboard"].on_page_load = function (wrapper) {
	wrapper.dashboard = new vkr_dashboards.Dashboard(wrapper, {
	key: "purchase", title: __("Purchase"), method: "vkr_dashboards.api.get_purchase",
	charts: [
		{ key: "trend", title: __("Purchases over time"), subtitle: __("Supplier invoices vs orders placed"), type: "line", span: 2 },
		{ key: "top_suppliers", title: __("Top suppliers"), subtitle: __("By net purchases in the period"), type: "hbar" },
		{ key: "by_item_group", title: __("Spend by item group"), type: "hbar" },
	],
	tables: [
		{ key: "top_items", title: __("Most purchased items"), columns: [
			{ field: "item_code", label: __("Item"), link: "Item", sub: "item_name" },
			{ field: "qty", label: __("Qty"), type: "number", num: 1 },
			{ field: "amount", label: __("Net amount"), type: "currency", num: 1 } ] },
		{ key: "pending_orders", title: __("Orders waiting for delivery"), subtitle: __("Open purchase orders, earliest required date first"), columns: [
			{ field: "name", label: __("Order"), link: "Purchase Order", sub: "party" },
			{ field: "schedule_date", label: __("Required by"), type: "date" },
			{ field: "per_received", label: __("Received"), type: "percent" },
			{ field: "days", label: __("Late"), type: "late", num: 1 } ] },
	],
	});
};
