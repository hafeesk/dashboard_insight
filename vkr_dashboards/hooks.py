app_name = "vkr_dashboards"
app_title = "VKR Dashboards"
app_publisher = "VKR Holdings"
app_description = "Sales, Purchase, Stock and HR dashboards with date filters"
app_email = "lubaina@vkrholdings.com"
app_license = "mit"
required_apps = ["frappe/erpnext"]

# Frappe HR is optional: the HR dashboard hides sections whose DocTypes are not installed.

app_include_js = ["vkr_dashboards.bundle.js"]
app_include_css = ["vkr_dashboards.bundle.css"]
