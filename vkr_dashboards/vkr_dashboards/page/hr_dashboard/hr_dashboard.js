frappe.pages["hr-dashboard"].on_page_load = function (wrapper) {
	wrapper.dashboard = new vkr_dashboards.Dashboard(wrapper, {
	key: "hr", title: __("HR"), method: "vkr_dashboards.api.get_hr",
	charts: [
		{ key: "movement", title: __("Joiners and leavers"), type: "columns", span: 2, fmt: "number" },
		{ key: "by_department", title: __("Headcount by department"), subtitle: __("On the To date"), type: "hbar", fmt: "number" },
		{ key: "by_leave_type", title: __("Leave days by type"), subtitle: __("Approved leave starting in the period"), type: "hbar", fmt: "number" },
		{ key: "attendance", title: __("Attendance by status"), subtitle: __("Marked days in the period"), type: "hbar", fmt: "number" },
	],
	tables: [
		{ key: "joiners", title: __("New joiners"), columns: [
			{ field: "employee_name", label: __("Employee"), link: "Employee", link_field: "name", sub: "designation" },
			{ field: "department", label: __("Department") },
			{ field: "date_of_joining", label: __("Joined"), type: "date", num: 1 } ] },
	],
	});
};
