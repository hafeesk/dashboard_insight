import frappe


def execute():
	"""Remove the old custom Pages (replaced by standard Dashboards) if this site had the previous version installed."""
	for page in ("sales-dashboard", "purchase-dashboard", "stock-dashboard", "hr-dashboard"):
		if frappe.db.exists("Page", page):
			frappe.delete_doc("Page", page, force=True, ignore_permissions=True)
	frappe.clear_cache()
