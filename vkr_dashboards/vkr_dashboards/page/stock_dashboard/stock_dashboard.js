frappe.pages["stock-dashboard"].on_page_load = function (wrapper) {
	wrapper.dashboard = new vkr_dashboards.Dashboard(wrapper, {
	key: "stock", title: __("Stock"), method: "vkr_dashboards.api.get_stock",
	charts: [
		{ key: "movement", title: __("Stock movement"), subtitle: __("Value received vs issued"), type: "line", span: 2 },
		{ key: "by_warehouse", title: __("Stock value by warehouse"), subtitle: __("Today"), type: "hbar" },
		{ key: "by_purpose", title: __("Stock entries by purpose"), type: "hbar", fmt: "number" },
	],
	tables: [
		{ key: "top_moving", title: __("Fastest-moving items"), subtitle: __("By quantity issued in the period"), columns: [
			{ field: "item_code", label: __("Item"), link: "Item", sub: "item_name" },
			{ field: "qty", label: __("Qty issued"), type: "number", num: 1 },
			{ field: "amount", label: __("Value issued"), type: "currency", num: 1 } ] },
		{ key: "reorder", title: __("Below reorder level"), subtitle: __("Projected qty under the item's reorder level, today"), columns: [
			{ field: "item_code", label: __("Item"), link: "Item", sub: "item_name" },
			{ field: "warehouse", label: __("Warehouse") },
			{ field: "qty", label: __("Projected"), type: "number", num: 1 },
			{ field: "level", label: __("Reorder at"), type: "number", num: 1 } ] },
	],
	});
};
