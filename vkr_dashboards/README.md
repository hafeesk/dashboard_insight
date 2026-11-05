## VKR Dashboards

Sales, Purchase, Stock and HR dashboards built **only from standard ERPNext records** — no custom pages, JavaScript, CSS, API or SQL. Everything is a normal `Dashboard`, `Dashboard Chart`, `Number Card` or `Workspace` that you can edit from the UI (Developer Mode off is fine).

| Dashboard | Number cards | Charts |
|---|---|---|
| Sales | Net sales (month / year), invoices, unpaid, overdue, orders booked, collected, new customers | Net sales over time, orders booked over time, collections over time, top customers, sales by territory, orders by status |
| Purchase | Net purchases (month / year), supplier invoices, unpaid, overdue, orders placed, orders waiting for delivery, paid to suppliers | Net purchases over time, orders over time, payments over time, top suppliers, orders by status |
| Stock | Stock value today, value received, stock movements, stock entries, active items | Net stock value movement, value by warehouse, entries by purpose, entries over time, most active items, items by group |
| HR | Headcount, joined / left (month, year) | Joiners and leavers over time, headcount by department, designation, employment type, gender |

Open them from the **Dashboards** workspace (shortcuts + links to the standard receivable, payable, item-wise register, stock balance and projected-qty reports), or from `/app/dashboard-view/<name>`.

### Notes

- **Date ranges:** cards use *this month* / *this year*; time-series charts use *last year, monthly*. To change a range, use the chart's **⋮ → Set Filters / Time span** (saved per user) or edit the record.
- **Company:** every record filters on the user's default Company (`frappe.defaults.get_user_default("Company")`), the same way ERPNext's own dashboards do. Set a default company on the user.
- **Change badges** on cards compare with the previous period (standard "Show Percentage Stats").
- **Currency:** sums use base (company-currency) fields. *Unpaid* cards sum `outstanding_amount`, which is in document currency.
- **Removed vs. the custom version:** top-items and overdue/pending *tables*, below-reorder count, attrition %, attendance rate and leave charts. The standard Dashboard feature has no tables or cross-doctype joins; use the linked standard reports instead. Leave and Attendance need **Frappe HR**, so the HR dashboard uses `Employee` only.

### Install

```bash
cd ~/frappe-bench
cp -r vkr_dashboards apps/          # or: bench get-app <git-url>
./env/bin/pip install -e apps/vkr_dashboards
bench --site <site> install-app vkr_dashboards   # existing site: bench --site <site> migrate
bench --site <site> clear-cache && bench restart
```

Upgrading from the old version: `migrate` runs a patch that deletes the four old custom Pages.
